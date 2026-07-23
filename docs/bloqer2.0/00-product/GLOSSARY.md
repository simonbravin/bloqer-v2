# Glosario — Bloqer 2.0

> Vocabulario único del dominio. Cuando dos términos compiten, **gana el que está en este glosario**. Los demás se evitan.

---

## Canonical naming and language rules

### Principios (resumen)

- **Código, tablas, campos, enums, estados, eventos, endpoints, claves i18n:** **inglés** (valores canónicos).
- **Labels de UI y redacción funcional** en documentación de producto: **español (Argentina)**.
- Los términos en español tipo *Borrador*, *Emitido*, *Anulado* son **etiquetas**; en modelo y API se usan los enums en inglés (`DRAFT`, `ISSUED`, `CANCELLED`, etc.).

### Tabla enum canónico ↔ label UI (es-AR)

| Canonical enum | UI label (es-AR) |
|---|---|
| DRAFT | Borrador |
| IN_REVIEW | En revisión |
| APPROVED | Aprobado |
| CONFIRMED | Confirmado |
| ISSUED | Emitido |
| CLOSED | Cerrado |
| CANCELLED | Anulado / Cancelado |
| REJECTED | Rechazado |
| PAID | Pagado |
| PARTIALLY_PAID | Parcialmente pagado |
| UNPAID | Pendiente de pago |

**Extensiones usadas en el dominio** (mismo criterio: enum en inglés, label es-AR):

| Canonical enum | UI label (es-AR) |
|---|---|
| SUBMITTED | Enviado / Presentado |
| ANSWERED | Respondido / Contestado |
| INVOICED | Facturado *(término de negocio / otras entidades; **no** es valor de `Certification.status` — [D-026])* |
| RETURNED_FOR_CHANGES | Devuelto para cambios (presupuesto en revisión) |
| UNSETTLED | Sin liquidar (subcontrato / `settlement_status`) |
| PARTIALLY_SETTLED | Parcialmente liquidado |
| SETTLED | Liquidado |
| OPEN | Abierto |
| PARTIAL | Parcialmente pagado |
| OVERDUE | Vencido (AR/AP y otros; en **RFI** usar `is_overdue`, no estado) |
| SUPERSEDED | Reemplazado / Sin vigencia |
| RECONCILED | Conciliado |
| ACTIVE | Activo |
| ARCHIVED | Archivado |

> **Nota:** el **Budget** usa `IN_REVIEW` para “en revisión” ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Budget). El alias histórico `UNDER_REVIEW` no debe usarse en documentación nueva.

---

## A

