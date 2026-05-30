# Permissions Matrix — Bloqer 2.0

> Matriz **rol × módulo × acción**. Decisión lockeada: el modelo es **simple** — `ver / crear-editar / aprobar`. Sin permisos a nivel campo.

---

## 1. Modelo de permisos

### Acciones posibles (universales)

| Acción | Significado |
|---|---|
| `VIEW` | Ver el módulo y sus registros |
| `EDIT` | Crear y editar registros (incluye borrado de borradores) |
| `APPROVE` | Confirmar / aprobar / cerrar registros que pasan a estado terminal |

### Reglas de implicación

- `APPROVE` **implica** `EDIT` **implica** `VIEW`.
- Pero `APPROVE` puede asignarse sin `EDIT` para casos donde el aprobador es distinto del creador (ej. flujo de 4 ojos en compras grandes).
- `EDIT` siempre implica permiso de **anular borradores propios**.
- `EDIT` **no implica** anular registros confirmados — eso requiere `APPROVE` + autoría o `ADMIN`.

---

## 2. Matriz global por módulo

Lectura: ✅ = permitido, ⛔ = no permitido, ⚙️ = configurable por Admin.

### 2.1 Operativos

| Módulo | OWNER | ADMIN | PM (proyecto) | SITE_FOREMAN | PROCUREMENT | WAREHOUSE | SALES | FINANCE | VIEWER |
|---|---|---|---|---|---|---|---|---|---|
| Directorio | A | A | V | ⛔ | E (proveedores) | ⛔ | E (clientes) | V | V |
| Clientes | A | A | V | ⛔ | ⛔ | ⛔ | E | V | V |
| Proveedores | A | A | V | ⛔ | E | V | ⛔ | V | V |
| Subcontratistas | A | A | E (en su proyecto) | ⛔ | E | ⛔ | ⛔ | V | V |
| Proyectos | A | A | E (su proyecto) | V (su proyecto) | V | V | V | V | V |
| Cronograma | A | A | E (su proyecto) | V | ⛔ | ⛔ | ⛔ | V | V |
| Presupuestos | A | A | E (su proyecto) | V | ⛔ | ⛔ | V | V | V |
| WBS / Cómputos | A | A | E (su proyecto) | V | ⛔ | ⛔ | ⛔ | V | V |
| Contratos / Adendas | A | A | E (su proyecto) | ⛔ | ⛔ | ⛔ | E (cliente) | V | V |
| Change Orders | A | A | E (su proyecto) | ⛔ | ⛔ | ⛔ | ⛔ | V | V |
| RFIs | A | A | E (su proyecto) | E | ⛔ | ⛔ | ⛔ | V | V |
| Libro de Obra | A | A | E (su proyecto) | E | ⛔ | ⛔ | ⛔ | V | V |
| Certificaciones | A | A | E (su proyecto) | V | ⛔ | ⛔ | ⛔ | V | V |
| Compras | A | A | E (su proyecto) | ⛔ | A | V | ⛔ | V | V |
| OC y Recepción | A | A | E (su proyecto) | ⛔ | A | E (recepción) | ⛔ | V | V |
| Subcontratos | A | A | E (su proyecto) | ⛔ | E | ⛔ | ⛔ | V | V |
| Inventario | A | A | V (su proyecto) | V | V | A | ⛔ | V | V |
| Depósitos | A | A | V | ⛔ | V | A | ⛔ | V | V |
| Documentos | A | A | E (su proyecto) | V | E | V | E | E | V |
| Notificaciones | A | A | V | V | V | V | V | V | V |

Códigos: `V`=VIEW, `E`=EDIT (incluye VIEW), `A`=APPROVE (incluye EDIT y VIEW), `⛔`=sin acceso.

### 2.2 Financieros

| Módulo | OWNER | ADMIN | PM | FINANCE | PROCUREMENT | SALES | VIEWER |
|---|---|---|---|---|---|---|---|
| Tesorería | A | A | V (su proyecto) | A | V | V | V |
| Cuentas Bancarias | A | A | ⛔ | A | ⛔ | ⛔ | V |
| Conciliación Bancaria | A | A | ⛔ | A | ⛔ | ⛔ | V |
| Ventas / Cobranzas | A | A | E (su proyecto) | A | ⛔ | E | V |
| Gastos / Pagos | A | A | E (su proyecto) | A | E (compras) | ⛔ | V |
| Transferencias internas | A | A | ⛔ | A | ⛔ | ⛔ | V |
| Cuentas por Cobrar | A | A | E (su proyecto) | A | ⛔ | E | V |
| Cuentas por Pagar | A | A | V (su proyecto) | A | E | ⛔ | V |
| Impuestos / Retenciones | A | A | V (su proyecto) | A | E | E | V |
| Contabilidad (libro mayor) | A | A | V | A | V | V | V |
| Cierre de Periodo | A | A | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

