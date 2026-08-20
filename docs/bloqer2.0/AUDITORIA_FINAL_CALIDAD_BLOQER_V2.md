# Auditoría final de calidad — Bloqer v2 (post Field v1)

> **Fase:** A — AUDITORÍA COMPLETA (sin corrección masiva).  
> **Fecha de inicio:** 2026-08-20.  
> **Alcance:** código en `main` tras CxP/CxC Field (`70e89e6` y anteriores Field).  
> **Regla:** no nuevas features; Neon `dev` para cualquier prueba mutante; preservar UI Field/responsive/iconos.  
> **IDs:** este documento continúa la serie histórica (`BUG-001`–`BUG-024` en [`AUDITORIA_TECNICA_CODIGO_BLOQER_V2.md`](./AUDITORIA_TECNICA_CODIGO_BLOQER_V2.md)). Hallazgos **nuevos** de esta pasada: `BUG-025`+. Referencias abiertas previas: `BUG-014`.

---

## Metodología

18 pasadas independientes (security → tests). Cada hallazgo se mantiene aunque luego se corrija.  
Severidades según brief (no inflar). Cookies `bloqer-viewport` / `bloqer-last-project-id` se trataron como **conveniencia**, no auth.

**Entorno verificado:** `.env` local → Neon `ep-curly-math-aptjniho` (dev). Production marker `ep-cold-mouse` no usado en seeds/E2E de esta fase.

---

## Resumen ejecutivo (post pasadas 1–18, pre-triage)

| Severidad | Detectados (nuevos + abiertos previos) | Notas |
|-----------|----------------------------------------|--------|
| CRÍTICA | 0 | No se confirmó cross-tenant explotable sin UUID ajeno + rol de escritura |
| ALTA | 5 | Contact/WBS/company scope en creates; recepción post-`RECEIVED`; write-on-view cronograma |
| MEDIA | 19 | Incluye BUG-014 + TZ + Zod + perf + recepción/parte create sin key + FAB + cookie RSC |
| LEVE | 13 | Deuda, duplicación UI Field, docs drift, residuals R2, cobrar redirect |

**Estado FASE A:** completa (incl. consolidación subagentes PASS 4/5 y 8–11). **FASE B / C:** pendientes.

---

## Índice de hallazgos nuevos

| ID | Sev | Categoría | Estado |
|----|-----|-----------|--------|
| BUG-025 | ALTA | Security / Tenant | CONFIRMADO |
| BUG-026 | ALTA | Security / Tenant | CONFIRMADO |
| BUG-027 | ALTA | Security / Tenant | CONFIRMADO |
| BUG-028 | ALTA | Security / WBS | CONFIRMADO |
| BUG-029 | ALTA | Workflow / Compras | CONFIRMADO |
| BUG-030 | MEDIA | Security / Project scope | CONFIRMADO |
| BUG-031 | MEDIA | Security / Project scope | CONFIRMADO |
| BUG-032 | MEDIA | Security / Project scope | CONFIRMADO |
| BUG-033 | MEDIA | RBAC / Schedule | CONFIRMADO |
| BUG-034 | MEDIA | Concurrency / Receipt | CONFIRMADO |
| BUG-035 | MEDIA | Concurrency / Invoice issue | CONFIRMADO |
| BUG-036 | MEDIA | Concurrency / Schedule | CONFIRMADO |
| BUG-037 | MEDIA | Stock / Jobsite | CONFIRMADO |
| BUG-038 | MEDIA | Finance / Materials float | CONFIRMADO |
| BUG-039 | MEDIA | Dates / TZ | CONFIRMADO |
| BUG-040 | MEDIA | Validation / Zod | CONFIRMADO |
| BUG-041 | MEDIA | Documents / MIME | CONFIRMADO |
| BUG-042 | MEDIA | Performance / Libro | CONFIRMADO |
| BUG-043 | MEDIA | Performance / SC-OC | CONFIRMADO |
| BUG-044 | LEVE | Documents / R2 orphan | CONFIRMADO |
| BUG-045 | LEVE | Workflow / PR rewind | CONFIRMADO |
| BUG-046 | LEVE | Dead code | CONFIRMADO |
| BUG-047 | LEVE | Duplication / Field UI | CONFIRMADO |
| BUG-048 | LEVE | Docs / RBAC matrix drift | CONFIRMADO |
| BUG-049 | LEVE | Validation / money optional | CONFIRMADO |
| BUG-050 | LEVE | Materials / APU match | CONFIRMADO |
| BUG-051 | LEVE | HEIC preview UX | CONFIRMADO |
| BUG-052 | LEVE | Finance / Number() sort | CONFIRMADO |
| BUG-053 | MEDIA | Concurrency / Receipt create | CONFIRMADO |
| BUG-054 | MEDIA | Concurrency / JobsiteLog create | CONFIRMADO |
| BUG-055 | MEDIA | Field / FAB overlap | CONFIRMADO |
| BUG-056 | MEDIA | RSC / Dashboard dual tree | CONFIRMADO |
| BUG-057 | MEDIA | RSC / Stale viewport cookie | CONFIRMADO |
| BUG-058 | LEVE | Field / Cobrar redirect | CONFIRMADO |
| BUG-014 | MEDIA | Budget / Money | CONFIRMADO — LOTE SEPARADO |

