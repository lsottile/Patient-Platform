# Cobro Manual Mensual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el checkout visible por control mensual manual, con avisos del día 1 al 10 y bloqueo RLS desde el día 11.

**Architecture:** PostgreSQL conserva el registro auditable de meses pagados y calcula el estado usando hora argentina; la misma decisión gobierna RLS y la vista expuesta al frontend. React solo presenta el estado servidor. Mercado Pago permanece desplegado pero la creación de suscripciones queda cerrada por defecto y sin controles visibles.

**Tech Stack:** React 19, TypeScript 5.9, Supabase Postgres/RLS/Edge Functions, Vitest, pgTAP y GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-28-cobro-manual-mensual-design.md`

## Global Constraints

- Inicio: `2026-11-01`, zona `America/Argentina/Buenos_Aires`.
- Propietaria exenta; Santiago preferencial ARS 15.000; cuentas restantes ARS 50.000.
- La interfaz solo dice `Pago mensual pendiente`; no muestra importes ni medios de pago.
- Días 1–3 verde, 4–6 amarillo, 7–10 rojo; bloqueo desde el día 11.
- Un pago tardío del período corriente restaura acceso inmediatamente.
- El usuario autenticado nunca puede registrar su propio pago.
- El bloqueo conserva lectura/exportación y niega toda escritura mediante RLS.
- Mercado Pago queda cerrado por defecto, no eliminado.

## Review Focus

- Fronteras exactas entre días 3/4, 6/7 y 10/11 en hora argentina.
- Alta posterior al día 10 bloqueada sin depender de una tarea cron.
- Registro duplicado del mismo pago idempotente y sin períodos inválidos.
- Divergencia imposible entre el aviso de React y la decisión de RLS.
- Eventos históricos de Mercado Pago incapaces de alterar el acceso manual.

---

### Task 1: Estado mensual y RLS

**Files:**
- Create: `supabase/migrations/20261028000000_cobro_manual_mensual.sql`
- Modify: `supabase/tests/acceso_comercial.test.sql`

**Interfaces:**
- Produces: `public.estado_cobro_manual(text,date,date) -> text`, tabla `public.pagos_manuales`, RPC privada `public.registrar_pago_manual(uuid,date)`, y columnas nuevas de `public.mi_acceso_comercial()`.

- [ ] **Step 1: Write failing pgTAP cases**

Probar inicio previo, exenta, pago corriente, días 1/3 verdes, 4/6 amarillos, 7/10 rojos y 11 bloqueado; probar que authenticated no puede registrar pagos y que un pago corriente vuelve a habilitar RLS.

- [ ] **Step 2: Run database tests and confirm failure**

Run: `npx supabase db reset && npx supabase test db`

Expected: FAIL porque tabla, helper y RPC aún no existen.

- [ ] **Step 3: Implement the migration**

Crear la tabla con período normalizado al día 1, RLS sin escritura de cliente y grant solo a `service_role`. Implementar el helper inmutable, registrar pagos con upsert, cambiar `crear_acceso_comercial` para altas general/50000/activa y reemplazar `puede_escribir`/`mi_acceso_comercial` para usar el estado manual y la fecha argentina. `mi_acceso_comercial` debe leer pagos como `security definer`, limitarse a `auth.uid()` y no exponer filas de otras cuentas.

- [ ] **Step 4: Apply initial account configuration**

Mantener `lucianodaux@gmail.com` exenta; fijar Santiago como preferencial/15000/activa; fijar las demás como general/50000/activa. No crear pagos iniciales: antes del 1 de noviembre el helper concede acceso y después comienza el ciclo acordado.

- [ ] **Step 5: Run pgTAP**

Run: `npx supabase db reset && npx supabase test db`

Expected: todas las pruebas aprobadas.

### Task 2: Presentación y bloqueo manual

**Files:**
- Modify: `src/suscripciones/tipos.ts`
- Modify: `src/suscripciones/api.ts`
- Modify: `src/suscripciones/estado.ts`
- Create: `src/suscripciones/AvisoPagoManual.tsx`
- Modify: `src/suscripciones/AccesoComercial.tsx`
- Modify: `src/suscripciones/PantallaBloqueo.tsx`
- Modify: `src/App.tsx`
- Modify: `src/suscripciones/__tests__/estado.test.ts`
- Modify: `src/suscripciones/__tests__/presentacion.test.tsx`

**Interfaces:**
- Consumes: estado servidor `exenta|al_dia|aviso_verde|aviso_amarillo|aviso_rojo|bloqueada`.
- Produces: `AvisoPagoManual` y gate sin checkout.

- [ ] **Step 1: Write failing state and rendering tests**

Exigir acceso para todos los estados salvo `bloqueada`, aviso único con clases verde/amarilla/roja, ausencia de montos/Mercado Pago y pantalla bloqueada con soporte, exportación y salida.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/suscripciones/__tests__/estado.test.ts src/suscripciones/__tests__/presentacion.test.tsx`

