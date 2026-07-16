# Changelog UI — Lotes 1–6 (para autores de guía / DOCX)

> **Uso:** alimentar la próxima regeneración de `guides/Guía_Operativa_Bloqer_v2*.docx` **sin** ejecutar `build_guide.js` en este lote.  
> **Fuente viva de operación:** [`../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md`](../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md).  
> **Smoke por rol:** [`../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md).

---

## Cómo usar

1. Al regenerar DOCX, revisar cada fila y alinear copy / capturas.
2. No inventar features fuera de esta tabla + guía revisada.
3. Contabilidad completa, adendas formales, anticipo proveedor real, RFIs: **fuera de alcance** (ver limitaciones de la guía).

---

## Tabla Lote → UI

| Lote | ID | Pantalla / ruta | Antes (guía/DOCX viejo) | Ahora |
|------|----|-----------------|-------------------------|--------|
| 1 | A-01 | `/configuracion/reportes` | Cron poco claro | Copy **cron diario** |
| 1 | D-01 | Menú proyecto Operación | Sin Recepciones en menú | Ítem **Recepciones** + link desde OC |
| 1 | D-02 | `/finanzas`, CxP | Pagos solo por URL | Enlace a `/finanzas/pagos-proveedor` desde hub/CxP |
| 1 | C-01 / H-03 | Documentos | Placeholder confuso | Badge PLACEHOLDER + mensaje de descarga |
| 1 | H-01 | `/configuracion/permisos` | Parecía editable | Banner **solo lectura** + link a Equipo |
| 1 | C-02 | `/configuracion` | Política compras semi-oculta | Card / acceso a `/configuracion/compras` |
| 1 | F-02 | AP | Posible CTA anticipo | **Sin** CTA; stub ADR-013 |
| 2 | E-01 | Permisos | Módulos fantasma | Marcados no disponibles (Contratos, CO, RFIs, conciliación, impuestos) |
| 2 | E-02 | `/platform/.../modules` | Default-on opaco | UI explica default-on |
| 2 | A-02 | Presupuestos | Varios APPROVED posibles | Un solo `APPROVED` por proyecto (migración) |
| 3 | B-01 | `/proyectos/[id]/consumos` | Solo alta `/nuevo` | **Listado** + nav Consumos |
| 3 | B-02 | Certificación cliente | Sin CTA factura | CTA emitir / factura vinculada si APPROVED |
| 3 | B-03 | Cert. subcontrato | Draft opaco | CTA / código de factura proveedor |
| 3 | A-03 | OC / política compras | Auto-aprobación confusa | Copy + tests; política sin cambio |
| 3 | D-03 | OC / recepción / factura / CxP | Navegación débil | Cross-links entre documentos |
| 4 | C-04 | Listados | Empty pobres | `ListEmptyState` con CTA |
| 4 | C-05 | Tablas densas | Scroll sin ancla | Primera columna sticky opcional |
| 4 | C-06 | Formularios OC/cert/cobro/pago | Labels flojos | `htmlFor`/`id` |
| 4 | D-04 | Notificaciones | Riesgo de ítem sidebar | **Solo campana**; aria-label con unread |
| 4 | D-05 | Inventario / Tesorería / Contabilidad | Sin subnav | `ModuleSubnav` en layouts |
| 4 | B-04 | Presupuestos | Lenguaje “versión” | Adenda operativa sin vínculo automático |
| 5 | F-01/G-01 | CxP / facturas proveedor | Export solo API | Botones CSV/PDF en UI |
| 5 | G-02 | Reportes / emails | Omitido ≈ Fallido | Hints y badges claros |
| 5 | G-03 | `/notificaciones/alertas` | Sin indicios de cron | Card **Última actividad** |
| 6 | I-* | — | Deuda técnica | Limpieza código; sin cambio de producto |
| 6 | J-01 | — | Tests flacos | Guards + tests de circuitos (QA automatizado) |

---

## Explicitamente NO regenerar aún

- `guides/build_guide.js`
- Nuevos `.docx` en el repo

Cuando negocio pida entregable imprimible: regenerar DOCX **después** de alinear `GUIA_OPERATIVA_BLOQER_V2_REVISADA.md` con esta tabla y pasar el smoke J-02.

---

*Lote 7 — preparación docs.*
