# Transferencias entre cuentas propias

## 1. Objetivo
Mover fondos entre **cuentas del mismo tenant** registrando **dos movimientos ligados** (`transfer_id`) con **fecha contable** y **fecha valor** independientes ([D-023]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Doble registro inconsistente o pérdida de trazabilidad en movimientos entre bancos/cajas.

## 4. Datos que consume (inputs)
- Cuenta origen y destino, montos, monedas, FX si cruzan moneda.

## 5. Datos que produce (outputs)
- **InternalTransfer** + par de **AccountMovement**.

## 6. Entidades principales
- **InternalTransfer**, **AccountMovement** (×2).

## 7. Estados y transiciones
Borrador opcional → confirmado → anulado (revierte par).

## 8. Acciones disponibles
- Crear transferencia.
- Confirmar (genera movimientos).
- Anular si periodo abierto.

## 9. Pantallas y vistas necesarias
- Formulario transferencia con vista previa de impacto en ambas cuentas.
- Lista transferencias filtrable (`/tesoreria/transferencias`) — **canónica** para crear/consultar pares OUT/IN.
- Extracto de cuenta: `/tesoreria/reportes/movimientos` (puede incluir/excluir internas).
- **No** aparecen en `/finanzas/transacciones` (ledger operativo con terceros).

## 10. Reglas de negocio
- **BR-TRZ-004**: exactamente 2 movimientos por transferencia ([BR-TRZ-004]).
- No permitir misma cuenta origen/destino.

## 11. Validaciones
- Saldo suficiente en origen al **confirmar** (según política: disponible vs contable).

## 12. Fórmulas relacionadas
- Conversión FX si aplica: [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

## 13. Casos borde
- Transferencia USD→ARS con distinto FX compra/venta: registrar dos montos explícitos.

## 14. Reportes relacionados
- Flujo de fondos interno, conciliación por cuenta.

## 15. Relación con otros módulos
- **Tesorería**, **Cuentas bancarias**.

## 16. Permisos
FINANCE; ADMIN override.

## 17. Eventos disparados / consumidos
- `internal_transfer.created`, `internal_transfer.cancelled`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
_No críticas._
