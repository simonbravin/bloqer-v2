# AG-07 — Inventario y depósitos

**Estado: AG-07 cerrada, corregida y verificada localmente.** D-130 implementada; 38 grupos verificados. AG-05/06 publicadas; AG-07 sin publicar y AG-08 no iniciada.

## Encargo, base y alcance

Campaña de auditoría y corrección por etapas,04–05/11/2026. Base limpia 4a9af2816abdb41595b0fbda23ea0c7afb75646e en codex/pruebas, fijada después del commit AG-05/06. Se revisaron catálogos, consumos, transferencias, saldos y fronteras con recepción, partes, costos, contabilidad, avisos y exports. El [registro estructurado](./2026-11-04-ag-07-inventory.json) conserva inventarios, aliases, archivos/funciones y resultados.

Fuentes: [INVENTORY](../../02-modules/INVENTORY.md), [WAREHOUSES](../../02-modules/WAREHOUSES.md), [MOVE_INVENTORY](../../05-workflows/MOVE_INVENTORY.md), STOCK_FORMULAS, BR-INV001–008, D-053/083/111/124, ADR-018, schema y contratos reales. No se inventaron capas, estados, campos persistidos o conversiones.

Escrituras únicamente en bloqer_audit_ag01_20261103, compute dev curly-math, con identidad efectiva comprobada antes de fixtures. Externos deshabilitados; sin cambios de .env, schema, migraciones ni dependencias. La [publicación anterior](./2026-11-04-ag-05-ag-06-publication.md) acredita PR4/Production74bb2c9d por separado.

## Definición aprobada para el cierre

**Q-077 resuelta en D-130 e implementada.** El Owner aprobó ambas protecciones el 05/11/2026. Unidad fija con referencias y compatibilidad antes de efectos nuevos, sin conversiones ni cambios históricos, verificadas en SQL/UI. El material del parte usa la unidad del producto; no tiene una unidad independiente.

## Recorridos y cuatro inventarios

1. Catálogos: UI/Actions→Zod→Product/Warehouse service→Prisma/audit; edición, lifecycle, compartidos y empresa propia.
2. Consumo: obra activa/opciones autorizadas→Action/schema→Project/stock locks→relectura/grafo/disponible→movimiento/audit atómicos→historial/costos/invalidation.
3. Transferencia: preview vigente→número de empresa/par atómico/replay→detalle/listado por depósito→reversa con saldo y auditoría indivisibles.
4. Recepción/parte: locks compartidos de todos los depósitos ordenados antes de productos; importe nuevo2dp sin redondear temprano precio/cantidad y sin backfill.
5. Lecturas/export: autorización y grafo completo; saldo físico por producto/depósito separado de imputación y de detalle por ACL. CSV/PDF/JSON/filtros coherentes, desconocidos sin ceros ficticios.
6. Finanzas/avisos: sin asientos nuevos por consumos nominales sin moneda/capa; costo comprobable común a ficha y reporte; negativo físico con audiencia activa de su empresa/obra.

Los inventarios documentado/implementado/expuesto/probado completos están en JSON y handoffs; no se acredita UI desde pruebas de servicio ni despliegue desde código local.

## Hallazgos consolidados

38 grupos corregidos y verificados (incluyen dos regresiones transitorias detectadas y reparadas durante la auditoría). Sin hallazgos confirmados pendientes en este alcance. Las repeticiones de pruebas se deduplican.

### GA-AG-07-001 — Catálogos y movimientos limitados por empresa y acceso de obra

- **P1; corregido y verificado localmente.** Alias: AG07-BE-01.
- **Observado:** Varias entradas usaban solo tenant y aceptaban filtros o UUIDs de otra empresa; los depósitos de obra podían leerse/seleccionarse sin ACL del proyecto.
- **Corrección/decisión:** Scope común por tenant, empresa de documento y obra; Product nullable conserva compartidos; Warehouse obligatorio conserva propia empresa; el contexto global mantiene lecturas autorizadas.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 1, 2, 6, 9, 15, 17, 26. Fuentes y funciones exactas en el JSON.

### GA-AG-07-002 — Grafo de padres completo antes de consumir labels o existencias

