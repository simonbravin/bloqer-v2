# AG-02 — Navegación y sistema visual compartido

## 1. Encargo y base

Auditoría con correcciones y verificación, autorizada el 03/11/2026. Cierre limitado a AG-02; AG-03 no se inicia automáticamente. Se continúa [AG-01](./2026-11-03-ag-01-identity-access.md) y el [plan global](../PLATFORM_AUDIT_PLAN.md).

- Rama: `codex/pruebas`; HEAD: `3b5ae7a038465ad6b3d60cde19c278a31019e165`. Sin commit, merge o publicación de esta corrida.
- Base real: [snapshot inicial](../../../../output/platform-audit/ag-02-2026-11-03/initial-snapshot.json), con SHA-256 de 2.085 archivos de código/documentación seleccionados por extensión, estado Git y autorización de navegador. El árbol ya contenía correcciones AG-00/01 y trabajo ajeno; no se atribuye todo el diff contra HEAD a esta fase. El manifest final conserva esas extensiones y agrega solo las cinco capturas creadas explícitamente en AG-02; no etiqueta otros binarios, schema o configuración sin hash inicial como archivos nuevos de esta fase.
- Atribución final: [manifest de cambios](../../../../output/platform-audit/ag-02-2026-11-03/changes.json), comparado con hashes iniciales; no incluye secretos ni archivos de entorno.
- Se preservaron, entre otros, el plan Indari y los archivos previos de reconciliación factura/OC. No se agregaron dependencias, campos persistidos, estados de dominio, reglas financieras o migraciones.
- Entorno: Next 15.5.18 local, `http://localhost:3100`, PostgreSQL `bloqer_audit_ag01_20261103` en el compute dev; datos sintéticos existentes. Se comprobó `current_database()` antes del arranque. Email, almacenamiento y AI externos deshabilitados; archivos de entorno sin modificar.
- Navegador local explícitamente autorizado por el usuario. Se usaron cuentas sintéticas OWNER y VIEWER; la consola se habilitó solo para el email sintético mediante configuración del proceso, sin otorgar roles nuevos en la DB. Autenticación y preferencias de presentación pueden tener sus efectos habituales; no se confirmó ninguna mutación operativa o financiera.

## 2. Fuentes y alcance

Fuentes: [reglas raíz](../../../../AGENTS.md), [reglas canónicas](../../AGENTS.md), [arquitectura](../README.md), [roadmap](../IMPLEMENTATION_ROADMAP.md), [permisos](../../02-modules/USERS_AND_PERMISSIONS.md), [proyectos](../../02-modules/PROJECTS.md), [notificaciones](../../02-modules/NOTIFICATIONS.md), [frontend](../FRONTEND_ARCHITECTURE.md), [requisitos no funcionales](../../07-non-functional/NON_FUNCTIONAL_REQUIREMENTS.md), [runbook](../PLATFORM_AUDIT_RUNBOOK.md) y [registro](./README.md). Se aplicaron las skills locales de auditoría y ayuda operativa.

### Inventario y cobertura