---

# PASS 1 — SECURITY / MULTI-TENANT / IDOR

### BUG-025 — ALTA — Security / Tenant

- **Archivo:** `packages/services/src/procurement/purchase-order.service.ts` (`createPurchaseOrder`); mismo patrón en `supplier-invoice.service.ts` (`createSupplierInvoice`), `procurement-quote.service.ts` (`createProcurementQuote`).
- **Problema:** validación de proveedor vía `contactRole.findUnique({ contactId_role })` **sin** exigir `contactRole.tenantId === ctx.tenantId` ni `Contact.tenantId`.
- **Causa:** se confía en la unicidad global `(contactId, role)` sin aislar tenant.
- **Reproducción:** con UUID de contacto SUPPLIER de otro tenant (si se conoce), crear OC en el tenant atacante.
- **Impacto:** FK hacia contacto ajeno; contaminación de datos / reportes / directorio.
- **Probabilidad:** baja (UUID no enumerable) pero patrón sistemático.
- **Usuario/rol:** cualquier rol con `EDIT` PO / AP / quotes.
- **Evidencia:** contraste con `register-ar-income.service.ts` que sí valida `contact.tenantId` + `contactRole.tenantId`.
- **Fix propuesto:** helper `assertContactRoleInTenant(contactId, role, ctx)` y usarlo en todos los creates.
- **Riesgo del fix:** bajo.
- **Test:** crear con contactId de otro tenant → FORBIDDEN/NOT_FOUND.
- **Estado:** CONFIRMADO

### BUG-026 — ALTA — Security / Tenant

- **Archivo:** `packages/services/src/subcontracts/subcontract.service.ts` — `createSubcontract`
- **Problema:** (1) `subcontractorContactId` sin check de tenant en rol; (2) `companyId = input.companyId ?? resolve…` acepta `companyId` del cliente sin `assertCompanyMatchesProject`.
- **Impacto:** company de otro tenant/proyecto o contacto ajeno en subcontrato.
- **Fix propuesto:** ignorar `input.companyId` o validar; mismo assert de contacto.
- **Estado:** CONFIRMADO

### BUG-027 — ALTA — Security / Tenant

- **Archivo:** `packages/services/src/ar/sales-invoice.service.ts` — `createSalesInvoice`
- **Problema:** persiste `clientContactId` sin assert de contacto/rol en tenant. `resolveSuggestedArInvoiceLetter` busca el contacto con `tenantId` y si no existe **devuelve null** (letra) pero **no aborta** el create.
- **Impacto:** factura de venta apuntando a contacto de otro tenant (FK por id).
- **Fix propuesto:** fallar si contacto ausente/ajeno (igual que `registerArSale`).
- **Estado:** CONFIRMADO

### BUG-028 — ALTA — Security / WBS

- **Archivo:** `packages/services/src/subcontracts/subcontract.service.ts` — create/update lines
- **Problema:** `wbsNode.findUnique({ id })` solo valida existencia + tipo `ITEM`. Procurement usa `assertWbsLineForProject` (tenant + project).
- **Impacto:** atribuir líneas a EDT de otro proyecto/tenant.
- **Fix propuesto:** `assertWbsLineForProject(wbsNodeId, projectId, tenantId)`.
- **Estado:** CONFIRMADO

