# Documentos adjuntos

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
Hereda del módulo padre; VIEWER solo descarga si tiene ver proyecto. Mutar carpetas = editar documentos del proyecto.

## 17. Eventos disparados / consumidos
- `document.archived`, `document.reactivated`, `document.deleted`; `document_version.*` según [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14c.
- `document_folder.created` / `renamed` / `deleted` / `moved` (auditoría).

## 18. Fase de implementación
**Fase 1** almacenamiento básico + carpetas ([D-113]); OCR/indexación **Fase 3**.

## 19. Preguntas abiertas
- Versionado vs última versión ([Q-008]); tipos archivo ([Q-020]).
