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
| ADR-007 | Gantt y cronograma detrás de adapter único (Kibo UI) | ACEPTADO |
| ADR-008 | Modelo físico: `tenant` + `company` 1:N (legal entity = `company`) con `project.company_id` opcional hasta multi-empresa activa | PROPUESTO |
| ADR-009 | UUID PK en todas las entidades ERP; numeración humana en columnas separadas | PROPUESTO |
| ADR-Phase1-06 | Membresía única `(userId, tenantId)` Phase 1 | ACEPTADO |
| ADR-Phase1-07 | Ingresos corporativos sin obra: GL + tesorería Phase 1 | ACEPTADO (parcial; ver ADR-015) |
| ADR-015 | AR corporativo `projectId` nullable (Q-030 opción 1 / D-051) | ACEPTADO |
| ADR-010 | Reporting read-layer: agregación on-read sin tablas duplicadas de montos | ACEPTADO |
| ADR-011 | `fx_rate` + `amount_ars` en comprobantes financieros (D-008) | ACEPTADO |
| ADR-012 | Transacciones UX: modelo documental + guards de integridad | ACEPTADO |
| ADR-013 | Anticipos a proveedor: cuenta puente Fase 2 | ACEPTADO |
| ADR-014 | PDF render boundary en `@bloqer/report-pdf` (monorepo + Next.js) | ACEPTADO |
| ADR-016 | Company vs project finance tools (D-056) | ACEPTADO |
| ADR-017 | Bloqer AI: tool layer + provider-agnostic (`AiProvider`) sobre `@bloqer/services` | ACEPTADO |
| ADR-018 | Aislamiento explícito y catálogo cerrado de hijos con tenant heredado | ACEPTADO |
| ADR-019 | Lectura asistida efímera de comprobantes y documento individual de OC | ACEPTADO (primer paquete autorizado; activación separada) |

---

## ADR-019 — Lectura asistida efímera de comprobantes y documento individual de OC

- **Fecha:** 2026-11-19.
- **Estado:** ACEPTADO para implementar el primer paquete del relevamiento autorizado por Owner en esta fecha. No autoriza despliegue, nuevos proveedores, dependencias, persistencia ni reglas financieras.
- **Contexto:** reducir la carga manual de una factura y preparar una OC para compartir, reutilizando servicios, permisos, proveedor AI y renderer PDF existentes.
- **Decisión:**
  1. Extender de manera compatible `AiProvider` para enviar un PDF o una imagen y solicitar una respuesta estructurada. Una sola extracción sin tools, sin agente de escritura, sin IDs propuestos por el modelo y sin seguir enlaces del documento. El SDK permanece dentro del adaptador existente.
  2. El servicio AP autoriza empresa/obra/actor, comprueba formato y tamaño antes del proveedor y devuelve una propuesta **efímera**. El primer corte cubre alta manual de factura normal en ARS; NC/ND, moneda desconocida/otra moneda e impuestos no representables se derivan a carga manual. Los campos desconocidos se conservan como tales; los cálculos y la comparación de importes usan el kernel vigente.
  3. La lectura requiere acción explícita y flags de AI/producción y capacidad. No se activa automáticamente al seleccionar un archivo. Aplicar la propuesta solo modifica el formulario. Guardar utiliza el servicio de borrador existente; no emite, paga, aprueba ni modifica stock. No reemplaza líneas de borradores provenientes de OC.
  4. El original local se adjunta al borrador con el uploader actual. Una vez conocido el ID creado, un fallo de adjunto se recupera sobre ese mismo ID. Una respuesta de creación incierta exige revisar el listado antes de repetir; no se promete idempotencia persistente nueva. Número fiscal leído solo informativo: no se usa como numeración interna ni se promete deduplicación fiscal.
  5. El documento individual de OC es una proyección de lectura autorizada y un PDF en `@bloqer/report-pdf`. Muestra su estado y datos comerciales; excluye notas, imputaciones, presupuesto, variaciones y aprobadores internos. Descargar o compartir el archivo desde el dispositivo no cambia estado ni acredita envío, recepción o aceptación del proveedor.
  6. Refinamiento UX autorizado el 19/11/2026: separar impedimentos de compatibilidad/integridad de datos faltantes que pueden completarse por el usuario. `canApply` habilita únicamente trasladar una propuesta parcial al formulario, nunca guardarla como validada. La respuesta efímera distingue `reviewReasons` y `blockingReasons`; no se agregan campos persistidos. Comparar importes verificables aun si falta otra cabecera; conservar ausencias como null/vacío, sin valores habituales. La UI exige completar y confirmar la revisión del original antes del alta DRAFT habitual. Pruebas de layout y dispositivos se distinguen de verificación estática; no se habilita el piloto por este cambio.
- **Consecuencias:** sin migraciones ni npm nuevos; chat conserva tools READ. Bandeja durable, número fiscal persistido, cuotas distribuidas, seguimiento multicanal y escritura conversacional requieren decisiones posteriores. Flags apagados por defecto y verificación de permisos/errores/aislamiento antes del piloto real.
- **Referencias:** [plan del primer paquete](../PLAN_AUTOMATIZACION_PRIMER_PAQUETE.md), [documentos](../02-modules/DOCUMENTS.md), [AP](../02-modules/EXPENSES_AND_PAYMENTS.md), ADR-014, ADR-017, D-053, D-090, D-108 y D-145.

---

## ADR-018 — Aislamiento explícito y catálogo cerrado de hijos con tenant heredado

