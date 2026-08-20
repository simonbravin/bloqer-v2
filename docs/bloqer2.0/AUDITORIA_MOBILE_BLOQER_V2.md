# Auditoría integral de experiencia mobile — Bloqer v2

> **Tipo:** auditoría de viewport, layout, navegación, densidad y touch. Sin implementación.
> **Fecha:** 19 agosto 2026.
> **Tenant:** Bloqer Demo Construcciones (`docs-guide@bloqer.demo`, dataset `guides/docs-demo-ids.json`).
> **Método:** lectura de `apps/web` + Playwright reutilizando `docs/bloqer2.0/guides/capture/lib` (login, tenant demo, wait). Viewports 390×844, 430×932, 768×1024, 1440×1000.
> **Capturas:** `docs/bloqer2.0/mobile-audit/screenshots/`.
> **Regla de esta etapa:** no se modificó código de producto, CSS, Prisma, datos productivos ni se hizo commit.

Filosofía evaluada:

> **Mobile = campo, captura, consulta rápida, ejecución y aprobación.**
> **Desktop = planificación compleja, análisis, configuración y administración pesada.**

---

# 1. Resumen ejecutivo

Bloqer v2 es un **ERP desktop-first** con algunos ladrillos responsive ya existentes (grids `sm:`/`lg:`, `PageListHeader`, `ListViewToggle` tabla/tarjetas, dialogs con `w-[calc(100vw-1.5rem)]`). **No hay una experiencia mobile.** No hay menú overlay, no hay bottom nav, no hay detección de viewport salvo el breadcrumb, no hay PWA, no hay `capture` en uploads.

Con el sidebar **cerrado**, una fracción de pantallas se puede **consultar**. Con el sidebar en su estado por defecto (**abierto**, `localStorage` `bloqer:sidebar-open` = `true`), el teléfono es **inusable**.

Métricas reales a 390px (Playwright, `#app-shell-sidebar` rail abierto):

| Medida | Valor |
|--------|--------|
| Ancho del sidebar (`w-64`) | **255 px** |
| Ancho de `main` | **134 px** |
| Porcentaje del viewport ocupado por el menú | **~65 %** |

Eso comprime títulos, KPIs y tablas hasta texto de una letra por línea (ver `02-dashboard-sidebar-open-390.png`, `08-project-menu-390.png`).

### Porcentaje aproximado (61 filas de la matriz)

La matriz clasifica cada pantalla **con el sidebar cerrado**. El primer paint real es peor: el default `bloqer:sidebar-open=true` convierte casi cualquier ruta autenticada en **M3 sistémico**.

| Estado | Cantidad | % |
|--------|----------|---|
| **M0** Mobile ready | 2 | ~3 % |
| **M1** Usable con ajustes menores | 10 | ~16 % |
| **M2** Necesita layout mobile | 34 | ~56 % |
| **M3** Roto / inusable (sidebar cerrado) | 4 | ~7 % |
| **M4** Desktop-only intencional | 11 | ~18 % |
| **MOBILE PRIORITY** (campo, columna P) | 14 | — |
| Shell default abierto (transversal) | — | **M3 sistémico** |

M3 con menú cerrado: Gantt, Kanban, formulario de recepción (columna cantidad), detalle de certificación (`flex` + `w-56`).

**Qué ya funciona en celular (sidebar cerrado):** login; dashboard de KPIs apilados; notificaciones en cards; formularios simples (`Registrar cobro`, consumo vacío); hubs de KPIs (compras).

**Qué está roto:** shell con sidebar persistente; Gantt; Kanban (drag + warning de keys); detalle de certificación (`flex` + panel `w-56`); conciliación dos columnas; WBS/APU; tablas de 6–11 columnas con `overflow-x-auto` (la 4.ª columna de recepción **no entra**).

**Qué necesita layout mobile:** casi todos los listados (default **Tabla**, no Tarjetas), libro de obra, SC, OC detalle/aprobación, materiales, partes, cronograma (vista “hoy/semana”, no Gantt).

**Qué debe quedar desktop-only:** edición avanzada de presupuesto/APU, import WBS, Gantt de planificación, conciliación bancaria, asientos, cierres, matriz de permisos, reportes complejos, imputación GG, plataforma.

---

# 2. Arquitectura responsive actual

## Breakpoints

`apps/web/tailwind.config.ts` **no redefine** `sm`/`md`/`lg`. Se usan los default de Tailwind:

| Token | Ancho |
|-------|--------|
| `sm` | 640 px |
| `md` | 768 px |
| `lg` | 1024 px |
| `xl` | 1280 px |

Uso real: muchos `sm:` y `lg:`; **casi no hay `md:`**. No hay `max-md:` ni layout distinto “phone vs tablet”.

Única detección de viewport en JS: `apps/web/components/layout/shell-breadcrumb.tsx` — `MOBILE_MQ = "(max-width: 639px)"` para colapsar breadcrumbs a 3 ítems. No hay `useIsMobile` de shell, no hay `matchMedia` para tablas/nav.

## Layout / shell

- `ShellLayout` (`apps/web/components/layout/shell-layout.tsx`): `h-dvh`, sidebar en **rail de ancho**, `main` con `overflow-x-hidden` y `p-4 sm:p-6 lg:p-8`.
- `SidebarRail` (`sidebar-shell-context.tsx`): si `open` → `w-64`; si no → `w-0`. **No es overlay.** No hay backdrop. No se cierra al navegar. Default **abierto**.
- Toggle: `ShellSidebarToggle` — botón `h-9 w-9` (36 px, bajo el mínimo táctil 44 px), label solo `sr-only`.
- Navegación: `AppNavColumn` intercambia `Sidebar` (empresa) vs `ProjectWorkspaceSidebar` (obra) según `/proyectos/[uuid]`.
- Contenido: `PageShell` → `.shell-page` = `max-w-6xl` (`globals.css`). En 390 px el max-width no ayuda; el problema es el rail.

## Tablas

- `Table` (`components/ui/table.tsx`) envuelve con `overflow-x-auto`.
- `TableScroll` (`components/ui/table-scroll.tsx`): scroll horizontal + opción `stickyFirstColumn`. **Estrategia actual = scroll, no cards.**
- `ListViewToggle` (`components/ui/list-view-toggle.tsx`): `defaultView = "table"`. Persiste en `localStorage`. **No elige tarjetas en mobile.**
- Cards ya existen: `PurchaseOrderCards`, `ProjectCards`, `DocumentCards`, `ContactCards`, etc. Se activan solo si `?view=cards`.

## Formularios

