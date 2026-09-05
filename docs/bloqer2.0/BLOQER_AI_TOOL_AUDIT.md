# Bloqer AI — Tool Audit (MVP READ-only)

> **Fecha de auditoría:** 2026-09-04 (código en `packages/services/src/ai/`).  
> **Alcance:** 17 tools del registry MVP (`createDefaultBloqerAiToolRegistry`).  
> **Criterio:** factual — services reales, tenant vía `ServiceContext`, project vía `resolveAiProjectId` + `requireProjectInTenant`, sin `tenantId` del LLM.  
> **Resultado:** `PASS` = cumple invariantes MVP; `WARN` = cumple pero con riesgo operativo (volumen, sensibilidad, o gate incompleto a nivel tool).

---

## Invariantes confirmados (transversales)

| Invariante | Evidencia |
|---|---|
| **No LLM-supplied `tenantId`** | `buildAiExecutionContext` toma `service` de sesión autenticada. Tools no aceptan `tenantId` en schema. |
| **Project isolation** | `resolveAiProjectId` → `requireProjectInTenant(candidate, ctx.service.tenantId)`. Args `projectId` opcionales se validan igual. |
| **Reuse de services** | Tools llaman services existentes (`listProjects`, aging, procurement, etc.); no Prisma directo desde tools. |
| **Module gate registry** | `BloqerAiToolRegistry.execute` chequea `requiredModules` vía `getTenantModuleGate` antes de ejecutar. |
| **Solo READ** | Todas las tools del registry default tienen `risk: "READ"`. |
| **Límites / truncación** | Donde hay listas: `limit`/`pageSize` + `truncation` o `slice` en la mayoría. |

---

## Tabla de auditoría

