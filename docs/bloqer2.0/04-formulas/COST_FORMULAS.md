# Fórmulas — Costos (real vs presupuesto)

> **Fuente canónica** para **comprometido**, **devengado**, **pagado** y **anti doble conteo** en reporting de costos. Los reportes R-001, R-003, R-004, R-009, R-010 y paquetes financieros deben alinearse a estas definiciones ([BR-COS-001], [BR-COS-002], [D-021]).

---

## 1. Definiciones canónicas (reporting de costo)

Todas las magnitudes siguientes se expresan en **moneda funcional del reporte** (típicamente ARS consolidado) con la misma regla FX que el resto del módulo financiero.

### 1.1 `committed_amount` (Comprometido)

Monto asociado a **compromisos firmes** aún **no necesariamente** devengados ni pagados.

**Incluye (capas que cuentan para el total):**

| Origen | Condición mínima en el modelo |
|---|---|
| **Purchase Order** | `CONFIRMED`, `PARTIALLY_RECEIVED` o `RECEIVED` (y no `CANCELLED`). Ver [D-044](../00-product/DECISION_LOG.md): el compromiso se reconoce al **confirmar al proveedor**, no en `SUBMITTED`/`APPROVED`. |
| **Subcontract** | Estado que formaliza el compromiso contractual: **`ACTIVE`** en el ciclo actual (equivalente operativo a “aprobado/confirmado” para reporting) |
| **Otros compromisos firmes** | Documentos/parametrización tenant que registren obligación firme aprobada (Fase 1: según catálogo explícito cuando exista) |

**Excluye:**

- OC en `DRAFT`, `SUBMITTED` o `APPROVED` (aún no confirmada al proveedor).
- OC / subcontratos `CANCELLED`.
- **Internal transfers** (no son costo de proyecto).
- Proyecciones o “forecast” **sin** documento aprobado.

### 1.2 `accrued_amount` (Devengado)

Monto ya convertido en **obligación real** (deuda devengada / reconocimiento del costo como hecho económico), independiente del pago.

**Incluye:**

| Origen | Condición típica |
|---|---|
| **PurchaseInvoice** (compra) | Registrada y en estado que reconoce la obligación: **`ISSUED`** / **`APPROVED`** (según política; excluir `DRAFT` no emitida) |
| **SubcontractCertification** | Típicamente **`APPROVED`** (genera o incrementa `Payable` según [BR-SUB-003]) |
| **Gastos / expenses** | Cargados como **cuenta por pagar** (obligación reconocida) |
| **Compra directa** | Factura compra **confirmada** sin OC previa ([D-006]) |

### 1.3 `paid_amount` (Pagado) — costo

Monto de costo **efectivamente salido de tesorería** (caja ejecutada) imputable al proyecto/ítem.

**Incluye:**

- **`Payment`** confirmado aplicado a `Payable` de compra/subcontrato/gasto.
- **`AccountMovement`** `OUTCOME` en estado `CONFIRMED`/`RECONCILED` **vinculado** a ese pago (ledger).

**No confundir** con `paid_amount` de una entidad `Payable` (campo de saldo): aquí “pagado” es la **capa de reporting de costo** agregada por período/proyecto.

### 1.4 `accrued_amount_linked_to_that_commitment`

Parte de `accrued_amount` que está **atada** al mismo compromiso (p. ej. factura con `po_id`, certificación/payable ligada al subcontrato). Se calcula por **vínculos explícitos** línea-documento, no por prorrateo arbitrario.

### 1.5 `open_committed_amount` (Comprometido abierto)

\[
\text{open\_committed\_amount} = \text{committed\_amount} - \text{accrued\_amount\_linked\_to\_that\_commitment}
\]

Interpretación: lo que **sigue vigente** como compromiso firme **sin** haberse aún devengado contra ese compromiso.

### 1.6 `expected_cost_exposure` / costo total esperado (reporting)

\[
\text{expected\_cost\_exposure} = \text{accrued\_amount} + \text{open\_committed\_amount}
\]

**Regla anti doble conteo ([BR-COS-002] / [D-065]):** **no** es válido usar \(\text{committed\_amount} + \text{accrued\_amount}\) cuando parte del devengado ya “consume” el compromiso (misma OC). La forma canónica es la suma anterior. **Prohibido** usar \(\max(\text{committed}, \text{received}, \text{accrued})\) como proxy de exposición.

### 1.7 Ejemplo numérico ([BR-COS-002])

OC aprobada/confirmada: **10.000**  
Factura registrada contra esa OC: **4.000**  
Pago realizado (caja): **2.000**

| Métrica | Valor |
|---|---:|
| `committed_amount` (total firme de la OC) | 10.000 |
| `accrued_amount` (reconocido vía factura) | 4.000 |
| `paid_amount` (tesorería) | 2.000 |
| `open_committed_amount` | 6.000 |
| `expected_cost_exposure` | **10.000** (= 4.000 + 6.000) |

**Incorrecto:** 10.000 + 4.000 = 14.000.

---

## 2. Tres mundos: costo vs caja vs proyección

