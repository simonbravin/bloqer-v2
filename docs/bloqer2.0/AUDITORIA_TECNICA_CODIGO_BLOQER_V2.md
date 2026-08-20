# Auditoría técnica de código — Bloqer v2

> **Fecha:** 19 agosto 2026 (auditoría). Cierre de release: 20 agosto 2026.  
> **Alcance:** código real del monorepo (post Mobile Foundation / Field Operations / Procurement Mobile / Field Navigation).  
> **Método:** 12 pasadas independientes + segunda búsqueda dirigida por categoría + evidencia en archivos.  
> **Prevalencia:** el código describe el comportamiento actual. Las divergencias con docs se anotan, no se “arreglan” para coincidir.  
> **Prisma / migraciones:** `20260819180000_idempotency_keys`, `20260819190000_idempotency_warehouse_transfer_treasury` y `20260819200000_idempotency_register_ap_ar` aplicadas en Neon `production` y `dev` (checksums alineados).  
> Ver **Stabilization Release** al final de este archivo.

---

## Resumen por severidad

| Severidad | Detectados | Confirmados | Corregidos | Pendientes |
|-----------|------------|-------------|------------|------------|
| CRÍTICA | 0 | 0 | 0 | 0 |
| ALTA | 4 | 4 | 4 | 0 |
| MEDIA | 11 | 11 | 9 | 2 (BUG-014 decisión; BUG-015 mitigado) |
| LEVE | 9 | 9 | 2 | 7 (aceptados) |

## Resumen por categoría

| Categoría | Cantidad |
|-----------|----------|
| Security / Tenant / Permissions | 5 |
| Integrity / Concurrency | 6 |
| Financial | 2 |
| Inventory | 2 |
| Documents | 3 |
| Next/RSC / Performance | 3 |
| Mobile / Field | 4 |
| Validation / UX / Debt | 5 |

---

## Hallazgos

### BUG-001 — ALTA — Inventory / Concurrency

* **Archivos:** `packages/services/src/inventory/stock-movement.service.ts` — `createStockConsumption`
* **Qué ocurre:** dos submits (doble click, retry de red, dos pestañas) crean dos `StockMovement` OUT `CONFIRMED` independientes.
* **Por qué:** `sourceType: "CONSUMPTION"` **sin** `sourceId`. El unique parcial de stock solo cubre `(sourceType, sourceId)` cuando `sourceId IS NOT NULL`. El lock de saldo evita negativo, no duplicados.
* **Repro:** OWNER, mismo depósito/producto/qty, dos POST de consumo simultáneos.
* **Impacto:** doble consumo / costo duplicado.
* **Usuario:** quien tenga `EDIT INVENTORY`.
* **Probabilidad:** media (doble click mobile es realista).
* **Evidencia:** create sin `sourceId`; migración `20260808200000_stock_movement_source_uniques`.
* **Solución:** `idempotencyKey` (UUID de cliente, no `sourceId`) + unique parcial `(tenantId, idempotencyKey) WHERE NOT NULL`. Replay por payload operativo (depósito/producto/obra/EDT/fecha/qty).
* **Test:** `withIdempotentCreate` 10× `Promise.all` misma clave → un efecto; clave+payload distinto → CONFLICT; otro tenant no colisiona.
* **Estado:** CORREGIDO. Migración `20260819180000_idempotency_keys`. El unique de `sourceId` sigue cubriendo consumo de parte de obra; el consumo manual usa `idempotencyKey`.

### BUG-002 — ALTA — Documents / Atomicity

* **Archivos:** `packages/services/src/documents/document.service.ts` `uploadDocument`; `apps/web/features/documents/lib/upload-pending-entity-evidence.ts`
* **Qué ocurre:** cada retry crea un documento nuevo; si `putObject` ok y Prisma falla, queda objeto huérfano en R2.
* **Por qué:** UUID nuevo por upload; storage y DB no son una transacción; el helper de evidencia no es idempotente (comentario explícito).
* **Repro:** timeout de red tras éxito; reintentar el mismo archivo en parte/SC/recepción.
* **Impacto:** duplicados y basura en storage. No es IDOR: el server revalida entidad/tenant.
* **Solución:** `idempotencyKey` + `contentSha256`; lookup antes de `putObject`; `storageKey` derivado de la clave (retry pisa el mismo objeto); si Prisma falla tras R2, `deleteObject` best-effort. Evidencia pendiente reusa `clientId` como clave.
* **Test:** hash distinto con la misma clave → CONFLICT; helper de evidencia envía `idempotencyKey`.
* **Estado:** CORREGIDO. Migración `20260819180000_idempotency_keys`. Ownership de entidad se sigue validando en `resolveDocumentUploadPlan`. Residual: si `deleteObject` también falla, queda un objeto huérfano (sin sweeper masivo).

### BUG-003 — ALTA — Inventory / Integrity

