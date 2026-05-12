# Integraciones futuras (fuera de Fase 1)

> Lista orientativa; **no** forma parte del alcance funcional inmediato.

## Fiscal / AFIP (Argentina)
- Facturación electrónica, consulta CAE, padrón.
- Requiere motor fiscal y homologación ([D-011] explícitamente manual hoy).

## Banca
- Importación extractos OFX/CSV automática ([Q-007]).
- APIs bancarias / pagos masivos.

## BI / Data warehouse
- Réplica read-only hacia BigQuery/Snowflake.
- Semántica compartida con [`REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md).

## Mensajería
- Email transaccional avanzado, WhatsApp para cobranzas (política).

## ERP contable externo
- Exportación asientos resumen (no reemplazo de estudio contable).

## Firmas digitales
- Certificados obra / libro digital ([Q-005]).

## Priorización
Decidir con negocio según dolor: **banca import** y **e-invoice** suelen ir primero post-MVP producto.
