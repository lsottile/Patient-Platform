# Operar el cobro mensual manual

Kine no procesa dinero. El cobro se acuerda por fuera de la aplicación y la operación registra en Supabase qué usuario pagó cada mes. El estado calculado en hora argentina gobierna tanto la interfaz como las escrituras protegidas por RLS.

> **Antes de cobrar:** obtené revisión jurídica y contable argentina. Kine no emite comprobantes de ARCA y el cobro externo no elimina obligaciones fiscales.

## Camino rápido: registrar un pago

1. Confirmá por un canal externo que el pago fue recibido.
2. En **Supabase → SQL Editor**, reemplazá únicamente el correo y el período del siguiente bloque.
3. Ejecutá todo el bloque junto y comprobá que la consulta final devuelva una sola cuenta y el período esperado.

```sql
begin;

do $$
declare
  v_user_ids uuid[];
begin
  select array_agg(id order by id)
    into v_user_ids
  from auth.users
  where lower(email) = lower('profesional@example.com');

  if coalesce(cardinality(v_user_ids), 0) <> 1 then
    raise exception 'se esperaba exactamente una cuenta para el correo indicado';
  end if;

  perform public.registrar_pago_manual(v_user_ids[1], date '2026-11-01');
end $$;

select u.email, p.periodo, p.registrado_en
from public.pagos_manuales p
join auth.users u on u.id = p.user_id
where lower(u.email) = lower('profesional@example.com')
  and p.periodo = date '2026-11-01';

commit;
```

El período siempre es el **primer día del mes argentino** (`AAAA-MM-01`), aunque el pago se reciba más tarde. Repetir el mismo correo y período es seguro: la operación es idempotente. No insertes un pago antes de confirmarlo.

## Calendario de acceso

| Situación del mes corriente | Estado |
|---|---|
| Pago registrado | Acceso normal, sin aviso |
| Días 1–3 sin pago | Aviso verde |
| Días 4–6 sin pago | Aviso amarillo |
| Días 7–10 sin pago | Aviso rojo |
| Desde el día 11 sin pago | Bloqueo de interfaz y escrituras RLS |

Un pago tardío del mes corriente restaura el acceso inmediatamente. El bloqueo conserva respaldo completo, documentos legales y salida. La falta de pago no elimina datos automáticamente.

## Asignaciones comerciales

La migración aplica estas referencias administrativas:

| Cuenta | Modalidad | Referencia |
|---|---|---:|
| `lucianodaux@gmail.com` | Exenta | ARS 0 |
| `santiagomelian11@gmail.com` | Preferencial | ARS 15.000 |
| Otras cuentas actuales y nuevas | General | ARS 50.000 |

Los importes no se muestran en la interfaz ni se procesan dentro de Kine.

Para verificar una asignación sin leer datos clínicos:

```sql
select u.email, a.modalidad, a.precio_ars,
       public.estado_cobro_manual(
         a.modalidad,
         (select max(p.periodo) from public.pagos_manuales p where p.user_id = a.user_id),
         public.fecha_comercial_argentina()
       ) as estado_cobro
from auth.users u
join public.accesos_comerciales a on a.user_id = u.id
where lower(u.email) = lower('profesional@example.com');
```

## Configuración y despliegue

`suscripcion-crear` conserva el código histórico de Mercado Pago, pero responde `503` salvo que el secreto `COBROS_HABILITADOS` sea exactamente `true`. En la operación manual debe permanecer ausente o en `false`.

```dotenv
COBROS_HABILITADOS=false
KINE_APP_URL=https://<usuario>.github.io/<repositorio>/
```

Aplicá cambios y desplegá la función:

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy suscripcion-crear
```

No pongas tokens, secretos ni claves de servicio en variables `VITE_*`: todo valor `VITE_*` queda público en el JavaScript del navegador.

## Verificación antes de publicar

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

Checklist manual:

- [ ] Una cuenta al día no muestra aviso.
- [ ] Los días 1–10 muestran solo `Pago mensual pendiente`, sin monto ni medio de pago.
- [ ] Desde el día 11, la cuenta impaga no puede escribir pero sí exportar y salir.
- [ ] Registrar el mes corriente desbloquea sin crear una fila duplicada.
- [ ] La cuenta exenta nunca se bloquea.
- [ ] `suscripcion-crear` responde `503` y no contacta Mercado Pago.

## Datos históricos de Mercado Pago

Las tablas, webhook y código anteriores se conservan para auditoría y conciliación de eventos históricos. No borres migraciones ya aplicadas. El webhook puede seguir validando notificaciones pendientes, pero el frontend no ofrece checkout y el kill switch impide crear nuevas preapprovals por defecto.

## Incidentes y rollback

No edites ni borres migraciones aplicadas y no hagas un downgrade destructivo.

1. Mantené `COBROS_HABILITADOS=false`.
2. Si el cálculo mensual falla, desactivá temporalmente nuevas altas en Supabase Auth.
3. Conservá la base y los pagos registrados; corregí mediante una migración nueva.
4. Ejecutá toda la verificación local antes de volver a desplegar.

Nunca simules un pago insertando datos clínicos ni consultes historias para resolver un incidente comercial.
