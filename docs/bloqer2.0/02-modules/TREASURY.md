# Tesorería

## 1. Objetivo
Registrar **todo flujo de dinero** de la empresa en cuentas bancarias y caja mediante un **ledger unificado** (`AccountMovement`), exponiendo **cuatro vistas funcionales**: extracto por cuenta, ledger global, posición consolidada y flujo de fondos real + proyectado ([D-024]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**, **OWNER**; **PM** vista limitada por proyecto.

## 3. Problema que resuelve
Confundir banco, contabilidad y obligaciones pendientes; necesidad de ver **caja real** vs **proyección de liquidez** vs **costo comprometido/devengado** (este último definido en [`COST_FORMULAS.md`](../04-formulas/COST_FORMULAS.md), no en el ledger de tesorería).

## 4. Datos que consume (inputs)
- **Account** (banco/caja), movimientos desde **Collection**, **Payment**, **InternalTransfer**, cargas manuales.
- FX por movimiento ([D-008]).

## 5. Datos que produce (outputs)
- **AccountMovement** confirmados; saldos por cuenta y consolidados ARS.
- Proyección integrando AR/AP ([`../03-finance/CASHFLOW_PROJECTION.md`](../03-finance/CASHFLOW_PROJECTION.md)).

## 6. Entidades principales
- **Account**, **AccountMovement**, **InternalTransfer**, categorías movimiento.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § AccountMovement.

## 8. Acciones disponibles
- Registrar ingreso/egreso manual (DRAFT→CONFIRMED).
- Confirmar cobranzas/pagos que generan movimiento.
- Conciliar con extracto ([`BANK_RECONCILIATION.md`](./BANK_RECONCILIATION.md)).
- Transferencias internas con doble fecha ([D-023]).

## 9. Pantallas y vistas necesarias
- Extracto por cuenta (filtros fecha contable/valor).
- Ledger global filtrable.
- Posición consolidada multi-moneda.
- Flujo de fondos con toggle real/proyectado.

## 10. Reglas de negocio
- Ver [`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md).
- Periodo cerrado bloquea ([BR-TRZ-003]).

## 11. Validaciones
- Monto ≠ 0; moneda y FX obligatorios si ≠ ARS.
- Movimiento confirmado no editable ([BR-AUD-002]).

## 12. Fórmulas relacionadas
- [`../04-formulas/TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md), [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

## 13. Casos borde
- Cheques diferidos: fecha valor futura permitida en draft hasta acreditación.

## 14. Reportes relacionados
- Cashflow real (R-005), posición, libro mayor tesorería — **solo movimientos confirmados**; costo comprometido/devengado/exposición esperada en reportes operativos (R-001, R-009, …) según [BR-COS-001].

## 15. Relación con otros módulos
- **Cobranzas/Pagos**, **AR/AP**, **Cuentas bancarias**.

## 16. Permisos
FINANCE operativo; VIEWER lectura sin datos sensibles consolidados si política.

## 17. Eventos disparados / consumidos
- `account_movement.*`, `internal_transfer.*`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Integración extractos bancarios ([Q-007]).
