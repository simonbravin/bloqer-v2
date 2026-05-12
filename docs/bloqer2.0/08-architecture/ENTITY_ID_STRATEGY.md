# Entity ID strategy — Bloqer 2.0

## Decisión

Usar **UUID** como identificador primario para **todas** las entidades de negocio expuestas en APIs y referenciadas en polimorfismos. Preferir **UUID v4 (random)** o **v7 (time-ordered)** según necesidad de localidad en índices B-tree; **decisión de implementación** al crear Prisma (documentar en ADR al fijar).

## Justificación

- **Multi-tenant SaaS**: IDs no secuenciales globales reducen enumeración trivial entre entidades (aunque **autorización** sigue siendo obligatoria).
- **Integración** y adjuntos en R2: claves estables sin colisión cross-tenant.
- **Polimorfismo** `entity_id` unificado sin ambigüedad de tipo mezclado.

## Alternativas consideradas

| Estrategia | Pros | Contras |
|---|---|---|
| BigSerial | Índices compactos, orden natural | Expone volumen; huecos; migración multi-región más incómoda |
| ULID | Ordenable, string | Segundo formato en stack; Prisma + PG manejan UUID nativo cómodamente |

## Reglas

- **Todas** las FKs del núcleo ERP usan **mismo tipo** (UUID).
- **No** reutilizar el mismo UUID para entidades distintas (obvio pero crítico en seeds).
- **URLs** y exports: IDs opacos; numeración humana va en columnas `number` / `code` ([Q-002](../00-product/OPEN_QUESTIONS.md)).

## Problemas que evita

- Colisiones al fusionar datos (menos relevante en monolito, útil en ETL).
- Acoplamiento a orden de inserción en APIs públicas.

## Qué NO hacer

- No usar **float** como ID (nunca aplica, pero “no floats” es regla global).  
- No mezclar **integer PK** en tablas centrales y UUID en satélites sin plan de join claro.  
- No exponer **IDs internos secuenciales** como única referencia legal al cliente si el producto promete opacidad.

## Referencias

- [`DATABASE_CONVENTIONS.md`](./DATABASE_CONVENTIONS.md)  
- [`TENANT_ISOLATION_MODEL.md`](./TENANT_ISOLATION_MODEL.md)
