# Open Questions — Bloqer 2.0

> Preguntas funcionales que **no bloquean la generación de la base documental**, pero que deben resolverse antes o durante la implementación de cada módulo.  
> Cada pregunta tiene un ID `Q-NNN`. Cuando se resuelve, se mueve a [`DECISION_LOG.md`](./DECISION_LOG.md) y se marca aquí como `RESUELTA → D-NNN`.

---

## Formato

```
### Q-NNN — <Pregunta corta>

- **Categoría:** <módulo / transversal>
- **Estado:** ABIERTA | EN DEBATE | RESUELTA → D-NNN
- **Impacto si no se resuelve:** <qué bloquea>
- **Opciones identificadas:** <lista>
- **Recomendación inicial:** <sugerencia del equipo>
```

---

## Preguntas abiertas

### Q-001 — Multi-empresa por tenant

- **Categoría:** Multitenancy
- **Estado:** EN DEBATE (núcleo N:1 **Company** bajo **Tenant** ya decidido — ver [ADR-Phase1-02](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md); **corte Phase 1 de membresía** → [D-036](./DECISION_LOG.md); pendiente el **caso de uso usuario ↔ varias empresas simultáneas** dentro del mismo tenant si el negocio lo exige).
- **Impacto si no se resuelve:** no queda claro cómo un mismo login opera en razón social X **y** Y con numeración y GL acotados por empresa; riesgo de mezclar contexto en reportes.
- **Opciones (tenant vs razón social):**
  1. Tenant 1:1 con empresa (razón social).
  2. Tenant puede contener múltiples empresas (razones sociales) con datos compartidos pero contabilidad separada.
- **Resolución parcial (2026-05-13):** en implementación vigente, **Alternativa B** (varias `Company` por `Tenant`) está **aceptada en ADR-Phase1-02**. `UserMembership.companyId` es nullable (membresía “a todo el tenant” vs anclada a una empresa).
- **Sub-problema abierto — mismo usuario en empresa X e Y (mismo tenant):** hoy Prisma impone `@@unique([userId, tenantId])` en `UserMembership` → **como máximo una fila de membresía por par usuario+tenant**, con un solo `companyId`. Un **selector de empresa en el shell** que permita alternar X/Y **sin migración** solo sirve si ese usuario **cambia** de `companyId` en esa única membresía (no pertenencias simultáneas a dos sociedades). Para **dos pertenencias activas** (p. ej. PEPE auditor en X y en Y) hace falta **evolución de modelo**: p. ej. relajar unicidad a `(userId, tenantId, companyId)`, tabla `user_company_access`, o membresías múltiples con reglas de `ctx.companyId` — documentar en ADR antes de tocar producción.
- **Recomendación inicial:** si el caso “una persona, dos sociedades” es real, priorizar diseño de **membresía por empresa** + **contexto `companyId` en sesión** alineado a `buildTenantServiceContext`; si no, mantener membresía única y selector solo cuando haya **una** empresa asignada y varias `Company` en el tenant para admins globales.
- **Bloquea:** [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md), [`07-non-functional/MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md), selector global de empresa en UI (sin segunda membresía hasta variante 0B + ADR).

### Q-002 — Numeración de comprobantes

- **Categoría:** Operativo / legal
- **Estado:** ABIERTA
- **Impacto:** afecta OCs, certificados, facturas, recibos.
- **Opciones:**
  1. Numeración por **empresa** (correlativa única por tipo de comprobante).
  2. Numeración por **proyecto**.
  3. Numeración configurable por tipo (ej. facturas por empresa, OCs por proyecto).
- **Recomendación:** opción 3, con default a empresa.
- **Bloquea:** [`02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`02-modules/SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md).

### Q-003 — Cronograma: Gantt, hitos o ambos

- **Categoría:** Cronograma
- **Estado:** ABIERTA
- **Impacto:** define la complejidad del módulo.
- **Opciones:**
  1. Gantt clásico con tareas, dependencias, duración.
  2. Solo hitos (milestones) con fecha esperada y avance.
  3. Híbrido: hitos como ciudadanos primarios + tareas detalladas opcionales.
- **Recomendación:** opción 3. Permite empresas chicas usar solo hitos; empresas grandes usar Gantt completo.
- **Bloquea:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

### Q-004 — Vinculación cronograma ↔ WBS

- **Categoría:** Cronograma / Presupuesto
- **Estado:** ABIERTA
- **Impacto:** define si una tarea de cronograma "es" un ítem del WBS o son entidades independientes con relación opcional.
- **Opciones:**
  1. Tarea de cronograma = ítem del WBS (1:1).
  2. Cronograma y WBS independientes con vínculo N:M opcional.
  3. WBS jerárquico se "expande" automáticamente como cronograma editable.
- **Recomendación:** opción 2.
- **Bloquea:** [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

### Q-005 — Libro de obra: firma digital y aprobación externa

- **Categoría:** Libro de Obra
- **Estado:** ABIERTA
- **Impacto:** define si los partes diarios son legalmente válidos sin papel.
- **Opciones:**
  1. Solo registro interno, sin valor legal externo.
  2. Firma digital con timestamp para uso interno entre PM y Owner.
  3. Aprobación de inspector externo (cliente o dirección de obra) con su propio rol.
- **Recomendación:** opción 1 en Fase 1, opción 3 en Fase 2/3.
- **Bloquea:** [`02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md).

