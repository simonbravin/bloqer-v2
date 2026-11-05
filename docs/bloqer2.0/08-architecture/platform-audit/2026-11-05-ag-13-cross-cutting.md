# AG-13 — Servicios transversales e interfaces de asistencia

## Encargo y base

- Fecha 05/11/2026. Auditoría global por etapa, con correcciones. Base local `65c2d0ad907f6736e717adc9e10cb2c0251eb837` en `codex/pruebas`.
- AG-12 se publicó mediante el [PR #10](https://github.com/simonbravin/bloqer-v2/pull/10) antes de esta etapa. [Evidencia de publicación](./2026-11-05-ag-12-publication.md).
- Alcance de AG-13: Documentos, Registro, equipo cuando afecta aislamiento, campana, alertas, resumen diario, historial y entrega programada, Centro de Ayuda y Bloqer AI. Se revisaron entradas de usuario y jobs, contratos, permisos, lectura posterior, almacenamiento, correo y orquestación del asistente.
- La auditoría se repartió entre documentos y almacenamiento, entrega y notificaciones, Bloqer AI y una revalidación independiente de permisos, históricos, reintentos y pruebas.

## Hallazgos y correcciones

### GA-AG-13-001 — Adjuntos con acceso al documento de origen

Los recorridos de Documentos de obra y adjuntos de operaciones consultaban o mutaban por UUID sin comprobar de la misma forma todos los vínculos. Listado, descarga, edición y confirmación ahora contrastan tenant, empresa, obra, entidad vinculada y permisos de la operación. También se aplica el permiso de CxP de empresa para facturas corporativas. Se valida la carpeta y se recalculan las rutas a refrescar del lado del servicio. [Documentos](../../02-modules/DOCUMENTS.md).

### GA-AG-13-002 — Carga de archivos y concurrencia de carpetas

La carga directa firma tamaño, MIME y la condición de no sobrescritura. Cada intento usa una clave propia y una respuesta 412 puede recuperar la confirmación de una carga anterior. Se comprueban metadatos y firma del archivo antes de registrar la carga. Una consulta de listado no escribe ni libera cargas anteriores. Los movimientos de carpetas concurrentes se serializan y se vuelve a comprobar la ausencia de ciclos. El límite de la carga heredada de subcontratos se conserva. [Almacenamiento](../FILE_STORAGE_ARCHITECTURE.md).

### GA-AG-13-003 — Registro, exportaciones y equipo en su ámbito

El Registro aplica el mismo alcance de organización, empresa, obra, módulo y permisos a lista, detalle, filtros y exportaciones. El cursor avanza por los resultados visibles. Las fechas usan la zona horaria de la pantalla, las referencias se recuperan de ambos snapshots y los valores sensibles se filtran también en históricos. Con D-144, una empresa ve registros compartidos o de pertenencia comprobable. Los de alcance ambiguo quedan reservados a la sesión global autorizada. La prueba incluye históricos de compra, presupuesto, adjuntos y asignaciones de obra. El equipo aplica el mismo límite de empresa al leer y cambiar roles o estado. [Registro](../../02-modules/AUDIT_LOG.md) y [Q-091](./2026-11-05-ag-13-audit-history-scope-proposal.md).

### GA-AG-13-004 — Campana, alertas y resumen diario con permisos vigentes

La campana conserva preferencias y filtra por membresía activa, módulos habilitados y alcance de empresa y obra. Los enlaces de acción se validan antes de navegar. Alertas y resumen validan de nuevo el alcance del destinatario y los datos de origen. Las alertas se deduplican bajo concurrencia, un fallo puntual se registra y el procesamiento continúa. El cron del resumen usa la hora configurada según el intervalo real de ejecución. [Notificaciones](../../02-modules/NOTIFICATIONS.md).

### GA-AG-13-005 — Correo programado con confirmación recuperable

D-143 reserva la combinación de reporte, ventana y destinatario antes de intentar el envío. Si el proveedor confirma pero falla el guardado local, se intenta guardar de nuevo la confirmación. Si se pierde la confirmación se muestra **Sin confirmar**. El cron y **Reintentar fallidos** excluyen las entregas ambiguas, incluidos fallos históricos sin evidencia de rechazo. Un rechazo comprobado sigue siendo elegible durante siete días. **Enviar ahora** abre una nueva entrega con permisos vigentes. [Q-090](./2026-11-05-ag-13-email-confirmation-proposal.md).

### GA-AG-13-006 — Bloqer AI consulta con el mismo contrato que la aplicación

Consultar cronogramas con rol de lectura usa una lectura sin inicializar ni recalcular datos. Las herramientas respetan los permisos específicos de solicitudes de compra, órdenes y certificaciones. Se ajustaron el contexto de empresa y obra, la recuperación de respuestas interrumpidas, el historial de mensajes y los enlaces a pantallas que devolvieron herramientas exitosas. Los errores al usuario usan mensajes controlados. [Bloqer AI](../../BLOQER_AI_ARCHITECTURE.md).

### GA-AG-13-007 — Ayuda vinculada al flujo efectivo

El Centro de Ayuda interpreta énfasis y nombres de controles en sus fichas. Se ajustaron la guía, las fichas y el índice del asistente con los recorridos de permisos, documentos, Registro, reportes, reintentos y resumen diario. [Guía operativa](../../GUIA_OPERATIVA_BLOQER_V2.md).

## Evidencia y estado

- **Pruebas generales.** 2.756 aprobadas en nueve tareas. El comando general omitió 44 suites de nivel superior por sus condiciones de ejecución. Tipos aprobados en 13 tareas y lint aprobado en paquetes y web.
- **PostgreSQL aislado.** 10 casos con datos sintéticos. Tres de Registro y exportación, cuatro de Documentos y carpetas, dos de cronograma de solo lectura y reportes programados, y uno de acceso por obra desde Bloqer AI. Las fuentes del alcance de cada prueba coinciden con la versión revisada.
- **Bloqer AI.** 202 de 202 casos de evaluación estructural con el proveedor simulado. Guía y Ayuda actualizadas, con un índice de conocimiento comprobado de 596 fragmentos. La evaluación estructural comprueba selección, permisos y enlace de herramientas. La calidad de las respuestas de un modelo real requiere su propia evaluación.
- **Revisión independiente.** Identificó casos históricos de presupuesto, asignaciones y adjuntos en el Registro, y fallos históricos sin evidencia de rechazo en correo. Esos casos se corrigieron y se cubrieron con regresiones. Las pruebas focales se solapan con las generales.
- **Límites de la verificación.** Se simuló el proveedor de correo y la carga de archivos. Se comprobó la firma R2 de forma local con credenciales sintéticas. La integración real de CORS, operaciones contra el bucket, correo y modelo AI queda fuera de esta evidencia. La revisión en navegador de escritorio, tablet y teléfono pertenece a la etapa integral de UX/UI.
- **Compilación final.** Aprobada con las 97 fuentes congeladas, con base y proveedores deshabilitados. El esquema y las migraciones conservan la revisión base.
- **Resultados reproducibles.** `output/platform-audit/ag-13-2026-11-05/` contiene `workspace-test-summary.json`, `sql-final-summary.json`, `ai-fake-structural.json`, `build-source-match-final.json` y el manifiesto final.

**Estado.** AG-13 cerrada localmente. P-DOC-05 conserva el límite de carga documentado al crear subcontratos. AG-14 queda pendiente de indicación del Owner.
