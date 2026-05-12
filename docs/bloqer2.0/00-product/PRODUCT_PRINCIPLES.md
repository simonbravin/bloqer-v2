# Product Principles — Bloqer 2.0

> Principios rectores del diseño funcional. Cuando dos opciones de diseño compiten, gana la que mejor cumple estos principios.

---

## 1. Simpleza operativa antes que potencia

Si una funcionalidad agrega potencia pero se la usa solo el 10% del tiempo y complica al otro 90%, **no entra como camino principal**. Debe quedar oculta detrás de "modo avanzado" o no entrar.

**Ejemplo aplicado:** la matriz de permisos es solo `ver / crear-editar / aprobar` por módulo. No hay permisos a nivel campo, aunque algunos ERPs lo tengan.

---

## 2. Datos conectados, no islas

Toda entidad importante (factura, OC, certificación, pago, movimiento de stock) **conoce su origen y su destino**.

- Una factura sabe qué OC y qué recepción la originaron.
- Una OC sabe qué proyecto y qué ítems del WBS afecta.
- Un pago sabe qué facturas cancela.
- Un movimiento de stock sabe qué OC o qué obra lo originó.

Una entidad que no se conecta es una entidad que no debería existir.

---

## 3. Trazabilidad legal sobre comodidad

Un comprobante con valor legal (OC, certificado, factura, recibo, orden de pago) **nunca se edita ni se borra**. Se anula y se emite uno nuevo.

- Estados terminales que en modelo se expresan como `CONFIRMED`, `ISSUED` (según entidad; en UI: *Confirmado*, *Emitido*) bloquean edición.
- Toda anulación queda registrada con motivo y autor.
- El histórico siempre se puede reconstruir.

---

## 4. Multitenancy es ley

`tenant_id` es la primera columna de toda tabla operativa. Cualquier query que la omita es **incorrecta por defecto**. Esto se aplica desde el día 1, no se "agrega después".

---

## 5. El dinero es sagrado

- Nunca `float`. Siempre `decimal` con precisión documentada.
- Toda operación en moneda extranjera tiene FX explícito al momento de la operación.
- Los reportes consolidan en ARS, pero el origen siempre se conserva.
- Los saldos se calculan, no se almacenan (excepto cachés explícitos).

Ver [`03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md).

---

## 6. Tres dimensiones de avance, no una

El avance de obra es **multi-dimensional**:

- **Físico**: cuánto se construyó (medible).
- **Económico**: cuánto se certificó al cliente.
- **Financiero**: cuánto se cobró del cliente.

Las tres se reportan **independientemente**. Confundirlas oculta problemas reales (obra avanzada y poco cobrada = riesgo financiero).

---

## 7. Comprometido, devengado y pagado — capas explícitas

El costo “real” del proyecto se reporta en **capas canónicas** ([`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), [BR-COS-001], [D-021]):

- **Comprometido** (`committed_amount`): compromisos firmes (OC aprobada/confirmada, subcontrato activo, etc.).
- **Devengado** (`accrued_amount`): obligación reconocida (AP / facturas / certificaciones que generan deuda).
- **Pagado** (`paid_amount`): caja ejecutada imputable al costo.
- **Exposición esperada:** `accrued_amount + open_committed_amount` — **sin** sumar committed+accrued en doble conteo ([BR-COS-002]).

**Cashflow real** y **proyección de caja** miden **liquidez**, no sustituyen estas capas de costo.

---

## 8. Estados explícitos, transiciones formales

Cada entidad importante tiene una **máquina de estados** documentada en [`01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md). No hay estados "implícitos" deducidos por una combinación de booleans.

**Ejemplo:** una certificación tiene `status` en `DRAFT | ISSUED | APPROVED | REJECTED | CANCELLED` (labels es-AR acordes). El **cobro** se ve en **`payment_status` derivado** desde facturas/AR/cobranzas (`UNPAID` … `PAID` / `OVERDUE`), no como estado de ciclo documental ([BR-CERT-PAYMENT-001]).

---

## 9. Lo que se cierra, se cierra

- Un presupuesto **cerrado** solo amplía el contractual vía **adenda**; en el mismo documento solo admite **metadata whitelist** ([D-030], [BR-BUD-008]).
- Un periodo **cerrado** no permite editar movimientos.
- Una certificación **emitida** no se modifica.

Editar el pasado es tentador y corrompe los datos. Bloqer prefiere generar un "movimiento de ajuste" antes que reescribir.

---

## 10. Una empresa, dos flujos comerciales

Bloqer soporta:

- **Flujo certificación → cobranza** (obra pública o privada con contrato extenso).
- **Flujo venta directa** (obras chicas o servicios sin certificación).

Ambos conviven sin que el usuario tenga que elegir uno solo.

---

## 11. Carga manual como ciudadana de primera clase

No todo nace de otro flujo. Bloqer permite:

- Cargar AR/AP manuales (ej: "le debo a la fotocopiadora").
- Registrar movimientos de tesorería sin contraparte previa.
- Cargar impuestos como % o monto sin motor fiscal automático.
- Crear contactos sin que tengan que estar en una compra o venta.

Cada carga manual queda igualmente trazada.

---

## 12. Reportes son producto, no plomería

Los reportes no son un "extra técnico". Son **el resultado tangible del producto** para el director.

- Cada reporte tiene dueño funcional, no solo técnico.
- Cada reporte se puede exportar a XLSX y PDF.
- Filtros por rango de fecha, por proyecto, por moneda son estándar.
- Hay un **query builder** para reportes que el equipo no anticipó.

---

## 13. Auditoría no es opcional

Toda acción que crea, modifica, anula o aprueba algo queda registrada con: **quién**, **cuándo**, **qué cambió**, **desde qué IP / sesión**. Esto es inherente, no un módulo aparte.

---

## 14. Idiomas y monedas son configuración, no asunción

- ARS es la moneda base por defecto, pero el modelo soporta otras.
- UI en español (es-AR) por defecto. Estructura preparada para i18n futura.
- **Enums, estados, entidades y claves técnicas en inglés**; español solo en copy visible y en esta especificación funcional. Ver [`AGENTS.md`](../AGENTS.md#3-canonical-naming-and-language-rules) §3 y [`GLOSSARY.md`](./GLOSSARY.md#canonical-naming-and-language-rules).
- Formato de fechas, números, decimales: configurable a nivel tenant.

---

## 15. Ningún módulo es indispensable, todos son combinables

Una empresa pequeña puede usar solo **directorio + proyectos + presupuestos + certificaciones + tesorería** y vivir feliz.

Una empresa grande puede activar todo: subcontratos, change orders, RFIs, libro de obra, conciliación, etc.

El producto **no obliga** a usar todo, pero todo **encaja** si lo activás.

---

## 16. La especificación funcional manda

Si esta carpeta dice algo y el código dice otra cosa: el código está mal.  
Si la especificación es ambigua: se actualiza la especificación, después el código.

Esta carpeta es la **fuente de verdad funcional** de Bloqer 2.0.