### Adenda
Documento legal que **modifica un contrato cerrado**: amplía alcance, plazo o monto.  
En Bloqer es el instrumento para cambiar la **base contractual/comercial** (`Budget` `CLOSED`) y el **precio vendido / WBS contractual**; genera un **Budget** complementario. Un [Change Order](#change-order) puede originar una adenda pero **no** la reemplaza ([D-005], [BR-CO-003]).  
Diferente de Change Order en que tiene **valor contractual formal** y **sí** impacta lo vendido.

### AP — Cuentas por Pagar (Accounts Payable)
Saldo que la empresa **debe a terceros** (proveedores, subcontratistas, servicios). Puede nacer de una factura de compra o cargarse manualmente.

### AR — Cuentas por Cobrar (Accounts Receivable)
Saldo que **terceros deben a la empresa** (clientes). Puede nacer de una certificación facturada, una venta directa o cargarse manualmente.

### ARS
Peso argentino. **Moneda base** de Bloqer. Toda conversión de monedas extranjeras se almacena también en ARS para reportes consolidados.

### Avance económico
Porcentaje del presupuesto que se **certificó al cliente**. Diferente del [físico](#avance-físico) y del [financiero](#avance-financiero).

### Avance financiero
Porcentaje del presupuesto que se **cobró efectivamente**. Suele ir más atrás que el avance económico.

### Avance físico
Porcentaje de **obra realmente ejecutada**. Lo registra el PM o el capataz con base en mediciones reales. Independiente de lo certificado.

---

## B

### Borrador
Estado inicial de cualquier comprobante o documento que aún **se puede editar libremente**. No tiene impacto en saldos ni reportes hasta que se confirma. **Enum canónico:** `DRAFT`.

### Bruta (rentabilidad)
Diferencia entre **ingresos certificados** y **costos directos** del proyecto. No descuenta gastos generales, costos financieros ni impuestos.

---

## C

### Cashflow
Flujo de fondos **realmente ejecutado** (caja real). Distinto de la [proyección de caja](#proyección-de-caja).

### Cashflow proyectado / Proyección de caja
Flujo esperado, mezcla de cashflow real más AR y AP futuras según fechas esperadas.

### Certificación
Documento emitido al cliente reconociendo **avance ejecutado** sobre la obra. Habilita facturación. Puede haber muchas por proyecto. Ver [`02-modules/CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md).

### Change Order
Solicitud / control **operativo** de cambio (alcance, plazo, cantidades, costo estimado); puede venir del cliente, obra, RFI o interno. Ver [`02-modules/CHANGE_ORDERS.md`](../02-modules/CHANGE_ORDERS.md).  
**No** modifica por sí solo el presupuesto **`CLOSED`** ni el contrato/precio vendido; para impacto contractual usar [Adenda](#adenda) ([BR-CO-002], [BR-CO-003]).

### Cobranza
Movimiento que **reduce un saldo de AR**. Total o parcial. Vincula AR + cuenta de tesorería + comprobante (recibo).

### Comprometido (`committed_amount`)
Capa de reporting: compromisos **firmes** aún no necesariamente devengados ni pagados (OC `APPROVED`/`CONFIRMED`, subcontrato `ACTIVE`, otros firmes aprobados). **Excluye** borradores, cancelados, transferencias internas y proyecciones sin documento. Ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.1, [BR-COS-001].

### Devengado (`accrued_amount`)
Obligación de costo **reconocida**: facturas compra registradas/aprobadas, certificaciones de subcontrato que generan AP, gastos cargados como payable, compra directa confirmada. Ver [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md) §1.2.

### Conciliación bancaria
Proceso de **cotejar movimientos del sistema con el extracto del banco**, marcando los que coinciden. Manual en Fase 1, semi-automática en Fase 2.

### Contacto
Entidad raíz del directorio. Puede tener uno o varios **roles** (cliente, proveedor, subcontratista, empleado, otro). Un mismo contacto puede ser cliente y proveedor a la vez.

### Costo directo
Costo de **materiales + mano de obra + equipos + subcontratos** imputables a un ítem o proyecto.

### Costo financiero
Costo del dinero en el tiempo, asociado al financiamiento de la obra. Calculado sobre desfases entre desembolsos y cobranzas. Fórmula simple en Fase 1.

### Costo indirecto / Gastos generales (GG)
Costos de la empresa **prorrateados** a la obra (administración, alquileres, sueldos no obra). Pueden imputarse por % fijo, por costo directo, o por prorrateo manual.

---

## D

### Depósito (Warehouse)
Ubicación física que **almacena stock**. Una empresa puede tener múltiples depósitos (almacén central, obra A, obra B, camioneta, etc.). El stock se controla por depósito, no consolidado.

### Devengado
Vista financiera donde un costo se **reconoce al recibir el bien o servicio**, no al pagarlo. Bloqer lo trackea internamente; su exposición pública es Fase 2.

### Directorio
Conjunto único de **contactos** de la empresa, con roles múltiples. Ver [Contacto](#contacto).

---

## E

### Egreso
Movimiento de **salida de dinero** desde una cuenta de tesorería. Puede ser un pago, una transferencia interna o un gasto.

### EDT — Estructura de Desglose de Trabajo
**Label de UI (es-AR)** para la [WBS](#wbs--work-breakdown-structure). En pantallas y navegación se usa **EDT** / **EDT y costos** (título largo: *Estructura de Desglose de Trabajo y Costos*). En código, Prisma, APIs y campos (`wbsNode`, `wbsNodeId`, etc.) se mantiene **WBS** — no duplicar entidades ni tablas.

### Empresa
Sinónimo conversacional de **razón social** dentro de un tenant. Pendiente: ¿un tenant puede tener varias empresas o son 1:1? — ver [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).

### Estado
Posición actual en la **máquina de estados** de una entidad. Ejemplo (**`Certification.status`**): `DRAFT | ISSUED | APPROVED | REJECTED | CANCELLED`. El **pago** respecto del cliente se refleja en **`payment_status` derivado** (`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) desde AR/cobranzas, no como valor de ese ciclo ([BR-CERT-PAYMENT-001]). Ver [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).

---

## F

### Factura de compra
Comprobante emitido por un proveedor que **genera AP**. Puede asociarse a una OC y a una recepción, o ser directa.

### Factura de venta
Comprobante emitido al cliente que **genera AR**. Puede asociarse a una certificación o ser directa (venta directa).

### Fase
Concepto **interno** de implementación (Fase 1, 2, 3). No es comercial. Cada feature de cada módulo declara su fase.

### Fase de presupuesto
Subdivisión del proyecto cuando se **agrega un nuevo presupuesto** que complementa al inicial (típicamente por ampliación de alcance via adenda).

### FIFO
First In First Out. Método de valuación de stock donde **lo primero que entra es lo primero que sale**. Configurable por empresa. Alternativa: [Promedio Móvil](#promedio-ponderado-móvil).

### FX (Foreign Exchange)
Tipo de cambio. En Bloqer se carga **manualmente** por movimiento. ARS es la base; otras monedas se almacenan junto al monto en ARS convertido.

---

## G

### Gantt
Diagrama temporal de **planificación de tareas** de una obra. Forma exacta a definir en `OPEN_QUESTIONS.md` (Gantt clásico, hitos, o ambos).

### GG
Ver [Gastos generales](#costo-indirecto--gastos-generales-gg).

---

## H

### Hito (milestone)
Punto temporal **destacado** en el cronograma de una obra. Puede asociarse a un % de avance o a un evento contractual (entrega de tramo, inspección).

---

## I

### Imputar
**Asignar** un costo o ingreso a un proyecto y/o ítem del WBS. Una factura de compra se imputa a un proyecto (o varios, prorrateando).

### Ingreso
Movimiento de **entrada de dinero** a una cuenta de tesorería. Puede ser una cobranza, una transferencia interna o un ingreso varios.

### Inventario
Conjunto de **productos / materiales** que la empresa stockea. Controlado por depósito.

---

## J

### Jobsite Log / Libro de Obra
Registro **diario de obra**: clima, cuadrillas, tareas realizadas, materiales recibidos, eventos, fotos. Ver [`02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md).

---

## L

### Ledger / Ledger unificado
Tabla conceptual única donde **cada movimiento de tesorería** queda registrado de forma normalizada. Es el motor del modelo financiero. Ver [`03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md).

---

## M

### Mano de obra
Costo de **personal directo de obra**. Puede ser propia o tercerizada (subcontratada). Se imputa al ítem del WBS o al proyecto.

### Multi-tenant
Arquitectura donde **una sola instalación de Bloqer atiende a muchas empresas** con datos aislados por `tenant_id`.

### Multi-moneda
Capacidad de **operar en monedas distintas** del peso argentino. ARS es la base; otras monedas tienen FX manual al momento del movimiento.

---

## N

### Neta (rentabilidad)
[Rentabilidad bruta](#bruta-rentabilidad) **menos gastos generales, costo financiero e impuestos**. Visible solo para `OWNER` / `ADMIN` por defecto.

---

## O

### Obra
Sinónimo conversacional de [Proyecto](#proyecto). En el sistema se modela como `Project`.

### OC — Orden de Compra
Documento que **autoriza una compra a un proveedor** antes de recibir bienes/servicios. Tiene impacto en costo desde su confirmación. No todas las compras requieren OC.

### Owner
Rol con **propiedad del tenant**. Acceso total. Ver [`USER_ROLES.md`](./USER_ROLES.md).

---

## P

### Pago
Movimiento que **reduce un saldo de AP**. Total o parcial. Vincula AP + cuenta de tesorería + comprobante (orden de pago).

### Periodo
Rango de fechas (típicamente mensual) que **se puede cerrar**. En periodo cerrado no se editan movimientos. Ver [`03-finance/PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md).

### Posición consolidada
Vista de tesorería que muestra **saldos de todas las cuentas en simultáneo** (por moneda y consolidado en ARS).

### Presupuesto
Plan económico de la obra: **WBS + ítems + análisis de costos + precio de venta**. Una obra puede tener múltiples presupuestos (versión activa + adendas/fases).

### Promedio ponderado móvil
Método de valuación de stock donde el **costo unitario se recalcula con cada ingreso**. Configurable por empresa. Alternativa: [FIFO](#fifo).

### Proveedor
Rol del [Contacto](#contacto) cuando **vende a la empresa**. Un contacto puede ser proveedor y cliente a la vez.

### Proyecto
Unidad central de negocio. **Toda actividad costea o ingresa** vinculándose (directa o indirectamente) a un proyecto, salvo gastos generales de empresa. Ver [`02-modules/PROJECTS.md`](../02-modules/PROJECTS.md).

### Proyección de caja
Ver [Cashflow proyectado](#cashflow-proyectado--proyección-de-caja).

---

## Q

### Query Builder
Constructor de **reportes ad-hoc** dentro de Bloqer. El usuario elige tabla base, filtros y columnas para armar reportes que el equipo no anticipó. Forma exacta a definir.

---

## R

### Real
En costos de obra, “real” es **capa explícita** del reporte ([D-021](./DECISION_LOG.md), [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md)):
- **Comprometido** / **abierto** / **exposición esperada** (`expected_cost_exposure`).
- **Devengado** (`accrued_amount`).
- **Pagado** (`paid_amount`, caja).

No mezclar con **cashflow** ni **proyección** sin etiquetar.

### Recepción
Documento que confirma la **entrada de bienes o servicios** asociados a una OC. Puede ser parcial. Anterior a la factura.

### Recibo
Comprobante entregado al cliente cuando **se cobra una factura/certificación**.

### Retención / Percepción
Impuesto retenido al pagar (proveedor) o cobrar (cliente). En Fase 1 se carga **manualmente** como % o monto fijo por movimiento.

### RFI — Request for Information
Solicitud formal de información durante la obra (al cliente, dirección, otro). Estados de ciclo: `DRAFT | SUBMITTED | ANSWERED | CLOSED | CANCELLED`; el vencimiento sin cerrar se muestra como **`is_overdue`** / alertas, no como `status` ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §16). Ver [`02-modules/RFIS.md`](../02-modules/RFIS.md).

---

## S

### SaaS
Software as a Service. Bloqer se entrega como SaaS multitenant.

### Stock
Inventario disponible. Se mide por [depósito](#depósito-warehouse), no globalmente.

### Subcontratista
Rol del [Contacto](#contacto) cuando **ejecuta tareas de obra contratadas por la empresa**. Tiene contrato propio (subcontrato). Puede certificar avances.

### Subcontrato
Contrato entre la empresa y un subcontratista para **ejecutar parte de una obra**. Tiene presupuesto propio, avance y pagos. Ver [`02-modules/SUBCONTRACTS.md`](../02-modules/SUBCONTRACTS.md).

### settlement_status (SubcontractCertification)
Indicador **derivado** de liquidación frente a **AP y pagos** en certificaciones de subcontrato: `UNSETTLED` \| `PARTIALLY_SETTLED` \| `SETTLED` \| `OVERDUE`. Análogo al `payment_status` de certificación **a cliente**, pero con otro nombre para evitar confusiones ([D-027]). **No** confundir con `SubcontractCertification.status` (ciclo documental).

---

## T

### Tenant
Instancia **aislada de datos** para una empresa cliente del SaaS. Toda entidad operativa pertenece a un `tenant_id`.

### Tesorería
Módulo que gestiona **dinero en cuentas y caja**. Modelo de 4 vistas sobre un único motor de movimientos. Ver [`02-modules/TREASURY.md`](../02-modules/TREASURY.md).

### Transferencia interna
Movimiento que **mueve dinero entre dos cuentas propias** del mismo tenant. Genera **par de movimientos** atados por `transfer_id`. Tiene `fecha contable` y `fecha valor` separadas.

---

## U

### Usuario
Persona física que accede al sistema. Tiene uno o más [roles](./USER_ROLES.md).

### USD
Dólar estadounidense. Moneda extranjera más común en Bloqer. FX manual.

### Utilidad
Margen agregado al costo del presupuesto para llegar al precio de venta. Se expresa como % o monto. Distinta de [rentabilidad](#bruta-rentabilidad), que es el resultado real ejecutado.

---

## V

### Venta directa
Flujo comercial sin certificación: **factura directa al cliente** sin pasar por proceso de avance certificado. Para obras chicas o servicios.

### Versión de presupuesto
Cada **iteración del presupuesto de un proyecto**. Una sola está activa a la vez. Las versiones nacen de adendas o de re-presupuesto.

---

## W

### WBS — Work Breakdown Structure
**Estructura jerárquica** del presupuesto. Niveles típicos: rubro → subrubro → ítem. Cada ítem tiene cantidad, unidad, precio unitario y análisis de costos.  
**Nombre canónico en código/modelo:** WBS. **Label de UI (es-AR):** [EDT](#edt--estructura-de-desglose-de-trabajo).

---

## Términos que NO usamos (intencionalmente)

| Término evitado | Usar en su lugar | Razón |
|---|---|---|
| Cliente y proveedor (como entidades separadas) | [Contacto](#contacto) con rol | Un mismo contacto puede ser ambos |
| "Plan de cuentas" tradicional | Ledger + categorías de movimiento | Bloqer no es contable formal |
| "Cierre contable" formal | [Periodo](#periodo) cerrado | Es un cierre operativo, no contable |
| "MVP" como producto distinto | "Fase 1" interna | El MVP es el producto final |
| "Item de presupuesto" sin WBS/EDT | "Ítem del EDT" (UI) / "Ítem del WBS" (doc técnica) | Para reforzar que cuelga de jerarquía |
| Renombrar tablas/campos a `edt_*` | Mantener `wbs_*` en modelo; EDT solo en UI | Evitar duplicar entidades y migraciones innecesarias |
| "Movimiento bancario" | "Movimiento de tesorería" | También aplica a caja, no solo bancos |
| "Estado de pago" como atributo | [Estado](#estado) de la entidad | No mezclar atributos con máquina de estado |