### BUG-030 — MEDIA — Security / Project scope

- **Archivo:** `apps/web/app/(app)/proyectos/[id]/documentos/[documentId]/page.tsx`
- **Problema:** `getDocumentById` sin comprobar `doc.projectId === id`. Actions de archive/delete reciben `projectId` de la URL para revalidate, no como scope de entidad.
- **Impacto:** hopping de workspace (mismo tenant): ver/mutar doc de obra B bajo shell de obra A.
- **Estado:** CONFIRMADO

### BUG-031 — MEDIA — Security / Project scope

- **Archivos:** pages `editar` / `recepciones/nueva` de certificaciones, subcontratos, OC, libro-obra.
- **Problema:** getters sin `projectScopeId`; páginas sin `entity.projectId !== routeId → notFound()` (los detail sí lo tienen en varios módulos).
- **Estado:** CONFIRMADO

### BUG-032 — MEDIA — Security / Project scope

- **Archivos:** `certificaciones/actions.ts` lifecycle; `solicitudes-compra/actions.ts` submit/cancel; `createSalesInvoiceAction` (proyecto).
- **Problema:** `projectId` de ruta usado sobre todo para `revalidatePath`; el service valida tenant, no “entidad ∈ este proyecto”. Contraste: pagos/cobranzas pasan `projectScopeId`.
- **Estado:** CONFIRMADO

### False positives (PASS 1)

- Download documentos: tenant + `canViewDocumentByLink` OK.
- Cookies viewport / last-project: no auth.
- `createPayment` / `createCollection` con `projectScopeId` desde actions de proyecto: OK.
- Reportes / field projects API: auth + tenant OK.

---

# PASS 2 — RBAC / MODULE GATES

### BUG-033 — MEDIA — RBAC / Schedule

- **Archivo:** `schedule.service.ts` `ensureScheduleForProject`; callers `getProjectScheduleWorkspace`, `getProjectScheduleFieldWorkspace`
- **Problema:** gate de **VIEW**; si no hay schedule, **crea** fila (`schedule.create`) tras `assertProjectScheduleMutation` (solo planning lock, **sin** `canEditScheduleArea`). Workspace también puede `schedule.update({ baselineBudgetId })` en lectura.
- **Impacto:** VIEWER / solo-lectura puede materializar Schedule + baseline al abrir cronograma.
- **Fix propuesto:** create/update solo con `canEditScheduleArea`; en VIEW devolver vacío o “sin cronograma”.
- **Estado:** CONFIRMADO

### Cadena OK (muestra)

| Operación | UI | Service | VIEWER |
|-----------|----|---------|--------|
| Aprobar parte | `canSuperviseJobsiteLog` | igual | bloqueado |
| Submit SC | `canEditPurchaseRequests` | igual | bloqueado |
| Aprobar OC | `canApprovePurchaseOrders` | igual | bloqueado |
| Recepción | `canEditPurchaseReceipts` | igual | bloqueado |
| Pago | `canRegisterApPayment` | igual | bloqueado |
| Cobro | `canMutateArForScope` | igual | bloqueado |
| Transición ítem cronograma | `canEdit` | `canEditScheduleArea` | bloqueado |

### BUG-048 — LEVE — Docs / RBAC matrix drift

- Matrix documental vs helpers reales (`canSuperviseJobsiteLog`, etc.) desfasada. No es bypass.
- **Estado:** CONFIRMADO

---

# PASS 3 — WORKFLOWS / STATE MACHINES

### BUG-029 — ALTA — Workflow / Compras

- **Archivo:** `procurement-constants.ts` `PO_RECEIPT_ELIGIBLE_STATUSES` incluye `RECEIVED`; UI `recepciones/nueva` solo `CONFIRMED` \| `PARTIALLY_RECEIVED`.
- **Problema:** backend más permisivo: se puede confirmar recepción adicional sobre OC ya `RECEIVED` (si tolerancia > 0).
- **Impacto:** over-receipt post-cierre vía action directa.
- **Fix propuesto:** alinear constante con UI **o** documentar BR y endurecer UI; default tolerancia 0 mitiga.
- **Estado:** CONFIRMADO