- Inputs full-width. Varios `grid-cols-1 sm:grid-cols-2`.
- Date: `<Input type="date">` nativo (en Chromium muestra `mm/dd/yyyy`; en iOS sería el picker nativo).
- EDT: `SearchableCombobox` (Popover + Command). Tocable, pero popover desktop.
- Líneas de OC/factura: `purchase-order-lines-editor.tsx` / `invoice-lines-editor.tsx` — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`.

## Dialogs / sheets

- Primitivo: `DialogContent` centrado `max-w-lg`, footer `flex-col-reverse` en mobile (`components/ui/dialog.tsx`).
- Formularios grandes ya usan `max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-*` (`NewJobsiteLogDialog`, `NewPurchaseRequestDialog`, `NewPurchaseOrderDialog`, `NewStockConsumptionDialog`, `NewTransactionDialog`, …).
- `Sheet` existe (`components/ui/sheet.tsx`) pero **casi no se usa** (solo matriz de permisos). No hay sheet de navegación.

## Upload

Ver §10. Componente reutilizable: `DocumentUploadZone`.

---

# 3. Estado actual por viewport

## 390 × 844 (teléfono estándar)

**Shell:** si el menú está abierto, ~134 px de contenido. Experiencia de primer load = **rota**.

**Con menú cerrado (toggle):**

- Login: cabe, botones full-width. **M0.**
- Dashboard: KPIs en `grid-cols-1`. Legible. Header denso. **M1.**
- Listados: default tabla → columnas envueltas o cortadas. Toggle “Tarjetas” ya arregla OC (`30-ordenes-compra-cards-390.png`). **M2.**
- Gantt/Kanban/Calendario: arriba del fold solo KPIs del cronograma; el widget pesado queda abajo y no es operable con dedo. **M3.**
- Recepción nueva: tabla de 4 columnas; **cantidad recibida queda fuera**. **M3 + MOBILE PRIORITY.**

## 430 × 932 (teléfono grande)

Misma arquitectura. ~15–40 px extra no cambian el diagnóstico: el rail sigue siendo 255 px. Cards y forms ganan un poco de aire. Gantt sigue siendo desktop.

## 768 × 1024 (tablet vertical)

`sm` (640) ya activó 2 columnas en muchos grids. Con sidebar abierto quedan ~512 px: **usable para consulta**, incómodo para Gantt y WBS. Tablet es el primer ancho donde el shell actual “casi” funciona si se colapsa el menú.

## 1440 × 1000 (desktop de referencia)

Es el diseño real. Sidebar 256 + canvas `max-w-6xl`. Gantt, WBS, conciliación y tablas de 8+ columnas están pensados para esto.

---

# 4. Matriz completa de pantallas

Clasificación: **M0** ready · **M1** ajustes menores · **M2** layout mobile · **M3** roto · **M4** desktop-only. **P** = MOBILE PRIORITY.

| Área | Pantalla | Ruta | 390 | 430 | Tablet | Clasif. | P | Problema | Recomendación |
|------|----------|------|-----|-----|--------|---------|---|----------|---------------|
| Auth | Login | `/login` | OK | OK | OK | **M0** | | `AuthLayout` `max-w-sm`, card centrada | Mantener |
| Auth | Registro / reset | `/registro`, `/restablecer-contrasena` | OK | OK | OK | **M0** | | Mismo `AuthCard` | Mantener |
| General | Dashboard | `/dashboard` | Menú abierto aplasta KPIs; cerrado apila cards | Igual | OK- | **M1** | | `KpiStatGrid` 1 col; acciones rápidas corporativas, no de campo | Cerrar sidebar por default &lt; `md`; Field Home aparte |
| General | Proyectos | `/proyectos` | Tabla 4 cols wrap (`05-proyectos-390.png`) | Wrap | Mejor | **M2** | | `ProjectListSection` default table; `ProjectCards` existe | Default `cards` &lt; `md` |
| General | Alta proyecto | `/proyectos/nuevo` | Form largo | Form | OK | **M1** | | Página form, no dialog | Spacing + sticky submit |
| General | Directorio | `/directorio` | CUIT partido en 3 líneas (`06-directorio-390.png`) | Igual | Mejor | **M2** | | `ContactListSection` table | Default cards |
| General | Notificaciones | `/notificaciones` | Cards OK; acciones densas (`07-notificaciones-390.png`) | OK | OK | **M1** | P | Filtros wrap; “Marcar leída/Archivar” juntos | Targets 44 px; swipe opcional |
| Obra | Resumen proyecto | `/proyectos/[id]` | Sidebar abierto = texto vertical; cerrado usable con fechas truncadas | Fechas | OK | **M2** | | `project-overview-view.tsx` `grid-cols-3` en Tipo/Inicio/Fin **sin** breakpoint | `grid-cols-1 sm:grid-cols-3`; lifecycle `flex-wrap` ya existe |
| Plan | Presupuestos | `/proyectos/[id]/presupuestos` | Tabla | Tabla | OK- | **M2** | | `BudgetListSection` | Cards compactas para consultar versión |
| Plan | Detalle presupuesto / EDT | `/proyectos/[id]/presupuestos/[budgetId]` | KPIs OK; EDT árbol denso (`11-presupuesto-detalle-390.png`) | Denso | Aire | **M4** | | `wbs-tree.tsx` overflow-x, APU expandible | Consulta read-only opcional; edición **desktop** |
| Plan | APU dialog | (dialog en EDT) | `max-w-5xl` | — | — | **M4** | | `cost-item-apu-dialog.tsx` | Desktop-only |
| Plan | Cronograma Gantt | `?view=gantt` | Desktop ≥ `lg` | — | — | **M4** | | `schedule-gantt-view.tsx` + kibo; hover/drag | Intencional desktop. No miniatura mobile |
| Campo | Cronograma Field | `/cronograma` &lt; `lg` | Lista Hoy/Semana/Atrasadas | OK | OK | **M1** | P | misma ruta/`ScheduleItem`; cards + sheet | Ejecución de campo; ver Resultado — Cronograma Field |
| Plan | Kanban | `?view=kanban` | Columnas + dnd-kit; warning keys | Igual | Regular | **M3** | | `schedule-kanban-view.tsx` `@dnd-kit`; keys duplicados (overlay “1 Issue” en capturas) | No priorizar drag mobile; lista por estado |
| Plan | Tabla cronograma | `?view=table` | `overflow-x-auto`, fechas nowrap | Scroll | OK | **M2** | P | `schedule-table-view.tsx` | Cards de tarea &lt; `md` |
| Plan | Calendario | `?view=calendar` | Mes kibo, celdas chicas | Regular | OK | **M2** | | `schedule-calendar-view.tsx` | Lista del día &gt; grid mes |
| Plan | EDT y costos | `/control-costos` | Filtros + tabla ancha (`16-control-costos-390.png`) | Igual | Scroll | **M4** | | `cost-control-table.tsx` | Desktop; atajo “faltante” vive en Materiales |
| Plan | Reportes obra | `/reportes` | Hub de links | Hub | OK | **M2** | | `reports-hub.tsx` | Lista simple; reportes en sí M4 |
| Campo | Libro de obra | `/libro-obra` | Filtros densos; tabla 4 cols (`18-libro-obra-390.png`) | Mejor | OK | **M2** | **P** | Default tabla; calendar alt | Lista tipo card (fecha, estado, frente) |
| Campo | Nuevo parte | `?create=1` → `NewJobsiteLogDialog` | Dialog 90vh con form largo | 90vh | Sheet | **M2** | **P** | `new-jobsite-log-dialog.tsx` `sm:max-w-4xl`; form **ya en cards** (`jobsite-log-form.tsx`) | Full-screen sheet; no dialog centrado; foto en el flujo |
| Campo | Detalle parte | `/libro-obra/[logId]` | Resumen OK; tabla avance overflow (`20-parte-detalle-390.png`) | Overflow | OK | **M2** | **P** | Tablas progreso/cuadrilla; adjuntos vía `EntityDocumentsPanel` (tabla) | Cards de avance; adjuntar foto visible |
| Campo | Materiales | `/materiales` | Cards Field &lt; `lg`; tabla desktop ≥ `lg` | OK | OK | **M1** | **P** | `MaterialsFieldView` + `getProjectMaterialsBoard`; CTA Pedir | Ver Resultado — Materiales Field |
| Campo | Inventario obra | `/inventario` | Hub | Hub | OK | **M2** | | Subnav + tablas stock | Consulta saldos en cards |
| Campo | Consumos | `/consumos` | Empty usable (`23-consumos-390.png`) | OK | OK | **M1** | **P** | Botones wrap; CTA duplicada en empty | Default OK; form ver dialog |
| Campo | Nuevo consumo | `NewStockConsumptionDialog` | `sm:max-w-lg` 90vh | OK | OK | **M1** | **P** | `consumption-form.tsx` combobox producto/EDT; **sin foto** | Sheet; botón cámara |
| Campo | Documentos | `/documentos` | Filtros OK; lista vacía (`25-documentos-390.png`) | OK | OK | **M1** | **P** | Toggle tabla/tarjetas; upload en dialog | Default cards; `capture` |
| Compras | Hub | `/compras` | KPIs | KPIs | OK | **M1** | | `getProjectProcurementHub` | Base de Field Home “pendientes” |
| Compras | Solicitudes | `/solicitudes-compra` | Tabla overflow + empty cortado (`27-solicitudes-compra-390.png`) | Overflow | OK | **M2** | **P** | No hay `PurchaseRequestCards` equivalente fuerte; 0 SC en demo | Cards; crear 1 línea (ya es 1 línea) |
| Compras | Nueva SC | `NewPurchaseRequestDialog` | Dialog `sm:max-w-2xl`; form 1 línea | OK | OK | **M2** | **P** | `purchase-request-form.tsx`: EDT combobox, qty, date; **sin adjunto** | Sheet; foto; no exigir APU en campo |
| Compras | Detalle SC / cotizaciones | `/solicitudes-compra/[prId]` | Tablas quotes | Tablas | OK | **M2** | | Quotes + `EntityDocumentsPanel` | Consulta+enviar; cotizar en desktop |
| Compras | Órdenes (tabla) | `/ordenes-compra` | 8 cols, corte (`29-ordenes-compra-390.png`) | Corte | Scroll | **M2** | **P** | `PurchaseOrderTable` + `TableScroll` | Default **cards** (`PurchaseOrderCards` ya listo) |
| Compras | Órdenes (cards) | `?view=cards` | Útil (`30-ordenes-compra-cards-390.png`); header duplicado | OK | OK | **M1** | P | Cards OK; breadcrumb choca título | Auto-cards &lt; `md` |
| Compras | Nueva OC | `NewPurchaseOrderDialog` | Dialog `sm:max-w-3xl` + lines editor 6 cols | Difícil | Regular | **M4** | | Crear OC es planificación | Campo: no crear; sí aprobar |
| Compras | Detalle / aprobar OC | `/ordenes-compra/[poId]` | Header OK; líneas cortadas (`32-oc-detalle-390.png`); Aprobar/Devolver en fila | Corte | OK | **M2** | **P** | `page.tsx` botones submit; `returnReason` `w-64` fijo | Summary card + líneas stacked; Devolver en sheet |
| Compras | Recepciones | `/recepciones` | Lista | Lista | OK | **M2** | P | `PurchaseReceiptListSection` | Cards |
| Compras | Nueva recepción | `/ordenes-compra/[poId]/recepciones/nueva` | **Qty input fuera de pantalla** (`35-recepcion-nueva-390.png`) | Riesgo | OK | **M3** | **P** | `receipt-form.tsx` tabla 4 cols; sin foto/remito en el alta | Una card por línea (desc, pendiente, qty); foto |
| Sub | Listado | `/subcontratos` | Tabla | Tabla | OK | **M2** | | `SubcontractListSection` | Cards consulta |
| Sub | Detalle | `/subcontratos/[id]` | Tablas 2 overflow (métricas) | Overflow | OK | **M2** | | Densidad desktop | Resumen + certs |
| Sub | Cert. subcontrato | `.../certificaciones/[certId]` | Tabla | Tabla | OK | **M2** | | Aprobación genera factura AP | Aprobar en mobile; editar líneas desktop |
| Cert | Listado | `/certificaciones` | Tabla | Tabla | OK | **M2** | | `CertificationListSection` | Cards |
| Cert | Nueva | `NewCertificationDialog` | `sm:max-w-lg` | OK | OK | **M2** | | Crear período | Campo: consulta/aprobar, crear en obra opcional |
| Cert | Detalle / aprobar | `/certificaciones/[certId]` | **flex + panel `w-56` no apila** (`41-certificacion-detalle-390.png`) | Roto | Regular | **M3** | **P** | `certificaciones/[certId]/page.tsx` L167–194 | `flex-col lg:flex-row`; CTA factura ya existe |
| Fin. obra | Tablero | `/finanzas` | Densidad | Densidad | OK | **M2** | | `project-finance-dashboard-view.tsx` `lg:grid-cols-2` | KPIs stack |
| Fin. obra | Flujo de caja | `/flujo-caja` | Proyección | — | Regular | **M4** | | Análisis | Desktop |
| Fin. obra | Facturas AP | `/facturas-proveedor` | Tabla | Tabla | OK | **M2** | | Cards existen | Default cards consulta |
| Fin. obra | Facturas venta | `/facturas` | Tabla | Tabla | OK | **M2** | | Idem | Idem |
| Fin. obra | CxP | `/cuentas-por-pagar` | Tabla 3 overflow en métricas | — | OK | **M2** | | | Cards + pagar |
| Fin. obra | CxC | `/cuentas-por-cobrar` | **3 tablas overflow** | — | OK | **M2** | | Aging + list | Cards vencidas |
| Fin. obra | Cobrar | `/cuentas-por-cobrar/[id]/cobrar` | Form usable; fecha+monto lado a lado (`48-cobrar-390.png`) | OK | OK | **M1** | | `grid` 2 cols en fecha/monto | `grid-cols-1 sm:grid-cols-2` |
| Fin. obra | Pagar | `/cuentas-por-pagar/[id]/pagar` | Análogo a cobrar | OK | OK | **M1** | | Misma familia | Igual |
| Fin. corp | Tablero | `/finanzas` | KPIs | KPIs | OK | **M2** | | | Consulta |
| Fin. corp | Transacciones | `/finanzas/transacciones` | Ledger | Ledger | OK | **M2** | **P** | `NewTransactionDialog` `sm:max-w-4xl` + IVA/líneas | Flujo corto gasto+foto; dialog actual = desktop |
| Fin. corp | CxP / CxC corp | `/finanzas/cuentas-por-pagar` etc. | Tablas | Tablas | OK | **M2** | | | Consulta + pagar/cobrar |
| Tesorería | Resumen / cuentas | `/tesoreria`, `/cuentas` | Hubs + cards toggle | — | OK | **M2** | | | Consulta saldos |
| Tesorería | Movimientos | `/movimientos` | Ledger ancho | — | Scroll | **M4** | | | Desktop |
| Tesorería | Transferencias | `/transferencias` | Form | — | OK | **M2** | | | Baja prioridad campo |
| Tesorería | Conciliación | `/tesoreria/conciliacion/[id]` | `lg:grid-cols-2` extracto vs movimientos | Roto | Regular | **M4** | | `bank-reconciliation-workspace.tsx` | Desktop-only |
| Config | Empresa / equipo / compras | `/configuracion*` | Forms | — | OK | **M4** | | | Desktop |
| Config | Permisos | `/configuracion/permisos` | Matriz `overflow-x-auto` + Sheet | Roto | Scroll | **M4** | | `permission-matrix-overview.tsx` | Desktop |
| Contab. | Hub / asientos / plan | `/contabilidad*` | Tablas | — | Scroll | **M4** | | | Desktop; no prioridad mobile |
| Invent. | Productos / depósitos | `/inventario*` | Toggle cards | — | OK | **M2** | | | Consulta stock OK como P2 |
| Plat. | `/platform` | — | — | — | **M4** | | Consola interna | Fuera de alcance campo |

---

# 5. Funcionalidades críticas de campo

## Libro de obra — MOBILE PRIORITY

**Hoy:** listado tabla + dialog de alta (`NewJobsiteLogDialog` → `JobsiteLogForm`). El form **ya no es una tabla HTML**: secciones `form-section`, filas de avance/cuadrilla/materiales como cards (`grid-cols-1` / `sm:grid-cols-2`). Clima y turno son `Select`. Fecha `type="date"`.

**Hueco de campo:** las **fotos no están en el alta**. Se adjuntan después en el detalle (`EntityDocumentsPanel` → `DocumentUploadDialog`). Aprobar/devolver está en `JobsiteLogLifecycleDialog` (otro dialog).

**Clasificación:** listado M2; alta M2 (el contenido del form es M1, el **contenedor dialog** es el problema); detalle M2.

**Recomendación:** ruta full-screen `/libro-obra/nuevo` (el redirect actual a `?create=1` se puede invertir en mobile); adjuntar foto en el mismo flujo; lista cards; aprobación en la misma ficha.

## Fotos / documentos — MOBILE PRIORITY

Ver §10. El modelo ya tiene categoría `PHOTO` / `JOBSITE_EVIDENCE` y MIME `image/jpeg|png|webp|heic|heif`. Falta `capture` y preview. Drag-and-drop es **complementario** (hay botón “Seleccionar archivo”).

## Solicitud de compra — MOBILE PRIORITY

`PurchaseRequestForm` crea **una sola línea** (EDT, APU opcional, descripción, cantidad, unidad, fecha, notas). No hay “agregar línea” en el alta. **No hay adjunto en el create.** El dialog cabe mejor que el parte.

**Campo:** sí tiene sentido crear SC desde el teléfono (sobre todo prefill desde Materiales: `?from=` + `wbsNodeId`). Cotizaciones = desktop.

## Orden de compra

| Acción | ¿Campo? | Estado |
|--------|---------|--------|
| Crear OC | No (planificación, líneas, política de cotizaciones) | **M4** |
| Aprobar / devolver | Sí | **M2 + P** — falta ficha compacta: proveedor, monto, partidas, desvíos, docs, Aprobar/Devolver |

`approvePurchaseOrderAction` / `returnPurchaseOrderAction` ya viven en el detalle. El input `returnReason` tiene `w-64` fijo (`ordenes-compra/[poId]/page.tsx`).

## Aprobaciones

No hay inbox unificado. Cada entidad aprueba en su ficha. Notificaciones cubren parte (`PURCHASE_REQUEST_SUBMITTED`, cert sin factura, CxC vencida — visto en `/notificaciones`).

Operaciones con `APPROVE` / revisión:

| Entidad | Estados | UI |
|---------|---------|-----|
| PurchaseOrder | SUBMITTED → approve/return | Detalle OC |
| JobsiteLog | SUBMITTED → approve/return | `JobsiteLogLifecycleDialog` |
| Budget | IN_REVIEW → approve/return | Desktop |
| Certification | ISSUED → approve | Detalle (layout roto en 390) |
| SubcontractCertification | approve → factura AP | Detalle |
| PurchaseRequest | submit (no es el mismo rol APPROVE) | Detalle SC |

**Recomendación:** “Pendientes” de Field Home consultando los mismos servicios (hub de compras + listados filtrados `SUBMITTED` / `ISSUED`), no un motor nuevo.

## Recepción — MOBILE PRIORITY

`ReceiptForm`: depósito, fecha, **tabla** Descripción / Unidad / Pendiente / **Cantidad recibida**, notas. En 390 la 4.ª columna no se ve. No hay foto ni n° de remito en el alta (el remito sería un `Document` después, categoría `RECEIPT`).

Esto **bloquea** el caso de uso de campo más claro después del parte.

## Materiales — MOBILE PRIORITY

Tablero operativo (`getProjectMaterialsBoard`) con ventanas Esta semana / 14 días / mes. CTA Pedir → SC prefill. **Field &lt; `lg`:** cards de faltante (default), KPIs y chips; desktop ≥ `lg` conserva la tabla. Ver Resultado — Materiales Field.

## Consumos — MOBILE PRIORITY

Form compacto (producto, depósito, qty, EDT, notas). Sin foto. Dialog `sm:max-w-lg` — de los más salvables. Listado empty ya es usable.

## Cronograma — no Gantt en el teléfono

Datos ya en `getProjectScheduleWorkspace`: nombre, fechas, `status` (PLANNED / IN_PROGRESS / BLOCKED / COMPLETED), WBS, métricas, atrasados (`delayedOnly=1`). Los KPIs “Atrasados: 6” ya se ven en 390.

Vista mobile (sin Gantt): **Cronograma Field** — chips Hoy / Esta semana / Atrasadas / En curso / Bloqueadas / Completadas; card por tarea. El Gantt de kibo usa hover y drag: **M4** intencional ≥ `lg`.

## Transacciones — MOBILE PRIORITY (gasto rápido)

`NewTransactionDialog` es un wizard AP/AR/tesorería con letra de factura, IVA, líneas y `DocumentUploadZone`. Demasiado para obra. Hace falta un recorte: monto, cuenta, proyecto, concepto, foto, fecha. Misma `registerTransactionAction`.

## Notificaciones — MOBILE PRIORITY

Ya es el embrión de “Pendientes”: cards, CTA `Abrir detalle`, campana en header. M1. Unificar copy con Field Home.

---

# 6. Navegación mobile

## Estado actual (390 px)

1. El sidebar **no se convierte en drawer**. Resta ancho al `main`.
2. No hay hamburger overlay ni cierre al tap fuera.
3. El toggle existe (`#shell-sidebar-toggle`) pero es un icono 36×36 sin texto.
4. Default **abierto** → primer paint inusable.
5. Menú de obra es largo (Planificación, Operación, Compras, Finanzas, Administración) con secciones collapsible — pensado para mouse + altura de desktop.
6. Breadcrumb se colapsa a 3 ítems &lt; 640 px, pero sigue truncando (`Bloqer Demo Co...`).
7. `ModuleSubnav` (tesorería, inventario) hace wrap `basis-[calc(50%-…)]` — razonable.
8. No hay bottom navigation.

