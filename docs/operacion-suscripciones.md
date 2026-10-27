# Operar suscripciones y retención

Este runbook lleva el sistema desde un entorno de prueba hasta producción y permite verificar cobros, acceso, exportación y eliminación sin editar migraciones ya aplicadas.

> **Antes de vender:** los textos legales son un borrador operativo. Obtené revisión jurídica y contable argentina antes de ampliar el piloto. Kine no emite comprobantes de ARCA.

## 1. Preparar Mercado Pago

1. Creá una aplicación en Mercado Pago para la cuenta que recibirá los cobros.
2. Separá las credenciales de prueba de las productivas. Nunca uses una cuenta compradora que sea la misma cuenta vendedora.
3. Copiá el Access Token del entorno elegido y generá el secreto de webhook.
4. Registrá esta URL pública:

   ```text
   https://<ref>.supabase.co/functions/v1/mercadopago-webhook
   ```

5. Habilitá los tópicos `subscription_preapproval` y `subscription_authorized_payment`.
6. Usá la simulación del panel para cada tópico y confirmá una respuesta HTTP 200. Una firma inválida debe responder 401 y un tópico desconocido, 400.

El webhook nunca confía en el cuerpo recibido: vuelve a consultar el recurso en Mercado Pago y valida cuenta, monto y moneda.

## 2. Configurar Supabase

### Secretos de Edge Functions

Copiá `supabase/functions/.env.example` a `supabase/functions/.env` y completá:

```dotenv
MP_ACCESS_TOKEN=<access token de prueba o producción>
MP_WEBHOOK_SECRET=<secreto de firma del webhook>
KINE_APP_URL=https://<usuario>.github.io/<repositorio>/
SECRETO_CRON=<cadena aleatoria larga>
GOOGLE_CLIENT_ID=<client id, si se usa Drive>
GOOGLE_CLIENT_SECRET=<client secret, si se usa Drive>
```

`KINE_APP_URL` debe ser la raíz pública exacta, incluida la subruta de GitHub Pages y la barra final. Subí los secretos:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

No pongas `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SECRETO_CRON` ni el secreto de Google en variables `VITE_*`: todo valor `VITE_*` queda público en el JavaScript del navegador.

### Migraciones, Vault y funciones

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy drive-conectar drive-respaldo suscripcion-crear mercadopago-webhook cuentas-limpiar
```

Guardá en Vault la URL del proyecto y el mismo secreto del cron:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'url_proyecto');
select vault.create_secret('<mismo valor que SECRETO_CRON>', 'secreto_cron');
```

Las migraciones programan `respaldo-drive` cada hora y `limpieza-cuentas` una vez al día. Verificalas sin exponer secretos:

```sql
select jobname, schedule, active
from cron.job
where jobname in ('respaldo-drive', 'limpieza-cuentas');
```

## 3. Asignar las cuentas iniciales

Buscá cada UUID en **Supabase → Authentication → Users**. No lo obtengas de un dato enviado por el navegador.

Cuenta propietaria exenta:

```sql
update public.accesos_comerciales
set modalidad = 'exenta',
    precio_ars = 0,
    estado = 'activa',
    gracia_hasta = null,
    acceso_hasta = null,
    eliminar_despues_de = null
where user_id = '<UUID_ADMIN>'::uuid;
```

Cuenta existente con precio preferencial y acceso de transición:

```sql
update public.accesos_comerciales
set modalidad = 'preferencial',
    precio_ars = 15000,
    estado = 'transicion',
    gracia_hasta = null,
    acceso_hasta = null,
    eliminar_despues_de = null
where user_id = '<UUID_CLIENTE_PREFERENCIAL>'::uuid;
```

Comprobá que cada sentencia modificó exactamente una fila. Las cuentas nuevas nacen `pendiente`, con ARS 50.000 y sin acceso clínico antes del primer pago.

## 4. Publicar GitHub Pages

En **Settings → Secrets and variables → Actions → Variables** configurá solo valores públicos:

```text
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_GOOGLE_CLIENT_ID=<client id público, si se usa Drive>
VITE_URL_CODIGO=https://github.com/<usuario>/<repositorio>
```

`VITE_URL_CODIGO` debe apuntar al repositorio público que contiene el código exacto desplegado bajo AGPL-3.0. Luego ejecutá el workflow **Publicar en GitHub Pages**.

Abrí sin sesión `/terminos` y `/privacidad`. En login, documentos, aplicación y bloqueo, verificá que **Código fuente** apunte al fork correcto.

## 5. Verificación previa al lanzamiento

### Contratos locales automatizados

Con Docker activo:

```bash
npm test
npm run typecheck
npm run build
npx supabase db reset
npx supabase test db
bash scripts/probar-suscripcion-crear.sh
bash scripts/probar-mercadopago-webhook.sh
bash scripts/probar-cuentas-limpiar.sh
```

