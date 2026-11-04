# AG-06 — Referencias de compra en monedas distintas

Estado: **aprobada explícitamente por el Owner el 04/11/2026**, formalizada en D-125; Q-072 resuelta. Autoriza la implementación y verificación descritas, sin cambios históricos.

## Problema confirmado

`procurement-budget-baseline.ts` devuelve el precio original del APU sin su moneda. `purchase-variance-pure.ts` lo compara con el precio de la OC/cotización como si fueran comparables. Una referencia de USD 10 frente a una compra de ARS 12.000 puede producir un porcentaje y una aprobación incorrectos. El saldo de partida también puede sumar OC originales de varias monedas. D-008 exige moneda explícita; D-122 resolvió las lecturas de planificación, pero no define esta política de compra.

## Alternativa recomendada

Conservar la compra en su moneda y con su FX documentado. Mantener los umbrales de aprobación en ARS, calculados con el FX de la compra según las reglas existentes.

Para el referencial, transmitir la moneda del presupuesto por línea y comparar precios únicamente cuando referencia y compra tengan la misma moneda y unidad compatible. Cuando hay un precio efectivo positivo y las monedas difieren o falta una moneda demostrable, el desvío porcentual es no calculable y se usa el tier existente **NO_BUDGET_BASELINE**, con la justificación ya exigida para ese tier. Esta comprobación monetaria precede a la excepción de partida global; no se afirma que un precio sea barato/caro mediante números de monedas distintas. Una línea bonificada/cero conserva su tratamiento existente, sin introducir una justificación monetaria nueva.

No se fuerza aprobación de alto nivel solo por esa incompatibilidad: siguen aplicándose el umbral ARS y las reglas vigentes. La UI explica las dos monedas y el motivo; no cambia el precio para eludir el control.

Si el saldo monetario de una partida requiere sumar compromisos de otra moneda, ese saldo se muestra no calculable con aviso. Se conservan presupuesto, cantidades y documentos con su moneda explícita; no se muestra un subtotal como saldo completo. No se inventa FX del presupuesto ni se toma una cotización actual.

Alcance: referencia APU/WBS, snapshots comparables de nuevas operaciones, desvío de OC y su presentación en SC/cotizaciones/OC y saldo de partida. No cambia la cantidad mínima de ofertas, la clasificación D-118, los importes de documentos procesados, pagos o existencias. Sin campos persistidos nuevos, estados, dependencias, migraciones o backfill.

## Otras alternativas

- Bloquear la compra cuando las monedas difieran: evita la comparación, pero impide compras legítimas en USD sobre presupuestos en ARS.
- Definir una conversión completa del presupuesto: requiere fijar origen, fecha y trazabilidad del FX presupuestario; ese contrato todavía no existe y requiere diseño propio.

## Verificación prevista

Moneda coincidente, compra/referencia distintas, importe bonificado, partida global, unidades incompatibles, saldo con compromisos mixtos, documentos de otro alcance y controles ARS existentes. DTO/UI/ayuda deben explicar el resultado no calculable; no se recalculan históricos.

La definición requiere aprobación por AGENTS.md §§2 y 5: extender la semántica de un tier financiero y el contrato de comparabilidad no se infiere de una autorización genérica para corregir bugs.
