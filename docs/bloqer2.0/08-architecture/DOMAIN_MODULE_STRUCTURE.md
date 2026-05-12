# Domain module structure — Bloqer 2.0

## Decisión

Espellear **módulos de negocio** como carpetas bajo `packages/services/src` y, donde aplique, `packages/domain/src` con el **mismo nombre de módulo**. La estructura interna es **recomendada**, no dogma; el **boundary** (qué exporta el módulo y qué no importa de otros) es obligatorio.

## Módulos

`directory`, `projects`, `budgets`, `contracts`, `certifications`, `procurement`, `subcontracting`, `inventory`, `treasury`, `documents`, `reports`, `audit`, `notifications`, `tenancy`, `identity`

## Plantilla recomendada por módulo

```
packages/services/src/<module>/
  types.ts              # DTOs de entrada/salida del servicio (no confundir con DB row types)
  schemas.ts            # re-export o thin wrap de packages/validators (opcional)
  service.ts            # funciones / clase ApplicationService pública del módulo
  repository.ts         # queries Prisma encapsuladas (o subcarpeta repositories/)
  calculations.ts       # orquestación de números que delegan en domain + fórmulas doc
  permissions.ts        # chequeos de rol/acción por caso de uso (llama a matriz funcional)
  events.ts             # nombres de eventos emitidos / payloads (alineado a EVENTS_AND_AUTOMATIONS)
  tests/                # tests del módulo (ver TESTING_STRATEGY)
```

### Reglas

- **`calculations.ts`**: no reimplementar fórmulas ya en [`../04-formulas/`](../04-formulas/); **delegar** o centralizar constantes con referencia al doc.  
- **`permissions.ts`**: mapear a [`../00-product/PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md); no inventar permisos por campo.  
- **`repository.ts`**: siempre filtros `tenant_id`; validar coherencia `company_id` cuando el módulo lo use ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md)).

## Qué NO hacer

- No crear `god/service.ts` en la raíz de `services`.  
- No poner React en ningún archivo bajo `packages/services`.  
- No duplicar el mismo caso de uso en dos módulos sin frontera clara.

## Referencias

- [`MODULAR_MONOLITH.md`](./MODULAR_MONOLITH.md)  
- [`PACKAGE_STRUCTURE.md`](./PACKAGE_STRUCTURE.md)