## Hipótesis futura `Inicio | Obra | + | Pendientes | Más`

**Viable sin app nueva.** Permisos y módulos ya están en `buildGlobalNavSections` y `buildProjectWorkspaceNavSections`. El `+` puede abrir un action sheet a rutas existentes (`libro-obra?create=1`, `solicitudes-compra?create=1`, recepción, consumo, documentos, `transacciones?register=ap`).

“Obra” = último `/proyectos/[id]` (hoy no hay cookie de “proyecto actual”; se puede reutilizar el path o `getTenantDashboard.projectSummary`).

“Pendientes” = notificaciones + conteos de `getProjectProcurementHub` + partes `SUBMITTED`.

No implementado. El obstáculo real es **cambiar el shell**, no los servicios.

---

# 7. Formularios

Patrones problemáticos (código real):

| Patrón | Dónde | Efecto 390 |
|--------|--------|------------|
| Dialog 90vh para flujos largos | Parte, OC, transacción | Teclado tapa acciones; scroll interno de dialog |
| `grid-cols-3` sin breakpoint | `project-overview-view.tsx` L124 | Fechas `15/01/2...` |
| `grid` 2 cols fecha+monto | Cobrar | Inputs estrechos |
| `w-64` fijo | Devolver OC | Overflow / wrap raro |
| Combobox popover | EDT, producto, contacto | Operable, no es full-screen picker |
| `type="date"` | Parte, recepción, SC | OK en iOS nativo; Chromium audit muestra `mm/dd/yyyy` |
| Sticky submit ausente | Forms largos | CTA al fondo, tapada por teclado |
| Alta en dialog vs página | `libro-obra/nuevo` **redirige** a `?create=1` | En mobile conviene página, no modal |

El form de parte (`jobsite-log-form.tsx`) es el **mejor precedente** de layout mobile (secciones + cards de fila). Reutilizar ese patrón, no el de `ReceiptForm` tabla.

---

# 8. Tablas

Estrategia sugerida por componente:

| Componente | Cols típicas | 390 | Estrategia |
|------------|--------------|-----|------------|
| `PurchaseOrderTable` | 8 | Scroll / corte | **Cards** (`PurchaseOrderCards` ya existe) |
| `PurchaseOrder` líneas (detalle) | 6+ | Corte `Ca...` | Stack por línea |
| `ReceiptForm` tabla | 4 | **Qty fuera** | **Cards** (no scroll: el campo crítico se pierde) |
| `ProjectListSection` | 4+ | Wrap | Cards |
| `ContactListSection` | 3 | CUIT partido | Cards |
| `JobsiteLog` list | 4 | Ajustado al límite | Cards |
| `MaterialsBoardTable` | muchas | Scroll | Card faltante + Pedir |
| `ScheduleTableView` | fechas nowrap | Scroll | Cards tarea |
| `wbs-tree` | árbol + $ | Scroll | Desktop |
| `cost-control-table` | capas $ | Scroll | Desktop |
| `EntityDocumentsPanel` | tabla adjuntos | Scroll | Mini cards + thumb |
| `TableScroll` genérico | — | Scroll horizontal | Solo si ≤ 3 cols imprescindibles |

`ListViewToggle.defaultView = "table"` es el quick win más barato: `defaultView={isNarrow ? "cards" : "table"}` o persistir cards bajo `md`.

---

# 9. Modales

| Dialog | Archivo | 390 | Destino |
|--------|---------|-----|---------|
| Nuevo parte | `new-jobsite-log-dialog.tsx` | 90vh, demasiado | **Full-screen sheet** o página |
| Nueva SC | `new-purchase-request-dialog.tsx` | Aceptable | Sheet |
| Nueva OC | `new-purchase-order-dialog.tsx` | Pesado | Desktop / no campo |
| Consumo | `new-stock-consumption-dialog.tsx` | Aceptable | Sheet |
| Transacción | `new-transaction-dialog.tsx` | Pesado | Sheet corto de gasto |
| Upload | `document-upload-dialog.tsx` `sm:max-w-md` | OK | Sheet + cámara |
| Certificación nueva | `new-certification-dialog.tsx` | Medio | Sheet |
| Lifecycle parte/presupuesto | `*-lifecycle-dialog.tsx` | Cortos | OK o sheet |
| Item cronograma | `schedule-item-dialog.tsx` | Tabs | Desktop |
| APU | `cost-item-apu-dialog.tsx` `max-w-5xl` | No | Desktop |
| AlertDialog / Confirm | `alert-dialog.tsx` | Footer ya `flex-col-reverse` | OK |

`Sheet` de shadcn está listo y casi sin uso de producto.

---

# 10. Cámara y uploads

## Implementación actual

`apps/web/features/documents/components/document-upload-zone.tsx`:

- `<input type="file" class="sr-only">`
- `accept={ALLOWED_MIME_TYPES.join(",")}` en `packages/validators/src/documents.ts`: PDF, **jpeg, png, webp, heic, heif**, Word, Excel, CSV, texto. **No** es `accept="image/*"`.
- **No hay `capture`** (grep 0 en el repo).
- Drag-and-drop **y** botón “Seleccionar archivo”. El DnD no es indispensable.
- Preview: **solo nombre + tamaño**. No hay `<img>`.
- Máx. 50 MB.
- Copy: “Arrastrá un archivo acá” (tono desktop).

Consumidores de `DocumentUploadZone`: `document-form.tsx`, `manual-invoice-form.tsx`, `supplier-invoice-form.tsx`, `new-transaction-dialog.tsx`.

