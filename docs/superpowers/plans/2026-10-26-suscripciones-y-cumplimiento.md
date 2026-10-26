# Suscripciones y cumplimiento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrar suscripciones mensuales con Mercado Pago, aplicar el acceso comercial en Supabase y publicar los documentos y la salida de datos acordados.

**Architecture:** Supabase conserva la fuente de verdad del acceso y la aplica mediante RLS; Edge Functions crean suscripciones, verifican webhooks y eliminan cuentas vencidas. React presenta documentos, aceptación, checkout, avisos y exportación, pero nunca decide por sí solo si una cuenta puede escribir.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Supabase Auth/Postgres/RLS/Storage/Edge Functions/pg_cron, Mercado Pago Preapproval API, Vitest y pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-26-suscripciones-y-cumplimiento-design.md`

## Global Constraints

- Un servicio: ARS 15.000 para la cuenta preferencial existente y ARS 50.000 para cuentas nuevas; administrador exento.
- Cuatro días corridos de gracia desde el primer cobro rechazado.
- Cancelación con acceso hasta finalizar el período pagado; reintegro total solicitado dentro de cinco días hábiles.
- Retención de un año después del fin del acceso, eliminación automática y solicitud anticipada por correo.
- Toda cuenta bloqueada mantiene lectura para exportar un `.zip`, pero no puede escribir ni navegar fichas.
- No agregar SDKs ni dependencias a Edge Functions: usar `fetch` y Web Crypto según las convenciones del repositorio.
- No guardar tarjetas, secretos, cuerpos completos de webhook ni datos clínicos en logs.
- Términos, Privacidad y código fuente deben ser accesibles antes de pagar y estando bloqueado.
- No modificar migraciones ya aplicadas; crear migraciones nuevas.
- Mantener el modo local/autohospedado sin cobro.

## Review Focus

- Eventos webhook repetidos, fuera de orden o falsificados no deben duplicar períodos ni conceder acceso.
- Un reloj justo en `gracia_hasta` o `acceso_hasta` debe bloquear escritura de forma consistente en TypeScript y SQL.
- Un usuario bloqueado puede leer solo sus propios datos y adjuntos para exportarlos, nunca los de otra cuenta ni escribir los propios.
- Un fallo a mitad de la eliminación no debe perder la marca pendiente ni dejar de reintentarse al día siguiente.
- Volver del checkout con parámetros manipulados no debe habilitar acceso antes de la confirmación del servidor.

---

### Task 1: Documentos legales públicos y avisos AGPL

**Files:**
- Create: `src/legal/versiones.ts`
- Create: `src/pages/TerminosPage.tsx`
- Create: `src/pages/PrivacidadPage.tsx`
- Create: `src/legal/__tests__/documentos.test.tsx`
- Create: `src/components/PieLegal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/auth/Acceso.tsx`
- Modify: `src/components/Marco.tsx`
- Modify: `src/styles.css`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: `VERSION_TERMINOS`, `VERSION_PRIVACIDAD`, `TerminosPage`, `PrivacidadPage` y `PieLegal`.
- `PieLegal` acepta `compacto?: boolean` y muestra rutas públicas, AGPL y `VITE_URL_CODIGO`.

- [ ] **Step 1: Write the failing legal-document test**

Crear pruebas con `renderToStaticMarkup` que exijan: identidad completa del proveedor, soporte en tres días hábiles, reintegro en cinco días hábiles, aviso de 14 días, retención de un año, obligación de conservación clínica por diez años, Leyes 25.326 y 26.529, proveedores externos, transferencia a São Paulo, derechos AAIP y enlace al código fuente.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/legal/__tests__/documentos.test.tsx`

Expected: FAIL porque los módulos legales todavía no existen.

- [ ] **Step 3: Implement the versioned public documents**

Definir versiones ISO iniciales `2026-10-26` y escribir las páginas según las secciones de la especificación, con títulos escaneables, fecha de vigencia, contacto y una nota visible de que la Política no reemplaza las obligaciones propias del profesional.

