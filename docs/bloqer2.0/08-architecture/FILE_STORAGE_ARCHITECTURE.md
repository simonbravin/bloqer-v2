# File storage architecture — Bloqer 2.0

## Decisión

Almacenar **blobs** (adjuntos de documentos, fotos de obra, PDFs) en **Cloudflare R2**. La base de datos guarda **metadatos** (tenant, propietario, `document_id` / entidad origen, checksum, tamaño, mime, path/clave de objeto, quién subió, cuándo) alineado a [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md) y uso en otros módulos ([`../02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md)). Las **URLs públicas** no deben ser permanentes sin control; preferir **URLs firmadas** o proxy de descarga autenticado.

## Justificación para Bloqer 2.0

- Separar archivos grandes del **PostgreSQL** mejora backup, costo y performance.
- Construcción genera mucho **contenido evidencial** vinculado a proyectos y auditoría.
- R2 encaja como **S3-compatible** con buen costo para muchos objetos.

## Problemas que evita

- **Bloat** de la base y migraciones lentas.
- **Pérdida de trazabilidad** si el archivo vive en disco efímero del servidor Vercel.

## Qué NO hacer

- No servir archivos **sin** verificar `tenant_id` y permiso de módulo.
- No guardar **solo** la URL externa sin vínculo a registro metadatos interno.
- No asumir **versionado** complejo sin decidir Q-008 ([`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)); la arquitectura debe permitir `version` incremental en metadatos.
- No definir en este doc **nombres de buckets** ni políticas IAM concretas.

## Flujo conceptual

1. Cliente solicita **upload permitido** → servidor valida cuota/tipo (según política) y devuelve **estrategia** (upload directo firmado o vía servidor).
2. Tras upload, servidor **confirma** y crea fila metadatos + vínculo a entidad.
3. Descarga pasa por **autorización** y **auditoría** si el producto lo exige.

## Referencias funcionales

- [`../02-modules/DOCUMENTS.md`](../02-modules/DOCUMENTS.md)
- [`../02-modules/JOBSITE_LOG.md`](../02-modules/JOBSITE_LOG.md)
- [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-008, Q-020
- [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)

## Documentos técnicos relacionados

- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
