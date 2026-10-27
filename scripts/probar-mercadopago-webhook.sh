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
        if self.path.startswith('/preapproval/'):
            identificador = unquote(self.path.removeprefix('/preapproval/'))
            if identificador != 'preapproval-test':
                return self.responder({'error': 'not found'}, 404)
            referencia = 'referencia-ajena' if (directorio / 'referencia_invalida').exists() else (directorio / 'user_id').read_text()
            estado = (directorio / 'preapproval_status').read_text()
            return self.responder({
                'id': identificador,
                'status': estado,
                'external_reference': referencia,
                'auto_recurring': {'transaction_amount': 50000, 'currency_id': 'ARS'},
                'next_payment_date': iso(ahora + timedelta(days=30)),
                'last_modified': f'{estado}-v1',
            })
        if self.path.startswith('/authorized_payments/'):
            identificador = unquote(self.path.removeprefix('/authorized_payments/')).lower()
            estados = {
                'invoice-approved': 'approved',
                'invoice-rejected-1': 'rejected',
                'invoice-rejected-2': 'rejected',
                'invoice-refunded': 'refunded',
                'invoice-old-refund': 'refunded',
                'invoice-bad-amount': 'approved',
                'invoice-bad-currency': 'approved',
            }
            if identificador not in estados:
                return self.responder({'error': 'not found'}, 404)
            monto = 1 if identificador == 'invoice-bad-amount' else 50000
            moneda = 'USD' if identificador == 'invoice-bad-currency' else 'ARS'
            payment_id = 'payment-invoice-approved' if identificador == 'invoice-refunded' else f'payment-{identificador}'
            return self.responder({
                'id': identificador,
                'status': 'processed',
                'preapproval_id': 'preapproval-test',
                'debit_date': iso(ahora),
                'last_modified': identificador,
                'payment': {
                    'id': payment_id,
                    'status': estados[identificador],
                    'transaction_amount': monto,
                    'currency_id': moneda,
                    'date_approved': iso(ahora) if estados[identificador] == 'approved' else None,
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
codigo=$(notificar subscription_authorized_payment invoice-approved req-invalida "$ahora" "$(printf '0%.0s' {1..64})")
[ "$codigo" = '401' ] || { echo "firma inválida: se esperaba 401 y llegó $codigo" >&2; exit 1; }

viejo=$((ahora - 301))
codigo=$(notificar subscription_authorized_payment invoice-approved req-vieja "$viejo")
[ "$codigo" = '401' ] || { echo "firma vencida: se esperaba 401 y llegó $codigo" >&2; exit 1; }

codigo=$(notificar topic_desconocido invoice-approved req-topic "$ahora")
[ "$codigo" = '400' ] || { echo "tópico inválido: se esperaba 400 y llegó $codigo" >&2; exit 1; }

codigo=$(notificar subscription_authorized_payment INVOICE-APPROVED req-aprobada "$ahora")
[ "$codigo" = '200' ] || { cat "$temporal/respuesta.json" >&2; exit 1; }
acceso=$(leer_acceso)
[ "$(jq -r '.estado' <<<"$acceso")" = 'activa' ]
[ "$(contar_eventos)" = '1' ]

codigo=$(notificar subscription_authorized_payment INVOICE-APPROVED req-aprobada-duplicada "$ahora")
[ "$codigo" = '200' ]
[ "$(contar_eventos)" = '1' ]

codigo=$(notificar subscription_authorized_payment invoice-rejected-1 req-rechazo-1 "$ahora")
[ "$codigo" = '200' ]
gracia=$(leer_acceso | jq -r '.gracia_hasta')
[ "$(leer_acceso | jq -r '.estado')" = 'gracia' ]

codigo=$(notificar subscription_authorized_payment invoice-rejected-2 req-rechazo-2 "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.gracia_hasta')" = "$gracia" ]

estado_antes=$(leer_acceso | jq -c '{estado,gracia_hasta}')
codigo=$(notificar subscription_authorized_payment invoice-bad-amount req-monto "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -c '{estado,gracia_hasta}')" = "$estado_antes" ]
codigo=$(notificar subscription_authorized_payment invoice-bad-currency req-moneda "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -c '{estado,gracia_hasta}')" = "$estado_antes" ]

printf 'cancelled' >"$temporal/preapproval_status"
codigo=$(notificar subscription_preapproval preapproval-test req-cancelada "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'cancelada' ]

codigo=$(notificar subscription_authorized_payment invoice-old-refund req-reintegro-viejo "$ahora")
[ "$codigo" = '200' ]
[ "$(leer_acceso | jq -r '.estado')" = 'cancelada' ]

codigo=$(notificar subscription_authorized_payment invoice-refunded req-reintegro "$ahora")
[ "$codigo" = '200' ]
acceso=$(leer_acceso)
[ "$(jq -r '.estado' <<<"$acceso")" = 'reintegrada' ]
[ "$(jq -r '.eliminar_despues_de' <<<"$acceso")" != 'null' ]

touch "$temporal/referencia_invalida"
printf 'authorized' >"$temporal/preapproval_status"
codigo=$(notificar subscription_preapproval preapproval-test req-referencia "$ahora")
[ "$codigo" = '400' ]
[ "$(leer_acceso | jq -r '.estado')" = 'reintegrada' ]

echo 'mercadopago-webhook: firma, idempotencia y transiciones OK'
