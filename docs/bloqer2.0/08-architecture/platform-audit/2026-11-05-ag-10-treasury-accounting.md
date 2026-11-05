# AG-10 — Tesorería, conciliación, períodos y contabilidad

**Estado:** AG-10 cerrada localmente el 05/11/2026 con 31 grupos corregidos y verificados.

## 1. Encargo y base

- Alcance [AG-10](../PLATFORM_AUDIT_PLAN.md#ag-10--tesorería-conciliación-cierres-y-contabilidad). Incluye diagnóstico, correcciones y verificación. La revisión integral UX/UI se conserva como trabajo posterior pedido por el Owner.
- Base de trabajo `cae3e539ad5b05d265cedc09adbc62c6fd8758d5` en `codex/pruebas`. Árbol inicial limpio después de fijar AG-09. El [merge AG-09](./2026-11-05-ag-09-publication.md) tiene el mismo árbol.
- Responsables: coordinación, publicación anterior, decisiones, migración aislada y verificación de conjunto; `ag10_treasury` para cuentas, movimientos, conciliación y períodos; `ag10_accounting` para GL; `ag10_ui` para web y consumidores.
- Para las pruebas con escritura se usa la base aislada de auditoría. La muestra prevista cubre escritorio, tablet y teléfono con actor sintético, por recorridos seleccionados.

## 2. Fuentes y alcance

- Tesorería, cuentas y transferencias. [TREASURY](../../02-modules/TREASURY.md), [BANK_ACCOUNTS](../../02-modules/BANK_ACCOUNTS.md), [INTERNAL_TRANSFERS](../../02-modules/INTERNAL_TRANSFERS.md), [MONEY_MODEL](../../03-finance/MONEY_MODEL.md), [ACCOUNT_MOVEMENTS](../../03-finance/ACCOUNT_MOVEMENTS.md), D-008/D-023/D-024/D-053/D-134 y BR-TRZ.
- Conciliación, cierres y bloqueos. [BANK_RECONCILIATION](../../02-modules/BANK_RECONCILIATION.md), [RECONCILE_BANK](../../05-workflows/RECONCILE_BANK.md), [PERIOD_CLOSE_AND_LOCKS](../../03-finance/PERIOD_CLOSE_AND_LOCKS.md), D-075/D-076/D-078/D-079/D-080 y BR-PER.
- GL y consumidores. [ACCOUNTING](../../02-modules/ACCOUNTING.md), [ACCOUNTING_LEDGER_ARCHITECTURE](../ACCOUNTING_LEDGER_ARCHITECTURE.md), [TENANT_COMPANY_SCOPING](../TENANT_COMPANY_SCOPING.md), D-061/D-062/D-063/D-092/D-115.

### Inventario de recorridos

- **Cuentas y movimientos.** Documentado por D-024 y D-134. Escrituras de saldo inicial, ingresos, egresos, cobros, pagos y estados en `packages/services/src/treasury` y AR/AP. Exposición en Cuentas, extracto y Transacciones. Las suites de AG-09 acreditan la conexión con caja, no la corrección de AG-10 por sí solas.
- **Transferencia propia.** Documentada en D-023 y BR-TRZ-004. `InternalTransfer` y sus dos piernas se consumen en Tesorería, conciliación, reportes y GL. No integra Transacciones de terceros. Se cotejan permisos, reintento, períodos de ambas piernas y cancelación.
- **Conciliación.** D-075/076/079/080 documentan carga manual y archivos, propuestas, matches y cierre/reapertura. `bank-reconciliation.service` y R-020 consumen cuentas, sesiones, líneas y movimientos. Se contrasta pertenencia, correspondencia, saldo y efecto del período.
- **Períodos y contabilidad.** `Period` bloquea escrituras por empresa y fecha contable. Cierres, cuentas, reglas, asientos, libro, estados y exports tienen contratos separados de caja. Se revisan asientos con origen operativo, posting concurrente, reversión, reportes y controles del servicio.
- **Consumo transversal.** Posición, flujo, extractos, dashboard y herramientas de consulta se contrastan contra el ledger con sus filtros y permisos. Se incluyen los consumidores alcanzados por correcciones de AG-10.

## 3. Decisiones aprobadas

El Owner aprobó los seis puntos de la [propuesta de Tesorería](./2026-11-05-ag-10-treasury-contract-proposal.md).

- **D-134 / Q-081.** Se guarda la cotización de movimientos nuevos. La migración aditiva aislada agregó dos columnas opcionales y dejó 24 movimientos históricos con snapshot vacío.
- **D-135 / Q-084.** La anulación sincronizada respeta el cierre del mes del borrador contable. El caso SQL de pago comprobó que origen, caja, deuda, borrador y auditoría quedan intactos al bloquearse y se anulan juntos después de reabrir.
- **D-136 / Q-085.** La apertura negativa se registra como egreso de apertura, mantiene el saldo y toma el mismo control de período y FX que una apertura positiva.
- **D-137 / Q-082.** Se guardan fecha contable y valor de transferencias nuevas. La migración aislada dejó las dos columnas opcionales y preservó 35 movimientos y dos transferencias sin fechas de valor inferidas.
- **D-138 / Q-083.** Se exige signo explícito para una transferencia `XFER` en OFX/QFX y se identifica la fila ambigua.
- **D-139 / Q-086.** Se documenta el comportamiento vigente de conservar el IVA separado cuando falta solo la cuenta IIBB.

Las migraciones se probaron exclusivamente en la base aislada. Las rondas y su deduplicación se detallan en §5.

## 4. Hallazgos consolidados

### GA-AG-10-001 — Empresa válida al crear y leer cuentas

- **P1**. Un alta podía enlazar una empresa de otro tenant. Algunas lecturas seguían esa relación inválida.
- **Corrección.** Validar tenant y empresa activa en el alta y filtrar relaciones incoherentes en cuentas, saldo, resumen y posición de caja.
- **Superficies.** treasury-account.service.ts, balance.service.ts, treasury-hub.service.ts, treasury-reports.service.ts.
- **Verificación.** SQL Tesorería · ámbito de cuenta, focal Posición.

### GA-AG-10-002 — Estados y edición de cuentas

- **P2**. Una cuenta terminal admitía mutaciones en algunos caminos. Campos opcionales no se limpiaban y los límites de lista eran inseguros.
- **Corrección.** Revalidar estado bajo control optimista, aceptar limpieza de campos opcionales y normalizar paginación.
- **Superficies.** treasury-account.service.ts, treasury.ts.
- **Verificación.** SQL Tesorería · estado terminal.

### GA-AG-10-003 — Cotización del movimiento de caja

- **P1**. Los escritores podían confirmar moneda extranjera sin conservar su cotización. El movimiento omitía incluso la cotización disponible de pago o cobro.
- **Corrección.** D-134 guarda FX y equivalente de cada movimiento nuevo, reutiliza la misma cotización en su hecho y mantiene la ausencia de dato histórico.
- **Superficies.** schema.prisma, fx-amount.service.ts y escritores de AR/AP/Tesorería.
- **Verificación.** Migración D-134; SQL AR/AP FX y Tesorería.

### GA-AG-10-004 — Saldo inicial negativo y saldo cero

- **P1**. El alta negativa quedaba fuera del ledger y el bloqueo mensual. El consolidado no podía recuperar la cotización de apertura.
- **Corrección.** D-136 registra egreso de apertura por magnitud, con período y FX. Cero no genera movimiento. Los saldos usan una sola apertura.
- **Superficies.** treasury-account.service.ts, balance.service.ts.
- **Verificación.** SQL Tesorería D-136.

### GA-AG-10-005 — Reintentos de ingresos, ajustes y transferencias

- **P1**. Una clave podía reutilizarse con diferencias de empresa, descripción, fecha o FX. Conciliar un movimiento podía invalidar un replay legítimo.
- **Corrección.** Comparar el mismo efecto con su alcance y snapshot, y aceptar replay igual de un movimiento conciliado.
- **Superficies.** idempotency.ts, registros manuales e internal-transfer.service.ts.
- **Verificación.** SQL Tesorería · FX, par y replay.

### GA-AG-10-006 — Dos piernas de transferencia y cierres por empresa

- **P1**. Se validaba un solo período aunque las dos piernas pertenecieran a empresas distintas. El par podía cancelarse sin verificar su forma completa.
- **Corrección.** Verificar la raíz, ambas cuentas y piernas, fechas, importes y moneda. Bloquear empresas y cuentas en orden y cancelar el par exacto.
- **Superficies.** internal-transfer.service.ts, treasury-write-locks.ts.
- **Verificación.** SQL Tesorería · par y ambos períodos.

### GA-AG-10-007 — Fecha contable y fecha valor

- **P1**. El ledger tenía una sola fecha aunque el banco acreditara en otra. Consultas y cierres no distinguían ambos hechos.
- **Corrección.** D-137 registra las dos fechas. Extracto, saldo corrido y conciliación usan la base elegida o su fallback identificado. GL y cierre siguen fecha contable.
- **Superficies.** schema.prisma, internal-transfer.service.ts, balance.service.ts, treasury-reports.service.ts.
- **Verificación.** Migración D-137; SQL fechas y focales extracto.

### GA-AG-10-008 — Cierres y reaperturas en entrada directa

- **P1**. Una reapertura podía quedar sin motivo desde servicio. Las fechas imposibles se podían normalizar a otro mes.
- **Corrección.** Validar motivo, fecha y límites. Revalidar empresa activa dentro de la misma exclusión de escrituras. Usar mes de Argentina en el listado.
- **Superficies.** period-lock.service.ts.
- **Verificación.** 5 focales de calendario y SQL reapertura.

### GA-AG-10-009 — Relaciones de una conciliación

- **P1**. Raíces propias podían incluir relaciones ajenas o desactualizadas. Los datos cruzados podían llegar al detalle o al CSV.
- **Corrección.** Comprobar cuenta, sesión, líneas y matches en el mismo tenant. Preservar el alcance de Tesorería por tenant y las cuentas compartidas.
- **Superficies.** bank-reconciliation.service.ts, bank-reconciliation-report.service.ts.
- **Verificación.** SQL y revisión del alcance R-020.

### GA-AG-10-010 — Conciliar, deshacer y crear ajustes

- **P1**. La creación desde extracto tomaba cuenta antes que empresa. El deshacer podía saltar el cierre y repetir un movimiento que ya existía.
- **Corrección.** Ordenar bloqueos, releer sesión y cuenta, verificar períodos y reutilizar una correspondencia válida sin duplicar el ajuste.
- **Superficies.** bank-reconciliation.service.ts.
- **Verificación.** SQL Tesorería · duplicación y período.

### GA-AG-10-011 — Importación de extractos

- **P2**. Archivos incompletos o montos que redondean a cero podían aceptarse. OFX trataba XFER como débito fijo.
- **Corrección.** Validar antes de importar. D-138 usa signo explícito en XFER y muestra la fila ambigua. Mantener compatibilidad de tipos inequívocos.
- **Superficies.** bank-statement-ofx-parser.ts, bank-statement-csv-parser.ts.
- **Verificación.** Focales CSV/OFX.

### GA-AG-10-012 — Diferencia entre banco y libro

- **P2**. La conciliación podía presentar como alineado el saldo absoluto aunque solo hubiera emparejado el rango.
- **Corrección.** Mostrar saldo libro al cierre por fecha valor y diferencia banco menos sistema. Conservar criterios D-075 para cerrar.
- **Superficies.** bank-reconciliation.service.ts, bank-reconciliation-workspace.tsx.
- **Verificación.** SQL fecha valor y muestra tablet.

### GA-AG-10-013 — Cierre de cuenta con saldo cero

- **P1**. El estado terminal existía en el modelo y el contrato, pero faltaba el recorrido que verifica el saldo para cerrar.
- **Corrección.** Cerrar cuentas activas o inactivas con saldo cero y auditoría account.closed. Bloquear cambios posteriores de saldo y conservar extracto.
- **Superficies.** treasury-account.service.ts, cierre de cuenta web.
- **Verificación.** SQL Tesorería · cierre y AP · reversión.

### GA-AG-10-014 — Anulación de caja y sincronización contable

- **P1**. Caja podía quedar anulada con un asiento borrador o posteado todavía activo por una carrera o un fallo de auditoría.
- **Corrección.** Resolver guard y borrador contable dentro de la transacción de la operación y bajo el bloqueo de empresa.
- **Superficies.** account-movement.service.ts, internal-transfer.service.ts, bank-reconciliation.service.ts, accounting-cancel-sync.service.ts.
- **Verificación.** SQL Tesorería, AR y AP · rollback y carrera.

### GA-AG-10-015 — Cierre del mes del borrador vinculado

- **P1**. La sincronización del asiento omitía el bloqueo del período si el borrador tenía otra fecha.
- **Corrección.** D-135 valida también la fecha del borrador y deja todas las partes intactas ante cierre.
- **Superficies.** accounting-cancel-sync.service.ts, journal-entry.service.ts.
- **Verificación.** SQL D-135 en Tesorería y AP.

### GA-AG-10-016 — Pierna de pago al revertir

- **P1**. Una primera coincidencia podía ocultar una pierna duplicada o con fecha distinta. Anular podía alterar el saldo de una cuenta cerrada.
- **Corrección.** Revalidar cuenta y una sola pierna activa con fecha contable exacta bajo bloqueo. Conservar caja y deuda si falla.
- **Superficies.** payment.service.ts.
- **Verificación.** SQL AP · pierna duplicada, fecha distinta y cuenta cerrada.

### GA-AG-10-017 — Origen contable comprobado

- **P1**. El alta manual aceptaba origen y montos arbitrarios. Una fuente cancelada o adulterada podía alcanzar posteo.
- **Corrección.** Separar alta manual y sugerencia. Verificar fuente vigente, moneda, monto y proyecto, incluida transferencia con dos piernas.
- **Superficies.** journal-entry.service.ts, accounting-auto-draft.service.ts, accounting-treasury-source.ts.
- **Verificación.** SQL borrador adulterado, posteo, reversa y Libro.

### GA-AG-10-018 — Cabecera GL y cierres concurrentes

- **P1**. Un PATCH de cabecera podía ligar proyecto ajeno. Alta y edición consultaban período antes de la transacción.
- **Corrección.** Revalidar proyecto y empresa, fecha anterior y nueva, y registrar auditoría en la transacción bajo Company.
- **Superficies.** journal-entry.service.ts, accounting-company-context.ts.
- **Verificación.** Focales GL, SQL D-135 y revisión independiente.

### GA-AG-10-019 — Precisión y monedas de GL

- **P1**. Montos crudos podían balancear antes del redondeo. Distinto casing separaba saldos de la misma moneda.
- **Corrección.** Aplicar D-053 antes de persistir y balancear, validar calendario y moneda, agrupar históricos con moneda canónica sin reescritura.
- **Superficies.** journal-entry.service.ts, accounting-reports.service.ts, validators/accounting.ts.
- **Verificación.** Focales GL y SQL Libro.

### GA-AG-10-020 — Integridad histórica al leer y revertir GL

- **P1**. Una línea histórica con cuenta ajena podía exponer su nombre en detalle o copiarse a una reversa.
- **Corrección.** Validar relaciones de asiento y líneas bajo el alcance tenant/empresa, incluida la reversa. Preservar cuentas históricas válidas aunque estén inactivas.
- **Superficies.** journal-entry.service.ts.
- **Verificación.** Revisión independiente y focal de lectura/reversa.

### GA-AG-10-021 — Permisos de origen y enlaces GL

- **P1**. Sugerencias y enlaces podían revelar documentos fuera del permiso operativo o presentar una reversa como ajuste.
- **Corrección.** Verificar módulo y alcance del origen. La reversa enlaza al asiento original. Los costos sin moneda trazable no generan nuevo asiento.
- **Superficies.** accounting-source-access.ts, journal-entry-source-link.service.ts.
- **Verificación.** Focales permisos, D-124 y SQL Libro.

### GA-AG-10-022 — Plan de cuentas, jerarquía y plantilla

- **P2**. Ediciones concurrentes podían introducir ciclos o cambiar el tipo durante posteo. Reaplicar plantilla podía duplicar reglas.
- **Corrección.** Validar jerarquía y estado bajo bloqueo compartido con posteo y reusar plantilla por código y regla.
- **Superficies.** accounting-account.service.ts, accounting-coa-template.service.ts.
- **Verificación.** Focales GL.

### GA-AG-10-023 — Mapeo debe/haber y reglas inactivas

- **P2**. Actualizaciones simultáneas podían dejar la misma cuenta en ambos lados. No se podía desactivar una regla con cuenta inactiva.
- **Corrección.** Releer y validar el par de la regla bajo bloqueo, permitir desactivación del vínculo inactivo.
- **Superficies.** accounting-mapping.service.ts.
- **Verificación.** Focales mapeo.

### GA-AG-10-024 — Libro, Mayor y estados consistentes

- **P2**. Exportaciones podían presentar un Mayor truncado como completo. Lecturas separadas permitían mezclar cortes.
- **Corrección.** Usar una lectura consistente, validar rangos y evitar exportar como completo cuando se superó el límite.
- **Superficies.** accounting-reports.service.ts, report-export.service.ts, report-pdf-export.service.tsx.
- **Verificación.** Focales reportes y SQL Libro.

### GA-AG-10-025 — Duplicación de borrador automático y aviso

- **P2**. Dos operaciones concurrentes podían volver a auditar el mismo borrador o repetir aviso en la ventana de 24 h.
- **Corrección.** Distinguir creado de existente y deduplicar aviso por empresa bajo bloqueo, con alcance correcto de destinatarios.
- **Superficies.** accounting-auto-draft.service.ts, accounting-draft-notifications.service.ts.
- **Verificación.** Focales GL.

### GA-AG-10-026 — Navegación contable por empresa

- **P2**. Sin filtro explícito una pantalla podía elegir la primera empresa. Algunos enlaces perdían el contexto.
- **Corrección.** Usar el filtro Empresa ya contemplado por los servicios y conservarlo al navegar. Respetar empresa de sesión y sus permisos.
- **Superficies.** apps/web/app/(app)/contabilidad y accounting-module-nav.tsx.
- **Verificación.** Tipos, revisión del contrato y muestra escritorio.

### GA-AG-10-027 — Formularios y recuperación de acciones

- **P2**. Algunas operaciones ocultaban errores, repetían envío o perdían foco y contexto en diálogos.
- **Corrección.** Unificar confirmación, estado de envío, errores, invalidación, controles monetarios y permisos visibles del flujo.
- **Superficies.** apps/web/features/treasury, accounting y acciones AG-10.
- **Verificación.** Focales web y muestra de escritorio, tablet y teléfono.

### GA-AG-10-028 — Extracto, flujo, posición y exportaciones

- **P2**. El mes podía aparecer desplazado en zona argentina. Algunos CSV cortaban a 100 y la posición no explicaba una cotización histórica faltante.
- **Corrección.** Usar calendario local, exportar la selección completa dentro de límites y conservar totales por moneda con equivalente ARS disponible o incompleto.
- **Superficies.** treasury-reports.service.ts, cash-position-amounts.ts y consumidores web/AI.
- **Verificación.** Focales export, FX y mes; muestra visual.

### GA-AG-10-029 — Estados de movimiento y atribución de caja

- **P2**. La atribución omitía conciliados y la especificación aún anunciaba borrador de caja.
- **Corrección.** Incluir estados que afectan saldo y distinguir el movimiento confirmado del borrador de GL. Armonizar Guía, Ayuda e índice.
- **Superficies.** treasury-attribution.service.ts, STATE_MACHINES.md, TREASURY.md.
- **Verificación.** Focales de saldo, prueba general e índice.

### GA-AG-10-030 — Redirección interna de acciones contables

- **P1**. Una ruta con prefijo heredado podía convertirse en una URL externa al normalizarla y añadir el mensaje de la acción.
- **Corrección.** Validar el resultado de quitar el prefijo antes de redirigir. Conservar ruta, parámetros y ancla válidos.
- **Superficies.** auth-callback-url.ts y source-draft-actions.ts.
- **Verificación.** Prueba del bypass de /es y revisión de consumidores.

### GA-AG-10-031 — Regla de IVA cuando falta solo la cuenta de IIBB

- **P2**. D-112 describía un fallback genérico de dos líneas que no reflejaba la discriminación de IVA probada.
- **Corrección.** D-139 documenta el comportamiento existente con aprobación del Owner. El IVA sigue separado y se identifica la percepción junto al neto.
- **Superficies.** D-112/D-139, TAXES_AND_WITHHOLDINGS, Guía, Ayuda e índice de conocimiento.
- **Verificación.** Pruebas existentes de asiento fiscal y validación del índice.

## 5. Verificación y límites

- **Pruebas generales.** 2.678 aprobadas y cero fallas. Se completaron nueve tareas de pruebas, 13 de tipos y lint. Las 40 suites opt-in se omitieron en este runner. El intento de lint anterior identificó dos relaciones Prisma excluidas que quedaban sin uso. La respuesta ahora enumera sus campos públicos y pasó la revisión final.
- **SQL aislado.** 21 casos distintos aprobados, 10 de Tesorería, 4 de AR y 7 de AP y GL. Los reintentos de una misma prueba no se suman. El caso renombrado de la pierna de pago queda reemplazado por la versión que también verifica su fecha. Se conserva el resultado de D-135 y de contabilizar y revertir un asiento con origen comprobado.
- **Conocimiento.** Índice reproducible de 586 fragmentos. Guía y fichas de ayuda reflejan los recorridos aprobados. Los tests AI del runner general se ejecutaron con proveedores desactivados.
- **Revisión independiente.** 257 pruebas dirigidas offline, superpuestas a la corrida general. El manifiesto de 132 fuentes presentes y una eliminación coincide con el árbol revisado. Sin hallazgos confirmados pendientes en el alcance.
- **Compilación.** Aprobada. Las 132 fuentes coinciden con la compilación usada en navegador. Las comprobaciones no requirieron proveedores externos.
- **Muestra visual.** En escritorio (1440×1000) se verificó Posición de caja con ARS y USD separados y aviso de equivalente incompleto. En Contabilidad se aplicó la plantilla de la empresa sintética, se registró y contabilizó un asiento de ARS 10,25 y se comprobó en el Libro Diario. En tablet (768×1024) se inspeccionaron el saldo de libros, la diferencia banco − sistema, el criterio fecha valor y la ayuda OFX. En teléfono (390×844) se registró una transferencia de US$ 12,50 y se comprobó el orden del extracto por fecha valor. El detalle en escritorio mostró fecha contable 05/11, valor 06/11, FX 1.260,123456 y equivalente ARS 15.751,54. Se cubrieron temas claro y oscuro. Se cerraron sesión, pestaña y servidor local.
- **Alcance de evidencia.** La muestra usó cuentas y operaciones sintéticas. Las revisiones integrales de UX/UI y las capacidades diferidas de transferencias entre monedas y banca directa se conservan como trabajos posteriores.

Artefactos locales en `output/platform-audit/ag-10-2026-11-05/`. El [registro estructurado](./2026-11-05-ag-10-treasury-accounting.json) incluye selección y resultados. Revalidación selectiva en [Testing Strategy](../TESTING_STRATEGY.md#selección-reutilizable-ag-10--tesorería-conciliación-y-contabilidad).

## 6. Estado de publicación

AG-09 está publicada. AG-10 queda cerrada y verificada en el entorno local de auditoría, con sus migraciones aditivas preparadas. AG-11 espera la indicación del Owner. [Publicación AG-09](./2026-11-05-ag-09-publication.md)
