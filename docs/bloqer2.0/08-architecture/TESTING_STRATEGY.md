# Testing strategy — Bloqer 2.0

> Pirámide de tests cuando exista código. **No** configura runner aquí.

## Tipos de tests

| Tipo | Qué cubre |
|---|---|
| **Unit** | Funciones puras en `packages/domain`, helpers de redondeo, mapeos de estado. |
| **Integration** | Service + DB de test (Neon branch / docker Postgres) con transacción rollback por test. |
| **Service** | Caso de uso completo: mocks solo en integraciones externas (email, R2). |
| **Repository** | Queries críticas: filtros `tenant_id`, joins de reporte base. |
| **Permission** | Matriz mínima: rol X no puede mutar entidad Y. |
| **Tenant isolation** | Mismo test con dos `tenant_id`: no leakage. |
| **Formula** | Números de [`../04-formulas/`](../04-formulas/) vs implementación. |
| **Workflow** | Secuencia: OC → recepción → factura → payable (según doc). |
| **E2E mínimos** | Login + flujo feliz crítico (presupuesto aprobado, movimiento de caja) cuando Playwright exista. |

## Fixtures y seeds

- Fixtures **por tenant**; nunca datos globales sin `tenant_id`.  
- Seeds solo entornos no productivos.

## Base de datos de test

- Preferir **schema migrado** igual que prod; datos mínimos por suite.

## Comandos mantenidos de calidad — actualizado AG-00, 03/11/2026

- `pnpm lint`: analiza `packages` con la configuración raíz y web con su configuración propia. Web usa ESLint CLI sobre todo su código, incluidas features y hooks; se excluyen artefactos generados y se exige cero warnings.
- `pnpm typecheck`: ejecuta los scripts de tipos del workspace.
- `pnpm test`: ejecuta todas las suites `test` declaradas del workspace, incluidos validators y PDF. Los paquetes seleccionan sus archivos por patrones; web separa los tests TypeScript y el test RSC `.mjs`, que requiere `react-server`.
- Validators reutiliza el loader `tsx` ya instalado en services, como web. Estos comandos requieren la instalación completa del workspace usada por CI; no se agregó una dependencia ni un runner nuevo.
- CI utiliza Node 22. La inclusión de un archivo en una carpeta no acredita que su patrón lo descubra: al agregar tests o moverlos, comprobar selección efectiva y resultado, sin incorporar specs de navegador a la suite unitaria.

Las pruebas unitarias no deben depender de una conexión DB heredada para aparentar aprobar. Los escenarios puros sustituyen únicamente sus puntos de I/O y comprueban la política; las suites live mantienen su activación y entorno aislado explícitos. Reportar suites omitidas además del contador de casos del runner: `skipped: 0` puede coexistir con suites `# SKIP` sin casos enumerados.

Evidencia y límites de la remediación: [AG-00](./platform-audit/2026-11-03-ag-00-remediation.md). Un resultado unitario no demuestra aislamiento SQL ni aprobación del portal.

## Regresión reutilizable de identidad y acceso — AG-01

`pnpm test` incluye ahora las regresiones de `@bloqer/auth`. Services ejecuta tanto `src/**/*.test.ts` como `src/**/*.test.mts`; los archivos `.mts` de autenticación usan la condición Node `react-server` por el marcador `server-only`. Las suites live se omiten sin activación explícita y no leen `.env` como fallback para decidir dónde escribir.

Las suites de auditoría usan `BLOQER_AUDIT_LIVE=1`, `BLOQER_AUDIT_TEST_DATABASE` con prefijo `bloqer_audit_`, y **ambas** URLs explícitas hacia esa base aislada en el compute de desarrollo verificado. `testing/audit-fixture.ts` comprueba host exacto, nombre en ambas URLs y `current_database()` antes de cualquier escritura. Nunca usar `neondb`, producción o una conexión por defecto para estas fixtures. No cambiar `.env` para ejecutar la suite. Email y servicios externos deben estar deshabilitados; no se ejecutan seeds productivos.

Selecciones mantenidas, ejecutables desde `packages/services` con Node `--conditions=react-server --import tsx --test --test-concurrency=1`:

- `src/auth/credentials-auth.live.test.mts`: emisión/consumo/concurrencia/estado de cuenta.
- `src/user/user.service.live.test.ts`: perfil y propietario elegible.
- `src/onboarding/onboarding.audit.live.test.ts`: doble submit, nombres iguales, provisión desde plataforma y barreras de ingreso.
- `src/security/access.audit.live.test.ts`: tenant/empresa/ACL, rutas de datos, Field, avisos, asignaciones y gates.
- `src/tenant-settings/tenant-administration.live.test.ts`: equipo, invitaciones, plataforma y vencimientos.
- `src/tenant-settings/tenant-settings.audit.live.test.ts`: anclaje, campos borrados, notas parciales y rollback de auditoría.

Los escenarios anteriores D-111 (`ai/d111-scoped-live.test.ts` y `project/project-membership.phase-c.live.test.ts`) mantienen sus flags de activación, pero ahora requieren también ese destino aislado y su comprobación SQL efectiva. Tener `BLOQER_D111_LIVE=1` por sí solo no habilita escribir en la base de desarrollo normal. Evidencia y selección final: [AG-01](./platform-audit/2026-11-03-ag-01-identity-access.md). Los stubs unitarios verifican ramas y contratos; las pruebas de locks/rollback se complementan con la suite PostgreSQL.

## Regresión reutilizable de planificación y costos — AG-05

Con el mismo guard de destino aislado anterior, seleccionar desde `packages/services` con `node --import tsx --test --test-concurrency=1`:

- `src/schedule/schedule-audit.live.test.ts`: permisos/gates, padres y vínculos, estados, rollback de auditoría, reordenamiento de 503 hermanos, dependencias concurrentes, planificación independiente sin presupuesto, metadatos económicos opcionales y exportación XLSX real. Incluye los escritores directos D-045 (parte de obra) y D-104 (recepción); la aprobación de partes en ambas secuencias de empresa debe producir el mismo avance compartido.
- `src/schedule/schedule-budget-import.live.test.ts`: regresión AG-04 de importación, idempotencia, atomicidad y volumen. No duplicar sus nueve casos en el conteo de casos nuevos de AG-05.
- `src/materials/planning-boards-audit.live.test.ts`: presupuestos y fuentes por empresa/rol, unidades incompatibles, adjudicación parcial, cantidades APU exactas y fechas SQL `@db.Date`.
- `src/cost-control/cost-control-audit.live.test.ts`: acceso, piso de exposición por compromiso, neto sin impuestos, notas vinculadas, cantidades no comparables, período del detalle, exportaciones/AI y grafo de presupuesto en ambos sentidos.
- `src/cost-control/cost-control-relations.live.test.ts`: pertenencia de líneas/cabeceras de facturas, notas, pagos, recepciones y subcontratos antes de exponer importes; mensajes genéricos sin datos de otro alcance.
- `src/resources/resource-variance-currency.live.test.ts`: D-122, moneda original y fuentes contribuyentes, categorías APU/OC sin duplicación, alcance/período/empresa y fuentes restringidas.
- `src/cost-control/cost-control-closure.live.test.ts`: integración D-122/123/124, pagos por su fecha aunque la factura/subcert sea anterior, detalle de partida exacta, ausencia frente a consumo desconocido, totales/buckets nullable, planilla de certificación y cronograma/XLSX reales conservados ante incompatibilidad monetaria.

El runner actual de `@bloqer/report-pdf` selecciona `.test.ts` y `.test.tsx`: la corrida general incluye los tres smoke de cronograma y los dos de valuación de reportes. Se pueden repetir focalmente desde `packages/report-pdf` con `node --import tsx --test src/pdf/schedule-pdf.smoke.test.tsx src/report-valuation.test.tsx`, sin volver a sumarlos como casos distintos. Usan datos sintéticos, render real y Helvetica local. Los stubs de fallas opcionales del control de costos comprueban degradación temporal, no disponibilidad real de la fuente fallada.

Para repetir solo una corrección, usar `--test-name-pattern` y registrar los casos efectivamente descubiertos. Deduplicar nombres entre corridas focales; sumar ejecuciones repetidas infla la cobertura. No considerar aprobadas las suites live omitidas en la corrida sin DB. Q-069/Q-070/Q-071 fueron aprobadas en D-122/D-123/D-124: expectativas de moneda nativa, cantidad facturada neta y consumo no calculable sin valuación/moneda trazable; ninguna prueba presume FX o FIFO.

Smoke de UI: cuatro vistas de cronograma en escritorio, Field a 390 px, tarea independiente y vinculada sin fechas, conservar campos ante error y bloquear cierre durante envío; materiales con unidades por fila, moneda ISO y atajos; recursos vacíos y con datos cuando la fixture los tenga; detalle de costos con período y restablecimiento de filtros. Usar únicamente la instancia y fixtures sintéticos autorizados. La publicación y su smoke mantienen evidencia separada.