### BUG-045 — LEVE — Workflow / PR rewind

- Cancel OC puede rebobinar PR `COMPLETED` → `SUBMITTED` (`purchase-request-to-po.service.ts`). No está en diagrama SM §7b.
- **Estado:** CONFIRMADO

JobsiteLog / ScheduleItem ALLOWED / Payment-Collection create-as-CONFIRMED / cancel CxP tras receipt: alineados en lo muestreado.

---

# PASS 4 — CONCURRENCIA / IDEMPOTENCIA

### Patrón bueno (no inventar variantes)

`withIdempotentCreate` + key: Payment, Collection, registerApExpense, registerArSale/Income, stock consumption, warehouse transfer, internal transfer, corporate inflow, manual adjustment, document upload.

### BUG-034 — MEDIA — Concurrency / Receipt

- `confirmPurchaseReceipt`: claim DRAFT→CONFIRMED + stock **sin** `idempotencyKey` / replay estable.
- Doble click mitigado por `updateMany` de status; retry cliente no reutiliza entidad.
- **Estado:** CONFIRMADO

### BUG-053 — MEDIA — Concurrency / Receipt create

- **Archivo:** `purchase-receipt.service.ts` — `createPurchaseReceipt`
- **Problema:** create DRAFT sin `idempotencyKey`; doble tap Field puede generar múltiples recepciones borrador de la misma OC.
- **Confirm** sigue protegido por CAS + uniques de stock por línea.
- **Estado:** CONFIRMADO

### BUG-054 — MEDIA — Concurrency / JobsiteLog create

- **Archivo:** `jobsite-log.service.ts` — `createJobsiteLog`
- **Problema:** create/submit sin key; approve sí es idempotente (status + `sourceId` stock).
- **Estado:** CONFIRMADO

### BUG-035 — MEDIA — Concurrency / Invoice issue

- `issueSupplierInvoice` / `issueSalesInvoice` / `approveSubcontractCertification`: mint Payable/Receivable/SupplierInvoice con claim optimista, sin key cliente.
- **Estado:** CONFIRMADO

### BUG-036 — MEDIA — Concurrency / Schedule

- `transitionScheduleItem`: `update` por id **sin** `updateMany` condicionado a status actual → race concurrente.
- **Estado:** CONFIRMADO

Aprobación parte: claim + skip por `sourceId` en stock — Low residual OK.

---

# PASS 5 — ATOMICIDAD

| Flujo | Veredicto |
|-------|-----------|
| Factura AP → Payable | `$transaction` OK |
| Factura AR → Receivable | `$transaction` OK |
| Payment / Collection → movement | misma txn OK |
| Transfer OUT+IN | `createMany` misma txn OK |
| Receipt → stock | misma txn OK |
| Journal draft post-pago | post-commit (D-061) — intencional |

Sin BUG nuevo CRÍTICO/ALTO en atomicidad de los cuatro targets.

---

# PASS 6 — STOCK / MATERIALES / COMPRAS

### BUG-037 — MEDIA — Stock / Jobsite

- `createJobsiteLogMaterialStockMovements` pasa `productCompanyId: null` → saltea chequeo producto↔warehouse company (el consumo manual sí pasa `product.companyId`).
- **Estado:** CONFIRMADO

### BUG-038 — MEDIA — Finance / Materials float

- `material-commitment.ts` / board: `Number()` sobre qty/coeff/needCost → shortfall Field hereda drift tipo BUG-014 (display/prefill, no ledger tesorería).
- **Estado:** CONFIRMADO

### BUG-050 — LEVE — Materials / APU match

- `applyOrderedToApuMap` matchea `costAnalysisLineId` sin exigir `productId` → shortfall puede bajar con producto distinto en misma línea APU.
- **Estado:** CONFIRMADO

Warehouse project/tenant en recepción/consumo: gated (post BUG-003). Over-receipt default 0%.

---

# PASS 7 — FINANZAS OPERATIVAS

### BUG-014 — MEDIA — Budget / Money (PREVIO, sigue abierto)

- `cost-analysis.service.ts`: `Number(line.totalCost…)` en recompute APU.
- **Estado:** CONFIRMADO — **LOTE SEPARADO** (no mezclar con TZ/idempotency).

