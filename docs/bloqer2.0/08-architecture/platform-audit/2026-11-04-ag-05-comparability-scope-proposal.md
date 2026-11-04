# AG-05 — Propuesta de comparabilidad y alcance pendiente

Estado: **aprobada por el Owner el 04/11/2026**, junto a las otras dos propuestas recomendadas. Formalizada en D-122. Autoriza su implementación y verificación, sin entidades nuevas.

## Moneda de EDT y costos y varianza de recursos

La lectura actual suma importes originales de documentos de distintas monedas contra el presupuesto elegido, sin convertirlos ni identificar una base comparable. `Budget` conserva moneda pero no un tipo de cambio contractual. D-008 exige moneda explícita; D-095 compara neto contra neto; D-120 ya impide mezclar monedas en el reporte de avances, pero no define este caso para todos los tableros.

Se propone conservar el presupuesto seleccionado como base en su moneda original e identificar esa moneda en pantalla y archivos. Si una fuente que contribuiría a la comparación contiene otra moneda, impedir el resultado económico con un mensaje que explique la incompatibilidad. No convertir con FX 1, no tomar un cambio actual y no excluir silenciosamente esos documentos dejando un total aparentemente completo. Los tableros de cantidades siguen disponibles si sus cantidades son comparables. El detalle de documentos puede conservar importes identificados con su propia moneda.

Alcance: EDT y costos, sus consumidores económicos y la varianza monetaria de Mano de obra/Equipos. Sin migraciones, backfill, nuevos campos persistidos ni cambios a importes históricos. Se agregan pruebas de moneda coincidente, moneda distinta y consulta limitada a una empresa/presupuesto. La consolidación a ARS con una base contractual completa queda para una definición posterior.

## RFIs y contratos formales

AG-00 registró que `Rfi`, `Contract`, `Addendum` legal y `ChangeOrder` formal no están implementados como entidades operativas. Q-057 mantiene diferidos los tres últimos. Q-006 deja pendiente el alcance/SLA de RFIs; los partes de obra y las adendas económicas no los sustituyen.

Se propone cerrar AG-05 sobre las capacidades implementadas de planificación, recursos, materiales y costos, manteniendo las RFIs como desarrollo posterior que requiere definición propia. Esto no resuelve Q-006 ni autoriza diseñar sus tablas, permisos, notificaciones o SLA durante una corrección de bugs. Se registra la brecha en el informe y se aclara el estado de implementación en la documentación del módulo.

## Motivo de la consulta

AGENTS.md §2 exige consultar las decisiones ambiguas y §5 exige aprobación antes de cambiar reglas financieras o agregar persistencia. Aprobar esta propuesta fija únicamente la comparabilidad anterior y el límite de la auditoría; no incorpora reglas de conversión ni un nuevo módulo.
