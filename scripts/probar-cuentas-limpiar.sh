#!/usr/bin/env bash
set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)
temporal=$(mktemp -d)
pid_proxy=''
pid_funciones=''

limpiar() {
  [ -z "$pid_funciones" ] || kill "$pid_funciones" 2>/dev/null || true
  [ -z "$pid_proxy" ] || kill "$pid_proxy" 2>/dev/null || true
  rm -rf "$temporal"
}
trap limpiar EXIT

cd "$raiz"
npx supabase db reset >/dev/null
estado_local=$(npx supabase status -o json)
api_url=$(jq -r '.API_URL' <<<"$estado_local")
anon_key=$(jq -r '.ANON_KEY' <<<"$estado_local")
service_key=$(jq -r '.SERVICE_ROLE_KEY' <<<"$estado_local")

crear_usuario() {
  local email=$1
  curl -fsS -X POST "$api_url/auth/v1/admin/users" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"Prueba-segura-1234\",\"email_confirm\":true}" | jq -r '.id'
}

vencido=$(crear_usuario 'vencido@example.com')
futuro=$(crear_usuario 'futuro@example.com')
reactivado=$(crear_usuario 'reactivado@example.com')

actualizar_acceso() {
  curl -fsS -X PATCH "$api_url/rest/v1/accesos_comerciales?user_id=eq.$1" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
    -d "$2" >/dev/null
}
actualizar_acceso "$vencido" '{"estado":"reintegrada","eliminar_despues_de":"2020-01-01T00:00:00Z"}'
actualizar_acceso "$futuro" '{"estado":"reintegrada","eliminar_despues_de":"2099-01-01T00:00:00Z"}'
actualizar_acceso "$reactivado" '{"estado":"activa","eliminar_despues_de":"2020-01-01T00:00:00Z"}'

curl -fsS -X POST "$api_url/storage/v1/object/adjuntos/$vencido/paciente/archivo.txt" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: text/plain' \
  --data-binary 'dato clínico de prueba' >/dev/null
printf 'copia externa' >"$temporal/copia-externa.txt"
touch "$temporal/fallar-una-vez"

cat >"$temporal/proxy.py" <<'PY'
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

directorio = Path(os.environ['CLEANUP_TEST_DIR'])
destino = os.environ['SUPABASE_REAL_URL']

class Handler(BaseHTTPRequestHandler):
    def responder(self, estado, cuerpo=b'', headers=None):
        self.send_response(estado)
        for clave, valor in (headers or {}).items():
            if clave.lower() not in {'transfer-encoding', 'connection', 'content-encoding'}:
                self.send_header(clave, valor)
        self.end_headers()
        self.wfile.write(cuerpo)

    def reenviar(self, cuerpo):
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {'host', 'content-length'}}
        req = Request(destino + self.path, data=cuerpo or None, headers=headers, method=self.command)
        try:
            with urlopen(req) as r:
                self.responder(r.status, r.read(), dict(r.headers))
        except HTTPError as e:
            self.responder(e.code, e.read(), dict(e.headers))

    def do_DELETE(self):
        largo = int(self.headers.get('content-length', '0'))
        cuerpo = self.rfile.read(largo)
        with (directorio / 'orden.log').open('a') as log:
            log.write(('storage' if self.path.startswith('/storage/') else 'auth') + '\n')
        if self.path.startswith('/storage/') and (directorio / 'fallar-una-vez').exists():
            (directorio / 'fallar-una-vez').unlink()
            return self.responder(500, json.dumps({'error': 'fallo simulado'}).encode(), {'Content-Type': 'application/json'})
        self.reenviar(cuerpo)

    def log_message(self, *_args):
        return

HTTPServer(('0.0.0.0', 54331), Handler).serve_forever()
PY

CLEANUP_TEST_DIR="$temporal" SUPABASE_REAL_URL="$api_url" python3 "$temporal/proxy.py" &
pid_proxy=$!

cat >"$temporal/funciones.env" <<EOF
SECRETO_CRON=secreto-limpieza-prueba
KINE_ADMIN_API_URL=http://host.docker.internal:54331
EOF
npx supabase functions serve cuentas-limpiar --env-file "$temporal/funciones.env" >"$temporal/funciones.log" 2>&1 &
pid_funciones=$!

endpoint="$api_url/functions/v1/cuentas-limpiar"
for _ in $(seq 1 40); do
  codigo=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$endpoint" -H "apikey: $anon_key" -d '{}' || true)
  [ "$codigo" = '404' ] || [ "$codigo" = '503' ] || [ "$codigo" = '000' ] || break
  sleep 0.25
done
[ "$codigo" = '401' ] || { cat "$temporal/funciones.log" >&2; echo "Se esperaba 401 sin secreto y llegó $codigo" >&2; exit 1; }

ejecutar() {
  curl -fsS -X POST "$endpoint" -H "apikey: $anon_key" -H 'x-secreto-cron: secreto-limpieza-prueba' -H 'Content-Type: application/json' -d '{}'
}

primera=$(ejecutar)
[ "$(jq -r '.eliminadas' <<<"$primera")" = '0' ]
[ "$(jq -r '.errores' <<<"$primera")" = '1' ]
curl -fsS "$api_url/auth/v1/admin/users/$vencido" -H "apikey: $service_key" -H "Authorization: Bearer $service_key" >/dev/null
curl -fsS "$api_url/storage/v1/object/authenticated/adjuntos/$vencido/paciente/archivo.txt" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" >/dev/null

segunda=$(ejecutar)
[ "$(jq -r '.eliminadas' <<<"$segunda")" = '1' ]
[ "$(jq -r '.errores' <<<"$segunda")" = '0' ]

codigo_usuario=$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/auth/v1/admin/users/$vencido" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key")
[ "$codigo_usuario" = '404' ]
codigo_objeto=$(curl -sS -o /dev/null -w '%{http_code}' "$api_url/storage/v1/object/authenticated/adjuntos/$vencido/paciente/archivo.txt" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key")
[ "$codigo_objeto" = '400' ] || [ "$codigo_objeto" = '404' ]

for id in "$futuro" "$reactivado"; do
  curl -fsS "$api_url/auth/v1/admin/users/$id" -H "apikey: $service_key" -H "Authorization: Bearer $service_key" >/dev/null
done
[ "$(tail -n 2 "$temporal/orden.log" | tr '\n' ' ')" = 'storage auth ' ]
[ "$(cat "$temporal/copia-externa.txt")" = 'copia externa' ]

echo 'cuentas-limpiar: orden, reintento y selección OK'
