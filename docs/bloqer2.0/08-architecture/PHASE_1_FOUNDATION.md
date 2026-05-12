# Phase 1 — Foundation

## Objetivos

- **Autenticación** (Auth.js primera opción, [`AUTH_ARCHITECTURE.md`](./AUTH_ARCHITECTURE.md)).  
- **Multitenancy**: `tenant`, usuarios, membresías, roles según [`PERMISSIONS_MATRIX`](../00-product/PERMISSIONS_MATRIX.md).  
- **Auditoría** mínima (`audit_log` + campos en filas, [`AUDIT_FIELDS_STRATEGY.md`](./AUDIT_FIELDS_STRATEGY.md)).  
- **Base de datos** Neon + Prisma: migraciones iniciales para identidad/tenancy ([`TECHNICAL_ERD.md`](./TECHNICAL_ERD.md), Bloque A).  
- **Layout**, navegación shell, design system aplicado (shadcn).  
- **Seed mínimo**: un tenant, un admin, un rol.

## Módulos incluidos

`identity`, `tenancy`, `audit`, shell de `notifications` (opcional stub), sin módulos operativos completos.

## Dependencias

- **Phase 0** completada.  
- Resolver o diferir: modelo **company** 1:N ([`DATA_MODEL_OVERVIEW.md`](./DATA_MODEL_OVERVIEW.md), Q-001).

## Entregables

- Login / logout / recuperación básica según proveedor elegido.  
- Selector de tenant (si aplica multi-membership).  
- Middleware o equivalente: contexto `tenant_id` en servidor.  
- Tablas: `user`, `tenant`, `company` (si se adopta), `user_membership`, mapeo roles.  
- `audit_log` escribiendo en operaciones de seguridad (login fallido opcional, cambios de membresía sí).  
- Navegación lateral por módulos (placeholders).

## Criterios de aceptación

- [ ] Imposible ejecutar query de negocio sin `tenant_id` en contexto en rutas protegidas.  
- [ ] Usuario sin membresía en tenant → 403 coherente.  
- [ ] Migraciones reproducibles en DB limpia + seed documentado.  
- [ ] Documentación: README actualizado (“cómo crear primer tenant”).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Sesión edge vs Node | Seguir guía Auth.js para App Router; tests E2E mínimos en Phase 5 |
| Roles mal mapeados | Tabla de equivalencia rol producto ↔ rol técnico en código comentado + doc |

## Qué NO hacer todavía

- No implementar **todos** los módulos operativos.  
- No exponer **API pública** sin autenticación.  
- No cargar reglas financieras en middleware.

## Prompts sugeridos (IA)

```
Lee AUTH_ARCHITECTURE.md, MULTITENANCY_ARCHITECTURE.md, DATA_MODEL_OVERVIEW.md (sección tenant/company).
Implementá solo tablas y servicios de tenancy + user_membership + session.
Cada query debe filtrar tenant_id. Tests de aislamiento obligatorios.
```

```
Implementá audit_log append para create/update de user_membership y tenant settings.
Sin PII innecesaria en payload. Ver 02-modules/AUDIT_LOG.md.
```

## Referencias

- Anterior: [`PHASE_0_PROJECT_SETUP.md`](./PHASE_0_PROJECT_SETUP.md)  
- Siguiente: [`PHASE_2_CORE_OPERATIONS.md`](./PHASE_2_CORE_OPERATIONS.md)