- **Empresa:** navegación global, barras de área, encabezados, listado de proyectos, filtros, vistas tabla/cards, formularios y estados vacíos. Listado/alta siguen usando getCurrentUser → permisos/gate → servicios existentes → Prisma en packages/database. La presentación no agrega acceso directo a DB desde web.
- **Proyecto:** ProjectShellProvider → API de shell → servicio de proyecto → alcance existente de empresa/membresía; caché e invalidación observadas. Resumen y calendario como consumidores representativos. No se reauditan cifras ni circuitos financieros de esos módulos.
- **Field:** contexto por ruta/preferencia → navegación → /api/field/projects → listFieldProjects → alcance autorizado. Se inspeccionaron estados de carga, vacío, error y cancelación; se navegó el picker positivo. El listado se consulta bajo interacción, sin nueva consulta global.
- **Plataforma:** menú y recuperación propios, sin Field. Se navegó la consola con metadatos SaaS sintéticos; no se modificaron organizaciones.
- **Controles comunes:** Dialog, AlertDialog, Sheet, SearchableCombobox, confirmaciones, etiquetas de detalle, encabezados, ordenamiento y tokens. La referencia real continúa en apps/web; no se creó un segundo design system.
- **Ayuda/AI:** Guía §1.1/5.1 y catálogo in-app actualizados en el mismo lote. Índice documental reproducido y comprobado. Dos fichas nuevas: navegar-entre-empresa-y-obra y recuperar-una-pantalla. No se alteró la capacidad de herramientas AI ni se hicieron llamadas al proveedor.
- **Datos/finanzas/externos:** sin cambio de schema, dinero, transacciones, emails, archivos ni jobs. Las garantías de aislamiento siguen siendo las documentadas en ADR-018 y AG-01; no se vuelven a certificar desde estas pruebas UI.

Regresión ampliada únicamente a consumidores demostrados: configuración, nav de proyecto, accesos de Field, creación/vacíos de proyecto y recuperación SaaS. Los recorridos operativos completos de módulos se conservan para sus etapas.

## 3. Evidencia de recorridos

- **R-01 Empresa y teléfono:** OWNER entra al dashboard, abre/cierra menú, selecciona la misma ruta, usa teclado y navega listado/cards/tabla. Se detectaron y corrigieron el UUID recordado inválido para el contexto y encabezados superpuestos. Se midió ausencia de overflow del documento; las tablas amplias desplazan dentro de su panel.
- **R-02 Formulario/selector:** abrir alta, abrir cliente con flecha, buscar sin coincidencias, cerrar con Escape y enviar formulario vacío. Se observaron foco en Código, errores asociados y mensajes en español; no salió una alta válida al servidor. El popover final mide 366px con x=12 en un viewport de 390px.
- **R-03 Proyecto:** abrir obra sintética desde listado y cargar resumen real. Se comprueban shell contextual, breadcrumbs y un Dialog de Pausar sin confirmar la acción. En 390×400 el contenido mide unos 345px, mantiene márgenes y scroll disponible.
- **R-04 Plataforma:** entrar desde menú de usuario y comprobar consola en 390×844 en ambos temas. No existe FieldBottomNav y el padding inferior del main es 16px.
- **R-05 Lectura y vacío:** iniciar sesión VIEWER, comprobar listado sin CTA de alta y filtrar Borrador sin resultados. El vacío mantiene filtros y navegación y no invita a una acción que el rol no puede ejecutar. Entrada directa a /proyectos/nuevo vuelve al listado.
- **R-06 Recuperación:** una ruta inexistente mostraba 404 en inglés sin salida. Se comprobó la versión española y el enlace Ir al inicio. Los fallbacks de error de segmento se revisaron en código y tipos; no se forzó una caída de negocio para producirlos.
- **R-07 Concurrencia:** pruebas sobre código real con red y hooks controlados: respuesta tardía A tras B cacheada; abandonar proyecto; invalidar durante una solicitud; doble confirmación, rechazo y pending externo. Son unidades controladas, no una certificación del scheduler concurrente de React en navegador.

Capturas, mediciones y límites en [verificación de navegador](../../../../output/platform-audit/ag-02-2026-11-03/browser-verification.json). El servidor local se interrumpió una vez sin excepción de aplicación registrada; se reinició y se repitió la autenticación con otro secreto efímero. Hubo esperas de compilación en frío y un intento de DB rechazado en ejecución restringida que pasó al reintentarlo con la ejecución autorizada; no se atribuyen a errores del producto sin evidencia.

## 4. Hallazgos y correcciones

Se resolvieron 21 grupos. Todos los IDs se originan en esta corrida; el nº020 es robustez del API compartido con alcance explícito. Las prioridades expresan el impacto en este alcance, no una brecha de autorización del servidor. Estado común: **corregido en árbol local**; sin publicación.

