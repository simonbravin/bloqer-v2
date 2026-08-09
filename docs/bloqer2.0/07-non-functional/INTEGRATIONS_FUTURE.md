# Integraciones futuras (fuera de Fase 1)

> Lista orientativa; **no** forma parte del alcance funcional inmediato.

## Fiscal / AFIP (Argentina)
- Facturación electrónica, consulta CAE, padrón.
- Requiere motor fiscal y homologación ([D-011] explícitamente manual hoy).

## Banca
- ~~Importación extractos OFX/CSV~~ → **en producto** ([D-076], [D-079]).
- **APIs bancarias / open banking / pagos masivos** — **fuera de fases 0–5**. Requiere partner, credenciales por banco y decisión de producto aparte; no bloquea cierre de Phase 3/4.

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
