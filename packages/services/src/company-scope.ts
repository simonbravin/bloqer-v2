import type { ServiceContext } from "./types";

/**
 * Estándar de alcance por empresa dentro de un tenant.
 *
 * Regla de oro (ver `docs/bloqer2.0/08-architecture/TENANT_COMPANY_SCOPING.md`):
 * dentro de un mismo `tenant`, un registro con `companyId = null` es **compartido /
 * corporativo** y debe ser **visible para cualquier contexto de empresa** del tenant.
 * El aislamiento entre tenants SIEMPRE se garantiza aparte con `tenantId` (no lo cubre
 * este helper).
 *
 * Por qué existe: el patrón ingenuo `ctx.companyId ? { companyId: ctx.companyId } : {}`
 * **oculta** las filas con `companyId null` cuando el usuario tiene empresa activa. Eso
 * provocó, p. ej., que la Posición de caja apareciera vacía (cuentas de tesorería con
 * `companyId null`). Usar SIEMPRE estos helpers en entidades company-scoped evita repetir
 * ese error.
 *
 * NOTA — Entidades tenant-wide: Tesorería (`TreasuryAccount`, `AccountMovement`,
 * `InternalTransfer`) NO se acota por `ctx.companyId` en absoluto (es caja corporativa
 * del tenant); ver `getTreasurySummaryByTenant`. No usar estos helpers ahí: simplemente
 * no filtrar por empresa (salvo un `filters.companyId` explícito de la UI).
 */

/** Elemento de `OR` reutilizable en cualquier `*WhereInput` de Prisma con campo `companyId`. */
type CompanyIdWhere = { companyId: string | null };

/**
 * Fragmento `where` para lecturas company-scoped que **incluye** las filas compartidas
 * (`companyId null`). Se hace *spread* dentro del `where`:
 *
 * ```ts
 * where: { tenantId: ctx.tenantId, status: "OPEN", ...companyScopeFilter(ctx) }
 * ```
 *
 * - Con empresa activa → `{ OR: [{ companyId }, { companyId: null }] }` (propias + compartidas).
 * - Sin empresa activa (membresía global) → `{}` (todo el tenant).
 *
 * ⚠️ No combinar con otro `OR` en el mismo nivel del `where`; si el `where` ya usa `OR`,
 * anidar este fragmento dentro de un `AND`.
 */
export function companyScopeFilter(
  ctx: ServiceContext,
): { OR: CompanyIdWhere[] } | Record<string, never> {
  return ctx.companyId
    ? { OR: [{ companyId: ctx.companyId }, { companyId: null }] }
    : {};
}

/**
 * Igual que {@link companyScopeFilter} pero aplicado sobre una **relación** (p. ej. filtrar
 * movimientos por la empresa de su cuenta, o filas por la empresa del proyecto):
 *
 * ```ts
 * where: { tenantId, ...companyScopeRelationFilter("project", ctx) }
 * ```
 */
export function companyScopeRelationFilter(
  relation: string,
  ctx: ServiceContext,
): Record<string, { OR: CompanyIdWhere[] }> | Record<string, never> {
  return ctx.companyId
    ? { [relation]: { OR: [{ companyId: ctx.companyId }, { companyId: null }] } }
    : {};
}

/**
 * Guard de acceso por empresa: `true` cuando el registro pertenece a **otra** empresa.
 *
 * Los registros compartidos/corporativos (`companyId null`) son visibles para cualquier
 * empresa del tenant y por lo tanto **no** son cross-company. El chequeo cross-tenant
 * (`entity.tenantId !== ctx.tenantId`) es independiente y debe seguir haciéndose aparte.
 *
 * ```ts
 * if (isCrossCompany(entity.companyId, ctx)) {
 *   throw new ServiceError("FORBIDDEN", "Registro de otra empresa");
 * }
 * ```
 */
export function isCrossCompany(
  entityCompanyId: string | null,
  ctx: ServiceContext,
): boolean {
  return (
    ctx.companyId != null &&
    entityCompanyId != null &&
    entityCompanyId !== ctx.companyId
  );
}
