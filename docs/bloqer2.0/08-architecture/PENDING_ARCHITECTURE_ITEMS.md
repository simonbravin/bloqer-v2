# Pending architecture items — Bloqer 2.0

> Lista viva de **decisiones técnicas pendientes** y mejoras sugeridas. Completar antes o durante Phase 0 / implementación.  
> **No** sustituye [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) (producto); aquí predomina **cómo** modelar o implementar.

## Fronteras detectadas por la auditoría global

## P-AG10-01 — FX de movimientos manuales y transferencias

- **Origen:** frontera detectada en AG-09 al contrastar el alta Solo caja con D-008/MONEY_MODEL. La auditoría completa de cuentas, movimientos y transferencias corresponde a AG-10, aún no iniciada.
- **Evidencia:** AccountMovement conserva amount/currency pero no tiene columnas fxRate/amountArs; InternalTransfer tampoco representa un snapshot FX. Payment/Collection y facturas sí lo tienen y se corrigen/verifican en AG-09. Agregar un campo visible sin persistencia perdería el dato ingresado.
- **Pendiente:** diseñar representación, todos sus escritores/lectores/GL, tratamiento explícito de históricos desconocidos y migración. Requiere propuesta y autorización de nuevos campos conforme AGENTS §5; no se presume FX 1 para moneda extranjera ni se regularizan históricos automáticamente.
- **Estado:** Q-081 aprobada como D-134. Se agregan columnas en `AccountMovement`, y la transferencia propia lee el snapshot de sus piernas. Migración validada en base aislada. Implementación y verificación de escritores, lectores y UI en [AG-10](./platform-audit/2026-11-05-ag-10-treasury-accounting.md).

## INDARI / Casa Hogar — auditoría del 21/10/2026

Plan de trabajo: [INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md](./INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md). Los siguientes pendientes no autorizan cambios de datos ni nuevos modelos.

### P-IND-01 — Reconciliar procedencia de tres migraciones aplicadas

- **Estado:** VERIFICACIÓN ESTRUCTURAL COMPLETADA 21/10/2026; procedencia histórica exacta no recuperada. Ver [resultados de fase 0](./INDARI_CASA_HOGAR_PHASE_0.md).
- **Hallazgo aclarado:** los checksums de `20260807220000_d074_treasury_settlement_method`, `20260807230000_d075_bank_reconciliation` y `20260808140000_d078_period_close` son etiquetas literales, no hashes SHA-256. Se repiten en producción y dev. Los registros no permiten identificar el SQL original ni quién los registró.
- **Distinción:** la diferencia de `20260914120000_d115_fiscal_credit_debit_notes` sí se explica por CRLF local; producción coincide con Git/LF.
- **Evidencia:** 69 migraciones reproducidas en DB vacía aislada. Producción y reconstrucción coinciden en 1.206 columnas, 346 restricciones, 355 índices y 387 valores de enum. No se compararon exhaustivamente funciones, triggers, roles ni datos.
- **Medida:** conservar la salvedad de trazabilidad; no editar checksums, reescribir migraciones aplicadas ni usar reset/resolve para ocultar las etiquetas. No hay divergencia estructural detectada que justifique una reparación de producción.
- **Dependencia:** habilita desarrollar PR sin schema. Las futuras migraciones requieren ensayo específico, revisión de objetos afectados fuera de esta comparación y controles ordinarios de despliegue; la coincidencia no certifica todos los objetos de la DB.

### P-IND-02 — Cobertura de factura y concurrencia OC/recepción

- **Estado:** CORREGIDO Y VERIFICADO EN DB AISLADA 21/10/2026. Carrera reproducida: Dos disparadores simultáneos (panel OC/recepción) provocaron P2002 por numeración de factura duplicada. No demuestra causa de duplicados históricos.
- **Corrección implementada:** bloqueo de la OC y lectura de cobertura/creación/refresco del borrador en una única transacción. `createSupplierInvoice` admite cliente transaccional interno; sin transacción anidada ni nueva restricción «una factura por OC».
- **Contexto:** cobertura por cabecera/línea vinculadas no cuenta de igual modo registros legacy sin vínculos. Buscar un borrador existente antes de crear no demuestra exclusión de dos disparadores simultáneos.
- **Verificación:** panel OC y recepción simultáneos devuelven el mismo ID; una segunda recepción amplía ese borrador; anularlo permite uno nuevo sin contar el anulado. Cobertura final recibida 847, facturada 242, reservada 605, pendiente 0 y pagada 121 (datos sintéticos). Vínculos de líneas conservados. No cambia la numeración general de documentos de otras OC concurrentes (P-ERD-04).
- **Cierre:** reproducción y fix de causa con regresión, o evidencia de que el control actual cubre el escenario. Regularización legacy separada y respaldada por comprobantes; no asociar por texto/importe silenciosamente.

