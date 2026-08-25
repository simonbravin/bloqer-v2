# Help Center — arquitectura in-app ([D-090])

> Centro de ayuda buscable dentro del producto. **No** es un wiki editable por tenant ni un dump de la guía operativa.

## 1. Objetivo

Responder “¿cómo hago X?” en el idioma del operador (es-AR), con rutas reales, roles típicos y efectos económicos (comprometido / CxP / caja), sin inventar pasos.

## 2. Superficies

| Superficie | Ruta / ubicación |
|------------|------------------|
| Home + buscador | `/ayuda` |
| Ficha | `/ayuda/[slug]` |
| Nav desktop | Pie fijo **Ayuda** en sidebar empresa y obra |
| Header | Ícono `?` junto a la campana |
| Mobile | Enlace en **Más** (Field) |

Acceso: membresía activa; **sin** permiso de módulo. Deep links a pantallas destino respetan RBAC.

## 3. Catálogo

- Código: `apps/web/features/help/`
  - `lib/types.ts` — `HelpArticle`
  - `lib/search.ts` — normalización es-AR + ranking
  - `lib/articles/*.ts` — fichas por dominio
  - `lib/catalog.ts` — índice
- Sin Prisma, sin CMS, sin dependencia de búsqueda externa.
- Una ficha = un **objetivo** (ej. “Cargar un proveedor”), no un capítulo de la guía.
- `guideRef` apunta a la sección de [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).
- Búsqueda: normalización es-AR, stopwords, sin bonus de ranking si no hay match (evitar falsos positivos).
- Filtros objetivo + módulo se combinan con **AND**; empty state con CTA “Limpiar filtros”.

## 4. Mantenimiento

Todo PR que cambie UX/rutas/flujos visibles actualiza:

1. La guía operativa (§21).
2. Las fichas afectadas (pasos, `hrefs`, keywords, `relatedSlugs`).

Skill: `.cursor/skills/operational-help-docs/`. Rule: `.cursor/rules/operational-docs.mdc`.

## 5. Fuera de alcance (v1)

- Command palette `Ctrl+K` (reutilizar `searchHelpArticles` después).
- Chatbot / LLM.
- Contextual help en todos los empty states (solo Directorio + hubs AP de dolor alto).

## Referencias

- [D-090](../00-product/DECISION_LOG.md#d-090--centro-de-ayuda-in-app-faq--wiki-de-procesos)
- [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md)
- [`GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md)