- **Fecha:** 2026-11-03.
- **Estado:** ACEPTADO por confirmación explícita del usuario durante la remediación de AG-00, sobre la [propuesta de reconciliación](./platform-audit/2026-11-03-ag-00-isolation-proposal.md).
- **Contexto:** GA-AG-00-005/006 identificaron fuentes que describían filtro automático o columna de tenant en cada fila, mientras la implementación usa scopes/guards explícitos y 22 hijos/configuraciones heredan pertenencia por su padre. D-001 mantiene el aislamiento absoluto; faltaba reconciliar el mecanismo y su contrato físico sin inventar cambios de schema.
- **Decisión:**
  - El tenant se obtiene del contexto autenticado. Ningún dato del cliente habilita leer, devolver o modificar información de otro tenant. Empresa y proyecto conservan sus reglas específicas; `companyId` no sustituye al tenant.
  - El mecanismo vigente es explícito en servicios/repositorios. Las lecturas masivas se acotan desde la consulta; una carga por ID comprueba pertenencia antes de usar o devolver el agregado o mutar. El cliente Prisma simple no inyecta filtros ni rechaza automáticamente consultas sin tenant.
  - Las raíces operativas conservan `tenant_id` obligatorio. Solo los **22 hijos/configuraciones existentes** del [catálogo de pertenencia](./TENANT_ISOLATION_MODEL.md) conservan tenant derivado de su padre dueño obligatorio. El catálogo es cerrado: no habilita nuevos hijos sin columna por analogía.
  - Toda consulta o mutación de esos hijos comprueba padre, tenant y coherencia de las referencias adicionales, incluso cuando las FK simples no garantizan esa coherencia. Un ID de hijo recibido del cliente se valida contra el padre autorizado.
  - Identidad, raíz y administración de plataforma mantienen sus propósitos y guards propios, enumerados separadamente en el catálogo.
  - Esta reconciliación no incorpora columnas, migraciones ni middleware global. Un control automático adicional requiere diseño y ADR propios con pruebas de compatibilidad.
- **Consecuencias:** se alinean AGENTS, requisito de multitenancy, convenciones y documentos de aislamiento con el contrato confirmado. Se resuelven P-AG00-01/02 y GA-AG-00-005/006 en su alcance documental/arquitectónico; la aprobación no acredita SQL, datos efectivos ni autorización correcta de todos los recorridos. Las pruebas de políticas sin DB no reemplazan la integración aislada prevista para AG-01.
- **Referencias:** D-001 en [`DECISION_LOG.md`](../00-product/DECISION_LOG.md), [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md), [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md), [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md), [`PRISMA_ERD_AUDIT.md`](./PRISMA_ERD_AUDIT.md).

---

## ADR-017 — Bloqer AI tool layer + provider abstraction (ACEPTADO)

- **Fecha:** 2026-09-04
- **Estado:** ACEPTADO (D-AI-01…05 en [`BLOQER_AI_ARCHITECTURE.md`](../BLOQER_AI_ARCHITECTURE.md) §0.4)
- **Contexto:** Incorporar asistente in-app (ayuda + datos reales) sin romper multitenancy, RBAC ni service layer, y sin acoplar el producto a un vendor LLM.
- **Decisión:**
  - El LLM solo llama un **registry tipado** de tools (`packages/services/src/ai/`); cada tool delega a services existentes. Tools **nunca** importan SDKs de provider.
  - `AiExecutionContext` se construye server-side desde sesión; el modelo no aporta `tenantId`.
  - MVP: solo `READ` (+ knowledge). `WRITE_CONFIRM` tipado pero deshabilitado.
  - **D-AI-05:** abstracción obligatoria — `AiProvider` (`streamResponse` / `generateResponse`), tipos normalizados (`AiMessage`, `AiToolDefinition`, `AiToolCall`, `AiToolResult`, `AiUsage`, `AiModelConfig`, `AiProviderError`), `AiProviderRegistry` y capabilities. Orquestación / knowledge / adapters viven en `@bloqer/ai`; SDKs solo en `adapters/`.
  - Primer adapter MVP: OpenAI Chat Completions (`openai` + `baseURL` opcional) — implementación, no lock-in.
  - Knowledge: help + BM25 local; independiente del provider LLM.
  - Secrets MVP: solo env de plataforma. Admin/BYOK futuro requiere KMS (sin encryption-at-rest hoy en repo).
  - Dependencias: `@bloqer/ai` → `config` (+ zod); **no** importa `services` ni React; `services` puede importar tipos de `ai`.
- **Consecuencias:** dependencia `openai` acotada a adapters; env `BLOQER_AI_PROVIDER` / `BLOQER_AI_MODEL` / `OPENAI_*`; sin migraciones Prisma en MVP; cambio de vendor = nuevo adapter, misma tool registry (también compartida con MCP futuro).
- **Referencias:** [`BLOQER_AI_ARCHITECTURE.md`](../BLOQER_AI_ARCHITECTURE.md), [`PACKAGE_STRUCTURE.md`](./PACKAGE_STRUCTURE.md), [`SERVICE_LAYER.md`](./SERVICE_LAYER.md), [`HELP_CENTER.md`](./HELP_CENTER.md).

---

## ADR-010 — Reporting read-layer (baseline vs ejecución)

- **Fecha:** 2026-05-28
- **Estado:** ACEPTADO
- **Contexto:** Hub de reportes por proyecto (presupuesto vs real, certificaciones, compras, subcontratos, caja) debe reconciliar con [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) y el ERD Prisma sin introducir silos de KPIs ni auto-crear subcontratos al aprobar presupuesto.
- **Decisión:**
  - **Baseline** = `Budget` `APPROVED`/`CLOSED` + `WbsNode` + `CostItem` + `CostAnalysisLine` (APU por categoría MAT/LAB/EQP/SUB).
  - **Ejecución** = documentos operativos (`PurchaseOrder`, `SupplierInvoice`, `Payable`, `Payment`, `Subcontract`, `SubcontractCertification`, `Certification`, `SalesInvoice`, `Receivable`, `Collection`, `AccountMovement`).
  - Servicios en `packages/services/src/reports/` **solo lectura**; export CSV/JSON reutiliza los mismos servicios que la UI.
  - Derivados (`payment_status`, varianzas, aging): **on-read** salvo ADR futuro explícito para MV/snapshot versionado.
  - Línea APU `SUBCONTRACT` **no** genera `Subcontract` al aprobar presupuesto; el contrato se registra al contratar.
