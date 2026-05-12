# Clientes — Vista rol Cliente

## 1. Objetivo
Proveer una **vista filtrada** del directorio para contactos con rol **CLIENT**, con campos y métricas específicas de relación comercial (condiciones de pago, límites, historial de obras).

## 2. Usuarios y roles que lo usan
- **SALES**, **ADMIN**, **OWNER**, **FINANCE**, **PM** (consulta).

## 3. Problema que resuelve
Evitar una tabla “clientes” duplicada; centraliza en `Contact` + `ClientProfile`.

## 4. Datos que consume (inputs)
- Contact existente con rol `CLIENT` (o alta desde esta vista que crea Contact + rol).
- Catálogos: `PaymentTerm`, moneda ([`MASTER_DATA.md`](../01-domain/MASTER_DATA.md)).

## 5. Datos que produce (outputs)
- **ClientProfile**: `credit_limit`, `payment_terms_days`, `default_currency`, notas comerciales.
- Métricas derivadas: número de proyectos activos, AR total, última certificación.

## 6. Entidades principales
- **Contact** + **ContactRole(CLIENT)** + **ClientProfile**.

## 7. Estados y transiciones
El cliente como vista hereda estados del Contact (`ACTIVE` / `ARCHIVED`).

## 8. Acciones disponibles
- Crear cliente (crea Contact + rol + perfil).
- Editar condiciones comerciales del perfil.
- Ver proyectos y certificaciones del cliente.
- Archivar (desde directorio o desde aquí).

## 9. Pantallas y vistas necesarias
- Lista de clientes con columnas: nombre, CUIT, proyectos activos, saldo AR.
- Ficha cliente: perfil + lista de proyectos + documentos.

## 10. Reglas de negocio
- **BR-CLI-001**: solo contactos con rol `CLIENT` aparecen en esta vista.
- **BR-CLI-002**: eliminar rol CLIENT solo si no hay proyecto activo con ese cliente (o con confirmación explícita).

## 11. Validaciones
- `credit_limit >= 0` si informado.
- `payment_terms_days >= 0`.

## 12. Fórmulas relacionadas
- Aging AR por cliente (reporte): [`../06-reports/FINANCIAL_REPORT_PACK.md`](../06-reports/FINANCIAL_REPORT_PACK.md).

## 13. Casos borde
- Cliente persona física sin CUIT: flag “consumidor final”.
- Grupo económico: varios contactos con mismo grupo matriz (notas en campo texto; modelo formal Fase 2).

## 14. Reportes relacionados
- Cuentas por cobrar por cliente, rentabilidad por cliente (si multi-proyecto mismo cliente).

## 15. Relación con otros módulos
- **Proyectos**, **Certificaciones**, **Ventas/Cobranzas**, **Directorio**.

## 16. Permisos
Ver matriz: SALES edita perfil cliente; FINANCE ve montos sensibles.

## 17. Eventos disparados / consumidos
- `client_profile.updated`.

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Portal cliente externo ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-014).