### GA-AG-02-001 — Configuración ignoraba permisos y módulos

- **P2 · Defecto/desviación confirmada**. Ubicación: `global-workspace-nav / configuracion-subnav`.
- Antes / reproducción: Con SETTINGS/USERS apagados o un rol operativo aparecían accesos a pantallas que el servidor rechaza.
- Corrección y resultado esperado: El menú y la subnav derivan General, Equipo, Permisos y Políticas de los mismos permisos y gates existentes.
- Fuente modificada: [global-workspace-nav.ts](../../../../apps/web/lib/global-workspace-nav.ts), [configuracion-subnav.ts](../../../../apps/web/lib/configuracion-subnav.ts), [layout.tsx](../../../../apps/web/app/(app)/configuracion/layout.tsx).
- Evidencia: shell-navigation.test.ts. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-002 — Subsecciones financieras ignoraban el módulo padre

- **P2 · Defecto/desviación confirmada**. Ubicación: `buildGlobalWorkspaceNav`.
- Antes / reproducción: Tesorería o Contabilidad podían mostrar hijos con su área principal apagada.
- Corrección y resultado esperado: Las secciones del menú global requieren el módulo padre y conservan los gates de cada hijo. ModuleSubnav unifica el estado activo y el alias de transferencias; no agrega dependencias entre gates.
- Fuente modificada: [global-workspace-nav.ts](../../../../apps/web/lib/global-workspace-nav.ts), [module-subnav.tsx](../../../../apps/web/components/layout/module-subnav.tsx).
- Evidencia: shell-navigation.test.ts. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-003 — Resumen y documentos de Field omitían PROJECTS

- **P2 · Defecto/desviación confirmada**. Ubicación: `project-workspace-nav / field-quick-actions / getFieldHome`.
- Antes / reproducción: Se ofrecía Resumen o Subir documento/foto aunque el servicio exige PROJECTS.
- Corrección y resultado esperado: La navegación, acciones rápidas y DTO Field usan el requisito existente de PROJECTS.
- Fuente modificada: [project-workspace-nav.ts](../../../../packages/services/src/project/project-workspace-nav.ts), [field-home.service.ts](../../../../packages/services/src/field/field-home.service.ts), [field-quick-actions.ts](../../../../apps/web/lib/field-quick-actions.ts).
- Evidencia: project-workspace-nav.test.ts; field-isolation.test.ts; field-nav.test.ts. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-004 — Siete migas enlazaban contenedores sin página

- **P2 · Defecto/desviación confirmada**. Ubicación: `getShellBreadcrumb`.
- Antes / reproducción: Agrupadores de certificaciones de subcontrato (tres casos), recepciones de OC (uno), facturas de empresa (dos) y pagos a proveedor (uno) generaban enlaces 404. Invitaciones sí tiene página y conserva su enlace.
- Corrección y resultado esperado: Solo las pantallas existentes se enlazan; los contenedores quedan como texto y se conservan los ancestros válidos.
- Fuente modificada: [shell-breadcrumb.ts](../../../../apps/web/lib/shell-breadcrumb.ts), [shell-breadcrumb.tsx](../../../../apps/web/components/layout/shell-breadcrumb.tsx).
- Evidencia: shell-breadcrumb.test.ts; inventario de páginas app/platform. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-005 — Estado activo e identificadores del menú ambiguos

- **P2 · Defecto/desviación confirmada**. Ubicación: `NavItem / CollapsibleNavSection`.
- Antes / reproducción: El enlace activo no anunciaba aria-current y rail/drawer duplicaban IDs al montarse juntos.
- Corrección y resultado esperado: Los links activos anuncian la página y cada instancia del panel tiene IDs únicos.
- Fuente modificada: [nav-item.tsx](../../../../apps/web/features/shell/components/nav-item.tsx), [collapsible-nav-section.tsx](../../../../apps/web/features/shell/components/collapsible-nav-section.tsx).
- Evidencia: smoke móvil y revisión del DOM. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-006 — Cierre y foco del menú móvil incompletos

