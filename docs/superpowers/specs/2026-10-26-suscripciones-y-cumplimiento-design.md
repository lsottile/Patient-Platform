# Suscripciones, acceso y documentos legales

## Resultado

Kine cobrará suscripciones mensuales en pesos argentinos mediante Mercado Pago, controlará automáticamente el acceso según el estado del cobro y permitirá exportar todos los datos aun cuando una cuenta esté bloqueada. El servicio incluirá Términos de Servicio y Política de Privacidad para profesionales y clínicas de Argentina.

Esta especificación fue acordada el 26 de octubre de 2026. Los textos legales serán un borrador operativo y deberán revisarse con un profesional del derecho antes de ampliar la venta.

## Intención

- Evitar recordatorios y conciliaciones manuales: Mercado Pago cobra, reintenta y notifica.
- Impedir que una cuenta nueva use Kine antes del primer pago.
- Dar cuatro días de gracia ante una renovación fallida.
- No secuestrar los datos clínicos: una cuenta bloqueada siempre puede exportarlos.
- Mantener el alcance pequeño: sin panel administrativo, facturación electrónica ni múltiples niveles funcionales.

## Plan comercial

Existe un único servicio con dos precios mensuales iniciales:

| Cuenta | Precio | Tratamiento inicial |
|---|---:|---|
| Luciano Sottile | Exenta | Acceso permanente sin cobro |
| Amigo existente | ARS 15.000 | Conserva acceso mientras activa la suscripción |
| Nuevas cuentas | ARS 50.000 | Deben pagar antes de usar Kine |

El precio preferencial no crea un nivel funcional diferente. Los dos precios pueden cambiarse en el futuro, con aviso de al menos 14 días corridos.

Mercado Pago recibirá el precio decidido por el servidor. Kine nunca confiará en un monto enviado por el navegador.

## Recorrido de una cuenta

### Nueva cuenta

1. La persona inicia sesión con Supabase Auth.
2. Ve los Términos y la Política de Privacidad y acepta las versiones vigentes.
3. Kine crea una suscripción mensual de ARS 50.000 mediante la API de Mercado Pago.
4. La persona completa el primer pago en el checkout alojado por Mercado Pago.
5. Un webhook confirmado por firma actualiza la cuenta y habilita Kine.

### Cuenta existente preferencial

El amigo conserva acceso completo bajo el estado de transición y ve un aviso no bloqueante para activar la suscripción de ARS 15.000. Debe aceptar los documentos antes de ir al checkout. Después del primer pago queda sujeto a las mismas reglas que el resto.

### Renovación fallida

El primer cobro rechazado inicia cuatro días corridos de gracia. Durante ese período Kine sigue funcionando y muestra un aviso persistente. Mercado Pago realiza sus reintentos. Un pago aprobado limpia la gracia; vencidos los cuatro días, la escritura queda bloqueada automáticamente aunque el navegador sea manipulado.

### Cancelación y reintegro

- Una cancelación voluntaria mantiene el acceso hasta `acceso_hasta`, tomado del período ya pagado.
- Un reintegro total puede solicitarse por correo dentro de los cinco días hábiles posteriores al cobro. Se gestiona manualmente en Mercado Pago y termina el acceso cuando se confirma.
- El soporte se presta por `lucianodsottile@gmail.com` con respuesta dentro de tres días hábiles.

## Estados comerciales

La base guarda un estado de origen y fechas; la aplicación y las políticas calculan el estado efectivo usando la hora del servidor.

| Estado de origen | Acceso efectivo |
|---|---|
| `pendiente` | Solo aceptación, pago, documentos legales y cierre de sesión |
| `transicion` | Acceso completo más aviso para suscribirse |
| `activa` | Acceso completo |
| `gracia` antes de `gracia_hasta` | Acceso completo más aviso |
| `gracia` después de `gracia_hasta` | Pago, exportación y cierre de sesión |
| `cancelada` antes de `acceso_hasta` | Acceso completo más aviso de fecha final |
| `cancelada` después de `acceso_hasta` | Pago, exportación y cierre de sesión |
| `reintegrada` | Pago, exportación y cierre de sesión |
| modalidad `exenta` | Acceso completo |

Las cuentas autenticadas siempre pueden leer sus propios registros mientras existan. Solo los estados con acceso completo pueden insertar, modificar o borrar registros y adjuntos. La interfaz no mostrará fichas clínicas en estados bloqueados; la lectura queda disponible únicamente para producir la exportación.

El modo local y las instalaciones autohospedadas no usan este control comercial. El cobro corresponde al servicio alojado por Luciano Sottile.

