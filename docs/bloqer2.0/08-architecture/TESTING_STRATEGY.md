# Testing strategy — Bloqer 2.0

> Pirámide de tests cuando exista código. **No** configura runner aquí.

## Tipos de tests

| Tipo | Qué cubre |
|---|---|
| **Unit** | Funciones puras en `packages/domain`, helpers de redondeo, mapeos de estado. |
| **Integration** | Service + DB de test (Neon branch / docker Postgres) con transacción rollback por test. |
| **Service** | Caso de uso completo: mocks solo en integraciones externas (email, R2). |
| **Repository** | Queries críticas: filtros `tenant_id`, joins de reporte base. |
| **Permission** | Matriz mínima: rol X no puede mutar entidad Y. |
| **Tenant isolation** | Mismo test con dos `tenant_id`: no leakage. |
| **Formula** | Números de [`../04-formulas/`](../04-formulas/) vs implementación. |
| **Workflow** | Secuencia: OC → recepción → factura → payable (según doc). |
| **E2E mínimos** | Login + flujo feliz crítico (presupuesto aprobado, movimiento de caja) cuando Playwright exista. |

## Fixtures y seeds

- Fixtures **por tenant**; nunca datos globales sin `tenant_id`.  
- Seeds solo entornos no productivos.

## Base de datos de test

- Preferir **schema migrado** igual que prod; datos mínimos por suite.

## Comandos mantenidos de calidad — actualizado AG-00, 03/11/2026

- `pnpm lint`: analiza `packages` con la configuración raíz y web con su configuración propia. Web usa ESLint CLI sobre todo su código, incluidas features y hooks; se excluyen artefactos generados y se exige cero warnings.
- `pnpm typecheck`: ejecuta los scripts de tipos del workspace.
- `pnpm test`: ejecuta todas las suites `test` declaradas del workspace, incluidos validators y PDF. Los paquetes seleccionan sus archivos por patrones; web separa los tests TypeScript y el test RSC `.mjs`, que requiere `react-server`.
- Validators reutiliza el loader `tsx` ya instalado en services, como web. Estos comandos requieren la instalación completa del workspace usada por CI; no se agregó una dependencia ni un runner nuevo.
- CI utiliza Node 22. La inclusión de un archivo en una carpeta no acredita que su patrón lo descubra: al agregar tests o moverlos, comprobar selección efectiva y resultado, sin incorporar specs de navegador a la suite unitaria.

Las pruebas unitarias no deben depender de una conexión DB heredada para aparentar aprobar. Los escenarios puros sustituyen únicamente sus puntos de I/O y comprueban la política; las suites live mantienen su activación y entorno aislado explícitos. Reportar suites omitidas además del contador de casos del runner: `skipped: 0` puede coexistir con suites `# SKIP` sin casos enumerados.

Evidencia y límites de la remediación: [AG-00](./platform-audit/2026-11-03-ag-00-remediation.md). Un resultado unitario no demuestra aislamiento SQL ni aprobación del portal.

## Regresión reutilizable de identidad y acceso — AG-01

`pnpm test` incluye ahora las regresiones de `@bloqer/auth`. Services ejecuta tanto `src/**/*.test.ts` como `src/**/*.test.mts`; los archivos `.mts` de autenticación usan la condición Node `react-server` por el marcador `server-only`. Las suites live se omiten sin activación explícita y no leen `.env` como fallback para decidir dónde escribir.

Las suites de auditoría usan `BLOQER_AUDIT_LIVE=1`, `BLOQER_AUDIT_TEST_DATABASE` con prefijo `bloqer_audit_`, y **ambas** URLs explícitas hacia esa base aislada en el compute de desarrollo verificado. `testing/audit-fixture.ts` comprueba host exacto, nombre en ambas URLs y `current_database()` antes de cualquier escritura. Nunca usar `neondb`, producción o una conexión por defecto para estas fixtures. No cambiar `.env` para ejecutar la suite. Email y servicios externos deben estar deshabilitados; no se ejecutan seeds productivos.

Selecciones mantenidas, ejecutables desde `packages/services` con Node `--conditions=react-server --import tsx --test --test-concurrency=1`:

- `src/auth/credentials-auth.live.test.mts`: emisión/consumo/concurrencia/estado de cuenta.
- `src/user/user.service.live.test.ts`: perfil y propietario elegible.
- `src/onboarding/onboarding.audit.live.test.ts`: doble submit, nombres iguales, provisión desde plataforma y barreras de ingreso.
- `src/security/access.audit.live.test.ts`: tenant/empresa/ACL, rutas de datos, Field, avisos, asignaciones y gates.
- `src/tenant-settings/tenant-administration.live.test.ts`: equipo, invitaciones, plataforma y vencimientos.
- `src/tenant-settings/tenant-settings.audit.live.test.ts`: anclaje, campos borrados, notas parciales y rollback de auditoría.

Los escenarios anteriores D-111 (`ai/d111-scoped-live.test.ts` y `project/project-membership.phase-c.live.test.ts`) mantienen sus flags de activación, pero ahora requieren también ese destino aislado y su comprobación SQL efectiva. Tener `BLOQER_D111_LIVE=1` por sí solo no habilita escribir en la base de desarrollo normal. Evidencia y selección final: [AG-01](./platform-audit/2026-11-03-ag-01-identity-access.md). Los stubs unitarios verifican ramas y contratos; las pruebas de locks/rollback se complementan con la suite PostgreSQL.

## Qué testear **primero** (prioridad del prompt 3)

1. Fórmulas financieras y anti–doble conteo ([BR-COS-002](../01-domain/BUSINESS_RULES.md)).  
2. Ledger: `account_movement`, cobranzas/pagos parciales, **internal transfer** = par.  
3. Stock: movimientos confirmados, transfer par, reserva vs disponible.  
4. Certificaciones + AR (sin `INVOICED` en status; derivados).  
5. Presupuestos: `CLOSED`, `IN_REVIEW`, `RETURNED_FOR_CHANGES`.  
6. AR/AP + period close.  
7. Permisos + tenant isolation.  
8. Autorización de descarga de documento (metadata + tenant).

## Qué NO hacer

- Tests que mockean **toda** la DB y no prueban SQL.  
- E2E como única red de seguridad financiera.

## Referencias

- [`CODE_REVIEW_CHECKLIST.md`](./CODE_REVIEW_CHECKLIST.md)  
- [`LEDGER_TABLES_STRATEGY.md`](./LEDGER_TABLES_STRATEGY.md)