- **P1; corregido y verificado localmente.** Alias: AG07-BE-02.
- **Observado:** Una FK del mismo tenant podía relacionar movimiento con producto/depósito/WBS de otra empresa o con un padre contradictorio; comprobar solo UUID no demuestra pertenencia.
- **Corrección/decisión:** Include canónico y validación de producto, depósito, obra, presupuesto/WBS, recepción/líneaOC y transferencia. Budget.companyId null compartido es válido en su propia obra; las contradicciones fallan antes de devolver datos o sumar saldo.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 10, 16, 17, 25. Fuentes y funciones exactas en el JSON.

### GA-AG-07-003 — Unicidad del SKU compartido y nombre de depósito frente a concurrencia

- **P1; corregido y verificado localmente.** Alias: AG07-BE-03.
- **Observado:** El índice nullable de Product no evitaba dos SKU iguales con companyId null; lectura previa de nombre de depósito podía perder frente a un alta/rename concurrente.
- **Corrección/decisión:** Bloqueo estable de Tenant para catálogo compartido o Company para catálogo propio antes de comprobar y crear; la edición de depósito serializa la comprobación de nombre por empresa.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 4, 5. Fuentes y funciones exactas en el JSON.

### GA-AG-07-004 — Edición parcial y lifecycle de catálogos con auditoría atómica

- **P2; corregido y verificado localmente.** Alias: AG07-BE-04.
- **Observado:** Campos opcionales no se podían vaciar de forma explícita y algunas mutaciones podían quedar persistidas si fallaba la auditoría posterior.
- **Corrección/decisión:** Conservar undefined frente a null explícito y registrar before/after dentro de la misma transacción, bajo relectura del padre bloqueado; VIEWER y módulos deshabilitados no mutan.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 3, 7, 8. Fuentes y funciones exactas en el JSON.

### GA-AG-07-005 — Consumo revalidado dentro del bloqueo operativo

- **P1; corregido y verificado localmente.** Alias: AG07-BE-05.
- **Observado:** El consumo validaba proveedor de stock/proyecto/WBS antes de la transacción y podía operar con estado, relaciones o disponibilidad anteriores.
- **Corrección/decisión:** Bloquear proyecto y claves físicas; releer producto/depósito y WBS vigentes, comprobar estado activo y pertenencia, y validar disponible dentro de la misma escritura. No se amplía una empresa ni un proyecto por una selección de UI.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 9, 10, 11, 12, 15. Fuentes y funciones exactas en el JSON.

### GA-AG-07-006 — Consumo idempotente con notas y auditoría indivisible

- **P1; corregido y verificado localmente.** Alias: AG07-BE-06.
- **Observado:** Reintentos o sustituciones del payload podían duplicar un consumo o devolver como idéntico un intento con notas distintas; auditoría fuera de la TX permitía efectos parciales.
- **Corrección/decisión:** Fingerprint canónico con notas y comprobación de replay bajo serialización de stock, un único movimiento/efecto y audit dentro de la transacción; rollback cuando falla audit.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 12, 13, 14. Fuentes y funciones exactas en el JSON.

### GA-AG-07-007 — Par de transferencia, numeración y replay atómicos

- **P1; corregido y verificado localmente.** Alias: AG07-BE-07.
- **Observado:** Dos altas podían disputar el mismo número de empresa o dejar cabecera/piernas/auditoría desparejas; un replay debía conservar número y contenido.
- **Corrección/decisión:** Project→Company→claves físicas; número máximo bajo bloqueo de Company, cabecera y dos movimientos en una TX junto con audit, y comparación completa del intento para reutilizar la misma transferencia.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 18, 19, 24. Fuentes y funciones exactas en el JSON.

### GA-AG-07-008 — Orden canónico de bloqueos físicos compartido con recepción y parte

- **P1; corregido y verificado localmente.** Alias: AG07-BE-08.
- **Observado:** Transferencias inversas o escritores que bloqueaban pares producto/depósito de distinto orden podían formar un ciclo; agrupar cada pareja separada no ordenaba el conjunto completo.
- **Corrección/decisión:** Adquirir todos los depósitos ordenados antes de todos los productos ordenados. El helper común se usa en transferencias, reversa de recepción y stock de partes, conservando firmas y efectos documentados.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 20. Fuentes y funciones exactas en el JSON.

