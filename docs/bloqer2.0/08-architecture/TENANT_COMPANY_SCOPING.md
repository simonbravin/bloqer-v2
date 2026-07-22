# Estándar de alcance Tenant / Empresa (company scoping)

> **Regla de oro:** el aislamiento entre **tenants** es absoluto y siempre se hace con
> `tenantId`. El alcance por **empresa** (`companyId`) es un filtro *dentro* del tenant y
> **nunca** debe ocultar ni bloquear datos **compartidos/corporativos** (`companyId = null`).

Este documento fija el estándar para evitar la clase de bug detectada en Tesorería
(la "Posición de caja" aparecía vacía porque las cuentas tenían `companyId = null` y el
agregado filtraba por la empresa activa del usuario). Aplica a **todo** servicio nuevo o
modificado en `packages/services`.

Helpers canónicos: [`packages/services/src/company-scope.ts`](../../../packages/services/src/company-scope.ts)
(`companyScopeFilter`, `companyScopeRelationFilter`, `isCrossCompany`).

---

## 1. Modelo mental

- `UserMembership.companyId` puede ser `null` (**membresía global** al tenant) o estar
  **anclada** a una empresa. `ctx.companyId` refleja ese anclaje.
- Un registro con `companyId = null` es **compartido / corporativo**: pertenece al tenant
  y debe ser visible para **cualquier** contexto de empresa.
- Multi-empresa por tenant está permitido físicamente (N `Company` por `Tenant`); ver
  [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md) y `Q-001`.

## 2. Clasificación de entidades (por nullabilidad de `companyId`)

La nulabilidad de la columna en `schema.prisma` **decide** el patrón a usar:

### 2.1 Tenant-wide (sin dimensión de empresa)
`TreasuryAccount`, `AccountMovement`, `InternalTransfer`.
- **NO** filtrar por `ctx.companyId` en absoluto. Son caja **corporativa del tenant**.
- Sólo un `filters.companyId` **explícito** (elegido en la UI) puede acotar.
- Resumen de saldos: `getTreasurySummaryByTenant` (no existe ya `...ByCompany`).

### 2.2 Company-scoped con `companyId` NULLABLE
Ej.: `Project`, `Budget`, `Product`, `DocumentAttachment`, `Notification`,
`Certification`, `ScheduledReport`, `EmailDeliveryLog`.
- Pueden tener filas **compartidas** (`companyId null`).
- **Lecturas:** usar `...companyScopeFilter(ctx)` (incluye propias **+** compartidas).
  Para relaciones: `...companyScopeRelationFilter("project", ctx)`.
- **Guards de acceso:** usar `isCrossCompany(entity.companyId, ctx)`.
- ⚠️ El patrón ingenuo `ctx.companyId ? { companyId: ctx.companyId } : {}` **oculta**
  las filas `null` → prohibido en estas entidades.

### 2.3 Company-scoped con `companyId` NOT NULL
Ej.: `Receivable`, `Payable`, `Payment`, `SupplierInvoice`, `SalesInvoice`,
`Collection`, `AccountingAccount`, `JournalEntry`, `AccountingMappingRule`,
`PurchaseOrder`, `PurchaseRequest`, `Subcontract`, `JobsiteLog`, overhead*.
- Nunca hay filas compartidas → `ctx.companyId ? { companyId: ctx.companyId } : {}` es
  **correcto** y suficiente para lecturas. Dejar un comentario `// companyId NOT NULL`.
- Guards: pueden usar `isCrossCompany` igualmente (es **equivalente** cuando el valor
  no es null) para uniformar el código; nunca debilita nada.

> Antes de escribir un filtro por empresa, **verificá la nulabilidad de la columna** en
> `schema.prisma`. Es lo que determina si va §2.2 o §2.3.

## 3. Patrones canónicos (copiar/pegar)

**Lectura (entidad nullable):**
```ts
const rows = await prisma.project.findMany({
  where: { tenantId: ctx.tenantId, status: "ACTIVE", ...companyScopeFilter(ctx) },
});
```

**Lectura por relación (entidad nullable vía relación):**
```ts
where: { tenantId: ctx.tenantId, ...companyScopeRelationFilter("project", ctx) }
```

**Guard de acceso a un registro existente:**
```ts
if (entity.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant");
if (isCrossCompany(entity.companyId, ctx)) {
  throw new ServiceError("FORBIDDEN", "Registro de otra empresa");
}
```

**Lectura (entidad NOT NULL):**
```ts
where: { tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) }
```

**Filtro explícito de UI + scope de sesión:** el filtro explícito tiene prioridad.
```ts
...(filters.companyId ? { companyId: filters.companyId } : companyScopeFilter(ctx)) // nullable
```

## 4. Prohibiciones

- ❌ `ctx.companyId ? { companyId: ctx.companyId } : {}` sobre entidades **nullable** (§2.2).
- ❌ `if (ctx.companyId && x.companyId !== ctx.companyId)` como guard sobre entidades
  **nullable** (bloquea registros compartidos). Usar `isCrossCompany`.
- ❌ Filtrar Tesorería (`TreasuryAccount`/`AccountMovement`) por `ctx.companyId`.
- ❌ Confiar en `companyId` para aislamiento entre tenants: **siempre** filtrar `tenantId`.

## 5. Escrituras (create/update)

Al persistir `companyId` en registros nuevos se puede seguir derivando el valor
(`companyId = input.companyId ?? ctx.companyId ?? <default>`). Este estándar **no** cambia
la derivación de escritura; sólo cubre lecturas y guards de acceso.

## 6. Cómo detectar regresiones

Buscar patrones sospechosos antes de mergear:
```
rg "companyId: ctx.companyId } : \{\}\)" packages/services/src   # revisar nulabilidad
rg "ctx.companyId && .*companyId !== ctx.companyId" packages/services/src  # guards a migrar
```
Todo hit sobre una entidad de §2.2 debe migrarse a los helpers.

## Referencias
- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
- [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) §Company scoping
- [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md)
- Helper: [`packages/services/src/company-scope.ts`](../../../packages/services/src/company-scope.ts)