## Regresión reutilizable de Compras — AG-06

Con el guard de identidad aislada de AG-01, ambas URLs explícitas y proveedores externos deshabilitados, seleccionar desde `packages/services` con `node --import tsx --test --test-concurrency=1`:

- `src/procurement/purchase-requests-audit.live.test.ts`: SC/empresa/obra, snapshots e historial D-126, mínimo por ítem, vigencia, payload viejo, numeración entre obras, adjudicación concurrente/atómica, FX y DTO nativos.
- `src/procurement/procurement-orders-audit.live.test.ts`: OC/grafo/ACL, rechazo de vínculos de adjudicación en OC directa, varianza y saldo D-125, aprobación, recepción agregada/tolerancia/depósito, stock y reversa, idempotencia y correlativo D-127. Incluye partidas de empresas distintas como principal/adendas reales, sin violar la unicidad del principal de la obra.
- `src/procurement/procurement-platform-audit.live.test.ts`: políticas parciales/concurrentes/audit rollback, hub SC-only, audiencia de avisos por empresa y usuario activo, límites OC→AP, moneda nativa, facturas/NC/ND y cantidades de recibos repetidos. Una edición parcial de factura no puede aplicar una validación de OC/proveedor sobre un snapshot reemplazado.
- `src/schedule/schedule-audit.live.test.ts` con patrón `receipt`: revalidar D-104 ante cambios de recepción, conservando TASK y evitando efectos si la obra se pausa o la línea pertenece a otra OC.

Los bloqueos y relecturas se ejercitan con PostgreSQL real. Interleavings mantenidos detienen una entrada de transacción y restauran siempre el delegado Prisma en `finally`; no dependen de sleeps. Node `mock.method` no puede sustituir métodos cuyo descriptor dinámico Prisma no expone como función. Un error de fixture o transporte no acredita un contrato aprobado: registrar y repetir la selección corregida.

El comando general conserva suites live omitidas, diferenciadas de las corridas SQL. Pruebas frontend de Compras cubren vinculación de Actions, invalidación, recuperación de formularios, datos no disponibles, contexto global con obra compartida, ISO por ítem y código de recepción/histórico. Evals AI de ayuda D-125/126/127/128 se agregan sin ejecutar proveedores reales.

En la frontera OC→AP, incluir factura neto 100 + IVA 21 + percepción 3: pago 121 no salda obligación 124. El stepper usa el indicador de saldo del servicio, sin calcularlo en React ni confundir cobertura neto+IVA con pago total. Verificar saldo cero por pago completo y por NC, más Payable faltante/cancelled/inconsistente. Las pruebas no modifican documentos reales ni la regla D-115.

Smoke autorizado: hub/lista/detalle/formulario SC/OC/recepción, al menos escritorio y teléfono, referencias de moneda por línea, formularios que conservan datos y códigos RC separados de OC. Confirmar únicamente en la base sintética, sin correos reales ni publicación. Cierre parcial formal sigue fuera del lote por D-128; no inventar un botón para validarlo.

## Qué testear **primero** (prioridad del prompt 3)

1. Fórmulas financieras y anti–doble conteo ([BR-COS-002](../01-domain/BUSINESS_RULES.md)).  
2. Ledger: `account_movement`, cobranzas/pagos parciales, **internal transfer** = par.  
3. Stock: movimientos confirmados, transfer par, reserva vs disponible.  
4. Certificaciones + AR (sin `INVOICED` en status; derivados).  
5. Presupuestos: `CLOSED`, `IN_REVIEW`, `RETURNED_FOR_CHANGES`.  
6. AR/AP + period close.  
7. Permisos + tenant isolation.  
8. Autorización de descarga de documento (metadata + tenant).

## Qué NO hacer

- Tests que mockean **toda** la DB y no prueban SQL.  
- E2E como única red de seguridad financiera.

## Referencias

- [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md)  
- [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md)


## Selección reutilizable AG-07 — Inventario y depósitos