- **P2 · Defecto/desviación confirmada**. Ubicación: `MobileNavSheet / ShellLayout`.
- Antes / reproducción: Elegir la ruta actual no cerraba el menú y Escape no devolvía foco al disparador; faltaba salto al contenido.
- Corrección y resultado esperado: El menú cierra por selección y devuelve foco al botón; Ir al contenido principal enfoca main.
- Fuente modificada: [shell-layout.tsx](../../../../apps/web/components/layout/shell-layout.tsx), [sidebar-shell-context.tsx](../../../../apps/web/components/layout/sidebar-shell-context.tsx).
- Evidencia: smoke Escape, ruta actual y skip link. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-007 — La consola SaaS mostraba navegación de Field

- **P2 · Defecto/desviación confirmada**. Ubicación: `PlatformShell`.
- Antes / reproducción: La consola sin contexto operativo renderizaba barra inferior y espacio reservado de campo en teléfono.
- Corrección y resultado esperado: PlatformShell desactiva FieldNavigation; conserva su menú y el área útil de pantalla.
- Fuente modificada: [platform-shell.tsx](../../../../apps/web/components/layout/platform-shell.tsx), [shell-layout.tsx](../../../../apps/web/components/layout/shell-layout.tsx).
- Evidencia: platform-light-390-after.jpg; DOM fieldNavCount=0. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-008 — Preferencia de obra frágil entre sesiones y empresas

- **P2 · Defecto/desviación confirmada**. Ubicación: `last-project-cookie / active-tenant / auth-session-actions`.
- Antes / reproducción: Una cookie malformada podía lanzar URIError; salir o cambiar realmente de empresa conservaba la preferencia.
- Corrección y resultado esperado: El parser ignora valores inválidos; logout y cambio real limpian la preferencia; refrescar la misma empresa la conserva.
- Fuente modificada: [last-project-cookie.ts](../../../../apps/web/lib/last-project-cookie.ts), [active-tenant.ts](../../../../apps/web/lib/active-tenant.ts), [auth-session-actions.ts](../../../../apps/web/lib/auth-session-actions.ts).
- Evidencia: last-project-cookie.test.ts; active-tenant.test.ts. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-009 — La navegación confiaba en una obra recordada sin validarla

- **P2 · Defecto/desviación confirmada**. Ubicación: `FieldBottomNav / FieldPlusSheet / FieldProjectPickerSheet`.
- Antes / reproducción: En el smoke, Obra dirigía a un UUID antiguo ajeno al contexto; un fallo del selector se presentaba como lista vacía.
- Corrección y resultado esperado: Desde áreas generales Obra va al listado; Más usa la ruta actual; Registrar valida la preferencia contra obras visibles al abrir. Carga, vacío, error y Reintentar se distinguen.
- Fuente modificada: [field-bottom-nav.tsx](../../../../apps/web/features/field/components/field-bottom-nav.tsx), [field-more-sheet.tsx](../../../../apps/web/features/field/components/field-more-sheet.tsx), [field-plus-sheet.tsx](../../../../apps/web/features/field/components/field-plus-sheet.tsx), [field-project-picker.tsx](../../../../apps/web/features/field/components/field-project-picker.tsx).
- Evidencia: field-navigation.test.ts; smoke picker con dos obras sintéticas. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-010 — Una respuesta tardía reemplazaba el proyecto vigente

- **P2 · Defecto/desviación confirmada**. Ubicación: `ProjectShellProvider / fetchProjectShell`.
- Antes / reproducción: Navegar A→B cacheado permitía que la respuesta tardía A dejara datos/sidebar desincronizados; invalidar podía repoblar caché vieja.
- Corrección y resultado esperado: Cleanup e identidad de solicitud impiden aplicar respuestas de una ruta o solicitud invalidada.
- Fuente modificada: [project-shell-context.tsx](../../../../apps/web/lib/project-shell-context.tsx).
- Evidencia: project-shell-context.test.ts: tres órdenes controlados de respuesta. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-011 — Combobox ancho y asociaciones accesibles incompletos

