# Phase 2 — Core operations

## Objetivos

Habilitar el **núcleo de obra**: directorio, proyectos, presupuestos (WBS), contratos y adendas en la medida necesaria para certificar, certificaciones cliente, adjuntos/documentos con metadata (+ R2 cuando corresponda).

## Módulos incluidos

| Módulo | Docs funcionales |
|---|---|
| Directory | [`../02-modules/DIRECTORY.md`](../02-modules/DIRECTORY.md), CLIENTS/SUPPLIERS como vistas |
| Projects | [`../02-modules/PROJECTS.md`](../02-modules/PROJECTS.md) |
| Budgets / WBS | [`../02-modules/BUDGETS.md`](../02-modules/BUDGETS.md), [`WBS_AND_COST_ITEMS.md`](../02-modules/WBS_AND_COST_ITEMS.md) |
| Contracts / addenda / CO | [`CONTRACTS_AND_ADDENDUMS.md`](../02-modules/CONTRACTS_AND_ADDENDUMS.md), [`CHANGE_ORDERS.md`](../02-modules/CHANGE_ORDERS.md) |
| Certifications | [`CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md), [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) |
| Documents | [`DOCUMENTS.md`](../02-modules/DOCUMENTS.md), [`DOCUMENT_STORAGE_DATA_MODEL.md`](./DOCUMENT_STORAGE_DATA_MODEL.md) |

**Opcional en esta fase** (si hay presión): RFIs, Jobsite log, Scheduling stub — según prioridad del cliente piloto ([`PRODUCT_SCOPE`](../00-product/PRODUCT_SCOPE.md)).

## Dependencias

- **Phase 1** (auth, tenant, audit).  
- Estados de presupuesto incl. `RETURNED_FOR_CHANGES` ([D-030](../00-product/DECISION_LOG.md)).

## Entregables

- CRUD contactos + roles múltiples.  
- CRUD proyecto + vínculo cliente.  
- Presupuesto: versiones, WBS, ítems, análisis de costo según spec Fase 1.  
- Flujo aprobación presupuesto alineado a [`APPROVAL_WORKFLOWS`](../01-domain/APPROVAL_WORKFLOWS.md).  
- Contrato/adenda/CO según mínimo para cerrar base contractual en piloto.  
- Certificación: emisión, líneas, máquina de estados; **sin `INVOICED`** en `certification.status`.  
- Adjuntos: metadata Postgres + upload R2 (o fase intermedia documentada).

## Criterios de aceptación

- [ ] Certificación no emitible sin budget en estado válido ([R-INT-010/011](../01-domain/ENTITY_RELATIONSHIPS.md)).  
- [ ] `CLOSED` budget: solo whitelist metadata ([BR-BUD-008](../01-domain/BUSINESS_RULES.md)).  
- [ ] Sobrecertificación: reglas obra pública/privada ([D-004](../00-product/DECISION_LOG.md)).  
- [ ] Tests de servicio para transiciones de presupuesto y certificación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Complejidad WBS | WBS 3 niveles (capítulo → subcapítulo → ítem hoja) + importación estructura CSV/Excel |
| Gantt | Mantener detrás de adapter; stub de lista de hitos si falta librería ([`FRONTEND_FEATURE_STRUCTURE.md`](./FRONTEND_FEATURE_STRUCTURE.md)) |

## Qué NO hacer todavía

- No implementar **cobranza completa** ni ledger aquí si Phase 3 está definido como obligatorio antes de piloto financiero — ver [`MVP_TECHNICAL_SCOPE.md`](./MVP_TECHNICAL_SCOPE.md).  
- No calcular `payment_status` en frontend como verdad.  
- No inventar estados fuera de [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md).

## Prompts sugeridos (IA)

```
Lee 02-modules/BUDGETS.md y STATE_MACHINES.md (Budget).
Implementá servicio approveBudget y returnForChanges según BR-BUD-007.
Sin UI compleja: tests primero.
```

```
Lee CERTIFICATIONS.md y BR-CERT-007.
Implementá emit certification + lines; validá against budget status y project_type (public/private).
```

## Referencias

- Anterior: [`PHASE_1_FOUNDATION.md`](./PHASE_1_FOUNDATION.md)  
- Siguiente: [`PHASE_3_FINANCE_TREASURY.md`](./PHASE_3_FINANCE_TREASURY.md)
