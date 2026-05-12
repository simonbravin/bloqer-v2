# User Roles — Bloqer 2.0

> Roles **funcionales** que existen en la aplicación. Estos roles son la base de la matriz de permisos en [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md).  
> Decisión lockeada: la matriz de permisos es **simple** — `ver / crear-editar / aprobar` por módulo. Sin permisos a nivel campo.

---

## 1. Filosofía de roles

- Los roles representan **funciones**, no jerarquías.
- Una persona real puede tener **múltiples roles** (ej. el dueño es Owner + Admin + PM de una obra).
- Hay **roles globales** del tenant y **roles por proyecto** (asignación específica).
- El producto **no** modela jerarquías formales (jefe de jefe). Solo permisos efectivos.

---

## 2. Roles globales (a nivel tenant)

### 2.1 `OWNER`
- **Quién es:** dueño de la empresa o socio fundador.
- **Acceso:** total. Único rol que puede ver rentabilidad neta consolidada por defecto.
- **Únicas acciones exclusivas:** transferir propiedad del tenant, eliminar el tenant, gestionar facturación del SaaS.
- **Cuántos hay:** mínimo 1, sin máximo formal.

### 2.2 `ADMIN`
- **Quién es:** administrador del sistema en la empresa.
- **Acceso:** todos los módulos con acción `aprobar`. Configura usuarios, permisos, parámetros generales, cierres de periodo.
- **Acciones críticas:** abrir/cerrar periodos, configurar permisos, gestionar maestros, anular movimientos confirmados, ver reportes financieros completos.
- **Cuántos hay:** típicamente 1-3.

### 2.3 `FINANCE`
- **Quién es:** responsable financiero / tesorero.
- **Acceso:** completo en tesorería, AR, AP, conciliación bancaria, reportes financieros.
- **Acciones típicas:** registrar pagos, cobranzas, transferencias internas, conciliar cuentas, emitir reportes.
- **Vista limitada:** sí ve rentabilidad bruta; rentabilidad neta solo si Admin lo habilita.

### 2.4 `PROCUREMENT`
- **Quién es:** responsable de compras.
- **Acceso:** completo en compras, OC, recepciones, proveedores, comparativas.
- **Acciones típicas:** crear OC, aprobar OC, registrar recepción, cargar facturas de compra, gestionar proveedores.
- **Vista limitada:** ve costos, no ve precios de venta a cliente, no ve rentabilidad.

### 2.5 `WAREHOUSE`
- **Quién es:** responsable de depósito / pañolero.
- **Acceso:** completo en inventario y depósitos.
- **Acciones típicas:** registrar ingresos, egresos, ajustes, transferencias, ver stock.
- **Vista limitada:** no ve precios de compra ni de venta, solo costos de movimiento valorizados si Admin lo habilita.

### 2.6 `SALES`
- **Quién es:** responsable comercial / ventas directas.
- **Acceso:** completo en clientes, ventas directas, cobranzas.
- **Acciones típicas:** registrar venta directa, emitir factura, cargar cobranza.
- **Vista limitada:** no ve costos.

### 2.7 `VIEWER`
- **Quién es:** stakeholder solo lectura (auditor externo, contador, asesor).
- **Acceso:** todos los módulos en modo solo lectura, sin ver rentabilidad neta por defecto.
- **Acciones:** ninguna que modifique datos.

---

## 3. Roles por proyecto (asignación específica)

Estos roles **solo aplican a un proyecto** asignado. Una persona puede ser PM de Obra A y solo VIEWER de Obra B.

### 3.1 `PROJECT_MANAGER` (PM)
- **Quién es:** jefe de obra responsable del proyecto.
- **Acceso:** total dentro del proyecto asignado: presupuesto, certificaciones, compras imputadas a la obra, libro de obra, cronograma, RFIs, change orders.
- **Facturación / cobranzas en obra:** en código, mutaciones sobre facturas de venta, CXC y cobranzas requieren `EDIT AR` (`packages/domain`); el PM tiene techo `AR` **editar** en la matriz TypeScript (Phase 7C).
- **Acciones críticas:** emitir certificaciones, cerrar partes diarios, solicitar OCs, aprobar recepciones de obra.
- **Vista limitada:** rentabilidad bruta de su obra; neta solo si Admin lo habilita.

