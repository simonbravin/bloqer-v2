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

**Regla anti doble conteo ([BR-COS-002]):** **no** es válido usar \(\text{committed\_amount} + \text{accrued\_amount}\) cuando parte del devengado ya “consume” el compromiso (misma OC). La forma canónica es la suma anterior.

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

---

## 4. Presupuesto vs real por ítem

\[
\text{Var}_{item} = \text{CostoPresupuestado}_{item} - \text{CostoReal}_{item}^{vista}
\]

Positivo = **ahorro**; negativo = **sobrecosto**. La vista debe etiquetarse: *comprometido abierto*, *devengado*, *pagado* o *exposición esperada* según [D-021].

**Precisión:** 2 decimales ARS.

### 4.1 Varianza unitaria en líneas de OC ([D-044])

Al enviar una OC, por cada línea con baseline APU (`budgetUnitCostSnapshot`):

\[
\text{variance\_pct} = \frac{\text{unitPrice} - \text{budgetUnitCost}}{\text{budgetUnitCost}} \times 100
\]

Tiers (umbrales en `CompanyProcurementSettings`): `NONE` &lt; soft %; `NOTE_REQUIRED` entre soft y extra %; `EXTRA_APPROVAL` ≥ extra %; casos especiales `UNIT_MISMATCH` y `NO_BUDGET_BASELINE`.

---

## Referencias

- [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md) — dinero y separación de vistas
- [`../03-finance/CASHFLOW.md`](../03-finance/CASHFLOW.md) — solo caja ejecutada
- [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) — [BR-COS-001], [BR-COS-002], [BR-PUR-003]
- [`../00-product/DECISION_LOG.md`](../00-product/DECISION_LOG.md) — [D-021]
