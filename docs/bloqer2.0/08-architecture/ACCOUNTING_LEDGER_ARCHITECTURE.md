# Accounting ledger architecture (Phase 11A–11D)

## Separation from Treasury

- **Treasury** (`TreasuryAccount`, `AccountMovement`, collections, payments, transfers) is **operational cash/bank** tracking: balances from signed movements, not double-entry GL.
- **Accounting ledger** (`AccountingAccount`, `JournalEntry`, `JournalEntryLine`) is **debit/credit bookkeeping** at **company** scope (`companyId` on every GL row).

Neither replaces the other in 11A–11D.

## Phase 11A scope (manual GL only)

- Chart of accounts (codes, hierarchy optional via `parentId`, `AccountType`).
- Manual journal entries (`sourceType = MANUAL`), **balanced** before save and on post.
- **Post** locks an entry (`POSTED`); **cancel** is allowed **only from `DRAFT`** (no line deletion; status `CANCELLED`). Reversal entries and posted cancellations are **Phase 11B+**.
- **Inactive accounts** cannot be used on **new or edited** journal lines (`validateAccountsAndProjects` requires `isActive: true`).
- **Posted lines on an account** block changing that account’s **`type`** or **`parentId`** (structural integrity); name/description/deactivate remain editable.

## Phase 11B (mapping rules + draft suggestions — implemented)

- **`AccountingMappingRule`** (per `tenantId` + `companyId`): `eventType` (`AccountingMappingEventType`), `name`, optional `description`, `debitAccountId` / `creditAccountId` (both active `AccountingAccount` in same company), `priority` (lower runs first), `isActive`, optional `metadata` (JSON). Index `(tenantId, companyId, eventType, isActive)`; **multiple rules** per event type are allowed — selection orders by `priority` then `id`.
- **Suggestion services** (`accounting-suggestions.service.ts`): load source document (collection, payment, treasury movement, stock consumption), require **confirmed** operational status where applicable, resolve **active** mapping rule; on **no rule** → `CONFLICT` with a clear Spanish message to configure rules. Builds a **two-line balanced** input and calls **`createJournalEntry`** → always **`DRAFT`**; sets `sourceType` / `sourceId` on the journal header when the schema supports it. **Never** auto-`POST`.
- **Not in 11B:** silent hooks inside collection/payment/treasury/stock creation flows; Argentina tax engine; AFIP / statutory reports; auto-posted entries; chart-of-accounts seeds.
- **Manual journals** remain first-class (`sourceType = MANUAL` by default on manual UI). Event types `MANUAL_CAPITAL_CONTRIBUTION` and `MANUAL_OWNER_LOAN` on rules document intent for equity/liability mapping; operational sources for those are out of scope until product wires them.
- **Deploy:** schema changes require a normal **migration** (or your team’s equivalent) before production use of mapping rules. Do not rely on `db:push` for shared/staging/prod pipelines.

## Phase 11C (explicit UI — implemented)

- **User-initiated only:** botones / formularios que llaman Server Actions (`source-draft-actions.ts`) → mismos servicios `suggestJournalFrom*` de 11B. **No** se generan asientos dentro de `createCollection`, `confirmPayment`, etc.
- **Siempre `DRAFT`:** `createJournalEntry` únicamente; **nunca** `postJournalEntry` desde estas acciones. El usuario postea manualmente desde `/contabilidad/asientos/[id]`.
- **Deduplicación:** si ya existe un `JournalEntry` para el mismo `tenantId`, `companyId`, `sourceType`, `sourceId` con `status !== CANCELLED`, el servicio **devuelve ese asiento** (no crea duplicado) y la UI redirige al borrador/posteado existente.
- **Superficies:** detalle cobranza confirmada; detalle pago confirmado; reporte **Movimientos** tesorería (filas elegibles: ingreso/egreso/transferencias según servicio); lista **Movimientos de stock** (solo `OUT` + `CONSUMPTION` confirmado con costo &gt; 0). Requiere **`EDIT ACCOUNTING`** además del acceso al módulo operativo correspondiente.
- **Alcance empresa (reglas):** mutación de reglas valida contexto `companyId` opcional en payload para usuarios sin `ctx.companyId` fijo.

