# Fórmulas — Avance físico, económico y financiero

> Ver [D-120](../00-product/DECISION_LOG.md): R-002 usa físico ponderado por costo directo, cobertura explícita y alcance vigente. Sus dimensiones conservan sus propias bases.

## Tres dimensiones ([D-003])

### Físico (obra ejecutada)
\[
P_{fis} = \frac{\text{Avance físico acumulado}}{\text{Alcance total físico planificado}} \times 100
\]
(Si el plan físico es 100% al finalizar obra; puede medirse por ítem.)

### Económico (certificado)
\[
P_{econ} = \frac{\sum MontosCertificadosAcum}{PresupuestoVentaTotal} \times 100
\]

### Financiero (cobrado)
\[
P_{fin} = \frac{\sum CobranzasAcum}{FacturaciónTotalEmitida} \times 100
\]
(Variante: denominador = presupuesto venta si se desea “cobrado vs previsto”.)

El numerador debe alimentarse de **cobranzas reales** (`Collection` / movimientos de tesorería aplicados a AR), no del `status` de `Certification` ni de un estado “pagado” de certificación ([BR-CERT-PAYMENT-001]).

## Ejemplo numérico coherente con desfasajes

| Métrica | % |
|---|---:|
| Físico real | 35% |
| Económico certificado | 37% |
| Financiero cobrado (vs facturado) | 60% del facturado |

Interpretación: se certificó más que el físico (acopio/mediciones); se cobró parcialmente respecto a lo facturado.

## R-002 — Alcance, fechas y precisión (D-120)

Las fórmulas siguientes se calculan en servidor. `dateTo` es el **corte**; si no se informa, se usa hoy en **America/Argentina/Buenos_Aires** y no admite una fecha futura. `dateFrom` es el inicio del **período de movimientos**, debe ser anterior o igual al corte y no reinicia los acumulados. Un corte de ejecución usa la fecha del parte y su estado **actual** `APPROVED`, no la fecha de aprobación; no reconstruye estados históricos. Las curvas se describen como ejecución al corte con documentos actualmente vigentes.

**Límite técnico de visualización:** la ventana `dateFrom`–`dateTo` admite hasta **120 meses calendario**, contando los meses inicial y final. El límite acota los puntos de evolución generados; no recorta el acumulado desde el inicio ni elimina el saldo anterior al período.

El alcance `I` contiene las partidas hoja de los presupuestos vigentes `APPROVED`/`CLOSED` seleccionados: por defecto principal y adendas, según D-116. Un filtro de presupuesto recorta todos los numeradores y denominadores al mismo alcance. No sumar nodos padre además de sus hojas. Si se usa el plan vigente para fechas pasadas, identificarlo como **referencia del plan actual**; no equivale a una línea base originalmente aprobada en cada fecha.

**Precisión común:** cantidades y porcentajes a **4 dp half-up**; UI puede presentar 2 dp. Dinero a **2 dp half-up** con `roundMoney`/`serializeMoney`, FX 6 dp (D-053). Mantener operaciones decimales durante los agregados; redondear al serializar el resultado, no los pesos intermedios. R-002 trabaja en la moneda original seleccionada de presupuestos y documentos, sin sumar monedas ni convertir bases sin FX trazable. ARS es una moneda seleccionable cuando la base está expresada en ARS, no una conversión automática de presupuestos extranjeros. Una fuente en moneda distinta se advierte y deja la sección afectada incompleta/no calculable.

### Físico reconocido de una partida

**Propósito:** identificar la ejecución observada con evidencia aprobada, sin confundir ausencia de medición con cero ejecutado.

**Variables:**
- `q_i`: cantidad contractual de la partida (decimal, unidad propia).
- `a_i(t)`: cantidad ejecutada de partes actualmente aprobados con fecha de ejecución ≤ `t`.
- `d_ij`: porcentaje físico incremental informado en la línea aprobada `j` de la partida `i`.
- `p_i(t)`: porcentaje físico reconocido de la partida, o no calculable.
- `has_measurement_i(t)`: existe medición aprobada de la partida al corte; un cero explícito cuenta como medición.
- `valid_i(t)`: la fuente no presenta ambigüedad legacy, base ausente ni valores fuera del alcance físico 0–100.

**Expresión:**

```text
Si no existe medición: p_i = no calculable (sin medición).
Si se informó porcentaje físico aprobado: p_i = suma(d_ij) hasta t.
Si nunca se informó porcentaje físico aprobado y q_i > 0: p_i = a_i(t) / q_i × 100.
Si no hay porcentaje y q_i <= 0: p_i = no calculable (sin base).
```

Se conserva D-045: porcentajes explícitos y cantidades son fuentes alternativas de lectura, no se suman entre sí. Las cantidades siguen disponibles en su propia columna aunque se use porcentaje. El Real sincronizado del cronograma no se agrega de nuevo al libro.