Overpayment/overcollection: CONFLICT en services. `payFullBalance` / `collectFullBalance` server-side [D-053]. Currency vs cuenta: assert. CxP/CxC Field no duplican motor financiero.

### BUG-052 — LEVE — Finance / Number() sort

- Dashboards / WBS metrics / alerts usan `parseFloat`/`Number` para **ordenar o % display**, no para persistir pagos.
- **Estado:** CONFIRMADO (aceptar o endurecer en lote APU)

---

# PASS 8 — DOCUMENTOS / UPLOADS

MIME sniff imágenes/PDF/HEIC: OK. Linked entity assert: OK. Download tenant: OK.

### BUG-041 — MEDIA — Documents / MIME

- Office/CSV/TXT en `SKIP_BYTE_SNIFF` — se confía en MIME declarado.
- **Estado:** CONFIRMADO

### BUG-044 — LEVE — Documents / R2 orphan

- Fallo post-`putObject` → delete best-effort; sin sweeper HTTP.
- **Estado:** CONFIRMADO

### BUG-046 — LEVE — Dead code

- `createDocumentMetadata` sin callers web; schema MIME laxo.
- **Estado:** CONFIRMADO

### BUG-051 — LEVE — HEIC preview UX

- Preview `<img>` falla en algunos browsers; upload OK.
- **Estado:** CONFIRMADO

---

# PASS 9 — FIELD / MOBILE

Smoke reciente (lotes Field) verde en Playwright. Split lg correcto en cronograma/materiales/CxP/CxC cuando la cookie coincide.

### BUG-055 — MEDIA — Field / FAB overlap

- **Archivos:** `jobsite-log-mobile-fab.tsx` (`bottom-4 z-40`) + `field-bottom-nav.tsx` (`z-40`)
- **Problema:** FAB del libro de obra solapa la bottom nav (mismo z-index / banda inferior).
- **Estado:** CONFIRMADO

### BUG-058 — LEVE — Field / Cobrar redirect

- `/finanzas/.../pagar` redirige desktop a detail `?pagar=1`; `/cobrar` no — desktop recibe página sin `fieldMode` confirm step.
- **Estado:** CONFIRMADO

Residuales: BUG-042 (picklists libro); dashboard en 768 usa umbral `md` (no Field home) — ver BUG-056.

---

# PASS 10 — DESKTOP REGRESSION

Código: split Field cuando cookie ≠ `lg`; desktop conserva aging/tablas.

### BUG-057 — MEDIA — RSC / Stale viewport cookie

- Cookie `bloqer-viewport=lg` en viewport 768 → RSC corre path desktop (Gantt/aging) hasta `ViewportHintSync` + `refresh`.
- Loading skeleton cronograma usa CSS `lg:` (puede no coincidir con cookie).
- **Estado:** CONFIRMADO

---

# PASS 11 — NEXT.JS / RSC / REACT

### BUG-056 — MEDIA — RSC / Dashboard dual tree

- Cookie ausente/inválida: `showFieldHome` y `showDesktop` ambos true → doble fetch RSC (Field home + desktop KPIs).
- `useListViewMode` SSR asume `isMdUp: true` → flash de tabla en mobile (OC/recepciones).
- SC/libro: tabla desktop SSR + `hidden md:block` (payload extra).
- **Estado:** CONFIRMADO

`ViewportHintSync` cleanup OK; Gantt `useHasMounted` OK.

---

# PASS 12 — PERFORMANCE

### BUG-042 — MEDIA — Performance / Libro

- `libro-obra/page.tsx` siempre `Promise.all` picklists + WBS progress aunque solo se liste (sin early-exit Field).
- **Estado:** CONFIRMADO

### BUG-043 — MEDIA — Performance / SC-OC

- `listProcurementWbsOptions`: loop `await getWbsBudgetReference` → N+1 al cargar formularios SC/OC.
- **Estado:** CONFIRMADO

CxP/CxC Field: skip aging — OK (`data-query-ms` ~843–1272 / ~883). Cronograma/Materiales Field: paths livianos OK.

---

# PASS 13 — VALIDATION