## Phase 11D (read-only source traceability — implemented)

- **`getJournalEntrySourceLink`** (`journal-entry-source-link.service.ts`): dado `sourceType`, `sourceId` y `companyId` del asiento, carga el documento operativo en Prisma (solo lectura), valida **misma empresa** donde aplica, y devuelve `kindLabel`, `detail`, `href` opcional, `noAccessHint` en español si el documento existe pero el rol no alcanza el destino.
- **UI:** `/contabilidad/asientos/[journalEntryId]` muestra el panel **Documento origen** cuando hay `sourceId` y el tipo no es `MANUAL`. **No** muta documentos operativos; **no** crea asientos; **no** postea.
- **Enlaces soportados** (alineados a `JournalEntrySourceType` en schema): `COLLECTION`, `PAYMENT`, `TREASURY_INFLOW`, `TREASURY_OUTFLOW`, `ADJUSTMENT` (movimiento tesorería), `INTERNAL_TRANSFER`, `STOCK_MOVEMENT`, `SALES_INVOICE`, `SUPPLIER_INVOICE`; gates: `canViewArProjectArea` / `canViewApProjectArea` / `VIEW TREASURY` / `VIEW INVENTORY` según destino. Requiere **`VIEW ACCOUNTING`** (re-chequeo defensivo en el servicio).
- **Sin schema nuevo** en 11D.

## Phase 11E (implemented — automation soft drafts) — [D-061]

- Argentine CoA template (~40 accounts + default mapping rules), idempotent per company by account `code` (re-apply skips existing).
- **`ensureDraftJournal*`** after successful operational create (Collection, Payment, SalesInvoice issue, SupplierInvoice issue, InternalTransfer, corporate treasury inflow / MANUAL_ADJUSTMENT). Always `DRAFT`. Soft-fail (module off / no rule / errors → `journal_entry.auto_draft_skipped`). Does **not** require `EDIT ACCOUNTING`.
- **Never** auto-`POST`.
- Anti-double-count: skip treasury GL when `AccountMovement.sourceType ∈ {COLLECTION, PAYMENT, OPENING_BALANCE}`.
- Accrual events `SALES_INVOICE_ISSUED` / `SUPPLIER_INVOICE_ISSUED` on **`totalAmount`**.
- Cancel sync: cancel linked DRAFT; block operational cancel if POSTED without reverse.
- Partial unique index: one non-cancelled journal per `(tenantId, companyId, sourceType, sourceId)`.
- `reversePostedJournalEntry` (counter-entry + `reversesEntryId`); trial balance; running balance on account ledger.
- Stock consumption auto-DRAFT **deferred** (no unit cost on create yet).

## Phase 11F (implemented — managerial reports & exports) — [D-062]

- On-the-fly reports from **`POSTED`** lines only: trial balance (natural saldo), journal book, account ledger (date range + natural running balance), statement of financial position (`asOfDate` + synthetic YTD result equity bridge), income statement (period).
- Multi-currency: **per-currency blocks**, no FX consolidation.
- Exports: CSV/PDF (+ XLSX for main reports) via `/api/reports/contabilidad/*`.
- UI: `/contabilidad/libro-diario`, `sumas-y-saldos`, `situacion-patrimonial`, `estado-resultados`; account mayor with date filters.
- **Not** official RT 54 / AFIP / inflation statements.

## Phase 11E+ review hardening — [D-063]

- Sourced DRAFT (`sourceType !== MANUAL` + `sourceId`): lock debit/credit/currency and line count on `updateJournalEntry`; allow header metadata + account remapping.
- Soft in-app `ACCOUNTING_DRAFTS_PENDING` to `EDIT ACCOUNTING` audience with **24h dedupe** (no email).