### GA-AG-07-009 — Estado de todas las obras ligadas a una transferencia

- **P1; corregido y verificado localmente.** Alias: AG07-BE-09.
- **Observado:** Una transferencia sin projectId explícito podía modificar stock de un depósito de obra pausada o inaccesible.
- **Corrección/decisión:** Autorizar y bloquear las obras reales del documento y sus depósitos antes de crear/cancelar; mantener projectId nullable sin inventar una obligatoriedad nueva.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 17, 21, 26. Fuentes y funciones exactas en el JSON.

### GA-AG-07-010 — Reversa de transferencia sin stock negativo ni piernas ajenas

- **P1; corregido y verificado localmente.** Alias: AG07-BE-10.
- **Observado:** Anular podía cambiar los movimientos por FK sin comprobar el par completo/tenant y sin proteger la existencia restante después de un consumo en destino.
- **Corrección/decisión:** Releer par coherente bajo lock, comprobar el saldo físico suficiente de destino, cancelar solo piernas propias y guardar cabecera/audit en la misma transacción; segundo intento o fallo de audit no duplica reversión.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 22, 23, 25. Fuentes y funciones exactas en el JSON.

### GA-AG-07-011 — Saldo físico por producto y depósito, separado de imputación

- **P1; corregido y verificado localmente.** Alias: AG07-BE-11.
- **Observado:** Agregar por proyecto/WBS dividía un ingreso corporativo y su consumo imputado y podía producir un negativo por partida inexistente o un disponible excesivo.
- **Corrección/decisión:** Agregar todas las direcciones confirmadas por producto/depósito, con metadatos de obra del depósito y WBS null para saldo físico; ADJUSTMENT sin regla de signo conserva su exclusión histórica. Ledger y reportes mantienen su autorización de detalles separada. Saldo de depósito autorizado incluye todas sus imputaciones sin exponer nombres de obras inaccesibles; el ledger detallado conserva ACL. SQL prueba ingreso10/consumo3→stock7 sin mostrar la fila privada.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 12, 20, 23. Fuentes y funciones exactas en el JSON.

### GA-AG-07-012 — Fechas reales, cantidad positiva redondeada y precio nominal normalizado

- **P2; corregido y verificado localmente.** Alias: AG07-BE-12.
- **Observado:** Entradas con regex parcial podían admitir días inexistentes, cantidades que redondean a cero o números fuera de capacidad; el primer fixture confundía agrupación es-AR con un decimal canónico.
- **Corrección/decisión:** Validación de calendario, cantidades4dp positivas y dentro de Decimal18,4; unitPrice4dp existente sin moneda inventada. Se corrigió fixture1.255→1.2550, no la semántica de parseo, y se comprueban ambas notaciones.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 11, 18. Fuentes y funciones exactas en el JSON.

### GA-AG-07-013 — CLOSED histórico protegido durante edición y reactivación

- **P2; corregido y verificado localmente.** Alias: AG07-BE-13.
- **Observado:** Una reescritura transitoria de AG07 omitió el guard CLOSED original por una lectura errónea del inventario de estados.
- **Corrección/decisión:** Restaurar el guard del estado técnico existente dentro de mutateWarehouse; conservar lectura de históricos y rechazar editar/reactivar, sin inventar cierre nuevo ni borrar el enum.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos 5. Fuentes y funciones exactas en el JSON.

### GA-AG-07-014 — Importe de nuevas recepciones con dinero2dp exacto

- **P2; corregido y verificado localmente.** Alias: AG07-BE-14.
- **Observado:** createReceiptStockMovement multiplicaba qty×unitCost sin roundMoney y podía guardar4dp monetarios aunque el display mostrara2.
- **Corrección/decisión:** toMoneyDecimal una vez al persistir total nuevo, sin redondear unitPrice/qty antes y sin backfill. Test intercepta el dato de persistencia y compara Decimal exacto2.90/1.01, evitando el falso positivo de formatearlo a2dp.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos . Fuentes y funciones exactas en el JSON.

