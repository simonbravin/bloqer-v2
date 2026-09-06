# Bloqer AI / RBAC — Gap design (G1–G4)

> **Estado:** diseño para decisión de producto. **No aplicar migraciones** hasta aprobación explícita.  
> **Fecha:** 2026-09-06  
> Relacionado: [`BLOQER_AI_SECURITY_SCORECARD.md`](./BLOQER_AI_SECURITY_SCORECARD.md), [D-056](./00-product/DECISION_LOG.md), [D-091](./00-product/DECISION_LOG.md), [R-USR-007](./00-product/USER_ROLES.md), [P-ERD-08](./08-architecture/PENDING_ARCHITECTURE_ITEMS.md).

---

## 0. Qué se aplicó YA (sin Prisma)

### G2 — VIEWER / TREASURY en Bloqer AI — **HECHO**

Bloqer AI es **más restrictiva** que la UI (D-056):

| Rol | UI `/tesoreria` (D-056) | AI `get_cash_position` |
|---|---|---|
| OWNER / ADMIN / FINANCE / TREASURER | ✓ | ✓ |
| VIEWER solo | ✓ lectura | **DENY** |
| PROJECT_MANAGER | ✗ | **DENY** |

Implementación: `aiCanViewTreasury()` en `packages/services/src/ai/policy/access.ts` exige rol explícito `OWNER|ADMIN|FINANCE|TREASURER` **y** `can(VIEW, TREASURY)`. No filtra saldos/cuentas/moneda en denegación.

Personalización: sin cambios (nombre solo desde sesión).

---

## 1. G1 — `VIEW PROJECTS` abre procurement (auditoría ERP)

### Hallazgo

Helpers de service (UI + API + AI services) usan OR explícito:

```ts
// procurement-access.ts
canViewProcurementProjectArea = VIEW PROCUREMENT || VIEW PROJECTS

// ap-access.ts / ar-access.ts — mismo patrón
canViewApProjectArea = VIEW AP || VIEW PROJECTS
canViewArProjectArea = VIEW AR || VIEW PROJECTS
```

Comentarios en código: *“Aligns reads with `document.service` …”* — fue una **decisión de alineación con adjuntos / documentos de obra**, no un bug accidental aislado.

### ¿Es decisión funcional o permiso demasiado amplio?

| Lectura | Evidencia |
|---|---|
| Intencional (parcial) | Docs de documentos/AP alinean “ver obra ⇒ ver adjuntos/área proyecto financiera operativa” |
| Demasiado amplio (hoy) | `PROJECT_VIEWER` solo tiene `VIEW PROJECTS` (+ schedule/budgets/certs…) **sin** `PROCUREMENT` en matriz, pero **sí** puede pasar `canViewProcurementProjectArea` vía OR → lee OC/SC en services |
| Producto documentado | Matriz de roles **no** da PROCUREMENT a PROJECT_VIEWER; el OR lo contradice en la práctica |

**Conclusión de auditoría:** híbrido. El OR nació para no bloquear a roles de obra que “ven el proyecto” en pantallas compartidas, pero **ensancha** el techo de la matriz escrita. No es un “feature” documentado como “todo VIEW PROJECTS ve compras”.

### Decisión actual (AI)

- Bloqer AI **mantiene** advertise estricto: exige `VIEW PROCUREMENT | PURCHASE_ORDERS | PURCHASE_REQUESTS` (ya implementado).
- **No** se relaja AI para igualar el service.

### Propuesta ERP (NO aplicar aún)

1. Documentar en `PERMISSIONS_MATRIX.md` / OPEN_QUESTIONS: *¿VIEW PROJECTS implica lectura de procurement/AP/AR de obra?*
2. Opciones de producto:
   - **A (recomendada):** quitar `|| VIEW PROJECTS` de procurement (y eventualmente AP/AR) → alinear service a matriz; `PROJECT_VIEWER` deja de ver OC.
   - **B:** agregar `VIEW PROCUREMENT` explícito a roles de obra que deban ver compras.
   - **C:** dejar OR en documents adjuntos únicamente; separar helpers `canViewProjectDocuments` vs `canViewProcurement`.
3. Impacto: revisar `document.service`, hub de compras, aging proyecto, supplier-invoice-from-po.

---

## 2. G4 — Permisos granulares (diseño compatible)

### Arquitectura real hoy

- `PermissionModule` + `PermissionAction` (`VIEW|EDIT|APPROVE`) en `packages/domain/src/permissions/matrix.ts`.
- Roles = **presets** de techos en `MATRIX[role]`.
- `can(roles, action, module)` = OR entre roles.
- Scope company vs project **no** es un módulo: vive en helpers D-056 (`hasCompanyFinanceRole` + `canViewCompany*`).
- Ya existen módulos financieros: `AP`, `AR`, `TREASURY`, `BANK_ACCOUNTS`, `BUDGETS`, `CERTIFICATIONS`, `EXPENSES_PAYMENTS`, `ACCOUNTING`, …

### ¿Hace falta módulos nuevos?

Los nombres conceptuales del pedido mapean así:

| Concepto pedido | ¿Equivalente hoy? | Propuesta |
|---|---|---|
| `VIEW_PROJECT_FINANCIALS` | Parcial: `AP`/`AR`/`BUDGETS`/`CERTIFICATIONS` + OR `VIEW PROJECTS` | Nuevo módulo **`PROJECT_FINANCIALS`** *o* helper compuesto sin módulo nuevo |
| `VIEW_COMPANY_FINANCIALS` | `hasCompanyFinanceRole` + `AP`/`AR`/`ACCOUNTING` | Nuevo módulo **`COMPANY_FINANCIALS`** *o* formalizar helper |
| `VIEW_TREASURY` | Módulo **`TREASURY`** (+ `BANK_ACCOUNTS`) | **Reusar** `TREASURY`; no duplicar. Cambiar *quién* tiene VIEW (sacar VIEWER) vía decisión de producto |

### Recomendación de implementación (cuando se apruebe)

**Opción preferida (menos proliferación):**

1. **No** crear `VIEW_TREASURY` duplicado → usar `TREASURY` existente.
2. Introducir **dos** módulos nuevos solo si se quiere grant independiente del OR actual:
   - `PROJECT_FINANCIALS` — techo para presupuesto/costos/CxP-CxC de obra/certs/margen de proyecto.
   - `COMPANY_FINANCIALS` — techo para CxP/CxC global, hub, consolidaciones (sin caja).
3. Helpers centrales (única autoridad):

```ts
// packages/services/src/security/access.ts (nuevo) — propuesto
canViewProject(ctx, projectId)           // G3 + VIEW PROJECTS
canViewProjectFinancials(roles)          // can(VIEW, PROJECT_FINANCIALS) || legacy bridge
canViewCompanyFinancials(roles)          // can(VIEW, COMPANY_FINANCIALS) || hasCompanyFinanceRole bridge
canViewTreasury(roles)                   // can(VIEW, TREASURY) && !passiveViewer  // o matriz sin VIEWER
```

4. Matriz objetivo (presets — **borrador**, contrastar):

| Rol | PROJECT_FINANCIALS | COMPANY_FINANCIALS | TREASURY |
|---|---|---|---|
| OWNER / ADMIN | APPROVE | APPROVE | APPROVE |
| FINANCE | VIEW/EDIT según hoy | APPROVE | APPROVE |
| TREASURER | VIEW | VIEW/EDIT AP-AR caja | APPROVE |
| PROJECT_FINANCE | EDIT | — | — |
| PROJECT_MANAGER | VIEW o EDIT (decidir) | — | — |
| VIEWER | VIEW (¿?) | VIEW (hoy D-056) | **—** (sacar de UI+AI) |
| SITE_FOREMAN / PROJECT_VIEWER | — / VIEW limitado | — | — |

5. Bridge de compatibilidad: durante N releases, `canViewProjectFinancials` = nuevo módulo **OR** (`VIEW AP|AR|BUDGETS` sin exigir PROJECTS alone). Luego deprecar OR `VIEW PROJECTS` en AP/AR (G1).

6. AI: `accessKind` mapea a estos helpers; `aiAllowed` sigue pudiendo ser más estricto (como G2).

**Prisma impacto G4:** si se agregan módulos al enum `PermissionModule` / tenant module settings → **sí migración** de enum + seeds de matriz. Si solo helpers sin nuevos módulos → **no** Prisma (solo domain matrix + services).

**Recomendación:** primero helpers + ajuste de matriz VIEWER/TREASURY (producto); módulos `PROJECT_FINANCIALS` / `COMPANY_FINANCIALS` en un segundo PR si se necesita grant fino.

---

## 3. G3 — Project access control (ACL de obras)

### Qué existe hoy

| Concepto | Estado |
|---|---|
| `ProjectTeamMember` | **Existe** (Prisma). Roster de **notificaciones** [D-091]. `kind`: `PROJECT_MANAGER` \| `SITE_FOREMAN` \| `OTHER`. **No** filtra `listProjects` / `/pendientes` / `can()`. |
| `ProjectMembership` | **No existe** como modelo. Mencionado en docs como deuda R-USR-007. |
| `listProjects` | Filtra solo `tenantId` (+ search/status). Cualquier `VIEW PROJECTS` ve **todas** las obras del tenant. |
| R-USR-007 | Producto: roles por obra independientes del global — **sin enforcement**. |
| P-ERD-08 | Pendiente parcial: roster sí, ACL no. |

### Objetivo deseado

- OWNER / company-wide → todas las obras (si tienen `VIEW PROJECTS`).
- Jefe de obra A → solo Casa Hogar.
- Jefe de obra B → solo Escuela.
- Cross-project / UUID / nombre → **NO DATA** (UI, API, services, AI).

### Diseño propuesto (NO aplicar aún)

#### Modelo (opción recomendada)

**No reutilizar ciegamente** `ProjectTeamMember` como ACL (evita mezclar notificaciones con autorización). Dos caminos:

**A — Extender `ProjectTeamMember` (menos tablas)**  
Agregar:

```prisma
accessLevel ProjectAccessLevel @default(NONE) // NONE | VIEW | EDIT
// o boolean grantsProjectAccess @default(false)
```