- [ ] **Step 4: Extract and expose the common legal footer**

Reutilizar `PieLegal` en la aplicación y el login; agregar rutas públicas `/terminos` y `/privacidad` fuera del gate autenticado. Cambiar el fallback de código fuente al fork `https://github.com/lsottile/Patient-Platform` y pasar `VITE_URL_CODIGO` desde GitHub Actions.

- [ ] **Step 5: Verify documents and type safety**

Run: `npx vitest run src/legal/__tests__/documentos.test.tsx && npm run typecheck`

Expected: PASS y cero errores TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/legal src/pages/TerminosPage.tsx src/pages/PrivacidadPage.tsx src/components/PieLegal.tsx src/App.tsx src/auth/Acceso.tsx src/components/Marco.tsx src/styles.css .github/workflows/pages.yml
git commit -m "feat: publicar términos y política de privacidad"
```

### Task 2: Estado comercial y reglas temporales

**Files:**
- Create: `src/suscripciones/tipos.ts`
- Create: `src/suscripciones/estado.ts`
- Create: `src/suscripciones/__tests__/estado.test.ts`

**Interfaces:**
- Produces: `AccesoComercial`, `EstadoEfectivo`, `estadoEfectivo(acceso, ahora)`, `puedeUsarKine(acceso, ahora)` y `puedeExportar(acceso)`.
- `AccesoComercial` refleja las columnas públicas de `accesos_comerciales`, sin identificadores internos de pago que la UI no necesite.

- [ ] **Step 1: Write the failing state-machine tests**

Cubrir pendiente, transición, exenta, activa, gracia un milisegundo antes y exactamente en el vencimiento, cancelación antes y exactamente en `acceso_hasta`, reintegro y reactivación. Afirmar que todos los estados existentes pueden exportar y solo los efectivos habilitados usan Kine.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/suscripciones/__tests__/estado.test.ts`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Implement the pure state functions**

Usar fechas ISO parseadas una vez, comparación inclusiva de bloqueo (`ahora >= límite`) y resultados explícitos: `pendiente`, `transicion`, `activa`, `gracia`, `cancelada_vigente`, `bloqueada` o `exenta`.

- [ ] **Step 4: Run the focused tests**

Run: `npx vitest run src/suscripciones/__tests__/estado.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/suscripciones
git commit -m "feat: modelar estados de suscripción"
```

### Task 3: Esquema comercial y RLS de solo lectura al bloquear

**Files:**
- Create: `supabase/migrations/20261026000000_acceso_comercial.sql`
- Create: `supabase/tests/acceso_comercial.test.sql`
- Modify: `supabase/migrations/20261026000000_acceso_comercial.sql` (incluye políticas para todas las colecciones y Storage)

**Interfaces:**
- Produces: tablas `accesos_comerciales`, `eventos_mercado_pago` y `documentos_legales`.
- Produces: funciones `public.puede_escribir(p_user uuid) returns boolean` y `public.mi_acceso_comercial()`.
- `mi_acceso_comercial()` devuelve solo modalidad, monto, estado, fechas, aceptación y estado efectivo del usuario autenticado.

- [ ] **Step 1: Write failing pgTAP coverage**

Crear usuarios de prueba para pendiente, transición, activa, gracia vigente/vencida, cancelada vigente/vencida y exenta. Probar en una tabla clínica y `storage.objects`: aislamiento entre usuarios; lectura propia aun bloqueado; escritura propia solo habilitado; transición y exenta habilitadas; frontera temporal bloqueada; tablas comerciales sin escritura directa.

- [ ] **Step 2: Run the database test and confirm it fails**

Run: `npx supabase db reset && npx supabase test db`

Expected: FAIL porque no existen tabla, funciones ni políticas nuevas.

- [ ] **Step 3: Create the migration**