- **P2 · Defecto/desviación confirmada**. Ubicación: `SearchableCombobox`.
- Antes / reproducción: El mínimo de 28rem excedía móviles; faltaban ref/atributos de formularios y nombres del buscador/lista en español.
- Corrección y resultado esperado: Ancho y alto acotados al viewport, margen de colisión, forwardRef/atributos, apertura por flechas y labels CmdK en español.
- Fuente modificada: [searchable-combobox.tsx](../../../../apps/web/components/ui/searchable-combobox.tsx).
- Evidencia: smoke 390: x=12, ancho=366; búsqueda sin resultados; Escape devuelve foco. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-012 — Diálogos y paneles sin límite de área útil

- **P2 · Defecto/desviación confirmada**. Ubicación: `DialogContent / AlertDialogContent / SheetContent`.
- Antes / reproducción: Contenidos largos o ventanas bajas podían dejar controles fuera de alcance; el cierre del Dialog se anunciaba Close.
- Corrección y resultado esperado: Diálogos con márgenes, altura dinámica y scroll; sheets con límite de viewport y scroll; cierre Cerrar.
- Fuente modificada: [dialog.tsx](../../../../apps/web/components/ui/dialog.tsx), [alert-dialog.tsx](../../../../apps/web/components/ui/alert-dialog.tsx), [sheet.tsx](../../../../apps/web/components/ui/sheet.tsx).
- Evidencia: dialog-short-light-390x400.jpg; altura 345px en viewport de 400px. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-013 — Confirmaciones quedaban bloqueadas después de un fallo

- **P2 · Defecto/desviación confirmada**. Ubicación: `ConfirmDialog / ConfirmAlertDialog / ReasonAlertDialog`.
- Antes / reproducción: submitting se restablecía solo al cerrar; consumidores como aplicar plantilla o desactivar regla mantienen abierto el diálogo cuando falla.
- Corrección y resultado esperado: Hook común con exclusión síncrona, espera de promesa, finally recuperable, error seguro y respeto de pending externo. Cancelar/cierre bloqueados durante la operación.
- Fuente modificada: [use-confirmation-action.ts](../../../../apps/web/hooks/use-confirmation-action.ts), [confirm-dialog.tsx](../../../../apps/web/components/ui/confirm-dialog.tsx), [reason-alert-dialog.tsx](../../../../apps/web/components/ui/reason-alert-dialog.tsx).
- Evidencia: use-confirmation-action.test.ts: 3 casos; inspección de consumidores; diálogo real sin confirmar mutación. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-014 — Etiquetas repetidas de detalle duplicaban IDs

- **P2 · Defecto/desviación confirmada**. Ubicación: `DetailField`.
- Antes / reproducción: Dos campos con igual etiqueta/icono compartían aria-labelledby.
- Corrección y resultado esperado: useId genera asociaciones únicas por instancia y el contenido permite partir palabras.
- Fuente modificada: [detail-field-grid.tsx](../../../../apps/web/components/ui/detail-field-grid.tsx).
- Evidencia: detail-field-grid.test.ts: render SSR con etiquetas duplicadas. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-015 — Etiquetas de formulario y composición estrecha

