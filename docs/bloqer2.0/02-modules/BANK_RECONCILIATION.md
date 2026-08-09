# Conciliación bancaria

## 1. Objetivo
Emparejar **movimientos internos** (`AccountMovement`) con **líneas de extracto bancario** para detectar diferencias, pendientes y fraudes operativos ([Q-007]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**.

## 3. Problema que resuelve
Saldos que no cuadran con banco real; cheques/pagos no acreditados.

## 4. Datos que consume (inputs)
- Extracto: **manual** en Fase 1 (carga línea a línea o CSV futuro).
- Movimientos `CONFIRMED` de la cuenta.

## 5. Datos que produce (outputs)
- **BankReconciliation** por periodo/cuenta.
- Movimientos pasan a `RECONCILED` cuando matchean.

## 6. Entidades principales
- **BankReconciliation**, líneas extracto (conceptual).

## 7. Estados y transiciones
**`BankReconciliation`** (sesión por cuenta/rango): `DRAFT` → `IN_PROGRESS` → `CLOSED` \| `CANCELLED` ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §24, [D-032]).  
- **`DRAFT`:** creada, sin trabajo de match consolidado.  
- **`IN_PROGRESS`:** operador empareja extracto vs movimientos.  
- **`CLOSED`:** sesión cerrada; **no** se editan matches manuales sin **reapertura formal** ([D-080]) o **nueva sesión**.
- **`CANCELLED`:** anulada sin efectos activos de sesión.

## 8. Acciones disponibles
- Importar extracto CSV ([D-076]) u OFX/QFX ([D-079]).
- Marcar parejas manualmente.
- Crear movimiento faltante desde línea de extracto sin match (`MANUAL_ADJUSTMENT` INFLOW/OUTFLOW + empareje automático).
- Desconciliar movimiento ([BR-TRZ-002]).
- **Reabrir** sesión `CLOSED` → `IN_PROGRESS` con motivo auditado ([D-080]).

## 9. Pantallas y vistas necesarias
- Vista dos columnas: extracto vs sistema.
- Resumen diferencias.
- **R-020:** tabla estado por cuenta/período en `/tesoreria/conciliacion` + export CSV `/api/reports/tesoreria/conciliacion.csv`.

## 10. Reglas de negocio
- Movimiento `RECONCILED` no editable sin desconciliar ([BR-TRZ-002]).
- Conciliación no altera `date_accounting` salvo proceso de corrección auditado.

## 11. Validaciones
- Saldo inicial + Σ extracto = saldo final declarado.

## 12. Fórmulas relacionadas
- Diferencia = saldo banco − saldo sistema a fecha valor ([`TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md)).

## 13. Casos borde
- Débitos bancarios no cargados en sistema: crear egreso desde conciliación.

## 14. Reportes relacionados
- Estado conciliación mensual por cuenta.

## 15. Relación con otros módulos
- **Tesorería**, **Cuentas bancarias**.

## 16. Permisos
Solo FINANCE/ADMIN.

## 17. Eventos disparados / consumidos
- `bank_reconciliation.started`, `bank_reconciliation.closed`, `bank_reconciliation.cancelled`; en ledger: `account_movement.reconciled` al confirmar match ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14e, [D-032]).

## 18. Fase de implementación
**Fase 1** manual — implementada ([D-075]): UI `/tesoreria/conciliacion`.  
**CSV** — implementado ([D-076]). **OFX/QFX** — implementado ([D-079]). **Reapertura formal** — implementada ([D-080]).  
**API bancaria directa** — **fuera de fases 0–5** ([`INTEGRATIONS_FUTURE.md`](../07-non-functional/INTEGRATIONS_FUTURE.md)); requiere partner/banco y no está en el scope de producto actual.

### Formato CSV ([D-076])
```
fecha;descripcion;monto;direccion;referencia
01/08/2026;Transferencia cliente;1500,50;CREDIT;TRX-1
02/08/2026;Pago proveedor;800,00;DEBIT;
```
También válido con `,` y encabezados en inglés (`date,description,amount,direction,reference`).

### Formato OFX ([D-079])
OFX 1.x / QFX (SGML): bloques `<STMTTRN>` con `DTPOSTED`, `TRNAMT` (signo), `NAME`/`MEMO`, `FITID` opcional.

## 19. Preguntas abiertas
- Ninguna operativa para conciliación Phase 1–2. API bancaria → integraciones futuras.