Otros file inputs (no cámara): conciliación CSV/OFX, import WBS, logo tenant (`accept="image/png,image/jpeg,image/webp"`).

`EntityDocumentsPanel` enlaza adjuntos a JOBSITE_LOG, CERTIFICATION, PO, RECEIPT, PR, FACTURAS, SUBCONTRATO, BUDGET.

## Qué pasaría en un teléfono real

Sin `capture`, iOS suele ofrecer “Tomar foto / Fototeca / Explorar”. Android varía. **No** se abre la cámara sola. HEIC está permitido (importante para iPhone).

Storage: si R2 no está configurado, el form muestra warning PLACEHOLDER (metadata sin archivo). Eso es de entorno, no de viewport.

## Recomendación (no implementar ahora)

- Reusar `DocumentUploadZone`.
- En &lt; `md`: copy “Foto o archivo”; `accept="image/*,application/pdf"` opcionalmente + `capture="environment"` en un segundo input “Cámara”.
- Preview blob de imagen.
- Meter el mismo control en alta de parte, recepción y SC.

---

# 11. Cronograma mobile

No portar el Gantt.

**Fuente de datos:** `< lg` → `getProjectScheduleFieldWorkspace` / `ScheduleFieldWorkspaceDto`. `≥ lg` → `getProjectScheduleWorkspace` / `ScheduleWorkspaceDto` (Gantt). Ver Resultado — Cronograma Field.

Filtros posibles mapeados a query actuales:

| UI campo | Ya existe |
|----------|-----------|
| Atrasadas | `delayedOnly=1` |
| En curso / bloqueadas / completadas | `status=` |
| Hoy / semana | **no** hay filtro por ventana; se deriva de `startDate`/`endDate` en cliente o se agrega en el service |

Card sugerida: nombre, fechas, estado, responsable (si está en DTO), % real vs plan (`schedule-progress-dimensions.tsx`), EDT, CTA abrir detalle (dialog actual o ficha).

Kanban drag (`moveScheduleItemStatusAction`) no es el gesto de campo; botones “Iniciar / Completar” sí.

---

# 12. Aprobaciones mobile

Centralizar **presentación**, no reglas:

1. Lista “Pendientes” filtrando por permiso `can(..., "APPROVE", ...)`.
2. Cada ítem deep-link a la ficha existente (mismas URLs).
3. Ficha compacta: quién, qué, cuánto, desvío, 1–3 adjuntos, Aprobar / Devolver.

No hace falta un bounded context nuevo. Notificaciones (`listMyNotifications`) + hub de compras ya acercan el 70 % del conteo.

Presupuesto IN_REVIEW y conciliación **fuera** de esta bandeja.

---

# 13. Qué debe ser desktop-only

Lista explícita:

- Edición WBS / APU / adendas / import CSV de presupuesto
- Gantt (planificar dependencias, zoom, drag fechas)
- Import masivo de cronograma
- Control de costos / rentabilidad / presupuesto vs real (análisis)
- Reportes de obra complejos y programados
- Conciliación bancaria (workspace dos columnas)
- Asientos, reglas de mapeo, cierre de período, sumas y saldos
- Matriz de permisos
- Configuración de empresa, políticas de compras, logo
- Crear OC compleja / comparación de cotizaciones (la **aprobación** sí es mobile)
- Imputación de gastos generales
- Consola `/platform`
- Flujo de caja proyectivo detallado

---

# 14. Arquitectura recomendada

## Misma app responsive (recomendado)

| Capa | ¿Se mantiene? |
|------|----------------|
| URLs | Sí |
| `packages/services` | Sí |
| Server Actions / route handlers | Sí |
| Prisma / estados / `can()` / module gate | Sí |
| Next.js App Router layouts | Sí, **cambiando presentación del shell** |

Cambiar: `ShellLayout` / `SidebarRail` (drawer overlay &lt; `md`), componentes de lista (cards por default), dialogs largos → sheet/página, 2–3 vistas alternativas (cronograma lista, recepción cards). Feature folders ya están en `apps/web/features/*`.

**No** hace falta React Native/Flutter: no hay requisito offline nativo, cámara ni GPS en esta etapa; el cuello es CSS/shell. Una app nativa duplicaría auth, RBAC y 139 services.

## Obstáculos reales (no teóricos)

1. **Sidebar rail vs overlay** — hay que tocar el shell, no un className suelto.
2. **Default tabla** — hay que cambiar `ListViewToggle` o el default por breakpoint; las cards **ya están**.
3. **Alta en dialog + redirect** (`libro-obra/nuevo` → `?create=1`) — en mobile conviene página; es un cambio de routing menor, no de dominio.
4. **Layouts `flex` + `w-56 shrink-0`** (certificación) — no responden solos.
5. **Gantt kibo** — no se “hace responsive”; hay que **no mostrarlo** bajo `lg`.
6. Polling ` /api/notifications/bell` — irrelevante para UX, sí para E2E (`networkidle`).

## App separada

Solo si más adelante se exige offline robusto + cámara nativa + push. Hoy **no**.

---

# 15. PWA

**Estado: inexistente.**

- `app/layout.tsx` `metadata`: solo `title` / `description`.
- No hay `manifest.webmanifest`, iconos instalables, `theme-color`, service worker, `next-pwa` ni Workbox (grep 0).

**Después del responsive:** esfuerzo conceptual medio: manifest + iconos + `display: standalone` + SW de app-shell (cache estático). No cachear mutaciones financieras. Estimación de producto: un sprint de fundación **después** de Field Operations, no antes.

---

# 16. Offline (solo estrategia futura)

### Candidatas a offline

- Borrador de parte (encabezado, clima, observaciones)
- Cola de fotos
- Borrador de SC (1 línea)
- Consulta de tareas de la semana (snapshot)

### Deben permanecer online

- Aprobaciones
- Confirmación OC
- Pagos / cobranzas
- Emisión de factura
- Recepción que mueve stock (o sincronizar con conflicto explícito)
- Cualquier cosa que dispare tesorería o inventario confirmado

No IndexedDB ahora.

---

# 17. Quick wins

Cambios chicos, alto impacto (cuando se autorice implementar):

1. **Sidebar cerrado por default si `max-width &lt; 768`**, y rail → overlay (`Sheet` left) en lugar de `w-64` que empuja `main`. Archivo: `sidebar-shell-context.tsx` + `shell-layout.tsx`.
2. **`ListViewToggle` default `cards` bajo `md`** en OC, proyectos, directorio, recepciones, certificados, documentos. Las cards ya existen.
3. **`ReceiptForm`**: dejar de usar tabla; una card por línea con el input de cantidad visible. Archivo: `receipt-form.tsx`.
4. **Certificación detalle:** `flex-col lg:flex-row` en `certificaciones/[certId]/page.tsx` L167.
5. **Overview proyecto:** `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` en `project-overview-view.tsx` L124.
6. **Devolver OC:** quitar `w-64`; stack motivo + botón.
7. **Copy del uploader** + segundo input `capture="environment"` en `document-upload-zone.tsx` (sin cambiar validación MIME).
8. **Targets:** `ShellSidebarToggle` y botones `size="sm"` de listados a `min-h-11`.
9. **Cronograma:** no montar `ScheduleGanttView` si `window.matchMedia("(max-width: 1023px)")`; mostrar tabla/cards y link “Abrir Gantt en pantalla grande”.
10. **Field CTA en dashboard:** `getTenantDashboard` hoy empuja “Nuevo proyecto / Tesorería”; para campo, reutilizar `QuickActionsCard` con hrefs de obra si hay proyecto activo.

---

# 18. Cambios estructurales

- Shell mobile (drawer + opcional bottom nav).
- `JobsiteLog` como flujo full-screen con foto.
- Vista cronograma “campo” (nuevo componente, mismo DTO).
- Inbox de aprobaciones (UI nueva, queries existentes).
- Recepción + materiales como cards operativas.
- Transacción “gasto de obra” recortada.
- Posible `useMediaQuery` compartido (hoy solo breadcrumb).

---

# 19. Roadmap sugerido

Sin fechas.

1. **Mobile Foundation** — overlay nav, default sidebar cerrado, default cards, fixes flex/grid (cert, overview, OC return).
2. **Field Operations** — parte (página + foto), consumo, documentos/cámara.
3. **Procurement Mobile** — SC sheet + foto; recepción cards; materiales faltante → Pedir.
4. **Approvals** — ficha compacta OC / parte / certificación; lista Pendientes.
5. **Schedule Mobile** — Hoy / semana / atrasadas; Gantt oculto &lt; `lg`.
6. **Financial Quick Actions** — cobrar/pagar ya cerca; gasto + foto.
7. **PWA** — instalable, no offline de mutaciones.
8. **Offline futuro** — borradores parte/fotos.

---

# 20. Conclusión

Bloqer v2 **no está roto como producto**: está **diseñado para un monitor**. En el teléfono, el sistema de diseño ya apila KPIs y tiene tarjetas de listado, pero el **shell las niega** (sidebar 255 px) y las **tablas son el default**.

La primera versión “Bloqer Field” cabe **en la misma app**: mismas URLs, services, permisos y estados. El trabajo es presentación (shell + cards + sheets + una vista de cronograma) y dos agujeros de captura (cámara en parte/recepción/SC).

No conviene un rewrite nativo ahora. Tampoco conviene “hacer responsive todo”: presupuesto APU, Gantt de planificación, conciliación y contabilidad deben permanecer **desktop-only**.

**Situación inicial:** ~3 % M0, ~16 % M1, ~56 % M2, ~7 % M3 (con menú cerrado; el default del shell es M3 transversal), ~18 % M4. El P0 que bloquea campo no es “falta de estética”: es **navegación que se come la pantalla**, **recepción sin la columna de cantidad**, y **fotos fuera del flujo de parte**.

---

## Matriz de priorización

