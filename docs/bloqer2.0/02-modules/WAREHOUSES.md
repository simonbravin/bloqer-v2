# Depósitos (Warehouses)

## 1. Objetivo
Representar **ubicaciones físicas de stock** (central, obra, camión, depósito cliente, etc.) con parámetros de valuación y políticas de uso ([D-022]).

## 2. Usuarios y roles que lo usan
- **WAREHOUSE**, **ADMIN**, **PM** (consulta ubicaciones de obra).

## 3. Problema que resuelve
Sin depósitos no hay trazabilidad de dónde está cada material ni transferencias coherentes.

## 4. Datos que consume (inputs)
- Dirección opcional, vínculo opcional a **Project** si es depósito de obra.
- Método valuación si política por depósito ([Q-018]).

## 5. Datos que produce (outputs)
- **Warehouse** activo/inactivo.
- Saldos agregados por depósito para UI y reportes.

## 6. Entidades principales
- **Warehouse**.

## 7. Estados y transiciones
`ACTIVE` ↔ `INACTIVE`; cierre `CLOSED` si saldo cero ([STATE_MACHINES Account-like para Warehouse]).

## 8. Acciones disponibles
- Crear/editar depósito.
- Transferir stock entre depósitos (vía inventario).
- Archivar si sin saldo y sin movimientos pendientes.

## 9. Pantallas y vistas necesarias
- Lista depósitos con totales valorizados ARS.
- Detalle existencias por depósito.

## 10. Reglas de negocio
- Movimiento siempre referencia `warehouse_id` ([BR-INV-001]).
- Depósito de obra opcionalmente ligado a `project_id` para reporting.

## 11. Validaciones
- Código único por tenant.
- No cerrar con stock ≠ 0.

## 12. Fórmulas relacionadas
- Valor stock por depósito: [`../04-formulas/STOCK_FORMULAS.md`](../04-formulas/STOCK_FORMULAS.md).

## 13. Casos borde
- Depósito “en tránsito” entre sedes (Fase 2 cuenta puente).

## 14. Reportes relacionados
- Inventario por depósito, transferencias internas.

## 15. Relación con otros módulos
- **INVENTORY**, **PROCUREMENT** (recepción), **Proyectos**.

## 16. Permisos
ADMIN crea; WAREHOUSE opera movimientos.

## 17. Eventos disparados / consumidos
- `warehouse.updated` (raro).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Valuación por depósito vs global ([Q-018]).