### BUG-040 — MEDIA — Validation / Zod

- `qtyString` / `unitPriceString` / `moneyAmountString` permiten negativos (`LOOSE_DECIMAL`). Líneas de factura AP/AR sin refine `>= 0`; issue solo exige total > 0.
- **Estado:** CONFIRMADO

### BUG-049 — LEVE — Validation / money optional

- Payment/collection Zod puede aceptar `-1`; service rechaza `<= 0`.
- **Estado:** CONFIRMADO

`seed-company-id` laxo: **revertido** (OK). UUIDs optional en FKs: legítimos.

---

# PASS 14 — FECHAS / TIMEZONE

### BUG-039 — MEDIA — Dates / TZ

- Aging + Field CxP/CxC: “hoy” = **product TZ** (`America/Argentina/Buenos_Aires`) vía `productCalendarDateUtc` / `toIsoDateInTimeZone`.
- Field Home / materiales semana: mismos helpers.
- **Estado:** CORREGIDO (2026-08-20)

`new Date("YYYY-MM-DD")` con `T00:00:00.000Z` en tesorería/accounting: alineado a `@db.Date` UTC — no bug local-midnight clásico.

---

# PASS 15 — ERROR HANDLING

- Actions tipifican `ServiceError` → mensaje; else genérico — patrón dominante OK.
- Best-effort vacíos en R2/notify: intencionales.
- Sin empty `catch {}` de seguridad encontrado en services mutadores.

---

# PASS 16 — DEAD CODE / DUPLICATION

### BUG-047 — LEVE — Duplication / Field UI

- Cards/detail Field AP vs AR casi espejo (aceptable post-extract `obligation-field`).
- **Estado:** CONFIRMADO (no eliminar sin abstracción clara; brief pide no framework)

`obligation-field` ya extraído. No `console.log` ruidoso en `apps/web`. Scripts one-off: no encontrados en esta pasada.

---

# PASS 17 — CSS / DESIGN

Sin redesign. No se revirtió iconos/CSS/Pendientes.  
Sin hallazgo nuevo de z-index/bottom-nav en código (regresión visual → FASE C smoke).

---

# PASS 18 — TEST QUALITY

Cubierto reciente: idempotency collections/payments, Field helpers, finance D-056, Playwright Field.

**Huecos de riesgo (tests a agregar en FASE C):**

| Riesgo | Test faltante típico |
|--------|----------------------|
| BUG-025–028 | cross-tenant contact / WBS / companyId |
| BUG-029 | receipt on RECEIVED → CONFLICT |
| BUG-033 | VIEWER ensureSchedule no crea |
| BUG-034–036 | concurrent confirm / transition |
| BUG-037 | jobsite stock company mismatch |
| BUG-040 | negative invoice line rejected |

---

## Hallazgos previos aún relevantes

| ID | Estado actual |
|----|---------------|
| BUG-014 | LOTE SEPARADO — APU `Number()` |
| BUG-015 | Mitigado unique DB |
| Orphan R2 | Absorbido como BUG-044 |
| Dual SSR dashboard | Mitigado cookie |

---

## Triage preliminar (FASE B — borrador; no ejecutado)

### Corregibles sin decisión de producto

1. BUG-025, 026, 027, 028 — asserts tenant/contact/WBS/company  
2. BUG-030, 031, 032 — project scope en pages/actions  
3. BUG-033 — no write on VIEW schedule  
4. BUG-029 — alinear elegibilidad recepción  
5. BUG-036 — `updateMany` status-conditioned  
6. BUG-037 — pasar `product.companyId`  
7. BUG-040 / 049 — Zod non-negative  
8. BUG-042 / 043 — lazy load / batch WBS (perf)

### Requieren decisión (histórico FASE A — resuelto 2026-08-20 salvo 014)

| ID | Decisión |
|----|----------|
| BUG-014 | Lote separado Decimal APU (pendiente) |
| BUG-039 | CORREGIDO — product TZ |
| BUG-034 / 035 | MITIGADO — CAS confirm/issue (sin client key) |
| BUG-041 | ACEPTADO P2 — Office MIME |
| BUG-053 / 054 | CORREGIDO — idempotencyKey create |

### No migración Prisma requerida para los ALTA confirmados