### Q-006 — RFIs con SLA

- **Categoría:** RFIs
- **Estado:** ABIERTA
- **Impacto:** complejidad del módulo.
- **Opciones:**
  1. Sin SLA, solo estados manuales.
  2. SLA configurable por proyecto con alertas automáticas al vencer.
  3. SLA configurable por tipo de RFI (urgente / normal / consultivo).
- **Recomendación:** opción 2 desde Fase 1.
- **Bloquea:** [`02-modules/RFIS.md`](../02-modules/RFIS.md), [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md).

### Q-007 — Conciliación bancaria: importación de extractos

- **Categoría:** Tesorería
- **Estado:** ABIERTA
- **Impacto:** define si Fase 1 es 100% manual.
- **Opciones:**
  1. Manual completa en Fase 1, importación CSV/OFX en Fase 2.
  2. Importación CSV mínima desde Fase 1.
  3. Integración bancaria directa en Fase 3 (post-fase 2).
- **Recomendación:** opción 1 (lockeada como predeterminada). Confirmar.
- **Bloquea:** [`02-modules/BANK_RECONCILIATION.md`](../02-modules/BANK_RECONCILIATION.md).

### Q-008 — Documentos: versionado y check-in/check-out

- **Categoría:** Documentos
- **Estado:** ABIERTA
- **Impacto:** complejidad del módulo de documentos.
- **Opciones:**
  1. Sin versionado, solo última versión.
  2. Versionado simple (cada upload sobre el mismo doc crea versión nueva).
  3. Versionado + check-in/check-out (lock para edición exclusiva).