| Vista | Pregunta que responde | Fuente principal |
|---|---|---|
| **Reporting de costo** (comprometido / devengado / esperado) | ¿Cuánto costó o costará la obra según documentos? | OC, subcontratos, facturas, payables |
| **Tesorería — cashflow real** | ¿Cuánto dinero **entró/salió** de cuentas? | `AccountMovement` confirmado |
| **Proyección de caja** | ¿Cuándo **falta pagar/cobrar** según vencimientos? | Saldos + `Receivable`/`Payable` con `due_date` (y reglas tenant) |

- **Devengado** alimenta **AP** y explica obligaciones; **no** es movimiento de caja hasta el pago.
- **Comprometido** puede existir **sin** AP (OC sin factura).
- **Proyección** (Fase 1): por defecto **AR/AP** futuras; **no** suma automáticamente OC abiertas salvo política explícita futura ([`CASHFLOW_PROJECTION.md`](../03-finance/CASHFLOW_PROJECTION.md)).

---

## 3. Costo directo real por ítem (composición)

\[
\text{CD}_{item} = \text{Mat} + \text{MO} + \text{Eq} + \text{Subc} + \text{Otros}
\]

Componentes imputados al ítem según la **vista activa** del toggle del reporte:

- **Comprometido / esperado:** usar `expected_cost_exposure` agregado por ítem cuando el reporte lo requiera, o capas separadas sin sumar doble.
- **Devengado:** obligaciones reconocidas imputadas al ítem.
- **Pagado:** pagos confirmados imputados al ítem.

### 3.1 Matriz partida × tipo de costo ([D-099])

El total por partida EDT (capas [D-021] / exposición [BR-COS-002]) se puede **partir** por `CostCategory` (MATERIAL | LABOR | EQUIPMENT | SUBCONTRACT | OTHER) sin cambiar las fórmulas:

\[
\text{layer}_{item} = \sum_{c \in CostCategory} \text{layer}_{item,c}
\]

- **Presupuesto por tipo:** suma de líneas APU (`CostAnalysisLine`) de esa categoría bajo la partida.
- **Actuals por tipo:** documentos tipados (`costType` en líneas de SC/OC/factura; subcontrato → SUBCONTRACT; consumo stock → MATERIAL). Si la línea no trae tipo ni insumo APU, se usa la categoría dominante del APU de la partida (≥ 60% del `totalCost`, o categoría única).
- **Filtro / export por tipo:** el recorte de un `CostCategory` recalcula `remaining = budget − exposure` de ese bucket. Venta, certificado y cantidades no se parten.
- **`open_committed` por tipo:** el devengado ligado (`accrued_linked`) descuenta el bucket **de la OC**, no el de la factura. Si una factura se retipa (OC en MAT, factura en LAB), el gasto va a LAB y el compromiso liberado sale de MAT; así los buckets siguen sumando el total de la partida en vez de duplicar exposición.
- Tipar **no** introduce un eje APU-línea como cost code ([D-057] / [D-068]).
- Forecast to Complete / EAC editable: fuera de v1 (ver [OPEN_QUESTIONS](../00-product/OPEN_QUESTIONS.md) Q-059).

---

## 4. Presupuesto vs real por ítem

\[
\text{Var}_{item} = \text{CostoPresupuestado}_{item} - \text{CostoReal}_{item}^{vista}
\]

Positivo = **ahorro**; negativo = **sobrecosto**. La vista debe etiquetarse: *comprometido abierto*, *devengado*, *pagado* o *exposición esperada* según [D-021].

**Precisión:** 2 decimales ARS.

### 4.1 Varianza unitaria en líneas de OC ([D-044] / [D-093])

Al enviar una OC, por cada línea con baseline APU (`budgetUnitCostSnapshot`):

\[
grossSubtotal = round(qty \times unitPrice)
\]
\[
descuento = round(grossSubtotal \times discountPct / 100)
\]
\[
\text{PUefectivo} = \frac{round(grossSubtotal - descuento)}{qty}
\]
\[
\text{variance\_pct} = \frac{\text{PUefectivo} - \text{budgetUnitCost}}{\text{budgetUnitCost}} \times 100
\]

(`unitPrice` es list net; el descuento % baja el PU efectivo comparado con el APU.)

Si la partida no tiene insumo MATERIAL comprable, el referencial es `CostItem.unitCostDirect` (costo dir. /u de la partida, incluye MO/equipos/subcontrato). `NO_BUDGET_BASELINE` aplica solo cuando ese costo también es 0 o no hay CostItem.

Tiers sobre **desvío con signo** (umbrales en `CompanyProcurementSettings`): ahorro (`variance_pct` &lt; soft, incluido negativo) = `NONE`; `NOTE_REQUIRED` entre soft y extra % de **sobrecosto**; `EXTRA_APPROVAL` ≥ extra % de sobrecosto; casos especiales `UNIT_MISMATCH` y `NO_BUDGET_BASELINE`. La justificación se pide cuando el PU **supera** el referencial, no cuando está por debajo.

---

## Referencias

- [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md) — dinero y separación de vistas
- [`../03-finance/CASHFLOW.md`](../03-finance/CASHFLOW.md) — solo caja ejecutada
- [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) — [BR-COS-001], [BR-COS-002], [BR-PUR-003]
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) — [D-021]
