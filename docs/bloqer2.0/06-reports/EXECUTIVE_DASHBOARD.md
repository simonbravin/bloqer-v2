# Dashboard ejecutivo

## Audiencia
OWNER, ADMIN, FINANCE (vista completa); PM vista recortada a proyectos asignados.

## Widgets núcleo (Fase 1)
1. **Saldo de caja consolidado** (ARS) + por moneda.
2. **Runway** aproximado ([`DASHBOARD_KPI_FORMULAS.md`](../04-formulas/DASHBOARD_KPI_FORMULAS.md)).
3. **AR / AP vencidos** con enlaces a aging.
4. **Top 5 obras por desvío** presupuesto vs real.
5. **Certificado vs cobrado** (gap) por obra prioritaria.
6. **Próximos vencimientos** pagos 7 días.

## Fuentes de datos
- Tesorería + AR/AP + presupuesto + certificaciones.

## Permisos
Ocultar MN y KPIs sensibles según [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md).

## Fase
**Fase 1** layout base; drill-down avanzado **Fase 2**.

## Resumen para decidir — bloque 6 / F1 (2026-11-27)

En `/finanzas`, antes de los indicadores existentes, **Resumen para decidir** presenta **Por cobrar** y **Por pagar**, con grupos **Vencidos** y **Hoy y próximos 7 días**. Reutiliza los reportes de antigüedad AR/AP ya autorizados y cargados por el hub; no consulta otra fuente ni modifica obligaciones. El corte usa el mismo día calendario de producto para ambas fuentes. Hoy no es vencido y el extremo de siete días es inclusivo.

Cada grupo informa la cantidad completa y el saldo abierto por moneda después de pagos/créditos, y muestra los primeros cinco documentos ordenados por vencimiento, con desempate por ID. La lista limitada no recorta los totales. Cada entrada identifica contraparte, empresa, obra o ámbito corporativo, número de comprobante, vencimiento y enlace a la obligación. La selección de empresa limita el alcance; el contexto global se identifica como organización/todas las empresas. El acceso financiero conserva D-056/D-111 y los guards de AR/AP; abrir el documento vuelve a comprobarlo.

Una fuente deshabilitada/sin permiso no es saldo cero. No mezcla monedas, no interpreta deuda como caja, no incluye borradores y no recomienda ejecutar pagos. No es un pronóstico ni genera texto o decisiones mediante IA. Complementa los indicadores y la proyección existentes con documentos concretos para revisar. El rango mensual del gráfico no cambia este resumen actual.
