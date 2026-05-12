# Document storage data model — Bloqer 2.0

## Decisión

- **Metadatos** de archivos en **PostgreSQL** (`document_attachment` o nombre equivalente).  
- **Bytes** del archivo en **Cloudflare R2** ([`FILE_STORAGE_ARCHITECTURE.md`](./FILE_STORAGE_ARCHITECTURE.md), [D-025](../00-product/DECISION_LOG.md) para comprobantes).

## Campos conceptuales (metadata row)

| Campo | Uso |
|---|---|
| `id` | UUID |
| `tenant_id` | obligatorio |
| `storage_provider` | p. ej. `R2` |
| `bucket` / `object_key` | localización en R2 |
| `filename_original` | nombre subido |
| `mime_type` | validación |
| `size_bytes` | cuota / UI |
| `checksum_sha256` | integridad |
| `entity_type` + `entity_id` | polimorfismo ([`../01-domain/ENTITY_RELATIONSHIPS.md`](../01-domain/ENTITY_RELATIONSHIPS.md) §10) |
| `uploaded_by_user_id` | auditoría |
| `created_at` | — |

## Versionado ([Q-008](../00-product/OPEN_QUESTIONS.md))

- **Fase 1 recomendada:** cada nueva versión = **nueva fila** metadata + nuevo objeto R2; vínculo `replaces_attachment_id` opcional.  
- **No** sobrescribir objeto en R2 si el producto requiere trazabilidad legal.

## Acceso

- Descarga vía **URL firmada** o **proxy autenticado** que valida `tenant_id` + permiso de módulo.
- Columna Prisma `DocumentAttachment.publicUrl`: **no usada** en flujos actuales (presigned GET desde `storageKey`); reservada si en el futuro hubiera assets públicos/CDN; **no** exponer en DTOs de API.

## Problemas que evita

- Base de datos inflada con BLOBs.  
- Pérdida de vínculo archivo ↔ entidad de negocio.

## Qué NO hacer

- No guardar **solo** URL pública permanente sin control de acceso.  
- No omitir `tenant_id` en metadata.  
- No mezclar **documentos legales** con assets estáticos de marketing sin separación de bucket/política.

## Referencias

- [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md)  
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