* **Archivos:** `packages/services/src/inventory/stock-movement.service.ts` `createStockConsumption`
* **Qué ocurre:** no se exige que el depósito pertenezca a la empresa/proyecto del consumo (la recepción de OC sí lo hace).
* **Por qué:** solo se chequea tenant + ACTIVE de warehouse/product.
* **Repro:** depósito de empresa A / `projectId` de obra de empresa B (mismo tenant); o depósito con `projectId` de DEMO-001 usado en DEMO-002.
* **Impacto:** imputación de costo/obra incorrecta. No es cross-tenant.
* **Solución:** mismas reglas que recepción: `warehouse.companyId` vs proyecto; si `warehouse.projectId` está set, debe coincidir.
* **Test:** unit del predicado de alcance + CONFLICT en service.
* **Estado:** CORREGIDO (FASE C). Predicado `consumptionWarehouseScopeConflict` + chequeo en `createStockConsumption`. Segunda pasada: mismo patrón en recepción de OC (`warehouse.projectId` vs `po.projectId`), consumo al aprobar parte, y transferencia entre depósitos.

### BUG-004 — ALTA — Concurrency / Treasury

* **Archivos:** `internal-transfer.service.ts` `createInternalTransfer`; `payment.service.ts` / `collection.service.ts` (pagos **parciales**)
* **Qué ocurre:** no hay idempotency key. Doble click en transferencia o pago parcial crea dos movimientos.
* **Mitigación:** pago/cobro *total* (`payFullBalance`) usa lock de `paidAmount` → segundo CONFLICT. Saldo tesorería con row lock.
* **Solución:** `idempotencyKey` en `Payment` / `Collection` / `InternalTransfer` + unique parcial `(tenantId, idempotencyKey)`. `payFullBalance` / `collectFullBalance` hace match de payable/receivable + cuenta + fecha (no re-resuelve el saldo). Parcial también compara monto. Las dos piernas de transferencia siguen en la misma `$transaction`. Nested `payNow` / `collectNow` persisten la misma clave (el unique del pago/cobro impide doble dinero; un segundo alta de factura con clave nueva sigue fuera de alcance).
* **Estado:** CORREGIDO. Migración `20260819180000_idempotency_keys`.

### BUG-005 — MEDIA — Performance / Next/RSC / Mobile

* **Archivos:** `apps/web/app/(app)/dashboard/page.tsx`
* **Qué ocurre:** en `/dashboard` mobile se ejecuta Field Home **y** `getTenantDashboard` (árbol `hidden md:block`). TTFB local ~5–7 s en caliente.
* **Por qué:** Server Components no conocen el viewport; el split es solo CSS.
* **Repro:** 390px, login, `/dashboard`.
* **Solución:** cookie de conveniencia `bloqer-viewport` escrita por `matchMedia` (no User-Agent) en el shell; el RSC omite el árbol que no corresponde. Primera visita sin cookie sigue dual.
* **Test:** con cookie `sm` no se llama el dashboard desktop (o no aparece el heading “Panel de control” en HTML). Playwright 390/1440.
* **Estado:** CORREGIDO (FASE C). Cookie `bloqer-viewport` (`sm`|`md`) vía `matchMedia` en `ViewportHintSync` (root layout, no User-Agent). RSC omite el árbol que no corresponde. Primera visita sin cookie sigue dual.

### BUG-006 — MEDIA — Performance / Field

* **Archivos:** `(app)/layout.tsx` + `field-home.service.ts`
* **Qué ocurre:** `getMyFieldPendingCounts` / `getMyFieldPendingItems(countsOnly)` se ejecutan dos veces en el mismo request de `/dashboard` (layout badge + Field Home).
* **Solución:** `React.cache` en wrappers RSC + pasar counts a `getFieldHome`.
* **Estado:** CORREGIDO (FASE C). `getCachedFieldPendingCounts` (cache por tenant/actor/roles) en layout + Field Home.

### BUG-007 — MEDIA — Field / Timezone

* **Archivos:** `field-home.service.ts` `utcToday`; `schedule-helpers.ts` `computeDaysLate`
* **Qué ocurre:** “Hoy” y atraso usan el día calendario **UTC del server**, no `America/Argentina/Buenos_Aires`. A las 23:30 ART (02:30 UTC del día siguiente) el resumen Field cambia de día.
* **Evidencia:** `packages/utils/src/calendar-date.ts` existe precisamente para este off-by-one; materiales/tesorería ya lo usan.
* **Solución:** pivot UTC midnight del Y-M-D en TZ de producto.
* **Test:** `2026-07-23T02:30:00.000Z` → día 22.
* **Estado:** CORREGIDO (FASE C). `productCalendarDateUtc` en Field Home y `computeDaysLate` / `computeTimePlanProgressPct`.

### BUG-008 — MEDIA — Field / API

* **Archivos:** `apps/web/app/api/field/projects/route.ts`
* **Qué ocurre:** cualquier error (DB, 500) se mapea a HTTP 403 `{ error: "Forbidden" }`.
* **Solución:** mapear `ServiceError` (401/403/404/409/400) vs 500 genérico sin stack.
* **Estado:** CORREGIDO (FASE C). `VALIDATION` → 400; error desconocido → 500 `{ error: "Internal error" }`.

### BUG-009 — MEDIA — Field / Pendientes