**Ejemplo numérico:** cantidad contractual 100 m²; dos partes aprobados de 12% y 18% → `p_i = 30,0000%`. Si nunca se informó porcentaje y la cantidad aprobada es 30 m² → también `30,0000%`. Un parte enviado todavía no contribuye.

**Casos borde:**
- `physicalPct` informado en partes anteriores a **2026-06-01**: semántica ambigua (Q-005b/D-120), aunque la suma sea menor que 100. Mostrar evidencia y advertencia; no tratar ese porcentaje como validado ni cambiar datos. Esto no modifica el clamp vigente del sync de cronograma.
- Acumulado fuera de 0–100 o cantidades incompatibles con el alcance: advertir y conservar el valor fuente visible; no validarlo ni ocultarlo mediante un tope gráfico.
- Partes borrador/enviados/devueltos: no suman físico reconocido; los enviados pueden aparecer como pendientes de aprobación.
- Falta de permiso para una fuente: no equivale a cero; no devolver su detalle ni deducirlo en archivos.

**Usado en:** R-002, [Libro de obra](../02-modules/JOBSITE_LOG.md), [Cronograma](../02-modules/PROJECT_SCHEDULING.md).

### Físico global observado y cobertura

**Propósito:** agregar partidas de distintas unidades con un peso explícito, mostrando qué parte del alcance tiene evidencia válida.

**Variables:**
- `c_i`: costo directo presupuestado total de la partida hoja `i` en moneda comparable (decimal).
- `I+`: partidas del alcance `I` con `c_i > 0`.
- `V(t)`: partidas de `I+` con medición física calculable y válida al corte.
- `C = suma(c_i para i en I+)`: base completa únicamente cuando todos los costos del alcance son conocidos y comparables; las partidas sin medición conservan su costo en esta base. Si falta el costo de alguna partida, `C` es desconocido, no el subtotal de las partidas que sí tienen costo.
- `P_observed(t)`: contribución física válida observada sobre el alcance total, porcentaje.
- `coverage_weighted(t)`: proporción de la base con fuente física válida.
- `P_validated(t)`: físico global validado, nullable.

**Expresión:**

```text
Si C es completo/conocido y C > 0:
  P_observed(t) = suma(c_i × p_i(t) para i en V(t)) / C
  coverage_weighted(t) = suma(c_i para i en V(t)) / C × 100
Si C <= 0 o C es desconocido/no comparable: ambos son no calculables.

P_validated(t) = P_observed(t) solamente si todas las partidas con peso
tienen evidencia válida, no hay fuente legacy/anómala en ninguna partida del alcance
y la base es completa/comparable; de lo contrario, no calculable.
```

`p_i` está expresado en 0–100, por eso la primera fórmula no vuelve a multiplicar por 100. Si no existe ninguna medición válida en todo el alcance (`coveredCount = 0`), `P_observed` es **no calculable**, no cero inferido. Una medición válida explícita de cero sí puede producir 0% observado. No dividir el numerador solo por el costo de las partidas medidas: eso borraría el alcance pendiente de medir. Presentar el porcentaje parcial como **avance observado**, nunca como global final validado. Informar también cantidad total de partidas, medidas, sin medición, con fuente ambigua y sin peso; los conteos incluyen las partidas de costo cero.

**Ejemplo numérico:** A cuesta 60.000 y tiene 50% físico; B cuesta 40.000 y no tiene medición. `C = 100.000`, `P_observed = 30,0000%`, cobertura = `60,0000%`, global validado = no calculable. No mostrar 50% global ni afirmar que B tiene 0% validado. Si B registra explícitamente 0%, cobertura = 100% y el global validado es 30%.

**Casos borde:**
- `c_i = 0`: no aporta peso, pero se muestra la partida y la advertencia; no ocultarla en conteos/cobertura.
- Base de costo ausente, negativa o moneda no comparable en alguna partida: no excluirla silenciosamente ni dividir por el subtotal conocido. Global validado, observado y cobertura ponderada son no calculables porque se desconoce `C`; los conteos y la evidencia por partida siguen disponibles. Esta regla también se aplica al plan ponderado.
- Fuentes legacy/anómalas: no forman parte del numerador validado; conservan el peso en la base y se informa cobertura incompleta. Impiden el global validado incluso si pertenecen a una partida de costo cero; el mero costo cero sin anomalía no lo impide.
- Todos los costos son cero o no hay partidas: porcentajes no calculables, no 0% ni 100%.
- El avance observado no demuestra el progreso de la parte del alcance sin evidencia.

