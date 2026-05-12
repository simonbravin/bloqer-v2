# Cuentas bancarias y cajas

## 1. Objetivo
Registrar cada **cuenta operativa** donde circula dinero: banco + CBU/CVU o **caja física**, moneda, estado y datos para conciliación ([D-024]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Sin maestro de cuentas no hay extractos ni saldos por entidad financiera.

## 4. Datos que consume (inputs)
- Catálogo **Bank**, moneda, CBU, alias CBU.
- Saldo inicial opcional al alta.

## 5. Datos que produce (outputs)
- **Account** tipo `BANK` | `CASH` | `WALLET`.
- Saldo calculado desde ledger (caché opcional).

## 6. Entidades principales
- **Account**.

## 7. Estados y transiciones
`ACTIVE` ↔ `INACTIVE` → `CLOSED` si saldo cero ([STATE_MACHINES § Account]).

## 8. Acciones disponibles
- Alta/edición cuenta.
- Marcar inactiva temporalmente.
- Cerrar cuenta (bloquea nuevos movimientos).

## 9. Pantallas y vistas necesarias
- Lista cuentas con saldo y moneda.
- Detalle extracto y configuración conciliación.

## 10. Reglas de negocio
- Una cuenta pertenece a un tenant; multi-empresa futura según [Q-001].
- Moneda de cuenta fija; transferencias entre monedas usan FX explícito.

## 11. Validaciones
- CBU 22 dígitos AR.
- Solo una cuenta “principal” opcional por moneda (recomendación UX).

## 12. Fórmulas relacionadas
- Saldo = Σ movimientos confirmados: [`../04-formulas/TREASURY_BALANCE_FORMULAS.md`](../04-formulas/TREASURY_BALANCE_FORMULAS.md).

## 13. Casos borde
- Cuenta compartida grupo económico: fuera de alcance Fase 1.

## 14. Reportes relacionados
- Posición por cuenta, cashflow por cuenta.

## 15. Relación con otros módulos
- **Tesorería**, **Conciliación**, **Pagos/Cobranzas**.

## 16. Permisos
Solo FINANCE/ADMIN crean cuentas.

## 17. Eventos disparados / consumidos
- `account.created`, `account.closed`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
_Vinculación multi razón social_ ([Q-001]).
