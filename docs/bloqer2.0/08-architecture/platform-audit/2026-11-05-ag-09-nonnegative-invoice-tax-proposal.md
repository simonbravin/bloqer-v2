# AG-09 — IVA y percepción IIBB no negativos en facturas y notas

**Estado: APROBADA por el Owner el 05/11/2026**, opción «Rechazar negativos, sin alterar históricos». Formalizada en [D-133](../../00-product/DECISION_LOG.md) y [Q-080](../../00-product/OPEN_QUESTIONS.md). La verificación de su implementación se registra por separado en AG-09.

## Evidencia

Los contratos AR/AP aceptan una alícuota de IVA o percepción IIBB negativa porque usan `ratePctString` sin restricción de signo. Una factura A de neto 100 con IVA −10 puede reducir su total a 90; una percepción negativa hace lo mismo. La UI ofrece impuestos positivos, pero una llamada directa puede evitarlo.

BR-TAX-002 distingue alícuota de signo de percepción/retención y BR-TAX-003 separa retenciones del total facturado. D-115 representa las reducciones mediante NC de importe positivo y aplicación de crédito. Las fuentes no expresan el límite de signo de estos campos de factura con suficiente precisión para decidirlo automáticamente.

## Propuesta recomendada

1. Rechazar alícuotas **negativas** de IVA de línea y de percepción IIBB de cabecera en las nuevas altas/ediciones AR/AP, incluidas NC/ND y composiciones de venta/gasto con caja inmediata.
2. Rechazar un ajuste explícito negativo de importe de percepción. Cero sigue permitido; no agregar un máximo de 100 ni un nuevo cálculo fiscal.
3. Mantener NC/ND de importes positivos, con su efecto ya definido por el tipo de documento. Las retenciones conservan su circuito documentado y no se simulan mediante IVA/percepción negativos.
4. No migrar ni recalcular documentos históricos emitidos, pagos, créditos ni movimientos. Un borrador con valores negativos deberá corregirse antes de una nueva emisión.
5. Validación en el service layer y schemas, mensajes funcionales, pruebas de llamadas directas y revisión de Guía/Ayuda/AI en el mismo lote. Sin nuevos campos, dependencias o enums.

## Alternativa

Permitir impuestos negativos requiere definir su autorización, finalidad y efecto contable antes de habilitarlos como operación soportada. No se propone inferir ese circuito desde un campo de alícuota.