**Usado en:** [R-002](../06-reports/OPERATIONAL_REPORTS.md#r-002--avance-del-proyecto-d-120).

### Referencia del plan actual comparable con físico

**Propósito:** comparar físico y plan sobre las mismas partidas y pesos, sin confundir duración con costo.

**Variables:** `c_i`, `I+` y `C` como arriba; `s_i`/`e_i` son las fechas vigentes de la tarea que representa inequívocamente a la partida; `r_i(t)` es su referencia temporal lineal.

**Expresión:**

```text
r_i(t) = 0, si t < s_i
r_i(t) = 100, si t >= e_i
r_i(t) = (t - s_i) / (e_i - s_i) × 100, en el intervalo con duración positiva
P_plan_observed(t) = suma(c_i × r_i(t) de partidas con vínculo/fechas válidos) / C
coverage_plan(t) = suma(c_i de esas partidas) / C × 100
```

La referencia es calculable como global solo si la cobertura de vínculos y fechas es completa sobre el mismo alcance. Sin vínculo primario inequívoco a tarea, fechas válidas o base comparable, mostrar cobertura/falta de referencia; no inventar fechas ni promediar varias tareas sin una regla aprobada. Las fechas de contenedores o un hito de recepción no prueban ejecución física. Para fechas de inicio y fin coincidentes, la referencia vale 0 antes de la fecha y 100 desde esa fecha.

**Precisión decimal:** porcentajes 4 dp half-up (UI 2); fechas se comparan como días de ejecución, sin introducir calendario laboral avanzado.

**Ejemplo numérico:** A pesa 60% y tiene plan 50%; B pesa 40% y tiene plan 25% → plan comparable = 40%. Si el físico validado es 30%, diferencia físico menos plan = −10 puntos porcentuales. No calcular ese desvío si alguna base o cobertura es incompleta.

**Casos borde:** plan actual editado después de la ejecución → etiquetar referencia vigente; no reconstruir una baseline histórica. No usar el KPI general del cronograma ponderado por duración como sustituto de esta referencia. No derivar fecha estimada de finalización, SPI/EAC ni forecasting nuevos (Q-059).

**Usado en:** R-002; no cambia la semántica del cronograma existente.

### Pendientes y dimensiones comerciales/de costo

**Propósito:** explicar acciones pendientes con las fuentes y bases existentes.

- Cantidad por ejecutar se conserva por partida/unidad. Sin medición válida, el saldo físico no se presenta como confirmado.
- Ejecución pendiente de certificar reutiliza la sugerencia de [CERTIFICATION_FORMULAS](./CERTIFICATION_FORMULAS.md), descontando **todas** las cantidades actualmente emitidas/aprobadas, incluso posteriores al corte, y respetando el techo D-119. Es una sugerencia operativa revisable; los indicadores históricos de certificado acumulado conservan su corte. No es un derecho automático de cobro.
- Certificado sobre venta usa acumulados de `ISSUED`/`APPROVED`; el físico declarado en certificados no reemplaza el físico del libro. Mostrar físico y económico de la certificación separados.
- Cobrado sobre facturado conserva el denominador de D-003. El saldo abierto/vencido viene de CxC y aplicaciones reales, incluyendo las reglas vigentes de notas; no inferirlo del estado del certificado ni restar bases fiscales distintas.
- Ventas directas sin vínculo con el presupuesto no integran el ratio comercial contractual; mostrar advertencia y acceso a su operación, sin prorratearlas entre partidas.
- Consumo del presupuesto usa devengado/costo presupuestado o exposición/costo presupuestado, con etiqueta explícita. Presupuesto menos exposición es disponibilidad presupuestaria; no es costo necesario para terminar ni EAC. Fórmulas en [COST_FORMULAS](./COST_FORMULAS.md).
- Para conservar D-065, el compromiso abierto se resuelve por el compromiso documental explícito (línea de OC/subcontrato) antes de agregar por partida; el devengado ligado a una OC no consume otra obligación de la misma partida. Una NC de proveedor sin vínculo directo a OC puede seguir `referencedSupplierInvoiceId`: revierte el devengado ligado únicamente cuando el padre y su compromiso son inequívocos y coinciden en tenant, empresa, obra y moneda. Si esa trazabilidad falta o tiene varios compromisos candidatos, conservar el devengado imputado pero presentar exposición no calculable con advertencia; no inventar un prorrateo de la nota. Esto aplica D-065/D-115 sin crear una nueva fuente financiera.
- Denominador cero → no calculable. No limitar porcentajes de costo al 100%: un exceso debe quedar visible. El período y el acumulado se presentan por separado, con moneda, corte, base y fuente.
- El bloque **Real · cronograma completo actual** y sus tareas/pendientes usa situación actual de toda la obra; no pretende reconstruir el pasado ni se recorta por presupuesto. Se etiqueta explícitamente. El plan comparable ponderado del gráfico sí comparte alcance y corte con el físico.

## Referencias
- [`PROFITABILITY_FORMULAS.md`](./PROFITABILITY_FORMULAS.md)
