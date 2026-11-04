# AG-00 — Inventario de arquitectura, datos y límites entre capas

> Corte: **03/11/2026**. Subanálisis de diagnóstico de AG-00 sobre archivos locales.
> Base, cambios locales, resultados de comandos y límites generales: [informe principal](./2026-11-03-ag-00-baseline.md).
> No se modificó código, schema, migraciones ni decisiones. Este subanálisis no ejecutó tests, conexiones de DB, navegador ni consultas de red.
> **Actualización posterior:** GA-AG-00-005/006 se resolvieron por confirmación explícita del usuario y ADR-018; ver [remediación](./2026-11-03-ag-00-remediation.md). Se conserva el diagnóstico inicial como historial.

## 1. Alcance y fuentes

Se revisaron las fuentes obligatorias de AGENTS y, para esta franja, los módulos de usuarios/permisos y auditoría, los ERD funcional/técnico, el schema y el inventario de migraciones, las convenciones de DB, dinero, multitenancy y dependencias entre paquetes.

Fuentes principales:

- [AGENTS raíz](../../../../AGENTS.md), [AGENTS funcional](../../AGENTS.md) y [runbook](../PLATFORM_AUDIT_RUNBOOK.md).
- [Relaciones funcionales](../../01-domain/ENTITY_RELATIONSHIPS.md), [ERD técnico](../TECHNICAL_ERD.md), [schema actual](../../../../packages/database/prisma/schema.prisma) y [migraciones versionadas](../../../../packages/database/prisma/migrations/).
- [Estructura de paquetes](../PACKAGE_STRUCTURE.md), [capas de backend](../BACKEND_LAYERING.md), [modelo de aislamiento](../TENANT_ISOLATION_MODEL.md), [arquitectura multitenant](../MULTITENANCY_ARCHITECTURE.md) y [convenciones DB](../DATABASE_CONVENTIONS.md).
- [Modelo monetario](../../03-finance/MONEY_MODEL.md), [scoping empresa/tenant](../TENANT_COMPANY_SCOPING.md), [auditoría Prisma previa](../PRISMA_ERD_AUDIT.md) y [pendientes técnicos](../PENDING_ARCHITECTURE_ITEMS.md).

El ERD técnico se presenta como propuesta de alto nivel, no como schema final. La presencia o ausencia de una entidad en ese diagrama no prueba por sí sola una falta de implementación. La evaluación distingue documentación, código local y DB efectiva; esta última no se inspeccionó.

## 2. Inventario de schema y migraciones

El inventario sintáctico del schema local encontró:

- **86 modelos** y **88 enums**. Todos los enums se referencian desde modelos; esto no verifica que sus transiciones estén alineadas con las máquinas funcionales ni que todos se utilicen en ejecución.
- **70 directorios de migración versionada**. No se consultó `_prisma_migrations` ni se compararon checksums u objetos desplegados.
- **57 modelos con `tenantId` obligatorio**; ningún campo `tenantId` nullable.
- **29 modelos sin campo propio `tenantId`**: 7 de identidad/raíz/plataforma y 22 hijos/configuraciones con pertenencia derivada por relaciones.
- **191 declaraciones `@@index`**, **32 declaraciones `@@unique`** y **257 relaciones con FK declaradas**; las FK declaradas son simples. Estos conteos no incluyen todos los objetos posibles del SQL de migraciones ni acreditan el estado efectivo de una DB.
- Ningún campo `Float`. Las capacidades Decimal encontradas fueron `(18,4)`, `(18,2)`, `(18,6)`, `(8,4)`, `(8,2)` y `(5,2)`.

Los modelos sin `tenantId` son:

- Identidad, raíz o plataforma: `User`, `Account`, `Session`, `VerificationToken`, `Tenant`, `PlatformAdmin`, `PlatformAuditLog`.
- Hijos o configuraciones: `ClientProfile`, `SupplierProfile`, `SubcontractorProfile`, `BudgetSettings`, `WbsNode`, `CostItem`, `CostAnalysisLine`, `CertificationLine`, `SalesInvoiceLine`, `JournalEntryLine`, `SupplierInvoiceLine`, `CompanyProcurementSettings`, `PurchaseRequestLine`, `ProcurementQuoteLine`, `PurchaseOrderLine`, `PurchaseReceiptLine`, `SubcontractLine`, `SubcontractCertificationLine`, `JobsiteLogProgress`, `JobsiteLogLabor`, `JobsiteLogMaterialUsage`, `JobsiteLogIssue`.

La auditoría histórica acepta hijos sin tenant redundante por FK al padre en [PRISMA_ERD_AUDIT §1](../PRISMA_ERD_AUDIT.md). El código actual debe comprobar pertenencia y autorización mediante ese padre; el inventario no demuestra que cada consulta lo haga. La diferencia documental se registra en GA-AG-00-006.