## Integración con Mercado Pago

Kine creará suscripciones sin plan asociado y con estado inicial `pending` usando `POST https://api.mercadopago.com/preapproval`. Esta modalidad devuelve un `init_point`, permite asociar `external_reference` con el UUID de Supabase y admite ambos precios sin exponerlos al cliente.

La solicitud usa:

- `reason`: `Kine — suscripción mensual`;
- `external_reference`: UUID del usuario;
- `payer_email`: correo autenticado;
- recurrencia de un mes, monto tomado de la base y moneda `ARS`;
- `back_url`: URL pública de Kine;
- `status`: `pending`.

Una Edge Function autenticada crea o recupera el checkout pendiente de forma idempotente. El Access Token de Mercado Pago vive solo en secretos de Supabase.

Otra Edge Function pública recibe los tópicos `subscription_preapproval` y `subscription_authorized_payment`. Debe:

1. Validar `x-signature` mediante HMAC-SHA256, `x-request-id`, `data.id` y el secreto de webhook.
2. Rechazar firmas ausentes, inválidas o fuera de una ventana de cinco minutos.
3. Consultar el recurso real en la API de Mercado Pago; nunca confiar en el cuerpo del webhook.
4. Comprobar `external_reference`, moneda y monto esperado.
5. Procesar eventos repetidos sin duplicar efectos.
6. Actualizar aprobación, rechazo, cancelación o reintegro y sus fechas.

La configuración de notificaciones se probará con el simulador de Mercado Pago antes de producción. Las suscripciones seguirán administrándose desde su panel; Kine no tendrá panel comercial propio.

## Persistencia y seguridad en Supabase

Una nueva migración crea:

- `accesos_comerciales`: modalidad, precio, estado, identificador de Mercado Pago, aceptación legal y fechas de acceso, gracia, finalización y eliminación;
- `eventos_mercado_pago`: claves mínimas para idempotencia y auditoría, sin guardar tarjetas ni cuerpos completos;
- una función SQL estable para decidir si `auth.uid()` puede escribir;
- un trigger que crea cuentas nuevas como generales, pendientes y con ARS 50.000;
- un backfill que deja las cuentas ya existentes en transición para no provocar bloqueos durante el despliegue.

Las políticas RLS de todas las colecciones clínicas y de Storage se separan:

- `SELECT`: el usuario puede leer exclusivamente sus propios datos;
- `INSERT`, `UPDATE`, `DELETE`: además de ser propietario, debe tener acceso comercial efectivo.

La tabla comercial es de solo lectura para su titular. Las escrituras comerciales se realizan con service role desde Edge Functions. Los UUID del administrador y del amigo no se publican en el repositorio: se asignan una vez mediante SQL operativo después de la migración.

## Pantallas

### Documentos públicos

Las rutas `/terminos` y `/privacidad` son públicas y legibles sin iniciar sesión. Login, documentos, checkout, bloqueo y aplicación muestran un pie común con:

- Términos;
- Privacidad;
- código fuente exacto de la versión desplegada;
- licencia AGPL-3.0;
- aviso de que Kine no es un dispositivo médico.

`VITE_URL_CODIGO` apuntará al fork público `lsottile/Patient-Platform`; credenciales y datos nunca forman parte del repositorio.

### Pago y avisos

- Cuenta pendiente: aceptación obligatoria y botón para ir a Mercado Pago.
- Transición: aviso no bloqueante con precio ARS 15.000.
- Gracia: aviso con fecha y hora de bloqueo y botón para regularizar.
- Cancelada aún vigente: aviso con fin del acceso.
- Bloqueada: explicación, pago, respaldo completo y salir.

Al volver del checkout, Kine consulta de nuevo el estado. No concede acceso por parámetros de la URL; solo por estado confirmado en Supabase.

## Exportación y salida

La pantalla bloqueada reutiliza el respaldo actual `.zip`, que contiene `respaldo.json`, adjuntos y `LEEME.txt`. No ofrece importación, fichas Markdown ni navegación clínica.

La exportación debe advertir que contiene datos sensibles y que la Ley 26.529 exige al responsable de la historia clínica conservarla durante al menos diez años desde la última actuación. El año de conservación de Kine no reemplaza esa obligación: el profesional debe descargar y custodiar su copia.

## Retención y eliminación

