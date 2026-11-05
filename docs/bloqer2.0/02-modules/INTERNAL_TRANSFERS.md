# Transferencias entre cuentas propias

## 1. Objetivo
Mover fondos entre **cuentas del mismo tenant** registrando **dos movimientos ligados** (`transfer_id`) con **fecha contable** y **fecha valor** independientes ([D-023]).

## 2. Usuarios y roles que lo usan
- **FINANCE**, **ADMIN**, **OWNER**.

## 3. Problema que resuelve
Doble registro inconsistente o pérdida de trazabilidad en movimientos entre bancos/cajas.

## 4. Datos que consume (inputs)
- Cuentas de la misma moneda, monto, fecha contable y fecha valor. La operación en moneda extranjera guarda su cotización manual en las dos piernas ([D-134], [D-137]).

## 5. Datos que produce (outputs)
- **InternalTransfer** + par de **AccountMovement**.

## 6. Entidades principales
- **InternalTransfer**, **AccountMovement** (×2).

## 7. Estados y transiciones
La transferencia se registra confirmada con sus dos movimientos. La anulación revierte el par en una sola transacción.

## 8. Acciones disponibles
- Registrar transferencia (genera los dos movimientos).
- Anular si periodo abierto.

## 9. Pantallas y vistas necesarias
- Punto de entrada: **Tesorería → Cuentas** → CTA **Transferir entre cuentas** (o desde el detalle de una cuenta con `?fromAccountId=`).
- Formulario `/tesoreria/transferencias/nueva` con ayuda: «Mueve plata entre cuentas de la empresa. Un pago a un proveedor no es una transferencia.»
- Historial del par OUT/IN: `/tesoreria/transferencias` (sin ítem de menú; link desde Cuentas).
- Extracto de cuenta: `/tesoreria/cuentas/[accountId]` (incluye las dos patas de la transferencia).
- El extracto usa fecha contable por defecto y permite consultar por fecha valor. Una transferencia histórica sin fecha valor conserva su fecha contable como referencia identificada. La conciliación usa fecha valor disponible y el cierre usa fecha contable.
- **No** aparecen en `/finanzas/transacciones` (ledger operativo con terceros, [D-048]).
- El método de liquidación «Transferencia» en un **Payment**/**Collection** ([D-074]) **no** es un `InternalTransfer`.

## 10. Reglas de negocio
- **BR-TRZ-004**: exactamente 2 movimientos por transferencia ([BR-TRZ-004]).
- No permitir misma cuenta origen/destino.

## 11. Validaciones
- Saldo suficiente en origen al **confirmar** (según política: disponible vs contable).

## 12. Fórmulas relacionadas
- Conversión FX si aplica: [`CURRENCY_CONVERSION_FORMULAS.md`](../04-formulas/CURRENCY_CONVERSION_FORMULAS.md).

## 13. Casos borde
- Las transferencias entre monedas diferentes quedan fuera del circuito actual. Su diseño requiere especificar ambos montos.

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
