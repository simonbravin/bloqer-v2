# Treasury Model — Cuatro vistas sobre un motor

## Motor único
Todos los movimientos de dinero se persisten como **`AccountMovement`** (ledger unificado). Ver [`ACCOUNT_MOVEMENTS.md`](./ACCOUNT_MOVEMENTS.md).

## Vista 1 — Extracto por cuenta
**Uso:** operación diaria tipo home banking.

**Contenido:** movimientos filtrados por `account_id`, ordenados por `date_value` o `date_accounting` (selector).

**Usuarios:** tesorería, PM consulta si política permite.

## Vista 2 — Ledger global
**Uso:** auditoría y búsqueda transversal.

**Contenido:** todos los movimientos del tenant con filtros (fecha, proyecto, contraparte, categoría, estado conciliación).

**Usuarios:** finance, admin.

## Vista 3 — Posición consolidada
**Uso:** saber “cuánto tenemos” en total y por cuenta.

**Contenido:**
- Saldo por **Account** en moneda nativa de la cuenta.
- Total consolidado en **ARS** (suma de `amount_ars` de saldos).
- Opcional: total por **proyecto** si movimiento lleva `project_id`.

**Nota:** AR/AP **no** suman aquí; son obligaciones, no caja ([D-024]).

## Vista 4 — Flujo de fondos (real + proyectado)
**Uso:** tesorería + dirección.

**Parte A — Real:** suma de movimientos confirmados por período (cashflow real).

**Parte B — Proyectado:** sobre saldo inicial + AR esperadas + AP esperadas con fechas ([`CASHFLOW_PROJECTION.md`](./CASHFLOW_PROJECTION.md)).

**Separación:** estas vistas responden a **liquidez**, no al total **`expected_cost_exposure`** del proyecto (que incluye OC sin facturar). Ver [`../04-formulas/COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §2.

## Referencias cruzadas
- [`TREASURY.md`](../02-modules/TREASURY.md)
- [`CASHFLOW.md`](./CASHFLOW.md)

## TreasuryAccount uniqueness (`@@unique([tenantId, name])`)

**Current schema (Phase 13B):** `TreasuryAccount.name` is unique **per tenant**, not per company (`companyId` is nullable). Two legal entities (`Company`) under the same tenant **cannot** reuse the same display name for a treasury account (e.g. two “Caja chica” rows).

**Decision point (not changed in 13B):**

| Option | Pros | Cons |
|--------|------|------|
| **Keep tenant-wide unique name** (today) | Simple UX for small tenants; one global list of cash/bank names | Name clashes when multiple companies share the tenant |
| **Unique per `(tenantId, companyId, name)`** | Matches company-scoped reporting | Requires migration + data dedup; nullable `companyId` semantics must be defined (shared pool vs orphan) |

**Recommendation:** revisit when multi-company tenants report naming collisions in QA; until then, document display names as tenant-global for treasury.

See also: [`BANK_ACCOUNTS.md`](../02-modules/BANK_ACCOUNTS.md).
