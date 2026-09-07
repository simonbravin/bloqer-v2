# Bloqer AI — Product Roadmap (canónico)

> **Estado:** vigente (visión de producto).  
> **Fecha:** 2026-09-06.  
> **No es arquitectura:** el diseño técnico vive en [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md) y [ADR-017](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md).  
> **No es scorecard:** evidencia de calidad/seguridad en [`BLOQER_AI_MVP_SCORECARD.md`](./BLOQER_AI_MVP_SCORECARD.md), [`BLOQER_AI_SECURITY_SCORECARD.md`](./BLOQER_AI_SECURITY_SCORECARD.md), [`BLOQER_AI_TOOL_AUDIT.md`](./BLOQER_AI_TOOL_AUDIT.md).  
> **Cambio funcional:** siempre [`CHANGE_IMPACT_POLICY.md`](./CHANGE_IMPACT_POLICY.md) (Help + Guía + AI + evals).

---

## 1. Visión

Bloqer AI debe evolucionar de **interfaz conversacional del ERP** a **plataforma de herramientas autorizadas**, no un chatbot que narre dashboards.

| Etapa | Rol | Idea |
|---|---|---|
| **1** | Asistente | Ayuda + consultas grounded sobre datos autorizados |
| **2** | Analista | Interpreta, correlaciona, compara períodos, prioriza |
| **3** | Copiloto | Prepara operaciones con preview |
| **4** | Agente | Ejecuta acciones autorizadas con confirmación y auditoría |
| **5** | Plataforma | Tools reutilizables por otros agentes (MCP) |

**Anti-visión:** narrar pantallas sin tools; inventar métricas/causalidad; SQL libre; ampliar privilegios; construir módulos (Inventario, contabilidad, …) “solo para la IA”.

---

## 2. Mapa de documentos (no duplicar)

| Documento | Rol |
|---|---|
| Este archivo | **Roadmap de producto** — fases, estados, criterios, qué no incluye |
| [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md) | Principios, capas, registry, provider, risk levels, MCP diseño |
| [ADR-017](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md) | Decisión: tool layer + `AiProvider` |
| [`BLOQER_AI_TOOL_AUDIT.md`](./BLOQER_AI_TOOL_AUDIT.md) | Inventario factual de tools READ |
| [`BLOQER_AI_SECURITY_SCORECARD.md`](./BLOQER_AI_SECURITY_SCORECARD.md) | Controles zero-trust + D-111 |
| [`BLOQER_AI_RBAC_GAPS_DESIGN.md`](./BLOQER_AI_RBAC_GAPS_DESIGN.md) | G1–G4 / D-111 |
| [`BLOQER_AI_MVP_SCORECARD.md`](./BLOQER_AI_MVP_SCORECARD.md) | Gates de calidad (histórico + checklist) |
| [`BLOQER_AI_EVAL_RUNBOOK.md`](./BLOQER_AI_EVAL_RUNBOOK.md) | Cómo correr evals |
| [`BLOQER_AI_MANUAL_SMOKE.md`](./BLOQER_AI_MANUAL_SMOKE.md) | Smoke manual local |
| [`CHANGE_IMPACT_POLICY.md`](./CHANGE_IMPACT_POLICY.md) | Help + Guía + AI en el mismo PR |
| [D-090](./00-product/DECISION_LOG.md) / [D-111](./00-product/DECISION_LOG.md) | Ayuda in-app; ACL de obras |

Leyenda de estados en este roadmap:

| Tag | Significado |
|---|---|
| **IMPLEMENTADO** | En código y usable bajo flags/env actuales |
| **PARCIAL** | Existe base; faltan piezas, endurecimiento o evidencia |
| **PENDIENTE** | En alcance de la fase; aún no hecho |
| **FUTURO** | Fuera de la fase actual; no iniciar sin necesidad demostrada |

---

## 3. Reglas permanentes (todas las fases)

1. **AI nunca amplía privilegios** — advertise + execute ≤ UI/services; a menudo más estricto (ej. treasury / procurement).
2. **Tenant / project / permisos se validan en backend** — sesión → `ServiceContext` → services; el modelo no aporta identidad ni `tenantId`.
3. **Datos y agregados solo sobre alcance autorizado** — incluir D-111 `TENANT_WIDE` vs `MEMBERSHIP_SCOPED` cuando aplique.
4. **Las tools pertenecen a Bloqer** — mismo `BloqerAiToolRegistry` para chat y (futuro) MCP; no tools “del proveedor”.
5. **Change Impact** — todo cambio funcional evalúa Help + Guía + knowledge/tools/evals ([`CHANGE_IMPACT_POLICY.md`](./CHANGE_IMPACT_POLICY.md)).
6. **No módulos solo para IA** — Inventario, contabilidad u otros no se construyen para “alimentar” al asistente.
7. **No features sin necesidad funcional demostrada** — cada lote con problema de usuario, criterio de aceptación y scorecard/evals cuando toque.
8. **Risk ladder** — `READ` → `PREPARE` → `WRITE_CONFIRM` (arquitectura §11); sin saltar a writes autónomos.
9. **Provider-agnostic** — ADR-017 / `AiProvider`; modelo vía config Bloqer, no hardcode de vendor en services.

