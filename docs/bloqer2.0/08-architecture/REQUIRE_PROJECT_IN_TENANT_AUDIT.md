# requireProjectInTenant — classification (D-111)

`requireProjectInTenant(projectId, tenantId)` = **existence + tenant match only**.  
It does **not** check user membership or area permissions.

## After D-111 Phase A (ACL rollout)

| Use | Class | Action |
|---|---|---|
| Inside `requireProjectAccess` / `canAccessProject` | **A** | Keep (composition) |
| Entity load → then `requireProjectAccess` / `requireProjectAccessIfPresent` | **B** | ✅ wired on get-by-id + list-by-project |
| Operational / budget guards | **B** | ✅ `assertProjectAllows*` → `requireProjectAccess` |
| AI `resolveAiProjectId` / chat hint | **B** | ✅ |
| `listProjects` / dashboard project KPIs | **C** | ✅ `resolveAccessibleProjectScope` **before** count/list |
| Field pending inbox / cert KPI counts | **C** | ✅ scope filter **before** queries |
| Aging with `projectId` | **B** | ✅ `requireProjectAccess` |
| Aging company-wide (`canViewCompanyAp/Ar`) | **company** | No membership filter (legitimate company finance) |
| Aggregations | **C** | Must never SUM tenant-wide then hide rows |

Under `TENANT_WIDE` (default), `requireProjectAccess` ≡ tenant check (backward compatible).

## Authority (only these)

- `canAccessProject`
- `requireProjectAccess` / `requireProjectAccessIfPresent`
- `resolveAccessibleProjectScope`
- `projectIdWhereForScope` / `projectRowIdWhereForScope`
- `hasTenantWideProjectAccess`
- `projectScopeWhereForOptionalProject`

Request-level memo: `WeakMap` on `ServiceContext` for mode + scope (not persisted).

## Remaining Class A (intentional)

None outside `security/access.ts` and `require-project-in-tenant.ts` definition.
