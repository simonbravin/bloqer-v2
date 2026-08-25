# Directorio — Contactos unificados

## 1. Objetivo
Centralizar todas las personas físicas/jurídicas con las que opera la empresa constructora bajo una única entidad **Contact**, permitiendo **roles múltiples** (cliente, proveedor, subcontratista, empleado, otro). Eliminar duplicados y permitir el mismo contacto como cliente y proveedor sin registros duplicados.

> Ver [D-016](../00-product/DECISION_LOG.md#d-016--directorio-unificado-contact-con-roles-múltiples), [D-089](../00-product/DECISION_LOG.md#d-089--payee-de-gasto-ap-proveedor-o-empleado-subcontrato--oc).

## 2. Usuarios y roles que lo usan
- **ADMIN**, **OWNER**: alta/edición maestra de contactos.
- **FINANCE**, **PROCUREMENT**, **SALES**, **PM**: alta rápida desde flujos operativos.
- **VIEWER**: solo lectura.

## 3. Problema que resuelve
Sin directorio unificado, cada módulo crea “su” cliente o proveedor; los datos fiscales divergen y no hay visión integral del vínculo comercial.

## 4. Datos que consume (inputs)
- Datos fiscales y de contacto ingresados manualmente o importados (CSV futuro).
- Catálogos: provincias/ciudades, monedas habilitadas ([`MASTER_DATA.md`](../01-domain/MASTER_DATA.md)).

## 5. Datos que produce (outputs)
- Registro único `Contact` + colección `ContactRole`.
- Perfiles opcionales (`ClientProfile`, `SupplierProfile`, `SubcontractorProfile`).
- Historial de uso por proyecto/compra (referenciado desde otros módulos).

## 6. Entidades principales
- **Contact** — raíz del directorio.
- **ContactRole** — relación N:M contacto ↔ rol.
- **ClientProfile**, **SupplierProfile**, **SubcontractorProfile** — extensiones por rol.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Contact: `ACTIVE` ↔ `ARCHIVED`.

## 8. Acciones disponibles
- Crear / editar contacto (incluye datos fiscales).
- Asignar o quitar roles (no elimina histórico).
- Archivar contacto (no borrar si está referenciado).
- Fusionar duplicados (Fase 2): propuesta de merge con revisión.

## 9. Pantallas y vistas necesarias
- Lista de contactos con filtros por rol, provincia, CUIT, estado.
- Ficha de contacto: datos generales, roles, proyectos vinculados, compras, ventas, documentos.
- Búsqueda global por nombre fantasía / razón social / CUIT.

## 10. Reglas de negocio
- **BR-DIR-001**: CUIT/CUIL único por tenant si está informado ([`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) BR-VAL-001).
- **BR-DIR-002**: un contacto puede tener simultáneamente varios roles (p. ej. `CLIENT` + `SUPPLIER`, `EMPLOYEE` + `SUPPLIER`) ([D-016], [D-089]).
- **BR-DIR-003**: archivar no elimina referencias históricas.

## 11. Validaciones
- Formato CUIT/CUIL (11 dígitos + dígito verificador recomendado).
- Email y teléfono en formato estándar.
- Condición frente al IVA (`iva_condition`) según catálogo argentino ([D-084] / [`MASTER_DATA.md`](../01-domain/MASTER_DATA.md) §2.6b): Responsable Inscripto, Monotributo, Exento, Consumidor Final, No categorizado, Sujeto del exterior.

## 12. Fórmulas relacionadas
_No aplica directamente._ Reportes agregan datos de contacto vía joins.

## 13. Casos borde
- Cliente sin CUIT (consumidor final): permitir con flag y advertencia.
- Proveedor extranjero: moneda y datos fiscales alternativos.
- Cambio de razón social: auditoría y opción de conservar histórico con alias.

## 14. Reportes relacionados
- Directorio exportable ([`../06-reports/REPORT_CATALOG.md`](../06-reports/REPORT_CATALOG.md)).
- Compras por proveedor, aging AP por proveedor (usan este módulo).

## 15. Relación con otros módulos
- **Proyectos**: `client_id` → Contact con rol CLIENT.
- **Compras / OC**: proveedor → Contact con rol SUPPLIER.
- **Gastos / facturas AP sin OC**: payee → Contact con rol SUPPLIER **o** EMPLOYEE ([D-089]).
- **Subcontratos**: subcontratista → Contact con rol SUBCONTRACTOR (pago vía certificación, no vía OC).
- **Tesorería**: contraparte en movimientos.

Convención Argentina: un contacto puede ser **Empleado** (sueldo/reintegro) y a la vez **Proveedor** si emite factura (monotributo). No hace falta el segundo rol solo para reintegrar.

## 16. Permisos
Ver [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) fila Directorio.

## 17. Eventos disparados / consumidos
- `contact.created`, `contact.updated`, `contact.archived`, `contact.role_assigned`.

## 18. Fase de implementación
**Fase 1** — núcleo obligatorio del onboarding.

## 19. Preguntas abiertas
- Merge automático de duplicados: reglas y UI ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)).
