# Inventario

## 1. Objetivo
Controlar **existencias por depósito**, movimientos (ingreso/egreso/ajuste/transferencia), valuación **FIFO** o **promedio móvil** según empresa ([D-007]), y vínculo con compras y consumo por obra ([D-022]).

## 2. Usuarios y roles que lo usan
- **WAREHOUSE**, **PROCUREMENT**, **PM** (solicitudes), **ADMIN**.

## 3. Problema que resuelve
Fugas de materiales, compras duplicadas y costos de obra mal imputados.

## 4. Datos que consume (inputs)
- **Product**, **Warehouse**, movimientos originados en **Receipt**, **PurchaseInvoice** (ajustes), consumo obra (egreso).
- Método valuación por empresa o depósito ([Q-018]).

## 5. Datos que produce (outputs)
- **StockMovement** y saldos por (producto, depósito).
- Valorización de stock para reportes.
- **StockReservation** opcional ([Q-019]).

## 6. Entidades principales
- **Product**, **StockMovement**, **StockReservation**, **Warehouse**.

## 7. Estados y transiciones
**`StockMovement`:** `DRAFT` → `CONFIRMED` (impacta stock); anulación de confirmado solo vía `CANCELLED` con **reversión compensatoria** o regla explícita ([BR-INV-007], [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §9).

**`StockReservation`:** `ACTIVE` \| `PARTIALLY_RELEASED` \| `RELEASED` \| `CONSUMED` \| `CANCELLED` ([`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §25, [D-034]). Reserva **resta disponible**, no “stock físico” hasta consumo; **`CONSUMED`** exige vínculo a **`StockMovement`** ([BR-INV-006], [BR-INV-008]).

## 8. Acciones disponibles
- Alta/edición producto.
- Ingreso manual, egreso a obra, ajuste por inventario físico.
- Transferencia entre depósitos (par de movimientos [BR-INV-003]).
- Reservar stock para proyecto ([Q-019]).

**Implementación vigente (AG-07):** alta/edición de catálogos, consulta de existencias/historial, recepción vinculada a OC, consumo manual/en parte aprobado y transferencia confirmada/anulación. Reservas y motor FIFO/promedio siguen diferidos por D-083. No hay alta general de ingreso/ajuste manual expuesta; las acciones conceptuales anteriores no son instrucciones de pantalla. Los ajustes históricos sin dirección definida quedan señalados y excluidos del saldo físico, sin inferir un signo.

## 9. Pantallas y vistas necesarias
- Stock por depósito y consolidado.
- Kardex por producto.
- Alertas stock mínimo (Fase 2).

## 10. Reglas de negocio
- **BR-INV-001**: stock siempre por depósito ([D-022]).
- **Unidad física (D-130):** la unidad del producto queda fija desde su primera referencia en SC, OC, APU, material de parte, transferencia o movimiento, en cualquier estado. Antes del primer uso se puede cambiar; después, editar otros campos conserva la unidad. Para otra unidad se crea otro producto. Las nuevas operaciones con unidad explícita deben coincidir (solo trim y comparación sin distinguir mayúsculas); no hay conversiones ni equivalencias inferidas. El servicio bloquea/revalida el producto frente a operaciones simultáneas. No reescribe históricos ni repite efectos en reintentos ya realizados.
- **BR-INV-002**: saldo no negativo salvo ajuste autorizado ([BR-INV-002]).
- **BR-INV-004**: cambio método valuación con restricciones ([BR-INV-004]).
- **BR-INV-007**: anulación de movimiento confirmado con trazabilidad ([BR-INV-007]).
- **Lecturas actuales de consumo (D-124):** conservar cantidades; costo/varianza de consumo son no calculables cuando no hay valor y moneda trazables. Un precio guardado no demuestra moneda ni una capa asignada al consumo. No inferir ARS ni implementar FIFO/promedio para llenar el dato; la valuación completa mantiene el diferimiento D-083. No se modifican movimientos históricos.

## 11. Validaciones
- Cantidades > 0 en movimientos normales.
- Egreso valida disponible.

## 12. Fórmulas relacionadas
- [`../04-formulas/STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).

## 13. Casos borde
- Devolución a proveedor: egreso + nota de crédito en compras.
- Producto sin código único: usar SKU interno.

## 14. Reportes relacionados
- Inventario valorizado, materiales por proyecto, rotación.

## 15. Relación con otros módulos
- **Compras/Recepciones**, **Proyectos** (consumo), **Tesorería** (solo si compra pagada).

## 16. Permisos
WAREHOUSE operativo; PM puede solicitar egreso.

## 17. Eventos disparados / consumidos
- `stock_movement.*`, `stock_reservation.*`.

## 18. Fase de implementación
**Fase 1** núcleo; alertas avanzadas **Fase 2**.

## 19. Preguntas abiertas
- Reserva automática desde OC ([Q-019]); método por depósito ([Q-018]).

## Hallazgo — Alcance expuesto frente al diseño de inventario

AG-07 distingue el diseño funcional de las capacidades actuales: D-083 mantiene diferidas valuación plena y reservas; D-124 impide usar un precio nominal sin moneda/capa como costo de consumo o importe para un asiento nuevo. Los reportes conservan cantidades y advertencias, y la recepción con origen comprobado identifica su moneda original. No se incorporaron estados, backfill ni mecanismos de valuación para cerrar esta auditoría.