Agregar checks cerrados para modalidad/estado, índices únicos parciales para `mercado_pago_preapproval_id`, trigger de `updated_at`, fila de versiones legales, trigger de altas nuevas en `pendiente`/ARS 50.000 y backfill de usuarios existentes a `transicion`. Mantener `SELECT` por propietario y reemplazar las políticas `for all` por políticas separadas de lectura y escritura condicionada en las ocho colecciones y Storage.

- [ ] **Step 4: Add server-only RPCs**

Agregar RPCs revocados a `anon`/`authenticated` para actualizar eventos comerciales desde service role y una RPC pública de solo lectura para el estado propio. La función temporal SQL debe usar `now()` y las mismas fronteras que `estadoEfectivo`.

- [ ] **Step 5: Run database verification**

Run: `npx supabase db reset && npx supabase test db`

Expected: todos los tests pgTAP pasan.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261026000000_acceso_comercial.sql supabase/tests/acceso_comercial.test.sql
git commit -m "feat: aplicar acceso comercial con RLS"
```

### Task 4: Creación segura del checkout de Mercado Pago

**Files:**
- Create: `supabase/functions/_shared/mercadopago.ts`
- Create: `supabase/functions/suscripcion-crear/index.ts`
- Modify: `supabase/functions/_shared/servicio.ts`
- Modify: `supabase/config.toml`
- Create: `scripts/probar-suscripcion-crear.sh`

**Interfaces:**
- `crearPreapproval(input: { userId: string; email: string; amount: number; backUrl: string }): Promise<{ id: string; initPoint: string; status: string }>`.
- Edge request autenticado: `POST { aceptaTerminos: true, aceptaPrivacidad: true, backUrl: string }`.
- Edge response: `{ initPoint: string }`; nunca acepta monto, modalidad ni `external_reference` desde el cliente.

- [ ] **Step 1: Write a failing contract smoke test**

Crear un script que use un servidor HTTP falso para Mercado Pago y compruebe: rechazo sin JWT, rechazo sin ambas aceptaciones, monto tomado de Supabase, `external_reference` igual al usuario, ARS/mensual/pending, y segunda llamada devolviendo el checkout pendiente sin crear otra suscripción.

- [ ] **Step 2: Run the smoke test and confirm it fails**

Run: `bash scripts/probar-suscripcion-crear.sh`

Expected: FAIL porque la función no existe.

- [ ] **Step 3: Implement the Mercado Pago client**

Usar `fetch` con `MP_ACCESS_TOKEN`, timeouts mediante `AbortSignal.timeout`, mensajes sin secretos y validación estricta de la respuesta. Construir la preapproval sin plan asociado con frecuencia `1`, `months`, moneda `ARS`, estado `pending`, razón fija, correo autenticado y UUID como referencia externa.

- [ ] **Step 4: Implement the authenticated Edge Function**

Resolver el usuario mediante `usuarioDeLaPeticion`, leer su fila comercial con service role, grabar las versiones legales vigentes, reutilizar una preapproval pendiente si existe y persistir el ID nuevo antes de devolver `init_point`. Validar que `backUrl` pertenezca a la URL configurada de Kine.

- [ ] **Step 5: Configure and run the contract test**

Agregar `[functions.suscripcion-crear] verify_jwt = true` y ejecutar `bash scripts/probar-suscripcion-crear.sh`.

Expected: PASS para contrato e idempotencia.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared supabase/functions/suscripcion-crear supabase/config.toml scripts/probar-suscripcion-crear.sh
git commit -m "feat: crear suscripciones de Mercado Pago"
```

### Task 5: Webhook firmado e idempotente

**Files:**
- Create: `supabase/functions/_shared/firmaMercadoPago.ts`
- Create: `supabase/functions/mercadopago-webhook/index.ts`
- Create: `scripts/probar-mercadopago-webhook.sh`
- Modify: `supabase/config.toml`

**Interfaces:**
- `validarFirmaMercadoPago(input: { signature: string | null; requestId: string | null; dataId: string | null; secret: string; nowMs?: number }): Promise<boolean>`.
- Webhook público: tópicos `subscription_preapproval` y `subscription_authorized_payment`; respuesta `200` para eventos procesados o ya vistos, `401` para firma inválida y `400` para tópico/forma inválida.