- **P2 · Defecto/desviación confirmada**. Ubicación: `ProjectForm / ProjectFilters / PageListHeader / ProjectOverviewView`.
- Antes / reproducción: Etiquetas de proyecto sin htmlFor, errores sin asociación, filtro sin nombre y error Required del cliente; columnas de formulario/datos demasiado angostas.
- Corrección y resultado esperado: Labels e IDs únicos, aria-invalid/describedby y alertas; mensaje de cliente español; formulario a una columna móvil; encabezados flexibles y metadatos con espacio en tablet.
- Fuente modificada: [project-form.tsx](../../../../apps/web/features/projects/components/project-form.tsx), [project-filters.tsx](../../../../apps/web/features/projects/components/project-filters.tsx), [project.ts](../../../../packages/validators/src/project.ts), [page-list-header.tsx](../../../../apps/web/components/ui/page-list-header.tsx), [project-overview-view.tsx](../../../../apps/web/features/projects/overview/project-overview-view.tsx).
- Evidencia: project.test.ts; smoke de validación vacía sin envío al servidor. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-016 — Encabezados de tabla se superponían en teléfono

- **P2 · Defecto/desviación confirmada**. Ubicación: `SortableTableHead / ProjectTable`.
- Antes / reproducción: A 430px Código/Nombre y Tipo/Estado se montaban entre celdas; los valores se truncaban excesivamente.
- Corrección y resultado esperado: Headers limitados a su celda con nombre completo accesible; la tabla de proyectos conserva ancho legible con scroll dentro del panel.
- Fuente modificada: [sortable-table-head.tsx](../../../../apps/web/components/ui/sortable-table-head.tsx), [project-table.tsx](../../../../apps/web/features/projects/components/project-table.tsx).
- Evidencia: projects-table-light-430.jpg antes; projects-table-light-430-after.jpg después. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-017 — Contraste insuficiente de errores y texto secundario

- **P2 · Defecto/desviación confirmada**. Ubicación: `tokens CSS / Badge destructive`.
- Antes / reproducción: Rojo claro sobre blanco y rojo oscuro sobre fondos oscuros no alcanzaban 4.5:1; muted claro sobre workspace y hover del badge requerían ajuste.
- Corrección y resultado esperado: Se conserva el tono rojo con luminancia adecuada por tema, texto del botón coherente y hover destructive a 90%.
- Fuente modificada: [globals.css](../../../../apps/web/app/globals.css), [badge.tsx](../../../../apps/web/components/ui/badge.tsx).
- Evidencia: contrast-iteration.json; contrast-after.json; temas medidos desde DOM. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-018 — Carga y fallos carecían de recuperación común en español

- **P2 · Defecto/desviación confirmada**. Ubicación: `not-found / error / loading`.
- Antes / reproducción: La ruta inexistente mostraba el 404 genérico inglés sin enlace para continuar; faltaban fallbacks comunes de las áreas.
- Corrección y resultado esperado: 404 con Ir al inicio; error con Volver a cargar/Ir al inicio sin detalles privados; inicio SaaS /platform; carga anunciable. Revisión independiente corrigió el destino SaaS y aria-busy del status.
- Fuente modificada: [not-found.tsx](../../../../apps/web/app/not-found.tsx), [error.tsx](../../../../apps/web/app/error.tsx), [error.tsx](../../../../apps/web/app/(app)/error.tsx), [error.tsx](../../../../apps/web/app/(platform)/error.tsx), [page-error-state.tsx](../../../../apps/web/components/ui/page-error-state.tsx), [workspace-loading-state.tsx](../../../../apps/web/components/ui/workspace-loading-state.tsx), [loading.tsx](../../../../apps/web/app/(app)/loading.tsx), [loading.tsx](../../../../apps/web/app/(platform)/loading.tsx).
- Evidencia: not-found-before.jpg; not-found-after.jpg; tipos y revisión independiente. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-019 — El resaltado de vencimiento no generaba CSS

- **P3 · Defecto/desviación confirmada**. Ubicación: `FieldPendingCard`.
- Antes / reproducción: Tailwind avisaba theme(colors.destructive/30%) inválido y descartaba la sombra interior.
- Corrección y resultado esperado: La sombra usa hsl(var(--destructive)/0.3), compatible con el token de ambos temas.
- Fuente modificada: [field-pending-card.tsx](../../../../apps/web/features/field/components/field-pending-card.tsx).
- Evidencia: advertencia inicial del servidor y compilación posterior. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-020 — Robustez y etiquetas del calendario compartido

