# Contabilidad (GL interno)

> Ver [D-061](../00-product/DECISION_LOG.md#d-061--contabilidad-phase-11e-plantilla-ar-auto-draft-soft-anti-doble-conteo), [D-062](../00-product/DECISION_LOG.md#d-062--contabilidad-phase-11f-reportes-gerenciales-estados-y-exports), [D-063](../00-product/DECISION_LOG.md#d-063--contabilidad-lock-de-montos-en-draft-con-origen--aviso-anti-spam). Arquitectura: [`../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md`](../08-architecture/ACCOUNTING_LEDGER_ARCHITECTURE.md).

## 1. Objetivo

Llevar un libro de partida doble por empresa (`Company`), paralelo a tesorería operativa, con plan de cuentas flexible, asientos balanceados y borradores automáticos desde operaciones.

## 2. Usuarios y roles que lo usan

- OWNER / ADMIN / FINANCE: configuración y posteo.
- TREASURER / PROJECT_FINANCE / roles operativos: generan operaciones; no requieren EDIT ACCOUNTING para que nazca el borrador automático.

## 3. Problema que resuelve

Tener un libro contable usable sin depender solo del estudio externo, sin confundir caja (tesorería) con debe/haber (GL).

## 4. Datos que consume (inputs)

Cobros, pagos, facturas emitidas, transferencias, ingresos de tesorería puros, reglas de mapeo, plan de cuentas.

## 5. Datos que produce (outputs)

`AccountingAccount`, `JournalEntry` / líneas, `AccountingMappingRule`, mayor, sumas y saldos, libro diario, ESP/EERR gerenciales, reversas, exports.

## 6. Entidades principales

- `AccountingAccount` — plan de cuentas (company-scoped).
- `JournalEntry` + `JournalEntryLine` — asientos.
- `AccountingMappingRule` — evento → debe/haber (2 cuentas).

## 7. Estados y transiciones

Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § JournalEntry: `DRAFT` → `POSTED` | `CANCELLED`; reverse de `POSTED` = nuevo asiento POSTED enlazado.

## 8. Acciones disponibles

Aplicar plantilla AR; CRUD cuentas/reglas/asientos; postear; anular borrador; revertir posteado; generar asiento manual desde documento; auto-DRAFT soft post-create.

## 9. Pantallas y vistas necesarias

`/contabilidad`, cuentas, asientos, reglas, libro diario, sumas y saldos, situación patrimonial, resultados, mayor por cuenta.

## 10. Reglas de negocio

- Balance debe=haber por moneda.
- Un asiento activo por origen (`sourceType`+`sourceId`).
- Auto-DRAFT nunca aborta la operación operativa.
- No doble conteo Collection/Payment + Treasury del mismo efectivo.
- Accrual = `totalAmount` del comprobante.
- DRAFT **sourced** ([D-063](../00-product/DECISION_LOG.md#d-063--contabilidad-lock-de-montos-en-draft-con-origen--aviso-anti-spam)): montos/moneda/estructura inmutables; cuentas y textos editables. MANUAL libre.
- Aviso in-app `ACCOUNTING_DRAFTS_PENDING` a `EDIT ACCOUNTING` con dedupe 24h (soft).

## 11. Validaciones

Cuentas activas; empresa del documento; montos > 0; unique parcial DB.

## 12. Fórmulas relacionadas

_No aplica_ (montos vienen de documentos; money 2 dp [D-053]).

## 13. Casos borde

Módulo ACCOUNTING off; sin regla; moneda USD con regla Bancos ARS (ajuste manual); cancel con POSTED sin reverse.

## 14. Reportes relacionados

Libros (diario, sumas y saldos, mayor), ESP y EERR gerenciales — [D-062]. Solo `POSTED`; saldo natural; ESP con “Resultado del ejercicio (no cerrado)”. Cierre formal / AFIP / inflación fuera de alcance.

## 15. Relación con otros módulos

AR, AP, Tesorería, Inventario (sugerencia manual stock; auto diferido).

## 16. Permisos

`VIEW` / `EDIT` / `APPROVE` sobre `ACCOUNTING` + gate de módulo tenant.

## 17. Eventos disparados / consumidos

`journal_entry.created|updated|posted|cancelled|reversed|auto_draft_created|auto_draft_skipped`; `accounting_coa_template.applied`; notif `ACCOUNTING_DRAFTS_PENDING` ([D-063](../00-product/DECISION_LOG.md#d-063--contabilidad-lock-de-montos-en-draft-con-origen--aviso-anti-spam)).

## 18. Fase de implementación

Phase 11A–11D (manual + sugerencias) + **11E** (plantilla, auto-DRAFT, reverse) — [D-061] + **11F** (reportes/estados/exports) — [D-062] + **lock sourced + notif cola** — [D-063](../00-product/DECISION_LOG.md#d-063--contabilidad-lock-de-montos-en-draft-con-origen--aviso-anti-spam).

## 19. Preguntas abiertas

Motor IVA multi-línea; auto-POST; costing consumo stock para auto-DRAFT; email para cola DRAFT.

Cierre de período financiero (tesorería + GL): implementado ([D-078]) — `/contabilidad/cierres`.
