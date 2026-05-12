# Libro de obra (Jobsite Log)

## 1. Objetivo
Registrar **diariamente** lo ocurrido en obra: clima, cuadrillas, tareas, materiales recibidos, incidencias y fotos — como evidencia operativa y soporte a certificaciones y reclamos.

## 2. Usuarios y roles que lo usan
- **SITE_FOREMAN**, **PM**, **ADMIN**; lectura **VIEWER** según asignación.

## 3. Problema que resuelve
Falta de registro formal impide demostrar avance físico o causas de demora.

## 4. Datos que consume (inputs)
- **Project**, fecha, usuarios presentes.
- Fotos/documentos ([`DOCUMENTS.md`](./DOCUMENTS.md)).

## 5. Datos que produce (outputs)
- **JobsiteLogEntry** con estado `DRAFT | SUBMITTED | APPROVED`.

## 6. Entidades principales
- **JobsiteLogEntry**.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § JobsiteLogEntry.

## 8. Acciones disponibles
- Crear parte del día (borrador).
- Enviar y aprobar.
- Anexar fotos y observaciones.

## 9. Pantallas y vistas necesarias
- Calendario de partes por proyecto.
- Entrada rápida móvil (Fase 2).
- Export PDF semanal del libro.

## 10. Reglas de negocio
- **BR-JL-001**: recomendación una entrada por día; no obligatorio hard ([BR-JL-001]).
- Partes aprobados son lectura para certificación como evidencia complementaria.

## 11. Validaciones
- Fecha no futura para parte “ejecutado”.
- Al menos un campo descriptivo no vacío.

## 12. Fórmulas relacionadas
_No directas_; cruza con avance físico en [`../04-formulas/PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).

## 13. Casos borde
- Turnos nocturnos: permitir fecha + turno.
- Multiples frentes mismo día: varias entradas o campo “frente”.

## 14. Reportes relacionados
- Libro de obra PDF, línea de tiempo obra.

## 15. Relación con otros módulos
- **Proyectos**, **Cronograma**, **Certificaciones**, **Inventario** (recepciones).

## 16. Permisos
FOREMAN crea; PM aprueba.

## 17. Eventos disparados / consumidos
- `jobsite_log.submitted`, `jobsite_log.approved`.

## 18. Fase de implementación
**Fase 1** web; **Fase 2** móvil offline.

## 19. Preguntas abiertas
- Firma digital / inspector externo ([Q-005]).