- **P3 · Mejora de robustez**. Ubicación: `MonthCalendarGrid`.
- Antes / reproducción: El API opcional onDayClick recibía teclado de un evento hijo; flechas sin nombre accesible. El consumidor actual no pasa onDayClick.
- Corrección y resultado esperado: Se ignora bubbling del hijo; Mes anterior/Mes siguiente y anuncio del mes. Mejora del contrato compartido; no se atribuye un fallo operativo al consumidor actual.
- Fuente modificada: [month-calendar-grid.tsx](../../../../apps/web/components/ui/month-calendar-grid.tsx).
- Evidencia: inspección del componente y consumidor libro de obra; tipos/lint. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

### GA-AG-02-021 — Crear proyecto se ofrecía a usuarios de solo lectura

- **P2 · Defecto/desviación confirmada**. Ubicación: `ProyectosPage / NuevoProyectoPage / ProjectListSection`.
- Antes / reproducción: Header y vacíos mostraban Crear proyecto sin permiso EDIT; la ruta de alta cargaba contactos antes de comprobar permiso/módulo aunque el servicio rechazaba la mutación.
- Corrección y resultado esperado: CTA derivada de can(EDIT,PROJECTS), propagada a cards/table. Alta comprueba permiso y gate antes de contactos; sin permiso vuelve al listado y con módulo apagado al inicio.
- Fuente modificada: [page.tsx](../../../../apps/web/app/(app)/proyectos/page.tsx), [page.tsx](../../../../apps/web/app/(app)/proyectos/nuevo/page.tsx), [project-list-section.tsx](../../../../apps/web/features/projects/components/project-list-section.tsx), [project-cards.tsx](../../../../apps/web/features/projects/components/project-cards.tsx), [project-table.tsx](../../../../apps/web/features/projects/components/project-table.tsx).
- Evidencia: project-create-controls.test.ts: 5 casos; smoke VIEWER. La cobertura visual específica se limita a los recorridos de §3; inspección estática no equivale a smoke.

## 5. Documentación y decisiones

[Guía operativa](../../GUIA_OPERATIVA_BLOQER_V2.md) y catálogo de ayuda describen navegación por contexto, selector y reintento, recuperación y CTA según permisos. El índice AI tiene 513 chunks, prefijo de hash `f810cf88b98f`. Los cambios de color, IDs y límites de contenedores son cosméticos/internos sin nueva regla operativa ni herramienta AI; quedan documentados como referencia visual. No surgió una decisión de producto pendiente ni se cambió una decisión registrada.

La revisión independiente detectó dos desajustes intermedios de los componentes nuevos (inicio de error SaaS y aria-busy en el status) y la etiqueta interna de CmdK; se corrigieron antes del cierre. No se presentan como defectos históricos adicionales.

## 6. Verificación

### Aprobada

- `pnpm run typecheck --force --concurrency=2`: 13/13 tareas, sin caché. [Log final](../../../../output/platform-audit/ag-02-2026-11-03/typecheck-final.log).
- `pnpm run lint --force --concurrency=2`: ESLint packages + web, cero errores/advertencias. [Log final](../../../../output/platform-audit/ag-02-2026-11-03/lint-final.log). El último ajuste de clase de Badge se verificó además desde la configuración de web.
- `pnpm run test --force --concurrency=2`: 9/9 tareas; **1.754 casos aprobados, cero fallos, cero casos omitidos**. Hay **13 suites live omitidas**, separadas del recuento de casos. [Log](../../../../output/platform-audit/ag-02-2026-11-03/test-final.log), [resumen con suites omitidas](../../../../output/platform-audit/ag-02-2026-11-03/test-summary.json) e [inventario de 259 archivos seleccionados por los scripts mantenidos](../../../../output/platform-audit/ag-02-2026-11-03/test-inventory.json). Son 29 casos unitarios adicionales frente a AG-01. Tras ajustar un intent de ayuda, las 31 pruebas de su catálogo/búsqueda se repitieron con éxito; no se suman otra vez al total.
- `pnpm ai:index-docs` y `pnpm ai:check-docs-index`: índice vigente. [Log](../../../../output/platform-audit/ag-02-2026-11-03/ai-index.log).
- `git diff --check`: sin errores de espacios. Avisos CRLF en archivos previos, sin convertirlos en masa.
- Contraste medido desde CSS computado y fórmula sRGB WCAG para pares concretos y fondos usados: [resultado](../../../../output/platform-audit/ag-02-2026-11-03/contrast-after.json). Incluye relleno/hover y mensaje sobre fondo teñido. No certifica todo el producto ni todos los colores de dominio.