| Tool | Service usado | Tenant | Project | Permission | Module Gate | Limit | Datos sensibles | Resultado |
|---|---|---|---|---|---|---|---|---|
| `get_current_context` | `getTenantModuleGate` (+ campos de `AiExecutionContext`) | Sesión (`ctx.service`); no input LLM | Hint `currentProjectId` solo lectura; no resolve obligatorio | Roles/display de sesión | Ninguno a nivel tool (filtra enabled modules) | N/A (objeto fijo) | Roles, route, projectId de UI — sin secretos | **PASS** |
| `search_projects` | `listProjects` | Vía `ctx.service` en service | N/A (tenant-wide search) | Dentro de `listProjects` / PROJECTS | `PROJECTS` | `pageSize` default 10, max 20 + `truncation` | Nombre cliente, código obra | **PASS** |
| `get_project_summary` | `getProjectOverviewDashboard` | Sesión | `resolveAiProjectId` obligatorio | Dentro del dashboard / access de obra | `PROJECTS` | Dashboard completo (sin top-N extra) | KPIs, alertas, actividad agregada | **PASS** (WARN menor: payload amplio) |
| `get_project_schedule_summary` | `getProjectScheduleWorkspace` | Sesión | `resolveAiProjectId` obligatorio | Dentro schedule service / `canViewScheduleArea` | `PROJECTS`, `SCHEDULE` | Summary agregado | Progreso / totales cronograma | **PASS** |
| `get_delayed_schedule_items` | `getProjectScheduleWorkspace` (`delayedOnly`) | Sesión | `resolveAiProjectId` obligatorio | Igual schedule | `PROJECTS`, `SCHEDULE` | default 15, max 20 + `truncation` | Nombres de tareas, días de atraso | **PASS** |
| `get_project_material_shortages` | `getProjectMaterialsBoard` | Sesión | `resolveAiProjectId` obligatorio | Dentro materials board | `PROJECTS`, `BUDGETS` | default 20, max 30 + `truncation` | Cantidades need/ordered/shortfall | **PASS** |
| `search_purchase_requests` | `listPurchaseRequestsByProject` | Sesión | `resolveAiProjectId` obligatorio | Dentro procurement access | `PROCUREMENT` | default 20, max 30 + `truncation` (lista completa en memoria antes de slice) | Números SC, fechas | **PASS** / **WARN** escala en obras grandes |
| `search_purchase_orders` | `listPurchaseOrdersByProject` | Sesión | `resolveAiProjectId` obligatorio | Dentro procurement | `PROCUREMENT` | default 20, max 30 + `truncation` | Proveedor, montos, status | **PASS** / **WARN** escala |
| `get_purchase_order` | `getPurchaseOrderById` | Sesión (tenant check en service) | Derivado del PO (`po.projectId`); id por UUID | Dentro `getPurchaseOrderById` | `PROCUREMENT` | 1 entidad; `lineCount` sin volcar todas las líneas | Proveedor, monto, **notes** | **PASS** (WARN: notes pueden ser texto libre) |
| `get_pending_purchase_orders` | `getProjectProcurementHub` + `listPurchaseOrdersByProject` | Sesión | `resolveAiProjectId` obligatorio | Dentro hub/list | `PROCUREMENT` | top 10 approval + top 10 receipt | Proveedor, montos pendientes | **PASS** |
| `get_recent_jobsite_logs` | `listJobsiteLogsByProject` | Sesión | `resolveAiProjectId` obligatorio | Dentro jobsite access | `JOBSITE_LOG` | default 10, max 20 + `truncation` | Fechas, weather, status | **PASS** / **WARN** lista completa antes de slice |
| `get_project_field_summary` | `getMyFieldPendingCounts` + `getFieldHome` | Sesión | `resolveAiProjectId` opcional | Dentro field services | **Ninguno** en `requiredModules` | `todayItems` slice 10 | Pendientes del actor, acciones | **WARN** (sin module gate explícito a nivel tool; confía en services) |
| `get_payables` | `summarizePayablesByProject` / `getPayableAgingReport` + `canViewCompanyAp` | Sesión | Opcional vía `resolveAiProjectId`; sin proyecto → company si permiso | Project AP o `canViewCompanyAp` | `AP` | default 15, max 30 + `truncation` | Contactos, saldos, días vencidos | **PASS** |
| `get_receivables` | `summarizeReceivablesByProject` / `getReceivableAgingReport` + `canViewCompanyAr` | Sesión | Igual patrón que payables | Project AR o `canViewCompanyAr` | `AR` | default 15, max 30 + `truncation` | Clientes, saldos, aging | **PASS** |
| `get_cash_position` | `getTreasuryHubOverview` | Sesión | N/A (empresa) | Dentro treasury hub / finance access | `TREASURY` | `recentMovements` top 8 | **Saldos por moneda**, flujos, movimientos | **PASS** (sensibilidad alta, esperado) |
| `get_project_certification_summary` | `listCertificationsByProject` | Sesión | `resolveAiProjectId` obligatorio | Dentro certification service | `CERTIFICATIONS` | recent top 8; carga lista completa para conteos | Números/periodos de certificaciones | **PASS** / **WARN** escala |
| `search_bloqer_knowledge` | `searchKnowledge` (BM25 `@bloqer/ai`) + `searchHelp` inyectado desde web | N/A (docs/help públicos del producto, no datos de obra) | N/A | N/A | Ninguno | default 6, max 10; excerpt docs 500 chars | Solo guía/ayuda (sin datos tenant) | **PASS** |

---

## Resumen

| Resultado | Cantidad | Notas |
|---|---|---|
| **PASS** puro | 10 | Contexto, projects search, schedule summary/delayed, materials, pending POs, payables, receivables, cash, knowledge |
| **PASS con WARN menor** | 6 | Summary amplio; procurement/jobsite/certs list-then-slice; PO notes |
| **WARN** (gate) | 1 | `get_project_field_summary` sin `requiredModules` — mitigado por access en field services |
| **FAIL** | 0 | No se halló tool que acepte `tenantId` del modelo ni bypass de `requireProjectInTenant` en paths con project |

### Conclusión de auditoría

El tool layer MVP **reutiliza services**, **no confía tenant/user al LLM**, y **valida project** con `resolveAiProjectId` + `requireProjectInTenant`. Los WARN son de volumen en memoria, sensibilidad financiera esperada, o ausencia de module gate explícito en Field — no de fuga cross-tenant por diseño.

**Próximo hardening recomendado:** paginación real en listados procurement/jobsite/certs; evaluar `requiredModules` para Field; no cachear resultados operativos entre requests.
