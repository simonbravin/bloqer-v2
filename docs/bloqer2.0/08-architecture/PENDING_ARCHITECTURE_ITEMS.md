# Pending architecture items — Bloqer 2.0

> Lista viva de **decisiones técnicas pendientes** y mejoras sugeridas. Completar antes o durante Phase 0 / implementación.  
> **No** sustituye [`../00-product/OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) (producto); aquí predomina **cómo** modelar o implementar.

## ERD / modelo físico (ver [`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-ERD-01 | Forma del puente **collection/payment → AR/AP** (`*_application` vs líneas embebidas) | Elegir en Prisma + documentar en ADR |
| P-ERD-02 | Columna **`balance`** en `receivable`/`payable`**: solo derivada vs mantenida por servicio | Definir + tests de conciliación |
| P-ERD-03 | Tabla explícita **`direct_sale`** vs solo `sales_invoice` sin `certification_id` | Alinear con venta directa |
| P-ERD-04 | **Numeración correlativa** ([Q-002](../00-product/OPEN_QUESTIONS.md)) | Tabla `number_sequence` vs advisory lock |
| P-ERD-05 | Modelo fino de **`tax_line`** y polimorfismos | Normalización vs pragmatismo Fase 1 |
| P-ERD-06 | Entidad **línea de extracto** en conciliación bancaria | Tabla vs JSON versionado |
| P-ERD-07 | **UUID v4 vs v7** | **HECHO 2026-05-07** — UUID v4 elegido. Ver ADR-Phase1-01. |

## Gastos generales → obra (D-040)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-GG-01 | ~~**Q-013 opción 3**~~ — prorrateo automático de GG según peso del CD del período | **Hecho:** `Company.overheadAllocationMode` (`MANUAL` \| `AUTO_WEIGHT`); `overhead-auto-weight.service.ts` |
| P-GG-02 | Filtro de período en margen neto | Rentabilidad suma **todas** las imputaciones manuales históricas; filtro `periodFrom`/`periodTo` en `getProjectOverheadAmount` listo para reportes con rango |
| P-GG-03 | Moneda de imputación manual | Debe coincidir con presupuesto aprobado del proyecto (validado en servicio) |

## Reportes (ver [`REPORTING_DATA_MODEL.md`](./REPORTING_DATA_MODEL.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-RPT-01 | Vistas SQL para joins repetidos | Crear cuando haya 3+ copias del mismo SQL |
| P-RPT-02 | MV para `payment_status` / `settlement_status` materializados | Solo si perf muestra necesidad; documentar staleness |
| P-RPT-03 | Query builder ([Q-010](../00-product/OPEN_QUESTIONS.md)) | Lista blanca de tablas + límites |

## API / transporte (ver [`API_STRUCTURE.md`](./API_STRUCTURE.md))

| ID | Tema | Acción sugerida |
|---|---|---|
| P-API-01 | Lista cerrada de rutas que **deben** ser Route Handler vs Action | Tabla en ADR cuando exista `app/` |
| P-API-02 | **Idempotency-Key**: tabla y TTL de dedupe | Diseñar con tesorería |

## Repo / packages (prompt 3)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-REP-01 | Nombres exactos de paquetes (`@bloqer/*`) | Definir al crear `pnpm-workspace.yaml` |
| P-REP-02 | **Turborepo** on/off ([ADR-006](./ARCHITECTURE_DECISION_RECORDS.md)) | Decidir al segundo paquete compilable |
| P-REP-03 | Ubicación de **E2E** (`apps/web/e2e` vs root) | Convención en README del repo |

## Certificaciones / concurrencia

| ID | Tema | Acción sugerida |
|---|---|---|
| P-CERT-01 | `issueCertification` corre dentro de una txn READ COMMITTED. Reduce la ventana de race condition pero no la elimina si dos DRAFT certs para el mismo `wbsNodeId` se emiten simultáneamente | Añadir advisory lock (`pg_try_advisory_xact_lock`) o usar `SERIALIZABLE` isolation cuando aparezca alta concurrencia real |

## Tesorería / Cobranzas (Phase 3C — implementado 2026-05-08)

| ID | Tema | Acción sugerida |
|---|---|---|
| P-TRZ-01 | **OVERDUE derivado en lectura** — `serializeReceivable` computa `OVERDUE` en cada `getReceivableById` / `listReceivablesByProject`. Costoso a escala pero correcto | Agregar background job / cron que persiste `status = OVERDUE` en DB cuando haya > 10k cuentas |
| P-TRZ-02 | **FX collections no soportado** — `createCollection` valida `account.currency === receivable.currency`. Multi-divisa requiere tipo de cambio negociado | Diseñar `ExchangeRate` + `exchangeRateId` en `Collection`; validar en Phase 4/5 |
| P-TRZ-03 | **Política de saldo negativo** — `createInternalTransfer` bloquea si `sourceBalance < amount` (D4). No hay "overdraft autorizado" | Agregar flag `allowOverdraft` en `TreasuryAccount` + límite si se necesita para cuentas corrientes |
| P-TRZ-04 | **Ajustes manuales** — `AccountMovementSourceType.MANUAL_ADJUSTMENT` existe en schema pero no hay UI ni acción para crearlo | Exponer en `/tesoreria/cuentas/[id]/ajuste` con doble autorización en Phase 4 |
| P-TRZ-05 | **Conciliación bancaria** — `AccountMovementStatus` tiene solo CONFIRMED/CANCELLED. Sin estado RECONCILED ni entidad `BankStatement` | Diseñar en Phase 4; reservar `P-ERD-06` ya documentado |

## Contradicciones a vigilar

- Cualquier divergencia entre [`BACKEND_LAYERING`](./BACKEND_LAYERING.md) (“handlers delgados”) y ejemplos futuros en código → actualizar doc o código.  
- Q-001 **núcleo resuelto 2026-05-07**: Tenant 1:N Company (Alternativa B). Ver ADR-Phase1-02. FK `company_id` en `user_memberships`.
- **Sub-problema 2026-05-13:** mismo usuario con **dos sociedades activas** en un tenant sigue **abierto** en [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-001 (`@@unique([userId, tenantId])` en Prisma).

## Cómo usar este archivo

- Al resolver un ítem: marcar **HECHO** con fecha y enlace a PR/ADR, o **MOVIDO** a `OPEN_QUESTIONS` si era ambigüedad de producto.  
- Los agentes IA: **no** borrar filas sin confirmación; agregar fila si surge nueva duda técnica.
