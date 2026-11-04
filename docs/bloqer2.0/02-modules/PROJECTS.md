# Proyectos (Obras)

## 1. Objetivo
Representar cada **obra** como unidad central de negocio: cliente, ubicación, tipo público/privado, fechas, estado operativo, vínculo con presupuesto activo y métricas de avance y rentabilidad.

## 2. Usuarios y roles que lo usan
- **PM**, **ADMIN**, **OWNER**, **FINANCE**, **PROCUREMENT**, **WAREHOUSE**, **SALES**, **VIEWER** (limitado).

## 3. Problema que resuelve
Sin proyecto formal no hay imputación clara de costos ni certificaciones coherentes.

## 4. Datos que consume (inputs)
- Cliente (`Contact` rol CLIENT).
- Ubicación (provincia/ciudad maestro).
- Configuración tenant (numeración, políticas).

## 5. Datos que produce (outputs)
- **Project** con código interno, estado, tipo `PUBLIC` | `PRIVATE`.
- Dashboard por obra: avance físico/económico/financiero, costos comprometidos/pagados.

## 6. Entidades principales
- **Project** — núcleo.
- **ProjectTeamMember** — roster de avisos por obra ([D-091]); etiqueta `PROJECT_MANAGER` \| `SITE_FOREMAN` \| `OTHER` (no otorga permisos).
- **ProjectMembership** — acceso a la obra bajo el modo por asignación (D-111); independiente de los avisos.

## 7. Estados y transiciones
Ver [`STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md) § Project: `DRAFT` → `ACTIVE` → `ON_HOLD` / `COMPLETED` / `CANCELLED`.

## 8. Acciones disponibles
- Crear/editar proyecto (campos base).
- Activar, pausar, reanudar, completar, cancelar (con confirmación en UI).
- Cancelar obra `ACTIVE`/`ON_HOLD`: solo OWNER/ADMIN ([BR-PROJ-005], [PERM-007]).
- Reactivar obra `CANCELLED`: solo OWNER/ADMIN ([BR-PROJ-006], [PERM-007]).
- **Equipo de obra** (`ProjectTeamMember`, [D-091]): asignar usuarios del tenant con cuenta y membresía activas al roster de avisos (card al final de Configuración `/editar`). El Resumen muestra un aviso si no hay PM activo. El roster no otorga permisos; el acceso real usa `ProjectMembership` y el modo de acceso vigente (D-111).

## 9. Pantallas y vistas necesarias
- Lista de proyectos con filtros estado, cliente, PM.
- Ficha proyecto: resumen, pestañas presupuesto, cronograma, certificaciones, compras, inventario, documentos.
- Configuración del proyecto (`/editar`): datos generales + **Equipo de obra**.
- Selector de proyecto global en cabecera de la app.

## 10. Reglas de negocio
- **BR-PROJ-001**: proyecto tiene siempre `client_id` ([`BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)).
- **BR-PROJ-002**: tipo público/privado inmutable tras primer presupuesto aprobado ([BR-PROJ-002]).
- **BR-PROJ-003**: proyecto `ON_HOLD`/`COMPLETED`/`CANCELLED` solo lectura operativa ([BR-PROJ-003]).
- **BR-PROJ-004**: cancelación no elimina datos financieros ([D-042]).
- **BR-PROJ-005**: cancelar obra en curso — OWNER/ADMIN, motivo, sin documentos abiertos ([D-042]).
- **BR-PROJ-006**: reactivación de obra cancelada — OWNER/ADMIN, auditada ([D-042]).
- **D-111, enmienda Q-067 (03/11/2026):** si el modo por asignación y los roles vigentes del creador lo requieren, el alta incorpora su `ProjectMembership` únicamente a esa obra nueva, en la misma transacción que la obra y su auditoría. No concede roles ni otras obras y no cambia accesos históricos.
- El tope acumulado de certificación es estricto en ambos `project_type` ([D-119]).

## 11. Validaciones
- `start_date <= end_date` si ambos informados.
- Las fechas opcionales se pueden vaciar al editar. Una fecha inválida se rechaza; no se descarta silenciosamente. Una actualización parcial compara la fecha modificada con la otra fecha ya guardada. Completar valida también inicio frente a fin real.
- `code` único por tenant.

## 12. Fórmulas relacionadas
- Avance triple dimensión: [`../04-formulas/PROGRESS_FORMULAS.md`](../04-formulas/PROGRESS_FORMULAS.md).
- Rentabilidad obra: [`../04-formulas/PROFITABILITY_FORMULAS.md`](../04-formulas/PROFITABILITY_FORMULAS.md).

## 13. Casos borde
- Obra sin fecha fin (activa indefinida): permitir `end_date` null.
- Cambio de cliente en obra en curso: proceso excepcional con auditoría y contrato actualizado.
- Cancelación por error: OWNER/ADMIN puede reactivar vía `project.reactivated` ([BR-PROJ-006]).
- Obra cancelada con presupuesto aprobado: presupuesto permanece como histórico; no se “desaprueba” automáticamente ([BR-PROJ-004]).
- Obra cancelada con gastos reales: movimientos permanecen en AP/tesorería y reportes históricos ([BR-PROJ-004]).

## 14. Reportes relacionados
- Rentabilidad por proyecto, presupuesto vs real, avance vs costo, materiales por proyecto ([`../06-reports/OPERATIONAL_REPORTS.md`](../06-reports/OPERATIONAL_REPORTS.md)).
- **Avances del proyecto** (R-002 / D-120), `/proyectos/[id]/reportes/avances`: lectura ejecutiva de físico por libro con cobertura, plan comparable, certificado, consumo de presupuesto y cobranza; pendientes y exportaciones. Acceso **Reporte de avances** desde Resumen y Cronograma.

## 15. Relación con otros módulos
- **Presupuestos**, **Cronograma**, **Contratos**, **Certificaciones**, **Compras**, **Inventario**, **Tesorería** (imputación).

## 16. Permisos
Ver [`PERMISSIONS_MATRIX.md`](../00-product/PERMISSIONS_MATRIX.md). Editar equipo de obra: `EDIT PROJECTS`, módulo habilitado y acceso a la obra. D-111 combina roles, empresa y modo `TENANT_WIDE` / `MEMBERSHIP_SCOPED`; en modo por asignación, los usuarios sin acceso global necesitan `ProjectMembership`. `ProjectTeamMember` conserva exclusivamente el roster D-091.

## Hallazgo — Reconciliación del acceso vigente (AG-03, 03/11/2026)

Las referencias anteriores a R-USR-007 sin enforcement eran anteriores a D-111 y contradecían los guards actuales, revalidados en AG-01. Se corrige esa descripción. El acceso del creador se incorpora por la aprobación explícita de [Q-067](../00-product/OPEN_QUESTIONS.md#q-067--acceso-del-creador-a-una-obra-nueva-en-modo-por-asignación), sin cambiar el techo de roles. La eventual simplificación general de roles sigue como propuesta separada.

## 17. Eventos disparados / consumidos
- `project.*` ([`EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)).

## 18. Fase de implementación
**Fase 1**.

## 19. Preguntas abiertas
- Multi-proyecto bajo mismo contrato marco ([`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md)).
