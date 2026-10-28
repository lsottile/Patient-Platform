#!/usr/bin/env bash
set -euo pipefail

raiz=$(cd "$(dirname "$0")/.." && pwd)
temporal=$(mktemp -d)
pid_mp=''
pid_funciones=''
secreto='secreto-webhook-prueba'

limpiar() {
  [ -z "$pid_funciones" ] || kill "$pid_funciones" 2>/dev/null || true
  [ -z "$pid_mp" ] || kill "$pid_mp" 2>/dev/null || true
  rm -rf "$temporal"
}
trap limpiar EXIT

cd "$raiz"
npx supabase db reset >/dev/null
estado_local=$(npx supabase status -o json)
api_url=$(jq -r '.API_URL' <<<"$estado_local")
anon_key=$(jq -r '.ANON_KEY' <<<"$estado_local")
service_key=$(jq -r '.SERVICE_ROLE_KEY' <<<"$estado_local")

usuario=$(curl -fsS -X POST "$api_url/auth/v1/admin/users" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"email":"webhook@example.com","password":"Prueba-segura-1234","email_confirm":true}')
user_id=$(jq -r '.id' <<<"$usuario")
printf '%s' "$user_id" >"$temporal/user_id"
printf 'authorized' >"$temporal/preapproval_status"

curl -fsS -X PATCH "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"mercado_pago_preapproval_id":"preapproval-test","mercado_pago_init_point":"https://example.test/checkout"}' >/dev/null
curl -fsS -X POST "$api_url/rest/v1/suscripciones_mercado_pago" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d "{\"preapproval_id\":\"preapproval-test\",\"user_id\":\"$user_id\"}" >/dev/null

cat >"$temporal/mp.py" <<'PY'
import json
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import unquote
import os

directorio = Path(os.environ['MP_TEST_DIR'])

def iso(fecha):
    return fecha.isoformat().replace('+00:00', 'Z')

class Handler(BaseHTTPRequestHandler):
    def responder(self, cuerpo, estado=200):
        datos = json.dumps(cuerpo).encode()
        self.send_response(estado)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        ahora = datetime.now(timezone.utc)
        base_eventos = datetime(2026, 10, 27, 1, 0, 0, tzinfo=timezone.utc)
        if self.path.startswith('/preapproval/'):
            identificador = unquote(self.path.removeprefix('/preapproval/'))
            if identificador not in {'preapproval-test', 'preapproval-new'}:
                return self.responder({'error': 'not found'}, 404)
            referencia = 'referencia-ajena' if (directorio / 'referencia_invalida').exists() else (directorio / 'user_id').read_text()
            estado = (directorio / 'preapproval_status').read_text() if identificador == 'preapproval-test' else 'authorized'
            return self.responder({
                'id': identificador,
                'status': estado,
                'external_reference': referencia,
                'auto_recurring': {'transaction_amount': '50000.00', 'currency_id': 'ARS'},
                'next_payment_date': iso(ahora + timedelta(days=30)),
                'last_modified': iso(ahora),
            })
        if self.path.startswith('/authorized_payments/'):
            identificador = unquote(self.path.removeprefix('/authorized_payments/')).lower()
            estados = {
                '1000': 'rejected',
                '1001': 'approved',
                '1002': 'rejected',
                '1003': 'rejected',
                '1004': 'refunded',
                '1005': 'refunded',
                '1006': 'rejected',
                '1007': 'approved',
                '1008': 'approved',
                '1009': 'approved',
            }
            if identificador not in estados:
                return self.responder({'error': 'not found'}, 404)
            desplazamientos = {'1000': -600, '1001': 0, '1002': 60, '1003': 120, '1004': 300, '1005': 240, '1006': -300, '1007': 180, '1008': 180, '1009': 400}
            instante = base_eventos + timedelta(seconds=desplazamientos[identificador])
            monto = '1.00' if identificador == '1007' else '50000.00'
            moneda = 'USD' if identificador == '1008' else 'ARS'
            payment_id = 9001 if identificador in {'1001', '1004'} else 9002 if identificador == '1009' else int(f'9{identificador}')
            preapproval_id = 'preapproval-new' if identificador == '1009' else 'preapproval-test'
            return self.responder({
                'id': int(identificador),
                'type': 'scheduled',
                'status': 'scheduled',
                'preapproval_id': preapproval_id,
                'external_reference': (directorio / 'user_id').read_text(),
                'currency_id': moneda,
                'transaction_amount': monto,
                'debit_date': iso(instante),
                'last_modified': iso(instante),
                'payment': {
                    'id': payment_id,
                    'status': estados[identificador],
                    'status_detail': 'accredited' if estados[identificador] == 'approved' else estados[identificador],
                },
            })
        self.responder({'error': 'not found'}, 404)

    def log_message(self, *_args):
        return

HTTPServer(('0.0.0.0', 54330), Handler).serve_forever()
PY

MP_TEST_DIR="$temporal" python3 "$temporal/mp.py" &
pid_mp=$!

cat >"$temporal/funciones.env" <<EOF
MP_ACCESS_TOKEN=test-token
MP_API_URL=http://host.docker.internal:54330
MP_WEBHOOK_SECRET=$secreto
KINE_APP_URL=$api_url/
EOF
npx supabase functions serve mercadopago-webhook --env-file "$temporal/funciones.env" >"$temporal/funciones.log" 2>&1 &
pid_funciones=$!

endpoint="$api_url/functions/v1/mercadopago-webhook"
for _ in $(seq 1 40); do
  codigo=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$endpoint" -H "apikey: $anon_key" -d '{}' || true)
  [ "$codigo" = '503' ] || [ "$codigo" = '000' ] || break
  sleep 0.25