Fixes son service/page/Zod. Ningún hallazgo CRÍTICO exige migration en FASE A.

---

## Confirmación FASE A

- [x] Pasadas 1–18 documentadas  
- [x] Sin features nuevas  
- [x] Neon dev como referencia de entorno local  

---

# FASE B — TRIAGE FORMAL (2026-08-20)

## Cambios de severidad

| Bug | FASE A | Final | Motivo |
|-----|--------|-------|--------|
| BUG-030 | MEDIA | **ALTA** | Rutas de proyecto sin `entity.projectId === route` permiten hop + mutación (archive) bajo shell incorrecto |
| BUG-031 | MEDIA | **ALTA** | Mismo patrón en páginas `editar` / recepción nueva |
| BUG-033 | MEDIA | **ALTA** | VIEW crea Schedule / setea baseline — mutación sin permiso de escritura |
| BUG-032 | MEDIA | MEDIA | Actions: projectId mayormente revalidate; fix con assert en documentos |
| BUG-042 | MEDIA | MEDIA → residual | Picklists necesarios para dialog create en list; no lazy sin refactor UI |
| BUG-053/054 | MEDIA | **CORREGIDO** | idempotencyKey + partial unique (migration 20260820120000) |

## Tabla final triage

| Bug | Severidad final | Evidencia | Fix | Test | Decisión/Migración |
|-----|-----------------|-----------|-----|------|-------------------|
| BUG-014 | MEDIA | cost-analysis `Number()` | — | — | **LOTE SEPARADO** (aceptado ahora) |
| BUG-025 | ALTA | PO/AP/quotes contactRole sin tenant | `assertContactRoleInTenant` global | assert-contact-role.test | — |
| BUG-026 | ALTA | subcontract company+contact | assert company + contact | same | — |
| BUG-027 | ALTA | createSalesInvoice client | assert CLIENT | same | — |
| BUG-028 | ALTA | subcontract WBS | `assertWbsLineForProject` | procurement-wbs pattern | — |
| BUG-029 | ALTA | PO_RECEIPT includes RECEIVED | remove RECEIVED | purchase-receipt-guards | — |
| BUG-030 | ALTA | doc detail hop | `doc.projectId !== id` + action assert | manual/page | — |
| BUG-031 | ALTA | edit pages hop | projectId checks | manual/page | — |
| BUG-032 | MEDIA | doc actions revalidate | assertDocumentInProject | — | — |
| BUG-033 | ALTA | ensureSchedule VIEW create | forbid_create + empty workspace | schedule-access.test | — |
| BUG-034 | MEDIA | confirm receipt | CAS `updateMany` DRAFT→CONFIRMED + FOR UPDATE | — | **MITIGADO** (sin client key) |
| BUG-035 | MEDIA | issue invoice | CAS `updateMany` DRAFT→ISSUED | — | **MITIGADO** (sin client key) |
| BUG-036 | MEDIA | schedule transition race | updateMany status CAS | — | — |
| BUG-037 | MEDIA | jobsite productCompanyId null | load product.companyId | consumption-warehouse-scope | — |
| BUG-039 | MEDIA | UTC vs ART aging | product TZ helpers | payables/receivables/obligation-date tests | **CORREGIDO** |
| BUG-040 | MEDIA | qty/price negativos Zod | refine non-neg | money-nonneg-validators | — |
| BUG-041 | MEDIA | Office skip sniff | — | — | **ACEPTADO P2** |
| BUG-042 | MEDIA | libro picklists | residual aceptado | — | deuda |
| BUG-043 | MEDIA | WBS options N+1 serial | Promise.all refs | — | — |
| BUG-049 | LEVE | payment amount neg | superRefine >0 | money-nonneg | — |
| BUG-053 | MEDIA | create receipt no key | idempotencyKey + UI hook | purchaseReceiptReplayMatches | **CORREGIDO** (migration DEV) |
| BUG-054 | MEDIA | create jobsite no key | idempotencyKey + UI hook | jobsiteLogReplayMatches | **CORREGIDO** (migration DEV) |
| BUG-055 | MEDIA | FAB/nav overlap | bottom + z-50 | — | — |
| BUG-056 | MEDIA | dashboard dual tree | showDesktop only md/lg | — | — |
| BUG-057 | MEDIA | stale cookie | residual + ViewportHintSync | — | deuda menor |
| BUG-058 | LEVE | cobrar redirect | mirror pagar + dialog | — | — |

