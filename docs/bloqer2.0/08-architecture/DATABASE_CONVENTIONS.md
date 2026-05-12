# Database conventions — Bloqer 2.0

## Decisión

Usar **PostgreSQL** con convenciones explícitas de nombres, tipos y límites, pensadas para **Prisma** (modelos en inglés, mapeo a columnas `snake_case` recomendado en implementación).

## Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Tabla | `snake_case`, plural opcional pero consistente | `account_movements` |
| Columna | `snake_case` | `tenant_id`, `created_at` |
| PK | `id` (UUID) | [`ENTITY_ID_STRATEGY.md`](./ENTITY_ID_STRATEGY.md) |
| FK | `<entity>_id` | `project_id` |
| Puentes | `collection_applications` o `collection_line` (elegir uno) | — |
| Índices | prefijo `idx_` + tabla + columnas | `idx_am_tenant_account_date` |

**Prisma:** los **model names** suelen ser `PascalCase` singular; el **`@@map`** apunta a tabla SQL. Esto **no** se escribe aquí como schema.

## Idioma

- **Valores canónicos** (enums, `entity_type`, `status`): **inglés** `UPPER_SNAKE_CASE` o strings estables definidos en código.
- **Labels UI (es-AR)**: fuera del modelo; viven en i18n ([`I18N_STRATEGY.md`](./I18N_STRATEGY.md)).

## Tipos lógicos

| Uso | Tipo físico sugerido |
|---|---|
| Dinero | `NUMERIC(19, 4)` o menor según [`MONEY_AND_DECIMAL_STRATEGY.md`](./MONEY_AND_DECIMAL_STRATEGY.md) |
| Cantidad stock | `NUMERIC(18, 4)` |
| FX rate | `NUMERIC(18, 6)` o según política |
| Porcentaje | `NUMERIC(9, 6)` almacenado como fracción o % según regla única documentada |
| Fecha contable / valor | `DATE` |
| Timestamp auditoría | `TIMESTAMPTZ` |
| Boolean | `BOOLEAN` |
| Texto largo | `TEXT` |
| JSON (usar con moderación) | `JSONB` solo si hay query real o flexibilidad justificada |

## Multitenancy

- `tenant_id` **NOT NULL** en tablas operativas, salvo lista blanca en [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md).
- FKs deben referenciar filas del **mismo tenant** (validar en servicio; considerar **constraint** compuesta avanzada solo donde PG lo permita sin fricción).

## Polimorfismo

- Par `source_entity_type` + `source_entity_id` (nombres alineados al catálogo [`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §10).
- Mantener **enum cerrado** en aplicación; migraciones al agregar tipos.

## Problemas que evita

- Nombres inconsistentes entre módulos (“`client_id`” vs `contact_id`).
- Mezcla de precisión decimal entre tablas.
- Enums implícitos en `VARCHAR` sin lista cerrada.

## Qué NO hacer

- No usar `FLOAT` / `REAL` / `DOUBLE PRECISION` para dinero o cantidades contables.  
- No abreviar hasta perder claridad (`cid`, `amt_tot`).  
- No crear **900 flags** booleanos; preferir estado explícito o tabla de propiedades cuando crezca.

## Referencias

- [`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md)  
- [`../AGENTS.md`](../AGENTS.md) §3  
- [`ENUM_STRATEGY.md`](./ENUM_STRATEGY.md)