| ID | Funcionalidad | Uso en campo | Estado actual | Impacto | Complejidad | Prioridad |
|----|---------------|--------------|---------------|---------|-------------|-----------|
| F01 | Shell overlay + sidebar cerrado | Todo | M3 default | Muy alto | Media | **P0 Mobile** |
| F02 | Recepción: qty visible + foto | Obra / depósito | M3 | Muy alto | Media | **P0 Mobile** |
| F03 | Parte: página/sheet + foto + enviar | Jefe de obra | M2 | Muy alto | Media-alta | **P0 Mobile** |
| F04 | Default listados a cards | Consulta | M2 | Alto | Baja | **P0 Mobile** |
| F05 | Aprobar OC (ficha compacta) | Dirección en obra | M2 | Alto | Media | **P1 Mobile** |
| F06 | SC crear 1 línea + foto | Pedido urgente | M2 | Alto | Baja-media | **P1 Mobile** |
| F07 | Materiales faltantes → Pedir | Logística | M2 | Alto | Media | **P1 Mobile** |
| F08 | Consumo + foto | Cuadrilla | M1 | Alto | Baja | **P1 Mobile** |
| F09 | Cronograma Hoy/semana/atrasadas | Plan diario | **M1** Field / M4 Gantt | Alto | Media | **Hecho (este lote)** |
| F10 | Aprobar parte | Supervisión | M2 | Alto | Baja | **P1 Mobile** |
| F11 | Documentos / cámara genérica | Evidencia | M1 | Alto | Baja | **P1 Mobile** |
| F12 | Inbox pendientes / notificaciones | Dirección | M1 | Medio-alto | Media | **P1 Mobile** |
| F13 | Certificación: stack + aprobar + CTA factura | Cliente | M3 layout | Medio | Baja | **P1 Mobile** |
| F14 | Field Home (Inicio) | Entrada | No existe | Alto | Media | **P1 Mobile** |
| F15 | Gasto rápido + comprobante | Caja chica | M2 dialog | Medio | Media | **P2 Mobile** |
| F16 | Cobrar / pagar | Admin en campo | M1 | Medio | Baja | **P2 Mobile** |
| F17 | Bottom nav Inicio/Obra/+/Pendientes/Más | Nav | No existe | Medio | Media | **P2 Mobile** |
| F18 | Consulta stock / inventario | Depósito | M2 | Medio | Baja | **P2 Mobile** |
| F19 | PWA instalable | Hábitos | Inexistente | Medio | Media | **P2 Mobile** |
| F20 | Calendario cronograma pulido | Consulta | M2 | Bajo | Baja | **P3 Mobile** |
| F21 | Offline borrador parte/fotos | Obra sin señal | No existe | Alto futuro | Alta | **P3 Mobile** |
| D01 | Gantt planificación | Oficina | M3/M4 | — | — | **Desktop** |
| D02 | APU / WBS edit | Oficina | M4 | — | — | **Desktop** |
| D03 | Conciliación bancaria | Admin | M4 | — | — | **Desktop** |
| D04 | Contabilidad / cierres | Admin | M4 | — | — | **Desktop** |
| D05 | Crear OC compleja / cotizaciones | Compras | M4 | — | — | **Desktop** |
| D06 | Permisos / config empresa | Admin | M4 | — | — | **Desktop** |
| D07 | Reportes analíticos / GG | Gerencia | M4 | — | — | **Desktop** |

---

## Capturas de referencia

Directorio: `docs/bloqer2.0/mobile-audit/screenshots/`.

Representativas del problema:

- `02-dashboard-sidebar-open-390.png` — 255 px de menú, 134 px de contenido
- `03-dashboard-390.png` — mismo dashboard operable con menú colapsado
- `08-project-menu-390.png` — menú de obra + overview destruido
- `18-libro-obra-390.png` / `20-parte-detalle-390.png` — campo, tablas al límite
- `21-materiales-390.png` — toolbar de campo densa
- `27-solicitudes-compra-390.png` — tabla + empty cortado
- `29-ordenes-compra-390.png` vs `30-ordenes-compra-cards-390.png` vs `purchase-orders-1440.png` — el producto **ya tiene** la solución cards
- `32-oc-detalle-390.png` vs `72-oc-detalle-1440.png` — líneas cortadas en 390; aprobar sí está
- `35-recepcion-nueva-390.png` — falta la cantidad
- `41-certificacion-detalle-390.png` — flex + `w-56`
- `63-dashboard-430.png` / `67-dashboard-sidebar-open-768.png` / `71-dashboard-1440.png` — mismo shell a 430 / tablet / desktop
- `68-gantt-768.png` vs `73-gantt-1440.png` — el Gantt recién respira en desktop

Sesión Playwright: ~61 PNG. Tesorería/configuración/diálogos de alta (`19`, `24`, `28`) se evaluaron por código y por respuestas HTML del server local; algunas de esas capturas no se persistieron porque compile + TTFB de Next en cold start superó el timeout de 90 s de `goto`. El diagnóstico no depende de esas fotos: los layouts son los mismos componentes.

Herramienta de captura (no es producto): `docs/bloqer2.0/mobile-audit/mobile-audit.spec.ts` reutiliza `guides/capture/lib`. No apunta a `portal.bloqer.app`.

---

# Resultado — Mobile Foundation

Lote implementado en la misma app (sin Prisma, migraciones, APIs nuevas ni rutas `/mobile`). Capturas post-cambio: `docs/bloqer2.0/mobile-audit/after-foundation/`.

## 1. Shell overlay

* **Antes:** rail `w-64` empujaba `main` (~134 px en 390). Default abierto vía `bloqer:sidebar-open`.
* **Cambio:** `SidebarRail` solo `md:flex`. Mobile usa `Sheet` overlay (`MobileNavSheet`) cerrado por defecto; cierra en backdrop, Escape y cambio de ruta. Persistencia desktop intacta y no abre el overlay.
* **Después:** `main` conserva el ancho del viewport en &lt; `md`. Toggle `min-h-11` en mobile.
* **Estado:** M3 sistémico → **M1** (shell usable; bottom nav sigue fuera de alcance).
* **Screenshots:** `after-foundation/01-dashboard-390-sidebar-closed.png`, `02-dashboard-390-sidebar-overlay.png`, `10-dashboard-1440.png`.

## 2. Cards por default

* **Antes:** `ListViewToggle` y list sections default `table`.
* **Cambio:** `resolveListViewMode` + `useListViewMode` (pathname + breakpoint). Mobile sin preferencia → cards. Desktop → table. URL y storage por breakpoint respetan elección manual.
* **Después:** Proyectos, directorio, OC, documentos, facturas y el resto de listados que ya tenían cards.
* **Estado:** M2 listados con cards → **M1**.
* **Screenshots:** `03-proyectos-cards-390.png`, `04-ordenes-compra-cards-390.png`, `11-ordenes-compra-1440.png`.

## 3. Recepción

* **Antes:** tabla 4 columnas; cantidad recibida fuera de pantalla.
* **Cambio:** cards `md:hidden` por línea; tabla `hidden md:block`. Misma validación/`createPurchaseReceiptAction`.
* **Después:** input de cantidad visible y táctil (44 px).
* **Estado:** M3 + P0 → **M1**.
* **Screenshots:** `05-recepcion-390.png` vs auditoría `35-recepcion-nueva-390.png`.

## 4. Certificación detalle

* **Antes:** `flex` + `w-56` sin apilar.
* **Cambio:** `flex-col lg:flex-row`; panel `w-full lg:w-56`.
* **Después:** totales y CTA debajo de las líneas en 390.
* **Estado:** M3 → **M1**.
* **Screenshots:** `06-certificacion-390.png`.

## 5. Overview proyecto

* **Antes:** `grid-cols-3` en Tipo/Inicio/Fin.
* **Cambio:** `grid-cols-1 sm:grid-cols-3`.
* **Después:** fechas legibles.
* **Estado:** M2 → **M1**.
* **Screenshots:** `07-project-overview-390.png`.

## 6. Devolver OC

* **Antes:** `returnReason` `w-64`.
* **Cambio:** full width + botón apilado en mobile.
* **Después:** sin overflow. Workflow igual.
* **Estado:** ajuste menor, detalle OC sigue **M2** (líneas de la OC).

## 7. Uploader / cámara

* **Antes:** un file input, DnD, sin `capture` ni preview.
* **Cambio:** input cámara `capture="environment"` + “Tomar foto”; “Elegir archivo”; preview blob; Quitar. Validación MIME intacta (incl. HEIC).
* **Después:** dos caminos claros en &lt; `md`. DnD desktop igual.
* **Estado:** upload M1 → **M1** (listo para integrar a parte/recepción en el próximo lote).
* **Screenshots:** `08-uploader-390.png` (página Documentos + trigger; el diálogo de upload en Playwright quedó interceptado por el overlay de Next “Issues” en esta sesión de capturas).

## 8. Targets táctiles

Aplicado en toggle de shell, toggle de listados, recepción, devolver OC, CTA de certificación y botones del uploader (`min-h-11` / `md:min-h-9`).

## 9. Cronograma / Gantt

* **Antes:** Gantt default en 390 (inusable).
* **Cambio:** no se monta `ScheduleGanttView` bajo `lg` (después de hydrate). Mensaje + tabla existente.
* **Después:** 1440 sigue montando Gantt.
* **Estado:** Gantt mobile M3 → **M2** (alternativa tabla; vista Hoy/Semana sigue pendiente).
* **Screenshots:** `09-cronograma-mobile-390.png`, `12-gantt-1440.png`.

---

# Resultado — Field Operations

Lote implementado en la misma app Next.js (sin Prisma, migraciones, APIs nuevas ni rutas `/mobile`). Capturas: `docs/bloqer2.0/mobile-audit/after-field-operations/`.

## 1. Libro de obra — listado

* **Antes:** tabla (y calendario) en todos los viewports.
* **Cambio:** cards `< md` (`JobsiteLogMobileCards`) con fecha, estado, clima/turno, resumen de avance. Tabla + calendario se conservan en `md+`. CTA `+ Nuevo parte` en header y FAB sticky solo en mobile.
* **Después:** listado legible en 390 sin scroll horizontal crítico.
* **Estado:** M2 tabla → **M1**.
* **Screenshots:** `01-libro-list-390.png`, `10-libro-list-430.png`, `11-libro-768.png`, `09-libro-desktop-1440.png`.

## 2. Alta de parte — página full-screen mobile

* **Antes:** `/libro-obra/nuevo` redirigía a `?create=1` y abría `NewJobsiteLogDialog`.
* **Cambio:** `/proyectos/[id]/libro-obra/nuevo` renderiza `JobsiteLogCreateComposer` (mismo `JobsiteLogForm` + actions). `< md` el CTA navega a la página; `md+` mantiene el dialog. `?create=1` en mobile redirige a `/nuevo`.
* **Después:** captura full-screen con footer sticky `Crear parte`.
* **Estado:** dialog mobile M3 → **M1**.
* **Screenshots:** `02-nuevo-parte-390.png`.

## 3. Fotos en el alta del parte

* **Antes:** adjuntos solo después de creado, vía `EntityDocumentsPanel`.
* **Cambio:** cola local (`JobsiteLogEvidencePicker`: Tomar foto `capture="environment"`, Elegir archivo, preview, múltiples). Tras `createJobsiteLogAction` se llama `uploadDocumentAction` secuencial con `linkedEntityType=JOBSITE_LOG` y categoría `JOBSITE_EVIDENCE`. El parte no se revierte si falla un upload. UI: “Parte creado correctamente. N foto(s) no pudo(ieron) subirse” + Reintentar.
* **Después:** Playwright 390 creó parte + fixture y abrió el detalle con adjunto.
* **Estado:** evidencia en alta M3 → **M1**.
* **Screenshots:** `03-parte-foto-preview-390.png`.

## 4. Detalle de parte

* **Antes:** tablas densas; documentos al final.
* **Cambio:** en `< md`, cards compactas de avance/cuadrilla/materiales/incidencias; adjuntos con thumbnails encima de las líneas. `md+` conserva tablas. CTA DRAFT: `Enviar a revisión`. SUBMITTED: banner `Pendiente de aprobación` (aprobación/devolución sigue en el dialog de ciclo de vida).
* **Estado:** detalle M2/M3 → **M1**.
* **Screenshots:** `04-parte-detalle-390.png`, `05-parte-documentos-390.png`.

## 5. Consumos

* **Antes:** tabla; dialog de alta.
* **Cambio:** cards `< md`; Sheet inferior `< md` / Dialog `md+`; targets ≥44px; footer sticky. Sin fotos (ver blocker).
* **Después:** listado y formulario usables. En el tenant demo docs no hay productos/depósitos activos, así que el alta queda deshabilitada por catálogo (no por UI).
* **Estado:** M1 de lectura/alta UI. Foto: no aplica.
* **Screenshots:** `06-consumos-390.png`, `07-nuevo-consumo-390.png`.

## 6. Documentos — uploader E2E

