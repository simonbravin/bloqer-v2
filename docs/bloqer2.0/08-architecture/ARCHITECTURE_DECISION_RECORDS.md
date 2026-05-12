# Architecture Decision Records (ADR) — Bloqer 2.0

## Decisión

Mantener **ADRs** en esta carpeta como registro de **decisiones técnicas** (cómo construimos) separadas del [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) (qué hace el producto). Formato corto: **contexto → decisión → consecuencias → estado**.

## Justificación para Bloqer 2.0

- El dominio ya tiene decisiones funcionales lockeadas; faltaba anclar **stack y patrones** sin mezclar ambos mundos.
- ADRs evitan debates eternos y documentan **por qué** se scinde un paquete o se elige un proveedor.

## Problemas que evita

- **Conocimiento tribal** (“siempre fue así”) sin registro.
- Confundir **D-xxx** de producto con **ADR-xxx** de ingeniería.

## Qué NO hacer

- No duplicar en ADRs las reglas de [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md); citarlas si afectan la forma técnica.
- No escribir ADRs **por cada PR**; solo decisiones que **cambian arquitectura** o son **irreversibles sin costo**.

---

## Índice de ADRs (plantilla inicial)

> Los IDs `ADR-001`… son **técnicos**. Se numeran al crearse el primer ADR real en repo.

| ID | Título | Estado |
|---|---|---|
| ADR-001 | Modular monolith en Vercel + Next.js App Router | PROPUESTO |
| ADR-002 | PostgreSQL Neon + Prisma como acceso principal | PROPUESTO |
| ADR-003 | Auth.js como primera opción de autenticación | PROPUESTO |
| ADR-004 | Blobs en Cloudflare R2 con metadatos en Postgres | PROPUESTO |
| ADR-005 | Email transaccional Resend + React Email | PROPUESTO |
| ADR-006 | pnpm workspaces; Turborepo si ≥2 paquetes compilables | PROPUESTO |
| ADR-007 | Gantt y cronograma detrás de adapter único | PROPUESTO |
| ADR-008 | Modelo físico: `tenant` + `company` 1:N (legal entity = `company`) con `project.company_id` opcional hasta multi-empresa activa | PROPUESTO |
| ADR-009 | UUID PK en todas las entidades ERP; numeración humana en columnas separadas | PROPUESTO |

---

## ADR-Phase1-01 — UUID v4 para todas las PKs

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** La plantilla PENDING_ARCHITECTURE_ITEMS (P-ERD-07) pedía un benchmark de UUID v4 vs v7. Para Phase 1, con volúmenes de datos aún bajos, el overhead de fragmentación de índice de v4 es irrelevante.
- **Decisión:** UUID v4 vía `@default(uuid())` de Prisma en todas las PKs. Re-evaluar v7 si los benchmarks de Phase 3+ muestran degradación.
- **Consecuencias:** Índices B-Tree levemente menos óptimos que v7 a escala. Aceptable para Fase 1-2.

---

## ADR-Phase1-02 — Tenant 1:N Company (Q-001 resuelto)

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Q-001 preguntaba si Company es 1:1 o N:1 con Tenant. Alternativa A = tenant IS company. Alternativa B = tenant puede tener N companies.
- **Decisión:** Alternativa B. El modelo `Company` existe y tiene FK a `Tenant`. `UserMembership.companyId` es nullable para soportar membresías globales al tenant.
- **Consecuencias:** Multi-empresa habilitada en la DB desde Phase 1. La UI solo expone una empresa por defecto; el multi-empresa se activa en fases posteriores.

---

## ADR-Phase1-03 — Auth.js v5 + Google OAuth; Magic Link diferido

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Se requería autenticación federada sin credenciales propias (email/password). Se evaluaron Auth.js v4, v5 beta, y Clerk.
- **Decisión:** Auth.js v5 (next-auth@5 beta) con Google OAuth. Adapter de Prisma (`@auth/prisma-adapter`). Sin Credentials. Magic Link con Resend diferido para Phase 2.
- **Consecuencias:** La app puede arrancar localmente sin credenciales reales de Google (empty string fallback). El login solo funciona end-to-end con variables de entorno configuradas.

---

## ADR-Phase1-04 — RBAC vía UserMembership.roles (array PostgreSQL)

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Se necesitaba almacenar los roles de un usuario por tenant. Opciones: tabla UserRole separada (join), array en PostgreSQL, JSON column.
- **Decisión:** Array nativo de PostgreSQL (`UserRole[]` en Prisma). La semántica es unión: el usuario tiene acceso si **cualquiera** de sus roles lo habilita. La función `can(roles, action, module)` en `@bloqer/domain` es pura (sin I/O).
- **Consecuencias:** Queries de roles son simples (`roles @> ARRAY['ADMIN']::UserRole[]`). No soporta permisos granulares por campo (fuera del alcance per PERMISSIONS_MATRIX.md).

---

### Formato sugerido para nuevos ADRs

```markdown
## ADR-NNN — Título

- **Fecha:** YYYY-MM-DD
- **Estado:** PROPUESTO | ACEPTADO | REEMPLAZADO por ADR-XXX
- **Contexto:** …
- **Decisión:** …
- **Consecuencias:** positivas / negativas
- **Referencias funcionales:** enlaces a docs si aplica
```

## Referencias

- Visión técnica: [`ARCHITECTURE_OVERVIEW.md`](./ARCHITECTURE_OVERVIEW.md)
- Stack: [`TECH_STACK.md`](./TECH_STACK.md)
- Decisiones de producto: [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md)
