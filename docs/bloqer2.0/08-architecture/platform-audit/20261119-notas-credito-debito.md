# Auditoría de notas de crédito y débito — 2026-11-19

## Encargo y base

Revisión del desarrollo NC/ND de empresa y proyecto, con diagnóstico, corrección y verificación autorizados por el usuario. Alcance: ventas (AR) y proveedores (AP), desde el acceso al comprobante hasta sus saldos y consumidores. No es una auditoría global del ERP.

- Rama de entrega: `codex/notas-empresa-portal`, PR [#15](https://github.com/simonbravin/bloqer-v2/pull/15).
- Base integrada: `23737c7f5d6966bf760b515901e3841dece25c8a`.
- Revisión remota auditada: `25053ae2dd356723664a05e72994621cb9936bfc`, más las correcciones de este informe.
- El worktree local conserva HEAD `100b7a71` con el diff de la entrega remota y esta revisión. La carpeta principal está en `codex/pruebas`, con trabajo previo que se preservó. El commit de auditoría incluye únicamente los archivos de esta corrección.
- Revisión realizada por un único agente, sin revisión independiente.
- No se modificó el esquema ni se agregó una migración o dependencia.

Fuentes: [D-115 y D-117](../../00-product/DECISION_LOG.md), [dinero](../../03-finance/MONEY_MODEL.md), [ventas](../../02-modules/SALES_AND_COLLECTIONS.md), [gastos](../../02-modules/EXPENSES_AND_PAYMENTS.md), [estados](../../01-domain/STATE_MACHINES.md), ERD funcional/técnico y [procedimiento de auditoría](../PLATFORM_AUDIT_RUNBOOK.md).

## Hallazgos confirmados y corregidos

Los cuatro defectos estaban en el código anterior a este PR. Las regresiones nuevas reprodujeron ocho fallos antes de corregirlos; no eran errores de entorno.

| ID | Prioridad | Condición y efecto observado | Corrección |
|---|---|---|---|
| NCND-001 | P2 | El alta de NC/ND AR/AP recibía una fecha explícita `2026-11-01` y guardaba `2026-10-31`. Se interpretaba medianoche UTC nuevamente como un instante de Argentina. | Conservar el día calendario validado. El valor por defecto sigue siendo el día actual de Argentina. |
| NCND-002 | P2 | Copiar a ND de proveedor una línea de $10 con IVA incluido, neto $8,26 e IVA $1,74, recalculaba IVA $1,73 y total $9,99. | Reutilizar los componentes monetarios leídos de la línea original dentro de la transacción, como ya hacía AR. Un importe explícitamente ingresado se recalcula. |
| NCND-003 | P2 | Crear una NC AP por monto descartaba el tipo de costo de la línea de origen: `LABOR` quedaba `null`, con fallback posterior a Material. El alta por saldo completo sí lo conservaba. | Conservar por defecto el tipo de costo junto con la partida ya heredada. Un tipo explícito tiene prioridad. No prorratear entre partidas ni crear vínculos OC/APU. |
| NCND-004 | P2 | El saldo podía agotarse entre la consulta inicial y el bloqueo de la transacción. El alta por saldo completo creaba un borrador NC de cero. La emisión lo rechazaba, pero quedaba un documento inutilizable. | Revalidar obligación activa, integridad y saldo positivo dentro de la transacción, antes de crear el borrador, en AR y AP. |

Código: `packages/services/src/{ar,ap}/credit-debit-note.service.ts`. Regresiones: `packages/services/src/finance/company-fiscal-notes.test.ts` (12 casos agregados; 32 casos totales).

## Cobertura y recorridos

| Área | Revisión y evidencia |
|---|---|
| Exposición empresa/proyecto | Las cuatro combinaciones AR/AP muestran accesos NC/ND y selector de factura emitida del ámbito correcto. Letra A/B/C/E y tipo de documento permanecen separados. Inspección estática y pruebas de Actions/componentes. |
| Creación y edición | Selección de referencia, NC parcial, límite de saldo, bloqueo de doble envío, errores y navegación. Servicios validan entrada y scope. Se revisaron edición de líneas, impuestos, tipo de cambio y conservación de importes. |
| Emisión y anulación | NC aplica crédito sin caja ni deuda propia; ND abre obligación propia. Anular NC restaura crédito; factura/ND con pagos y factura padre con notas emitidas tienen guardas. Pruebas de saldos, estados y sincronización contable. |
| Acceso | Gates AR/AP, roles de empresa frente a proyecto, tenant/empresa/obra y relaciones de referencia. Pruebas negativas de documentos fuera del ámbito y lectura corporativa. |
| Concurrencia | Inspección de bloqueos y actualización optimista; reproducción controlada de lectura previa/posterior al bloqueo para saldo agotado. No se ejecutó concurrencia real de PostgreSQL en esta revisión. |
| Lecturas posteriores | La invalidación general de `/finanzas` y del layout de proyecto cubre detalles, saldos y notas vinculadas. La sospecha inicial por ausencia de una invalidación explícita no se confirmó como bug adicional. |
| Reportes, costos y contabilidad | Revisión de signos NC/ND y categoría de costo; suites de control por tipo, avance, conciliación de OC, saldos y asientos. NC no se presenta como caja cobrada/pagada. |
| DB y ERD | Inspección de `documentKind`, referencia a factura, series por tenant/empresa/tipo, FK y aplicación única por NC; validación Prisma y guardas de destino de migración. No se requiere DDL adicional. |
| Guía, ayuda y AI | Actualizadas las instrucciones de revisar líneas/impuestos/imputación, copia de ND y rechazo si el saldo se agotó; índice regenerado y comprobado. |
| Visual | Solo inspección de componentes y pruebas automatizadas. No hubo navegación real, validación de viewports ni comprobación visual de producción en esta revisión. |

El borrador de NC por monto es editable: se debe revisar el desglose fiscal y la imputación antes de emitir, especialmente con varias partidas. No se añadió una regla de reparto ni se recalcularon documentos históricos.

## Verificación local

**790 pruebas aprobadas, cero fallidas y cero omitidas** en la selección ejecutada:

- 253 de servicios: NC/ND, balances, dinero, impuestos, integridad, acceso corporativo, guardas de anulación, listado AP, conciliación OC, certificación, contabilidad, costos y reportes.
- 523 web: componentes, features, hooks y lib.
- 7 de conocimiento financiero.
- 7 de destino de migraciones.

Además: TypeScript de servicios y web, ESLint de los archivos afectados con cero warnings, `prisma validate`, `git diff --check` e índice documental aprobados. Índice de entrega: 608 chunks.

Comandos reproducibles desde `packages/services`:

```text
node --import tsx --test --test-reporter=spec src/finance/company-fiscal-notes.test.ts src/finance/obligation-balance.test.ts src/finance/invoice-line-money.test.ts src/finance/invoice-tax-guards.test.ts src/finance/obligation-read-integrity.test.ts src/finance/obligation-stored-status.test.ts src/ap/ap-platform-audit.test.ts src/ap/company-document-access.test.ts src/ap/supplier-invoice-cancel-guards.test.ts src/ap/supplier-invoice-list-status.test.ts src/ap/supplier-invoice-po-reconciliation.test.ts src/ar/ar-integrity.test.ts src/ar/sales-invoice-cancel-guards.test.ts src/ar/certification-invoice-status.test.ts src/accounting/accounting-ar-ap-cancel-atomic.test.ts src/accounting/accounting-invoice-journal-lines.test.ts src/cost-control/cost-type.test.ts src/reports/project-progress.test.ts
node ../../node_modules/typescript/bin/tsc --noEmit --incremental false
```

Web, desde `apps/web`:

```text
node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test --test-reporter=spec --test-concurrency=4 "components/**/*.test.ts" "features/**/*.test.ts" "hooks/**/*.test.ts" "lib/**/*.test.ts"
node ../../node_modules/typescript/bin/tsc --noEmit --incremental false
node ../../node_modules/eslint/bin/eslint.js features/help/lib/articles/finance.ts --max-warnings 0
```

Knowledge, desde `packages/ai`:

```text
node --import ../../packages/services/node_modules/tsx/dist/loader.mjs scripts/check-docs-index.ts
node --import ../../packages/services/node_modules/tsx/dist/loader.mjs --test --test-reporter=spec src/knowledge/financial-audit-knowledge.test.ts
```

Database, desde `packages/database`: `prisma validate --schema prisma/schema.prisma` con el entorno local cargado (solo validación), y `node --test --test-reporter=spec scripts/vercel-migration-target.test.mjs`.

## Límites y estado de entrega

- No se consultó ni modificó la DB de producción. El conector Neon disponible no ve el proyecto Bloqer y el entorno local no pudo alcanzar el servidor en la revisión precedente. La presencia de D-115 en producción consignada en entregas previas no se presenta como una comprobación actual.
- No se ejecutaron suites live ni E2E con credenciales, ni un smoke visual del portal. El intento previo de Computer Use se detuvo por no poder verificar la URL de la ventana; no se eludió ese control.
- Las pruebas de servicios usan dependencias de persistencia simuladas cuando corresponde; no equivalen a probar constraints, bloqueos y rollback en PostgreSQL real.
- El CI y Vercel Preview de `25053ae2` estaban aprobados. El estado del commit que contiene esta auditoría debe consultarse en el PR; no se hereda el resultado del commit anterior.
- Commit y push de la rama autorizados. Integración a `main`, despliegue y comprobación en `portal.bloqer.app` son etapas posteriores. Mantener el [smoke documentado](../DEPLOYMENT_SMOKE_TEST.md) para empresa y proyecto.

