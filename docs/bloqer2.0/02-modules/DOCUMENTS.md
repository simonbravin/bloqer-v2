# Documentos adjuntos

## Conservación y trazabilidad de cargas (2026-11-20)

Las cargas de archivos requieren R2 disponible: `uploadDocument` e `initiateDocumentUpload` rechazan la operación antes de crear metadata si no puede conservarse el original. El cliente solo acepta un documento R2 confirmado; un registro PLACEHOLDER nunca equivale a una carga exitosa. Los registros históricos y la API explícita de metadata conservan su semántica, sin archivo recuperable.

`uploadedBy`, `createdAt` y `updatedAt` ya existentes respaldan autor, fecha/hora de registro y última modificación. El nombre del autor se resuelve en lote, después de autorizar documentos y dentro del tenant; no se publican claves de almacenamiento. Las listas, tarjetas, adjuntos móviles y detalle muestran esos datos. La fecha de registro no es la fecha EXIF de captura de una foto. Los eventos de inicio, confirmación y archivo permanecen en auditoría; archivar evidencia operativa conserva sus bytes y no concede permisos adicionales.

Se mantienen permisos por tenant, empresa, proyecto y entidad asociada, incluyendo los alcances compartidos documentados. Descarga y preview requieren autorización y usan URLs temporales. La entrega inicial no incorporó versionado; D-146 agrega el versionado simple descrito abajo. Antivirus, retención inmutable y backup independiente siguen separados.

> Ver [D-113](../00-product/DECISION_LOG.md) — carpetas SYSTEM + USER por proyecto; auto-filing operativo.