- **Recomendación:** opción 2.
- **Bloquea:** [`02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md).

### Q-009 — Notificaciones: email desde día 1

- **Categoría:** Notificaciones
- **Estado:** ABIERTA
- **Impacto:** define infraestructura de email en Fase 1.
- **Opciones:**
  1. Solo in-app en Fase 1, email en Fase 2.
  2. In-app + email transaccional desde Fase 1 (vencimientos, aprobaciones).
  3. In-app + email + opciones avanzadas (digest diario, etc.) desde Fase 1.
- **Recomendación:** opción 2.
- **Bloquea:** [`02-modules/NOTIFICATIONS.md`](../02-modules/NOTIFICATIONS.md).

### Q-010 — Query Builder: visual o por filtros

- **Categoría:** Reportes
- **Estado:** ABIERTA
- **Impacto:** complejidad del constructor.
- **Opciones:**
  1. Visual drag-drop (estilo Looker / Metabase).
  2. Filtros + columnas + agregaciones (estilo simple, dropdowns).
  3. SQL-like guiado (avanzado).
- **Recomendación:** opción 2 en Fase 1, opción 1 en Fase 2.
- **Bloquea:** [`06-reports/QUERY_BUILDER.md`](../06-reports/QUERY_BUILDER.md).

### Q-011 — Costo financiero del presupuesto

- **Categoría:** Fórmulas / presupuesto
- **Estado:** ABIERTA
- **Impacto:** afecta cálculo de costo total y precio de venta.
- **Opciones:**
  1. Tasa fija anual cargada por empresa (simple).
  2. Tasa fija por presupuesto (más flexible).
  3. Curva de tasa según mes/avance (avanzado).
- **Recomendación:** opción 2 en Fase 1.
- **Bloquea:** [`04-formulas/BUDGET_FORMULAS.md`](../04-formulas/BUDGET_FORMULAS.md).

### Q-012 — Subcontratos: avance certificado igual que proyecto, o por hitos

- **Categoría:** Subcontratos
- **Estado:** ABIERTA
- **Impacto:** modelo del módulo.
- **Opciones:**
  1. Subcontrato es "mini-proyecto" con WBS propio y certificaciones de avance físico/económico.
  2. Subcontrato avanza solo por hitos definidos en el contrato.
  3. Configurable por subcontrato (depende de su tipo).
- **Recomendación:** opción 3 en Fase 1.
- **Bloquea:** [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md).

### Q-013 — Imputación de gastos generales (GG) a proyectos

- **Categoría:** Costeo
- **Estado:** ABIERTA
- **Impacto:** afecta rentabilidad neta por proyecto.
- **Opciones:**
  1. Prorrateo manual mensual por Admin.
  2. % fijo configurado por empresa, aplicado automáticamente sobre costos directos.
  3. Prorrateo automático según costo directo del periodo.
- **Recomendación:** soportar opciones 1 y 2 desde Fase 1; opción 3 en Fase 2.
- **Bloquea:** [`04-formulas/PROFITABILITY_FORMULAS.md`](../04-formulas/PROFITABILITY_FORMULAS.md), [`03-finance/PROFITABILITY_BY_PROJECT.md`](../03-finance/PROFITABILITY_BY_PROJECT.md).

### Q-014 — Cliente externo (Project Viewer) en qué Fase

- **Categoría:** Roles / portales
- **Estado:** ABIERTA
- **Impacto:** define si el cliente accede a su obra desde Fase 1.
- **Opciones:**
  1. Fase 1: PROJECT_VIEWER simple (ve avance certificado).
  2. Fase 2: portal de cliente con login propio.
  3. Fase 3: portal completo con cliente / proveedor / subcontratista.
- **Recomendación:** opción 1 mínima en Fase 1, opciones 2 y 3 en Fases siguientes.
- **Bloquea:** [`USER_ROLES.md`](./USER_ROLES.md), [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md).

### Q-015 — Flujo de invitación de usuarios

- **Categoría:** Usuarios
- **Estado:** ABIERTA
- **Opciones:**
  1. Solo creación por Admin (sin email de invitación).
  2. Invitación por email con activación de cuenta.
  3. Auto-registro con código de tenant.
- **Recomendación:** opción 2.
- **Bloquea:** [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md).

### Q-016 — 2FA obligatorio para roles privilegiados

- **Categoría:** Seguridad
- **Estado:** ABIERTA
- **Opciones:**
  1. 2FA opcional para todos.
  2. 2FA obligatorio para `OWNER` y `ADMIN`.
  3. Política configurable por tenant.
- **Recomendación:** opción 2.
- **Bloquea:** [`07-non-functional/SECURITY_AND_COMPLIANCE.md`](../07-non-functional/SECURITY_AND_COMPLIANCE.md).

### Q-017 — Umbrales de aprobación de OC

- **Categoría:** Compras
- **Estado:** ABIERTA
- **Impacto:** define si hay flujo de 4 ojos automático.
- **Opciones:**
  1. Sin umbral: cualquiera con permiso APPROVE puede aprobar cualquier OC.
  2. Umbral configurable por empresa: OCs sobre cierto monto requieren aprobación de Admin/Owner.
  3. Workflow multinivel (Fase 2).
- **Recomendación:** opción 2 desde Fase 1.
- **Bloquea:** [`02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md`](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [`01-domain/APPROVAL_WORKFLOWS.md`](../01-domain/APPROVAL_WORKFLOWS.md).

### Q-018 — Configuración del método de valuación de stock por depósito

- **Categoría:** Inventario
- **Estado:** ABIERTA
- **Impacto:** flexibilidad del módulo.
- **Opciones:**
  1. Un solo método por empresa (toda la empresa usa FIFO o todo Promedio Móvil).
  2. Método por depósito (cada depósito puede usar uno).
  3. Método por producto (cada producto define el suyo).
- **Recomendación:** opción 1 en Fase 1, opción 2 en Fase 2.
- **Bloquea:** [`02-modules/INVENTORY.md`](../02-modules/INVENTORY.md).

### Q-019 — Stock reservado para obra

- **Categoría:** Inventario
- **Estado:** ABIERTA
- **Impacto:** complejidad del módulo.
- **Opciones:**
  1. Sin reserva: el stock está disponible o egresa.
  2. Reserva manual: usuario puede reservar stock para una obra; baja del disponible.
  3. Reserva automática desde OC pendiente.
- **Recomendación:** opción 2 desde Fase 1.
- **Bloquea:** [`02-modules/INVENTORY.md`](../02-modules/INVENTORY.md).

### Q-020 — Formato exacto de adjuntos / documentos

- **Categoría:** Documentos
- **Estado:** ABIERTA
- **Opciones:**
  1. Solo PDF + imágenes.
  2. Cualquier tipo de archivo (con tamaño máximo).
  3. Tipos permitidos configurables por tenant.
- **Recomendación:** opción 2 con tamaño máximo (ej. 25 MB).
- **Bloquea:** [`02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md), [`02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md).

### Q-021 — Anulación de movimientos confirmados

- **Categoría:** Tesorería
- **Estado:** ABIERTA
- **Opciones:**
  1. Solo Admin/Owner pueden anular movimientos confirmados.
  2. Quien creó puede anular hasta cierto plazo (24h).
  3. Anulación requiere motivo escrito + log de auditoría.
- **Recomendación:** opción 1 + 3 (combinadas).
- **Bloquea:** [`02-modules/TREASURY.md`](../02-modules/TREASURY.md), [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md).

### Q-022 — Devengado: cuándo exponerlo en UI

- **Categoría:** Reportes financieros
- **Estado:** ABIERTA
- **Opciones:**
  1. Devengado solo backend (no expuesto en UI en Fase 1).
  2. Devengado expuesto en Fase 1 como tercera opción del toggle Comprometido / Pagado / Devengado.
  3. Devengado expuesto en Fase 2.
- **Recomendación:** opción 3.
- **Bloquea:** [`06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md).