### Fallos durante el trabajo, corregidos

- La primera prueba SSR del nuevo test necesitaba React en alcance al ejecutarse con tsx/JSX clásico; corregido y aprobada después.
- Lint encontró children-prop en el test SSR; se usó el runtime JSX y se repitió lint completo con éxito.
- Una invocación dirigida de ESLint desde la raíz ignoraba web por su configuración; se repitió en apps/web con éxito. No se omitió la revisión del archivo.
- Las mediciones ampliadas detectaron hover del badge y rojo sobre muted por debajo del objetivo; se ajustaron antes de la medición final.

### Omitida / no ejecutada

- Las 13 suites live requieren flags/DB o proveedores. Esta corrida de unidades se hizo con credenciales externas y flags live eliminados del proceso. AG-01 conserva sus 91 comprobaciones PostgreSQL aisladas; no se cuentan otra vez aquí.
- No se ejecutaron build/deploy, migraciones, email/R2/OpenAI, dispositivos físicos ni smoke de portal. Los cambios locales no están publicados.
- El atajo de zoom nativo no cambió la escala en el navegador integrado; se verificó reflow a 720×500, sin presentarlo como zoom nativo al 200%. No se usó lector de pantalla real ni auditoría WCAG completa.
- Error/reintento de consulta del picker: inspección de código; las unidades de navegación no ejecutan el fetch ni su rechazo. El smoke recorrió carga y selección positiva, sin inducir un fallo de red. La recuperación de confirmaciones se probó con callbacks controlados; no se confirmó una operación de negocio para forzar un error.

### Referencia visual reutilizable

Ver [criterios y ejemplos AG-02](./AG02_VISUAL_REFERENCE.md). Viewports emulados: 390×844, 430×932, 768×1024, 1440×1000; adicional 390×400 para diálogos, 390×240 para el picker con scroll y 720×500 para reflow. Ambos temas se comprobaron en consumidores representativos, no en el producto entero. Los montos y fechas mostrados pertenecen a fixtures; no se validan sus reglas financieras en esta etapa.

## 7. Revisión independiente

Se delegaron navegación/contratos, controles compartidos y estados visuales. Los agentes de controles/visuales se interrumpieron por capacidad del proveedor; el coordinador completó y verificó su alcance. El agente de navegación entregó su lote y luego revisó independientemente el de controles/estados, formulario, tabla y guards de creación; no editó esos archivos productivos durante la revisión. Aportó tres correcciones resueltas y cinco regresiones de creación. El coordinador revisó navegación y efectuó el smoke. No hubo un revisor humano ni revisión externa de todos los archivos históricos del árbol.

## 8. Cierre y continuación

Los 21 grupos están corregidos; no queda un hallazgo confirmado de AG-02 pendiente de decisión. Las limitaciones de §6 son cobertura declarada, sin afirmar perfección de toda la plataforma. No se publicaron cambios ni se modificó producción.

El plan queda detenido antes de **AG-03 — Directorio y proyectos**. Revalidar estos patrones cuando cambien gates, DTO de shell, controles compartidos, acciones o temas. Mantener los IDs si aparece una regresión y ampliar solo a sus consumidores afectados.