- Suites mantenidas: `inventory/inventory-audit.live.test.ts` (catálogos, consumo, transferencias, concurrencia, replay y auditoría) e `inventory-reports/inventory-reports-audit.live.test.ts` (reportes, exportación, saldo físico frente a ACL, avisos y frontera contable). Ambas requieren `BLOQER_AUDIT_LIVE=1`, las dos URLs explícitas y `assertAuditDatabaseIdentity` antes de fixtures; únicamente base aislada `bloqer_audit_ag01_20261103`, nunca producción/dev normal.
- Si cambia el helper de stock/locks/recepciones: repetir la suite `procurement/procurement-orders-audit.live.test.ts` y los casos receipt de `schedule/schedule-audit.live.test.ts`. No sumar como casos nuevos sus repeticiones.
- Sin DB: `inventory-scope.test.ts`, `inventory-movement-cost.test.ts`, `inventory-inputs.test.ts` y `inventory-interactions.test.ts`; cubren cantidades4dp, dinero2dp persistido, moneda demostrable, mutex/errores, Actions, rutas de edición y selector opcional de obra. Las suites live omitidas se informan aparte.
- **D-130:** `inventory/product-unit.test.ts` y `inventory/product-unit-audit.live.test.ts` comprueban las seis familias de referencia, unidad libre/referenciada, auditoría/rollback, unidad explícita y carreras de primera referencia con SC/APU/partes. En `procurement/procurement-orders-audit.live.test.ts`, el patrón focal `D130 ` selecciona altas/edición, adjudicación múltiple, recepción incompatible, históricos y ambos órdenes de carrera con OC; no coincide con el título padre. No usar alias/conversiones ni agregar campos de unidad al parte para validar el control.
- **Selector del parte (GA-AG-07-038):** `inventory/jobsite-inventory-options.live.test.ts` comprueba empresa/compartidos, depósitos generales o de la misma obra, acceso al proyecto, gate/permiso de Inventario sin consultas a catálogos cuando no corresponden, subcontratos por empresa/obra y contactos compartidos del tenant. Las suites nuevas usan el mismo guard de identidad y limpieza exclusiva de sus tenants sintéticos.
- Con cambios visibles: Guía §14.1 y ayuda Inventario en el mismo lote; regenerar y comprobar knowledge, incluyendo `inventory-knowledge.test.ts` sobre el índice distribuido. No requiere proveedores LLM.
- Muestra manual: Owner y lectura restringida según cambios, crear/editar producto y depósito, vínculo opcional a obra, transferir/ver stock/anular con disponible y consumir desde obra. Comprobar confirmaciones, rechazo conservando datos, invalidación, tablas/tarjetas y ambos temas. Los históricos CLOSED siguen sin editar/reactivar. No simular valuación FIFO/reservas (D-083), ni asiento desde consumo sin moneda/capa (D-124).

## Selección reutilizable AG-08 — Certificaciones y subcontratos

- **Destino:** mismo guard SQL aislado de AG-01, ambas URLs explícitas, proveedores deshabilitados y comprobación efectiva antes de fixtures. Suites nuevas con BLOQER_AUDIT_LIVE=1; ejecutar desde packages/services con node --import tsx --test --test-concurrency=1. No activar flags live para el runner general.
- **Certificados:** certification/certification-audit.live.test.ts verifica scope propio/compartido/global, grafo completo, gate, entradas/calendario, snapshots, topes D-119, relecturas bajo Project y rollback de auditoría. Fuentes físicas/compras restringidas son no disponibles, sin ceros inferidos; cancelación emitida/aprobada requiere motivo, borrador no.
- **Subcontratos:** subcontracts/subcontracts-audit.live.test.ts cubre accesos/pickers, padres, cantidades4/PU4/dinero2, snapshots aprobados, numeración, estados, sucesión terminal, auditoría, cancelación/replay y AP. El patrón AG08 residual: selecciona ND y escritores concurrentes INVOICE; no coincide con el título padre. D-131 conserva Emitido y D-089: aprobar crea factura AP borrador, emitirla crea CxP.
- **Fronteras:** certification/certification-connections-audit.live.test.ts usa servicios reales para referencias APU, ACL/gates, moneda nativa, facturación/FX, NC/ND, grafo actualizado, número de empresa compartido con venta/ingreso/manual y auditoría. Original pagada con ND abierta conserva deuda; NC completa puede saldar sin efectivo. Fuentes incoherentes o ausentes no prueban liquidación.
- **Regresión anterior:** certification/certification-flow.live.test.ts necesita además BLOQER_CERTIFICATION_LIVE_DB=1. Conserva el guard anterior de fixture procurement fuera de la modalidad audit y acepta exclusivamente la identidad audit verificada al usarla. Este legado retiene tenants sintéticos y crea un borrador final para revisión UI; registrar esa retención, distinta de la limpieza de las suites nuevas. No mostrar credenciales de entorno ni usar esos usuarios fuera de la base aislada.
- **Sin DB:** certification-scope/guards/measurement, subcontract-scope/values/settlement, validators de ambas áreas y ar/certification-invoice-status.test.ts. Mantener también finance/project-lifecycle-interleaving, project/project-cancellation-race y procurement/procurement-project-cancellation-race: sus fixtures deben completar el grafo real y conservar la prueba que detecta ausencia del lock de Project.
- **Frontend:** certification-interactions.test.ts cubre Actions/padres/invalidación, mutex inmediato, errores/valores conservados, diálogos pendientes, rutas absolutas, precisión, empresa efectiva y moneda comparable. certification-ar-invalidation.test.ts cubre factura y NC/ND hasta el recorrido del certificado. ConfirmActionButton es compartido: conservar el smoke RSC de pagos. Esto no sustituye una revisión visual.
- **Conocimiento y UI:** Guía §§10–11/16 y fichas pertinentes en el mismo lote; índice reproducible con SUBCONTRACTS y cinco casos certifications-knowledge.test.ts, sin LLM externo. Smoke aislado de lista/detalle/medición/formularios en escritorio y teléfono, motivos según estado, flujo Emitido y enlaces reales; separar lo inspeccionado de lo operado. D-132 no habilita certificados negativos ni promete una futura implementación.