Las FK simples no constituyen automáticamente un defecto: [DATABASE_CONVENTIONS](../DATABASE_CONVENTIONS.md) establece validar same-tenant en servicios y considerar constraints compuestas donde corresponda. Se deben revisar ambos extremos de las relaciones en los recorridos de AG-01 y de cada módulo.

El storage monetario `(18,4)` no contradice D-053: [MONEY_MODEL](../../03-finance/MONEY_MODEL.md) diferencia explícitamente capacidad SQL y escala de negocio. Esta observación no justifica migrar columnas a 2 decimales. La aplicación debe conservar el kernel y la serialización canónicos; no se verificaron todos sus consumidores en esta pasada.

## 3. Límites de imports y persistencia real

La inspección estática de declaraciones de importación distinguió imports de tipos y de valores:

- En web se encontraron **58 imports exclusivamente de tipos desde database**, **ningún import runtime de database** y ninguna llamada `prisma.*` en la búsqueda dirigida. Un import type no equivale a acceso a DB ni arrastra por sí solo el cliente Prisma al bundle.
- En archivos con `"use client"` se encontraron **136 imports type de services**, **ningún import runtime del barrel `@bloqer/services`** y **30 imports runtime a 15 subpaths**.
- Se siguieron estáticamente esos 15 entrypoints y sus imports locales, `utils` y `domain`: **56 fuentes**, sin imports runtime de `node:*`, Prisma, config, `server-only` ni el barrel de services. `validators` apareció como dependencia externa del recorrido; su inspección dirigida no encontró imports productivos a DB/services ni lectura de env.
- No se encontraron edges de importación `domain → database/services`, `database → services` ni `ai → database/services` en las declaraciones revisadas.

Esto es evidencia estática sobre declaraciones y recorridos identificados, no una prueba integral de bundles, imports dinámicos, contratos RSC o serialización de todos los DTO. La comprobación de tipos y la validación offline de Prisma ejecutadas por el coordinador se documentan en el [informe principal](./2026-11-03-ag-00-baseline.md); tampoco validan datos o autorizaciones reales.

La persistencia actual no es uniforme:

- [database/index.ts](../../../../packages/database/src/index.ts) exporta el cliente y un único archivo de repositorio: [project-progress.repository.ts](../../../../packages/database/src/repositories/project-progress.repository.ts).
- Numerosos servicios usan el cliente exportado por database. Ejemplo verificable: [purchase-request.service.ts](../../../../packages/services/src/procurement/purchase-request.service.ts), import en línea 1 y consulta scoped de proyecto desde línea 77.
- [require-project-in-tenant.ts](../../../../packages/services/src/project/require-project-in-tenant.ts) carga el proyecto y compara su tenant; [security/access.ts](../../../../packages/services/src/security/access.ts) contiene capacidades y ACL de proyecto. La presencia de estos guards no acredita que todas las entradas los invoquen correctamente.

No se presupone una capa de repositorios inexistente ni se propone mover masivamente código como resultado automático del inventario. La brecha concreta de defensa documentada se detalla a continuación.

## 4. Hallazgos

### GA-AG-00-005 — La defensa de filtro por defecto documentada no está implementada globalmente en el cliente exportado

- **Tipo:** diferencia confirmada estáticamente entre el control descrito y la implementación disponible. **Prioridad P2 de arquitectura/control**, sin fuga de datos demostrada.
- **Fuente:** [MULTITENANCY_ARCHITECTURE §defensa en profundidad](../MULTITENANCY_ARCHITECTURE.md), línea 36, describe filtro por defecto de repositorios/middleware; [TENANT_ISOLATION_MODEL §enforcement](../TENANT_ISOLATION_MODEL.md), línea 23, describe inyección de tenant y rechazo de `findMany` sin filtro en desarrollo.
- **Implementación observada:** [client.ts](../../../../packages/database/src/client.ts), líneas 5–10, crea un `PrismaClient` simple; [index.ts](../../../../packages/database/src/index.ts), línea 1, lo exporta directamente. Los servicios construyen scopes y aplican guards de forma explícita; no hay enforcement general en ese cliente exportado.
- **Impacto:** la defensa descrita como predeterminada no puede usarse como evidencia de aislamiento. La revisión necesita verificar los guards/filtros de cada recorrido y sus entradas alternativas.
- **Límite:** no se reprodujo una consulta cross-tenant ni se concluye que los filtros existentes sean incorrectos. La arquitectura multitenant también admite scope en servicios; el punto pendiente es reconciliar la garantía de defensa adicional documentada con la implementación real.
- **Próximo trabajo:** AG-01 debe trazar resolución de contexto, acceso directo por ID y consultas con dos tenants usando infraestructura apropiada. Con esa evidencia, resolver el control y la documentación por el proceso técnico vigente. No se decide en AG-00 implementar middleware, extensión Prisma ni una migración de repositorios.
- **Seguimiento:** [P-AG00-01](../PENDING_ARCHITECTURE_ITEMS.md). Situación al cierre: diagnóstico registrado; sin corrección aplicada.