### Q-023 — Manejo de retenciones acumuladas en certificaciones públicas

- **Categoría:** Certificaciones / impuestos
- **Estado:** ABIERTA
- **Opciones:**
  1. Cada certificación se carga con sus retenciones manuales y listo.
  2. Sistema acumula retenciones por proyecto y se devuelven al final (típico fondo de reparo).
- **Recomendación:** opción 2 con la opción 1 disponible para casos simples.
- **Bloquea:** [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`03-finance/TAXES_AND_WITHHOLDINGS.md`](../03-finance/TAXES_AND_WITHHOLDINGS.md).

### Q-024 — Roles personalizables vs solo predefinidos

- **Categoría:** Permisos
- **Estado:** ABIERTA
- **Opciones:**
  1. Solo los roles predefinidos en `USER_ROLES.md`.
  2. Tenant puede crear "roles custom" combinando permisos.
- **Recomendación:** opción 1 en Fase 1 (alineado con D-012 simpleza). Opción 2 en Fase 2.
- **Bloquea:** [`02-modules/USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md).

### Q-025 — Diferencias de cambio (multi-moneda)

- **Categoría:** Multi-moneda
- **Estado:** ABIERTA
- **Opciones:**
  1. No se calculan diferencias de cambio en Fase 1 (cada movimiento se mantiene en su FX original).
  2. Se calcula diferencia al cobrar/pagar comparando con FX de origen.
  3. Revaluación periódica completa (Fase 3).
- **Recomendación:** opción 1 en Fase 1, opción 2 en Fase 2.
- **Bloquea:** [`03-finance/MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md).

### Q-026 — Plantillas de presupuesto / análisis de precios reutilizables

- **Categoría:** Presupuestos
- **Estado:** ABIERTA
- **Opciones:**
  1. Sin plantillas en Fase 1.
  2. Copiar desde un presupuesto existente.
  3. Biblioteca de plantillas reutilizables a nivel tenant.
- **Recomendación:** opción 2 en Fase 1, opción 3 en Fase 2.
- **Bloquea:** [`02-modules/BUDGETS.md`](../02-modules/BUDGETS.md).

### Q-027 — Cómputo métrico avanzado

- **Categoría:** Presupuestos
- **Estado:** ABIERTA
- **Opciones:**
  1. Cómputo simple (cantidad × precio unitario).
  2. Cómputo con sub-cálculos (área = largo × ancho × alto, etc.).
  3. Cómputo paramétrico avanzado.