### GA-AG-07-015 — Una trazabilidad de costo para historial y reporte

- **P2; corregido y verificado localmente.** Alias: AG07-BE-15.
- **Observado:** StockMovementView atribuía moneda por cabecera de recepción, mientras el reporte exigía línea y precio/total coherentes: un nominal alterado podía mostrarse como USD en una vista y sin moneda en la otra.
- **Corrección/decisión:** Extraer inventoryMovementCostProvenance y usarla en ambos DTO tras validar padres; acepta total2dp canónico o4dp histórico coherente y conserva nominal bruto con moneda null+warning cuando no es trazable. No usa esa cifra para valuar consumo ni crear asiento.
- **Evidencia:** packages/services/src/inventory/inventory-audit.live.test.ts; casos . Fuentes y funciones exactas en el JSON.

### GA-AG-07-016 — Errores de transporte y doble envío en formularios

- **P1; corregido y verificado localmente.** Alias: AG07-FE-01.
- **Observado:** useTransition sin mutex permitía dos invocaciones previas al rerender; rechazos no manejados escapaban sin feedback recuperable.
- **Corrección/decisión:** useInventoryAction comparte mutex síncrono, pending/catch/finally, mensaje de transporte sanitizado y preserva los campos/idempotencyKey; fieldset deshabilita edición durante la operación.
- **Evidencia:** inventory-interactions.test.ts cases1,2,4,5,6,9. Fuentes y funciones exactas en el JSON.

### GA-AG-07-017 — Formulario de transferencia conservado tras rechazo

- **P1; corregido y verificado localmente.** Alias: AG07-FE-02.
- **Observado:** <form action> React19 restablecía campos no controlados aunque el servicio devolviera error; Cancelar seguía disponible durante el envío.
- **Corrección/decisión:** onSubmit captura FormData antes de transición, muestra rolealert, mantiene fecha/notas y selección/cantidad, bloquea Cancelar mientras guarda.
- **Evidencia:** case2. Fuentes y funciones exactas en el JSON.

### GA-AG-07-018 — Modal de consumo no descarta un guardado pendiente

- **P2; corregido y verificado localmente.** Alias: AG07-FE-03.
- **Observado:** Escape/backdrop/X podían desmontar el formulario aunque su mutación siguiera pendiente.
- **Corrección/decisión:** El hijo comunica pending a un ref del overlay; Dialog y Sheet ignoran cierres hasta terminar; éxito puede cerrar de forma controlada.
- **Evidencia:** cases7,8. Fuentes y funciones exactas en el JSON.

### GA-AG-07-019 — Desactivar/reactivar informa conflictos y conserva confirmación

- **P1; corregido y verificado localmente.** Alias: AG07-FE-04.
- **Observado:** Forms server actions descartaban el resultado {error}, el usuario no recibía feedback; también se ofrecían a roles sin EDIT.
- **Corrección/decisión:** InventoryStatusAction confirma, evita duplicados/cierre pendiente, conserva la confirmación abierta con error del servicio y refresca al éxito. Controles soloEDIT.
- **Evidencia:** case9; types. Fuentes y funciones exactas en el JSON.

### GA-AG-07-020 — Edición existente expuesta en UI

- **P2; corregido y verificado localmente.** Alias: AG07-FE-05.
- **Observado:** El módulo documentaba edición y existían servicios/Actions, pero no una ruta ni enlace para utilizarlos.
- **Corrección/decisión:** Rutas /editar y linkEditar con EDIT; formularios reutilizados envían solo campos ya admitidos y Guardar cambios. SKU, empresa y proyecto no se retargetean por update; cerrados no ofrecen edición.
- **Evidencia:** cases4,5; root authorization of exposure, existing validator shapes. Fuentes y funciones exactas en el JSON.

### GA-AG-07-021 — Invalidación completa de inventario y consumidores

- **P1; corregido y verificado localmente.** Alias: AG07-FE-06.
- **Observado:** Transferencias create/cancel no invalidaban; producto/depósito actualizaban listado/ficha pero no stock/reportes y consumo omitía vistas generales afectadas.
- **Corrección/decisión:** Helper invalida layoutinventario (detalle/reportes/listados) y consumidores de obra identificados; consumo utiliza helper financiero/costos existente. Solo después de mutación exitosa.
- **Evidencia:** cases15–19. Fuentes y funciones exactas en el JSON.