- Roster de mail sigue usando la fila.
- ACL usa `accessLevel != NONE`.
- Riesgo: semántica dual; hay que auditar todos los call sites de team.

**B — Nueva tabla `ProjectMembership` (recomendada para claridad R-USR-007)**  

```prisma
model ProjectMembership {
  id        String   @id @default(uuid())
  tenantId  String
  projectId String
  userId    String
  /// Optional future: per-project role overlay (R-USR-007). MVP: presence = access.
  // projectRole UserRole?  // diferido
  createdBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant  Tenant  @relation(...)
  project Project @relation(...)
  user    User    @relation(...)

  @@unique([tenantId, projectId, userId])
  @@index([tenantId, userId])
  @@index([tenantId, projectId])
  @@map("project_memberships")
}
```

Mantener `ProjectTeamMember` solo para notificaciones; opcionalmente sync UI “Equipo de obra” puede crear membership + roster juntos.

#### Autoridad central

```ts
async function assertCanAccessProject(projectId: string, ctx: ServiceContext): Promise<void>
async function filterAccessibleProjectIds(ctx: ServiceContext): Promise<string[] | "ALL">
function isCompanyWideProjectAccess(roles: UserRole[]): boolean
```

Regla MVP:

- Si `isCompanyWideProjectAccess(roles)` → `"ALL"` (OWNER, ADMIN; **decidir** si FINANCE/TREASURER/VIEWER también).
- Else → solo `projectId IN memberships` (y opcionalmente team members con access).
- `requireProjectInTenant` se complementa con `assertCanAccessProject`.

#### Migración segura (tenants existentes)

**No** activar enforcement global el día 1.

1. Ship schema + backfill **sin** filtrar listados.
2. Tenant setting / flag: `projectAccessMode: "TENANT_WIDE" | "MEMBERSHIP_SCOPED"` default **`TENANT_WIDE`**.
3. Backfill sugerido cuando un tenant activa SCOPED:
   - Crear membership para **todos** los `ProjectTeamMember` existentes.
   - Para cada usuario con rol `PROJECT_MANAGER` | `SITE_FOREMAN` | `PROJECT_VIEWER` | `PROJECT_FINANCE` **sin** filas:  
     - **Opción segura:** asignar a **todas** las obras activas del tenant (preserva acceso; admin puede recortar después), **o**  
     - wizard “asignar obras” bloqueante antes de SCOPED.
4. OWNER/ADMIN siempre `"ALL"` aunque no tengan filas.
5. AI / UI / services leen el mismo flag + helper — **un solo ACL**.

#### Impacto

| Área | Cambio |
|---|---|
| Prisma | Nueva tabla o columnas + indexes |
| Services | `listProjects`, overview, procurement, finance project paths, pendientes |
| UI | Selector de obras; pantalla equipo; empty states “sin obras asignadas” |
| AI | `search_projects` / `resolveAiProjectId` respetan ACL |
| Notificaciones | Pueden seguir en `ProjectTeamMember` |

---

## 4. Matriz de prueba determinista (objetivo post-G3/G4)

Para cada celda: **advertised?** / **direct invoke?** / **service?** → allow|deny (100%).

| Actor | Project ops | Project financials | Company financials | Treasury |
|---|---|---|---|---|
| OWNER tenant A | allow | allow | allow | allow |
| PM obra A1 | allow A1 / deny A2* | según permiso | deny | deny |
| VIEWER | allow ops lectura | según G4 | según G4 | **deny AI** (ya); UI TBD |
| FINANCE / TREASURER | allow | allow | allow | allow |
| OWNER tenant B | deny A* | deny | deny | deny |

\* requiere G3 enforcement.

---

## 5. Recomendación final (orden)

| Prioridad | Acción | Prisma | Decisión needed |
|---|---|---|---|
| 1 | **G2 AI** VIEWER DENY treasury | No | ✅ Hecho |
| 2 | Cerrar pregunta G1 (¿OR VIEW PROJECTS en procurement/AP/AR?) | No (luego sí si se cambia código) | Sí — A/B/C arriba |
| 3 | Helpers centrales finance (`canViewTreasury` producto vs AI) | No | Sí — ¿VIEWER pierde UI tesorería? |
| 4 | G4 módulos `PROJECT_FINANCIALS` / `COMPANY_FINANCIALS` | Sí (enum) | Sí — ¿módulos nuevos o solo helpers? |
| 5 | G3 `ProjectMembership` + flag TENANT_WIDE | **Sí** | Sí — modelo A vs B + backfill |

**No se aplican migraciones en este lote.** Esperando tu decisión en:

1. G1 opción A/B/C  
2. ¿VIEWER pierde tesorería también en **UI** (alineado a AI) o solo chatbot?  
3. G4: ¿módulos nuevos o helpers sobre AP/AR/TREASURY?  
4. G3: ¿tabla `ProjectMembership` nueva (B) o extender `ProjectTeamMember` (A)?  
5. Default de migración: flag TENANT_WIDE + backfill all-projects para PMs al activar SCOPED — ¿OK?