### 2.2.1 `PermissionModule` en código (Phase 7C; audit Phase 12A)

En `packages/domain/src/permissions/matrix.ts`, las claves son las únicas strings válidas para `can(roles, acción, módulo)`.

- **ACCOUNTING:** plan de cuentas y asientos del libro mayor (debe/haber); lectura `VIEW ACCOUNTING`; mutaciones `EDIT ACCOUNTING` (OWNER/ADMIN/FINANCE `APPROVE` ⇒ también EDIT). Sin atajo `VIEW PROJECTS` en rutas globales de contabilidad (Phase 11A).
- **AR:** facturas de venta, cuentas por cobrar, cobranzas (mutación `EDIT AR` en servicios; lectura en proyecto también con `VIEW PROJECTS` donde aplica — ver `PERMISSIONS_ROUTE_MATRIX.md`).
- **Removido:** `SALES_COLLECTIONS` — no se usaba en gates de servicios; capacidad unificada en `AR`.
- Otros módulos financieros siguen en la unión `PermissionModule` aunque algunos aún no tengan `can()` en cada servicio (p. ej. `EXPENSES_PAYMENTS`, `BANK_RECONCILIATION`): la matriz documental §2.2 sigue siendo la guía de producto; el código agrega gates de a poco. **Huecos documentados** en §9 *Remaining RBAC decisions*.

### 2.2.2 Pantalla `/configuracion/permisos` (referencia RBAC)

- Matriz **solo lectura** (techo por rol × módulo) generada desde `buildPermissionMatrixGrid()`; la UI agrupa columnas por categoría y permite **notas internas por módulo** persistidas en `Tenant.permissionMatrixNotes` — ver [ADR-Phase1-05](../08-architecture/ARCHITECTURE_DECISION_RECORDS.md) y [`PERMISSIONS_ROUTE_MATRIX.md`](../08-architecture/PERMISSIONS_ROUTE_MATRIX.md).

### 2.3 Reportes

| Reporte | OWNER | ADMIN | PM | FINANCE | PROCUREMENT | WAREHOUSE | SALES | VIEWER |
|---|---|---|---|---|---|---|---|---|
| Rentabilidad bruta del proyecto | V | V | V (su proyecto) | V | ⛔ | ⛔ | ⛔ | V |
| Rentabilidad neta del proyecto | V | V | ⚙️ | ⚙️ | ⛔ | ⛔ | ⛔ | ⚙️ |
| Rentabilidad neta consolidada | V | V | ⛔ | ⚙️ | ⛔ | ⛔ | ⛔ | ⚙️ |
| Presupuesto vs Real | V | V | V (su proyecto) | V | V (su área) | ⛔ | V (su área) | V |
| Avance vs Costo | V | V | V (su proyecto) | V | V | ⛔ | ⛔ | V |
| Cashflow Real | V | V | V (su proyecto) | V | ⛔ | ⛔ | ⛔ | V |
| Proyección de Caja | V | V | V (su proyecto) | V | ⛔ | ⛔ | ⛔ | V |
| AR (aging) | V | V | V (su proyecto) | V | ⛔ | ⛔ | V | V |
| AP (aging) | V | V | V (su proyecto) | V | V | ⛔ | ⛔ | V |
| Stock / Valorización | V | V | V (su proyecto) | V | V | V | ⛔ | V |
| Compras por proveedor | V | V | V (su proyecto) | V | V | V | ⛔ | V |
| Compras multi-proyecto | V | V | ⛔ | V | V | V | ⛔ | V |
| Materiales más caros | V | V | V (su proyecto) | V | V | V | ⛔ | V |
| Evolución de certificaciones | V | V | V (su proyecto) | V | ⛔ | ⛔ | V | V |
| Auditoría | V | V | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Query Builder | V | V | V (su proyecto) | V | V (su área) | V (su área) | V (su área) | V |
| Dashboard ejecutivo | V | V | V (su proyecto, recortado) | V | ⛔ | ⛔ | ⛔ | V |

### 2.4 Administración

| Módulo | OWNER | ADMIN | otros |
|---|---|---|---|
| Usuarios y Roles | A | A | ⛔ |
| Configuración del Tenant | A | A | ⛔ |
| Master Data (catálogos) | A | A | V |
| Auditoría | V | V | ⛔ |
| Multi-empresa (si aplica) | A | A | ⛔ |
| Facturación del SaaS | A | ⛔ | ⛔ |

---

## 3. Permisos especiales por contexto

