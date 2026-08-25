---
name: operational-help-docs
description: >-
  Updates Bloqer operational guide and in-app help center when UX, routes,
  menus, labels, or visible workflows change. Use when editing app screens,
  nav, empty states, finance/procurement/directory flows, or when the user
  mentions guía operativa, centro de ayuda, FAQ, or /ayuda.
---

# Operational docs — guía + centro de ayuda ([D-090])

## When this applies

Any PR that changes **what the user sees or does**:

- Routes, sidebar/header labels, form buttons, empty states
- Procurement, AP/AR, treasury, directory, budgets/EDT, jobsite, accounting flows

## Checklist (same PR)

1. Update [`docs/bloqer2.0/GUIA_OPERATIVA_BLOQER_V2.md`](../../../docs/bloqer2.0/GUIA_OPERATIVA_BLOQER_V2.md) with exact UI labels and routes.
2. Update `apps/web/features/help/`:
   - Edit the matching article(s) **or** add a new one (one objective = one slug).
   - Refresh `steps`, `hrefs`, `effects`, `pitfalls`, `keywords`, `relatedSlugs`, `guideRef`.
3. Do **not** invent steps the product does not support. Source of truth: code + guía.
4. Regenerate DOCX only if delivering to client: `cd docs/bloqer2.0/guides && node build_guide.js`.

## Article shape

```ts
{
  slug: "cargar-un-proveedor",
  title: "Cargar un proveedor",
  summary: "…",
  intents: ["cargar-proveedor"],
  modules: ["directorio"],
  level: "company",
  typicalRoles: ["Administración", "Compras"],
  permissionHint: "Necesitás ver Directorio.",
  where: { menu: "General → Directorio → + Nuevo contacto" },
  hrefs: [{ kind: "company", path: "/directorio/nuevo?role=SUPPLIER" }],
  steps: ["…"],
  effects: ["Queda disponible en OC y en «A quién se le paga»"],
  pitfalls: ["No dupliques el contacto por rol"],
  relatedSlugs: ["proveedor-empleado-o-subcontratista"],
  keywords: ["proveedor", "cargar proveedor", "directorio"],
  guideRef: "§3",
}
```

## Search hygiene

Include natural-language keywords users type: “sueldos”, “cargar proveedor”, “comprar material”, “afectar EDT”.

## References

- [HELP_CENTER.md](../../../docs/bloqer2.0/08-architecture/HELP_CENTER.md)
- [D-090](../../../docs/bloqer2.0/00-product/DECISION_LOG.md)
