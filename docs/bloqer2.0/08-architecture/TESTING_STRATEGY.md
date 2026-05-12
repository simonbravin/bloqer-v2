# Testing strategy — Bloqer 2.0

> Pirámide de tests cuando exista código. **No** configura runner aquí.

## Tipos de tests

| Tipo | Qué cubre |
|---|---|
| **Unit** | Funciones puras en `packages/domain`, helpers de redondeo, mapeos de estado. |
| **Integration** | Service + DB de test (Neon branch / docker Postgres) con transacción rollback por test. |
| **Service** | Caso de uso completo: mocks solo en integraciones externas (email, R2). |
| **Repository** | Queries críticas: filtros `tenant_id`, joins de reporte base. |
| **Permission** | Matriz mínima: rol X no puede mutar entidad Y. |
| **Tenant isolation** | Mismo test con dos `tenant_id`: no leakage. |
| **Formula** | Números de [`../04-formulas/`](../04-formulas/) vs implementación. |
| **Workflow** | Secuencia: OC → recepción → factura → payable (según doc). |
| **E2E mínimos** | Login + flujo feliz crítico (presupuesto aprobado, movimiento de caja) cuando Playwright exista. |

## Fixtures y seeds

- Fixtures **por tenant**; nunca datos globales sin `tenant_id`.  
- Seeds solo entornos no productivos.

## Base de datos de test

- Preferir **schema migrado** igual que prod; datos mínimos por suite.

## Qué testear **primero** (prioridad del prompt 3)

1. Fórmulas financieras y anti–doble conteo ([BR-COS-002](../01-domain/BUSINESS_RULES.md)).  
2. Ledger: `account_movement`, cobranzas/pagos parciales, **internal transfer** = par.  
3. Stock: movimientos confirmados, transfer par, reserva vs disponible.  
4. Certificaciones + AR (sin `INVOICED` en status; derivados).  
5. Presupuestos: `CLOSED`, `IN_REVIEW`, `RETURNED_FOR_CHANGES`.  
6. AR/AP + period close.  
7. Permisos + tenant isolation.  
8. Autorización de descarga de documento (metadata + tenant).

## Qué NO hacer

- Tests que mockean **toda** la DB y no prueban SQL.  
- E2E como única red de seguridad financiera.

## Referencias

- [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md)  
- [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md)