Los scripts usan servicios falsos locales: prueban identidad y precio controlados por el servidor, firma, repetición, transiciones, orden de borrado y reintentos. No sustituyen una compra real en el sandbox de Mercado Pago.

### Recorrido con cuentas de prueba de Mercado Pago

Registrá evidencia de cada punto antes de activar credenciales productivas:

- [ ] **Alta nueva:** muestra ARS 50.000, exige aceptar ambos documentos y no monta la navegación clínica.
- [ ] **Checkout repetido:** dos clics o recargas reutilizan la misma preapproval.
- [ ] **Pago aprobado:** el webhook deja `estado = 'activa'`; recién entonces RLS permite escribir.
- [ ] **Retorno manipulado:** `?status=approved` o un identificador falso en la URL no cambia el acceso.
- [ ] **Webhook repetido:** responde 200, conserva una sola clave de evento y no extiende dos veces el acceso.
- [ ] **Cobro rechazado:** deja `estado = 'gracia'` y fija cuatro días corridos desde el primer rechazo; un segundo rechazo no reinicia el plazo.
- [ ] **Fin de gracia:** exactamente en `gracia_hasta`, RLS niega escrituras y la pantalla conserva pago, ZIP, legales y salida.
- [ ] **Cancelación:** conserva acceso hasta `acceso_hasta`, sin cobrar otro período.
- [ ] **Reintegro:** solo el último pago reintegrado bloquea de inmediato y fija la eliminación a un año.
- [ ] **Reactivación:** un pago nuevo limpia gracia y eliminación, y restaura el acceso sin intervención manual.
- [ ] **Exportación bloqueada:** el ZIP incluye `respaldo.json`, todos los adjuntos y `LEEME.txt`.
- [ ] **Cuenta exenta:** no muestra cobro y nunca se bloquea.
- [ ] **Cuenta preferencial:** muestra ARS 15.000 y conserva acceso durante la transición.

Consultas de apoyo, sin leer datos clínicos:

```sql
select modalidad, precio_ars, estado, acceso_hasta, gracia_hasta, eliminar_despues_de
from public.accesos_comerciales
where user_id = '<UUID_DE_PRUEBA>'::uuid;

select topic, resource_id, accion, intentos, procesado_en, ultimo_error
from public.eventos_mercado_pago
order by recibido_en desc
limit 20;
```

## 6. Reintegros y soporte

- Respondé soporte dentro de tres días hábiles.
- Si se solicita dentro de cinco días hábiles del cobro, reintegrá el último pago completo desde Mercado Pago.
- No cambies el estado manualmente para simular un reintegro: esperá el webhook firmado y verificá `reintegrada`.
- Si el webhook no llega, reenviá la notificación desde Mercado Pago. La idempotencia permite repetirla.

## 7. Eliminación anticipada y automática

La solicitud anticipada llega a `lucianodsottile@gmail.com`. Verificá identidad, recomendá descargar el ZIP y fijá la fecha de limpieza:

```sql
update public.accesos_comerciales
set eliminar_despues_de = now()
where user_id = '<UUID_SOLICITANTE>'::uuid
  and not public.puede_escribir(user_id);
```

Ejecutá la función sin esperar al cron:

```bash
curl --fail --request POST \
  'https://<ref>.supabase.co/functions/v1/cuentas-limpiar' \
  --header 'x-secreto-cron: <SECRETO_CRON>' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

La respuesta solo informa `revisadas`, `eliminadas` y `errores`. Storage se elimina antes que Auth. Un fallo conserva el usuario para reintentar en la próxima ejecución. Kine no puede borrar ZIP descargados, carpetas sincronizadas ni archivos del Drive controlado por la persona usuaria.

## 8. Monitoreo y recuperación

- Revisá logs de `mercadopago-webhook` y `cuentas-limpiar`; no copies payloads clínicos a tickets.
- Alertá sobre respuestas 401/500 sostenidas, eventos con `ultimo_error` y ejecuciones de limpieza con `errores > 0`.
- Conciliá periódicamente preapprovals/pagos de Mercado Pago con `accesos_comerciales`.

### Rollback operativo

No edites ni borres migraciones aplicadas y no hagas downgrade destructivo de la base.

1. Desactivá temporalmente nuevas altas en Supabase Auth.
2. Si el cobro debe detenerse, pausá nuevas suscripciones en Mercado Pago; mantené el webhook activo para recibir estados pendientes.
3. Conservá acceso a clientes existentes mientras se corrige el incidente:

   ```sql
   update public.accesos_comerciales
   set estado = 'transicion',
       gracia_hasta = null,
       eliminar_despues_de = null
   where modalidad <> 'exenta'
     and public.puede_escribir(user_id);
   ```

4. Volvé a desplegar la versión anterior de frontend o Edge Functions, pero dejá las tablas y políticas nuevas.
5. Corregí, ejecutá los scripts de contrato y conciliá los eventos antes de reabrir altas.

La sentencia de transición está deliberadamente limitada a cuentas que ya tenían acceso; no habilita cuentas pendientes sin pago.
