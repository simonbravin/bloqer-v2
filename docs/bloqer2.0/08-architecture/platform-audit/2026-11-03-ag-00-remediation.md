# AG-00 — Correcciones y verificación de cierre

> **Fecha: 03/11/2026. Estado: seis hallazgos resueltos en su alcance y verificados localmente.**
> Se conserva el [diagnóstico inicial](./2026-11-03-ag-00-baseline.md) como historial. Esta corrida aplica las correcciones solicitadas antes de avanzar a AG-01.
> Evidencia estructurada: [remediación JSON](./2026-11-03-ag-00-remediation.json). Programa: [plan](../PLATFORM_AUDIT_PLAN.md) y [registro](./README.md).

## 1. Alcance, autorización y base

- HEAD: `3b5ae7a038465ad6b3d60cde19c278a31019e165`, rama `codex/pruebas`, con cambios locales de esta campaña. No hay commit ni publicación nuevos.
- El usuario confirmó corregir y verificar los hallazgos de cada fase antes de continuar. El criterio quedó registrado en plan, procedimiento y skill; se espera su indicación para iniciar la etapa siguiente.
- El usuario aprobó expresamente la [propuesta de aislamiento](./2026-11-03-ag-00-isolation-proposal.md). Se formalizó en **ADR-018**, sin introducir schema, migraciones, middleware ni dependencias npm.
- Se preservaron el plan INDARI y los archivos AP sin seguimiento que ya existían. La evidencia corresponde al árbol local completo, no a un checkout limpio ni a la versión del portal.
- Las verificaciones usaron procesos sin URLs DB, credenciales externas, flags live ni carga de `.env`. Se mantuvieron los proveedores fake, buffers y puntos de I/O sustituidos de las pruebas unitarias.

## 2. Resolución por hallazgo

### GA-AG-00-001 — Descubrimiento de pruebas: corregido

`pnpm test` ahora ejecuta todas las suites declaradas del workspace mediante `turbo test`. Se eliminaron los filtros raíz que dejaban PDF fuera; validators incorporó su suite usando el loader `tsx` ya disponible, igual que web. Domain, utils, email y PDF seleccionan por patrones; web incluye components, features, hooks y lib y mantiene la ejecución RSC separada con `react-server`.

La comparación entre archivos existentes y expansión efectiva de patrones confirma **226 de 226 archivos unitarios seleccionados**, **cero fuera de la selección** y **ocho suites de paquetes**. No se incluyen specs E2E en la suite unitaria. El loader compartido requiere la instalación completa del workspace usada por CI; no se cambió el lockfile ni se incorporó una dependencia.

Evidencia: [descubrimiento posterior](../../../../output/platform-audit/ag-00-remediation-2026-11-03/test-discovery-after.json), [plan de tareas](../../../../output/platform-audit/ag-00-remediation-2026-11-03/test-task-plan.json) y ejecución conjunta final.

### GA-AG-00-002 — Aprobación sin aserción: corregida

El resolver de contexto AI tiene ahora pruebas unitarias deterministas para proyecto inexistente y proyecto de otro tenant: verifican `NOT_FOUND` / `FORBIDDEN` y que el lookup se haya realizado. Se sustituye y restaura únicamente la lectura de proyecto, con ejecución secuencial y limpieza después de cada caso.

Desaparecen tanto el retorno silencioso sin aserción como la consulta DB implícita condicionada por `DATABASE_URL`. Estas pruebas comprueban la política sobre datos controlados; no se presentan como comprobación SQL. Las suites live conservan su activación explícita y sus límites.

Fuente: [context-isolation.test.ts](../../../../packages/services/src/ai/context-isolation.test.ts). Verificación dirigida y suite de services final aprobadas.

### GA-AG-00-003 — Lint incompleto e incidencias: corregido

El comando raíz ejecuta ESLint sobre packages antes de web. Se corrigieron las **48 incidencias originales de packages**, conservando llamadas con efectos, exports públicos, exclusión de metadatos en payloads y reglas financieras. El registro heterogéneo de herramientas AI conserva validación de argumentos antes de ejecutar y reemplaza su `any` explícito por una firma tipada.