* **Hallazgo Mobile Foundation:** el click “Agregar documento” no abría el dialog en Playwright por overlay Next “Issues”.
* **Verificación:** con overlay `nextjs-portal` removido y `data-testid="document-upload-trigger"` + click `force`, el dialog **sí abre**. Se ven `Tomar foto`, `Elegir archivo` y preview. Clasificación **A (tooling/dev overlay)**, no bug de producto. No se cambió el flujo de negocio.
* **Screenshot:** `08-documentos-camera-390.png`.

## 7. Desktop 1440

Libro de obra: tabla + toggle Tabla/Calendario + dialog de alta. Sin layout de cards. Sin regresiones intencionales.

## Blockers

### BLOCKER-FIELD-CONSUMPTION-PHOTO

`LinkedEntityType` (Prisma) incluye `JOBSITE_LOG` pero **no** incluye consumo / `StockMovement`. `EntityDocumentsLink` tampoco. No se inventó un vínculo a otra entidad.

Para fotos en consumos haría falta (lote futuro, con decisión de producto):

* valor nuevo en `LinkedEntityType` (p. ej. `STOCK_MOVEMENT` o `STOCK_CONSUMPTION`);
* migración Prisma;
* `uploadDocument` / `listEntityDocuments` anclando el movimiento;
* UI reutilizando `DocumentUploadZone`.

Hasta entonces el consumo queda sin foto.

## Clasificaciones M (Field)

| Superficie | Antes | Después |
|---|---|---|
| Libro listado | M2 | **M1** |
| Alta parte | M3 dialog | **M1** página |
| Fotos en alta | no existía | **M1** |
| Detalle parte | M2/M3 tablas | **M1** |
| Workflow parte | enterrado | **M1** CTA visible |
| Consumos listado | M1 tabla | **M1** cards |
| Alta consumo | M1 dialog | **M1** Sheet mobile |
| Foto consumo | — | **blocker** |
| Documentos cámara | M1 + duda E2E | **M1** (E2E = A tooling) |

## REQUIERE VALIDACIÓN DISPOSITIVO REAL

Playwright no ejercita el picker nativo de cámara.

### iPhone Safari

* [ ] Tomar foto abre cámara / selector esperado.
* [ ] HEIC aceptado.
* [ ] Preview aparece.
* [ ] Upload funciona.
* [ ] Foto queda asociada al parte (`JOBSITE_EVIDENCE`).

### Android Chrome

* [ ] Tomar foto.
* [ ] Preview.
* [ ] Upload.
* [ ] Asociación al parte.

## Nota de validador (corregido en Procurement Mobile)

En Field Operations se había relajado `createJobsiteLogSchema.companyId` a `z.string().min(1)` por el PK demo `seed-company-id`. **Esa relajación se revirtió.** El validador volvió a `z.string().uuid()`. El tenant demo usa ahora el company id determinístico `00000000-0000-4000-8000-000000000001`. El seed docs remapea el PK legado si todavía existe.

---

# Resultado — Procurement Mobile

Screenshots: `docs/bloqer2.0/mobile-audit/after-procurement-mobile/`.

## 0. UUID demo

* **Antes:** `company.id = "seed-company-id"` (no UUID) + validador relajado.
* **Cambio:** UUID estable `00000000-0000-4000-8000-000000000001`; remap idempotente en `seed-docs-guide.ts`; `seed.ts` usa el mismo id; `docs-demo-ids.json` se reescribe al seedear.
* **Después:** el alta de parte vuelve a validar UUID de producto.
* **Clasificación:** tooling/demo, no feature.

## 1. Solicitudes — listado

* **Antes:** tabla overflow en 390 (M2).
* **Cambio:** cards `< md` (`PurchaseRequestMobileCards`); tabla `md+`.
* **Después:** código, estado, material, qty/unidad, EDT, solicitante, fechas, proveedor si hay; CTA `Ver solicitud`.
* **Estado:** **M1**.
* **Screenshot:** `01-solicitudes-390.png`.

## 2–3. Nueva solicitud + foto

* **Antes:** dialog; sin evidencia en el alta (M2).
* **Cambio:** página full-screen `< md` (`/solicitudes-compra/nueva`); desktop conserva dialog. Composer + `PendingEvidencePicker`. Upload vía `uploadPendingEntityEvidence` → `PURCHASE_REQUEST` / categoría `OTHER`. Fallo parcial no borra la SC; retry.
* **Después:** flujo Qué / Dónde / Cuándo / Evidencia / Notas; CTA Crear → Enviar (lifecycle DRAFT→SUBMITTED intacto).
* **Estado:** **M1**.
* **Screenshots:** `02-nueva-solicitud-390.png`, `03-solicitud-foto-390.png`.

## 4. Materiales → Pedir

* Deep-link Field: `/solicitudes-compra/nueva?…&from=materiales` (desktop sigue `?create=1` → dialog; mobile redirige a `/nueva`). Tablero Field implementado: ver Resultado — Materiales Field.

## 5. Detalle SC

* **Antes:** tablas (M2).
* **Cambio:** secciones Resumen / Pedido / Evidencia / Cotizaciones consulta. Carga de cotizaciones compleja queda `md+`.
* **Estado:** **M1**.
* **Screenshot:** `04-solicitud-detalle-390.png`.

## 6. Listado OC

Sin redo (Foundation). Solo se usó la ficha de detalle.

## 7–9. Ficha mobile de aprobación OC

* **Antes:** tabla de líneas cortada; Aprobar/Devolver en fila; motivo `w-64` (M2).
* **Cambio:** `PurchaseOrderMobileFiche` (cabecera, control, cards de línea, documentos). `PurchaseOrderApprovalActions`: confirmación corta para Aprobar; Sheet para Devolver con motivo obligatorio. Permisos/actions/estados iguales. Sin swipe ni aprobar desde el listado.
* **Después:** un aprobador ve proveedor, monto, EDT, desvíos existentes, adjuntos y decide en la ficha.
* **Estado:** **M1**.
* **Screenshots:** `05-oc-approval-390.png`, `06-oc-lines-390.png`, `07-oc-return-390.png`.

## 10–12. Recepción + foto

* **Antes:** Foundation ya había cards en el form; sin evidencia en el alta (M3 qty, luego M1 form).
* **Cambio:** CTA `Registrar recepción` evidente desde OC confirmada. Foto/remito con el mismo patrón (`PURCHASE_RECEIPT` / `RECEIPT`). Listado/detalle con resumen y vínculo OC. **No hay campo n° de remito** en Prisma; no se inventó. Mejora futura.
* **Estado:** **M1** (alta+foto). N° remito: no aplica.
* **Screenshots:** `08-recepcion-390.png`, `09-recepcion-foto-390.png`, `10-recepcion-detalle-390.png`.

## 13. Uploader compartido

Extraído `uploadPendingEntityEvidence`, `PendingEvidencePicker`, `PendingEvidenceRetryPanel`, `usePendingEntityEvidence`. Reuso: JobsiteLog, PurchaseRequest, Receipt.

## 14. Catálogo demo

`seed-docs-guide.ts`: producto, depósito, saldo inicial, SC, OC SUBMITTED (aprobar) y OC SUBMITTED (devolver), usuario `docs-pm@bloqer.demo` (`PROJECT_MANAGER`). Desbloquea consumo E2E.

## Clasificaciones M (Procurement)

| Superficie | Antes | Después |
|---|---|---|
| SC listado | M2 | **M1** |
| Alta SC | M2 dialog | **M1** página + foto |
| Detalle SC | M2 | **M1** |
| OC detalle/aprobación | M2 | **M1** |
| Devolver OC | input angosto | **M1** Sheet |
| Recepción alta + foto | M1 form / sin foto | **M1** + evidencia |
| N° remito | — | **no existe en dominio** (futuro) |

## Blockers

Ninguno de producto para el lote. Ausencia de `deliveryNote` / n° de remito: no se tocó Prisma.

## Playwright (390)

* `01` SC + foto fixture + crear + documento vinculado + Enviar → **Enviada**. OK.
* `02` Aprobar OC SUBMITTED (usuario OWNER). OK.
* `03` Devolver OC SUBMITTED con motivo → Borrador. OK.
* `04` `docs-pm@bloqer.demo` (`PROJECT_MANAGER`) no ve Aprobar/Devolver. OK.
* `05` Recepción + foto desde OC confirmada + documento `RECEIPT` + volver a OC. OK.
* `06` Cantidad 999999 → mensaje de tolerancia / “excede”. OK.
* `07` Consumo demo (Cemento Portland demo / CEM-DEMO-50) **registrado**. OK.

Screenshots 390/430/768/1440: OK (`after-procurement-mobile.spec.ts`).

Nota de tooling: el filtro de filename `procurement-mobile.spec.ts` también matchea `after-procurement-mobile.spec.ts`. Correr flujos con `--grep "Procurement Mobile flows"`. El server de Next a veces reinicia por memoria durante el POST; el test 01 recarga si aparece el error de cliente.

## Desktop 1440

Tabla SC, dialog de alta, tabla OC detalle, sin cards de aprobación. Screenshot `11-procurement-desktop-1440.png`.

## REQUIERE VALIDACIÓN DISPOSITIVO REAL

Playwright no abre el picker nativo de cámara.

### iPhone Safari / Android Chrome

* [ ] Tomar foto en SC y recepción.
* [ ] HEIC.
* [ ] Preview y upload.
* [ ] Vínculo `PURCHASE_REQUEST` / `PURCHASE_RECEIPT`.
* [ ] Sheet Devolver + teclado no tapa el CTA.

---

# Resultado — Field Navigation & Daily Work

Screenshots: `docs/bloqer2.0/mobile-audit/after-field-navigation/`.

Misma app Next.js. Sin Prisma, migraciones, modelo `Pending`, API mobile ni workflows duplicados. Pendientes es una **proyección** de entidades existentes.

## 1. Field Home (`/dashboard`, `< md`)

* **Antes:** el dashboard corporativo de KPIs (8 indicadores, gráfico, alertas) era la home también en 390. No había “en qué obra estoy” ni acciones de campo.
* **Cambio:** CSS split. `< md` renderiza `MobileFieldHome` (Suspense + skeleton). `md+` conserva `DesktopDashboard` (Panel de control). Encabezado (empresa, usuario, campana) sigue siendo el shell existente.
* **Contenido:** card de obra (nombre, código, estado, `Abrir obra`); hasta 4 acciones rápidas filtradas por `can()` + module gates; resumen **Hoy** (máx. 5 ítems de `scheduleItem`, sin Gantt); conteos de **Pendientes** + CTA `Ver pendientes`.
* **Sin obra determinada:** `Seleccionar obra` — no se asume DEMO-001.
* **Usuario sin proyectos:** variante `field-home-corporate`.
* **Estado:** **M1** (home de campo).
* **Screenshots:** `01-field-home-390.png`, `02-field-home-pendientes-390.png`, `09-field-home-viewer-390.png`, `field-home-430.png`.

## 2. Contexto de proyecto

* **Fuente de verdad:** ` /proyectos/[id]/… ` (`extractProjectIdFromPath`).
* **Conveniencia:** cookie no-HttpOnly `bloqer-last-project-id` al visitar una obra. No es autorización; el server revalida tenant/acceso. `MobileFieldHome` hidrata la card con el id de conveniencia del cliente si el RSC no trajo featured.
* **Mutaciones:** el Action Sheet **solo navega**. Sin projectId válido abre el picker; nunca dispara una acción contra una obra arbitraria.