### GA-AG-07-022 — Filtro de transferencia por depósito aplicado

- **P2; corregido y verificado localmente.** Alias: AG07-FE-07.
- **Observado:** Ficha de depósito enlazaba ?warehouseId y el listado ignoraba el filtro.
- **Corrección/decisión:** Forward del filtro al servicio, indicador de filtro activo y Ver todas.
- **Evidencia:** case20. Fuentes y funciones exactas en el JSON.

### GA-AG-07-023 — Disponible de transferencia corresponde a la selección actual

- **P2; corregido y verificado localmente.** Alias: AG07-FE-08.
- **Observado:** Cambio de producto/origen podía seguir mostrando el stock de la pareja anterior; URL de una selección podía perder el otro valor vigente.
- **Corrección/decisión:** Preview solo si coinciden ambas claves server/client; URL conserva pareja cliente; IDs iniciales solo si pertenecen a opciones autorizadas; destino excluye origen y se limpia al pasar a mismo depósito.
- **Evidencia:** case3. Fuentes y funciones exactas en el JSON.

### GA-AG-07-024 — Precisión de cantidades y precio informado

- **P1; corregido y verificado localmente.** Alias: AG07-FE-09.
- **Observado:** DecimalInput precision por defecto2 recortaba entrada antes de llegar a contratos qty/unitCost4.
- **Corrección/decisión:** precision4 explícita; FormData canónica conserva cuatro decimales, presentación dos según D053.
- **Evidencia:** cases2,6. Fuentes y funciones exactas en el JSON.

### GA-AG-07-025 — Gates/roles y controles consistentes

- **P1; corregido y verificado localmente.** Alias: AG07-FE-10.
- **Observado:** Hubs solo autenticaban, altas/emptyCTAs aparecían a VIEWER, directnew mostraba formulario que solo fallaba al mutar.
- **Corrección/decisión:** Layout exige InventoryVIEW y module gate; altas/editar verifican EDIT; CTAs tabla/tarjetas/detalle/listados ocultos si no pueden actuar. Servicios conservan guard autoritativo.
- **Evidencia:** cases11–14,20; typecheck. Fuentes y funciones exactas en el JSON.

### GA-AG-07-026 — Catálogos de consumo y estado de obra

- **P1; corregido y verificado localmente.** Alias: AG07-FE-11.
- **Observado:** Consumo listaba depósitos de otras obras; obras noACTIVE ofrecían alta pese a rechazo canónico del servicio.
- **Corrección/decisión:** listInventoryConsumptionWarehouses del backend para generales/obra autorizados; productos acotados a empresa de obra/contexto conservando compartidos; motivo operacional canónico y CTA solo si habilitado.
- **Evidencia:** backend SQL coordinator evidence; webtypecheck. Fuentes y funciones exactas en el JSON.

### GA-AG-07-027 — Estados y unidades visibles en historial

- **P2; corregido y verificado localmente.** Alias: AG07-FE-12.
- **Observado:** Todo movimiento no CONFIRMED se rotulaba Anulado incluso DRAFT; faltaban unidades.
- **Corrección/decisión:** Mapa DRAFT/CONFIRMED/CANCELLED y productUnit en móvil/escritorio. Trazabilidad monetaria consolidada una sola vez en GA-AG-07-015.
- **Evidencia:** case10; root/backend cost DTO contracts. Fuentes y funciones exactas en el JSON.

### GA-AG-07-028 — Contabilidad usa elegibilidad del servicio

- **P1; corregido y verificado localmente.** Alias: AG07-FE-13.
- **Observado:** React infería permiso de generar asiento de consumo solo a partir de precio positivo, sin moneda/capa D124.
- **Corrección/decisión:** Consumir canGenerateAccountingDraft derivado (actualfalse), conservar lectura de positivos nominales, no ofrecer contabilización por comparación financiera en React. El servicio rechaza asientos nuevos de consumos sin valor y moneda/capa trazables, sin inferir ARS ni usar unitCost como total; conserva lectura de asientos históricos.
- **Evidencia:** case10; root GL service correction. Fuentes y funciones exactas en el JSON.