## 1. Objetivo
Almacenar archivos (PDF, imágenes, Office, **DWG/DXF**) **vinculados polimórficamente** a entidades del sistema (proyecto, OC, certificación, contrato, parte de obra) con trazabilidad, **organización en carpetas por obra** y exportación ([`PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).

## 2. Usuarios y roles que lo usan
- Todos los roles con permiso de edición en el módulo destino; **ADMIN** gestiona políticas de tamaño/tipo.

## 3. Problema que resuelve
Pérdida de respaldo contractual y fiscal disperso en carpetas locales; biblioteca de obra sin estructura (planos, evidencia, compras).

## 4. Datos que consume (inputs)
- Archivo binario, metadatos, `entity_type` + `entity_id`.
- Carpeta destino (biblioteca) o auto-filing por entidad ([D-113]).
- Límite tamaño tenant ([`MASTER_DATA.md`](../01-domain/MASTER_DATA.md) `documents_max_size_mb`).

## 5. Datos que produce (outputs)
- **Document** con versionado simple opcional ([Q-008]).
- Filas `DocumentFolder` (SYSTEM / USER) por proyecto.
- URLs firmadas para descarga segura.

## 6. Entidades principales
- **DocumentAttachment**, **DocumentFolder** ([D-113]). **DocumentVersion** (si versión simple, [Q-008]).

## 7. Estados y transiciones
**`Document`:** `ACTIVE` ↔ `ARCHIVED`, `DELETED` (soft-delete). **`DocumentVersion`:** `DRAFT` → `ACTIVE` → `SUPERSEDED` / `ARCHIVED`. Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §26. Carpetas SYSTEM no tienen lifecycle; USER se crean/renombran/borran (vacías).

## 8. Acciones disponibles
- Subir, renombrar, archivar.
- Crear / renombrar / borrar carpetas USER bajo Planos o General; mover documentos de biblioteca entre destinos permitidos ([D-113]).
- Reemplazar creando nueva versión ([Q-008]).
- **Ver** (icono de ojo; PDF e imágenes): abre en **pestaña nueva** con URL firmada `Content-Disposition: inline` (no reemplaza la sesión de Bloqer).
- **Descargar** (icono de descarga): URL firmada con `Content-Disposition: attachment` (desktop y celular). HEIC/HEIF no tiene preview garantizado en todos los browsers; siempre se puede descargar.
- **Eliminar** (soft-delete, [D-111](../00-product/DECISION_LOG.md#d-111--eliminar-solo-documentos-de-biblioteca-no-adjuntos-operativos)): solo documentos de la **biblioteca de la obra** (`linkedEntityType = PROJECT`), p. ej. planos reemplazados. No se eliminan adjuntos de factura, libro de obra, cotización, OC, certificación, presupuesto ni subcontrato — ahí solo se archiva.

## 9. Pantallas y vistas necesarias
- **Índice de entrega** (`/proyectos/[id]/documentos/indice-entrega`), desde Documentos: consulta de archivos activos/archivados autorizados, con búsqueda por nombre/descripción, categoría y estado. Muestra 25 por página, responsable, fecha/hora de registro, original registrado y vínculos a revisión anterior/siguiente. No numera revisiones ni equipara el estado activo con vigencia contractual. Los vínculos revalidan tenant, empresa efectiva, obra y entidad; solo se exponen extremos autorizados y coherentes. `R2` confirmado indica original registrado, no una comprobación física actual; esta se hace desde Historial → Verificar archivo guardado. No incluye `UPLOADING` ni `DELETED`. CSV, Excel y PDF exportan todas las filas de los filtros, sin truncado; máximo 10.000, con error explícito que pide acotar filtros. Incluyen trazabilidad, contexto de obra/empresa y fecha UTC; CSV/Excel conservan rutas autenticadas, sin URLs firmadas ni claves de almacenamiento. El índice no contiene los originales, no es un backup y no acredita completitud contractual, garantías, aprobación ni cierre de obra. Consulta sin cambios de metadata o carpetas.
- **Recuperación de cargas:** el formulario conserva el mismo archivo y metadata del intento al reintentar; bloquea su edición para no cambiar el payload de una clave idempotente. En registros R2 `UPLOADING` autorizados, **Completar carga → Verificar y confirmar** reutiliza la confirmación existente y sus controles de bytes, tenant, empresa, obra y entidad. No inicia otra carga ni reconstruye originales ausentes. Una revisión solo archiva su predecesora cuando la confirmación es válida. No amplía la visibilidad temporal de intentos abandonados.
- **Revisiones**: icono en biblioteca y adjuntos activos/archivados. Muestra el archivo consultado, su autor y fecha; permite navegar a la revisión anterior/siguiente, descargarla y consultar su historial. **Subir nueva revisión** está disponible en la última revisión confirmada activa, con permiso de edición del módulo padre. El archivo previo se archiva únicamente al confirmar la nueva carga; una interrupción no lo sustituye. Las revisiones confirmadas se archivan, no se eliminan; restaurar un archivado no cambia los vínculos de revisión. No hay check-in/check-out ni sobrescritura de originales ([D-146]).
- **Exportar historial CSV**, dentro del Historial del archivo: descarga todos los movimientos autorizados del documento (hasta 5.000; si supera el límite se informa y no se entrega una exportación parcial). Incluye identificadores de documento, empresa, proyecto y entidad, nombre del archivo, evento, responsable y fecha/hora ISO en UTC. Usa el mismo aislamiento que el historial, sin payloads internos, IP ni localizadores de almacenamiento; neutraliza fórmulas de planilla. No exporta los bytes ni representa un backup.
- **Verificar archivo guardado**, dentro del historial de un archivo R2 activo o archivado: lectura autorizada a demanda, compara tamaño y, si existe `contentSha256`, huella SHA-256. Informa la hora de comprobación y distingue registros antiguos sin huella. Un fallo no modifica ni reemplaza el archivo; la respuesta no revela datos del proveedor. La misma comprobación protege la lectura de bytes para incorporar archivos en PDF. Restaurar un archivado sigue usando la acción existente y conserva autor, fecha y objeto; no recupera archivos eliminados ni originales que nunca se guardaron.
- **Historial del archivo** desde el icono Historial en biblioteca, detalle y adjuntos corporativos/de proyecto: eventos existentes de auditoría, actor y fecha/hora, paginados de 50 en 50 con **Ver anteriores**. La consulta verifica permisos en cada página, no devuelve payloads internos, IP ni claves/URLs de almacenamiento, y no genera eventos sintéticos para llenar huecos históricos. Disponible también para registros PLACEHOLDER y UPLOADING autorizados. Una carga iniciada se distingue de una confirmada.
- Pestaña “Documentos” en cada ficha entidad.
- Biblioteca de obra con **árbol de carpetas** + listado ([D-113]).
- Acciones Ver / Descargar como **iconos** (ojo / descarga) en lista, cards, panel de adjuntos de entidad y ficha del documento; en la biblioteca, Archivar y Eliminar (tacho) si el archivo no está ligado a un comprobante ([D-111]); preview in-page solo jpeg/png/webp en la ficha (nunca PDF embebido).
- Buscador global por nombre/tags (Fase 2).

## 10. Reglas de negocio
- Comprobantes legales emitidos deben conservar PDF original ([trazabilidad]).
- Borrado físico prohibido si entidad padre operativa existe — solo archivar el adjunto ([D-111]).
- Baja lógica (`DELETED`) permitida en la biblioteca de obra (documentos no ligados a un comprobante u operación), p. ej. para dejar solo el plano vigente.
- Auto-filing y destinos de biblioteca según [D-113]; aislamiento `tenantId` + `projectId` en carpetas y asserts de `folderId`.

## 11. Validaciones
- Tipos MIME permitidos ([Q-020]): PDF, imágenes (jpeg/png/webp/heic), Word, Excel, CSV, texto, **DWG/DXF** (`image/vnd.dwg` / `image/vnd.dxf`; resolución por extensión si el browser manda vacío/`octet-stream`). CAD sin preview in-app.
- Tamaño máximo.
- `folderId` debe pertenecer al mismo tenant/proyecto; uploads operativos ignoran `folderId` del cliente.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Documento que cubre múltiples entidades: elegir primaria + enlaces secundarios (Fase 2).
- Adjuntos corporativos sin `projectId`: sin carpeta de obra (`folderId` null).

## 14. Reportes relacionados
- Paquete documental por proyecto (export ZIP Fase 2).

## 15. Relación con otros módulos
- Transversal a todos los módulos operativos.

## 16. Permisos
La biblioteca, el enlace directo y la descarga comprueban tenant, empresa, acceso a la obra y permiso de lectura del módulo padre. Archivar o adjuntar también requiere el permiso de la operación de origen. Mutar carpetas exige editar documentos del proyecto.

## 17. Eventos disparados / consumidos
- `document.archived`, `document.reactivated`, `document.deleted`; `document_version.*` según [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14c.
- `document_folder.created` / `renamed` / `deleted` / `moved` (auditoría).

## 18. Fase de implementación
**Fase 1** almacenamiento básico + carpetas ([D-113]); OCR/indexación general **Fase 3**. El primer paquete autorizado agrega un piloto de lectura efímera de una factura manual en ARS ([ADR-019](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md)): PDF/JPEG/PNG/WebP hasta 3 MiB, original local hasta guardar, adjunto al borrador y revisión humana. No es una bandeja persistente, procesamiento por lote ni búsqueda del contenido de documentos.

## 19. Preguntas abiertas
- Q-008 resuelta: versionado simple según D-146; despliegue/migración acreditados en el PR correspondiente. Tipos archivo: Q-020.
