# AG-00 — Propuesta de reconciliación del aislamiento por tenant

> **Estado: APROBADA por confirmación explícita del usuario el 03/11/2026**, durante la remediación de AG-00. Contrato formalizado en [ADR-018](../ARCHITECTURE_DECISION_RECORDS.md).
> Hallazgos: GA-AG-00-005/006; seguimiento P-AG00-01/02. Diagnóstico: [arquitectura](./2026-11-03-ag-00-architecture.md).

## Decisión confirmada

Formalizar el contrato que utiliza la implementación actual y que algunos documentos ya describen: aislamiento explícito en servicios/repositorios, con contexto autenticado y comprobación de pertenencia; hijos existentes con tenant derivado del padre obligatorio. Reconciliar las fuentes que todavía prometen filtro automático o una columna redundante en toda fila.

Se pidió confirmación porque [AGENTS raíz §5](../../../../AGENTS.md) exige preguntar antes de «Cualquier cambio arquitectónico que no esté documentado como ADR». El usuario aprobó expresamente conservar el contrato actual descrito en esta propuesta. Se registra esa respuesta como autorización de la reconciliación documental y del ADR, sin extenderla a schema, migraciones, middleware ni afirmaciones de validación SQL.

## Contrato aprobado para el ADR de reconciliación

1. **El aislamiento entre tenants sigue siendo absoluto.** El tenant proviene del contexto autenticado. Ninguna entrada de usuario sustituye el contexto ni habilita devolver o modificar datos de otro tenant.
2. **El mecanismo vigente es explícito en servicios/repositorios.** Se aplican filtros y guards antes de devolver datos o mutar. Las cargas por ID deben comprobar pertenencia antes de usar o exponer el agregado; las lecturas masivas deben estar acotadas desde la consulta. No se describe al cliente Prisma simple como si inyectara filtros o rechazara consultas automáticamente.
3. **Raíces operativas con tenant propio.** Se conserva la columna obligatoria de las raíces existentes. La estrategia de empresa/proyecto conserva sus reglas específicas; no se usa companyId como sustituto del tenant.
4. **Catálogo cerrado de 22 hijos/configuraciones existentes con tenant heredado.** Se permite su modelo físico actual si pertenecen a un padre obligatorio con tenant inequívoco; toda consulta/mutación valida ese vínculo y el tenant del padre. Los IDs de hijos recibidos del cliente se comprueban contra el padre autorizado. Las referencias adicionales deben ser coherentes con el mismo tenant y agregado/ámbito del flujo, aunque una FK simple no lo garantice; el padre canónico de cada modelo está en [TENANT_ISOLATION_MODEL](../TENANT_ISOLATION_MODEL.md). No es una excepción al aislamiento ni habilita nuevos hijos sin columna por analogía.
5. **Casos de identidad/raíz/plataforma conservan su propósito.** `User`, `Account`, `Session`, `VerificationToken`, `Tenant`, `PlatformAdmin` y `PlatformAuditLog` se documentan separadamente; sus accesos tienen guards propios.
6. **No se introducen columnas, migraciones ni middleware global en esta corrección.** Un control automático adicional requiere diseño y ADR propios, con pruebas de compatibilidad. No se lo considera ya implementado.
7. **La evidencia de seguridad sigue siendo por recorrido.** Tests de políticas sin DB no reemplazan integración SQL. AG-01 verificará entradas directas y consultas con dos tenants en un entorno apropiado, sin declarar eso comprobado por aprobar este ADR.

El catálogo cerrado del punto 4 es: `ClientProfile`, `SupplierProfile`, `SubcontractorProfile`, `BudgetSettings`, `WbsNode`, `CostItem`, `CostAnalysisLine`, `CertificationLine`, `SalesInvoiceLine`, `JournalEntryLine`, `SupplierInvoiceLine`, `CompanyProcurementSettings`, `PurchaseRequestLine`, `ProcurementQuoteLine`, `PurchaseOrderLine`, `PurchaseReceiptLine`, `SubcontractLine`, `SubcontractCertificationLine`, `JobsiteLogProgress`, `JobsiteLogLabor`, `JobsiteLogMaterialUsage` y `JobsiteLogIssue`.

## Fuentes que respaldan conservar el mecanismo actual

- D-001 en [DECISION_LOG](../../00-product/DECISION_LOG.md): pertenencia y filtrado por tenant.
- [MULTITENANCY_ARCHITECTURE](../MULTITENANCY_ARCHITECTURE.md), decisión: scope en persistencia **o servicios**.
- [PRISMA_ERD_AUDIT §1](../PRISMA_ERD_AUDIT.md): aceptación histórica de hijos por FK al padre.
- [PLAN_AVANCE_RESIDUAL_EDT](../PLAN_AVANCE_RESIDUAL_EDT.md): filtrar por padre y tenant del padre.
- [Plan INDARI](../INDARI_CASA_HOGAR_IMPROVEMENT_PLAN.md): preservar alcance heredado de las líneas desde la cabecera en esa intervención.

Las fuentes reconciliadas son AGENTS raíz, AGENTS funcional, [MULTITENANCY](../../07-non-functional/MULTITENANCY.md), [TENANT_ISOLATION_MODEL](../TENANT_ISOLATION_MODEL.md), DATABASE_CONVENTIONS y la defensa de MULTITENANCY_ARCHITECTURE. ADR-018 conserva la separación entre aislamiento obligatorio y mecanismo físico.

## Aplicación de la confirmación

- Se registró ADR-018 aceptado con esta decisión y referencia a la confirmación.
- Se actualizaron las fuentes anteriores y su catálogo explícito, sin cambiar permisos, estados ni reglas financieras.
- Se documentó el cierre de P-AG00-01/02 y GA-AG-00-005/006 por reconciliación del contrato, conservando el diagnóstico histórico y los límites de validación SQL.
- Los resultados de las pruebas existentes de scope, autorización y pertenencia ejecutadas por el coordinador se registran en el informe de remediación. La revisión de estas fuentes ya no atribuye una garantía automática inexistente al cliente Prisma.

Las fuentes normativas y el ADR se actualizaron sin modificar código ni schema. Los resultados de las pruebas ejecutadas por el coordinador y el cierre de la remediación se registran en el informe de la corrida correspondiente; la confirmación no demuestra que se haya ejecutado integración SQL.

## Alternativa

Diseñar aislamiento automático global y/o columnas redundantes. Requiere definir excepciones, transacciones, consultas técnicas, cargas por ID, migración/backfill si corresponde y pruebas de integración. No es un reemplazo mecánico: rechazar cualquier consulta por ID sin tenant en el where rompería guards actuales que validan la pertenencia después de cargar y antes de devolver datos.