### GA-AG-07-029 — Filtros de reportes y errores recuperables

- **P2; corregido y verificado localmente.** Alias: AG07-FE-14.
- **Observado:** Páginas construían filtros distintos de HTTP/export, errores de validación terminaban en pantalla rota; false para stockcero no correspondía a una opción visible y labels carecían de asociación.
- **Corrección/decisión:** Parsers compartidos, error VALIDATION visible con filtros/Limpiar y sin resultado0 ficticio; NOT_FOUND/FORBIDDEN a notFound. Labels-ID y booleano falso normalizado. El servicio valida UUID, enum, calendario real y rango antes de Prisma, con los mismos filtros para exportación.
- **Evidencia:** cases21,23. Fuentes y funciones exactas en el JSON.

### GA-AG-07-030 — Ajuste sin dirección no aparece como entrada positiva

- **P2; corregido y verificado localmente.** Alias: AG07-FE-15.
- **Observado:** Tabla presentaba importe de ajuste con símbolo ambiguo mientras saldo no lo sumaba; consumidor signedQuantity asumía siemprestring.
- **Corrección/decisión:** Consumir signedQuantitynullable del servicio; mantener cantidad/unidad originales y Sin dirección definida; aviso en stock de exclusión de esos ajustes del saldo físico.
- **Evidencia:** case25; root report contract/correction. Fuentes y funciones exactas en el JSON.

### GA-AG-07-031 — Paginación defensiva y cache JSON coherente

- **P2; corregido y verificado localmente.** Alias: AG07-FE-16.
- **Observado:** page no numérica/fraccionaria/Infinity llegaba a Prisma; JSON no expresaba política private,no-store como CSV/PDF.
- **Corrección/decisión:** Normalizar page segura antes del servicio; JSON privado sin almacenamiento preservando contexto autenticado. No se atribuye fuga de datos observada.
- **Evidencia:** cases22,24; types. Fuentes y funciones exactas en el JSON.

### GA-AG-07-032 — Vínculo opcional a obra expuesto al crear un depósito

- **P2; corregido y verificado localmente.** Alias: AG07-FE-17.
- **Observado:** La única alta visible no permitía seleccionar una obra aunque módulo/schema/service/Form prop ya admitían el vínculo opcional.
- **Corrección/decisión:** Selector Obra (opcional), Sin obra vinculada y búsqueda, con todas las páginas listProjects autorizadas de la empresa resuelta. Solo consulta obras con módulo PROJECTS y VIEW; no permite retarget al editar. Parent confirmó exposición dentro de alcance. CLOSED conserva lectura histórica sin controles de edición/reactivación.
- **Evidencia:** inventory-interactions.test.ts cases26–28; frontend-extension types/lint. Fuentes y funciones exactas en el JSON.

### GA-AG-07-033 — Reportes y fichas respetan empresa, depósito y grafo autorizado

- **P1; corregido y verificado localmente.** Alias: AG07-ROOT-01.
- **Observado:** Reportes filtraban solo tenant y permitían companyId cliente o UUIDs de otra empresa/depósito de obra.
- **Corrección/decisión:** Scope de empresa/warehouse ACL y validación de padres antes de nombres/cantidades; filtros no amplían contexto ni se presenta un subtotal de un grafo inválido.
- **Evidencia:** Reports SQL casos1–3,5; consumidores CSV/API/páginas. Fuentes y funciones exactas en el JSON.

### GA-AG-07-034 — Alertas de stock negativo por empresa y usuario activo

- **P1; corregido y verificado localmente.** Alias: AG07-ROOT-02.
- **Observado:** Un aviso podía llegar a otra empresa o usuario inactivo; agrupación por obra/EDT confundía consumo imputado con negativo físico.
- **Corrección/decisión:** Saldo físico canónico; contexto manual acotado y destinatarios con membresía/usuario activo, empresa del depósito o global y ACL de su obra. Aviso con companyId.
- **Evidencia:** Reports SQL caso9; agregación GA-AG-07-011. Fuentes y funciones exactas en el JSON.

