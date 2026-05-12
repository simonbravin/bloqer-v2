# MVP technical scope — Bloqer 2.0

> Define el **primer hito utilizable** para una constructora piloto **sin contradecir** el alcance funcional Fase 1 ([`../00-product/PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).  
> “MVP técnico” aquí = **conjunto mínimo implementado y estable** para empezar a cargar obras reales con trazabilidad — **no** un producto comercial recortado.

## Objetivo del hito

Un usuario autenticado en un **tenant** puede:

1. Gestionar **contactos** y crear **proyecto** con cliente.  
2. Tener **presupuesto** con WBS en estados válidos hasta **aprobado/cerrado** según flujo implementado.  
3. Emitir **certificación** vinculada a presupuesto y registrar **factura de venta** que genere **AR**.  
4. Registrar **cobranza** que impacte **ledger** y saldo AR.  
5. Tener **audit log** en acciones críticas y **aislamiento por tenant** verificado.

Opcionalmente en el mismo hito o inmediatamente después: **OC simple**, **AP**, **pago**, **movimiento de stock** básico — ver roadmap Phase 3–4.

## Incluido (target técnico del primer piloto)

| Área | Incluido |
|---|---|
| Identidad | Login, sesión, membresía tenant |
| Tenancy | `tenant_id` en todas las mutaciones; `company` si ya está en schema |
| RBAC | Matriz simplificada VIEW/EDIT/APPROVE por módulo activo en rutas críticas |
| Directorio | CRUD contacto + roles mínimos |
| Proyectos | CRUD + tipo obra público/privado |
| Presupuestos | WBS + ítems + estados hasta flujo que habilite certificación según spec |
| Certificaciones | Ciclo documental + líneas; **sin** `INVOICED` en status ([D-026](../00-product/DECISION_LOG.md)) |
| Ventas/AR | `sales_invoice` → `receivable`; derivados de cobranza |
| Tesorería mínima | Cuenta + `account_movement` para cobranza confirmada |
| Documentos | Adjunto metadata + storage (R2) **o** stub solo DB si R2 sigue en Phase 0 backlog |

## Explícitamente diferido (no bloquea “primer piloto” si se acuerda)

- Conciliación bancaria completa (puede ser manual sin sesión formal al inicio).  
- Subcontratos **completos** con `settlement_status` materializado (puede seguir Phase 3/4).  
- Query builder ad-hoc ([Q-010](../00-product/OPEN_QUESTIONS.md)).  
- Portal cliente externo ([Q-014](../00-product/OPEN_QUESTIONS.md)).  
- Integraciones bancarias/AFIP ([`PRODUCT_SCOPE`](../00-product/PRODUCT_SCOPE.md) Fase 3).

## Criterios de salida del MVP técnico

- [ ] Tests automatizados de **tenant isolation** en servicios financieros críticos.  
- [ ] **Ningún** endpoint de mutación sin pasar por **service layer**.  
- [ ] Dinero: **decimal**, FX cuando aplique ([`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md)).  
- [ ] Documentación actualizada si se tomó atajo temporal → [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md).

## Referencias

- [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md)  
- [`PHASE_1_FOUNDATION.md`](./PHASE_1_FOUNDATION.md), [`PHASE_2_CORE_OPERATIONS.md`](./PHASE_2_CORE_OPERATIONS.md), [`PHASE_3_FINANCE_TREASURY.md`](./PHASE_3_FINANCE_TREASURY.md)