- **Recomendación:** opción 2 desde Fase 1.
- **Bloquea:** [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

### Q-028 — Soporte de múltiples planes de cuenta o categorías

- **Categoría:** Master data
- **Estado:** ABIERTA
- **Opciones:**
  1. Categorías de movimiento simples (planas).
  2. Categorías jerárquicas configurables por tenant.
  3. Plan de cuentas formal (desestimado por D-018 conceptual).
- **Recomendación:** opción 2 desde Fase 1.
- **Bloquea:** [`01-domain/MASTER_DATA.md`](../01-domain/MASTER_DATA.md).

### Q-029 — SubcontractCertification `REJECTED`: nuevo ciclo vs corrección en borrador

- **Categoría:** Subcontratos
- **Estado:** RESUELTA → [D-033](./DECISION_LOG.md)
- **Impacto:** define si un certificado `REJECTED` puede reabrirse a `DRAFT` / nuevo número o exige nuevo documento.
- **Opciones:**
  1. Terminal: solo un **nuevo** `SubcontractCertification` (recomendado para trazabilidad).
  2. Permitir `REJECTED` → `DRAFT` con mismo ID para corrección interna.
- **Resolución:** opción 1 lockeada — ver [D-033](./DECISION_LOG.md); regla [BR-SUB-005] en [`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md).
- **Bloquea:** _(cerrado)_ permisos y UX de certificación subcontrato ([`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §19).

### Q-030 — Ingresos corporativos sin proyecto (AR vs GL vs nuevo documento)

- **Categoría:** Finanzas / AR / Contabilidad
- **Estado:** RESUELTA → [D-037](./DECISION_LOG.md) **(Phase 1: opción 2 GL + tesorería)**; reabrir solo si Owner elige implementar opción **(1)** o **(3)**.
- **Impacto si no se resuelve:** no hay cadena operativa estándar para “facturación de servicios de estructura” o ingresos no imputados a obra sin forzar un proyecto real; los usuarios pueden improvisar contabilidad manual o datos fuera del modelo.
- **Contexto:** `SalesInvoice` / `Receivable` / `Collection` llevan `projectId` **obligatorio** en schema (ver BR-AR-003 en comentarios Prisma). Los **egresos** corporativos ya cubren vía AP con `projectId` null ([`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](../08-architecture/FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md) Phase 17A). Este ítem es **solo ingresos**.
- **Opciones identificadas:**
  1. Migración: `projectId` nullable en cadena AR + reglas de numeración, permisos y UI globales bajo `/finanzas`.
  2. Sin AR: registrar solo **`JournalEntry`** + **`TREASURY_INFLOW`** / cobro manual de tesorería según política documentada.
  3. Nuevo documento de ingreso corporativo (distinto de `Expense` y distinto de `SalesInvoice` obra) con propia máquina de estados.
- **Matiz arquitectura (2026-05-13):** elegir (1)/(2)/(3) **no** obliga a “segundo libro” operativo: el libro contable único sigue siendo `JournalEntry` con trazabilidad por `sourceType`/`sourceId` ([D-035](./DECISION_LOG.md)). El riesgo es de **alcance de producto** (qué queda en AR vs solo GL/tesorería), no de duplicar montos en dos ledgers paralelos no documentados.
- **Recomendación / cierre Phase 1 (2026-05-14):** opción **(2)** lockeada — [D-037](./DECISION_LOG.md). Opciones **(1)** y **(3)** quedan para decisión futura explícita si el negocio exige C×C formal sin obra u otro documento.
- **Bloquea:** _(Phase 1 cerrado con D-037)_ “factura de venta empresa” vía **AR sin proyecto** sigue **fuera** hasta nueva decisión; ver [D-035](./DECISION_LOG.md), [D-037](./DECISION_LOG.md). Checklist técnica para ampliaciones futuras: [`Q030_CORPORATE_INCOME_CHECKLIST.md`](../08-architecture/Q030_CORPORATE_INCOME_CHECKLIST.md).

### Q-031 — Acciones masivas en listados (directorio / proyectos)

- **Categoría:** UX / Directorio / Proyectos
- **Estado:** ABIERTA
- **Impacto si no se resuelve:** no hay selección múltiple para archivar, exportar o reasignar en masa; la UI no debe improvisar mutaciones sin reglas de negocio documentadas.
- **Opciones identificadas:**
  1. Archivar contactos / pausar proyectos en lote (requiere permisos y estados en `STATE_MACHINES.md`).
  2. Exportar CSV de la página actual (solo lectura, sin cambio de estado).
  3. Postergar hasta definir flujos con Owner.
- **Recomendación inicial:** opción 3 hasta decisión; si se avanza, priorizar **(2)** antes que mutaciones masivas.
- **Bloquea:** checkboxes y barra de acciones en listados de directorio y proyectos.

---

## Cómo se resuelve una pregunta

1. Discusión con Owner / equipo.
2. Decisión tomada → se mueve a [`DECISION_LOG.md`](./DECISION_LOG.md) con ID `D-NNN`.
3. Acá se marca `RESUELTA → D-NNN`.
4. Se actualiza el documento bloqueado.
