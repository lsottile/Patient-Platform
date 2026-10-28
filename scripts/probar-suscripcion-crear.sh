#!/usr/bin/env bash
set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)
temporal=$(mktemp -d)
pid_mp=''
pid_funciones=''

limpiar() {
  [ -z "$pid_funciones" ] || kill "$pid_funciones" 2>/dev/null || true
  [ -z "$pid_mp" ] || kill "$pid_mp" 2>/dev/null || true
  rm -rf "$temporal"
}
trap limpiar EXIT

cd "$raiz"
npx supabase db reset >/dev/null
estado=$(npx supabase status -o json)
api_url=$(jq -r '.API_URL' <<<"$estado")
anon_key=$(jq -r '.ANON_KEY' <<<"$estado")
service_key=$(jq -r '.SERVICE_ROLE_KEY' <<<"$estado")

cat >"$temporal/mp.py" <<'PY'
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import os

directorio = Path(os.environ['MP_TEST_DIR'])

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith('/preapproval/preapproval-test-'):
            self.send_response(404)
            self.end_headers()
            return
        identificador = self.path.removeprefix('/preapproval/')
        estado = 'cancelled' if identificador == 'preapproval-test-1' and (directorio / 'status').exists() else 'pending'
        respuesta = json.dumps({
            'id': identificador,
            'status': estado,
            'external_reference': (directorio / 'user_id').read_text(),
            'auto_recurring': {'transaction_amount': '50000.00', 'currency_id': 'ARS'},
            'last_modified': '2026-10-27T00:00:00Z',
        }).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(respuesta)))
        self.end_headers()
        self.wfile.write(respuesta)

    def do_POST(self):
        if self.path != '/preapproval':
            self.send_response(404)
            self.end_headers()
            return
        largo = int(self.headers.get('content-length', '0'))
        cuerpo = json.loads(self.rfile.read(largo))
        (directorio / 'payload.json').write_text(json.dumps(cuerpo), encoding='utf-8')
        contador = directorio / 'count'
        cantidad = int(contador.read_text() if contador.exists() else '0') + 1
        contador.write_text(str(cantidad), encoding='utf-8')
        with (directorio / 'idempotency.txt').open('a') as archivo:
            archivo.write(self.headers.get('x-idempotency-key', '') + '\n')
        respuesta = json.dumps({
            'id': f'preapproval-test-{cantidad}',
            'init_point': f'https://www.mercadopago.com.ar/subscriptions/test-{cantidad}',
            'status': 'pending',
        }).encode()
        self.send_response(201)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(respuesta)))
        self.end_headers()
        self.wfile.write(respuesta)

    def log_message(self, *_args):
        return

HTTPServer(('0.0.0.0', 54329), Handler).serve_forever()
PY

MP_TEST_DIR="$temporal" python3 "$temporal/mp.py" &
pid_mp=$!

cat >"$temporal/funciones.env" <<EOF
MP_ACCESS_TOKEN=test-token
MP_API_URL=http://host.docker.internal:54329
KINE_APP_URL=$api_url/
EOF

endpoint="$api_url/functions/v1/suscripcion-crear"

iniciar_funcion() {
  local cobros=${1:-false}
  if [ -n "$pid_funciones" ]; then
    kill "$pid_funciones" 2>/dev/null || true
    wait "$pid_funciones" 2>/dev/null || true
    pid_funciones=''
  fi
  cat >"$temporal/funciones.env" <<EOF
MP_ACCESS_TOKEN=test-token
MP_API_URL=http://host.docker.internal:54329
KINE_APP_URL=$api_url/
EOF
  if [ "$cobros" = true ]; then echo 'COBROS_HABILITADOS=true' >>"$temporal/funciones.env"; fi
  npx supabase functions serve suscripcion-crear --env-file "$temporal/funciones.env" >"$temporal/funciones.log" 2>&1 &
  pid_funciones=$!

  local disponible=false codigo_arranque
  for _ in $(seq 1 60); do
    codigo_arranque=$(curl -sS -o "$temporal/sin-auth.json" -w '%{http_code}' -X POST "$endpoint" \
      -H "apikey: $anon_key" -H 'Content-Type: application/json' -d '{}' || true)
    if [ "$codigo_arranque" = '401' ]; then
      disponible=true
      break
    fi
    sleep 0.25
  done
  if [ "$disponible" != true ]; then
    cat "$temporal/funciones.log" >&2
    echo 'La función suscripcion-crear no quedó disponible' >&2
    exit 1
  fi
}

iniciar_funcion false