- **Consecuencias:** consultas más pesadas aceptables en Fase 1; checklist y tablas fuente en [`REPORTING_ERD_GUARDRAILS.md`](./REPORTING_ERD_GUARDRAILS.md); catálogo ampliado en [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).
- **Referencias funcionales:** [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md), [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md), [`02-modules/WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md).

---

## ADR-011 — FX manual y `amount_ars` en comprobantes (D-008)

- **Fecha:** 2026-05-28
- **Estado:** ACEPTADO
- **Contexto:** [`MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md) y [D-008](../00-product/DECISION_LOG.md) exigen `fx_rate` y `amount_ars` persistidos; el schema operativo no los tenía.
- **Decisión:** columnas `fxRate` + `amountArs` en `SalesInvoice`, `SupplierInvoice`, `Payment`, `Collection`; cálculo en emisión/confirmación vía `resolveFxAmounts` (`@bloqer/utils`); reportes con `currency_view=ARS` suman `amountArs` cuando el FX está cargado.
- **Consecuencias:** migración `20260528120000_fx_amount_ars`; sin proveedor FX externo ni diferencia de cambio automática (Q-025).

---

## ADR-012 — Transacciones UX: modelo documental + guards de integridad (Fase 0)

- **Fecha:** 2026-05-29
- **Estado:** ACEPTADO
- **Contexto:** Plan unificado Finanzas → Transacciones sobre el modelo v2 existente (`SalesInvoice`, `SupplierInvoice`, `Receivable`, `Payable`, `Collection`, `Payment`, `AccountMovement`, `JournalEntry`). Revisión de código detectó huecos de cancelación y lost-update en cobros/pagos concurrentes. El schema documenta que `AccountMovement.projectId` no debe duplicar la verdad de la fuente ([`schema.prisma`](../../../packages/database/prisma/schema.prisma) ~L1473).
- **Decisión:**
  - **No** crear entidad genérica `Transaction` en Prisma; la UX de Transacciones es capa de lectura/composición sobre documentos tipados.
  - **Cancel guards simétricos:** `cancelSalesInvoice` bloquea anulación de facturas `ISSUED` con cobranzas `CONFIRMED` o `receivable.paidAmount > 0` (espeja `cancelSupplierInvoice` en AP). `cancelAccountMovement` bloquea movimientos con `sourceType` `COLLECTION`, `PAYMENT` u `OPENING_BALANCE`, y movimientos con `transferId` — reversión solo vía agregado (`cancelCollection`, `cancelPayment`, transferencia).
  - **Concurrencia optimista** en `createPayment` / `createCollection` y todas las cancelaciones/reversiones: `updateMany` + `assertOptimisticRowUpdate(count)` exige exactamente 1 fila afectada → `CONFLICT` si no.
  - **Fase 0 no propaga** `projectId` en `AccountMovement` generado por cobro/pago; filtro por obra en reportes vía join (`Collection.projectId`, `Payment.projectId`).
- **Consecuencias:** guards extraídos y testeados en `packages/services/src/ar/sales-invoice-cancel-guards.ts`, `.../ap/supplier-invoice-cancel-guards.ts` y `.../treasury/account-movement-cancel-guards.ts`; locking optimista también en cancelación de facturas, obligaciones, cobros/pagos y reversión de saldos; P-TRZ-06 resuelto vía `resolveOpeningBase` en `balance.service.ts`.
- **Referencias:** plan Finanzas/Transacciones v2; [`02-modules/TREASURY.md`](../02-modules/TREASURY.md), [`03-finance/ACCOUNTS_RECEIVABLE.md`](../03-finance/ACCOUNTS_RECEIVABLE.md).

---

## ADR-013 — Anticipos a proveedor: cuenta puente (Fase 2)

- **Fecha:** 2026-05-29
- **Estado:** ACEPTADO (implementación diferida Fase 2)
- **Contexto:** [`EXPENSES_AND_PAYMENTS.md`](../02-modules/EXPENSES_AND_PAYMENTS.md) §13 describe pagos anticipados sin factura. Hoy el flujo AP exige `SupplierInvoice` → `Payable` → `Payment`; un pago directo sin obligación rompe BR-PAY-001 y la trazabilidad documental.
- **Decisión:**
  - **Fase 1 (cliente):** anticipo vía `registerArAdvance` — factura de venta con línea "Anticipo de obra" + cobranza inmediata (`registerArSale` con `collectNow`). Sin saldo inicial artificial de proyecto.
  - **Fase 2 (proveedor):** entidad **`SupplierAdvance`** (o equivalente) como cuenta puente analítica: pago confirmado → OUTFLOW tesorería + saldo anticipo a favor del proveedor por `projectId`; al emitir factura → compensación automática o manual contra el anticipo. Validador `registerSupplierAdvanceSchema` y servicio stub `registerSupplierAdvance` lanzan `NOT_IMPLEMENTED` hasta migración.
  - **No** usar `Payment` sin `Payable` ni movimiento manual sin ADR en producción.
- **Consecuencias:** UI `/proyectos/[id]/facturas/anticipo/nueva` para cliente; proveedor documentado en OPEN_QUESTIONS si producto acelera Fase 2.
- **Referencias:** [`SALES_AND_COLLECTIONS.md`](../02-modules/SALES_AND_COLLECTIONS.md) §anticipo, [`FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`](./FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md).

---