- [ ] **Step 1: Write failing signature and event tests**

El script debe generar HMAC conocido para el manifiesto `id:<data-id-en-minúsculas>;request-id:<id>;ts:<segundos>;`, probar comparación constante y ventana de cinco minutos. Simular eventos duplicados, aprobación, rechazo, cancelación y reintegro; afirmar que solo una fila de evento existe y que montos/monedas/referencias inesperados no cambian acceso.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bash scripts/probar-mercadopago-webhook.sh`

Expected: FAIL porque no existe el endpoint.

- [ ] **Step 3: Implement signature verification**

Parsear `ts` y `v1` desde `x-signature`; construir el manifiesto oficial; calcular HMAC-SHA256 con Web Crypto; comparar en tiempo constante; rechazar timestamps con más de 300 segundos de diferencia.

- [ ] **Step 4: Implement resource reconciliation**

Para `subscription_preapproval`, recuperar la suscripción por API y actualizar autorización/cancelación y `next_payment_date`. Para `subscription_authorized_payment`, recuperar `/authorized_payments/{id}` y usar `payment.status`, `debit_date`, `preapproval_id`, monto y moneda. Una aprobación activa y limpia plazos; el primer rechazo fija `gracia_hasta = debit_date + 4 días` sin extenderla en reintentos; cancelación conserva el período; reintegro termina acceso inmediatamente.

- [ ] **Step 5: Persist idempotency before acknowledgement**

Insertar la clave `(topic, resource_id, action/version)` con restricción única y transacción/RPC; si ya existe, devolver 200. No almacenar el cuerpo completo ni datos de tarjeta.

- [ ] **Step 6: Configure and run webhook tests**

Agregar `[functions.mercadopago-webhook] verify_jwt = false` y ejecutar `bash scripts/probar-mercadopago-webhook.sh`.

Expected: PASS para firma, replay, duplicados y transiciones.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/firmaMercadoPago.ts supabase/functions/mercadopago-webhook scripts/probar-mercadopago-webhook.sh supabase/config.toml
git commit -m "feat: sincronizar pagos por webhook firmado"
```

### Task 6: Gate de acceso, aceptación y avisos

**Files:**
- Create: `src/suscripciones/api.ts`
- Create: `src/suscripciones/AccesoComercial.tsx`
- Create: `src/suscripciones/PantallaSuscripcion.tsx`
- Create: `src/suscripciones/AvisoSuscripcion.tsx`
- Create: `src/suscripciones/__tests__/presentacion.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Marco.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `cargarAcceso(sb): Promise<AccesoComercial>` llama `mi_acceso_comercial`.
- `crearCheckout(sb, backUrl): Promise<string>` invoca `suscripcion-crear` con aceptación explícita.
- `AccesoComercialGate` entrega `{ acceso, aviso }` a la app habilitada o renderiza pago/bloqueo.

- [ ] **Step 1: Write failing presentation tests**

Con `renderToStaticMarkup`, verificar: pendiente muestra ARS 50.000, checkboxes y no muestra navegación; transición muestra ARS 15.000 sin ocultar la app; gracia muestra fecha exacta; cancelada vigente muestra fin; bloqueada muestra pago/exportación/salir; exenta no muestra cobro. Afirmar que parámetros de retorno del checkout no alteran `estadoEfectivo`.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run src/suscripciones/__tests__/presentacion.test.tsx`

Expected: FAIL por componentes inexistentes.

- [ ] **Step 3: Implement API and gate**

Consultar al montar y al recuperar foco tras volver de Mercado Pago. Abrir `initPoint` solo después de aceptación y manejar errores recuperables. No montar `DatosProvider` para una cuenta pendiente sin datos.

- [ ] **Step 4: Implement banners and shared copy**

