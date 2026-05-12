# Subcontratistas — Vista rol Subcontratista

## 1. Objetivo
Identificar y gestionar empresas o personas que ejecutan **paquetes de obra** bajo contrato, con datos específicos de especialidad, certificaciones y condiciones de pago distintas a un proveedor de materiales.

## 2. Usuarios y roles que lo usan
- **PM**, **PROCUREMENT**, **ADMIN**, **OWNER**, **FINANCE**.

## 3. Problema que resuelve
Diferenciar del proveedor de insumos: el subcontratista tiene **contrato de ejecución**, avances certificables y retenciones típicas de construcción.

## 4. Datos que consume (inputs)
- Contact + rol `SUBCONTRACTOR` + **SubcontractorProfile** (especialidad, ART/cobertura si aplica).

## 5. Datos que produce (outputs)
- Perfil para selección en **Subcontratos** y comparativas.
- Histórico de subcontratos y certificaciones de subcontrato.

## 6. Entidades principales
- **Contact**, **ContactRole(SUBCONTRACTOR)**, **SubcontractorProfile**.

## 7. Estados y transiciones
Hereda Contact `ACTIVE` / `ARCHIVED`.

## 8. Acciones disponibles
- Alta/edición subcontratista.
- Ver subcontratos activos y cerrados.
- Adjuntar documentación (seguros, habilitaciones).

## 9. Pantallas y vistas necesarias
- Lista subcontratistas con especialidad y proyectos donde trabajan.
- Ficha con pestaña documentos y contratos.

## 10. Reglas de negocio
- **BR-SUBC-001**: un **Subcontract** debe referenciar Contact con rol SUBCONTRACTOR ([D-015]).

## 11. Validaciones
- Especialidad obligatoria si la empresa lo define como política interna.

## 12. Fórmulas relacionadas
- Certificación de subcontrato y pagos: [`SUBCONTRACTS.md`](./SUBCONTRACTS.md), [`../04-formulas/CERTIFICATION_FORMULAS.md`](../04-formulas/CERTIFICATION_FORMULAS.md).

## 13. Casos borde
- Subcontratista que también vende materiales: roles SUPPLIER + SUBCONTRACTOR en mismo Contact.

## 14. Reportes relacionados
- Pagos a subcontratistas, retenciones, avance por subcontrato.

## 15. Relación con otros módulos
- **Subcontratos**, **Directorio**, **Compras** (si suministra también).

## 16. Permisos
PM ve subcontratistas de sus proyectos; ADMIN ve todos.

## 17. Eventos disparados / consumidos
- `subcontractor_profile.updated`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Validación de ART / seguros con vencimiento y alertas ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)).