La comprobación del alcance web confirmó que el comando anterior también dejaba features/hooks fuera y que los logs iniciales contenían 17 avisos que no impedían aprobar. Se amplió web a **ESLint CLI sobre todo su código**, con exclusión de artefactos generados y `--max-warnings 0`.

Se corrigieron los avisos de app/components/lib y los errores/avisos expuestos en features/hooks. Entre ellos:

- Hook condicional de Nueva Transacción: cálculo puro equivalente, sin hook después de un retorno temprano.
- Gantt: identidad memoizada del throttle, listener y cancelación conservados; dependencia directa para «Ir a hoy».
- Limpieza de breadcrumbs y temporizadores de stock: mismo propietario/objeto que registró el efecto.
- Diálogo de cronograma: dependencias escalares para no reiniciar ediciones por cambios de identidad del objeto.
- Estado ARIA de sugerencias y eliminación de imports/bindings sin uso, preservando contratos y campos excluidos.

Un identificador `module` introducido en la reescritura de una prueba fue detectado por el nuevo alcance y corregido. No se desactivaron reglas para silenciar incidencias.

**Resultado final:** lint raíz aprobado, incluyendo packages y web completo; web exige cero warnings. Los resultados dirigidos de packages y features/hooks también registran cero errores y warnings. No cambian rutas, etiquetas, pasos operativos ni reglas financieras.

### GA-AG-00-004 — Límites arbitrarios de ayuda: corregidos

Se reemplazaron los límites de 90 artículos, 28 chips y la banda adicional de 8–30 chips por propiedades de contenido y comportamiento: fichas alcanzables, filtros AND por módulo/objetivo, chips únicos con etiqueta curada y resultados pertinentes, y objetivos de nicho que siguen siendo filtrables sin convertirse en chips no curados.

Se conservaron las comprobaciones existentes de ranking, consultas y topes de resultados. No se redujo el catálogo ni se aumentaron cantidades para obtener una suite verde. Las pruebas completas de ayuda pasan y el catálogo/índice AI conservan su contenido.

Fuentes: `search-probe.test.ts`, `search-safety.test.ts` y `catalog-integrity.test.ts` en [help/lib](../../../../apps/web/features/help/lib/).

### GA-AG-00-005 — Garantía automática inexistente: contrato reconciliado

**ADR-018 aceptado por el usuario** documenta el mecanismo vigente: contexto autenticado, filtros y guards explícitos en servicios/repositorios. Las lecturas masivas se acotan en consulta; las cargas por ID comprueban pertenencia antes de usar o devolver datos. El cliente Prisma simple no se describe como si inyectara filtros o rechazara consultas automáticamente.

Se alinearon AGENTS, arquitectura multitenant, modelo de aislamiento y convenciones. **P-AG00-01 queda resuelto en alcance documental/arquitectónico.** No se lo cierra afirmando que se implementó una defensa global ni que se probaron todas las consultas SQL.

### GA-AG-00-006 — Columna tenant de hijos: contrato físico formalizado

ADR-018 y el [modelo de aislamiento](../TENANT_ISOLATION_MODEL.md) fijan un catálogo cerrado de **22 hijos/configuraciones existentes** con padre dueño obligatorio y tenant del padre obligatorio. Las referencias adicionales deben ser coherentes con ese dueño y tenant; un ID existente o una FK simple no bastan como autorización.

La comprobación estática cotejó los 22 hijos y sus 14 modelos padre con el schema actual. Los siete casos de identidad/raíz/plataforma se describen por separado. Las raíces operativas conservan tenant propio y obligatorio. No se permiten excepciones futuras por analogía.

Se reconciliaron las fuentes y se preservó el hallazgo histórico con su resolución. **P-AG00-02 queda resuelto en alcance documental/arquitectónico**, sin columnas, backfill ni migraciones nuevas.

## 3. Verificación final conjunta

Se ejecutaron los comandos mantenidos, usando pnpm local ya instalado. En tests y tipos se forzó ejecución, con cero tareas recuperadas de caché:

- **`pnpm lint`: aprobado.** Incluye packages y web completo. Se mantienen las reglas y el requisito web de cero warnings.
- **`pnpm typecheck --force --concurrency=2`: 13 tareas aprobadas.**
- **`pnpm run test --force --concurrency=2`: ocho tareas aprobadas; 1.579 casos reportados aprobados, cero fallos.**
- **Índice de conocimiento AI: vigente, 505 chunks.** No se regeneró ni cambió su contenido.

El total aumenta en un caso respecto del diagnóstico: el antiguo caso de aislamiento sin aserción fue sustituido por dos casos negativos explícitos. Los archivos unitarios siguen siendo 226.

**Siete suites de integración continúan omitidas**, visibles mediante `# SKIP`; el contador agregado de casos indica `skipped 0` porque sus casos internos no se enumeraron. Es una condición declarada del entorno unitario, no un fallo oculto ni evidencia de aislamiento SQL.

Artefactos:

- [Comandos y resultados finales](../../../../output/platform-audit/ag-00-remediation-2026-11-03/verified-checks.json).
- [Resumen de pruebas](../../../../output/platform-audit/ag-00-remediation-2026-11-03/test-summary.json) y [log completo](../../../../output/platform-audit/ag-00-remediation-2026-11-03/verified-test.log).
- [Lint final](../../../../output/platform-audit/ag-00-remediation-2026-11-03/verified-lint.log) y [tipos finales](../../../../output/platform-audit/ag-00-remediation-2026-11-03/verified-typecheck.log).
- [Lint packages posterior](../../../../output/platform-audit/ag-00-remediation-2026-11-03/lint-packages-after.json), [alcance web ampliado previo](../../../../output/platform-audit/ag-00-remediation-2026-11-03/lint-web-full-before-summary.json) y [features/hooks posteriores](../../../../output/platform-audit/ag-00-remediation-2026-11-03/lint-features-hooks-after.json).
- [Evidencia estructurada de cierre](./2026-11-03-ag-00-remediation.json): estado de los seis hallazgos, aprobación, comandos, descubrimiento y hashes de fuentes.

Los intentos de preparación se conservan separados: una invocación inicial del atajo `pnpm test` recibió opciones de Turbo que pnpm interpretó como propias; la ejecución explícita `pnpm run test` pasó. Los errores intermedios de tipos durante ediciones concurrentes se corrigieron antes de la comprobación conjunta final. Ninguno se presenta como fallo residual ni se usa como evidencia de aprobación.

## 4. Revisión independiente

Los agentes revisaron de forma cruzada cambios escritos por otro responsable: limpieza de packages y contratos públicos, pruebas de aislamiento/ayuda, hooks de features y Gantt/breadcrumbs. No encontraron regresiones bloqueantes en el delta final.

Otra pasada comprobó la propuesta aprobada contra ADR-018 y las fuentes reconciliadas, incluidos catálogo, relaciones obligatorias, validación de vínculos adicionales y límites de la garantía. El coordinador ejecutó las verificaciones conjuntas y contrastó el descubrimiento de archivos con sus patrones.

## 5. Límites y siguiente etapa

No se ejecutaron DB live, SQL efectivo, E2E, navegador/validación visual, proveedores externos, build, migraciones ni publicación. No se certifica el funcionamiento completo de todos los módulos ni se atribuye al portal el estado del árbol local.

**Impacto:** `sin impacto documental/AI`. Las correcciones mantienen los procedimientos y significados de la UI existentes; cambian verificación, código interno y la documentación técnica aprobada. No agregan rutas, etiquetas, permisos, estados ni reglas financieras. La guía y el catálogo siguen describiendo los mismos pasos; el índice AI fue comprobado vigente.

**AG-00 queda corregida y verificada localmente en los seis hallazgos registrados.** AG-01 queda pendiente de indicación del usuario. Su primer recorrido será sesión → contexto tenant/empresa → acceso a proyecto → gate → entrada directa/lectura, con la integración aislada que corresponda. Eso amplía la auditoría del producto; no reabre por sí solo las contradicciones documentales ya resueltas.