---

## 4. Estado actual (snapshot 2026-09-06)

### IMPLEMENTADO (núcleo V1)

- Package `@bloqer/ai` + adapters (OpenAI-compatible, Fake) + orquestación ([ADR-017](./08-architecture/ARCHITECTURE_DECISION_RECORDS.md)).
- Tool layer READ en `@bloqer/services` (~17 tools auditadas) — [`BLOQER_AI_TOOL_AUDIT.md`](./BLOQER_AI_TOOL_AUDIT.md).
- UI Sheet/FAB, `POST /api/ai/chat`, knowledge BM25 + help, presentation (executive/direct/help), personalización de nombre desde sesión.
- Zero-trust: policy/advertise/execute, minimización DTO, deny messages, Luna/`reasoning_effort` hardening.
- Rate limit **in-memory** por user/tenant (AI-only).
- Evals harness (structural + live; filtros `--ids` / `--id-prefix`), isolation + D-111 live tests (DEV), Playwright Fake.
- D-111 schema/ACL/UI (default **TENANT_WIDE**; SCOPED no activado en production tenants).
- Documentación operativa AI en Guía + help donde aplica; Change Impact Policy vigente.

### PARCIAL

- **Calidad live modelo:** smoke Luna acotado verde en DEV; scorecards históricos aún marcan live broad / staging incompleto — actualizar evidencia tras smoke production.
- **Rate limit:** no distribuido (multi-instance aproximado).
- **Observabilidad / costos:** logs estructurados básicos; sin cuotas/billing ni dashboards de consumo.
- **MVP scorecard:** documento desactualizado vs release controlado — tratar como checklist, no como veredicto único.
- **Arquitectura.md header:** texto “implementación pendiente” es histórico; la verdad de producto es este roadmap + scorecards.

### PENDIENTE (cierre V1 / prep V1.5)

- Smoke autenticado production (módulos + AI + treasury deny) documentado.
- Rate limit distribuido; cuotas/alertas de costo.
- Observabilidad AI (latencia, tool mix, errores, tokens) alineada a [`OBSERVABILITY_ARCHITECTURE.md`](./08-architecture/OBSERVABILITY_ARCHITECTURE.md).
- Historial persistente, Admin provider/BYOK (V1.5).
- PREPARE / WRITE (V3); MCP (V4).

### FUTURO (explícito)

- Agentes background autónomos, SQL, acceso al repo, writes sin confirmación.
- Contabilidad / Inventario “porque la IA lo pide”.
- Multi-vendor fallback automático sin decisión de producto.

---

## 5. V1 — Asistente confiable

**Prioridad:** P0 — estabilizar lo ya shipped.  
**Objetivo:** que un usuario autorizado confíe en ayuda + consultas READ grounded, con seguridad y UX predecibles.

### Capacidades

| Capacidad | Estado |
|---|---|
| Help / knowledge “cómo hago X” | IMPLEMENTADO |
| Consultas operativas/financieras READ vía tools | IMPLEMENTADO |
| Presentation + links seguros + preferredName | IMPLEMENTADO |
| Zero-trust + D-111 inheritance (cuando SCOPED) | IMPLEMENTADO (SCOPED off en prod) |
| Evals + E2E Fake + smoke harness | IMPLEMENTADO / PARCIAL evidencia prod |
| Rate limit in-memory | IMPLEMENTADO |
| Rate limit distribuido / cuotas / costos | PENDIENTE |
| Observabilidad AI de producto | PENDIENTE |
| Historial cross-device | FUTURO → V1.5 |

### Dependencias

- Services y RBAC existentes; knowledge index fresco (`pnpm ai:index-docs` / check).
- Flags env (`BLOQER_AI_*`, latch production) — no cambiar sin decisión.
- Change Impact en cada ajuste de tools/labels.

### Riesgos

- Alucinación / tool mal elegido bajo prompts edge.
- Rate limit in-memory insuficiente bajo multi-instance.
- Scorecards desalineados confunden “listo / no listo”.
- Activar `MEMBERSHIP_SCOPED` en prod sin memberships → empty views (fuera de AI, pero afecta tools).

### Criterios de aceptación