- Al terminar el acceso pagado se fija `eliminar_despues_de` a un año desde `acceso_hasta` o desde el reintegro inmediato.
- No se enviará un correo específico antes del vencimiento; la fecha aparecerá en la pantalla bloqueada y en los documentos legales.
- El cliente puede pedir eliminación anticipada por correo, sujeta a obligaciones legales aplicables.
- Un trabajo diario elimina primero los adjuntos de Storage y luego el usuario de Supabase Auth; las claves foráneas borran los registros y el trigger existente elimina el token de Google Drive.
- Si una eliminación parcial falla, queda pendiente para reintento y se registra el error sin incluir datos clínicos.
- La reactivación antes del vencimiento limpia la fecha de eliminación.
- Los archivos ya exportados, las carpetas sincronizadas y los respaldos del Google Drive del cliente no pueden ser eliminados por Kine y quedan bajo su responsabilidad.

## Términos de Servicio

El proveedor será Luciano Sottile, CUIT 20-41197971-8, Corrientes 886, Azul, Provincia de Buenos Aires, CP 7300, correo `lucianodsottile@gmail.com`.

Los Términos cubrirán en lenguaje claro:

- alcance para profesionales y clínicas de Argentina mayores de edad;
- naturaleza tecnológica del servicio y ausencia de consejo o diagnóstico;
- responsabilidad del profesional por sus credenciales, pacientes, consentimientos, exactitud y secreto profesional;
- precios mostrados antes del pago, renovación automática, reintentos, gracia, cancelación y reintegro;
- disponibilidad sin SLA, mantenimiento y soporte;
- exportación, retención de un año y obligación profesional de conservar historias clínicas por el plazo legal;
- licencia AGPL, atribución y acceso al código fuente;
- cambios avisados con 14 días corridos;
- ley argentina y jurisdicción competente sin limitar derechos inderogables.

## Política de Privacidad

La política identificará a Luciano Sottile como responsable de datos de cuenta y facturación y como prestador tecnológico respecto de los datos clínicos cargados por cada profesional.

Describirá:

- datos de cuenta, autenticación, estado comercial, soporte, registros técnicos y contenido clínico;
- finalidades de autenticación, prestación, seguridad, cobro, soporte, respaldo y cumplimiento legal;
- que Kine no recibe ni almacena datos completos de tarjetas;
- GitHub Pages, Supabase, Mercado Pago y Google como proveedores o destinatarios según la función;
- alojamiento de Supabase en São Paulo y transferencias internacionales, con consentimiento informado y mecanismos contractuales cuando correspondan;
- medidas razonables de seguridad, confidencialidad y respuesta a incidentes, sin prometer seguridad absoluta;
- conservación, exportación, eliminación y límites sobre copias controladas por el cliente;
- derechos de información, acceso, rectificación y supresión bajo Ley 25.326, plazos de respuesta y contacto de la AAIP.

## No objetivos

- Facturación electrónica o integración con ARCA.
- Panel administrativo dentro de Kine.
- Cupones, pruebas gratuitas, equipos o planes funcionales múltiples.
- Conversión automática desde dólares.
- Envío automático de correos por cambios legales o eliminación.
- Borrado de copias que el cliente controla fuera de Supabase.

## Operación de lanzamiento

Antes de habilitar cobros se deberá:

1. Crear una aplicación de Mercado Pago y obtener credenciales productivas y secreto de webhook.
2. Configurar secretos de Supabase y desplegar las tres Edge Functions nuevas.
3. Aplicar la migración y marcar al administrador como exento y al amigo como preferencial/transición.
4. Configurar la URL de webhook y probar ambos tópicos.
5. Configurar `VITE_URL_CODIGO` y las variables actuales de GitHub Actions.
6. Ejecutar una compra de prueba, rechazo, cancelación, reintegro, exportación bloqueada y reactivación.
7. Obtener revisión jurídica y contable antes de vender a personas distintas del piloto.

## Criterios de aceptación

- Ninguna cuenta nueva puede escribir datos antes de un pago aprobado.
- El administrador nunca es bloqueado.
- El amigo mantiene acceso antes de suscribirse y ve ARS 15.000.
- Los demás ven ARS 50.000 y no pueden alterar el monto.
- Un rechazo da exactamente cuatro días corridos de escritura y luego RLS la niega.
- Un pago posterior rehabilita sin intervención manual.
- Una cancelación respeta el período pagado.
- Una cuenta bloqueada puede descargar todos sus datos y adjuntos, pero no modificarlos.
- La eliminación automática ocurre al año y no deja adjuntos huérfanos.
- Las páginas legales son públicas, versionadas y su aceptación queda auditada.
- El código fuente desplegado sigue disponible bajo AGPL sin exponer secretos.
