# Kine · Plataforma de fichas kinesiológicas

App web para el **ingreso, evaluación, planificación y seguimiento** de pacientes de kinesiología,
basada en el formato de ingreso en papel (anamnesis próxima/remota, evaluación con ALICIA y mapa del dolor).

> **Aviso:** herramienta de apoyo al registro clínico. No es un dispositivo médico, no entrega diagnósticos y no
> reemplaza el criterio profesional. Ver [Aviso de uso](#aviso-de-uso) y [Licencia](#licencia) (AGPL-3.0).

## Qué incluye

| Módulo | Contenido |
|---|---|
| **Pacientes** | Identificación, centro, etiquetas libres y estado (activo / en pausa / alta). Búsqueda sin tildes y filtros por centro, etiquetas y estado. Se pueden eliminar (con todos sus registros) desde la lista o la cabecera de la ficha. |
| **Ingreso** | Anamnesis próxima y remota completas, con edad e IMC calculados automáticamente. |
| **Evaluación** | ALICIA con EVA 0–10, **mapa del dolor interactivo** (4 vistas; región anatómica y lado del paciente automáticos), postural, movimiento, tejidos blandos, neurológica, sensoriomotor, palpación, funcional, pruebas especiales, diagnóstico kinesiológico, objetivos y plan. |
| **Sesiones** | Planificación (objetivos y ejercicios con series, repeticiones, carga, descanso y notas) y registro SOAP con EVA de inicio y de término. Los ejercicios se agregan desde la biblioteca con su dosis sugerida. Una sesión puede partir de una plantilla o copiar otra sesión (de cualquier paciente), y guardarse como plantilla. |
| **Biblioteca de ejercicios** | **247 ejercicios precargados**: fuerza, potencia, pliometría, movilidad, flexibilidad, estabilidad/control motor, equilibrio/propiocepción, neurodinamia, acondicionamiento y respiratorio (42 con banda elástica o mini banda). Cada uno con dosis sugerida, claves técnicas, regiones y equipamiento. Búsqueda sin tildes, filtros, favoritos, edición, duplicar y archivar. |
| **Plantillas de sesión** | Sesiones tipo reutilizables (7 de ejemplo: post-LCA, lumbalgia, manguito rotador, tobillo, adulto mayor, pliometría, tendinopatía rotuliana). |
| **Programas de tratamiento** | Secuencias de sesiones por fases (6 de ejemplo, por ejemplo *Manguito rotador · 10 sesiones*). Al aplicarlo a un paciente, se eligen la fecha de inicio y los días de atención, y se crean todas las sesiones planificadas, que también aparecen en la agenda. |
| **Adjuntos** | Fotos, exámenes (PDF), informes y videos por paciente, con fecha, categoría, evaluación relacionada y **descripción de hallazgos** (que es lo que lee un LLM). Desde el celular se puede usar “Tomar foto”. Las fotos grandes se reducen solas. |
| **Ficha imprimible / PDF** | Documento de la ficha con secciones a elegir (ingreso, evaluaciones con mapa del dolor, sesiones, adjuntos e imágenes), opcionalmente anonimizado. Se guarda como PDF desde el diálogo de impresión. |
| **Centros** | Varios lugares de atención con color. Un centro se puede **archivar** (deja de ofrecerse para pacientes nuevos y conserva su historial) o **eliminar**, eligiendo qué hacer con sus pacientes: moverlos a otro centro, dejarlos sin centro o eliminarlos. |
| **Evolución y agenda** | Gráfico de EVA, próxima sesión e indicaciones vigentes; agenda por centro, más una vista de sesiones pasadas que quedaron sin registrar. |
| **Datos e IA** | Fichas en Markdown para un LLM (**anonimizadas** por defecto), **respaldo completo .zip con adjuntos** (o solo datos .json) e importación, **carpeta del computador siempre sincronizada**, esquema de datos y **respaldo automático en Google Drive** (con Supabase). |

Todo se guarda solo mientras escribes. Además es una **app instalable (PWA)**: se agrega a la pantalla de inicio del celular, tablet o computador, se abre en su propia ventana y funciona sin conexión.

## Arquitectura

```
Navegador (React)  ──►  Supabase
                         ├─ Auth: login con Google o enlace por correo
                         ├─ Postgres: tablas con RLS (cada usuario ve solo lo suyo)
                         ├─ Storage: bucket privado "adjuntos" (carpeta por usuario)
                          ├─ Vault: token de Google Drive cifrado
                          ├─ Edge Functions: respaldo y checkout histórico cerrado
                          ├─ pagos_manuales: meses abonados por cuenta
                          └─ pg_cron: respaldos de Drive
```

- **Datos pensados para agentes:** cada registro es un documento JSON validado con el esquema de `src/domain/schema.ts`. Además hay columnas y vistas SQL (`v_pacientes`, `v_evolucion_eva`) para consultarlo. Detalle en [`AGENTS.md`](AGENTS.md).
- **Respaldo en Drive:** corre en el servidor, así que funciona con la app cerrada. Usa el permiso `drive.file`: la app solo ve los archivos que ella misma crea, nunca el resto de tu Drive. Guarda un JSON completo por respaldo (conserva los últimos 30) más una copia de cada adjunto.
- **Cobro mensual alojado:** el pago se acuerda por fuera de Kine y la operación registra el mes abonado en Supabase. RLS bloquea escrituras desde el día 11 si falta el período corriente; la cuenta conserva lectura para descargar el ZIP completo. El modo local no usa este control comercial.
- **Modo local:** sin configurar Supabase, la app guarda todo en el navegador (IndexedDB). Sirve para probarla. Los datos y adjuntos existen solo en ese navegador, así que la app:
  - pide al navegador **almacenamiento persistente**, para que no los borre por falta de espacio;
  - recuerda descargar un **respaldo completo (.zip)** si nunca se hizo o pasó más de una semana (salvo que esté activa la sincronización con una carpeta).

```
src/domain/       modelo (schema.ts), ficha estructurada, Markdown, anonimización, mapa del dolor
src/data/         repositorios local/Supabase (datos + archivos), autoguardado
src/pages/        pantallas (incluye AdjuntosPage, ImprimirPage)
supabase/migrations/   tablas, RLS, Storage, Vault, pg_cron
supabase/functions/    Edge Functions de respaldo e integraciones históricas
```

---

## Puesta en marcha

### A. Probar sin cuenta (modo local)

```bash
npm install
npm run dev        # http://localhost:5173 → "Cargar pacientes de ejemplo"
```

### B. Producción con Supabase (paso a paso)

**1. Proyecto Supabase.** Crea un proyecto en [supabase.com](https://supabase.com) en la región *South America (São Paulo)*. Anota el *Project ref* (aparece en la URL `https://<ref>.supabase.co`).

**2. Base de datos, Storage y funciones** (desde este repositorio):

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push                                   # aplica supabase/migrations/
npx supabase functions deploy drive-conectar drive-respaldo suscripcion-crear
```

**3. Google Cloud** ([console.cloud.google.com](https://console.cloud.google.com)). Basta un proyecto para el login y para Drive:
- *APIs y servicios → Biblioteca*: habilita **Google Drive API**.
- *Pantalla de consentimiento OAuth*: tipo **Externo**; agrega el alcance `.../auth/drive.file`. Luego **publícala (“En producción”)**. En modo *Prueba*, Google invalida el permiso a los 7 días y el respaldo automático se detendría. `drive.file` no es un alcance sensible, así que publicar no requiere verificación de Google.
- *Credenciales → Crear ID de cliente OAuth → Aplicación web*, con estos **URI de redireccionamiento autorizados**:
  - `https://<ref>.supabase.co/auth/v1/callback` (login con Google)
  - `https://<tu-app>/datos` (conectar Drive; agrega también `http://localhost:5173/datos` para desarrollo)

**4. Login con Google en Supabase.** En *Authentication → Sign In / Providers → Google*, pega el Client ID y el Client Secret. Luego, en *Authentication → URL Configuration*, agrega la URL de tu app.

**5. Secretos de las Edge Functions.** Crea `supabase/functions/.env` a partir de `supabase/functions/.env.example`:

```bash
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
COBROS_HABILITADOS=false
KINE_APP_URL=https://<usuario>.github.io/<repositorio>/
SECRETO_CRON=<cadena aleatoria larga, ej: openssl rand -hex 32>
```

Y súbelos con `npx supabase secrets set --env-file supabase/functions/.env`.

**6. Activar el respaldo programado.** En *SQL Editor* ejecuta, con tus valores:

```sql
select vault.create_secret('https://<ref>.supabase.co', 'url_proyecto');
select vault.create_secret('<el mismo SECRETO_CRON>', 'secreto_cron');
```

pg_cron revisa cada hora a quién le toca respaldo (diario o semanal, según elija cada usuario).

**7. Publicar la app**, en GitHub Pages (sección siguiente) o en Vercel/Netlify, con estas variables:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key de Project Settings → API>
VITE_GOOGLE_CLIENT_ID=<client id>
VITE_URL_CODIGO=https://github.com/lsottile/Patient-Platform
```

Solo las variables `VITE_*` anteriores son públicas. Nunca pongas `SECRETO_CRON`, claves `service_role` ni secretos OAuth en `VITE_*`. Las credenciales históricas de Mercado Pago tampoco deben exponerse si todavía se conservan para conciliación.

**8. Configurar cobro y operación.** Seguí [`docs/operacion-suscripciones.md`](docs/operacion-suscripciones.md) para registrar por correo cada mes abonado, verificar las cuentas exenta/preferencial y mantener el checkout histórico cerrado.

Por último, en la app ve a **Datos e IA → Conectar Google Drive**. Se hace el primer respaldo de inmediato.

### Publicar en GitHub Pages (gratis)

El workflow `.github/workflows/pages.yml` corre los tests, compila y publica la app en
**https://lsottile.github.io/Patient-Platform/** cada vez que se sube un cambio a la rama principal.

1. Activa Pages una sola vez: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
2. Para usar Supabase y Drive en la versión publicada, define en *Settings → Secrets and variables → Actions → **Variables***:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_GOOGLE_CLIENT_ID`. Son valores públicos por diseño; la seguridad la da RLS. El workflow genera `VITE_URL_CODIGO` con el commit exacto desplegado. Sin Supabase, la app publicada funciona en modo local.
3. Agrega la URL publicada en los lugares donde se autoriza el regreso:
   - Supabase → *Authentication → URL Configuration*: `https://lsottile.github.io/Patient-Platform/`
   - Google Cloud → URI de redireccionamiento: `https://lsottile.github.io/Patient-Platform/datos`
4. Vuelve a ejecutar el workflow (*Actions → Publicar en GitHub Pages → Run workflow*) para que tome las variables.

El repositorio es público, pero **solo el código** queda a la vista. Los datos de pacientes nunca van al repositorio: viven en Supabase (protegidos por RLS) o en el navegador (modo local).

### Instalar como app (PWA)

- **Android / Chrome / Edge:** botón **“Instalar app”** en la barra superior, o menú ⋮ → *Instalar aplicación*.
- **iPhone / iPad (Safari):** botón *Compartir* → **Agregar a pantalla de inicio**.
- **Mac / Windows:** ícono de instalar en la barra de direcciones de Chrome o Edge.

Sin conexión, la app abre igual y muestra “Sin conexión”:
- **Modo local:** todo sigue funcionando.
- **Con Supabase:** se puede consultar lo que ya estaba cargado, pero los cambios no se guardan hasta recuperar la conexión. El indicador del formulario muestra el error de guardado.

El service worker (`public/sw.js`) solo guarda en caché los archivos de la app, nunca datos de Supabase ni de Google.

### C. Desarrollo con Supabase local (Docker)

```bash
npm run supabase:start     # Postgres, Auth, Storage, Edge Functions y Mailpit en Docker
# .env.local: VITE_SUPABASE_URL=http://127.0.0.1:54321 y la ANON_KEY que muestra `npx supabase status`
npm run dev
npm run functions:serve    # Edge Functions con supabase/functions/.env
```

Los correos de acceso llegan a Mailpit (http://127.0.0.1:54324). Para probar Drive sin Google real, `GOOGLE_OAUTH_URL` y `GOOGLE_API_URL` en las funciones, y `VITE_GOOGLE_AUTH_URL` en la app, pueden apuntar a un servidor simulado.

### Verificaciones

```bash
npm test           # dominio: esquema, regiones, filtros, Markdown, anonimización
npm run typecheck
npm run build
npx supabase db reset && npx supabase test db
npm run schema     # regenera docs/esquema.json
```

## Consultar a un LLM sobre tus pacientes

- **Rápido:** en *Datos e IA* descarga las fichas `.md` (anonimizadas por defecto, filtrables por centro) y súbelas a un proyecto de Claude. También puedes usar **“Copiar ficha para IA”** desde un paciente.
- **Desde una carpeta sincronizada:** `fichas-pacientes.md` y `respaldo.json` están siempre al día en tu computador, así que un asistente con acceso a esa carpeta (Claude Desktop, Claude Code…) puede leerlos directamente. Ojo: ahí las fichas **no** están anonimizadas.
- **Desde Drive:** los respaldos JSON quedan en tu carpeta “Kine — respaldos”, y un asistente con acceso a tu Drive puede leerlos. El formato está en `docs/esquema.json`.
- **En vivo:** conecta un agente al servidor MCP de Supabase y consulta con SQL (ver [`AGENTS.md`](AGENTS.md)).

### Qué quita la anonimización

| Se quita | Se conserva |
|---|---|
| Nombre: reemplazado por un código estable, por ejemplo `P-3F2A9C` (el mismo paciente tiene siempre el mismo código) | Edad, sexo y ocupación |
| RUT, teléfono, email y fecha de nacimiento | Todo lo clínico: anamnesis, evaluaciones, mapa del dolor, sesiones y EVA |
| Médico tratante y notas generales del paciente | Fechas clínicas (para ver la evolución) |
| Nombres de archivo de los adjuntos | Centro |
| **En texto libre:** nombre del paciente (aunque no lleve tildes o esté en mayúsculas), RUT, correos y teléfonos | |

No detecta nombres de **otras personas** escritos en texto libre (familiares, otros profesionales), así que conviene revisar antes de compartir. Las fotos también pueden identificar al paciente.

## Privacidad

Estos son **datos sensibles de salud**. Para el servicio alojado en Argentina se aplican, entre otras, la Ley 25.326 de protección de datos personales y la Ley 26.529 de derechos del paciente. La plataforma:
- aísla los datos y archivos de cada usuario en la base de datos (Row Level Security; verificado con dos usuarios);
- guarda el permiso de Google Drive cifrado (Vault), sin que el navegador pueda leerlo, y lo revoca al desconectar;
- respalda solo en tu propio Drive.
- no elimina automáticamente la copia alojada por falta de pago; las copias descargadas o guardadas en Drive quedan bajo control de la persona usuaria.

La Ley 26.529 puede exigir al profesional conservar la historia clínica por al menos diez años desde la última actuación. Descargá y custodiá respaldos periódicos. Recomendado: activar la verificación en dos pasos en Google y en Supabase, y no compartir fichas sin anonimizar. Ver los documentos públicos en `/terminos` y `/privacidad`.

## Respaldos manuales

En **Datos e IA → Respaldo**:

- **Respaldo completo (.zip, con adjuntos):** contiene `respaldo.json` (todos los datos, formato en `docs/esquema.json`), la carpeta `adjuntos/<id>/<archivo>` con cada foto o examen, y un `LEEME.txt`.
- **Solo datos (.json):** el mismo `respaldo.json`, sin los archivos.
- **Importar respaldo…** acepta `.zip` o `.json`:
  - Agrega o actualiza registros y no borra nada.
  - Desde un `.zip` restaura también los archivos de los adjuntos.
  - Funciona entre modos: un respaldo de modo local se puede importar en una cuenta de Supabase y al revés.
  - El catálogo base no se duplica, y reimportar el mismo respaldo actualiza en vez de duplicar.

## Carpeta sincronizada

En **Datos e IA → Sincronizar con una carpeta del computador** eliges una carpeta y la app la mantiene al día: unos segundos después de cada cambio (y al cambiar de pestaña) reescribe

```
respaldo.json                      todos los datos (el mismo formato del respaldo .zip)
fichas-pacientes.md                la ficha de cada paciente en Markdown, sin anonimizar
adjuntos/<id>/<archivo>            cada adjunto (se copia una vez; se borra si lo eliminas en la app)
LEEME.txt
```

- Funciona en **modo local y con Supabase** (en ese caso es una copia local de la nube). Cada cuenta del navegador recuerda su propia carpeta.
- Si la carpeta está dentro de Google Drive, Dropbox, OneDrive o iCloud Drive en tu computador, además queda respaldada en la nube.
- Requiere **Chrome o Edge en un computador** (Windows, Mac, Linux o ChromeOS): usa la [File System Access API](https://developer.mozilla.org/docs/Web/API/Window/showDirectoryPicker), que Safari, Firefox y los celulares no tienen. En esos navegadores la opción aparece desactivada con una explicación.
- Se actualiza solo **mientras la app está abierta**. Al volver a abrirla, el navegador puede pedir confirmar el permiso: aparece **“📁 Reanudar”** en la barra superior (un clic). Si instalas la app (PWA), Chrome ofrece “Permitir siempre”.
- **Otro computador:** elige la misma carpeta (por ejemplo, sincronizada por Drive) y pulsa **“Restaurar y sincronizar”**: trae lo que la carpeta tenga más nuevo, sin borrar nada de lo que ya hay en la app, y desde ahí la mantiene al día. “Reemplazar” sobrescribe la carpeta con los datos del navegador.
- No edites los archivos a mano: la app los sobrescribe. No es una sincronización en ambos sentidos entre dos navegadores abiertos a la vez; para eso está el modo Supabase.

## Aviso de uso

- **No es un dispositivo médico.** Es una herramienta para registrar y organizar la información clínica. No diagnostica ni
  indica tratamientos. Los catálogos de ejercicios, plantillas y programas son ejemplos de referencia: las decisiones
  clínicas, dosis y progresiones son responsabilidad del profesional tratante.
- **Datos de pacientes.** El repositorio contiene solo código. Los datos clínicos viven en tu proyecto de Supabase o en
  tu navegador (modo local), nunca en GitHub.
- **Responsabilidad de quien la usa.** Quien instala la plataforma y registra pacientes es responsable del tratamiento de
  esos datos según la normativa aplicable (en Argentina, entre otras, Ley 25.326 y Ley 26.529): autorización,
  confidencialidad, acceso, resguardo y conservación de la historia clínica.
- **IA.** Las fichas exportadas para un LLM son anonimizadas por defecto, pero la anonimización automática no es perfecta.
  Revisa antes de compartir. Las respuestas de un LLM pueden ser incorrectas y no reemplazan el juicio clínico.
- **Sin garantía.** El software se entrega "tal cual", sin garantía de ningún tipo (ver secciones 15 y 16 de la licencia).

## Licencia

Copyright (C) 2026 geno-whirl

Este programa es software libre: puedes redistribuirlo y/o modificarlo bajo los términos de la
**GNU Affero General Public License, versión 3** (`AGPL-3.0-only`), publicada por la Free Software Foundation.
Se distribuye con la esperanza de que sea útil, pero **sin ninguna garantía**, ni siquiera la garantía implícita de
comerciabilidad o idoneidad para un propósito particular. El texto completo está en [`LICENSE`](LICENSE).

En la práctica:
- Puedes usar, estudiar, modificar y redistribuir la plataforma, incluso con fines comerciales.
- Si distribuyes una versión modificada **u ofreces una versión modificada como servicio web** (por ejemplo, a otros
  profesionales o clínicas), debes publicar su código fuente completo bajo la misma licencia. La app muestra el enlace
  "Código fuente" en el pie de página: apúntalo a tu repositorio con la variable `VITE_URL_CODIGO`.
- Las dependencias (React, Supabase, Zod, fflate, idb-keyval…) mantienen sus propias licencias (MIT y Apache-2.0),
  compatibles con la AGPL-3.0.