- [ ] Smoke production autenticado (login → módulos clave + 4 prompts AI + deny treasury) OK.
- [ ] Sin leaks cross-tenant / unauthorized READ en suites isolation (DEV live cuando se corra).
- [ ] 0 tools WRITE en registry default.
- [ ] E2E Fake verde; smoke Luna DEV reproducible (`--id-prefix=release-smoke-` o equivalente).
- [ ] Errores de provider no exponen raw vendor / secrets.
- [ ] Docs Help/Guía alineadas a comportamiento real.

### Qué NO incluye V1

- Admin de modelo/keys, BYOK, historial Prisma.
- Comparaciones temporales / correlaciones nuevas (V2).
- PREPARE / WRITE_CONFIRM (V3).
- MCP (V4).
- Nuevos módulos de dominio “para la IA”.

---

## 6. V1.5 — Administración y experiencia

**Prioridad:** P1 — después de V1 estable en prod.  
**Objetivo:** operar el asistente como producto (config, privacidad, consumo) sin romper provider-agnostic.

### Capacidades (todas PENDIENTE salvo nota)

| Capacidad | Estado |
|---|---|
| Config proveedor/modelo desde Admin | PENDIENTE |
| Credenciales seguras (KMS / secret store; ver architecture § secrets) | PENDIENTE |
| Política global / tenant / BYOK | PENDIENTE |
| Historial persistente con retención y controles de privacidad | PENDIENTE (requiere D-xxx + migración) |
| Controles de consumo (cuotas, alertas, export uso) | PENDIENTE |
| Mantener `AiProvider` / registry sin lock-in | IMPLEMENTADO (base); extender en Admin |

### Dependencias