**Continuación fase 2 (21/10/2026):** controles D-066 de vínculos de líneas automáticas al crear/editar/emitir; aislamiento de lectura y edición por empresa y membresía de obra; avisos de cobertura por cantidad incompleta en facturas con vínculo solo de cabecera. Alta manual conserva ese caso válido. Suite AP aislada: 6 escenarios aprobados, incluyendo emisión única, NC/ND, crédito/deuda, caja y devengado. Sin migraciones ni regularización histórica. Ver §13 del plan.

### P-IND-03 — Acreditar versión de portal y entorno de regresión

**Estado vigente 22/10/2026:** publicación y migración de producción acreditadas; queda smoke operativo UI. PR #1 integrado, SHA `1d07699a`, deployment Vercel `9SKYgHtUNWHcZs6z7trTLGXaWwqU` Ready con alias `portal.bloqer.app`. D-118 aplicada: 70 migraciones, 191 líneas anteriores preservadas y clasificación null. Recuperación Neon de 6 horas verificada antes de migrar. Login/sesión/consola correctos; la cuenta de plataforma carece de contexto operativo para revisar Casa Hogar. No ampliar permisos para el smoke. Preview diferido explícitamente por Owner; se mantienen overrides de DB, sin cambios de URL/clave. Ver §17 del plan INDARI. El seguimiento siguiente es histórico, no el estado de publicación vigente.

**Seguimiento 21/10/2026:** reabierto por pedido del usuario antes de fase 2. Se identificó el proyecto Vercel `bloqer-v2-web` y se ofreció su integración; aún falta conexión autenticada para acreditar el alias. El push a una rama de revisión no acredita producción.

- **Estado:** PARCIAL 21/10/2026. Último deployment GitHub Production `6764344935` exitoso con SHA `527c824c9ad9009b0d9cf2d729a184dc5f2e31f9`, base de la intervención. La vista previa de `399128cf` pasó Vercel y CI; no acredita el alias de producción. Falta acreditar la asignación actual del alias de portal desde Vercel autenticado.
- **Entorno listo:** DB `bloqer_indari_phase0_20261021` en compute dev, con 69 migraciones y fixtures sintéticos protegidos. Integración ampliada: 13 casos distintos aprobados (12 juntos y el caso adicional de recepción posterior en una ejecución dirigida de 2 casos); ver P-IND-02/04. No equivale a E2E UI aprobado.
- **Acción pendiente:** verificar alias/deployment antes de publicar y completar regresión de cada PR. `prisma validate` y pruebas unitarias no sustituyen esa comprobación.
- **Fase 3 / D-118:** migración aditiva de clasificación aplicada en DB aislada (70 migraciones). Confirmar también las URLs efectivas del preview antes de push: `vercel-migrate-if-needed.mjs` aplica automáticamente las migraciones pendientes al entorno del build. La autorización del campo no acredita el destino. Producción aún no migrada; guía de recuperación y smoke en `DEPLOYMENT_SMOKE_TEST.md`.
- **Fase 4:** Vercel autenticado confirmó el alias `portal.bloqer.app` en Production, deployment `G2wxsALbkwt2mWCeriW6SB9HjmGS`, SHA `527c824c`. El preview de `b3d178cb` figura exitoso, pero heredaba las conexiones compartidas Production/Preview. Con autorización explícita se guardaron `DATABASE_URL` y `DIRECT_URL` exclusivas de Preview para `codex/indari-pendientes-decimales`, apuntando a la DB aislada; se aplican al próximo deployment. No se cambiaron las variables de Production. Otras ramas siguen pendientes de aislamiento global y no deben usarse para probar migraciones. Consulta de solo lectura confirma que D-118 todavía no está aplicada en producción. Recuperación Neon y smoke publicados pendientes; revisión/controles en §16 del plan.
- **Entrega de revisión:** PR #1 / `08b13fdf`, CI aprobado (E2E omitido) y Vercel exitoso. El build acreditó DB aislada/70 migraciones. Smoke detenido porque el acceso del preview redirige a producción: separar `AUTH_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL` y `AUTH_SECRET` por rama antes de continuarlo. Owner consultado; ningún cambio de esas variables aplicado todavía. No promover este preview como si estuviera validado funcionalmente.
- **Cierre:** versión y destino de pruebas documentados por entrega. No usar datos reales de Casa Hogar como fixtures mutables.