Expected: FAIL porque los estados y componentes manuales no existen.

- [ ] **Step 3: Parse the server state strictly**

Extender `AccesoComercial` con período y `estadoCobroManual`; rechazar cualquier valor desconocido en `api.ts`. Hacer que `puedeUsarKine` dependa exclusivamente de ese estado servidor.

- [ ] **Step 4: Replace payment UI**

Eliminar de `AccesoComercialGate` la creación de checkout y renderizar `AvisoPagoManual` solo para los tres avisos. Simplificar `PantallaBloqueo` para mostrar el texto acordado, soporte, exportación, legales y salida sin montos ni acciones de pago.

- [ ] **Step 5: Run frontend verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: pruebas, TypeScript y build aprobados.

### Task 3: Cerrar Mercado Pago y actualizar contratos/documentación

**Files:**
- Modify: `supabase/functions/suscripcion-crear/index.ts`
- Modify: `supabase/functions/.env.example`
- Modify: `scripts/probar-suscripcion-crear.sh`
- Modify: `src/pages/TerminosPage.tsx`
- Modify: `src/pages/PrivacidadPage.tsx`
- Modify: `src/legal/versiones.ts`
- Modify: `src/legal/__tests__/documentos.test.tsx`
- Modify: `supabase/migrations/20261028000000_cobro_manual_mensual.sql`
- Modify: `docs/operacion-suscripciones.md`

**Interfaces:**
- Produces: kill switch `COBROS_HABILITADOS` cerrado salvo valor exacto `true`; términos y privacidad `2026-10-28` coherentes con pago externo y datos históricos de Mercado Pago.

- [ ] **Step 1: Extend contracts with disabled checkout**

Sin `COBROS_HABILITADOS=true`, una petición autenticada válida debe responder 503 antes de contactar Mercado Pago; con la variable explícita, el contrato histórico de idempotencia continúa pasando.

- [ ] **Step 2: Write failing legal assertions**

Exigir términos `2026-10-28` que describan registro manual, aviso, bloqueo desde el 11 y ausencia de procesamiento de pagos en Kine. Exigir que Privacidad distinga pagos manuales actuales de identificadores históricos de Mercado Pago.

- [ ] **Step 3: Implement kill switch and terms**

Agregar el cierre servidor, documentar la variable, actualizar ambos documentos/frontend y marcar las versiones anteriores como no vigentes en la migración.

- [ ] **Step 4: Update the runbook**

Documentar el comando transaccional para buscar UUID por email, registrar el primer día del mes argentino y verificar exactamente una cuenta sin leer datos clínicos.

- [ ] **Step 5: Run contracts**

Run: `bash scripts/probar-suscripcion-crear.sh && bash scripts/probar-mercadopago-webhook.sh && bash scripts/probar-cuentas-limpiar.sh`

Expected: los tres contratos aprobados.

### Task 4: Verificación y publicación

**Files:**
- Verify all files above.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `origin/main`, Supabase y GitHub Pages con cobro manual activo.

- [ ] **Step 1: Run complete local verification**

Run: `npm test && npm run typecheck && npm run build && npx supabase db reset && npx supabase test db && bash scripts/probar-suscripcion-crear.sh && bash scripts/probar-mercadopago-webhook.sh && bash scripts/probar-cuentas-limpiar.sh`

Expected: cero fallos.

- [ ] **Step 2: Commit as reviewable work units**

Commit base/RLS with pgTAP, then UI/terms/contracts with their tests and docs.

- [ ] **Step 3: Publish to main and infrastructure**

Push `HEAD:main`, apply the new migration to project `qdrcpdebhmutqbjeewdv`, deploy `suscripcion-crear`, and run the GitHub Pages workflow from `main`.

- [ ] **Step 4: Verify live behavior**

Confirm account assignments, function 503, deployed Pages version and state returned for owner/Santiago without querying clinical data. Do not insert a November payment unless the user reports one.
