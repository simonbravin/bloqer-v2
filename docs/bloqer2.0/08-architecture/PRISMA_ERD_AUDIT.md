# Prisma / ERD integrity audit — Phase 13E

> Auditoría de `packages/database/prisma/schema.prisma` antes del primer deploy compartido (Neon + Vercel). **Sin cambios de schema en esta fase** — cualquier mejora futura debe ir por **migración Prisma** (`migrate deploy`), **no** `db:push` en bases compartidas/prod (ver [`MIGRATION_STRATEGY.md`](./MIGRATION_STRATEGY.md)).

---

## 1. Resumen de salud del ERD

| Criterio | Estado | Notas |
|----------|--------|--------|
| Aislamiento `tenantId` en entidades operativas de negocio | OK | Auth.js (`User`, `Account`, `Session`, `VerificationToken`) y tablas de plataforma (`PlatformAdmin`, `PlatformAuditLog`) son excepciones intencionales. |
| Hijos sin `tenantId` redundante | Aceptado | Líneas/hijos (`CertificationLine`, `JobsiteLogProgress`, líneas de factura, etc.) heredan tenant vía FK al padre; servicios filtran por padre + `tenantId` del padre. |
| Ledger contable único | OK | **`JournalEntry` + `JournalEntryLine`** son el libro mayor; no hay segundo modelo ledger paralelo. |
| Adjuntos / blobs | OK | **`DocumentAttachment`** es el modelo único de archivo; `storageKey` + proveedor; sin binarios en columnas de negocio. |
| AR / tesorería / AP | OK | **`Receivable`** / **`Collection`** / **`AccountMovement`**; **`Payable`** / **`Payment`** — fuentes de verdad separadas por dominio, enlaces explícitos en servicios (no duplicación de “balance” en tablas paralelas sin spec). |
| Índices en filtros típicos | Mayormente OK | `tenantId` + claves de negocio (`projectId`, `status`, `sourceType`+`sourceId`) cubiertos en modelos calientes. Ver §6 para posibles extensiones futuras. |
| `onDelete` destructivo | Revisado | Varios `Cascade` en `Tenant` → hijos (coherente con borrado de tenant en SaaS); `JournalEntry`/`User` usan `Restrict` donde aplica para no borrar historia por accidente de usuario. |

---

## 2. Fuentes de verdad por dominio (confirmadas)

| Dominio | Modelos ancla | Comentario |
|---------|----------------|------------|
| Contabilidad | `AccountingAccount`, `JournalEntry`, `JournalEntryLine`, `AccountingMappingRule` | `sourceType` + `sourceId` en `JournalEntry` enlazan origen operativo sin FK Prisma obligatoria (polimorfismo controlado en servicio). |
| Tesorería | `TreasuryAccount`, `AccountMovement`, `Collection`, `InternalTransfer` | `AccountMovement.sourceId` alinea con origen (colección, pago, etc.). |
| AR | `SalesInvoice`, `SalesInvoiceLine`, `Receivable`, `Collection` | |
| AP | `SupplierInvoice`, `SupplierInvoiceLine`, `Payable`, `Payment` | Phase 13B: FKs Prisma en `Payment` hacia contacto/factura — migración normal requerida en ambientes que aún no la tengan. |
| Certificaciones | `Certification`, `CertificationLine` | Estado certificación vs facturación: `SalesInvoice` / receivable (BR-CERT-007 en schema comments). |
| Compras | `PurchaseOrder`, `PurchaseOrderLine`, `PurchaseReceipt`, `PurchaseReceiptLine` | |
| Inventario | `Product`, `Warehouse`, `StockMovement`, `WarehouseTransfer` | |
| Subcontratos | `Subcontract`, `SubcontractLine`, `SubcontractCertification`, `SubcontractCertificationLine` | |
| Libro de obra | `JobsiteLog` + hijos `JobsiteLogProgress`, `JobsiteLogLabor`, `JobsiteLogMaterialUsage`, `JobsiteLogIssue` | |
| Documentos | `DocumentAttachment` | Único modelo de adjunto. |
| Notificaciones / email | `Notification`, `EmailDeliveryLog` | Trazabilidad outbound 9D. |