## 3. Bottom nav (`< md`)

`Inicio | Obra | + | Pendientes | Más`. `md:hidden`. Safe area: `padding-bottom: env(safe-area-inset-bottom)` en el nav; `main` con `pb-[calc(4.25rem+env(safe-area-inset-bottom))]` salvo rutas immersive.

Rutas immersive (nav oculto): alta/edición de parte, alta de SC, alta de recepción.

Active state: `aria-current` + `font-semibold` (no solo color). Badge solo en Pendientes (`9+`). Campana intacta.

768/1440: nav no visible. Screenshot `03-bottom-nav-390.png`, `10-dashboard-768.png`, `11-dashboard-1440.png`.

## 4. `+` Action Sheet

Navega a flujos ya existentes: Nuevo parte, Registrar consumo, Subir documento/foto, Solicitud de compra. Sin crear OC, certificación, recepción genérica ni gasto rápido. Si no hay contexto → picker `Seleccionar obra` (DEMO-001 / DEMO-002). Screenshot `04-plus-sheet-390.png`, `05-project-selector-390.png`.

## 5. Más

Sheet agrupado. **Proyecto** (si hay contexto): Resumen, Pendientes (esta obra), Libro de obra, Materiales, Tablero de compras, Documentos, Cronograma — filtrados desde `buildProjectWorkspaceNavSections`. **General:** Pendientes (todas las obras), Proyectos, Directorio, Notificaciones (campana es el acceso principal; Más conserva el enlace — [D-087]). **Cuenta:** Perfil, Cerrar sesión. Sin APU/conciliación/contabilidad. El drawer/sidebar Foundation sigue siendo el menú completo. Screenshot `08-mas-sheet-390.png`.

## 6. Bandeja `/pendientes` y `/proyectos/[id]/pendientes`

Nueva ruta de presentación. No reemplaza `/notificaciones`. [D-087]: inbox **personal de empresa** (`/pendientes`) + atajo **de obra** (`/proyectos/[id]/pendientes`, sidebar Resumen).

Service read-only `getMyFieldPendingItems` / `getMyFieldPendingCounts`. Fuentes v1 (antes de Prisma, filtradas por `fieldPendingSourcesForActor`):

| Fuente | Estado | Permiso / gate | Deep link |
|---|---|---|---|
| OC | `SUBMITTED` | `canApprovePurchaseOrders` + módulo PROCUREMENT | ficha OC |
| Parte | `SUBMITTED` | `canSuperviseJobsiteLog` + JOBSITE_LOG | detalle parte |
| Cert. cliente | `ISSUED` | `APPROVE CERTIFICATIONS` + CERTIFICATIONS | detalle |
| Cert. subcontrato | `ISSUED` | `canEditSubcontractsArea` + SUBCONTRACTS | detalle |

No hay tabla Pending. No se aprueba desde la card (`Revisar` → ficha). Chips: Todos / Compras / Obra / Certificaciones; en la bandeja de empresa, `Todas las obras` si hay >1 proyecto. Empty: “No tenés acciones pendientes.” + CTA de obra según [D-087] (Volver a {código} / Ir a {código} / Ver proyectos) / Ver notificaciones.

OWNER ve OC+parte+certs. PROJECT_MANAGER no recibe OC ni cert. cliente **en el service** (no solo UI). VIEWER: cero fuentes. Screenshots `06-pendientes-390.png`, `07-pendientes-compras-390.png`.

## 7. Rendimiento

Agregador: `Promise.all` de hasta 4 queries (`count` para badge; `findMany take 80` para inbox). Sin N+1 por proyecto. `queryMs` expuesto en `data-query-ms`. Layout: pending counts en paralelo con campana / module gate / logo (`Promise.allSettled`). Field Home: proyectos + pending counts + schedule (40 filas) en paralelo.

Medición local (dev, caliente): `/pendientes` ~1.5 s; `/dashboard` ~5–7 s (incluye el desktop dashboard **oculto** por CSS en mobile — trade-off del split RSC). Materiales/actividad reciente **no** se consultaron (caros).

## 8. Seed demo

Idempotente en `seed-docs-guide.ts`: `DEMO-002` (Ampliación Demo Sur, mínimo); CERT cliente nº 2 `ISSUED`; CERT-SC nº 2 `ISSUED`; `docs-viewer@bloqer.demo` (`VIEWER`). OC `SUBMITTED` y parte `SUBMITTED` ya existían. IDs `a00000f0`–`f4`.

## 9. Permisos / gates

Sin RBAC mobile nuevo. `listFieldQuickActions` y Field Home `actions` reusan `can()`. Snapshot de módulos en el layout para `+` / Más. VIEWER: sin CTAs de creación ni badge de pendientes de aprobación.

## 10. Clasificaciones M

| Superficie | Antes | Después |
|---|---|---|
| `/dashboard` 390 | M2 tablero corporativo | **M1** Field Home |
| Navegación campo | sidebar overlay | **M1** bottom nav + Más |
| Aprobaciones | enterradas en módulos | **M1** bandeja `/pendientes` |
| `/dashboard` 768/1440 | M0/M1 desktop | **sin cambio de layout** (sí aparece Pendientes en nav General) |

## 11. Playwright

* Flujos 390 (`Field Navigation flows`): 7 passed (OWNER home, PM sin consumo, VIEWER sin create, bottom nav/`+`/Más/immersive, OWNER vs PM pendientes, picker DEMO-002, nav ausente en 768/1440).
* Screenshots: `after-field-navigation.spec.ts` — 390 + 430/768/1440.

Correr con `--grep "Field Navigation flows"` / `"Field Navigation after screenshots"` (el `testMatch` también agarra `after-*.spec.ts`).

## 12. Before / after

* **Antes:** abrir Bloqer en el teléfono era el ERP desktop comprimido; la obra, las aprobaciones y el alta de parte exigían el menú completo.
* **Después:** Inicio muestra la obra (o pide elegirla), Hoy, pendientes y 4 acciones; `+` registra; Pendientes lista lo que hay que aprobar; Obra vuelve al proyecto; Más cubre el resto de campo. Aprobar sigue en la ficha.

## Desktop

1440: Panel de control intacto. Única adición global: ítem **Pendientes** bajo General (también útil en desktop). Sin bottom nav.

## Fuera de scope (no implementado)

PWA/offline/push/GPS; gasto rápido; remito Prisma; fotos de consumo; contabilidad; aprobar desde la bandeja.

## REQUIERE VALIDACIÓN DISPOSITIVO REAL

* [ ] Safe area iPhone (Home indicator vs bottom nav).
* [ ] Teclado en altas immersive (nav oculto).
* [ ] Sheet `+` / Más / picker con Escape y focus.

---

# Resultado — Cronograma Field

Screenshots: `docs/bloqer2.0/mobile-audit/after-schedule-field/`.

Misma app Next.js, misma ruta `/proyectos/[id]/cronograma`, mismos `Schedule` / `ScheduleItem`, mismos services y actions. Sin `FieldTask`, sin tabla Prisma, sin API mobile, sin Gantt miniatura, sin drag, sin scroll horizontal. Sin migraciones.

## Arquitectura

**Antes (lote Field inicial):** la ruta siempre llamaba `getProjectScheduleWorkspace` (Gantt + control de costos + APU por categoría). Field filtraba el DTO desktop en cliente. Warm `data-query-ms` ≈ 4.5–5.3 s.

**Después:** dos read-models, un solo árbol por request.

| Viewport (`bloqer-viewport`) | Data source | UI |
|---|---|---|
| `sm` (&lt;768) o `md` (768–1023) o cookie ausente | `getProjectScheduleFieldWorkspace` | Cronograma Field |
| `lg` (≥1024) | `getProjectScheduleWorkspace` (sin cambios) | Gantt / Kanban / tabla / calendario |

La cookie reutiliza `ViewportHintSync` (matchMedia, no User-Agent). Se agregó el valor `lg` para distinguir 768 (Field) de 1440 (Gantt). El dashboard sigue tratando `md` **y** `lg` como desktop (`md` = ≥768 como antes).

No se montan los dos árboles de datos en la misma request.

DTO Field (`ScheduleFieldWorkspaceDto`): hojas activas con `id`, `name`, `type`, `status`, `blockReason`, fechas, `progressPct`, `timePlanPct`, `daysLate`, WBS, `predecessorIds` / `predecessorNames`, `canEdit`. KPIs hoja: en curso / atrasadas / bloqueadas / completadas.

No carga: `getProjectCostControl`, APU / `costAnalysisLine`, métricas financieras por ítem, successors, rollup de contenedores para Gantt, `availableBudgets`.

Permisos, gates `PROJECTS`+`SCHEDULE`, `computeDaysLate`, `computeTimePlanProgressPct` y `moveScheduleItemStatusAction` son los mismos. Filtros Hoy/Semana/estado siguen en helpers puros (`schedule-field.ts`).

## Filtros y deep links

Chips: Hoy (default mobile) · Esta semana · Atrasadas · En curso · Bloqueadas · Completadas · Todas.

URL: `?field=today|week|delayed|in_progress|blocked|completed|all` (`field=day` es alias de today). Refresh conserva el filtro. `itemId=` abre el detalle.

## Semántica Hoy

Producto TZ `America/Argentina/Buenos_Aires`. Una tarea (o hito) entra en Hoy si su rango `startDate`–`endDate` (ISO `YYYY-MM-DD`, sin `new Date("YYYY-MM-DD")`) **incluye el día de hoy**. Cubre: empieza hoy, termina hoy, o atraviesa hoy. No entra si terminó ayer o empieza mañana. Hitos: un solo bound.

Field Home «Hoy» usa la misma superposición (ítems no COMPLETED/CANCELLED).

## Semántica Semana

Lunes–domingo de la semana calendario en TZ de producto (`productWeekMondaySundayBounds`). **No** es el preset de listados `computeDateRangePreset("week")` (lunes→hoy). Entra si el rango se solapa con la semana (empieza dentro, termina dentro, o cruza). Las tareas largas que empezaron antes siguen visibles.

## Semántica Atrasada

La misma de desktop: `computeDaysLate` (hojas, no COMPLETED/CANCELLED, días calendario de producto posteriores a `endDate`). El KPI «Atrasadas» usa `summarizeScheduleFieldKpis` sobre **todas** las hojas del read-model Field (no sobre el tope de 200).

## Timezone

`toIsoDateInTimeZone` / `productCalendarDateUtc`. Casos cerca de medianoche UTC cubiertos en unit tests.

## Cards

Nombre; badge de estado (Planificada / En curso / Bloqueada / Completada) o «Hito»; fechas compactas `19 ago → 23 ago`; `Real % · Plan %` desde `progressPct` / `timePlanPct` (no hay fórmula mobile); `N días de atraso` si aplica; EDT primario si existe. **No hay responsable** en `ScheduleItem`. Borde `destructive` si atrasada o bloqueada.

## Detalle mobile

Sheet inferior (no se duplica el dialog desktop). Nombre, estado, EDT, fechas, plan/real, motivo de bloqueo, `Depende de: …` si hay predecesoras en el DTO.

## Acciones

Solo transiciones existentes vía `moveScheduleItemStatusAction`: **Iniciar** (PLANNED→IN_PROGRESS), **Completar** (IN_PROGRESS→COMPLETED), **Bloquear** (con causa obligatoria), **Reanudar** (BLOCKED→IN_PROGRESS). El server revalida `canEditScheduleArea`. VIEWER no ve botones.

