# Changelog UI — Lotes 1–6 (para autores de guía / DOCX)

> **Uso:** checklist de alineación UI al regenerar `guides/Guía_Operativa_Bloqer_v2.docx`.  
> **Fuente viva de operación:** [`../GUIA_OPERATIVA_BLOQER_V2.md`](../GUIA_OPERATIVA_BLOQER_V2.md).  
> **Smoke por rol:** [`../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md`](../08-architecture/OPERATIONAL_SMOKE_CHECKLIST_BY_ROLE.md).  
> **Entregable DOCX:** **solo** `Guía_Operativa_Bloqer_v2.docx` (la variante `_PROFESIONAL` fue eliminada; era un duplicado).

---

## Cómo usar

1. Editar la MD viva ante cualquier cambio de UX / flujos.
2. Regenerar: `cd docs/bloqer2.0/guides && node build_guide.js`.
3. No inventar features fuera de la MD + este changelog histórico.

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

## Post Lotes — decisiones de producto (guía MD)

| ID | Tema | Impacto en guía |
|----|------|-----------------|
| D-050 | Compras: WBS obligatorio, cotizaciones, notificaciones | §9 |
| D-051 | AR corporativo con CxC | §12.1 |
| D-052 | AP proyecto “Emitir y pagar ahora”, adjuntos, fondos | §12.2 |
| D-053 | Decimales dinero 2 / FX 6 / qty 4 | §4.1 |
| D-054 | Campana, polling 30s, CC OWNER/ADMIN, alertas | §1.5 |
| D-055 | WBS en factura proveedor de obra y consumo JL | §8.2 · §9 · §12.2 · §13.1 |
| D-056 | Company tools vs project tools (FINANCE / TREASURER / PROJECT_FINANCE) | §1.2 · §2.5 |
| D-057 | Partida certificable vs insumo APU (no hijos WBS) | §6.1 |
| D-058 | APU = costo; venta en tabla EDT; toolbar | §6.1b |
| D-059 | Filas detalle APU expandibles en EDT | §6.1b |
| D-060 | Columna Incidencia % | §6.1b |
| D-061 | Plantilla CoA AR + auto-DRAFT soft + reverse | §15 · §16 · §19 |
| D-062 | Libros/estados gerenciales + exports contabilidad | §1.2 · §15 |
| D-063 | Lock montos DRAFT sourced + notif cola EDIT ACCOUNTING | §15.2 |

**También alineado en guía (julio 2026):** menú proyecto (Tablero de compras, EDT y costos, Recepciones bajo Compras), tablero Materiales §9.0, checklists §18, **procedimientos paso a paso** §§0.1–0.2 y §§5–15 (etiquetas UI exactas), auth email/Google, contabilidad puesta en marcha.

### Agosto 2026 — Tesorería / cierres / invitaciones (impacto en guía MD)

| Tema | Impacto en guía |
|------|-----------------|
| Conciliación bancaria UI (`/tesoreria/conciliacion`, CSV/OFX, match, cierre/reapertura) | §1.2 · §4.0 · **§4.2** (nuevo) · §16–§19 |
| Ajuste manual de cuenta (`/tesoreria/cuentas/[id]/ajuste`) | **§4.3** (nuevo) · §19 |
| Cierre de períodos (`/contabilidad/cierres`) | §1.2 · **§15.3** (nuevo) · checklists §18 · §19 |
| Método de liquidación en cobros/pagos (D-074) | §4 · §12 |
| Estado de movimiento Confirmado / Conciliado en ledger | §4.0 · captura ledger |
| Invitaciones: accept sin `?token=` en URL (cookie httpOnly) | §2.1 + capturas |
| Errores AR visibles (emitir/anular/cancelar) | §12.1 nota de UX |

**Capturas prioritarias a fotografiar (agosto 2026):** workspace de conciliación (dos columnas), import CSV/OFX, listado de cierres + diálogos Cerrar/Reabrir, ajuste manual, aceptar invitación sin token en barra.

---

## DOCX

- Regenerar: `cd docs/bloqer2.0/guides && node build_guide.js`
- Salida: **`Guía_Operativa_Bloqer_v2.docx`** únicamente.

> Si cambian rutas, `DECISION_LOG` o la MD: actualizar la MD **en el mismo PR** y volver a correr `build_guide.js`.