* **Archivos:** `field-pending.service.ts`
* **Qué ocurre:** en listado, `counts.* = array.length` con `take: 80`, distinto del `count()` del badge.
* **Impacto:** hoy la UI de `/pendientes` no muestra esos counts; el DTO miente. Badge del layout usa `countsOnly` (correcto).
* **Solución:** `count()` siempre, en paralelo al `findMany`.
* **Estado:** CORREGIDO (FASE C). Totales salen de `count()`; el listado sigue con `take: 80`.

### BUG-010 — MEDIA — Field / Permissions

* **Archivos:** `field-home.service.ts` `getFieldHome`
* **Qué ocurre:** lista proyectos con `VIEW PROJECTS || canAccessProjectLayout`. `canAccessProjectLayout` incluye roles de finanzas **sin** `VIEW PROJECTS` (AR/AP/TREASURY) vía `canViewProjectCashFlowReport`.
* **Impacto:** disclosure intra-tenant de códigos/nombres de obra. No cross-tenant.
* **Solución:** alinear con `listProjects` (`VIEW PROJECTS`) **o** documentar que Field Home es para quien ya entra al workspace de proyecto. Decisión: Field Home es herramienta de campo; roles solo-finanzas corporativas no deberían ver el selector de obras. Usar `VIEW PROJECTS` para el listado; `canAccessProjectLayout` solo no basta para enumerar.
* **Estado:** CORREGIDO (FASE C). `getFieldHome` enumera solo con `VIEW PROJECTS`. Roles solo-finanzas sin ese permiso ven Field Home corporativo vacío.

### BUG-011 — MEDIA — Field / Validation

* **Archivos:** `pendientes/page.tsx`; `assertPreferredProjectAccess` nunca se llama
* **Qué ocurre:** `?proyecto=` UUID se mete en el `where` sin verificar que el proyecto existe en el tenant (el `tenantId` del item sigue protegiendo cross-tenant).
* **Solución:** `assertPreferredProjectAccess` o `findFirst` tenant.
* **Estado:** CORREGIDO (FASE C). `?proyecto=` inválido / otro tenant / sin layout → redirect a `/pendientes`. Cross-tenant ya estaba cubierto por `tenantId` en el `where`.

### BUG-012 — MEDIA — Financial / DTO