## Progreso / Libro de obra

Status y progreso siguen separados. No se asigna 50%/100% al cambiar estado. El **Real** del cronograma es `ScheduleItem.progressPct`, sincronizado al **aprobar** un parte (`schedule-progress-sync`). Field V1 **no** expone «Actualizar avance» manual para no competir con el libro. Tampoco «Ver último parte» (exigiría `getScheduleItemContext` extra).

## Field Home

`Ver cronograma` → `?field=today` si el módulo SCHEDULE está habilitado. Tocar una tarea de Hoy → `?field=today&itemId=`. Si el módulo está off, no se deep-linkea al cronograma.

## Permisos y gates

`canViewScheduleArea` / `canEditScheduleArea`. Módulo `SCHEDULE` (+ `PROJECTS`) igual que desktop. Sin permisos Field nuevos. Bottom nav sin sexto ítem: se llega desde Inicio, Más y Obra.

## Escalabilidad / tope 200

El read-model Field trae **todas** las hojas activas (sin paginación). Los chips filtran y ordenan en cliente (`history.replaceState`, sin refetch). El tope 200 es **solo display**: `filterAndSortScheduleFieldItems` y recién después `limitScheduleFieldItems` (slice 200).

Si hay 300 hojas y una atrasada está en la posición 250 de «Todas», **sigue apareciendo en Atrasadas** (el filtro corre antes del cap). El KPI cuenta las 300. Si un filtro puntual supera 200 coincidencias, se muestran 200 y un texto «Mostrando 200 de N…». No hay paginación extra.

## Offline / PWA / push

No implementados.

## Seed demo (Neon `dev` only)

Ítems determinísticos `Campo: …` en `seed-docs-guide.ts` (hoy, semana, atrasada, bloqueada, en curso, completada, hito). No se tocó production ni seeds productivos.

## Clasificaciones M

| Superficie | Antes | Después |
|---|---|---|
| Cronograma Gantt mobile | M3 | **M4** intencional (no se monta &lt; `lg`) |
| Cronograma ejecución Field | no existía | **M1** |

## Playwright

`docs/bloqer2.0/mobile-audit/cronograma-field.spec.ts` — skip `bloqer.app` / `vercel.app`. Viewports 390, 430, 768 (lista Field), 1440 (Gantt). Cookie `bloqer-viewport` `sm`/`md`/`lg` alineada al viewport para no cargar el DTO desktop en mobile.

3 passed (OWNER 390 + VIEWER + 430/768/1440). `data-query-ms=1241` `data-schedule-source=field` en 390 (primera pintura E2E tras compile). Gantt 1440 visible; Field ausente.

## Performance

Medición local (Neon `dev`, DEMO-001, 12 `ScheduleItem`):

**Desglose `getProjectScheduleWorkspace` (warm):** total **3398 ms** — `getProjectCostControl` **1306 ms**; ítems+deps **711 ms**; `ensureScheduleForProject` **574 ms**; APU/`costByCategory` **284 ms**; rollup **146 ms**; count **142 ms**; currency **147 ms**; module gate **76 ms**. Cold: **4266 ms** (cost control **1941 ms**). Payload ítems+summary ≈ 5.6 KB.

**`getProjectScheduleFieldWorkspace` (warm):** total **597 ms** — `ensureScheduleForProject` **288 ms** + `scheduleItem.findMany` (WBS + predecesoras) **305 ms**. Cold **651 ms**. Payload ≈ 4.1 KB. 12 hojas.

| | BEFORE | AFTER Field |
|---|---|---|
| Causa de 4.5–5.3 s | `getProjectCostControl` (certificaciones, OC, subcontratos, AP, inventario, partes) + APU por categoría + métricas Gantt | ya no corre en Field |
| Service warm | 3.4 s (workspace) | **0.6 s** |
| Playwright `data-query-ms` | ≈ 4.5–5.3 s | **1241 ms** (390, primera E2E) |
| Queries Field | decenas | `ensureScheduleForProject` + 1 `findMany` |
| HTTP GET Field (Next, caliente) | ≈ 4.9–5.4 s | ≈ 2.4 s |

Costo que queda en Field (~0.6 s service / ~1.2 s queryMs E2E): round-trips Neon de schedule + ítems/WBS/predecesoras (incluye `ensureScheduleForProject`, que aún trae ids de ítems). No es control de costos.

Los chips Field **no** vuelven a consultar el servidor. Desktop ≥ `lg` sigue en el workspace completo; no se reemplazó su DTO.

---

# Resultado — Materiales Field

Screenshots: `docs/bloqer2.0/mobile-audit/after-materials-field/`.

Misma app Next.js, misma ruta `/proyectos/[id]/materiales`, mismo `getProjectMaterialsBoard`. Sin `MaterialRequirement`, sin stock paralelo, sin Prisma/migraciones, sin PWA/offline. Sin tocar Cronograma Field ni Field Home.

## Arquitectura

**Antes:** `/materiales` siempre llamaba `getProjectCostControl` (solo para `availableBudgets`) y después el board operativo. Esa es la misma clase de costo que Cronograma (~5 s).

**Después:** un solo árbol por request, mismo umbral `lg` (1024) que Cronograma Field. 768 usa cards (la tabla desktop es demasiado densa). No se cambiaron breakpoints globales.

| Viewport (`bloqer-viewport`) | Data source | UI |
|---|---|---|
| `sm` / `md` / cookie ausente | `getProjectMaterialsBoard(..., { window: "all" })` — **sin** `getProjectCostControl` | Materiales Field |
| `lg` (≥1024) | `getProjectCostControl` + board (sin cambios) | Tabla / KPIs / Varianza ($) |

No se creó `getProjectMaterialsFieldBoard`: el board ya trae necesidad/pedido/recibido/faltante en pocas queries. El recorte de Field es no montar control de costos ni la pestaña Varianza.

DTO extra en la misma fila (`MaterialsBoardRow`), reglas idénticas:

- `pendingReceiptQty` = max(0, ordered − received)
- `requiredStart` / `requiredEnd` desde vínculos de cronograma (min/max por EDT, TZ de producto)
- `relatedPurchaseRequestId` / `relatedPurchaseOrderId` solo si hay **exactamente un** `costAnalysisLineId`
- `productSku` en un `findMany` de productos (no N+1)

Helpers cliente: `@bloqer/services/materials-field` (no importar el barrel `server-only` desde el cliente).

Filtros/búsqueda/cap en cliente (`history.replaceState`, sin refetch).

## Semántica faltante

La del board, sin redefinir supply planning:

`shortfallQty = max(0, needQty − orderedQty)`

`needQty` = necesidad física APU ([D-047]). `orderedQty` = SC `SUBMITTED`/`QUOTE_SELECTED` **sin** OC confirmada+ **más** líneas de OC `CONFIRMED`/`PARTIALLY_RECEIVED`/`RECEIVED`.

**Cubierto** = need > 0 y shortfall ≈ 0 (ordered ≥ need). No es saldo de depósito.

## Stock / disponible

`getProjectMaterialsBoard` **no** expone saldo de depósito. `consumedQty` es consumo confirmado, no available. Field **no** muestra “Disponible: N u.” de warehouse ni desglose multi-depósito (exigiría `getStockBalance` por producto+depósito → N+1). Se muestran Necesario / Pedido / Recibido / Faltante. Recibido ≠ stock en depósito.

## Esta semana

Lunes–domingo en TZ de producto (`productWeekMondaySundayBounds`), igual que Cronograma Field. Entra si el rango `requiredStart`–`requiredEnd` se solapa. Sin fecha de cronograma → no entra en «Esta semana» ni en «Próximos 14 días» (hoy → hoy+13 inclusive).

## Pedidos / por recibir

**Pedidos:** `orderedQty > 0`. **Por recibir:** `pendingReceiptQty > 0` (ordered − received). No se estima desde UI.

Labels derivados (no persistidos): Sin pedir / Pedido / Parcial / Recibido.

## Orden (Faltantes)

1. vencidos (`requiredEnd` &lt; hoy); 2. se solapan con hoy; 3. esta semana; 4. resto / sin fecha. Dentro del mismo rango: fecha, mayor faltante, nombre. **No** alfabético primero.

## Cap 200

Filtro + sort **después** slice 200. KPIs sobre el set completo. Un faltante en la posición 250 de «Todos» sigue apareciendo en Faltantes.

## Cards / Sheet

Card: nombre, unidad, EDT, fechas, Necesario/Pedido/Recibido/Faltante, Por recibir si aplica, badge Faltante o Cubierto + estado de abastecimiento. CTA `Pedir` o `Solicitud creada` + `Ver solicitud`. Sin consumo como CTA principal (`+` global ya existe).

Sheet: contexto + SC/OC únicas si hay id. `Ver OC` → ficha OC (recepción sigue en la OC). No hay «Registrar recepción» desde la card de material.

## Pedir → SC

Href Field: `/solicitudes-compra/nueva` con prefill existente (EDT, descripción, qty faltante, unidad, productId, costAnalysisLineId, `from=materiales`). Sin campos nuevos. VIEWER no ve el CTA; `canEditPurchaseRequests` + gate `PROCUREMENT`. Backend sigue siendo la defensa.

## SC existente

Solo si hay **un** `costAnalysisLineId` en una SC ordered. 0 o &gt;1 → se mantiene `Pedir`. Nunca se matchea por nombre/descripción.

## Permisos y gates

Consulta: `canViewProjectCostControlReport` o `VIEW PROJECTS` + módulos `PROJECTS`+`BUDGETS`. `Pedir`: `PROCUREMENT` + `canEditPurchaseRequests`. OWNER/PM: consulta + Pedir. VIEWER: consulta, sin Pedir. Sin gate `FIELD_MATERIALS`. Cross-tenant: `project.findFirst` con `tenantId`. Cross-project: shell/board por `projectId`+tenant. Field Home **no** carga el board.

## Navegación

Más → Materiales (ya estaba en `buildProjectWorkspaceNavSections`). Bottom nav sin sexto ítem.

## Performance

Playwright 390 `data-query-ms` **1014–1619** `data-materials-source=field` (warm). Queries Field ≈ las del board (proyecto, presupuesto, WBS, APU MATERIAL, PR/PO/consumos/cronograma en paralelo, +1 SKU). Se eliminó `getProjectCostControl` del árbol Field (certificaciones, OC, subcontratos, AP, inventario, partes).

Los chips no refetch. Desktop ≥ `lg` sigue igual.

## Tests

Unit: shortage/covered, pending receipt, semana lun–dom, urgencia, cap-antes-de-slice, Pedir vs SC única, OWNER/PM/VIEWER `canEditPurchaseRequests`, board FORBIDDEN sin roles.

Playwright `docs/bloqer2.0/mobile-audit/materials-field.spec.ts` — skip `bloqer.app` / `vercel.app`. 3 passed (OWNER 390 + VIEWER + 430/768/1440). Neon `dev`.

## Seed demo (Neon `dev` only)

PR Field de Caño PVC con `costAnalysisLineId` (Ver solicitud). Vínculos EDT extra para fechas (hormigón hoy, revoque semana, carpintería atrasada). Idempotente. No production.

## Fuera de scope

Prisma/migraciones; PWA/offline; stock de depósito; recepción genérica; consumo como CTA de card; Field Home KPI de faltantes; Cronograma Field; BUG-014; AI; reorder.