- Decisión de producto + ADR/KMS antes de persistir keys o chats ([`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md) §13).
- Multitenancy y auditoría existentes.

### Riesgos

- Keys en DB sin KMS; filtrado de historial sensible; BYOK mal scoped.
- UI Admin que bypasee latch production.

### Criterios de aceptación

- [ ] Ningún secret en repo / logs; rotación documentada.
- [ ] Cambio de modelo/provider sin tocar tools/services.
- [ ] Historial: isolation tenant + borrado/retención; no es fuente de auth.
- [ ] Cuotas: deny claro sin leaks; métricas auditables.
- [ ] Change Impact + evals de regresión tras cambios de UX Admin.

### Qué NO incluye V1.5

- Intelligence V2 (salvo telemetría de calidad).
- Writes / MCP.
- Inventar tablas de “AI analytics” desacopladas del ERP sin necesidad.

---

## 7. V2 — Intelligence / Analista

**Prioridad:** P2 — solo con necesidad operativa demostrada (no “más insights”).  
**Objetivo:** interpretar y priorizar sobre **datos y read-models reales**, sin causalidad inventada.

### Capacidades (FUTURO / diseño)

| Capacidad | Estado |
|---|---|
| Comparar períodos / tendencias / “qué cambió” | FUTURO |
| Correlaciones entre módulos (ej. OC atrasadas ↔ cash) | FUTURO |
| Alertas explicables + recomendaciones priorizadas | PARCIAL (summary/alerts de tools hoy); deep-dive FUTURO |
| Deep-dives multi-tool con evidencia citada | PARCIAL (multi-tool hoy); formalizar FUTURO |
| Read-models históricos dedicados | FUTURO — inventariar fuentes existentes primero |

### Dependencias

- Inventario de series temporales / snapshots / reports ya en producto ([`06-reports/`](./06-reports/), reporting architecture).
- V1 grounding estable (sin esto, el analista alucina con estilo).

### Riesgos

- Inventar métricas o causalidad.
- Agregar tablas/ETL solo para la IA.
- Comparaciones cross-project bajo SCOPED mal filtradas.

### Criterios de aceptación

- [ ] Cada insight cita tool/provenance (período, alcance, filtros).
- [ ] Si falta dato histórico → decirlo; no interpolar.
- [ ] Evals de groundedness / “no inventar %” ≥ umbrales acordados.
- [ ] Sin módulos nuevos “alimentadores”.

### Qué NO incluye V2

- WRITE / MCP.
- Causalidad automática tipo “porque X entonces Y” sin regla de negocio documentada.
- Contabilidad gerencial nueva.

---

## 8. V3 — Copiloto y agente con confirmación

**Prioridad:** P3.  
**Objetivo:** `READ` → `PREPARE` → `WRITE_CONFIRM` usando **services existentes**, con preview, permisos humanos **y** permiso/flag de IA, idempotencia, audit y errores seguros.

Diseño de referencia: [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md) §11.

### Capacidades (FUTURO)

| Capacidad | Estado |
|---|---|
| Tools `PREPARE` (preview, sin side-effect) | FUTURO (tipos/risk existen; 0 tools) |
| Tools `WRITE_CONFIRM` vía service + confirmación UI | FUTURO |
| Idempotency keys + transacciones | FUTURO (reutilizar patrones API existentes) |
| Audit log de acciones AI | FUTURO |
| Separar reversibles vs pagos / anulaciones / sensibles | FUTURO (política de producto) |
| Permiso específico “AI puede mutar X” además del rol humano | FUTURO (D-xxx) |

### Dependencias

- Service layer e idempotencia actuales ([`SERVICE_LAYER.md`](./08-architecture/SERVICE_LAYER.md), API structure).
- Decisión de producto por acción (qué puede preparar/ejecutar cada rol).
- V1 seguridad sólida (advertise/execute).

### Riesgos

- Escalada de privilegios vía cadena de tools.
- Confirmación débil / UI engañosa.
- Pagos y anulaciones tratados como “cancelar SC”.
- SQL libre o scripts ad hoc (prohibido).

### Criterios de aceptación

- [ ] Ninguna mutación sin `WRITE_CONFIRM` + confirmación explícita del usuario.
- [ ] Preview muestra entidad, efecto y alcance (tenant/obra).
- [ ] Misma autoridad que UI (+ denegación extra de AI si aplica).
- [ ] Idempotencia y audit en cada write.
- [ ] Evals adversariales: prompt injection no logra write.
- [ ] Taxonomía: reversibles vs sensibles documentada antes del primer write money-moving.

### Qué NO incluye V3

- Ejecución autónoma sin humano en el loop.
- SQL / Prisma desde el modelo.
- MCP como bypass de confirmación (MCP hereda mismos risks).

---

## 9. V4 — Ecosistema

**Prioridad:** P4.  
**Objetivo:** exponer el **mismo** registry a agentes externos vía MCP; adapters e integraciones con auth y límites propios.

Diseño: [`BLOQER_AI_ARCHITECTURE.md`](./BLOQER_AI_ARCHITECTURE.md) §12.

### Capacidades (FUTURO)

| Capacidad | Estado |
|---|---|
| MCP adapter sobre `BloqerAiToolRegistry` | FUTURO |
| Adapters de providers adicionales | FUTURO (base OpenAI-compatible parcial) |
| Integraciones externas / automatizaciones | FUTURO |
| Authz + rate limits + audit específicos por cliente MCP | FUTURO |

### Dependencias

- V1–V3 policies claras (sobre todo WRITE).
- Identidad de actor MCP ≠ “sistema omnisciente”.

### Riesgos

- Segundo camino de auth más débil que el chat.
- Tools distintas “para Cursor” que diluyen el registry.
- Automatizaciones que escriben sin confirmación humana.

### Criterios de aceptación

- [ ] Mismos schemas, risks y services que el chat de producto.
- [ ] App runtime no depende de MCP.
- [ ] Authn/authz + límites documentados por integración.
- [ ] 0 SQL / 0 acceso a Neon desde el agente externo.

### Qué NO incluye V4

- Reemplazar el portal por un IDE.
- Exponer Admin/secrets vía MCP.
- Background agents sin política de producto.

---

## 10. Secuencia recomendada (alto nivel)

```
V1 estable (smoke prod + observabilidad/cuotas mínimas)
  → V1.5 Admin / historial / consumo (con KMS + D-xxx)
    → V2 Analista (solo con datos históricos reales)
      → V3 PREPARE → WRITE_CONFIRM (acciones acotadas)
        → V4 MCP / ecosistema
```

No paralelizar V3 WRITE con V2 “insights inventados”. No abrir V4 antes de que el registry y los risks estén estables.

---

## 11. Próximo lote pequeño (post smoke production)

**Condición:** cerrar smoke autenticado production (módulos + AI + treasury deny) y confirmar `TENANT_WIDE` / SCOPED=0.

Lote sugerido (**solo V1 cierre**, sin Admin ni WRITE):

1. **Actualizar evidencia:** refrescar veredictos en scorecards (MVP + security) con resultados del smoke prod + Luna DEV; no reinventar arquitectura.
2. **Observabilidad mínima:** métricas/logs acordados (latencia chat, tool counts, deny codes, errores provider) — sin dashboard fancy.
3. **Rate limit / cuotas:** diseño corto + implementación del mínimo viable **distribuido** o documentar límite in-memory como riesgo aceptado con owner.
4. **Higiene docs:** alinear header de `BLOQER_AI_ARCHITECTURE.md` al estado real (apuntando a este roadmap); regenerar knowledge index si Help/Guía cambiaron en el release.

**Explicitamente fuera del lote:** Admin BYOK, historial Prisma, tools PREPARE/WRITE, MCP, activar `MEMBERSHIP_SCOPED` en tenants reales, módulos nuevos.

---

## Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-06 | Creación del roadmap canónico V1→V4 + reglas permanentes + lote post-smoke |
| 2026-09-06 | Nota: el comentario histórico en la migration SQL D-111 no se edita post-apply (checksum Prisma); la verdad operativa es este roadmap + default TENANT_WIDE |