### GA-AG-00-006 — Falta reconciliar la exigencia de columna tenant en hijos con la excepción histórica documentada

- **Tipo:** ambigüedad documental confirmada. **Prioridad P2 documental**, sin defecto de aislamiento demostrado.
- **Fuentes en tensión:** [AGENTS raíz](../../../../AGENTS.md), línea 29, exige tenant en toda entidad operativa; [TENANT_ISOLATION_MODEL](../TENANT_ISOLATION_MODEL.md), secciones Decisión/Catálogo, exige columna en filas con datos operativos y enumera excepciones técnicas/globales. [PRISMA_ERD_AUDIT §1](../PRISMA_ERD_AUDIT.md), línea 12, acepta hijos sin tenant redundante por FK al padre.
- **Implementación observada:** los 22 hijos/configuraciones enumerados en §2 no tienen columna propia `tenantId`. Ejemplos: `BudgetSettings` y `WbsNode` desde líneas 1383/1400 del [schema](../../../../packages/database/prisma/schema.prisma), y `CompanyProcurementSettings` desde línea 2300.
- **Impacto:** distintos agentes pueden interpretar de manera diferente el contrato físico y proponer cambios incompatibles: introducir columnas por aplicación literal o asumir excepciones nuevas desde un antecedente. La pertenencia lógica al tenant y la existencia de columna redundante deben quedar diferenciadas mediante una definición explícita.
- **Límite:** esta anotación no relaja AGENTS, no amplía excepciones ni aprueba el modelo histórico como regla nueva. Tampoco autoriza agregar campos, backfill o migraciones.
- **Próximo trabajo:** aclarar el alcance técnico/documental y el mecanismo exigido para hijos, conservando aislamiento absoluto y las reglas vigentes. AG-01 debe verificar los guards de los recorridos correspondientes antes de sostener resultados de seguridad.
- **Seguimiento:** [P-AG00-02](../PENDING_ARCHITECTURE_ITEMS.md); se agregaron anotaciones `## Hallazgo` en ambos documentos técnicos. Situación al cierre: pendiente de definición; sin cambio de semántica o schema.

## 5. Diferencias y antecedentes que no se convierten en bugs nuevos

- **UI compartida:** [packages/ui/README.md](../../../../packages/ui/README.md) y [PACKAGE_STRUCTURE](../PACKAGE_STRUCTURE.md), línea 54, documentan el stub intencional H-D7 y la UI implementada en web. La homogeneización debe inspeccionar `apps/web/components` y las features; no se decide migrarla a `packages/ui`.
- **Numeración:** P-ERD-04 ya registra `MAX+1` frente a sequence/lock. [purchase-request.service.ts](../../../../packages/services/src/procurement/purchase-request.service.ts), desde línea 106, contiene un punto de revalidación. No se abrió un duplicado ni se reprodujo concurrencia.
- **Migraciones históricas:** P-IND-01 ya registra tres checksums literales y una comparación estructural del 21/10/2026. AG-00 no acredita nuevamente esa comparación ni el estado desplegado actual.
- **ACL de proyecto:** P-ERD-08 y §7 de la auditoría Prisma conservan texto de trabajo pendiente, mientras el código tiene `ProjectMembership`, D-111 y guards de acceso. Debe revalidarse el seguimiento contra los recorridos actuales en AG-01; no se afirmó que el control esté ausente ni se cerró el pendiente histórico por mera existencia del código.
- **Polimorfismos:** la auditoría Prisma previa documenta soft-FK de documentos, auditoría/avisos y fuentes operativas. Se revisarán en cada recorrido; la falta de una FK Prisma para esos campos no se clasificó automáticamente como defecto.

## 6. Cierre y continuación

La inspección deja un mapa estructural y dos diferencias documentales/de control con seguimiento. No demuestra integridad de datos, aislamiento efectivo, conformidad completa con los estados funcionales ni compatibilidad del despliegue actual.

Primer recorrido recomendado para AG-01: **sesión → membresía activa → tenant/empresa → acceso a un proyecto por URL/ID → guard de servicio → consulta → respuesta**, incluyendo otro tenant, empresa compartida/obligatoria según el modelo, proyecto no asignado y gate deshabilitado. Partir de `requireProjectInTenant`, `security/access`, resolución de contexto y acciones/handlers reales; la matriz del informe principal delimita los consumidores.

No se aplicaron correcciones de producto. Este documento y las anotaciones asociadas son documentación técnica: **sin impacto documental/AI** en la narrativa operativa, Guía o catálogo de ayuda.