Más allá de la matriz, hay permisos atados a **contextos específicos**:

| Permiso especial | Quién lo tiene | Cuándo aplica |
|---|---|---|
| Anular movimiento `CONFIRMED` | OWNER, ADMIN | Siempre |
| Anular certificación `ISSUED` | OWNER, ADMIN, PM (si está en periodo abierto) | Periodo abierto |
| Reabrir periodo cerrado | OWNER, ADMIN | Cualquier momento (queda auditado) |
| Cancelar obra `ACTIVE`/`ON_HOLD` | OWNER, ADMIN | Motivo obligatorio; sin documentos operativos abiertos ([BR-PROJ-005], [PERM-007]) |
| Reactivar obra `CANCELLED` | OWNER, ADMIN | Motivo obligatorio; restaura estado previo ([BR-PROJ-006], [PERM-007]) |
| Editar comprobante con valor legal emitido | _nadie_ | Nunca; se anula y se reemite |
| Ver `PROJECT_MANAGER` en obra ajena | OWNER, ADMIN | Siempre |
| Cambiar tenant de un usuario | OWNER (origen y destino) | Casos excepcionales |
| Forzar tipo de cambio histórico | OWNER, ADMIN | Cierre de periodo |
| Aprobar OC sobre cierto monto | Configurable: OWNER, ADMIN, o PM con habilitación | Si Admin define umbral |

---

## 4. Reglas de combinación de roles

- Si una persona tiene múltiples roles, sus permisos son la **unión** de los permisos de cada rol.
- Un permiso `⚙️` (configurable) requiere que **algún rol que la persona tenga** lo habilite explícitamente.
- Permisos por proyecto **se suman** a los globales en el contexto del proyecto.
- Si un usuario es `FINANCE` global y `VIEWER` en un proyecto: en ese proyecto sigue viendo lo financiero del proyecto, pero no puede editar lo operativo.

---

## 5. Reglas que NO se pueden quebrar (hardcoded)

- **PERM-001**: ningún rol distinto a `OWNER` o `ADMIN` puede cerrar periodos.
- **PERM-002**: ningún rol puede editar un comprobante legal emitido.
- **PERM-003**: ningún rol puede ver datos de **otro tenant**.
- **PERM-004**: ningún rol distinto a `OWNER` puede transferir la propiedad del tenant.
- **PERM-005**: ningún rol distinto a `ADMIN` u `OWNER` puede modificar permisos de otros usuarios.
- **PERM-006**: la rentabilidad neta consolidada está bloqueada para roles fuera de `OWNER` y `ADMIN` salvo habilitación explícita.
- **PERM-007**: cancelar obra `ACTIVE`/`ON_HOLD` y reactivar obra `CANCELLED` solo **OWNER** o **ADMIN** ([D-042]).

---

## 6. Cómo se resuelve un permiso (algoritmo conceptual)

```
function can(usuario, accion, modulo, contexto):
    if accion in PERMISOS_HARDCODED:
        return PERMISOS_HARDCODED[accion](usuario)
    permisos_efectivos = union(roles_globales(usuario)) + union(roles_proyecto(usuario, contexto.proyecto))
    return accion in permisos_efectivos[modulo]
```

Detalle: un módulo "ve" datos de su tenant solamente; si la acción cruza tenants, se rechaza siempre.

---

## 7. Auditoría de permisos

Toda acción de cambio de permisos queda registrada con:

- Usuario que cambió.
- Usuario afectado.
- Permiso anterior / nuevo.
- Timestamp.
- Motivo (campo de texto opcional).