---

## 3. Patrones soft-FK / polimórficos aceptados

| Ubicación | Campos | Motivo |
|-----------|--------|--------|
| `JournalEntry` | `sourceType`, `sourceId` | Un asiento puede originarse en múltiples tipos de evento; índice compuesto `(tenantId, sourceType, sourceId)`. |
| `AccountMovement` | `sourceType`, `sourceId` | Igual patrón tesorería. |
| `DocumentAttachment` | `linkedEntityType`, `linkedEntityId` | Biblioteca unificada; RBAC y gate de módulo tenant en `document.service`. |
| `Notification` | `linkedEntityType`, `linkedEntityId`, `actionUrl`, `metadata` | Inbox y alertas; `actionUrl` es ruta de app; `metadata` JSON acotado por servicio. |
| `EmailDeliveryLog` | `relatedEntityType`, `relatedEntityId`, `metadata` | Auditoría de envíos. |
| `CostAnalysisLine` | `supplierContactId` (scalar, **sin** relación Prisma) | Documentado en schema: hints de proveedor; validación en servicio cuando se use. |
| `DocumentAttachment.publicUrl` | Columna opcional | Comentario en schema: **no** usada en flujos presigned actuales; no exponer en DTOs públicos. |
| `AccountingMappingRule.metadata` | `Json?` | Extensibilidad de reglas sin nuevas columnas por cada variante. |
| `PlatformAuditLog.metadata` | `Json?` | Eventos de plataforma. |

---

## 4. Alcance por empresa y proyecto

- **`companyId`**: Presente donde el dominio es multi-empresa (`AccountingAccount`, `JournalEntry`, tesorería AP/AR típico, `DocumentAttachment` con `companyId` opcional según contexto de subida). `Project` enlaza `tenantId` + `companyId` según modelo de obra.
- **`projectId`**: Opcional en modelos que pueden ser globales o de obra (`JournalEntry`, `DocumentAttachment`, `JournalEntryLine`); obligatorio donde el documento es siempre de proyecto (certificación, parte de obra, etc.). La semántica “null = no proyecto” se mantiene consistente con comentarios BR en schema.

---

## 5. Enums

- No se detectaron enums Prisma **huérfanos** (sin uso en modelos) en esta revisión.
- `LinkedEntityType` y `NotificationType` / `JournalEntrySourceType` / `AccountMovementSourceType` están alineados con código de servicios; ampliaciones futuras requieren migración + actualización de `document.service` / notificaciones.

---

## 6. Posibles extensiones futuras (no bloqueantes pre-infra)

- Índices adicionales si aparecen queries lentas por `createdAt` en tablas de alto volumen (logs de auditoría, movimientos) — medir en producción.
- Relación Prisma explícita opcional `CostAnalysisLine.supplierContact` → `Contact` si se desea integridad referencial estricta (implica migración y backfill).

---

## 7. Decisiones de schema abiertas (producto / arquitectura)

- Política exacta de **borrado de `Tenant`** vs archivo legal (cuarentena vs cascade) — hoy el schema asume cascade amplio bajo `Tenant`; validar con compliance antes de exponer “eliminar tenant” en producto.
- **`PROJECT_VIEWER`** y permisos finos de certificación ya están en matriz; el modelo de “solo mis proyectos asignados” sigue pendiente a nivel de datos (ver `PERMISSIONS_ROUTE_MATRIX.md` — futuro).

---

## 8. Advertencias de migración

- Cualquier cambio de FK, enum o índice en este schema debe generar **migración versionada** y aplicarse con **`pnpm --filter @bloqer/database db:migrate:deploy`** en staging/prod.
- **No** usar `db:push` contra Neon compartido o producción.

---

## Referencias

- [`MULTITENANCY.md`](../07-non-functional/MULTITENANCY.md)  
- [`MONEY_MODEL.md`](../03-finance/MONEY_MODEL.md)  
- [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md)  
- [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md)
