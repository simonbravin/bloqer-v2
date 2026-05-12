# Proveedores — Vista rol Proveedor

## 1. Objetivo
Gestionar proveedores como **vista del directorio** con datos operativos de compras: condiciones de pago, datos bancarios, categorías de suministro.

## 2. Usuarios y roles que lo usan
- **PROCUREMENT**, **ADMIN**, **OWNER**, **FINANCE**, **WAREHOUSE** (consulta OC/recepciones).

## 3. Problema que resuelve
Historial de compras y evaluación de proveedores sin duplicar maestro “proveedores” aparte del directorio.

## 4. Datos que consume (inputs)
- Contact + rol `SUPPLIER` + **SupplierProfile**.
- Catálogos bancarios, monedas.

## 5. Datos que produce (outputs)
- Perfil proveedor: plazos de pago, cuenta bancaria default, categorías de productos que provee.
- KPIs: monto comprado YTD, OTIF de entregas (Fase 2).

## 6. Entidades principales
- **Contact**, **ContactRole(SUPPLIER)**, **SupplierProfile**.

## 7. Estados y transiciones
Hereda `ACTIVE` / `ARCHIVED` del Contact.

## 8. Acciones disponibles
- Alta/edición de proveedor (Contact + rol + perfil).
- Marcar proveedor preferido por categoría de producto (Fase 2).
- Ver OCs, facturas de compra, AP pendientes.

## 9. Pantallas y vistas necesarias
- Lista proveedores con filtros por rubro, provincia.
- Ficha: datos fiscales, contactos operativos, histórico de compras.

## 10. Reglas de negocio
- **BR-SUP-001**: OC solo puede seleccionar Contact con rol SUPPLIER (o aviso si se fuerza alta rápida).

## 11. Validaciones
- CBU/CVU formato si informado (Argentina).
- Email de contacto operativo recomendado para envío de OC.

## 12. Fórmulas relacionadas
- Reporte gastos por proveedor ([`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)).

## 13. Casos borde
- Proveedor extranjero: moneda USD, sin CUIT AR — usar ID fiscal alternativo.
- Mismo contacto cliente y proveedor: mostrar ambos perfiles en ficha unificada.

## 14. Reportes relacionados
- Compras por proveedor, materiales más caros (filtra por proveedor).

## 15. Relación con otros módulos
- **PROCUREMENT**, **OC**, **Facturas compra**, **Pagos**, **Directorio**.

## 16. Permisos
PROCUREMENT crea/edita; FINANCE ve montos y pagos.

## 17. Eventos disparados / consumidos
- `supplier_profile.updated`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Comparativa automática de cotizaciones entre proveedores (Fase 2).