Esto se almacena en el log de auditoría general (ver [`02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md) — Fase B).

---

## 8. Preguntas abiertas

- ¿Hay umbral de monto para aprobación obligatoria de OCs (ej. mayores a X requieren aprobación de Admin)?
- ¿El `PROJECT_VIEWER` para cliente externo en Fase 1 o Fase 2/3?
- ¿Dos usuarios distintos pueden tener `OWNER` simultáneamente o es uno único?
- ¿Roles personalizables por tenant (ej. tenant define "Coordinador") o solo los predefinidos?

---

## 9. Remaining RBAC decisions (Phase 12A)

Esta sección **no** cambia reglas de código; documenta huecos entre matriz documental, union `PermissionModule` y gates actuales en servicios.

### 9.1 Módulos matriz vs cables en servicios

- Varios `PermissionModule` existen para **paridad** con la matriz papel §2.1–2.4 y para expansiones futuras; **no** todos aparecen en `can()` dentro de `packages/services` todavía. Los gates operativos suelen usar el módulo **agregado** (ej. `PROCUREMENT` para OC/recepciones; `TREASURY` para cuentas/movimientos/transferencias; `DIRECTORY` para contactos).
- **`DOCUMENTS`:** presente en la union; las reglas efectivas de adjuntos pasan por `document.service` y combinan `linkedEntityType` + `VIEW`/`EDIT` del módulo enlazado (`PROJECTS`, `JOBSITE_LOG`, …), no por un único `can(…, DOCUMENTS)` global.

### 9.2 Inbox y `NOTIFICATIONS`

- La matriz otorga `VIEW NOTIFICATIONS` a roles típicos; la ruta **`/notificaciones`** permanece accesible a **cualquier** usuario con membresía activa en el tenant (**sin** exigir `VIEW NOTIFICATIONS`) para bandeja personal. Alertas operativas (`/notificaciones/alertas`) y log de emails siguen restringidas a **OWNER**/**ADMIN**. Si en el futuro se exige el permiso para la bandeja, es cambio de producto explícito.

### 9.3 Aging global y `PROJECT_MANAGER`

- Con la matriz actual, PM tiene **`EDIT AR`** ⇒ **`VIEW AR`** ⇒ puede usar aging CxC tenant-wide. Restringir aging global a financiero/admin es una **decisión de producto** pendiente (alternativas: nuevo permiso, rol de reporte, o filtros obligatorios por proyecto).

### 9.4 Certificaciones vs atajo `VIEW PROJECTS`

- **`certification.service`** valida `CERTIFICATIONS` sin combinar `VIEW PROJECTS` en el mismo guard que libro de obra/documentos. Es coherente con tratar certificaciones como módulo fuerte; roles solo-proyecto sin `CERTIFICATIONS` no acceden (p. ej. **`WAREHOUSE`** no tiene `CERTIFICATIONS` en la matriz).

### 9.5 Módulos habilitados por tenant (Phase 12B foundation)

- **Modelo:** tabla **`tenant_module_settings`** (`TenantModuleSetting`): `tenantId`, `moduleKey` (string validado contra `PermissionModule` / lista `OVERVIEW_MODULES`), `isEnabled`, `internalNotes`; único `(tenantId, moduleKey)`.
- **Regla de producto:** **rol (`can`) ≠ módulo disponible.** El usuario efectivo requiere **ambos** para la navegación principal que ya combina checks (Phase 12B). Los roles definen **capacidad**; el flag de tenant define que el módulo esté **habilitado/contratado** para esa organización.
- **Default:** si **no** hay fila para un `moduleKey`, el módulo se considera **habilitado** (compatibilidad con datos existentes).
- **Quién edita:** solo **superadmin de plataforma** (`/platform/tenants/[tenantId]/modules`), nunca `OWNER`/`ADMIN` del tenant en 12B.
- **Qué falta (Phase 12C recomendado):** aplicar el mismo criterio en **servicios** para rutas profundas y APIs, no solo en el sidebar. **Phase 13G:** cubierto para **`jobsite-log.service`** (`JOBSITE_LOG`) — ver `PERMISSIONS_ROUTE_MATRIX.md`.

### 9.6 Phase 13F — auditoría final (sin cambiar poderes de rol)

Decisiones **confirmadas** como coherentes con docs existentes (no se modificó `matrix.ts`):

| Tema | Resultado |
|------|-----------|
| **PM + aging CxC/CxP global** | Con la matriz actual, `PROJECT_MANAGER` tiene **`EDIT AR`** ⇒ **`VIEW AR`** ⇒ puede aging tenant-wide. Restringir a finanzas/admin sigue como **decisión de producto** abierta (§9.3). |
| **`/notificaciones` sin `VIEW NOTIFICATIONS`** | Se mantiene: bandeja personal para cualquier miembro activo; §9.2. |
| **Certificaciones vs `VIEW PROJECTS`** | Se mantiene módulo fuerte `CERTIFICATIONS` en `certification.service`; sin atajo `VIEW PROJECTS` en el mismo guard. |
| **Platform vs tenant OWNER/ADMIN** | Independientes: `/platform` vía `isPlatformSuperadmin`; tenant RBAC no otorga plataforma ni al revés. |
| **Nav principal vs módulo tenant** | Cada ítem con `require` combina `can()` **y** `isTenantModuleEnabled` para cada hoja del árbol `require` (Phase 12B). `/dashboard` sin gate de módulo. |

**Código tocado en 13F:** ninguno en `matrix.ts` — solo documentación cruzada.

### 9.7 Prisma / ERD (Phase 13E)

Resumen ejecutivo en [`08-architecture/PRISMA_ERD_AUDIT.md`](../08-architecture/PRISMA_ERD_AUDIT.md) (ledger único, adjuntos, soft-FKs aceptados, advertencias de migración).