## ADR-014 — PDF render boundary en `@bloqer/report-pdf`

- **Fecha:** 2026-05-29
- **Estado:** ACEPTADO
- **Contexto:** Export PDF con `@react-pdf/renderer` fallaba en runtime (HTTP 500) cuando `renderToBuffer` y los documentos JSX vivían en `@bloqer/services` y eran importados por Next.js App Router. Es el patrón conocido de resolución de módulos React en monorepos (react-pdf #3285).
- **Decisión:**
  - Paquete dedicado **`@bloqer/report-pdf`**: templates React-PDF, `renderToBuffer`, `export*Pdf`, `sendReportByEmail` (adjuntos PDF).
  - **`@bloqer/services`** conserva lectura de reportes y `export*Csv`; **no** depende de `react` ni `@react-pdf/renderer`.
  - **`apps/web`** importa PDF directamente desde `@bloqer/report-pdf`; declara `@react-pdf/renderer` y externaliza `@react-pdf/pdfkit` / `fontkit` en `next.config.ts`.
  - Test de humo: `packages/report-pdf/src/pdf-render.smoke.test.tsx` valida `%PDF` en buffer.
- **Consecuencias:** 19 rutas `?format=pdf` operativas; encabezado/pie con tenant, empresa, obra (si aplica), usuario y paginación vía `resolvePdfReportBranding`.
- **Referencias:** [`REPORTING_ARCHITECTURE.md`](./REPORTING_ARCHITECTURE.md) §Phase 9B, [`EXPORT_FORMATS.md`](../06-reports/EXPORT_FORMATS.md).

---

## ADR-007 — Gantt y cronograma detrás de adapter único (Kibo UI)

- **Fecha:** 2026-05-27
- **Estado:** ACEPTADO
- **Contexto:** Q-003/Q-004 cerradas ([D-038](../00-product/DECISION_LOG.md), [D-039](../00-product/DECISION_LOG.md)); multip vista (Gantt, calendario, kanban, tabla) sobre un read model servidor.
- **Decisión:** componentes **Kibo UI** (`gantt`, `calendar`, `kanban`) instalados vía CLI en `apps/web`; el feature `schedule` solo importa **adapters** (`mapScheduleWorkspaceToGanttFeatures`, etc.) que traducen DTOs de `@bloqer/services` a props Kibo y eventos Kibo → Server Actions. Tabla densa con TanStack Table. Sin lógica financiera en React.
- **Consecuencias:** posible actualización manual si Kibo cambia API; dominio y Prisma no dependen de Kibo. Licencia MIT (copia de código al repo).
- **Referencias funcionales:** [`TECH_STACK.md`](./TECH_STACK.md), [`FRONTEND_FEATURE_STRUCTURE.md`](./FRONTEND_FEATURE_STRUCTURE.md), [`02-modules/PROJECT_SCHEDULING.md`](../02-modules/PROJECT_SCHEDULING.md).

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
- **Estado:** REEMPLAZADO parcialmente por [ADR-Auth-Credentials-01](#adr-auth-credentials-01--emailpassword--verificación-resend) (la cláusula “Sin Credentials”)
- **Contexto:** Se requería autenticación federada sin credenciales propias (email/password). Se evaluaron Auth.js v4, v5 beta, y Clerk.
- **Decisión:** Auth.js v5 (next-auth@5 beta) con Google OAuth. Adapter de Prisma (`@auth/prisma-adapter`). ~~Sin Credentials.~~ Magic Link con Resend diferido para Phase 2.
- **Consecuencias:** La app puede arrancar localmente sin credenciales reales de Google (empty string fallback). El login solo funciona end-to-end con variables de entorno configuradas. Credentials email/password: ver ADR-Auth-Credentials-01.

---

## ADR-Auth-Credentials-01 — Email/password + verificación Resend

- **Fecha:** 2026-07-25
- **Estado:** ACEPTADO
- **Contexto:** Usuarios sin Google (dominios no-Gmail / cuentas corporativas) necesitan acceso. ADR-Phase1-03 excluía Credentials; magic link sigue diferido. Unirse a tenant existente sigue siendo solo por invitación (sin join-request).
- **Decisión:**
  1. Mantener **Google OAuth** y agregar **Credentials** (email + password) en Auth.js v5.
  2. Registro credentials crea `User` con `status=INVITED`, `emailVerified=null`, `passwordHash` (bcryptjs cost 12). **No** abre sesión hasta verificar.
  3. Verificación y reset password vía tabla `verification_tokens` con `identifier` namespaced (`email-verify:<email>`, `password-reset:<email>`), token bearer solo en URL, en DB **sha256** (mismo espíritu que invitaciones). Email vía Resend (`@bloqer/email`).
  4. Login credentials exige `status=ACTIVE`, `emailVerified` set, hash OK. Reset con token válido puede **establecer** password (también para users Google-only) y activa `emailVerified`+`ACTIVE` si aún no lo estaban (posesión del email).
  5. **Takeover:** si existe stub no verificado mismo email y Google inicia sesión, se activa el User existente y se vincula `Account` Google (evita bloqueo por `email` unique).
  6. Credentials `authorize` y Prisma **solo en Node** (`packages/auth/src/auth.ts`); middleware edge sigue con `authConfig` sin Credentials/Prisma.
  7. Invalidación post-reset: `User.passwordUpdatedAt`; claim `pwdAt` en JWT; chequeo en `getSession` (Node; usado por `getCurrentUser`). Middleware edge no valida contra DB. `getSession` debe devolver `null` ante mismatch aunque `signOut` falle en RSC.
  8. Sin username-login. Sin magic-link login. Anti-enumeración en register/reset. Join a tenant = invitación only ([D-064](../00-product/DECISION_LOG.md)).
- **Consecuencias:** Nueva dep `bcryptjs` en `@bloqer/services`. Rutas públicas `/registro`, `/verificar-email`, `/recuperar-contrasena`, `/restablecer-contrasena`. Onboarding trial / invites sin cambio de producto.
- **Referencias:** [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md), [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md), [D-064](../00-product/DECISION_LOG.md).

---

## ADR-Phase1-04 — RBAC vía UserMembership.roles (array PostgreSQL)

- **Fecha:** 2026-05-07
- **Estado:** ACEPTADO
- **Contexto:** Se necesitaba almacenar los roles de un usuario por tenant. Opciones: tabla UserRole separada (join), array en PostgreSQL, JSON column.
- **Decisión:** Array nativo de PostgreSQL (`UserRole[]` en Prisma). La semántica es unión: el usuario tiene acceso si **cualquiera** de sus roles lo habilita. La función `can(roles, action, module)` en `@bloqer/domain` es pura (sin I/O).
- **Consecuencias:** Queries de roles son simples (`roles @> ARRAY['ADMIN']::UserRole[]`). No soporta permisos granulares por campo (fuera del alcance per PERMISSIONS_MATRIX.md).

---

## ADR-Phase1-05 — Notas internas en matriz de permisos (`Tenant.permissionMatrixNotes`)

- **Fecha:** 2026-05-13
- **Estado:** ACEPTADO
- **Contexto:** la pantalla `/configuracion/permisos` lista muchos `PermissionModule` como columnas; las notas largas en tabla rompen la lectura y no son auditables.
- **Decisión:** persistir un objeto JSON opcional `permission_matrix_notes` en la tabla `tenants`, clave = `PermissionModule` canónico, valor = `{ text, updatedAt, updatedByUserId }`. La UI usa Sheet/Dialog por módulo; **no** se duplica otra tabla de permisos.
- **Consecuencias:** migración SQL + lectura/escritura solo vía `packages/services` con guard `EDIT USERS_PERMISSIONS` **o** `EDIT TENANT_SETTINGS`; evento de auditoría al actualizar.
- **Referencias funcionales:** [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) §2.2.2, [`USERS_AND_PERMISSIONS.md`](../02-modules/USERS_AND_PERMISSIONS.md) §9.

---

## ADR-Phase1-06 — Membresía tenant: una fila `UserMembership` por `(userId, tenantId)` en Phase 1

- **Fecha:** 2026-05-14
- **Estado:** ACEPTADO
- **Contexto:** [Q-001](../00-product/OPEN_QUESTIONS.md) distingue multi-empresa en datos (`Company` N:1 `Tenant`) del sub-problema “misma persona en dos sociedades” simultáneas, que exige relajar `@@unique([userId, tenantId])` u otro modelo.
- **Decisión:** en Phase 1 el schema Prisma **conserva** la unicidad `@@unique([userId, tenantId])`. El contexto de razón social activa en `UserMembership.companyId` (nullable) o en evoluciones de UI que **actualicen** esa única fila — no se introducen filas paralelas sin ADR de migración ([D-036](../00-product/DECISION_LOG.md)).
- **Consecuencias:** `getMembershipByUserId` / `resolveTenantContext` permanecen alineados a **como máximo una** membresía por tenant por usuario; variante “0B” queda explícitamente fuera hasta nuevo ADR. Hasta el selector, [D-092](../00-product/DECISION_LOG.md) ancla sesión/invitaciones/proyectos a la única `Company` ACTIVE del tenant.

---

## ADR-Phase1-07 — Ingresos corporativos sin obra: Phase 1 sin relajar AR

- **Fecha:** 2026-05-14
- **Estado:** REEMPLAZADO parcialmente por ADR-015 (opción 1 / D-051); Phase 1 opción 2 sigue válida para ingresos sin CxC
- **Contexto:** [Q-030](../00-product/OPEN_QUESTIONS.md) listaba migración AR nullable, solo GL/tesorería, o nuevo documento.
- **Decisión:** Phase 1 implementa la **opción documental y operativa (2)**: reflejo contable y banco vía **`JournalEntry`** + tesorería según política; **sin** migración `projectId` nullable en `SalesInvoice`/`Receivable`/`Collection` hasta decisión explícita de producto ([D-037](../00-product/DECISION_LOG.md)).
- **Consecuencias:** checklist [Q030_CORPORATE_INCOME_CHECKLIST.md](./Q030_CORPORATE_INCOME_CHECKLIST.md) §Opción 1/3 quedaban para fases posteriores; §Opción 2 es la referencia de implementación no-code del corte.

---

## ADR-015 — AR corporativo con `projectId` nullable (Q-030 opción 1 / D-051)

- **Fecha:** 2026-07-21
- **Estado:** ACEPTADO
- **Contexto:** asimetría con AP corporativo; necesidad de CxC sin obra (capacitaciones, materiales, servicios de estructura). [D-049] difería la Fase 2.
- **Decisión:** relajar `projectId` a nullable en `SalesInvoice`, `Receivable` y `Collection`; servicio `registerArIncome` espejo de `registerApExpense`; UI en Registrar transacción + detalle/cobranza bajo `/finanzas/cuentas-por-cobrar`. Mantener `TREASURY_INFLOW` para ingresos sin obligación. Descartar documento nuevo (opción 3).
- **Consecuencias:** aging/listados empresa muestran label “Empresa”; numeración compartida por company; puente `externalInvoiceRef` hacia ARCA futuro sin emitir legalmente aún.
- **Referencias funcionales:** [D-051](../00-product/DECISION_LOG.md), [Q-030](../00-product/OPEN_QUESTIONS.md), [ACCOUNTS_RECEIVABLE.md](../03-finance/ACCOUNTS_RECEIVABLE.md).

---

## ADR-016 — Company vs project finance tools (D-056)

- **Fecha:** 2026-07-24
- **Estado:** ACEPTADO
- **Contexto:** Fuga de visibilidad de caja/hub empresa hacia roles operativos por unión OR de permisos financieros.
- **Decisión:** Separar **company tools** (`/finanzas`, `/tesoreria`, `/contabilidad`) de **project tools** (finanzas bajo `/proyectos/[id]/…`). Roles nuevos `PROJECT_FINANCE` (obra) y `TREASURER` (caja empresa sin `APPROVE` GL). Helpers `canViewCompanyFinanceHub` / `canViewCompanyAr` / `canViewCompanyAp` / `canViewCompanyTreasury` exigen rol company-finance (`OWNER|ADMIN|FINANCE|TREASURER|VIEWER`) además del techo de módulo. `BANK_ACCOUNTS` e `INTERNAL_TRANSFERS` se gatean en servicios (no solo `TREASURY`).
- **Consecuencias:** migración enum Prisma; recorte matriz; tests de `can()`; smoke/UAT por rol.
- **Referencias:** [D-056](../00-product/DECISION_LOG.md), [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md).

---

## ADR-020 — Preparación efímera de solicitudes desde audio

- **Fecha:** 2026-11-23. **Estado:** ACEPTADO para el flujo elegido en D-148, aplicando las capas y el adaptador de ADR-017/019; sin cambios de persistencia.
- **Diseño:** route autenticada acotada → service con autorización de obra/empresa/rol/módulo → `@bloqer/ai` con transcripción opcional del adaptador existente y generación estructurada sin tools. El SDK permanece dentro del adaptador; proveedores sin transcripción no habilitan audio. Modelo de transcripción configurable, con el mismo proveedor y credenciales actuales.
- **Interacción:** grabación explícita (máximo 60 segundos en el navegador) o archivo WebM/MP4/WAV de hasta 3 MiB; validar tamaño y cabecera antes del proveedor. Transcripción editable y confirmación previa a preparar renglones. Texto y respuesta acotados; cantidades decimales como strings y desconocidos null. Las fechas relativas se conservan como observaciones para que el usuario elija una fecha exacta.
- **Persistencia:** audio, transcripción y propuesta solo viven en memoria durante la preparación; no se envían a logs, R2, auditoría ni campos de notas automáticamente. La interfaz informa que se envía el audio al proveedor configurado. El alta sigue por la acción/servicio DRAFT existente, sin calls de escritura del modelo. No hay retención nueva en Bloqer; aplican las condiciones del proveedor de IA.
- **Límites:** flag propio apagado y gates AI/producción, límite HTTP incluso sin Content-Length, timeout/cancelación, rechazo cross-origin, rate limit existente. No se presenta el rate limit en memoria como cuota distribuida. Cancelar/editar/reemplazar invalida resultados anteriores. Revisión ligada al contenido antes de guardar; todos los controles de negocio se repiten al crear.
- **Verificación:** parser e instrucciones adversariales, permisos antes de llamadas al proveedor, bytes/tamaño/cancelación, revisión y edición en UI, borrador real en SQL descartable. Proveedores y grabación real se prueban después con un piloto autorizado; CI no demuestra calidad de transcripción.
- **Referencias:** D-148, Q-096, `PURCHASE_REQUESTS.md`, `PLAN_AUTOMATIZACION_PRIMER_PAQUETE.md` bloque 4/D.

## ADR-021 — Propuesta de respuesta externa de cotizaciones por enlace

- **Fecha:** 2026-11-23. **Estado:** ACEPTADO por el Owner mediante Q-097/D-149. Contrato aprobado para implementar; resultados de pruebas, migración, despliegue y piloto se registran por separado. La aprobación no activa la capacidad ni autoriza envíos a proveedores reales.
- **Problema:** E2 necesita recibir ofertas sin conceder membresía al tenant. La creación vigente exige actor interno y persiste `RECEIVED`; usarla como endpoint público o atribuir la respuesta al emisor del enlace falsearía autorización y autoría.
- **Decisión propuesta:** separar invitación/respuesta externa de la cotización operativa. El vínculo autoriza solamente consulta mínima y una respuesta; una persona interna autorizada revisa e incorpora la oferta con el servicio canónico. Reutilizar PostgreSQL, `node:crypto`, Zod, componentes y kernel monetario existentes. Sin dependencias ni servicios nuevos.

### Experiencia propuesta

1. En una SC `SUBMITTED`, Compras elige un proveedor activo y pulsa **Crear enlace para cotizar**. Una vista previa muestra exactamente lo compartido y la fecha/hora de vencimiento. El enlace se muestra una vez; **Copiar enlace** no afirma envío. Se advierte que cualquiera que lo reciba puede utilizarlo. Generar otro revoca el anterior pendiente del mismo proveedor/SC.
2. La página externa identifica empresa, obra, SC y proveedor, y presenta descripción, cantidad y unidad de cada ítem. Excluye presupuesto, saldo, EDT/APU, notas internas, otros proveedores/ofertas, aprobadores, adjuntos y navegación al ERP. Mismos componentes y densidades del formulario vigente, incluidos celular y teclado.
3. El proveedor informa moneda, precios con/sin IVA, descuentos, IVA/IIBB, plazo, vigencia y observaciones comerciales. Debe clasificar todos los ítems como Cotizado/No cotizado/Bonificado; desconocidos no se completan con ceros por omisión. No modifica cantidades ni unidades. Se exige al menos un ítem cotizado positivo; una respuesta de indisponibilidad total queda fuera de este primer corte.
4. **Revisar respuesta** muestra los datos antes de **Enviar respuesta**. Una única respuesta definitiva: el reintento idéntico confirma el resultado; un contenido distinto exige que Compras emita otro enlace. Al terminar se muestra un comprobante mínimo sin acceso posterior a la oferta mediante el enlace.
5. En la SC, **Respuestas de proveedores** conserva el original recibido y permite **Revisar e incorporar**. Compras puede corregir el formulario, completa FX cuando corresponda y confirma. Solo entonces nace `ProcurementQuote.RECEIVED`; no adjudica ni crea OC. Importación y vínculo se confirman atómicamente. Una respuesta incorporada abre su cotización existente y no permite crear otra.
6. El vencimiento/revocación detiene el acceso externo; no borra una respuesta ya recibida ni impide su revisión interna posterior. La revisión respeta el estado actual de SC/obra, proveedor activo, máximos y oferta activa existente. Si la solicitud cambió, se requiere una nueva invitación, sin importar contra renglones diferentes.

### Persistencia propuesta y acotada

Una única raíz nueva `ProcurementQuoteInvitation` / `procurement_quote_invitations`. No reutilizar tablas de login/membresía ni esconder este permiso dentro de notas o auditoría. Todos los siguientes campos son propuesta, no schema aprobado:

| Campos | Contrato propuesto |
|---|---|
| `id` | UUID interno; no concede acceso por sí solo. |
| `tenantId`, `companyId`, `projectId`, `purchaseRequestId`, `supplierContactId` | Obligatorios y con FK; coherencia entre todas las relaciones comprobada por servicio en cada operación. No ampliar el catálogo de hijos sin tenant de ADR-018. |
| `tokenHash` | SHA-256 del token aleatorio de 32 bytes; único; nunca devolver el hash ni persistir el token en claro. |
| `expiresAt` | Instante UTC: creación + siete días; mostrar hora Argentina. Es la vigencia del acceso, separada de `validUntil` de la oferta. |
| `revokedAt`, `revokedBy` | Nulos inicialmente; revocación explícita o sustitución por otro enlace con actor interno. |
| `requestSnapshot` | JSON tipado versión 1 con etiquetas públicas de empresa/obra/SC/proveedor y por renglón ID, descripción, cantidad decimal y unidad. Solo DTO permitido, nunca serialización completa del modelo. |
| `requestFingerprint` | Hash del contenido operativo relevante y versión de solicitud al crear; detectar cambios posteriores incluso con mismos IDs. |
| `responsePayload`, `responseHash`, `respondedAt` | Nulos hasta respuesta; JSON tipado versión 1 inmutable, hash de payload normalizado e instante de recepción. Una respuesta por invitación. |
| `importedQuoteId`, `importedAt`, `importedBy` | Nulos hasta incorporación; FK única a la cotización, instante y actor interno real. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Auditoría interna. En respuesta externa no atribuir la modificación a un usuario: `updatedBy` nullable, con procedencia externa explícita en auditoría. |

`responsePayload` versión 1: `currency`, `pricesIncludeTax`, `iibbPerceptionRate`, `leadTimeDays`, `validUntil`, `notes` y `lines` con `purchaseRequestLineId`, `offerKind`, `unitPrice`, `taxRate`, `discountPct`. Decimales como strings validadas, fechas calendario y reglas D-118 existentes. No recibe tenant/empresa/obra/proveedor, FX, cantidades, totales derivados ni IDs de usuario. FX y totales operativos se resuelven al incorporar con el usuario interno. Los campos y versión del JSON tienen schema cerrado: no es un contenedor genérico extensible sin revisión.

Índices propuestos: hash único, `(tenantId, purchaseRequestId)`, `(tenantId, companyId, projectId)` y `importedQuoteId` único. Una invitación pendiente no revocada por SC/proveedor mediante índice parcial y serialización bajo lock de SC; al reemplazar se revoca también la anterior ya vencida. No crear enum de estado nuevo: etiquetas derivadas de vencimiento, revocación, respuesta e incorporación, documentadas en `STATE_MACHINES.md` antes de implementación. Conservar historial; sin borrado físico ni backfill de cotizaciones existentes.

### Acceso externo y aislamiento

- Capacidad bearer distinta de una sesión Auth.js. Ruta externa sin shell de empresa, chatbot, navegación ni loaders internos. Nunca fabricar `ServiceContext` ni usar el emisor como actor de la respuesta. La creación/revocación/revisión usan sesión y permisos internos reales.
- Token solo en fragmento de la URL compartida; página de entrada elimina el fragmento de su historial y lo intercambia por cookie `HttpOnly`, `Secure` en producción, `SameSite=Strict`, limitada a `/cotizar/[invitationId]`. Los handlers de esa invitación viven debajo de la misma ruta; el servidor exige coincidencia del ID de ruta con la invitación resuelta por hash. Cookies separadas por ruta evitan que pestañas de dos empresas reemplacen sus permisos entre sí. El intercambio no consume la respuesta ni modifica datos operativos. La cookie no excede el vencimiento de la invitación; no es sesión de ERP. El token no llega a query strings, rutas, logs ni telemetría. Recarga y reemplazo de invitación comprueban nuevamente el permiso.
- Origen permitido desde configuración confiable, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, sin indexación ni recursos/analítica de terceros en esa pantalla. Las mutaciones exigen Origin coincidente y contenido/tamaño estrictos; middleware solo exceptúa las rutas exactas nuevas y cada handler verifica la capacidad en servidor.
- Consulta y respuesta cargan por hash, derivan el alcance del registro y comprueban tenant activo, empresa/obra/SC coherentes, proveedor activo, SC `SUBMITTED`, obra operable, fingerprint y autoridad vigente del emisor para delegar esa SC. Los IDs recibidos de renglones deben pertenecer exactamente al snapshot y a la SC actual. Usuario interno autenticado en otra empresa no amplía ni sustituye el alcance del enlace.
- Token inexistente, revocado, vencido o contexto no autorizado devuelve un aviso genérico sin datos. Con respuesta ya consumida, solo recibo mínimo de envío; no devolver snapshot, precios ni datos de empresa. Reintento idéntico puede confirmar éxito si el enlace no fue revocado/vencido; después se informa indisponibilidad y Compras conserva la respuesta.
- Límites propuestos del corte: cuerpo de hasta 256 KiB, hasta 200 ítems, observaciones hasta 2.000 caracteres; rechazar explícitamente solicitudes fuera de estos límites sin recortar datos. Reutilizar el patrón de limitación en memoria para ráfagas del canal; no presentarlo como cuota distribuida ni protección DDoS completa. La recepción única queda protegida por DB incluso entre instancias. Ningún acceso externo llama IA, envía email ni crea documentos/archivos.
- La posesión del enlace no verifica identidad personal ni email. La auditoría indica `source: supplier_link`, invitación y proveedor de destino; nunca afirma quién físicamente respondió. Verificación de identidad exige la alternativa con cuenta de Q-097.

### Concurrencia, auditoría y reutilización

- Orden de locks consistente con compras: obra → SC → invitación. Dentro de la transacción repetir vigencia/revocación, autoridad y pertenencia después de esperar los locks. Revocación/expiración concurrente debe ganar cuando es efectiva antes de confirmar la respuesta. Actualización condicional y `responseHash` garantizan que un reintento no sobrescriba evidencia.
- Incorporación: extraer una operación interna transaccional de `createProcurementQuote`, conservando guards, cálculo, clasificación, capacidad y auditoría. El servicio autenticado de incorporación usa esa operación y enlaza `importedQuoteId` en la misma transacción. No hacer un alta y luego un update separado; no cambiar la firma pública de alta manual ni permitir que el endpoint externo la invoque.
- Propuesta de eventos de auditoría: `procurement_quote_invitation.created`, `.revoked`, `.responded`, `.imported`. Registrar en catálogo antes de programar. Los internos llevan actor real; el externo usa actor nullable y procedencia explícita, sin etiquetarlo como acción de usuario o tarea automática. Contexto tenant/empresa/obra obligatorio, sin token, hash de token ni respuesta completa en logs. El original queda únicamente en el registro autorizado.
- Proveedores/formularios: reutilizar `Contact` SUPPLIER, `canManageProcurementQuotes`/guards existentes, schemas monetarios, kernel, Select/Input/Button y clases compartidas de Compras. Repositorio nuevo en `packages/database`; orquestación en `packages/services`; route handlers delgados. No usar Prisma desde `apps/web`.

### Pruebas y publicación tras aprobación

1. Unitarias: DTO público por lista permitida, campos extra rechazados, token/hash, vencimiento, permisos, fingerprint, clasificación/decimales y payload idéntico/distinto.
2. SQL descartable: dos tenants y empresas, obra compartida, IDs cruzados, proveedor archivado, emisor sin permisos, SC modificada/anulada, carreras respuesta/revocación/reemplazo y doble incorporación. Comprobar rollback y una sola cotización.
3. Navegador: crear/copiar sin enviar, entrada externa sin sesión, revisión y respuesta, recarga, enlace vencido/revocado, reintento, importación interna y ambas vistas en escritorio/tablet/celular. Abrir simultáneamente invitaciones de dos empresas en dos pestañas y comprobar que cookies, respuestas y contexto no se mezclan. Confirmar que no aparecen presupuesto, ofertas ajenas, navegación ERP ni tokens en URL después del intercambio.
4. Actualizar módulo, entidades/estados derivados/eventos, ERD, permisos, guía y Help en el PR funcional. Indexar conocimiento solo después de aprobado e implementado; no enseñar al chat que la función está disponible durante la propuesta. Sin tool WRITE nueva.
5. Migración aditiva en entorno aislado, CI y revisión; despliegue/migración de portal en branch Neon `production` según procedimiento. Flag de capacidad apagado por defecto; piloto con proveedor/datos sintéticos antes de habilitar. No enviar enlaces reales ni activar por el solo merge.

### Fuentes del relevamiento

- `packages/services/src/procurement/procurement-quote.service.ts`: alta interna, locks, estado `RECEIVED`, oferta activa por proveedor y máximo de cotizaciones.
- `packages/services/src/types.ts`: actor obligatorio del contexto interno; no existe identidad externa de proveedor.
- `packages/database/prisma/schema.prisma`: `ProcurementQuote`, `ProcurementQuoteLine`, `AuditLog`, `VerificationToken`; no existe permiso externo para responder cotizaciones.
- `apps/web/middleware.ts`: allowlist pública actual y patrón de separación de tokens de membresía; no reutilizar la membresía como acceso de proveedor.
- [OWASP, controles de tokens](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): referencia técnica sobre aleatoriedad, uso único, vencimiento y evitar filtraciones. Es un contexto de recuperación de contraseña, no una especificación de negocio de cotizaciones ni respaldo del plazo propuesto de siete días.

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
### Aplicación del patrón ADR-019 al bloque 5/E1 — 23/11/2026

El Owner autorizó continuar Compras y proveedores después del refuerzo de aislamiento del chat. La lectura de cotizaciones reutiliza el patrón efímero existente: archivo explícito → proveedor configurado sin tools/IDs → servicio autorizado → propuesta → revisión humana → acción de alta canónica. No cambia arquitectura, persistencia, estados, reglas monetarias ni selección/adjudicación. Se autoriza solicitud y obra antes de la extracción, se limita cuerpo/archivo/respuesta y se conserva el flag propio apagado. Correspondencia manual de renglones, sin conversiones ni cambios de cantidades de SC. La oferta se registra como RECEIVED por el servicio existente, no como un nuevo estado de borrador. Guía, Help y smoke describen el flujo y sus límites.