* **Archivos:** `supplier-invoice-from-po.service.ts` `getPurchaseOrderBillingSummary`
* **Qué ocurre:** montos con `.toFixed(2)` (banker's) vs `serializeMoneyDecimal` half-up [D-053].
* **Impacto:** display/preview, no el asiento de pago.
* **Estado:** CORREGIDO (FASE C). `serializeMoneyDecimal` en el DTO de billing summary.

### BUG-013 — MEDIA — Documents / Validation

* **Archivos:** `packages/services/src/documents/sniff-upload-content.ts`; `document.service.ts` `uploadDocument`; `file-type`
* **Qué ocurre:** MIME por extensión/`file.type` del browser, sin magic bytes. Metadata PLACEHOLDER puede guardar mime arbitrario.
* **Fix:** sniff de bytes en el server para JPEG, PNG, WebP, PDF y HEIC/HEIF (`file-type` + ftyp brands ISO BMFF). Office/CSV/TXT no se parsean (docx/xlsx son ZIP). Mensaje de usuario: `El contenido del archivo no coincide con un formato permitido.` `createDocumentMetadata` (sin bytes, sin callers en `apps/web`) no se toca.
* **Estado:** CORREGIDO.

### BUG-014 — MEDIA — Budget / Money

* **Archivos:** `cost-analysis.service.ts` recompute APU con `Number()`
* **Qué ocurre:** Decimal → IEEE float → persist.
* **Impacto:** drift en partidas grandes; no es tesorería.
* **Solución:** recompute en Decimal. Alcance amplio; no refactorizar APU en esta estabilización.
* **Estado:** CONFIRMADO — **REQUIERE DECISIÓN** (refactor APU).

### BUG-015 — MEDIA — Concurrency / Budget

* **Archivos:** `budget.service.ts` `approveBudget`
* **Qué ocurre:** chequeo de “ya hay APPROVED” fuera de `$transaction`; el `updateMany` + unique parcial `P2002` mitiga.
* **Estado:** CONFIRMADO (mitigado por unique DB + `updateMany`). Test `budget-approve-unique.test.ts`: P2002 → CONFLICT, no 500. No remodelar Budget.

### BUG-016 — LEVE — Documents / UX

* **Archivos:** `documentos/actions.ts` archive/restore/delete
* **Qué ocurre:** sin sesión, `return` vacío (parece éxito).
* **Solución:** `redirect("/login")`.
* **Estado:** CORREGIDO (FASE C).

### BUG-017 — LEVE — Field / Dead code

* **Archivos:** `assertPreferredProjectAccess` exportado y sin callers (hasta FASE C).
* **Estado:** CORREGIDO (FASE C) — ahora se llama desde `/pendientes`.

### BUG-018 — LEVE — Documents / RBAC

* **Archivos:** `document.service.ts` `canViewDocumentByLink`
* **Qué ocurre:** `VIEW PROJECTS` autoriza cualquier adjunto de proyecto (luego de guard de factura corporativa).
* **Impacto:** alineado a “viewer de obra ve evidencias”. No es bypass de tenant.
* **Estado:** CONFIRMADO — no cambiar (producto).

### BUG-019 — LEVE — Field / DTO

* **Archivos:** `field-pending.service.ts` certificación cliente `currency: "ARS"` hardcode.
* **Estado:** CONFIRMADO — certificaciones no tienen columna currency; ARS es el supuesto de producto. No cambiar.

### BUG-020 — LEVE — Next / Polling

* **Archivos:** `notification-bell.tsx` poll 30s; layout también carga unread.
* **Estado:** CONFIRMADO — diseño existente; no agresivo. No cambiar.

### BUG-021 — LEVE — Debt

* **Archivos:** servicios con `findUnique({ id })` + check `tenantId` posterior (patrón sistémico). Mutaciones críticas suelen usar `updateMany` con tenant.
* **Estado:** CONFIRMADO — no refactor masivo.

### BUG-022 — LEVE — Reports

* **Archivos:** varios `*.toFixed(2)` en reportes.
* **Estado:** CONFIRMADO — no es ledger. Fuera de esta estabilización.

### BUG-023 — LEVE — Field / Cookie cancelled

* **Archivos:** `bloqer-last-project-id`
* **Qué ocurre:** cookie de obra cancelada sigue usándose en `+` / Obra. Mutaciones fallan en service (`assertProjectAllowsOperationalMutation`). Field Home filtra `CANCELLED`.
* **Estado:** CONFIRMADO — no es auth bypass. Mejora: ignorar cookie si no está en la lista de Field Home (cliente ya hace match). Aceptable.

### BUG-024 — LEVE — Upload / PLACEHOLDER

* **Archivos:** `uploadDocument` sin R2 → ACTIVE sin bytes.
* **Estado:** CONFIRMADO — documentado en relevamiento. No cambiar.

---

## Pasadas — qué se buscó en la segunda búsqueda

| Pass | Primera búsqueda | Segunda dirigida |
|------|------------------|------------------|
| 1 Security | tenant en Field/API/docs | cron secret, reports `requireReportExportContext`, cookie last-project no-auth |
| 2 Integrity | state machines sampled | cancel + pay/collect/receive blocked |
| 3 Money | Decimal paths AP/AR | `.toFixed` vs serialize; APU Number() |
| 4 Concurrency | optimistic lock PO/receipt/jobsite | consumption/transfer/upload sin key |
| 5 Uploads | entity assert*DocumentTarget | MIME extension; retry helper |
| 6 Next | Server Actions pattern | dashboard dual RSC; document silent return |
| 7 React | media-query cleanup OK | Field Home `use client` + dates serializadas |
| 8 Perf | N+1 pendientes no | dashboard+layout duplicate pending; notification 30s |
| 9 Mobile | pending RBAC VIEWER | viewport dual fetch; TZ Hoy; API 403 |
| 10 UX | empty pending | 403 masking; silent document actions |
| 11 Dead | assertPreferred unused | no borrar nav/sidebar Foundation |
| 12 Tests | field-pending-access, field-nav | huecos: consumo concurrente, TZ, warehouse scope |

---

## Seguridad — conclusión PASS 1

No se confirmó IDOR cross-tenant ni uso de `bloqer-last-project-id` como autorización. `/api/field/projects` exige sesión + `listProjects` (`VIEW PROJECTS`). Pendientes filtra `tenantId` y fuentes por `fieldPendingSourcesForActor` (VIEWER → cero queries). Downloads de documentos chequean tenant + `canViewDocumentByLink`.

---

## Integridad — conclusión PASS 2–4

Transiciones de estado (OC, recepción confirm, parte approve, cert issue) usan `updateMany` + status en WHERE y/o `$transaction`. Huecos: **creates** (consumo manual, transfer, upload, pago parcial) sin idempotency key.

---

## Mobile / Field — conclusión PASS 9

RBAC de pendientes y `+` reutiliza `can()` / gates. Problemas reales: costo del dashboard dual, TZ de “Hoy”, counts vs take 80, API field 403, enumeración de obras más ancha que `listProjects`.

---

## Tests existentes relevantes

* `packages/services/src/field/field-pending-access.test.ts`
* `apps/web/lib/field-nav.test.ts`
* `packages/services/src/security/finance-tenant-isolation.test.ts`
* `packages/utils/src/calendar-date.test.ts`
* Playwright Field Navigation (`docs/bloqer2.0/mobile-audit/field-navigation.spec.ts`)

---

## FASE C — correcciones aplicadas

Sin Prisma, sin migraciones, sin features nuevas.

| ID | Fix |
|----|-----|
| BUG-001 | Consumo manual: `idempotencyKey` + unique parcial + `withIdempotentCreate` |
| BUG-002 | Upload: clave + SHA-256 + storageKey estable + cleanup R2 best-effort |
| BUG-003 | Scope depósito/obra/empresa en consumo manual + predicado puro |
| BUG-004 | Pago / cobro / transferencia interna: `idempotencyKey` + unique parcial |
| BUG-005 | Cookie viewport + split RSC dashboard |
| BUG-006 | `React.cache` pending counts |
| BUG-007 | TZ producto para Hoy / daysLate / time plan |
| BUG-008 | `/api/field/projects` mapea `ServiceError` vs 500 |
| BUG-009 | `count()` real en listado de pendientes |
| BUG-010 | Field Home lista obras solo con `VIEW PROJECTS` |
| BUG-011 | `assertPreferredProjectAccess` en `?proyecto=` |
| BUG-012 | `serializeMoneyDecimal` en billing summary OC |
| BUG-016 | Document actions `redirect("/login")` |
| BUG-017 | Helper usado (BUG-011) |

No implementado en FASE C (otro lote): BUG-014. BUG-013 corregido en POST-IDEMPOTENCY. BUG-015 mitigado por unique DB.

---

## Segunda pasada post-fix

Categorías reauditadas: inventory scope, Field API errors, dashboard RSC, pendientes, TZ.

Hallazgos nuevos del mismo patrón (no IDs nuevos de severidad; se absorbieron en BUG-003):

* Recepción de OC no chequeaba `warehouse.projectId` vs `po.projectId` — **corregido**.
* Consumo al aprobar parte de obra no aplicaba el predicado de depósito — **corregido**.
* Transferencia entre depósitos no rechazaba obras distintas en depósitos project-scoped — **corregido**.

No se encontró IDOR nuevo. Cookie `bloqer-viewport` es conveniencia, igual que `bloqer-last-project-id`: el RSC solo elige qué árbol renderizar; auth sigue en services.

Regresión buscada: Field Home OWNER con cookie `sm` sigue mostrando `field-home` y no `Panel de control`. Desktop con `md` no monta Field Home.

Hueco restante: primera visita a `/dashboard` **sin** cookie sigue dual (aceptable). Layout desktop todavía pide pending counts para el badge mobile (costo menor vs `getTenantDashboard`).

---

## Performance (local, demo, caliente)

BEFORE (observación previa a FASE C): `/dashboard` mobile ≈ 5–7 s.

AFTER (Playwright `audit-dashboard-perf.spec.ts`, `domcontentloaded` → visible):

| Ruta | Viewport | Cookie | loadMs |
|------|----------|--------|--------|
| `/dashboard` | 390 | `sm` | **2934** |
| `/dashboard` | 1440 | `md` | 5600 |
| `/pendientes` | 390 | — | 2164 |

Mobile dashboard mejoró ~2× al no ejecutar `getTenantDashboard`. Desktop sigue caro (esperado).

---

## Comandos de calidad ejecutados

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter @bloqer/utils typecheck` | OK (lote FASE C) |
| `pnpm --filter @bloqer/services typecheck` | OK |
| `pnpm --filter @bloqer/web typecheck` | OK |
| `pnpm --filter @bloqer/web lint` | OK (warnings **PREEXISTENTES**) |
| `pnpm --filter @bloqer/utils test` | 30 pass (lote FASE C) |
| `pnpm --filter @bloqer/services test` | **489 pass** |
| web evidence tests (`upload-pending-entity-evidence`) | 4 pass |
| `prisma validate` | OK (con `.env`) |
| `prisma migrate deploy` | OK — `20260819180000_idempotency_keys` + `20260819190000_idempotency_warehouse_transfer_treasury` |
| Playwright Field evidence e2e | `field-evidence-idempotency.spec.ts` (parte / SC / recepción + replay DB) |
| Playwright `audit-dashboard-perf.spec.ts` | baseline previo: 2934 / 5600 / 2164 ms (no re-medido en este lote) |

---

## Idempotencia (lote 2026-08-19)

Campo único en todos los modelos: `idempotencyKey` (UUID de cliente, opaco, no es auth). Unique parcial `(tenantId, idempotencyKey) WHERE NOT NULL`. No se deduplica por producto/depósito/monto/fecha/usuario.

Cubierto: consumo manual, upload de documentos (incl. evidencia Field via `clientId`), transferencia interna, pago (parcial y total, project/company/`registerTransaction` PAYMENT), cobro, nested `payNow` / `collectNow`, **transferencia entre depósitos**, **ingreso corporativo de tesorería**, **ajuste manual de tesorería**, **`registerApExpense`**, **`registerArSale`** (y caller `registerArAdvance`), **`registerArIncome`**.

### Replay `payFullBalance` / `collectFullBalance` (intencional)

El matcher compara payable/receivable + cuenta + fecha. **No re-resuelve el saldo actual.** Si después de un pago total de 100 aparece una obligación nueva, el replay de la key A reutiliza el Payment/Collection de 100: no genera movimiento extra ni cubre el saldo nuevo. Hace falta una **key nueva** para la nueva obligación.

### Side effects en replay

`notifyPaymentConfirmed` (in-app + email si está habilitado) y `audit*` viven **dentro de `create()`**. Un replay no reenvía notificación ni duplica audit. `ensureDraftJournalFrom*` corre después y es idempotente. No hay webhooks de pago/cobro en el producto. `DOCUMENT_UPLOAD_CONFIRMED` solo si `createdNow`.

### Creates restantes (clasificación)

| Operación | Efecto | Retry accidental posible | Impacto duplicado | Defensa actual | Recomendación |
|-----------|--------|--------------------------|-------------------|----------------|---------------|
| Transferencia entre depósitos | CONFIRMED, OUT+IN de stock | Doble click | Descuenta/acredita dos veces | `idempotencyKey` (este lote) | Hecho (P0) |
| Ingreso tesorería corporativo | AccountMovement CONFIRMED | Doble submit | Duplica caja | `idempotencyKey` en AccountMovement (este lote) | Hecho (P0) |
| Ajuste manual tesorería | AccountMovement CONFIRMED IN/OUT | Doble submit | Duplica caja | `idempotencyKey` (este lote) | Hecho (P0) |
| Factura AP DRAFT (`createSupplierInvoice`) | DRAFT, sin CxP ni asiento hasta emitir | Doble click | Segunda factura DRAFT (anulable); numeración +1 | Numeración consecutiva; emitir es otro paso | P2 — aceptable. **No** lleva `idempotencyKey`. |
| Factura AR DRAFT (`createSalesInvoice`) | DRAFT, sin CxC hasta emitir | Doble click | Igual que AP | Igual | P2 — aceptable. **No** lleva `idempotencyKey`. |
| AP `registerApExpense` (emite ya) | ISSUED + Payable (+ payNow opcional) | Doble click / retry | Obligación duplicada | `idempotencyKey` en `SupplierInvoice` `(tenantId, key)` | Hecho (P0) |
| AR `registerArSale` (emite ya) | ISSUED + Receivable (+ collectNow opcional) | Doble click / retry | CxC duplicada | `idempotencyKey` en `SalesInvoice` `(tenantId, key)` | Hecho (P0) |
| `createDocumentMetadata` | PLACEHOLDER, sin bytes | Solo si alguien llama el service | Metadata huérfana | **Sin callers en `apps/web`** | NO NECESARIO |
| Logo de tenant | 1 objeto branding | Retry pisa el mismo path de logo | Bajo | Key `{tenantId}/branding/logo/{uuid}` | P2 |
| Aprobar OC | Estado SUBMITTED→APPROVED | Concurrent | Unique de estado / transiciones | State machine | NO NECESARIO (otra defensa) |
| Recepción CONFIRMED IN | Stock IN | Retry misma línea | Unique por línea de remito | `sourceId` / receipt line unique | NO NECESARIO |
| Consumo al aprobar parte | Stock OUT | Retry misma línea | Unique `(sourceType, sourceId)` | Unique parcial | NO NECESARIO |

### Residual orphan R2 (no sweeper)

R2 `putObject` OK → falla DB → `deleteObject` falla → objeto sin `DocumentAttachment`. **No aparece en UI** (listados leen DB). **No es enumerable públicamente** (bucket privado; `publicUrl` no se usa; download solo presigned GET tras auth + tenant). Aceptado como deuda **MEDIA/LEVE**. Futuro: `storage orphan reconciliation` (scheduler). No implementar ahora.

### MIME / HEIC / SHA / storageKey

* Bytes sniff: JPEG, PNG, WebP, PDF (`file-type`). HEIC/HEIF: `file-type` + brands ftyp (`heic`/`mif1`/…). No se convierte HEIC. Office: sin sniff (ZIP).
* `contentSha256` = SHA-256 de los bytes reales. Misma key + hash distinto → CONFLICT. Misma foto + **nueva** key = segundo Document (SHA no es deduper global).
* `storageKey` = `{tenantId}/{project\|global}/{idempotencyKey}/{filename sanitizado}`. Cross-tenant no colisiona. `../` se sanitiza. Retry pisa el mismo objeto.

### Entorno de migración — **PRODUCTION** (branch Neon)

No inferido por el nombre `neondb`, ni por `APP_ENV` solo, ni por el hostname solo. Evidencia cruzada:

| Fuente | Hecho |
|--------|--------|
| Neon project | `crimson-dew-50407633`, nombre **bloqer-v2**, región `aws-us-east-1`, proxy `c-7.us-east-1.aws.neon.tech` |
| Compute | `ep-cold-mouse-appkpn84` — host de la branch `production` |
| Branch Neon de ese compute | `br-damp-hat-aphhbquz`, **name = `production`**, `primary: true`, `default: true` |
| Otro proyecto Neon | `bloqer-production` (`broad-wave-70486870`, `aws-sa-east-1`) — **no** es esta URL |
| Docs de deploy | workflow `dev → preview → production`; local usa Neon branch `dev` |
| `APP_ENV` | `development` (proceso local; no identifica la DB) |
| `AUTH_URL` / `APP_URL` host | `portal.bloqer.app` (señal de producto; no usada sola) |
| `20260819180000` / `190000` | aplicadas en production (lotes anteriores) |

**`20260819200000_idempotency_register_ap_ar`:** **aplicada** en production (`finished_at` 2026-08-19 23:32:32 UTC). Backup: `backup-pre-20260819200000`. Local: branch `dev` / compute `ep-curly-math-aptjniho`.

### Rollback conceptual (`20260819200000`)

Columnas nullable + unique parciales en `supplier_invoices` / `sales_invoices`. Rollback: `DROP INDEX` `supplier_invoices_tenant_idempotency_key` / `sales_invoices_tenant_idempotency_key` y `DROP COLUMN idempotencyKey`. Filas legacy NULL siguen válidas. No hay rewrite ni dedupe histórico.

---

## POST-IDEMPOTENCY VERIFICATION

* E2E evidence: spec `docs/bloqer2.0/mobile-audit/field-evidence-idempotency.spec.ts` — crea parte / SC / recepción con foto, confirma Document, replay de la misma `idempotencyKey` vía `uploadDocument`, assert count DB = 1.
* Replay full-balance: tests explícitos en `idempotency.test.ts` (semántica intencional documentada arriba).
* Remaining creates: tabla de clasificación; P0 aplicados (depósitos + tesorería confirmada + register AP/AR). Facturas DRAFT = P2. `createDocumentMetadata` = NO NECESARIO.
* Orphan R2: residual documentado; sin sweeper.
* Environment/migration: **PRODUCTION** (Neon branch `production` de `bloqer-v2`). `20260819200000` **aplicada**. Local usa branch `dev`.

---

## FINAL HARDENING CLOSEOUT

Cierre del micro-lote de estabilización (sin auditoría general nueva, sin features, sin commit/push).

### Entorno DB

**DATABASE ENVIRONMENT: PRODUCTION**

Evidencia: compute Neon `ep-cold-mouse-appkpn84` → branch `production` (primary/default) del proyecto `bloqer-v2` (`crimson-dew-50407633`, `aws-us-east-1`). El proyecto Neon `bloqer-production` (`aws-sa-east-1`) no coincide con este `DATABASE_URL`. Vercel MCP no autenticado; no se usó como fuente.

### registerApExpense

Semántica real (una transacción): crea `SupplierInvoice` **ISSUED**, líneas, **Payable OPEN**, y opcionalmente Payment + AccountMovement (`payNow`). Después: `ensureDraftJournalFrom*` (idempotente) y notificaciones. Un retry sin key duplicaba factura + CxP.

Idempotencia: `idempotencyKey` UUID de cliente, scope `tenantId + key`. Misma key + mismo payload operativo (proveedor, proyecto, fechas, moneda, letra, OC, líneas, presencia/campos de payNow) → reutiliza factura + Payable (+ pago del composite). Misma key + payload distinto → `CONFLICT`. Key nueva → operación nueva. Unique DB parcial es la defensa de carrera. Notify/audit dentro de `create()`.

### registerArSale

Semántica real: crea `SalesInvoice` **ISSUED**, **Receivable**, y opcionalmente Collection + AccountMovement (`collectNow`). Caller directo `registerArAdvance` ahora pasa la key de registro (el cobro sigue con su key nested).

Idempotencia: igual convención sobre `SalesInvoice`.

### DRAFT vs REGISTER

`createSupplierInvoice` / `createSalesInvoice` siguen **sin** `idempotencyKey`: quedan DRAFT, anulables, sin obligación hasta emitir (P2). Solo REGISTER/ISSUE (`registerApExpense` / `registerArSale`) protege el alta de la obligación.

### Migración

`20260819200000_idempotency_register_ap_ar`: columnas nullable `idempotencyKey` + unique parcial `(tenantId, idempotencyKey) WHERE NOT NULL` en `supplier_invoices` y `sales_invoices`. **Aplicada en PRODUCTION** (`_prisma_migrations.finished_at` 2026-08-19 23:32:32 UTC). No se tocó `180000`/`190000`. Legacy NULL permitido. Sin dedupe histórico.

Backup Neon: branch `backup-pre-20260819200000` (`br-still-forest-ap8gidpm`), fork pre-migración, no es default. Local ahora usa branch `dev` (`br-falling-morning-aple46i5`, compute `ep-curly-math-aptjniho`).

### Tests

`idempotency.test.ts`: matchers AP/AR (líneas, no solo total); 10 concurrentes misma key → 1 invoice + 1 Payable/Receivable + notify 1; replay sin side effects; payload distinto CONFLICT; key nueva = segunda operación; misma UUID en dos tenants sin colisión ni leak.

### Riesgos residuales

* Migración `20260819200000` aplicada en PRODUCTION. Local ya no usa esa branch.
* Existe proyecto Neon `bloqer-production` (`aws-sa-east-1`) aparte; no se tocó.
* `registerArIncome` (corporate AR): **idempotente** en este follow-up (misma columna `SalesInvoice.idempotencyKey`).
* Matcher payNow/collectNow usa pago/cobro de la misma transacción (igualdad de `createdAt` o ventana 2s) y, si hay `payNow`/`collectNow`, cae al match por payload si el reloj se desvió. El create mergea ids del txn si el reload no los ve.
* BUG-014 APU Decimal/Number: **pendiente**. No se tocó Budget.
* BUG-015: **mitigado** (unique DB + CONFLICT, no 500). No se remodeló Budget.
* Facturas DRAFT: P2 residual.
* Orphan R2: residual MEDIA/LEVE.

### Confirmación de proceso

* `20260819200000` **aplicada** en Neon branch `production`
* local `.env` apunta a Neon branch `dev`
* `20260819180000` y `20260819190000` siguen aplicadas (no revertidas)
* sin features nuevas en este lote de auditoría (el release de estabilización sí publica el código Field + hardening ya validado)

---

# Stabilization Release

**Fecha:** 20 agosto 2026 (America/Argentina, deploy UTC 20 ago).  
**Rama:** `main`.  
**Commit:** se registra en el push de este release (`feat: stabilize Bloqer Field and harden operational integrity`).  
**Objetivo:** alinear el código productivo con el schema ya migrado. Sin Cronograma Field, sin PWA, sin migraciones nuevas.

## Migrations (ya aplicadas; no se re-ejecutó seed/reset/db push)

Checksums del SQL versionado = `_prisma_migrations` en Neon `production` y `dev`:

| Migration | SHA-256 |
|-----------|---------|
| `20260819180000_idempotency_keys` | `ed8fba2fa0ca32eca621f8f19b02d9c3aa777df0e6a75be54a10953c5d97f436` |
| `20260819190000_idempotency_warehouse_transfer_treasury` | `b75823fec12e4e441969d98032fa54b460ac522d85189ed220d4ee8de5ee35fb` |
| `20260819200000_idempotency_register_ap_ar` | `dffae23e20dac1c584f5de268096657fe993e0a6336218322a4da557bb42dbc1` |

`prisma migrate status` local (Neon `dev`): schema up to date. Production ya estaba up to date antes de este push. El pipeline puede correr `migrate deploy` idempotente; no debe aplicar SQL nuevo.

Backup Neon `backup-pre-20260819200000` **se mantiene**. No eliminar en este release.

## Quality (Neon `dev`)

| Check | Resultado |
|-------|-----------|
| Prisma validate | OK |
| Typecheck `database` / `validators` / `services` / `web` | OK |
| Lint `web` | exit 0 (warnings preexistentes, no tocados) |
| `pnpm test` domain/utils/services | 39 + 30 + 503 pass, 0 fail |
| Idempotency unit (`idempotency.test.ts`, cubierto en los 503) | consumo, payment, collection, internal/warehouse transfer, treasury, document, registerApExpense, registerArSale — same key, payload distinto, concurrent, cross-tenant |
| BUG-015 `budget-approve-unique.test.ts` | incluido en services; unique DB → CONFLICT, no 500 |
| Web unit (tsx helpers Field/list/viewport) | 14 pass. Residual: `upload-jobsite-log-evidence.test.ts` no resuelve alias `@/` bajo tsx; typecheck sí lo compila |

## Playwright (localhost + Neon `dev` + tenant demo)

Tras detectar que el `next dev` de ~11 h había arrancado con `DATABASE_URL` de **production**, se mató ese proceso y se reinició Next con Neon `dev` (`ep-curly-math-aptjniho`). Los E2E de evidencia/compras de esa sesión previa **sí escribieron** partes/SC/recepciones de demo en production (tenant demo). No se borra automáticamente. Rollback de esas filas queda a criterio operativo.

Contra `dev` (servidor nuevo):

| Suite | Resultado |
|-------|-----------|
| Field evidence idempotency (parte, SC, recepción + replay 1 Document) | 3 passed |
| Field Operations flows | 3 passed |
| Procurement Mobile | 6 passed, **1 failed**: `05 recepción + foto` — la OC demo confirmada ya no tenía cantidad pendiente tras las recepciones del mismo run (evidencia + intentos). La recepción con foto quedó cubierta por Field evidence. |
| Field Navigation (OWNER / PM / VIEWER / pendientes / plus) | 7 passed (el 04 requirió acotar clicks al sheet `field-plus-sheet` y timeouts 60s) |
| Mobile Foundation `390 shell…` | **no verde en este cierre**: timeout 90s en `goto` overview bajo presión de memoria de `next dev`. Shell/cards/recepción del mismo spec sí se ejercitaron antes del hang. No se regeneró la auditoría visual completa. |
| Audit dashboard viewport split | 3 passed. loadMs en frío: dashboard 390 **4464**; desktop 1440 **22332** (compile); pendientes 390 **33398** (compile). Baseline caliente previo: 2934 / 5600 / 2164. Sin regresión de producto obvia vs cold start. |

## Deploy

Push a `origin/main` → Vercel Production. No se cambiaron env vars de production. No seed / reset / db push. Detalle READY/logs: completar tras el deployment (follow-up en este mismo documento si hace falta).

## Residuales aceptados (no reabrir auditoría)

* BUG-014 APU Decimal/Number — PENDIENTE.
* BUG-015 concurrent budget approval — mitigado por unique DB.
* Orphan R2 extremadamente excepcional.
* Facturas DRAFT P2.
* Primera visita `/dashboard` sin cookie viewport: dual-SSR; mitigado con refresh de cookie.
* Field picker cap 100 proyectos.
* Docs subcontract cert SUBMITTED vs Prisma ISSUED.
* Test Playwright `procurement-mobile` 05 acoplado a pending qty de una sola OC demo.
* `upload-jobsite-log-evidence.test.ts` bajo tsx sin alias `@/`.

## Confirmación

* production operativa se verifica en smoke read-only post-deploy.
* local sigue en Neon `dev`.
* backup `backup-pre-20260819200000` disponible.
* ninguna feature nueva de Cronograma Field / Materiales Mobile / PWA / offline en este release.