Pasar `AvisoSuscripcion` a `Marco` para transición, gracia y cancelación vigente. Usar fechas locales con texto inequívoco y enlaces públicos a los documentos.

- [ ] **Step 5: Run focused and global checks**

Run: `npx vitest run src/suscripciones/__tests__/presentacion.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/suscripciones src/App.tsx src/components/Marco.tsx src/styles.css
git commit -m "feat: mostrar pago y estado de acceso"
```

### Task 7: Exportación exclusiva para cuentas bloqueadas

**Files:**
- Modify: `src/components/SeccionRespaldo.tsx`
- Modify: `src/data/DatosContext.tsx`
- Create: `src/suscripciones/PantallaBloqueo.tsx`
- Create: `src/suscripciones/__tests__/exportacionBloqueada.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/domain/respaldoZip.ts`
- Modify: `src/domain/__tests__/respaldoZip.test.ts`

**Interfaces:**
- `DatosProvider` agrega `soloLectura?: boolean`; en ese modo no carga catálogo ni expone operaciones mutables a la pantalla.
- `SeccionRespaldo` agrega `soloExportar?: boolean`, ocultando JSON, importación y esquema.
- `PantallaBloqueo` recibe acceso, repositorio, email y callbacks de pago/salida.

- [ ] **Step 1: Write failing read-only UI tests**

Verificar que `soloExportar` renderiza únicamente “Descargar respaldo completo”, no importación ni JSON; que el bloqueo muestra fecha de eliminación y advertencia de datos sensibles/diez años; y que el ZIP conserva todos los datos y adjuntos.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npx vitest run src/suscripciones/__tests__/exportacionBloqueada.test.tsx src/domain/__tests__/respaldoZip.test.ts`

Expected: FAIL por propiedades y pantalla inexistentes.

- [ ] **Step 3: Implement explicit read-only data loading**

Montar un `RepositorioSupabase` y `DatosProvider soloLectura` solo para estados bloqueados con datos retenidos. Desactivar la carga automática del catálogo y no renderizar rutas clínicas. La seguridad real sigue siendo RLS.

- [ ] **Step 4: Implement the restricted export screen**

Reutilizar la creación ZIP y descarga de adjuntos. Mostrar pago, exportación, fecha de eliminación, obligación de conservación, correo para supresión anticipada y cerrar sesión.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/suscripciones/__tests__/exportacionBloqueada.test.tsx src/domain/__tests__/respaldoZip.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SeccionRespaldo.tsx src/data/DatosContext.tsx src/suscripciones/PantallaBloqueo.tsx src/suscripciones/__tests__/exportacionBloqueada.test.tsx src/App.tsx src/domain/respaldoZip.ts src/domain/__tests__/respaldoZip.test.ts
git commit -m "feat: permitir exportar cuentas bloqueadas"
```

### Task 8: Eliminación automática y solicitud anticipada

**Files:**
- Create: `supabase/functions/cuentas-limpiar/index.ts`
- Create: `scripts/probar-cuentas-limpiar.sh`
- Create: `supabase/migrations/20261026000100_limpieza_cuentas.sql`
- Modify: `supabase/functions/_shared/servicio.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- RPC service-role `public.cuentas_vencidas_para_eliminar()` devuelve UUIDs con `eliminar_despues_de <= now()` y sin acceso reactivado.
- Edge cron `POST /cuentas-limpiar` autenticado por `x-secreto-cron`; devuelve recuentos sin exponer datos clínicos.
- La solicitud anticipada se recibe por correo y se ejecuta fijando `eliminar_despues_de = now()` desde Supabase; no se construye panel.

- [ ] **Step 1: Write the failing cleanup smoke test**

Preparar usuarios vencido, futuro y reactivado, más objetos Storage. Simular un fallo de borrado y afirmar: solo el vencido se intenta; Storage se borra antes de Auth; el fallo conserva el usuario para reintento; una segunda ejecución completa la eliminación; copias externas no se tocan.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bash scripts/probar-cuentas-limpiar.sh`