usuario=$(curl -fsS -X POST "$api_url/auth/v1/admin/users" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"email":"checkout@example.com","password":"Prueba-segura-1234","email_confirm":true}')
user_id=$(jq -r '.id' <<<"$usuario")
printf '%s' "$user_id" >"$temporal/user_id"
sesion=$(curl -fsS -X POST "$api_url/auth/v1/token?grant_type=password" \
  -H "apikey: $anon_key" -H 'Content-Type: application/json' \
  -d '{"email":"checkout@example.com","password":"Prueba-segura-1234"}')
jwt=$(jq -r '.access_token' <<<"$sesion")

codigo=$(curl -sS -o "$temporal/deshabilitada.json" -w '%{http_code}' -X POST "$endpoint" \
  -H "apikey: $anon_key" -H "Authorization: Bearer $jwt" -H 'Content-Type: application/json' \
  -d "{\"aceptaTerminos\":true,\"aceptaPrivacidad\":true,\"backUrl\":\"$api_url/\"}")
[ "$codigo" = '503' ] || { echo "Se esperaba 503 con cobros deshabilitados, se recibió $codigo" >&2; exit 1; }
[ ! -e "$temporal/count" ] || { echo 'Mercado Pago fue contactado con cobros deshabilitados' >&2; exit 1; }

iniciar_funcion true

codigo=$(curl -sS -o "$temporal/sin-aceptar.json" -w '%{http_code}' -X POST "$endpoint" \
  -H "apikey: $anon_key" -H "Authorization: Bearer $jwt" -H 'Content-Type: application/json' \
  -d "{\"aceptaTerminos\":false,\"aceptaPrivacidad\":true,\"backUrl\":\"$api_url/\"}")
[ "$codigo" = '400' ] || { echo "Se esperaba 400 sin ambas aceptaciones, se recibió $codigo" >&2; exit 1; }

crear() {
  curl -fsS -X POST "$endpoint" \
    -H "apikey: $anon_key" -H "Authorization: Bearer $jwt" -H 'Content-Type: application/json' \
    -d "{\"aceptaTerminos\":true,\"aceptaPrivacidad\":true,\"backUrl\":\"$api_url/\",\"precioArs\":1,\"external_reference\":\"otro-usuario\"}"
}

primera=$(crear)
segunda=$(crear)
[ "$(jq -r '.initPoint' <<<"$primera")" = 'https://www.mercadopago.com.ar/subscriptions/test-1' ]
[ "$primera" = "$segunda" ]
[ "$(cat "$temporal/count")" = '1' ]

printf 'cancelled' >"$temporal/status"
tercera=$(crear)
cuarta=$(crear)
[ "$(jq -r '.initPoint' <<<"$tercera")" = 'https://www.mercadopago.com.ar/subscriptions/test-2' ]
[ "$tercera" = "$cuarta" ]
[ "$(cat "$temporal/count")" = '2' ]
[ "$(sort -u "$temporal/idempotency.txt" | wc -l | tr -d ' ')" = '2' ]

jq -e --arg user "$user_id" '
  .reason == "Kine — suscripción mensual"
  and .external_reference == $user
  and .payer_email == "checkout@example.com"
  and .auto_recurring.frequency == 1
  and .auto_recurring.frequency_type == "months"
  and .auto_recurring.transaction_amount == 50000
  and .auto_recurring.currency_id == "ARS"
  and .status == "pending"
' "$temporal/payload.json" >/dev/null

acceso=$(curl -fsS "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id&select=mercado_pago_preapproval_id,checkout_generacion,terminos_aceptados_version,privacidad_aceptada_version" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" | jq '.[0]')
jq -e '
  .mercado_pago_preapproval_id == "preapproval-test-2"
  and .checkout_generacion == 1
  and .terminos_aceptados_version == "2026-10-28"
  and .privacidad_aceptada_version == "2026-10-28"
' <<<"$acceso" >/dev/null

curl -fsS -X PATCH "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"eliminacion_reclamada_en":"2026-10-27T00:00:00Z","eliminacion_confirmada_en":"2026-10-27T00:10:00Z"}' >/dev/null
codigo=$(curl -sS -o "$temporal/eliminando.json" -w '%{http_code}' -X POST "$endpoint" \
  -H "apikey: $anon_key" -H "Authorization: Bearer $jwt" -H 'Content-Type: application/json' \
  -d "{\"aceptaTerminos\":true,\"aceptaPrivacidad\":true,\"backUrl\":\"$api_url/\"}")
[ "$codigo" = '502' ]
[ "$(cat "$temporal/count")" = '2' ]

echo 'suscripcion-crear: contrato e idempotencia OK'
