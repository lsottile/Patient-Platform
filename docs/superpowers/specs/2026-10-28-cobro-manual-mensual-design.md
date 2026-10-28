# Cobro manual mensual

## Intención

Kine no procesará pagos dentro de la aplicación. Luciano acordará y cobrará cada mensualidad por fuera, y registrará manualmente en Supabase qué cuenta pagó cada período. La aplicación solo recordará el pago y aplicará el acceso.

## Reglas comerciales

- El sistema comienza el 1 de noviembre de 2026 y usa el calendario de Argentina (`America/Argentina/Buenos_Aires`).
- La cuenta propietaria `lucianodaux@gmail.com` permanece exenta.
- `santiagomelian11@gmail.com` conserva la modalidad preferencial y la referencia de ARS 15.000.
- Las demás cuentas actuales y nuevas usan modalidad general y referencia de ARS 50.000.
- Los importes son referencias administrativas: la interfaz no muestra monto, instrucciones de pago ni procesa dinero.
- Cada pago se registra por usuario y mes. Repetir el registro del mismo período es idempotente.
- Una cuenta pagada no ve avisos y mantiene acceso durante todo el período.
- Una cuenta impaga conserva acceso con el aviso `Pago mensual pendiente`: verde los días 1–3, amarillo los días 4–6 y rojo los días 7–10.
- Una cuenta impaga queda bloqueada al comenzar el día 11.
- Registrar el pago del mes corriente desbloquea inmediatamente, aunque se haga después del día 10.
- Una cuenta creada después del día 10 nace bloqueada hasta registrar su pago.
- El día 1 de cada mes empieza un período independiente; no se arrastra el pago anterior.

## Experiencia bloqueada

La pantalla bloqueada muestra `Pago mensual pendiente`, el correo de soporte, exportación completa, enlaces legales y salida. No muestra Mercado Pago, montos, casillas de aceptación ni un botón para pagar. El bloqueo niega escrituras mediante RLS, no solo desde React.

## Modelo y seguridad

`pagos_manuales` guarda una fila por `(user_id, periodo)`; `periodo` siempre es el primer día del mes. Los usuarios no pueden insertar, modificar ni borrar pagos. Un helper SQL puro clasifica una fecha como `al_dia`, `aviso_verde`, `aviso_amarillo`, `aviso_rojo`, `bloqueada` o `exenta`; `puede_escribir` y `mi_acceso_comercial` usan la misma clasificación.

La Edge Function `suscripcion-crear` queda cerrada por defecto mediante `COBROS_HABILITADOS=false`. El código de Mercado Pago se conserva para una decisión futura, pero no existe ningún botón activo y ningún estado de Mercado Pago concede o quita acceso durante el esquema manual.

## Operación

Cuando Luciano informa por mensaje que una persona pagó, el operador busca el UUID por correo y registra el período corriente dentro de una transacción que exige una coincidencia exacta. La comprobación posterior consulta solo correo, período y estado comercial; no accede a datos clínicos.

## Fuera de alcance

- Facturación automática, conciliación bancaria y comprobantes fiscales.
- Panel administrativo para registrar pagos.
- Débito automático, Mercado Pago productivo o cobro con tarjetas.
- Eliminación automática de datos por falta de pago.
- Activación automática de otro modelo comercial.

El cobro externo no elimina las obligaciones fiscales del proveedor.
