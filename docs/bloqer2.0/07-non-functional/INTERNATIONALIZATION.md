# Internacionalización (i18n) y localización

## Estado Fase 1
- UI **es-AR** por defecto.
- Estructura de copy externalizada preparada para otros idiomas.
- **Claves i18n** (paths / ids de mensajes) en **inglés**; el texto mostrado se resuelve por locale. Los **valores canónicos** de enums y estados no se traducen — se mapean a copy vía tabla enum ↔ label (ver [`AGENTS.md`](../AGENTS.md#3-canonical-naming-and-language-rules) §3, [`GLOSSARY.md`](../00-product/GLOSSARY.md#canonical-naming-and-language-rules)).

## Monedas y números
- Formato regional configurable por tenant ([`MASTER_DATA.md`](../01-domain/MASTER_DATA.md)).
- Base ARS; otras monedas según [`MULTI_CURRENCY_RULES.md`](../03-finance/MULTI_CURRENCY_RULES.md).

## Zona horaria
- Timestamps UTC almacenados; presentación en zona tenant (`America/Argentina/...`).

## Futuro
- UI en inglés para grupos regionales (Fase 2/3).