## Selección reutilizable AG-09 — Ventas, deudas, cobranzas y pagos

- **Destino:** `BLOQER_AUDIT_LIVE=1`, ambas URLs explícitas, proveedores desactivados e identidad efectiva comprobada antes de fixtures (`assertAuditDatabaseIdentity`). Ejecutar desde `packages/services` con `node --import tsx --test --test-concurrency=1`; no habilitar suites mutantes en producción ni en el runner general.
- **AR:** `ar/ar-audit.live.test.ts` cubre empresa/obra/corporativo, permisos, padres, calendarios, precisión y NC/ND, caja frente a crédito, FX y letra de anticipo, reintento, gate Tesorería, movimiento exacto y rollback de GL. Retención `BLOQER_AUDIT_RETAIN_FIXTURES=1` solo para muestra visual sintética en la misma base aislada; por defecto limpia sus UUID propios.
- **AP:** `ap/ap-platform-audit.live.test.ts` cubre FX pago, fondos, saldo/caja/crédito, padres OC/EDT/APU, impuesto final y umbral, reintentos, carreras de numeración/emisión/anulación, cuenta compartida, período, rollback contable y borrador GL tardío. No sumar como aprobados rechazos dobles en una carrera que debe permitir progreso.
- **D-133:** patrón `D133 rejects stored negative header` en ambas suites selecciona el rechazo de IVA/percepción negativos persistidos antes del recálculo y la posterior corrección explícita, para factura, NC y ND. `invoice-tax-inputs.test.ts` e `invoice-tax-guards.test.ts` comprueban cero, signo y ausencia de máximos nuevos; los históricos emitidos se conservan.
- **Lecturas:** `ar/ar-finance-consumers-audit.live.test.ts` verifica aging/CSV/AI por moneda, saldos con NC, empresa/corporativo, padres corruptos y proyecciones/caja con ACL real. La herramienta AI se ejecuta sobre servicios locales; no requiere un modelo externo. `financial-notification-balance.test.ts` verifica la lectura de saldo en el contenido de aviso, sin enviar correo.
- **Fronteras de regresión:** conservar `finance/project-lifecycle-interleaving.test.ts` y `accounting/accounting-ar-ap-cancel-atomic.test.ts`. Para factura ligada a certificación, `certification/certification-connections-audit.live.test.ts`. Para liquidación AP de subcontrato, `subcontracts/subcontracts-audit.live.test.ts` con patrón `settle|settlement|credit|debit|payment account`; reportar solo lo ejecutado. Anular NC de obra conserva ACTIVE; no inferir una excepción por analogía con reversores que ya eran neutros al estado.
- **Contratos compartidos:** `idempotency.test.ts` distingue monto/FX/impuestos, referencia, nota, clave de aplicación, líneas empatadas y APU; `money-unit-price.test.ts` separa decimal API canónico de agrupación es-AR en teclado. `pagination.test.ts` comprueba índices inválidos antes de Prisma y el mismo índice efectivo se usa en lista y controles.
- **UI y conocimiento:** `financial-interactions.test.ts`, `financial-actions.test.ts`, `certification-ar-invalidation.test.ts` y React Flight de pago. Muestra aislada de obra y empresa, documentos/detalles/diálogos, error de validación, escritorio/teléfono y claro/oscuro; separar operaciones observadas de flujos inspeccionados. Guía §12 y ayuda en el mismo cambio; regenerar/verificar índice y ejecutar `financial-audit-knowledge.test.ts`, sin LLM externo.