### P-IND-04 — Timeout de adjudicación en integración aislada

**Seguimiento 21/10/2026:** reabierto por pedido del usuario. Corrección implementada y regresión aislada de adjudicación aprobada (parcial, concurrencia, rollback, anulación/readjudicación y lote de dos proveedores).

- **Estado:** CORREGIDO Y VERIFICADO EN DB AISLADA 21/10/2026; publicación y smoke UI pendientes (P-IND-03).
- **Evidencia:** `procurement-regression.live.test.ts` falla al adjudicar una de dos líneas con Prisma `P2028`: 5.160 ms y 5.560 ms frente al límite de 5.000 ms, en dos ejecuciones. La DB confirma ambas SC sin líneas adjudicadas ni líneas de OC persistidas tras los fallos.
- **Alcance:** falla desde esta conexión al compute de desarrollo; no prueba que portal tenga la misma latencia ni que explique OC-051. Los otros tres casos de integración pasan.
- **Corrección:** creación de líneas y vínculo a SC por lote; totales de cabecera con el mismo helper canónico sobre las líneas seleccionadas, sin releerlas; quitada la lectura redundante de cotización; settings y clasificación EDT usan el cliente transaccional. Se conserva la relectura de líneas después del bloqueo. Timeout explícito de 30 s solo en adjudicación y anulación vinculada a SC, con espera de conexión de 10 s, sin cambio global. La anulación también reprodujo P2028 con 5 s antes del ajuste.
- **Cierre técnico:** regresión aprobada con configuración efectiva del servicio, sin override del test. La publicación sigue condicionada a P-IND-03 y smoke UI.

## ERD / modelo físico (ver [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-ERD-01 | Forma del puente **collection/payment → AR/AP** (`*_application` vs líneas embebidas) | **HECHO 2026-08-08** — 1:1 sin `*_application`; parcialidad = múltiples docs ([D-081]) |
| P-ERD-02 | Columna **`balance`** en `receivable`/`payable`**: solo derivada vs mantenida por servicio | **HECHO 2026-08-08** — `paidAmount`/`originalAmount` mantenidos; balanceDue derivado; OVERDUE on-read ([D-081]) |
| P-ERD-03 | Tabla explícita **`direct_sale`** vs solo `sales_invoice` sin `certification_id` | Alinear con venta directa |
| P-ERD-04 | **Numeración correlativa** ([Q-002](../00-product/OPEN_QUESTIONS.md)) | Tabla `number_sequence` vs advisory lock |
| P-ERD-05 | Modelo fino de **`tax_line`** y polimorfismos | Normalización vs pragmatismo Fase 1 |
| P-ERD-06 | Entidad **línea de extracto** en conciliación bancaria | **HECHO 2026-08-08** — tabla `BankStatementLine` ([D-081]) |
| P-ERD-07 | **UUID v4 vs v7** | **HECHO 2026-05-07** — UUID v4 elegido. Ver ADR-Phase1-01. |
| P-ERD-08 | **Equipo de obra / R-USR-007** | **Antecedente superado por ACL [D-111], revalidado AG-01 (03/11/2026):** `ProjectTeamMember` conserva función de roster; `ProjectMembership` + `ProjectAccessMode` controlan acceso. Pendientes, shell, empresa y avisos se corrigieron y verificaron con suites SQL aisladas; ver [AG-01](./platform-audit/2026-11-03-ag-01-identity-access.md). La revisión operativa/visual completa de Field sigue en AG-11. |
| P-PUR-01 | **Oleada B compras** (atajo alto nivel, auto-confirm on approve, auto-draft AP) | **Hecho 2026-08-30** — [D-106]/[D-107]/[D-108]. Commitment unificado / Workflows → Oleada C ([Q-060]). |

