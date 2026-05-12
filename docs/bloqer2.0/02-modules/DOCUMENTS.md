# Documentos adjuntos

## 1. Objetivo
Almacenar archivos (PDF, imágenes, Office) **vinculados polimórficamente** a entidades del sistema (proyecto, OC, certificación, contrato, parte de obra) con trazabilidad y exportación ([`PRODUCT_SCOPE.md`](../00-product/PRODUCT_SCOPE.md)).

## 2. Usuarios y roles que lo usan
- Todos los roles con permiso de edición en el módulo destino; **ADMIN** gestiona políticas de tamaño/tipo.

## 3. Problema que resuelve
Pérdida de respaldo contractual y fiscal disperso en carpetas locales.

## 4. Datos que consume (inputs)
- Archivo binario, metadatos, `entity_type` + `entity_id`.
- Límite tamaño tenant ([`MASTER_DATA.md`](../01-domain/MASTER_DATA.md) `documents_max_size_mb`).

## 5. Datos que produce (outputs)
- **Document** con versionado simple opcional ([Q-008]).
- URLs firmadas para descarga segura.

## 6. Entidades principales
- **Document**, **DocumentVersion** (si versión simple).

## 7. Estados y transiciones
**`Document`:** `ACTIVE` ↔ `ARCHIVED`, `DELETED` (soft-delete). **`DocumentVersion`:** `DRAFT` → `ACTIVE` → `SUPERSEDED` / `ARCHIVED`. Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) §26.

## 8. Acciones disponibles
- Subir, renombrar, archivar.
- Reemplazar creando nueva versión ([Q-008]).

## 9. Pantallas y vistas necesarias
- Pestaña “Documentos” en cada ficha entidad.
- Buscador global por nombre/tags (Fase 2).

## 10. Reglas de negocio
- Comprobantes legales emitidos deben conservar PDF original ([trazabilidad]).
- Borrado físico prohibido si entidad padre existe — solo archivar doc.

## 11. Validaciones
- Tipos MIME permitidos ([Q-020]).
- Tamaño máximo.

## 12. Fórmulas relacionadas
_No aplica._

## 13. Casos borde
- Documento que cubre múltiples entidades: elegir primaria + enlaces secundarios (Fase 2).

## 14. Reportes relacionados
- Paquete documental por proyecto (export ZIP Fase 2).

## 15. Relación con otros módulos
- Transversal a todos los módulos operativos.

## 16. Permisos
Hereda del módulo padre; VIEWER solo descarga si tiene ver proyecto.

## 17. Eventos disparados / consumidos
- `document.archived`, `document.reactivated`, `document.deleted`; `document_version.*` según [`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md) §2.14c.

## 18. Fase de implementación
**Fase 1** almacenamiento básico; OCR/indexación **Fase 3**.

## 19. Preguntas abiertas
- Versionado vs última versión ([Q-008]); tipos archivo ([Q-020]).
