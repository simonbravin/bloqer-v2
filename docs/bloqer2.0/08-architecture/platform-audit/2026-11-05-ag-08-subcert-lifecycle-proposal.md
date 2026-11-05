# AG-08 — Estado previo a la aprobación del certificado de subcontrato

**Estado: aprobada por el Owner el 05/11/2026; formalizada en D-131.** Q-078 resuelta. Se conserva ISSUED y el circuito vigente, sin migrar históricos; armonización y verificación en AG-08.

## Contradicción comprobada

STATE_MACHINES §19, BR-SUB-003 y D-028 nombran `SUBMITTED`. El enum persistido, los servicios y la interfaz usan `ISSUED`: Borrador → Emitido → Aprobado o Rechazado. El rechazo es terminal y se corrige mediante un certificado nuevo vinculado, conforme D-033.

D-089, posterior a D-028, ya define el circuito financiero vigente: aprobar genera una factura AP en borrador; emitir esa factura genera CxP; después se paga. Conservar ese circuito aplica una decisión existente, sin pedir aprobarla de nuevo ni crear deuda al emitir el certificado.

## Propuesta recomendada

- Formalizar el estado real `ISSUED` y la acción visible **Emitir** como paso de revisión previo a aprobar/rechazar; armonizar el catálogo de estados, reglas, entidades y eventos documentados con los identificadores existentes. No incorporar un evento ejecutable o una notificación nueva.
- Mantener los controles actuales y corregir sus bugs: acceso, topes, reintentos, rechazo/reemplazo, anulación y auditoría atómicos. Conservar todos los documentos y estados históricos.
- Precisar la lectura de D-028 con D-089: `ISSUED` no crea una obligación; `APPROVED` habilita/crea la factura AP borrador y solo su emisión crea el Payable. Sin campos, migración, dependencia o permiso nuevo.

## Alternativa

Diseñar una migración de `ISSUED` a `SUBMITTED` y sus consumidores. Implica cambiar estados persistidos, identificadores y documentos existentes; no se recomienda hacerlo para resolver una diferencia documental dentro de este lote correctivo.

## Verificación prevista

Transiciones permitidas/denegadas, aprobación concurrente única, topes revalidados, factura AP borrador única sin Payable prematuro, emisión de factura y liquidación derivada conforme D-027/D-115, anulación/reemplazo, rollback de auditoría y scope de empresa/obra. Guía y ayuda reflejan las acciones reales.