done
[ "$codigo" != '503' ] && [ "$codigo" != '000' ] || { cat "$temporal/funciones.log" >&2; exit 1; }

firmar() {
  python3 - "$1" "$2" "$3" "$secreto" <<'PY'
import hashlib, hmac, sys
data_id, request_id, ts, secret = sys.argv[1:]
manifest = f'id:{data_id.lower()};request-id:{request_id};ts:{ts};'
print(hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest())
PY
}

notificar() {
  local topic=$1 id=$2 request_id=$3 ts=$4 firma=${5:-}
  [ -n "$firma" ] || firma=$(firmar "$id" "$request_id" "$ts")
  curl -sS -o "$temporal/respuesta.json" -w '%{http_code}' -X POST \
    "$endpoint?type=$topic&data.id=$id" \
    -H "apikey: $anon_key" -H 'Content-Type: application/json' \
    -H "x-request-id: $request_id" -H "x-signature: ts=$ts,v1=$firma" \
    -d "{\"type\":\"$topic\",\"action\":\"updated\",\"data\":{\"id\":\"$id\"}}"
}

leer_acceso() {
  curl -fsS "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id&select=*" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" | jq '.[0]'
}

contar_eventos() {
  curl -fsSI "$api_url/rest/v1/eventos_mercado_pago?select=id" \
    -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Prefer: count=exact' \
    | awk -F'/' 'tolower($1) ~ /content-range/ {gsub("\r", "", $2); print $2}'
}

ahora=$(date +%s)
codigo=$(notificar subscription_authorized_payment 1001 req-invalida "$ahora" "$(printf '0%.0s' {1..64})")
[ "$codigo" = '401' ] || { echo "firma inválida: se esperaba 401 y llegó $codigo" >&2; exit 1; }

viejo=$((ahora - 301))
codigo=$(notificar subscription_authorized_payment 1001 req-vieja "$viejo")
[ "$codigo" = '401' ] || { echo "firma vencida: se esperaba 401 y llegó $codigo" >&2; exit 1; }

codigo=$(notificar topic_desconocido 1001 req-topic "$ahora")
[ "$codigo" = '400' ] || { echo "tópico inválido: se esperaba 400 y llegó $codigo" >&2; exit 1; }

codigo=$(notificar subscription_authorized_payment 1000 req-primer-rechazo "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'activa' ]
curl -fsS -X PATCH "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"eliminacion_reclamada_en":"2026-10-27T00:00:00Z"}' >/dev/null

codigo=$(notificar subscription_authorized_payment 1001 req-aprobada "$ahora")
[ "$codigo" = '200' ] || { cat "$temporal/respuesta.json" >&2; exit 1; }
acceso=$(leer_acceso)
[ "$(jq -r '.estado' <<<"$acceso")" = 'activa' ]
[ "$(jq -r '.eliminacion_reclamada_en' <<<"$acceso")" = 'null' ]
[ "$(contar_eventos)" = '2' ]

codigo=$(notificar subscription_authorized_payment 1001 req-aprobada-duplicada "$ahora")
[ "$codigo" = '200' ]
[ "$(contar_eventos)" = '2' ]

codigo=$(notificar subscription_authorized_payment 1006 req-rechazo-viejo "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'activa' ]

codigo=$(notificar subscription_authorized_payment 1002 req-rechazo-1 "$ahora")
[ "$codigo" = '200' ]
gracia=$(leer_acceso | jq -r '.gracia_hasta')
[ "$(leer_acceso | jq -r '.estado')" = 'gracia' ]

codigo=$(notificar subscription_authorized_payment 1003 req-rechazo-2 "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.gracia_hasta')" = "$gracia" ]

estado_antes=$(leer_acceso | jq -c '{estado,gracia_hasta}')
codigo=$(notificar subscription_authorized_payment 1007 req-monto "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -c '{estado,gracia_hasta}')" = "$estado_antes" ]
codigo=$(notificar subscription_authorized_payment 1008 req-moneda "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -c '{estado,gracia_hasta}')" = "$estado_antes" ]

printf 'cancelled' >"$temporal/preapproval_status"
codigo=$(notificar subscription_preapproval preapproval-test req-cancelada "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'cancelada' ]

# Reemplazar el checkout no borra el vínculo histórico de la suscripción anterior.
curl -fsS -X PATCH "$api_url/rest/v1/accesos_comerciales?user_id=eq.$user_id" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d '{"mercado_pago_preapproval_id":"preapproval-new","mercado_pago_init_point":"https://example.test/nuevo"}' >/dev/null
curl -fsS -X POST "$api_url/rest/v1/suscripciones_mercado_pago" \
  -H "apikey: $service_key" -H "Authorization: Bearer $service_key" -H 'Content-Type: application/json' \
  -d "{\"preapproval_id\":\"preapproval-new\",\"user_id\":\"$user_id\"}" >/dev/null

codigo=$(notificar subscription_authorized_payment 1005 req-reintegro-viejo "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'cancelada' ]

codigo=$(notificar subscription_authorized_payment 1004 req-reintegro "$ahora")
[ "$codigo" = '200' ]
acceso=$(leer_acceso)
[ "$(jq -r '.estado' <<<"$acceso")" = 'reintegrada' ]
[ "$(jq -r '.eliminar_despues_de' <<<"$acceso")" != 'null' ]

# Una aprobación más nueva converge a activa aunque el reintegro anterior haya llegado primero.
codigo=$(notificar subscription_authorized_payment 1009 req-aprobada-nueva "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'activa' ]

touch "$temporal/referencia_invalida"
printf 'authorized' >"$temporal/preapproval_status"
codigo=$(notificar subscription_preapproval preapproval-new req-referencia "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -r '.estado')" = 'activa' ]

echo 'mercadopago-webhook: firma, idempotencia y transiciones OK'