### 3.2 `SITE_FOREMAN` (capataz)
- **Quién es:** referente operativo en obra.
- **Acceso:** libro de obra, partes diarios, consulta de presupuesto y stock.
- **Acciones típicas:** cargar parte diario, fotos, eventos, solicitar materiales (no compra directa).
- **Vista limitada:** no ve costos ni precios.

### 3.3 `PROJECT_VIEWER`
- **Quién es:** cliente externo, dirección de obra externa, auditor de obra.
- **Acceso:** vista solo lectura de un proyecto específico.
- **Acciones:** ninguna que modifique datos.
- **Uso típico:** dar acceso al cliente para que vea avance certificado y RFIs.

---

## 4. Roles externos (futuro — Fase 2/3)

> No están en Fase 1, se documentan para que el modelo los anticipe.

- `CLIENT_PORTAL`: cliente accediendo a un portal limitado (ver certificaciones aprobadas, su deuda, RFIs).
- `SUPPLIER_PORTAL`: proveedor viendo OCs emitidas a su nombre y estado de pagos.
- `SUBCONTRACTOR_PORTAL`: subcontratista viendo su contrato, certificaciones y pagos.

---

## 5. Combinaciones típicas reales

| Persona | Roles globales | Roles por proyecto |
|---|---|---|
| Dueño de empresa pequeña | `OWNER` + `ADMIN` + `FINANCE` | `PROJECT_MANAGER` en todas las obras |
| Director de empresa mediana | `OWNER` | `VIEWER` en todas las obras |
| Administradora | `ADMIN` + `FINANCE` | `VIEWER` en todas las obras |
| Jefe de obra | _ninguno global_ | `PROJECT_MANAGER` en su obra, `VIEWER` en otras |
| Capataz | _ninguno global_ | `SITE_FOREMAN` en su obra |
| Compras | `PROCUREMENT` | _ninguno_ |
| Pañolero | `WAREHOUSE` | _ninguno_ |
| Contador externo | `VIEWER` global | _ninguno_ |
| Cliente final | _ninguno_ | `PROJECT_VIEWER` en su obra (Fase 2/3) |

---

## 6. Reglas sobre roles

- **R-USR-001**: un usuario debe tener al menos un rol global o un rol por proyecto. Sin rol no puede ingresar.
- **R-USR-002**: el rol `OWNER` no se puede eliminar sin transferir la propiedad del tenant a otro usuario.
- **R-USR-003**: la rentabilidad neta consolidada del tenant es visible **solo** para `OWNER` y `ADMIN`. Otros roles requieren habilitación explícita por Admin.
- **R-USR-004**: la rentabilidad neta de un proyecto puntual es visible para `OWNER`, `ADMIN`, y para el `PROJECT_MANAGER` del proyecto si Admin lo habilita.
- **R-USR-005**: solo `ADMIN` y `OWNER` pueden cerrar/reabrir periodos.
- **R-USR-006**: solo `ADMIN` y `OWNER` pueden anular movimientos en estado `CONFIRMED`.
- **R-USR-007**: la asignación de un usuario a un proyecto es independiente de sus roles globales (puede ser `FINANCE` global y `VIEWER` en una obra puntual).

---

## 7. Permisos efectivos

La regla de combinación es **OR sobre permisos**, no AND:

> Un usuario tiene una acción permitida si **alguno** de sus roles (global o por proyecto) la habilita en el contexto correspondiente.

Detalle completo en [`PERMISSIONS_MATRIX.md`](./PERMISSIONS_MATRIX.md).

---

## 8. Roles que NO existen (intencionalmente)

- **No hay** rol "supervisor" abstracto. Si alguien tiene que aprobar, es `ADMIN`, `OWNER`, o `PROJECT_MANAGER`.
- **No hay** rol "asistente" o "junior". Los permisos no se basan en seniority sino en función.
- **No hay** rol "RRHH". Bloqer no gestiona sueldos.
- **No hay** rol "contador interno". El contador externo entra como `VIEWER` global. Si gestiona internamente, es `ADMIN` + `FINANCE`.

---

## 9. Preguntas abiertas

- ¿`PROJECT_VIEWER` para cliente externo entra en Fase 1 o Fase 2? — _abierto, ver `OPEN_QUESTIONS.md`_
- ¿Hay flujo de invitación con email + activación, o solo creación por Admin? — _abierto_
- ¿2FA obligatorio para `OWNER` y `ADMIN`? — _abierto_
