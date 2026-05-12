# Directorio — Contactos unificados

## 1. Objetivo
Centralizar todas las personas físicas/jurídicas con las que opera la empresa constructora bajo una única entidad **Contact**, permitiendo **roles múltiples** (cliente, proveedor, subcontratista, empleado, otro). Eliminar duplicados y permitir el mismo contacto como cliente y proveedor sin registros duplicados.

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
- **BR-DIR-002**: un contacto puede tener simultáneamente rol `CLIENT` y `SUPPLIER` ([D-016]).
- **BR-DIR-003**: archivar no elimina referencias históricas.

## 11. Validaciones
- Formato CUIT/CUIL (11 dígitos + dígito verificador recomendado).
- Email y teléfono en formato estándar.
- Condición de IVA / categoría fiscal según país (Argentina: responsable inscripto, monotributo, etc., como catálogo).

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
- **Compras / OC / Facturas**: proveedor → Contact con rol SUPPLIER.
- **Subcontratos**: subcontratista → Contact con rol SUBCONTRACTOR.
- **Tesorería**: contraparte en movimientos.

## 16. Permisos
Ver [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md) fila Directorio.

## 17. Eventos disparados / consumidos
- `contact.created`, `contact.updated`, `contact.archived`, `contact.role_assigned`.

## 18. Fase de implementación
**Fase 1** — núcleo obligatorio del onboarding.

## 19. Preguntas abiertas
- Merge automático de duplicados: reglas y UI ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)).