## Gastos generales → obra (D-040)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-GG-01 | ~~**Q-013 opción 3**~~ — prorrateo automático de GG según peso del CD del período | **Hecho:** `Company.overheadAllocationMode` (`MANUAL` \| `AUTO_WEIGHT`); `overhead-auto-weight.service.ts` |
| P-GG-02 | Filtro de período en margen neto | Rentabilidad suma **todas** las imputaciones manuales históricas; filtro `periodFrom`/`periodTo` en `getProjectOverheadAmount` listo para reportes con rango |
| P-GG-03 | Moneda de imputación manual | Debe coincidir con presupuesto aprobado del proyecto (validado en servicio) |

## Reportes (ver [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-RPT-01 | Vistas SQL para joins repetidos | Crear cuando haya 3+ copias del mismo SQL |
| P-RPT-02 | MV para `payment_status` / `settlement_status` materializados | Solo si perf muestra necesidad; documentar staleness |
| P-RPT-03 | Query builder ([Q-010](../00-product/OPEN_QUESTIONS.md)) | Lista blanca de tablas + límites |

## API / transporte (ver [`API_STRUCTURE.md`](./API_STRUCTURE.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-API-01 | Lista cerrada de rutas que **deben** ser Route Handler vs Action | Tabla en ADR cuando exista `app/` |
| P-API-02 | **Idempotency-Key**: tabla y TTL de dedupe | Diseñar con tesorería |
| P-DOC-05 | **Upload create-subcontrato → direct-to-R2** | UI Documentos / evidencias / facturas ya usan initiate→PUT→confirm (hasta 50 MB; CORS en bucket). Pendiente: adjuntos al *crear* subcontrato (aún Server Action, tope ~3.5 MB). Ver [`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md). |

## Repo / packages (prompt 3)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-REP-01 | Nombres exactos de paquetes (`@bloqer/*`) | Definir al crear `pnpm-workspace.yaml` |
| P-REP-02 | **Turborepo** on/off ([ADR-006](./ARCHITECTURE_DECISION_RECORDS.md)) | Decidir al segundo paquete compilable |
| P-REP-03 | Ubicación de **E2E** (`apps/web/e2e` vs root) | **HECHO 2026-08-08** — `apps/web/e2e` + Playwright; CI job opcional con secrets |

## Certificaciones / concurrencia

| ID | Tema | Acción sugerida |
|---|---|---|
| P-CERT-01 | `issueCertification` corre dentro de una txn READ COMMITTED. Reduce la ventana de race condition pero no la elimina si dos DRAFT certs para el mismo `wbsNodeId` se emiten simultáneamente | Añadir advisory lock (`pg_try_advisory_xact_lock`) o usar `SERIALIZABLE` isolation cuando aparezca alta concurrencia real |

## Tesorería / Cobranzas (Phase 3C — implementado 2026-05-08)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-TRZ-01 | **OVERDUE derivado en lectura** — `serializeReceivable` computa `OVERDUE` en cada `getReceivableById` / `listReceivablesByProject`. Costoso a escala pero correcto | Agregar background job / cron que persiste `status = OVERDUE` en DB cuando haya > 10k cuentas |
| P-TRZ-02 | **FX collections no soportado** — `createCollection` valida `account.currency === receivable.currency`. Multi-divisa requiere tipo de cambio negociado | **DIFERIDO** cierre Phase 3 ([D-081]) — misma moneda; `ExchangeRate` fuera de fases 0–5 |
| P-TRZ-03 | **Política de saldo negativo** — `createInternalTransfer` bloquea si `sourceBalance < amount` (D4). No hay "overdraft autorizado" | **DIFERIDO** cierre Phase 3 ([D-081]) — saldo no negativo; sin `allowOverdraft` |
| P-TRZ-04 | **Ajustes manuales** — UI genérica `/tesoreria/cuentas/[id]/ajuste` | **HECHO 2026-08-08** — `registerManualTreasuryAdjustment` + UI ([D-081]); también vía conciliación [D-075] |
| P-TRZ-05 | **Conciliación bancaria** — manual + CSV + OFX + ajuste desde extracto + reapertura formal ([D-080]). API bancaria → `INTEGRATIONS_FUTURE` | **HECHO 2026-08-08** (API banco fuera de fases 0–5) |
| P-TRZ-06 | **Doble conteo saldo inicial** — `getAccountBalance` sumaba `TreasuryAccount.openingBalance` **y** movimientos `OPENING_BALANCE` | **HECHO 2026-05-29** — `resolveOpeningBase` + `getAccountBalanceAsOf` en `balance.service.ts`; reportes tesorería migrados. Cuentas legacy sin movimiento siguen usando el campo. |
| P-TRZ-07 | **Tests e2e de concurrencia** — locking optimista en create/cancel payment/collection | **HECHO 2026-05-29** — `assertOptimisticRowUpdate` centraliza contrato (`count === 1`); 76 tests unitarios cubren guards + locking + balance. Tests DB paralelos diferidos hasta CI con infra dedicada (no blocker Fase A). |

## Contradicciones a vigilar

- Cualquier divergencia entre [`BACKEND_LAYERING`](./BACKEND_LAYERING.md) (“handlers delgados”) y ejemplos futuros en código → actualizar doc o código.  
- Q-001 **núcleo resuelto 2026-05-07**: Tenant 1:N Company (Alternativa B). Ver ADR-Phase1-02. FK `company_id` en `user_memberships`.
- **Sub-problema 2026-05-13:** mismo usuario con **dos sociedades activas** en un tenant sigue **abierto** en [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-001 (`@@unique([userId, tenantId])` en Prisma).

## Cómo usar este archivo

- Al resolver un ítem: marcar **HECHO** con fecha y enlace a PR/ADR, o **MOVIDO** a `OPEN_QUESTIONS` si era ambigüedad de producto.  
- Los agentes IA: **no** borrar filas sin confirmación; agregar fila si surge nueva duda técnica.

## P-AG05-01 — Memoria del servidor de desarrollo durante smoke prolongado

- **Estado:** observación técnica abierta, 04/11/2026; causa de producto no confirmada. No autoriza cambiar arquitectura, dependencias ni límites globales de memoria.
- **Evidencia:** `output/platform-audit/ag-05-2026-11-04/local-server.log`. Después de aproximadamente una hora con recompilaciones HMR y varias rutas, el proceso local Next dev terminó con `FATAL ERROR ... JavaScript heap out of memory`, cerca de 12,9 GB de heap, al compilar el resumen de una obra para el VIEWER sintético. El login/dashboard ya habían cargado; la navegación de obra quedó sin verificar en esa corrida. Proceso y puerto efectivos comprobados como ausentes después del fallo.
- **Límite:** una caída de dev durante una auditoría con múltiples ediciones no demuestra la misma falla en el build publicado. Tampoco se presenta una prueba corta del build como garantía de memoria estable a largo plazo.
- **Próxima comprobación:** repetir navegación de consulta en build local fresco con base aislada y proveedores deshabilitados; separar compilación/HMR de ejecución normal. Si se reproduce, perfilar el recorrido y los imports antes de proponer una corrección. Conservar como entrada de regresión/rendimiento AG-14 y reabrir antes si afecta un recorrido necesario de otra etapa.
- **Repetición acotada realizada:** build de producción local aprobado; en proceso nuevo, VIEWER accedió a obra asignada, cronograma y detalle sin edición y cerró sesión. Evidencia `visual-checks.json`, `preview-server.log` y `preview-environment.json` de AG-05. La instancia se detuvo luego del smoke; este recorrido corto no comprueba estabilidad de HMR ni memoria a largo plazo, por lo que la observación no se marca resuelta.

## AG-06 — Cierre parcial formal de órdenes

### P-AG06-01 — Representación del saldo que no se recibirá

- **Estado:** desarrollo separado aprobado por el Owner, D-128/Q-076 (04/11/2026). No implementado; no bloquea el cierre correctivo AG-06 en su alcance aprobado.
- **Evidencia:** BR-PUR-013 y destino conceptual «cierre» en el diagrama, pero no hay acción, enum ni campo de remanente desistido en el schema. No se simula editando cantidades/importes de una OC confirmada ni anulando documentos reales.
- **Antes del código:** especificar representación y efecto exacto en compromiso/exposición, recepción tardía/reversa, facturas/NC/ND, permisos, trazabilidad y migración. El Owner debe aprobar el diseño y las reglas/campos nuevos; D-128 solo aprueba la separación de alcance.
- **Fuentes:** [propuesta aprobada](./platform-audit/2026-11-04-ag-06-partial-close-scope-proposal.md), [informe AG-06](./platform-audit/2026-11-04-ag-06-procurement.md). La guía y ayuda distinguen esta capacidad futura de las recepciones parciales actuales.

## P-AG08-01 — Rectificación de certificaciones ya reconocidas

- **Estado:** alcance separado con diseño previo, aprobado en D-132/Q-079 (05/11/2026). No implementado ni comprometido como función de certificados negativos; no bloquea el cierre correctivo AG-08.
- **Contrato vigente:** las cantidades de una certificación habitual son no negativas y respetan los topes D-119. No se alteran históricos ni se usa una NC para simular avance físico negativo.
- **Si se solicita:** definir previamente autorización, acumulados, estados, vínculo con facturas/NC/CxC y trazabilidad; someter las nuevas reglas o campos a aprobación. La aprobación actual solo separa el alcance.
- **Fuentes:** [propuesta aprobada](./platform-audit/2026-11-05-ag-08-negative-certification-scope-proposal.md), [CERTIFICATIONS §13](../02-modules/CERTIFICATIONS.md).

## AG-00 — Aislamiento: reconciliación documental resuelta

Diagnóstico inicial del 03/11/2026: [subanálisis de arquitectura](./platform-audit/2026-11-03-ag-00-architecture.md). El usuario confirmó explícitamente la [propuesta de reconciliación](./platform-audit/2026-11-03-ag-00-isolation-proposal.md), formalizada en [ADR-018](./ARCHITECTURE_DECISION_RECORDS.md). El cierre siguiente es documental/arquitectónico; no equivale a comprobar SQL ni autorización de todos los recorridos y no introduce schema, migraciones o middleware.

### P-AG00-01 — Reconciliar el filtro de tenant por defecto descrito con el cliente disponible

- **Estado:** HECHO 03/11/2026 — reconciliación del contrato en ADR-018 por confirmación explícita del usuario. Hallazgo GA-AG-00-005 resuelto en su alcance documental/arquitectónico; no se demostró fuga de datos ni se certifica ausencia de fugas.
- **Antecedente:** `MULTITENANCY_ARCHITECTURE.md` §defensa en profundidad y `TENANT_ISOLATION_MODEL.md` §enforcement describían filtro/inyección por defecto mediante repositorio o middleware.
- **Evidencia estática:** `packages/database/src/client.ts` exporta un `PrismaClient` simple y `index.ts` lo expone. Numerosos servicios construyen sus filtros y guards explícitamente; el control predeterminado descrito no está implementado globalmente en ese cliente.
- **Resolución:** las fuentes describen ahora el mecanismo explícito en servicios/repositorios: filtros masivos en consulta y guards de pertenencia antes de usar/devolver cargas por ID o mutar. No atribuyen automatismo inexistente a Prisma ni deciden implementarlo.
- **Verificación pendiente por recorrido:** AG-01 comprobará contexto, entradas directas y consultas con dos tenants en infraestructura apropiada. Este cierre documental no sustituye esa integración ni se justifica solo por schema o typecheck.

### P-AG00-02 — Aclarar columna de tenant en hijos frente a pertenencia heredada

- **Estado:** HECHO 03/11/2026 — contrato físico confirmado y fuentes reconciliadas por ADR-018. Hallazgo GA-AG-00-006 resuelto en su alcance documental/arquitectónico; no se demostró defecto de aislamiento.
- **Antecedente:** AGENTS y el modelo de aislamiento exigían columna en toda fila operativa, mientras `PRISMA_ERD_AUDIT.md` §1 aceptaba hijos sin tenant redundante por FK al padre.
- **Evidencia estática:** 22 modelos hijos/configuraciones del schema actual carecen de columna propia; ejemplos `BudgetSettings`, `WbsNode`, líneas de documentos y `CompanyProcurementSettings`. La pertenencia debe comprobarse a través del padre en los recorridos actuales.
- **Resolución:** raíces operativas con tenant obligatorio; catálogo cerrado de los 22 hijos existentes con padre dueño obligatorio, comprobación del padre autorizado y coherencia de referencias adicionales. Se distingue pertenencia lógica de columna redundante; no se permiten nuevos hijos sin columna por analogía.
- **Límites:** no se agregaron campos ni migraciones. Las anotaciones `## Hallazgo` conservan el diagnóstico inicial y registran la resolución por ADR-018. La comprobación SQL y de autorización de los recorridos afectados sigue pendiente para AG-01; la confirmación documental no la acredita.