### GA-AG-07-035 — Transferencia legible en teléfono

- **P3; corregido y verificado localmente.** Alias: AG07-VIS-01.
- **Observado:** A390px dos columnas estrechas truncaban nombres y partían etiquetas en varias líneas.
- **Corrección/decisión:** Una columna por defecto, dos desde sm. Recompilación raíz,28focales solapados y lint web aprobados; móvil claro/oscuro final observado.
- **Evidencia:** Capturas antes/después, full-build-responsive-final. Fuentes y funciones exactas en el JSON.

### GA-AG-07-036 — Editar unidad maestra reinterpreta cantidades históricas

- **P1; corregido y verificado localmente.** Alias: AG07-UNIT-01.
- **Observado:** Product.unit editable y sin unidad snapshot:100kg pueden reetiquetarse100ton conservando quantity100.
- **Corrección/decisión:** D-130 aprobada: contar las seis familias de referencia bajo bloqueo del producto antes de cambiar la unidad; las nuevas referencias bloquean y releen esa unidad. Mismo valor normalizado conserva la etiqueta guardada. El editor recibe elegibilidad derivada y omite la unidad fija del patch; otros campos siguen editables. Históricos sin conversión ni backfill.
- **Evidencia:** D-130: quince casos SQL de unidades/SC/APU/partes, ocho de compras, pruebas UI y muestra visual final; revisión independiente. Fuentes y funciones exactas en el JSON.

### GA-AG-07-037 — Recepción de unidad distinta suma cantidades incompatibles

- **P1; corregido y verificado localmente.** Alias: AG07-UNIT-02.
- **Observado:** Se copia quantityReceived al stock sin comparar unidad de la línea contra Product.unit;2bolsas pueden incorporarse como2kg.
- **Corrección/decisión:** SC/APU/OC y adjudicación comprueban unidad efectiva bajo bloqueo; recepción vuelve a comprobar antes de sus efectos. Solo trim/minúsculas, sin alias ni factores. El parte no guarda una unidad independiente: fija la del producto desde el borrador y revalida al consumir, sin compararla contra WBS. Replays, anulaciones e históricos consultables conservados; las operaciones incompatibles revierten completas.
- **Evidencia:** D-130: quince casos SQL de unidades/SC/APU/partes, ocho de compras, pruebas UI y muestra visual final; revisión independiente. Fuentes y funciones exactas en el JSON.

### GA-AG-07-038 — Selector del parte fuera del alcance autorizado

- **P1; corregido y verificado localmente.** Alias: AG07-PICKER-01.
- **Observado:** getJobsiteLogFormPickList devolvía catálogos de otras empresas/obras del tenant, no exigía acceso al proyecto y enviaba productos/depósitos al cliente aunque Inventario estuviera deshabilitado o sin permiso. Un flag visual no impedía esa exposición.
- **Corrección:** acceso al proyecto antes de las consultas; empresa resuelta para producto propio/compartido y subcontratos; depósitos generales o de la obra actual intersectados con ACL. Sin Inventario/VIEW, arrays vacíos y ninguna consulta de esos catálogos. Los contactos conservan su modelo tenant-wide, sin inventar companyId. DTO y consumidores existentes conservados.
- **Evidencia:** inventory/jobsite-inventory-options.live.test.ts: siete casos de empresa/tenant, obra autorizada o denegada, módulos/permisos sin consultas, subcontratos y contexto global/obra compartida. Revisión independiente del servicio y sus tres páginas consumidoras.

## Verificación y límites