## Selección reutilizable AG-10 — Tesorería, conciliación y contabilidad

- Usar `assertAuditDatabaseIdentity`, ambas URLs explícitas y proveedores desactivados. Habilitar `BLOQER_AUDIT_LIVE=1` solo en la base de auditoría. El runner general omite suites mutantes. Retener los UUID del fixture sintético solo para la muestra de navegador.
- `treasury/treasury-platform-audit.live.test.ts`: alcance de cuenta, cierre terminal, saldos, FX de operaciones nuevas, apertura negativa, replay, las dos fechas, ambas empresas de una transferencia, conciliación, período y reversión atómica. Las selecciones focales se deduplican por título y archivo.
- `ap/ap-platform-audit.live.test.ts`: pago con FX, pierna duplicada o desfasada, cuenta cerrada, D-135, carrera posteo/anulación y borrador adulterado. En `ar/ar-audit.live.test.ts` repetir anticipo USD, escrituras de caja directa y compuesta, rollback de anulación y carrera con posteo.
- Sin DB, seleccionar `accounting/*.test.ts`, `treasury/*.test.ts` excluyendo live, `treasury-reports/*.test.ts`, `finance/period-lock*.test.ts`, `finance/project-lifecycle-interleaving.test.ts`, `idempotency/idempotency.test.ts` y etiqueta de flujo de caja. Verificar controles de proyecto/empresa, moneda, cierre, grafo histórico, saldos por fecha y exports.
- Para migraciones de D-134 y D-137, verificar primero el destino efectivo. Confirmar columnas opcionales y ausencia de relleno histórico. Generar Prisma antes de las pruebas y compilar cuando terminen los runners SQL y el servidor de muestra.
- Para cambios visibles, mantener Guía §§4 y 15, fichas de ayuda e índice de conocimiento. En navegador aislado muestrear escritorio, tablet y teléfono. Elegir recorridos concretos de contabilidad, transferencia, extracto y conciliación. Registrar qué se operó y qué se inspeccionó.

## Selección reutilizable AG-12 — Tableros, reportes y entrega

- **SQL aislado:** `reports/operational-reports-audit.live.test.ts` cubre empresa/obra/moneda, fechas inclusivas, compromiso por OC, proveedor, cartera y crédito sin caja. `ar/ar-finance-consumers-audit.live.test.ts` cubre el límite de acceso AR/AP, saldo y proyección, base D-141 y devengado comparable. Usar `BLOQER_AUDIT_LIVE=1`, ambas URLs explícitas y el guard efectivo de identidad. Retener el fixture operativo solo para la muestra sintética autorizada.
- **Reportes programados:** `scheduled-reports/scheduled-report-execution.test.mts` con condición `react-server` prueba calendario, entrega por destinatario, pérdida de acceso, historial, reintentos y módulo deshabilitado. El caso `scopes daily report setup` de `schedule/schedule-audit.live.test.ts` comprueba historial D-100 y omisión D-140 con la base aislada y el proveedor deshabilitado.
- **Formatos:** `report-exports/csv-export.test.ts`, `report-pdf/src/report-valuation.test.tsx` y `apps/web/features/reports/report-download.test.ts`. Verificar comillas y saltos de línea, números negativos, moneda, filtros, ausencia de columnas sensibles y PDF válido. En navegador, repetir al menos una descarga real por selector o permiso modificado.
- **Regresión vecina:** para Avances, seleccionar `returns with observations|shows approved Field` de `jobsite-log/jobsite-operation-audit.live.test.ts`. Para reportes de Inventario, aplicar la selección AG-07. Regenerar el índice de ayuda si cambian Guía o decisiones.
- **Muestra:** escritorio Análisis de compras con mezcla de monedas y filtro de fecha, tablet Proveedores con moneda original y PDF, teléfono Certificaciones con dos niveles de acceso y CSV. Comparar las fuentes disponibles y el ancho del documento. Mantener aparte la auditoría integral de UX/UI.