## Phase 11C+ / L remaining (not implemented)

- Automatic **POST** without human review.
- GL period close, AFIP / tax multi-line engine, bank reconciliation as GL, FX revaluation.

## Balancing rules (enforced in `journal-entry.service.ts`)

1. At least **two** lines per entry.
2. Each line: **either** debit **or** credit **> 0**, not both, not both zero.
3. For each **currency** appearing on lines, **sum(debit) = sum(credit)** (multi-currency in one entry is allowed; each currency bucket balances independently). **FX revaluation** is out of scope for 11A.

## Multi-currency (11A)

- Lines carry their own `currency` string; balancing is **per currency**, not converted.
- No implicit exchange rates or revaluation in services or UI in 11A.

## Ledger / mayor

- **`getAccountLedger`** includes **`POSTED`** journal lines only (draft/cancelled excluded). Optional `dateFrom`/`dateTo` on `entryDate`.
- Rows ordered by `(journalEntry.entryDate, journalEntry.id, line.id)`.
- **Running balance (11F):** natural balance by `AccountType` — ASSET/EXPENSE debit-normal; LIABILITY/EQUITY/INCOME credit-normal ([D-062]).

## Permissions

- Module: **`ACCOUNTING`** (`can(VIEW | EDIT | APPROVE, ACCOUNTING)`).
- **No** `VIEW PROJECTS` shortcut for global accounting UI; company scope uses `ServiceContext.companyId` or explicit `?empresa=` (validated UUID) when membership has no company filter.

## Project scope on lines (11A)

- Optional `projectId` on header or line must reference a `Project` in the same `tenantId`.
- If `project.companyId` is set, it must equal the journal’s **`companyId`**; `companyId` null on project allows use across companies of the tenant (legacy / shared projects).

## Data model (Prisma)

See `packages/database/prisma/schema.prisma`: enums `AccountType`, `JournalEntryStatus`, `JournalEntrySourceType`, `AccountingMappingEventType`; models `AccountingAccount`, `JournalEntry`, `JournalEntryLine`, **`AccountingMappingRule`**.

The chart is **flexible by design** (any codes/names under the five `AccountType` values). No seed accounts in 11A/11B; tenants can model later, for example: aportes irrevocables / patrimonio neto, capital social, préstamos de socios, retiros, IVA crédito/débito fiscal, retenciones/percepciones, bancos/caja, clientes/proveedores — as **manual** accounts and journals, optionally complemented by **mapping rules** in 11B for operational events.

## Argentina-oriented flexibility (11A)

- Chart of accounts is **fully editable** (subject to posted-line restrictions on `type` / `parentId`).
- **IVA, retenciones, percepciones:** no hardcoded tax logic, rates, or AFIP-specific fields in 11A; expect dedicated tax / withholding subledgers or dimensions in a later phase.
- **Aportes de socios** may be recorded as **equity** or **liability** depending on legal/accounting treatment — the model does not force one; use `AccountType` + manual journals.
- **No** automated compliance posting in 11A.

## Services (source of truth for mutations)

- `packages/services/src/accounting/accounting-company-context.ts` — `resolveAccountingCompanyId`.
- `packages/services/src/accounting/accounting-account.service.ts`
- `packages/services/src/accounting/accounting-mapping.service.ts` — mapping rules CRUD, `findActiveMappingRule`.
- `packages/services/src/accounting/accounting-suggestions.service.ts` — draft journal suggestions from operational sources; 11C UI llama explícitamente (sin hooks en creación operativa).
- `packages/services/src/accounting/journal-entry.service.ts` — `assertBalancedJournalEntry`, CRUD/post/cancel, `getAccountLedger` (posted lines only).
- `packages/services/src/accounting/journal-entry-source-link.service.ts` — resolución read-only de enlace a documento origen (11D).

`apps/web` uses Server Actions calling these services only (no Prisma in UI).