- **2.388 pruebas generales aprobadas, cero fallos**, nueve tareas; incluye 13 de PDF. **33 suites live omitidas** se informan aparte. Tipos: 13 tareas; lint completo y focal web sin errores/advertencias.
- **111 casos SQL distintos aprobados:** 26 inventario + 9 reportes/fronteras + 51 OC/recepción + 3 recepción/cronograma + 15 unidades/partes/APU + 7 selector de partes. Los nueve reportes conservan su corrida aprobada con fuentes sin cambios; los demás grupos se repitieron o incorporaron en esta continuación. Las corridas focales se deduplican, incluida la repetición de un caso del parte.
- **Compilación raíz final aprobada**, dos tareas, DB/proveedores deshabilitados y VERCEL sin definir; sin migrar ni publicar. Tras mejorar el aviso móvil se repitieron 30 focales UI, lint del paquete y compilación completa. Hashes finales registrados. Aviso de Browserslist antiguo conservado; sin dependencias nuevas.
- **549 chunks vigentes y cinco casos de recuperación** del índice distribuido, sin modelos remotos. D-130, Q-077, módulos, guía, ayuda y estrategia de pruebas alineados.
- Revisión independiente: 14 fuentes finales y **32 focales propios** de esta extensión (3 unidades + 29 APU/WBS), solapados con el runner general. Los 53 focales previos se conservan como evidencia anterior. El revisor no ejecutó DB/browser/build ni editó código; revisó los 15 casos SQL de unidades, 8 de compras y 7 del selector. Sin hallazgos residuales confirmados.
- Los intentos iniciales de configuración/harness/fixture y su corrección se conservan en JSON; no se atribuyen a producción.
### Muestra visual

Owner sintético en1280×720 oscuro y390×844 claro/oscuro. Crear/editar producto, SKU preservado/categoría vaciada, confirmación de desactivación descartada; crear depósitos con/sin obra, editar vaciando dirección e historial filtrado. Rechazo de transferencia sin stock conservó campos y cuatro decimales crudos al enfocar, con controles bloqueados mientras guarda. La variante móvil pasó de dos columnas estrechas a una legible. Un día imposible produjo error explícito y Limpiar recuperó el ledger vacío comprobado. El formato de fecha nativo depende del navegador; sus valores ISO eran correctos.

- [Producto editado](./assets/ag07/product-edited-owner-dark.png).
- [Error conservando datos](./assets/ag07/transfer-error-preserved-desktop-dark.png).
- [Móvil final de una columna](./assets/ag07/transfer-form-mobile-light-final.png).
- [Móvil final con precisión conservada](./assets/ag07/transfer-error-mobile-light-final.png).
- [Móvil oscuro final](./assets/ag07/transfer-error-mobile-dark-final.png).
- [Filtro inválido recuperable](./assets/ag07/report-invalid-filter-desktop-dark.png).

Sin transferencia ni movimiento físico creado en el navegador: recorridos positivos, consumo y reversas tienen SQL. Solo Owner navegado; roles restringidos comprobados por SQL/componentes. Sin portal AG-07, E2E completo, WCAG/rendimiento certificado o proveedores reales. Tema/viewport restaurados, logout comprobado, pestaña temporal cerrada y servidor propio detenido con identidad/puerto verificados.

### Muestra final de D-130

Compilación final en 1280×720 y 390×844, tema oscuro: producto sin referencias con unidad editable; producto referenciado con unidad deshabilitada y otros campos disponibles. El aviso móvil pasó de dos columnas estrechas a una columna legible. No se modificaron productos ni se realizaron operaciones físicas en esta muestra. Las etiquetas de la fixture son datos sintéticos, no instrucciones.

- [Unidad editable antes del uso](./assets/ag07/product-unit-unused-desktop-final.png).
- [Unidad protegida en escritorio](./assets/ag07/product-unit-locked-desktop-final.png).
- [Unidad protegida en celular](./assets/ag07/product-unit-locked-mobile-final.png).

Logout confirmado en /login, viewport restablecido y servidor propio detenido tras verificar identidad y puerto. La última pestaña temporal queda sujeta al cierre automático al terminar el turno. Las comprobaciones visuales previas se conservan con sus límites.

## Continuación

**AG-07 cerrada en su alcance local.** Las dos protecciones aprobadas y el selector de partes están implementados y verificados; sin decisiones pendientes para este lote. [Plan](../PLATFORM_AUDIT_PLAN.md) y [registro](./README.md) actualizados. **AG-08 no iniciada:** espera indicación del usuario. Los cambios AG-07 permanecen locales. FIFO/reservas (D-083), valuación pendiente (D-124), cierre formal de depósitos y cierre parcial de OC (D-128) conservan su alcance separado.
