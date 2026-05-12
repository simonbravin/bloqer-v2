# Enum strategy — Bloqer 2.0

## Decisión

Los **valores canónicos** de estado y tipo son **strings en inglés** (p. ej. `DRAFT`, `APPROVED`, `INCOME`), alineados a [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) y [`../AGENTS.md`](../AGENTS.md) §3. En PostgreSQL hay **tres** patrones permitidos; elegir **uno dominante por categoría** al escribir Prisma:

1. **PostgreSQL `ENUM` type** — validación fuerte en DB; migraciones más pesadas al agregar valor.  
2. **`TEXT` + `CHECK` constraint** — flexible; lista en migración SQL.  
3. **VARCHAR + validación solo en app (Zod)** — máxima flexibilidad; menor protección en DB.

**Recomendación inicial:** **`TEXT` + CHECK** o **enum Prisma** mapeado a PG ENUM solo para conjuntos **muy estables** (`account_movement.type`, `movement direction`). Para estados de documento que evolucionan con el producto, preferir **TEXT** con CHECK generado en migración o validación estricta en servicio.

## Fuente de verdad

- **Producto / dominio:** tablas y reglas en `STATE_MACHINES.md` y `BUSINESS_RULES.md`.  
- **No** introducir nuevos valores de enum en código sin actualizar esos documentos.

## `entity_type` polimórfico

- Mantener lista **cerrada** documentada en [`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §10.  
- Implementación: enum en TypeScript + tabla de lookup opcional para reporting.

## Problemas que evita

- Estados “fantasma” no documentados.  
- i18n mezclada en columnas (`"Borrador"` almacenado).

## Qué NO hacer

- No persistir **labels UI** como valores de enum.  
- No crear **doscientos** PG ENUMs microscópicos sin necesidad.  
- No cambiar significado de un valor existente sin migración de datos y ADR.

## Referencias

- [`../00-product/GLOSSARY.md`](../00-product/GLOSSARY.md)  
- [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md)  
- [`I18N_STRATEGY.md`](./I18N_STRATEGY.md)