### Totales post-triage (antes de fix)

| Severidad | Confirmados | Corregibles | Requiere decisión |
|-----------|-------------|-------------|-------------------|
| CRÍTICA | 0 | 0 | 0 |
| ALTA | 9 (025–031, 033) | 9 | 0 |
| MEDIA | ~12 | mayoría | 014, 034/035/053/054, 039, 041 |
| LEVE | resto | triviales | — |

---

# FASE C — CORRECCIONES

## Decisiones (2026-08-20)

### BUG-014 — APU Decimal → Number — LOTE SEPARADO
1. **Problema:** recompute APU usa `Number(decimal.toString())`.
2. **Decisión:** no mezclar con este lote; mini-proyecto técnico Decimal-only + tests de redondeo.
3. **Estado:** abierto / planificado.

### BUG-039 — TZ aging / Field — CORREGIDO
1. Unificado “hoy” / as-of aging y Field CxP/CxC a `America/Argentina/Buenos_Aires`.
2. `obligation-date` → `productCalendarDateUtc`; `obligationFieldTodayIso` → `toIsoDateInTimeZone`.
3. Parte de obra: fecha futura vs product calendar ISO (no `setHours` local server).

### BUG-034/035/053/054 — idempotency — selectivo CORREGIDO / MITIGADO
1. **053/054 CORREGIDO:** `idempotencyKey` en create recepción + create parte (`useIdempotencyKey` + `withIdempotentCreate` + partial unique). Migration `20260820120000` — aplicada en Neon **dev**; **REQUIERE APROBACIÓN PRODUCTION** para deploy.
2. **034 MITIGADO:** confirm recepción ya usa `FOR UPDATE` + `updateMany` DRAFT→CONFIRMED (no doble stock/obligación).
3. **035 MITIGADO:** issue factura usa `updateMany` DRAFT→ISSUED (no doble receivable). Creates ISSUED+obligación ya tenían key en register AP/AR.

### BUG-041 — MIME Office — ACEPTADO P2
1. JPEG/PNG/WebP/PDF/HEIC con sniffing real; DOCX/XLSX/CSV sin parser OOXML complejo.
2. Riesgo aceptado conscientemente; más adelante validar contenedor ZIP/OOXML de forma segura.
3. No bloquea el producto.

## Estado CORREGIDO (código)

025–033, 036, 037, 039, 040, 043, 049, 053, 054, 055, 056, 058.
034/035 mitigados por CAS (sin client key).

## Residual / deuda aceptada

014 (lote APU), 041 (Office MIME P2), 042 (picklists list), 057 (stale cookie hasta sync), 044–052 leves no triviales.

## Segunda pasada (categorías afectadas)

| Categoría | Resultado |
|-----------|-----------|
| Contact sin tenant | Patrón unificado en PO, AP, quotes, subcontract, sales invoice, registerApExpense, project client |
| WBS sin project | Subcontract alineado a `assertWbsLineForProject` |
| Receipt RECEIVED | Constante + test; UI ya alineada |
| VIEW muta | ensureSchedule + baseline gated; field/desktop empty |
| Project hop | Document detail/actions, PO/cert/subcontract/jobsite edit, recepción nueva |
| Idempotency | Sin nuevas variantes; gaps 034/053 documentados |
| Field/RSC | Dashboard dual tree cerrado; FAB; cobrar dialog |

**Nuevos hallazgos segunda pasada:** ninguno ALTA adicional.

## Migraciones

Ninguna creada. Production no tocada.

## Suites

- Prisma validate: OK (dev)
- typecheck database/validators/services/web: OK
- services tests: 610+ pass (incl. nuevos)
- domain/utils: OK
- lint web: warnings preexistentes; Link unused fix en CxC detail

## Confirmación

- Sin features nuevas
- Neon `ep-curly-math-aptjniho` (dev)
- Sin E2E mutante en production
- Desktop/mobile Field preservados (solo FAB spacing + dashboard cookie + cobrar parity)

Fin FASE B/C documentación.
