# Document storage data model — Bloqer 2.0

## Decisión

- **Metadatos** de archivos en **PostgreSQL** (`document_attachments`).  
- **Carpetas** de obra en **PostgreSQL** (`document_folders`) — [D-113](../00-product/DECISION_LOG.md).  
- **Bytes** del archivo en **Cloudflare R2** ([`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md), [D-025](../00-product/DECISION_LOG.md) para comprobantes).

## Campos conceptuales (metadata row)

| Campo | Uso |
|---|---|
| `id` | UUID |
| `tenant_id` | obligatorio |
| `project_id` | obra; null en adjuntos corporativos |
| `folder_id` | carpeta de obra ([D-113]); null si sin proyecto |
| `storage_provider` | p. ej. `R2` |
| `bucket` / `object_key` | localización en R2 |
| `filename_original` | nombre subido |
| `mime_type` | validación |
| `size_bytes` | cuota / UI |
| `checksum_sha256` | integridad |
| `entity_type` + `entity_id` | polimorfismo ([`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §10) |
| `uploaded_by_user_id` | auditoría |
| `created_at` | — |

## DocumentFolder ([D-113])

| Campo | Uso |
|---|---|
| `tenant_id` + `project_id` | aislamiento |
| `parent_id` | árbol (null = raíz SYSTEM) |
| `kind` | `SYSTEM` \| `USER` |
| `system_key` | clave estable de auto-filing (null en USER) |
| `name` | label UI |

Índices únicos **parciales** (SQL): `system_key` por proyecto; nombre único entre hermanos (raíz vs con `parent_id`).

Seed lazy de carpetas SYSTEM por proyecto. Auto-filing fuerza `folder_id` en uploads operativos. R2 **no** refleja el árbol (keys siguen `{tenant}/{project|global}/{docId}/file`).

## Versionado ([Q-008](../00-product/OPEN_QUESTIONS.md))

- **Fase 1 recomendada:** cada nueva versión = **nueva fila** metadata + nuevo objeto R2; vínculo `replaces_attachment_id` opcional.  
- **No** sobrescribir objeto en R2 si el producto requiere trazabilidad legal.

## Acceso

- Descarga vía **URL firmada** o **proxy autenticado** que valida `tenant_id` + permiso de módulo.
- Columna Prisma `DocumentAttachment.publicUrl`: **no usada** en flujos actuales (presigned GET desde `storageKey`); reservada si en el futuro hubiera assets públicos/CDN; **no** exponer en DTOs de API.
- **Upload:** ver híbrido Server Action / presigned PUT y CORS en [`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md) (P-DOC-05).
- **folderId:** siempre assert mismo `tenant_id` + `project_id` que el attachment (anti-IDOR).

## Problemas que evita

- Base de datos inflada con BLOBs.  
- Pérdida de vínculo archivo ↔ entidad de negocio.  
- Biblioteca plana sin Planos / evidencia / compras.

## Qué NO hacer

- No guardar **solo** URL pública permanente sin control de acceso.  
- No omitir `tenant_id` en metadata.  
- No mezclar **documentos legales** con assets estáticos de marketing sin separación de bucket/política.  
- No confiar en `folderId` del cliente sin validar proyecto/tenant.  
- No crear subcarpetas USER bajo carpetas SYSTEM operativas (Libro, OC, …).

## Referencias

- [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md)  
- [D-113](../00-product/DECISION_LOG.md)  
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