Expected: FAIL porque no existe la función.

- [ ] **Step 3: Implement cleanup with retry-safe ordering**

Listar y borrar objetos del prefijo `<user_id>/`, eliminar el usuario mediante Auth Admin y dejar que cascadas/triggers limpien tablas y Vault. Registrar solo UUID, etapa y error sanitizado. No marcar éxito antes de completar Auth.

- [ ] **Step 4: Schedule the daily job**

Crear migración que reutilice `url_proyecto` y `secreto_cron` de Vault y programe `limpieza-cuentas` una vez por día. Configurar `[functions.cuentas-limpiar] verify_jwt = false` y validar la cabecera en código.

- [ ] **Step 5: Run cleanup and database tests**

Run: `bash scripts/probar-cuentas-limpiar.sh && npx supabase test db`

Expected: PASS y ningún objeto huérfano del usuario eliminado.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/cuentas-limpiar scripts/probar-cuentas-limpiar.sh supabase/migrations/20261026000100_limpieza_cuentas.sql supabase/functions/_shared/servicio.ts supabase/config.toml
git commit -m "feat: eliminar cuentas vencidas automáticamente"
```

### Task 9: Operación, despliegue y verificación integral

**Files:**
- Create: `docs/operacion-suscripciones.md`
- Modify: `README.md`
- Modify: `supabase/functions/.env.example`

**Interfaces:**
- Documenta secretos `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `KINE_APP_URL` y el `SECRETO_CRON` existente.
- Documenta el SQL operativo para marcar UUIDs como `exenta` y `preferencial/transicion` sin incluir correos o UUIDs reales.

- [ ] **Step 1: Write the launch runbook**

Incluir: crear aplicación MP; credenciales de prueba/producción; configurar y simular ambos tópicos; desplegar funciones; aplicar migraciones; asignar administrador/amigo; variables GitHub Pages; compra de prueba; rechazo; gracia; cancelación; reintegro; reactivación; exportación; solicitud anticipada; limpieza; rollback operativo sin editar migraciones.

- [ ] **Step 2: Update README and environment template**

Explicar cobro solo en despliegue Supabase alojado, documentos públicos, exportación bloqueada, obligación de diez años, AGPL y prohibición de incluir secretos en `VITE_*`.

- [ ] **Step 3: Run the full local verification suite**

Run: `npm test && npm run typecheck && npm run build && npx supabase db reset && npx supabase test db`

Expected: todos los comandos terminan con código 0.

- [ ] **Step 4: Run manual Mercado Pago sandbox verification**

Ejecutar los tres scripts de contrato y una suscripción completa con cuentas/tarjetas de prueba. Confirmar en Supabase y Mercado Pago cada transición, incluida repetición de webhook y retorno manipulado.

- [ ] **Step 5: Verify production-source compliance**

Abrir login, Términos, Privacidad, checkout y bloqueo en el build publicado; confirmar que “Código fuente” apunta al commit/fork desplegado y que el repositorio no contiene Access Tokens, secretos, UUIDs privados ni datos clínicos.

- [ ] **Step 6: Commit**

```bash
git add docs/operacion-suscripciones.md README.md supabase/functions/.env.example
git commit -m "docs: documentar operación de suscripciones"
```

## Self-review record

- Spec coverage: los criterios de pago, transición, gracia, cancelación, reintegro, exportación, retención, documentos, AGPL y operación están asignados a tareas.
- Step scan: cada paso produce una prueba, interfaz, cambio o verificación concreta; no quedan decisiones `TBD`.
- Type consistency: `AccesoComercial`, `EstadoEfectivo`, `estadoEfectivo`, `mi_acceso_comercial` y los estados usan los mismos nombres en frontend, SQL y pruebas.
- Review focus: firma/replay, fronteras temporales, RLS, limpieza parcial y retorno manipulado tienen pruebas en Tasks 3, 5, 6 y 8.
- Proportion: el plan especifica contratos y comportamientos sin transcribir implementaciones completas.
