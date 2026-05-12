# i18n strategy — Bloqer 2.0

## Decisión

Ser **i18n-ready desde día 1** con **un solo locale implementado: es-AR**. **Claves** de mensajes y namespaces en **inglés**; **texto visible** en español rioplatense. **Enums y estados canónicos** permanecen en **inglés**; la UI mapea a labels ([`../00-product/GLOSSARY.md`](../00-product/GLOSSARY.md), [`../AGENTS.md`](../AGENTS.md) §3).

## Justificación para Bloqer 2.0

- El producto ya define **reglas de naming** inglés en modelo / código y español en copy ([`../AGENTS.md`](../AGENTS.md)).
- Construcción en Argentina implica **formato de números, moneda y fechas** localizados ([`../03-finance/MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md)).
- Preparar i18n evita **refactors masivos** si aparece segundo locale o white-label.

## Problemas que evita

- **Concatenar** strings en español en código sin claves.
- Mezclar **valores de negocio** traducidos (`"Borrador"`) como si fueran enums.

## Qué NO hacer

- No usar **texto hardcodeado** en componentes sin pasar por el sistema de mensajes (aunque hoy solo haya un locale).
- No traducir **nombres de entidades internas** mostrados a desarrolladores/logs (`Budget`, `Payable`).
- No implementar **RTL** o plural rules exóticas hasta necesidad real; solo mantener **API de i18n** compatible.

## Validación (Zod) y mensajes

- **Códigos de error** estables (`BUDGET_CLOSED_VIOLATION`) + mensaje localizado en capa de presentación.
- **Misma regla** validada en servidor; el cliente solo refleja el error.

## Referencias funcionales

- [`../AGENTS.md`](../AGENTS.md) §3 Canonical naming
- [`../00-product/GLOSSARY.md`](../00-product/GLOSSARY.md)
- [`../07-non-functional/INTERNATIONALIZATION.md`](../07-non-functional/INTERNATIONALIZATION.md)

## Documentos técnicos relacionados

- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
