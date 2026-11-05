# Auditoría global e incremental de Bloqer

> Preparado: **03/11/2026**. Alcance de esta entrega: plan y herramientas reutilizables.
> La inspección inicial fue de documentación, estructura y configuración. **No acredita que la plataforma esté auditada ni que se hayan ejecutado sus suites.**
> Este plan organiza trabajo de calidad; no cambia decisiones de producto, estados, arquitectura ni el roadmap de implementación.
> **Avance al 05/11/2026:** AG-00 a AG-06 publicadas; AG-05/06 mediante [PR #4 / Production74bb2c9d](./platform-audit/2026-11-04-ag-05-ag-06-publication.md). **AG-07 cerrada y verificada localmente:** 38 grupos corregidos, D-130 aprobada/implementada, 2.388 pruebas generales y 111 casos SQL distintos aprobados, tipos/lint/compilación y muestra visual. [Informe AG-07](./platform-audit/2026-11-04-ag-07-inventory.md). AG-07 sin publicar; **AG-08 no iniciada**. D-083/D-124/D-128 conservan sus diferimientos.

## 1. Resultado buscado

Revisar y perfeccionar Bloqer mediante lotes acotados que terminen con correcciones comprobables. Cada lote debe conectar la experiencia del usuario con las reglas, permisos, persistencia, efectos y lecturas posteriores. La estética y la facilidad de uso se revisan dentro de cada módulo, además de una etapa dedicada a componentes compartidos.

El resultado de una auditoría es evidencia de los recorridos revisados y un registro de correcciones y pendientes. No se promete ausencia absoluta de bugs ni se declara aprobada una plataforma por pasar lint, tipos o un smoke.

**Modalidad confirmada por el usuario el 03/11/2026:** cada etapa de esta campaña incluye diagnóstico, corrección de los hallazgos confirmados y verificación antes de continuar. Un diagnóstico con defectos abiertos no se considera una etapa terminada para avanzar. El agente avisa al completar las correcciones y espera la indicación de la siguiente etapa; no avanza por su cuenta. Las definiciones de producto/arquitectura sujetas a AGENTS se presentan como decisiones concretas y no se aprueban por inferencia; mientras tanto se corrige el trabajo independiente autorizado.

Documentos de ejecución:

- [Procedimiento reutilizable](./PLATFORM_AUDIT_RUNBOOK.md): cómo delimitar, auditar, corregir y verificar un lote.
- [Registro maestro](./platform-audit/README.md): avance real por etapa e índice de corridas.
- [Plantilla de informe](./platform-audit/REPORT_TEMPLATE.md): evidencia, hallazgos, correcciones y límites de cada corrida.
- [Skill `bloqer-platform-audit`](../../../.agents/skills/bloqer-platform-audit/SKILL.md): entrada para auditoría global, por módulo, por cambio o revalidación.

## 2. Qué se encontró y qué se reutiliza

El inventario de estructura del 03/11/2026 encontró **191 páginas**, **50 route handlers**, **37 carpetas de features**, **43 carpetas de servicios** y **86 modelos Prisma**. Son unidades de inventario, no cantidad de funcionalidades verificadas ni porcentaje de cobertura. La revisión base fue `3b5ae7a038465ad6b3d60cde19c278a31019e165`, con trabajo local previo: las futuras corridas deben registrar su propia revisión y sus diferencias locales.

Ya existen:

- [Auditoría técnica de código](../AUDITORIA_TECNICA_CODIGO_BLOQER_V2.md), [auditoría final de calidad](../AUDITORIA_FINAL_CALIDAD_BLOQER_V2.md), [auditoría mobile](../AUDITORIA_MOBILE_BLOQER_V2.md) y [auditoría Prisma/ERD](./PRISMA_ERD_AUDIT.md).
- [Estrategia de pruebas](./TESTING_STRATEGY.md), [checklist de review](./CODE_REVIEW_CHECKLIST.md), [smoke de despliegue](./DEPLOYMENT_SMOKE_TEST.md), [UAT por rol](./OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md) y [UAT de finanzas de proyecto](./PROJECT_FINANCE_QA_UAT_BY_ROLE.md).
- [Política de impacto](../CHANGE_IMPACT_POLICY.md), skill `operational-help-docs`, auditorías y [runbook de evals AI](../BLOQER_AI_EVAL_RUNBOOK.md).
- Skills globales `review-bugbot`, `review-security` y `autopilot`. Sirven para revisiones de cambios o mantenimiento de PR; no abarcan por sí solas todo el producto. Sus tipos de agente especializados no están expuestos en esta sesión, por lo que el procedimiento nuevo usa los subagentes disponibles.

No se encontraron perfiles de agentes propios de auditoría del proyecto. Se incorporan cuatro perfiles especializados, descritos en §6.

Los documentos históricos incluyen diagnósticos y correcciones posteriores en el mismo archivo. Se reutilizan sus escenarios y evidencias; **cada problema se reproduce o se revalida contra la revisión actual antes de abrirlo**. El roadmap histórico tampoco demuestra que una capacidad esté implementada. El [plan INDARI](./INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md) conserva su propio alcance y seguimiento.

Observaciones iniciales para AG-00, todavía sin diagnóstico integral:

- `pnpm test` raíz no incluye `@bloqer/report-pdf`; el comando web enumera un subconjunto de los tests existentes. Pasar esos comandos no equivale a ejecutar todos los tests del repositorio.
- Las suites live y los E2E pueden quedar omitidos por configuración. El smoke general documentado cubre login y Tesorería, no todos los workflows.
- La persistencia real no es uniforme: `packages/database/src/repositories` contiene `project-progress.repository.ts`, mientras numerosos servicios consumen Prisma desde `@bloqer/database`. Se debe registrar y contrastar el recorrido real con el canon, sin suponer repositorios inexistentes ni iniciar una migración global de capas.
- `packages/ui/src/index.ts` es un stub; los componentes visuales compartidos implementados están principalmente en `apps/web/components`. La auditoría debe inspeccionar esa implementación.

## 3. Unidad mínima: un recorrido completo

Para cada caso de uso, identificar:

1. Requisito, decisión `D-*`, regla `BR-*`, estado y fórmula aplicables.
2. Ruta, rol, permisos, module gates y contexto tenant/empresa/proyecto.
3. Pantalla, controles y validación de entrada; acción o API y contrato Zod.
4. Servicio, reglas de dominio, transacción y acceso a datos real.
5. Modelos, claves, relaciones, nulabilidad, índices y migraciones involucradas.
6. Efectos: ledger, AR/AP, stock, GL, auditoría, avisos, archivos o jobs, según corresponda.
7. Lectura posterior, DTO, serialización, invalidación, listados, detalle, KPIs, reportes y exportaciones afectados.
8. Prueba del comportamiento y evidencia visual cuando se ejecute esa revisión.

Ejemplo real para iniciar una traza de compras:

`features/procurement/components/purchase-request-form.tsx`
→ `app/(app)/proyectos/[id]/solicitudes-compra/actions.ts`
→ `packages/validators/src/purchase-request.ts`
→ `packages/services/src/procurement/purchase-request.service.ts`
→ modelos `PurchaseRequest` / `PurchaseRequestLine`
→ lecturas de detalle/listado e invalidación `revalidatePr`.

Los dos primeros paths son relativos a `apps/web`. Esta traza es un punto de entrada, no prueba de que su flujo esté verificado. Revisar también los consumidores de `apps/web/lib/revalidate-project-paths.ts` cuando cambian costos o finanzas derivados.

## 4. Etapas y orden de trabajo

Las etiquetas **AG-00–AG-14** identifican lotes de auditoría documental. No son fases de producto ni estados persistidos. Se inicializaron pendientes; el estado vigente está en el [registro](./platform-audit/README.md). Cada una puede subdividirse por recorrido sin perder su identificador de etapa.

El orden prioriza fundamentos y dependencias. Un problema confirmado de fuga de datos, integridad financiera o bloqueo operativo desplaza ese orden. No se posterga su corrección para terminar cosmética. No se acumula un diagnóstico gigante: cada sublote sigue el ciclo del runbook y se cierra con sus límites explícitos.

### AG-00 — Inventario, arquitectura y línea de base

- Cruzar **documentado / implementado / expuesto / probado** para todos los módulos, páginas, handlers, servicios, modelos, paquetes, jobs y superficies públicas. Incluir capacidades embebidas y rutas sin entrada de menú.
- Leer [ERD funcional](../01-domain/ENTITY_RELATIONSHIPS.md), [ERD técnico](./TECHNICAL_ERD.md), decisiones, ADR, schema y migraciones: distinguir intención funcional, propuesta técnica, código y DB efectiva.
- Registrar límites entre capas, imports servidor/cliente, DTO, acceso a datos, transacciones, excepciones documentadas, helpers de dinero, permisos e invalidación compartidos.
- Inventariar tests que existen frente a los realmente descubiertos por comandos y CI; establecer fallos previos, skips y condiciones de entorno. Identificar las comprobaciones faltantes de mayor riesgo.
- Cubrir todos los paquetes actuales: `ai`, `auth`, `config`, `database`, `domain`, `email`, `report-pdf`, `services`, `storage`, `ui`, `utils`, `validators`, además de web, CI y configuración de despliegue.
- Entrega: mapa de cobertura reconciliado, baseline reproducible, candidatos priorizados y selección del primer recorrido de AG-01. Una diferencia documental no se convierte automáticamente en refactor arquitectónico.

### AG-01 — Identidad, aislamiento, permisos y administración SaaS

- Login, registro, verificación, recuperación, onboarding, invitaciones y membresías; contexto de sesión, acceso al proyecto, roles, políticas y gates.
- Configuración del tenant/empresa y superficie `/platform`: tenants, usuarios, módulos, settings, invitaciones, vencimientos y auditoría de plataforma.
- Entradas: features `auth`, `platform`, `tenant-config`; servicios `auth`, `security`, `membership`, `onboarding`, `user`, `tenant`, `company`, `tenant-modules`, `tenant-settings`, `platform`; `packages/auth`.
- Verificar acceso directo a acciones/API/IDs/exports, además de visibilidad del menú; límites entre administrador del tenant y de plataforma, dos tenants y contextos de empresa/proyecto.
- Depende de AG-00. Sus controles se vuelven a probar en todos los módulos consumidores.

### AG-02 — Navegación y sistema visual compartido

- Shell de empresa/proyecto/Field/plataforma, breadcrumbs, navegación, encabezados, acciones, filtros, tablas/cards y formularios.
- Referencia real: `apps/web/app/globals.css`, `tailwind.config.ts`, `components/ui`, `components/layout` y feature `shell`. Identificar patrones ya aprobados antes de homogeneizar.
- Revisar estados de carga, vacío, error, acceso denegado y éxito; teclado, foco, contraste, zoom, formato es-AR, light/dark y responsive.
- Fijar ejemplos representativos y criterios visuales con capturas actuales cuando corresponda. Reutilizarlos durante las etapas siguientes; la uniformidad no debe eliminar diferencias funcionales necesarias.
- Depende de AG-01 para navegación autorizada. Puede investigarse en paralelo sin modificar los mismos archivos.

### AG-03 — Directorio y proyectos

> **Alcance aclarado por el Owner (03/11/2026):** los roles y la visibilidad sí son relevantes. Corregir los problemas del esquema vigente y preservar los accesos que funcionan. Evaluar por separado una simplificación a 4 o 5 roles con límites de visibilidad o lectura por usuario; no aplicar un rediseño. Para Q-067 aprobó expresamente el acceso del creador únicamente a la obra nueva, dentro del techo de roles existente. Continuar las correcciones de datos, formularios, guardado y vínculos de los recorridos actuales.

- Contactos y roles cliente/proveedor/subcontratista, creación y edición de proyecto, equipo, contexto y vínculos de documentos.
- Features `directory`, `projects`; servicios `contact`, `project` y sus consumidores.
- Fuentes: módulos [DIRECTORY](../02-modules/DIRECTORY.md), [CLIENTS](../02-modules/CLIENTS.md), [SUPPLIERS](../02-modules/SUPPLIERS.md), [SUBCONTRACTORS](../02-modules/SUBCONTRACTORS.md), [PROJECTS](../02-modules/PROJECTS.md).
- Depende de AG-01/02. Revisar contratos de selección usados luego en compras, ventas y obra.

### AG-04 — Presupuestos, EDT/WBS, APU y adendas

- Versiones, importación/exportación, edición, aprobación/cierre, jerarquía, cantidades, costos/precios y adendas.
- Feature `budgets`; servicio `budget`, validators y helpers financieros relacionados.
- Fuentes: [BUDGETS](../02-modules/BUDGETS.md), [WBS_AND_COST_ITEMS](../02-modules/WBS_AND_COST_ITEMS.md), [CONTRACTS_AND_ADDENDUMS](../02-modules/CONTRACTS_AND_ADDENDUMS.md), fórmulas y workflows de presupuesto.
- Depende de AG-03. Seguir los vínculos de ejecución hacia cronograma, certificación, compras y costo real.

### AG-05 — Planificación, recursos, materiales y costos

- Cronograma y adapter Gantt, recursos/mano de obra/equipos, materiales, look-ahead, progreso y control de costos; reconciliar presupuesto base con ejecución.
- Features y servicios `schedule`, `resources`, `materials`, `cost-control`.
- Fuentes: [PROJECT_SCHEDULING](../02-modules/PROJECT_SCHEDULING.md), [CHANGE_ORDERS](../02-modules/CHANGE_ORDERS.md), [RFIS](../02-modules/RFIS.md), fórmulas y workflows correspondientes.
- AG-00 debe localizar contratos, órdenes de cambio y RFIs si viven dentro de otras capacidades. Si no se encuentra implementación, registrar brecha de alcance y consultar decisiones; no inventar módulos ni declararlos defectuosos solo por no tener carpeta homónima.
- Depende de AG-04. Revisar efectos en compras, inventario, partes y reportes.

### AG-06 — Compras de punta a punta

- Solicitud, cotizaciones, clasificación de ofertas, adjudicación, OC, aprobación y recepción; cantidades parciales, origen WBS/APU y vínculos con factura/AP/stock.
- Feature y servicios `procurement`; políticas, validators e idempotencia relacionados.
- Fuentes: [PROCUREMENT](../02-modules/PROCUREMENT.md), [PURCHASE_REQUESTS](../02-modules/PURCHASE_REQUESTS.md), [PURCHASE_ORDERS_AND_RECEIPTS](../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md), [PURCHASE_TO_PAY](../05-workflows/PURCHASE_TO_PAY.md).
- Depende de AG-03/04 y AG-05 donde haya origen planificado. Verificar la frontera con AP e inventario aun cuando sus etapas completas estén pendientes. Reutilizar escenarios INDARI sin duplicar ni cerrar su backlog por inferencia.

### AG-07 — Inventario y depósitos

- Productos, depósitos, entradas/salidas, reservas, consumos, valuación, recepción y transferencias; pares de movimientos y reversas según reglas vigentes.
- Features `inventory`, `inventory-reports`, `warehouse-transfer`; servicios `inventory`, `inventory-reports`.
- Fuentes: [INVENTORY](../02-modules/INVENTORY.md), [WAREHOUSES](../02-modules/WAREHOUSES.md), fórmulas de stock y [MOVE_INVENTORY](../05-workflows/MOVE_INVENTORY.md).
- Depende de AG-06 para recepción. Contrastar stock y costo con materiales/obra/reportes.

### AG-08 — Certificaciones y subcontratos

- Medición, acumulados, aprobación/rechazo, reemplazo/anulación y topes; certificación de cliente y subcontratista, generación o vínculo de AR/AP y estados derivados.
- Features `certifications`, `subcontracts`; servicios `certification`, `subcontracts`.
- Fuentes: [CERTIFICATIONS](../02-modules/CERTIFICATIONS.md), [SUBCONTRACTS](../02-modules/SUBCONTRACTS.md), fórmulas de certificación y [CERTIFY_TO_COLLECT](../05-workflows/CERTIFY_TO_COLLECT.md).
- Depende de AG-04. Comprobar fronteras con ventas/AR y AP, incluyendo duplicados/reintentos donde aplique.

### AG-09 — Ventas, cobranzas, CxC, CxP y pagos

- Facturación, notas, gastos, aplicaciones parciales/totales, saldos, vencimientos, aging, anulaciones y vínculo a compras/certificaciones/proyecto.
- Features `sales-invoices`, `collections`, `ap`, `finance`, `aging`, `project-cash-flow`; servicios `ar`, `ap`, `finance`, `aging`, `project-cash-flow`, `project-finance`.
- Fuentes: [SALES_AND_COLLECTIONS](../02-modules/SALES_AND_COLLECTIONS.md), [EXPENSES_AND_PAYMENTS](../02-modules/EXPENSES_AND_PAYMENTS.md), AR/AP, dinero, impuestos y reglas multimoneda.
- Depende de AG-06/08 en sus vínculos. Comparar efecto en tesorería/GL/reportes antes de cerrar el sublote financiero.

### AG-10 — Tesorería, conciliación, cierres y contabilidad

- Cuentas, movimientos, transferencias propias, saldos, conciliación, períodos cerrados, cuentas contables, asientos y reglas de mapeo/sincronización operacional.
- Features `treasury`, `treasury-reports`, `accounting`; servicios homónimos y helpers financieros.
- Fuentes: [TREASURY](../02-modules/TREASURY.md), [BANK_ACCOUNTS](../02-modules/BANK_ACCOUNTS.md), [BANK_RECONCILIATION](../02-modules/BANK_RECONCILIATION.md), [INTERNAL_TRANSFERS](../02-modules/INTERNAL_TRANSFERS.md), [ACCOUNTING](../02-modules/ACCOUNTING.md), ledger, locks y fórmulas de tesorería.
- Depende de AG-09 para reconciliar operaciones. No imponer que contabilidad y tesorería compartan estados o reglas que su documentación distingue.

### AG-11 — Operación de obra y Field

- Libro de obra, partes, incidencias, avance, fotos y acceso móvil por rol; vínculos con EDT, cronograma, materiales y costos.
- Features `jobsite-log`, `field`, `project-progress`; servicios `jobsite-log`, `field` y lecturas de progreso.
- Fuentes: [JOBSITE_LOG](../02-modules/JOBSITE_LOG.md), [REGISTER_JOBSITE_ENTRY](../05-workflows/REGISTER_JOBSITE_ENTRY.md), decisiones Field y auditoría mobile.
- Depende de AG-03/05/07 para los recorridos enlazados. Revisión mobile empieza en AG-02; este lote valida tareas operativas completas, no solo que la pantalla entre en el viewport.

### AG-12 — Dashboards, reportes y exportaciones

- Indicadores de empresa/proyecto, rentabilidad, cashflow, avances, filtros, cortes temporales y consistencia entre detalle, agregados, CSV/Excel/PDF y entrega de reportes.
- Features `dashboard`, `reports`, `scheduled-reports` y consumidores `project-progress`, `treasury-reports`, `inventory-reports`; servicios `dashboard`, `reports`, `report-exports`, `scheduled-reports`; paquete `report-pdf`.
- Fuentes: [REPORTING](../02-modules/REPORTING.md), catálogo `06-reports/`, fórmulas y [REPORTING_ERD_GUARDRAILS](./REPORTING_ERD_GUARDRAILS.md).
- Depende de las etapas productoras de cada dato. No comparar números de distintos scopes, monedas, estados o fechas como si fueran equivalentes.

### AG-13 — Servicios transversales e interfaces de asistencia

- Documentos/archivos y permisos de descarga, notificaciones, auditoría, email y entrega, digest/alertas/crons, ayuda/guía y Bloqer AI.
- Features `documents`, `notifications`, `audit-log`, `help`, `bloqer-ai`; servicios `documents`, `notifications`, `audit`, `email-delivery`, `ai`; paquetes `storage`, `email`, `ai`. Incluir jobs de reportes programados de AG-12.
- Fuentes: módulos [DOCUMENTS](../02-modules/DOCUMENTS.md), [NOTIFICATIONS](../02-modules/NOTIFICATIONS.md), [AUDIT_LOG](../02-modules/AUDIT_LOG.md), arquitectura storage/email/jobs y docs AI vigentes.
- Revisar validación de archivos, autorización, errores/reintentos, trazabilidad y protección de datos; AI debe reutilizar permisos, scopes y servicios, con evals adecuadas.
- Es transversal desde AG-01. Las etapas previas validan sus propios efectos; este lote verifica el subsistema y sus conexiones de forma conjunta.

### AG-14 — Regresión cruzada y preparación de publicación

- Recorrer workflows completos: proyecto → presupuesto → certificación → factura → cobranza; compra → recepción → factura → pago; transferencia/stock; cierres/GL; Field → avance → reportes. Ajustar los caminos a capacidades efectivamente implementadas.
- Repetir casos de roles restringidos, tenant/empresa/proyecto, módulo deshabilitado, anulación, reintento e invariantes afectados.
- Revisar rendimiento con medidas, paginación, N+1/overfetching, bundles, errores/logs sin secretos, observabilidad, CI, dependencias y procedimientos de despliegue/recuperación existentes. Una propuesta de optimización no reemplaza evidencia de un cuello de botella.
- Contrastar código, migraciones efectivas y versión publicada; realizar smoke/UAT cuando forme parte del alcance autorizado.
- Depende de los recorridos correspondientes. Se ejecuta una regresión proporcional después de cada cambio; esta etapa agrega el cierre transversal de la campaña.

## 5. Auditoría selectiva después de un cambio

Cuatro entradas reutilizables:

- **Global:** reconciliar el mapa en AG-00 y avanzar por etapas. Un pedido global no obliga a modificar todos los módulos en un solo lote.
- **Módulo:** auditar los recorridos del área solicitada y sus conexiones inmediatas. No repetir todas las etapas sin evidencia de impacto.
- **Cambio:** fijar una revisión base concreta y revisar diff, trabajo local acordado, dependencias y consumidores afectados. Si la base no existe o es ambigua, resolverla antes de atribuir regresiones.
- **Revalidación:** volver a comprobar IDs de hallazgos o una corrida previa sobre una revisión nueva, conservando su historial.

Reglas de expansión:

- Un componente o estilo local requiere el recorrido y los estados visibles afectados.
- Tokens, shell, tablas, formularios o controles compartidos requieren una muestra declarada de empresa/proyecto/Field/plataforma y de lista/detalle/formulario, light/dark y mobile/escritorio. La muestra no acredita todas las pantallas.
- Dinero, estados, permisos, scopes, gates, contratos DTO, schema, idempotencia e invalidación requieren mapear **todos los consumidores identificados** y seleccionar pruebas según riesgo. Incluir informes/AI/jobs si consumen el contrato.
- Una relación de datos modificada exige revisar ambos extremos, cardinalidad, optionalidad, referencias históricas y efectos; no basta revisar la pantalla donde nació el cambio.
- Si aparece una frontera rota fuera del área, registrar el hallazgo y ampliar solo lo necesario. Una decisión de producto o arquitectura pendiente bloquea esa corrección, no el resto del trabajo independiente.

## 6. Equipo reutilizable

La skill actúa como **coordinadora**: delimita, lee fuentes, arma tareas, consolida duplicados, asigna correcciones, revisa resultados y actualiza el registro. Los perfiles especializados están en `.codex/agents/`:

- **`bloqer-audit-contracts`**: recorrido frontend/backend, validación, DTO, RSC/cliente, lecturas e invalidación y límites entre paquetes.
- **`bloqer-audit-data-security`**: ERD/schema, integridad, finanzas, transacciones, idempotencia, tenant/empresa/proyecto, RBAC, gates e integraciones sensibles.
- **`bloqer-audit-ux`**: consistencia visual, navegación, formularios, mobile, accesibilidad y claridad operativa, contra componentes y reglas existentes.
- **`bloqer-audit-verification`**: inventario de pruebas, regresión proporcional, reproducción y revisión independiente de la solución y evidencia de cierre.

Los cuatro perfiles revisan por defecto; el coordinador implementa o asigna un responsable con archivos explícitos cuando se pide corregir. Se aprovecha la concurrencia disponible: en esta sesión, coordinador más hasta tres subagentes, en tandas. Un responsable escribe cada archivo; revisiones independientes pueden correr en paralelo.

No se fija modelo, costo ni configuración global. Si el entorno no permite seleccionar un perfil por nombre, el coordinador lee su archivo y entrega esas instrucciones al subagente disponible. Si no hay delegación, aplica las mismas perspectivas en pasadas separadas e informa que faltó revisión independiente.

Formato verificado contra documentación oficial: [skills de repositorio](https://learn.chatgpt.com/docs/build-skills) y [agentes personalizados](https://learn.chatgpt.com/docs/agent-configuration/subagents). La carga por nombre depende de la versión y capacidades del entorno; crear los archivos no prueba su registro en una sesión ya iniciada.

## 7. Invariantes y límites de ejecución

Se aplican las reglas existentes de [AGENTS](../../../AGENTS.md), [guardrails](./AGENT_GUARDRAILS.md), [money model](../03-finance/MONEY_MODEL.md), [scoping](./TENANT_COMPANY_SCOPING.md) y [máquinas de estado](../01-domain/STATE_MACHINES.md). El plan no autoriza inventar campos, estados, reglas financieras, dependencias o decisiones arquitectónicas.

Puntos de especial atención:

- Aislar siempre por tenant. Distinguir empresa y proyecto; `companyId = null` compartido en entidades nullable y tesorería tenant-wide según el estándar vigente. No aplicar un filtro de empresa universal.
- Dinero operativo y `amount_ars` a 2 decimales half-up con kernel canónico; FX 6, qty/% 4. La UI formatea; el servidor valida y calcula.
- Mutaciones importantes por servicios; sin acceso Prisma desde web, sin trasladar lógica financiera a React ni exponer objetos Decimal al cliente.
- Actualizar Guía + Ayuda + impacto AI en el mismo lote/PR ante cambios de significado, rutas, etiquetas o flujos. Documentación técnica y CSS puramente cosmético pueden declarar `sin impacto documental/AI`, según la policy.
- Preservar trabajo ajeno y los hallazgos históricos. No limpiar ni incorporar archivos locales ajenos al lote.

La planificación actual no requiere abrir navegador, migrar DB ni publicar. Para futuras corridas:

- La [regla de navegador](../../../.cursor/rules/no-localhost-browser.mdc) pide no abrirlo sin smoke solicitado y prohíbe localhost salvo pedido explícito. Revisión estática no acredita verificación visual; registrar ese pendiente si falta el recorrido real.
- Antes de pruebas con escrituras, comprobar la identidad efectiva del servidor y DB de prueba, el aislamiento y los efectos del spec/fixture existente. Una URL de cliente o `.env` no demuestra el destino del backend.
- No ejecutar suites mutantes ni seeds contra producción. Usar infraestructura/fixtures de prueba existentes; no crear scripts de parche ni seeds ad hoc.
- `pnpm build`, `ci:prisma` y el build de database invocan un migrador que aplica `migrate deploy` con `VERCEL=1`. No ejecutarlos como verificaciones supuestamente inocuas sin revisar entorno y alcance.
- Si un lote incluye migración/publicación, registrar destino y evidencia separadamente. Portal usa production `ep-cold-mouse-appkpn84`, conforme a la [regla existente](../../../.cursor/rules/neon-production-migrations.mdc). Un plan de auditoría no habilita por sí mismo esa operación.

## 8. Criterios de salida y siguiente paso

Un sublote puede cerrarse solo con alcance documentado, hallazgos confirmados tratados, pruebas pertinentes registradas y revisión final de las conexiones afectadas. Se distingue **corregido en código**, **verificado automáticamente**, **verificado visualmente** y **publicado**. Las omisiones o decisiones pendientes limitan el cierre; no se convierten en aprobaciones por falta de evidencia.

La campaña completa requiere reconciliar el inventario: cada capacidad queda vinculada a una corrida, a una exclusión justificada o a un pendiente explícito. No se cierra una etapa por haber revisado un único recorrido representativo sin declararlo.

**Actualización 04/11/2026:** AG-00 a AG-04 cerradas en sus alcances y publicadas; [AG-05](./platform-audit/2026-11-04-ag-05-closure.md) cerrada localmente. **AG-06 en ejecución autorizada**, con correcciones, regresiones SQL aisladas y revisión independiente. D-125/D-126/D-127 aprobadas; D-128 mantiene el cierre parcial formal como desarrollo separado con diseño previo, sin afirmar que existe. FX tras aprobación se sigue en Q-075. RFIs y contratos formales conservan su desarrollo diferido explícito, sin cerrar Q-006/Q-057. No iniciar AG-07 ni configurar recurrencias sin indicación del usuario.
