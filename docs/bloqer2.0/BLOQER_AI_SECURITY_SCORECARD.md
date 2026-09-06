# Bloqer AI — Security Scorecard

> Zero-trust data access. Target: **100%** on deterministic automated tests.
> Last updated: 2026-09-06 (hardening lot).

## Architecture (deny by default)

```
Authenticated Session
  → AiExecutionContext (tenant/user/roles/modules from server only)
  → Tool advertise filter (policy.dataClass + accessKind + modules)
  → LLM (only sees allowed tool schemas)
  → Tool execute (re-check policy + module gate + ServiceContext RBAC)
  → Existing Bloqer services (authority)
  → Minimized DTO → LLM
```

The model never decides authorization. Conversation history / claimed identity are never auth.

## Data classification

| Class | Level | Examples |
|---|---|---|
| `PRODUCT_HELP` | 0 | knowledge, `get_current_context` |
| `PROJECT_OPERATIONAL` | 1 | schedule, materials, SC/OC, field |
| `PROJECT_FINANCIAL` | 2 | project CxP/CxC, certs, project summary KPIs |
| `COMPANY_FINANCIAL` | 3 | company AP/AR (via company scope on finance tools) |
| `TREASURY` | 4 | `get_cash_position` |
| `ADMIN` | 5 | not exposed in MVP tools |

## Scorecard

| Control | Target | Status | Evidence |
|---|---|---|---|
| Tenant isolation | 100% | PASS (existing live) | `live-isolation.test.ts` cross-tenant |
| Project isolation (D-111 SCOPED) | 100% | **PASS live** | `d111-scoped-live.test.ts` — PM-A1↔A1 only |
| Direct entity isolation | 100% | **PASS live** | PO/PR/payable/cert/jobsite/doc A2 DENY |
| Aggregate isolation | 100% | **PASS live** | CxP 10M≠100M; OC 1≠6; dashboard/portfolio |
| AI inheritance (SCOPED) | 100% | **PASS live** | tools → services ACL |
| Permission + membership | 100% | **PASS live** | empty-PM / PROJECT_VIEWER no OC |
| TENANT_WIDE regression | 100% | **PASS live** | mode flip restores legacy visibility |
| Memberships UI / activation (Phase C) | 100% | **PASS live** | `project-membership.phase-c.live.test.ts` — batch set, FORBIDDEN, cross-tenant, prepare+activate |
| Company finance ≠ membership | 100% | **PASS live** | FINANCE company aging; listProjects empty |
| RBAC execute | 100% | PASS | services + registry secondary deny |
| Tool advertise filter | 100% | PASS | `zero-trust-access.test.ts` |
| Direct invoke non-advertised | 100% | PASS | PM → `get_cash_position` DENY |
| Company finance isolation | 100% | PASS | PM company CxP DENY (`AI_DENY_MESSAGES.COMPANY_AP`) |
| Treasury isolation | 100% | PASS | advertise + execute DENY for PM |
| Module gates | 100% | PASS | execute module gate (safe message) |
| Field minimization | 100% | PASS | aging/cash/notes helpers + tests |
| Aggregation before filter | 100% | PASS | services filter tenant/project before sum |
| Tool chain escalation | 100% | PASS | each execute revalidates independently |
| Prompt injection (data) | 100% | PASS | `_bloqer_data` wrap + eval suite |
| Identity spoof | 100% | PASS | system policy + session-only preferredName |
| Conversation ≠ auth | 100% | PASS | documented + resolveAiProjectId always revalidates |
| WRITE tools absent | 100% | PASS | `read-only.test.ts` |

## Tools advertised by role (matrix)

With typical modules ON:

| Tool | OWNER | PM (Jefe de obra) | VIEWER | PROJECT_VIEWER | SITE_FOREMAN |
|---|---|---|---|---|---|
| `get_current_context` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `search_bloqer_knowledge` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `search_projects` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `get_project_summary` | ✓ | ✓ | ✓ | ✓ | ✓ |
| schedule / materials / field* | ✓ | ✓ | ✓ | varies | varies |
| procurement (OC/SC) | ✓ | ✓ | ✓ | **✗ (AI stricter)** | ✓ (PR) |
| `get_payables` / `get_receivables` | ✓ | ✓ (project) | ✓ | ✓ (project via VIEW PROJECTS) | ✓ (project) |
| `get_cash_position` | ✓ | **✗** | ✓ (D-056) | **✗** | **✗** |

\* field tools require `JOBSITE_LOG` module when gated.

## RBAC gaps (proposal — NOT applied)

| Gap | Current | Risk | Proposal |
|---|---|---|---|
| G2 | VIEWER + treasury | **FIXED product+AI:** matrix sin TREASURY; `canViewTreasury` = VIEW TREASURY | D-111 |
| G1 | VIEW PROJECTS OR procurement | **FIXED G1-C:** procurement sin OR PROJECTS; docs separados | D-111 |
| G3 | Project ACL | **Schema+helpers:** `ProjectMembership` + `projectAccessMode` default TENANT_WIDE (DEV migrated) | D-111 |
| G4 | Capabilities | **Helpers:** `canViewProjectFinancials*`, `canViewCompanyFinancials*`, `canViewTreasury` | D-111 |

**Decision required before Prisma/migrations.** This lot uses existing helpers + stricter AI advertise for procurement (G1 mitigated at advertise only).

## Personalization

- `actorPreferredName` from session `user.name` first token (never from prompt).
- Used sparingly: first turn greeting, executive briefs, alerts — not every DIRECT answer.
- `get_current_context` returns preferredName + roleLabels only (no email, no companyId).

## How to re-run

```bash
pnpm --filter @bloqer/services exec node --import tsx --test src/ai/zero-trust-access.test.ts src/ai/registry.test.ts src/ai/read-only.test.ts src/ai/context-isolation.test.ts
# Live (Neon DEV only):
BLOQER_AI_LIVE_DB=1 pnpm --filter @bloqer/services exec node --import tsx --test src/ai/live-isolation.test.ts
```
