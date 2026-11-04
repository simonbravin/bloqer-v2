# Procedimiento reutilizable de auditoría de plataforma

> Procedimiento técnico de auditoría y corrección. No modifica reglas del producto ni reemplaza el roadmap de implementación. Alcance y orden de los lotes: [plan global](./PLATFORM_AUDIT_PLAN.md).

## 1. Elegir el modo y el resultado esperado

- **Global:** recorrer los lotes del plan, con inventario y registro de cobertura acumulados. Una revisión parcial no permite declarar auditada toda la plataforma.
- **Módulo:** revisar el área o subrecorrido solicitado, sus entradas, salidas y dependencias inmediatas. Si el usuario acota OC→recepción→factura, respetar ese límite: no extenderlo por defecto a todas las solicitudes, cotizaciones o pagos. Incluir el efecto de esa recepción sobre inventario y de la factura sobre AP, aunque esas áreas tengan lotes propios.
- **Cambio:** partir de una revisión base y un diff identificados; determinar consumidores afectados y revisar el cambio más sus dependencias. Incluir cambios locales y archivos sin seguimiento si forman parte del alcance acordado.
- **Revalidación:** reproducir hallazgos ya registrados y verificar sus correcciones en la revisión y el entorno actuales. Conservar los identificadores originales y la evidencia histórica.

Consultar primero la modalidad autorizada del [plan de campaña](./PLATFORM_AUDIT_PLAN.md). **En esta campaña el usuario confirmó el 03/11/2026 diagnóstico + corrección + verificación en cada fase**, con aviso al terminar y sin avanzar a la siguiente hasta su indicación. No volver a pedir autorización para los arreglos ya incluidos. Para un encargo aislado sin autorización de corregir, el resultado predeterminado sigue siendo diagnóstico con evidencia.

La autorización para corregir bugs no resuelve por sí sola una definición funcional ambigua, una dependencia nueva o una decisión arquitectónica pendiente: aplicar los límites de [AGENTS raíz](../../../AGENTS.md) y [guardrails](./AGENT_GUARDRAILS.md). Preparar una propuesta concreta para confirmar la decisión requerida y continuar las partes independientes autorizadas. No marcar la etapa corregida si conserva hallazgos confirmados sin resolver.

El pedido debe poder expresarse con modo, área o revisión base, dimensiones prioritarias, entorno y resultado esperado. Si falta un dato opcional, inferirlo de la tarea y dejar el supuesto registrado; si cambia el resultado de una decisión de producto, registrar la duda y consultar.

## 2. Leer las fuentes antes de decidir

Leer [AGENTS raíz](../../../AGENTS.md) y luego, en este orden:

1. [README funcional](../README.md).
2. [AGENTS funcional](../AGENTS.md).
3. [README de arquitectura](./README.md).
4. [Roadmap de implementación](./IMPLEMENTATION_ROADMAP.md).
5. Los módulos pertinentes de [02-modules](../02-modules/).

Para el alcance elegido, consultar decisiones y reglas aplicables, no solamente el resumen de una auditoría anterior:

- [Decisiones](../00-product/DECISION_LOG.md), [reglas](../01-domain/BUSINESS_RULES.md), [estados](../01-domain/STATE_MACHINES.md), [permisos](../00-product/PERMISSIONS_MATRIX.md) y workflows en [05-workflows](../05-workflows/).
- [ERD funcional](../01-domain/ENTITY_RELATIONSHIPS.md), [ERD técnico](./TECHNICAL_ERD.md), [capas](./BACKEND_LAYERING.md), [services](./SERVICE_LAYER.md), [frontend](./FRONTEND_ARCHITECTURE.md) y [alcance tenant/empresa](./TENANT_COMPANY_SCOPING.md).
- [Dinero](../03-finance/MONEY_MODEL.md), fórmulas de [04-formulas](../04-formulas/), [testing](./TESTING_STRATEGY.md) y [política de impacto](../CHANGE_IMPACT_POLICY.md) cuando corresponda.

Usar auditorías anteriores como antecedentes que hay que revalidar. Un documento puede conservar diagnóstico inicial y correcciones posteriores en secciones distintas; una fecha o un título que diga «final» no demuestra vigencia.

## 3. Fijar una base verificable

Registrar fecha, rama, SHA de HEAD y revisión base del modo cambio. Inspeccionar estado del árbol y diff; separar trabajo previo, cambios de esta ejecución y archivos sin seguimiento. No descartar ni incorporar cambios ajenos para conseguir una base limpia.

Identificar entorno, versión desplegada si se conoce, tipo de acceso y requisitos disponibles. No copiar secretos, cookies, contraseñas, cadenas de conexión ni datos personales al reporte. Si solo se conoce el código local, no afirmar que coincide con el portal.

Antes de ejecutar un comando, leer el script real del paquete, imports relevantes, flags de integración y efectos externos. Registrar limitaciones iniciales: DB aislada ausente, credenciales de prueba faltantes, módulos deshabilitados, servicios externos sin configuración o validación visual pendiente.

El [reporte por ejecución](./platform-audit/REPORT_TEMPLATE.md) conserva esta base. Guardar los reportes junto al template con un nombre de fecha y alcance; cada uno debe enlazar al anterior cuando sea una continuación o revalidación.

## 4. Delimitar el alcance con cuatro inventarios

Mantener separadas estas dimensiones para cada caso de uso:

- **Documentado:** módulo, workflow, entidades, regla o decisión que define el comportamiento.
- **Implementado:** componentes, handlers, validators, services, persistencia y efectos que realmente existen.
- **Expuesto:** rutas, navegación, formularios, endpoints, jobs o herramientas AI que permiten usarlo; identificar roles y module gates.
- **Probado:** pruebas y evidencia que verifican ese comportamiento en una revisión y entorno concretos.

Encontrar un archivo no demuestra que sea accesible; encontrar un botón no demuestra que su mutación funcione; una suite verde no demuestra que cubra ese recorrido. Las diferencias entre dimensiones son trabajo a clasificar, no bugs confirmados por definición.

Para modo cambio, seguir imports y llamadas, DTOs, exports, permisos, relaciones y consumidores compartidos. Incluir lecturas posteriores, reportes, exportaciones, jobs, ayuda y herramientas AI cuando consuman el contrato modificado. Documentar por qué cada consumidor entra o queda fuera.

Ampliaciones por impacto:

- **Dinero o fórmulas compartidas:** consumidores de cálculo, serialización, captura, saldo, ledger, reportes y exportaciones afectados.
- **Auth, permisos o contexto:** rutas directas, acciones, APIs, jobs y herramientas AI que usen esa política; casos positivos y negativos.
- **Schema o relaciones:** escrituras, lecturas, integridad, migraciones, tipos generados y compatibilidad entre revisiones, sin aplicar migraciones como parte de un diagnóstico.
- **Tokens, shell o controles comunes:** pantallas representativas de empresa, proyecto y plataforma; listados, detalles y formularios; temas y tamaños de viewport afectados.
- **Cambio local:** módulo y consumidores demostrados. No expandir toda revisión local a una auditoría global sin una dependencia concreta.

## 5. Repartir trabajo sin perder control

El coordinador fija base, alcance, responsables, archivos y entregables; consolida duplicados y decide qué evidencia satisface el cierre. En esta sesión se dispone de **un coordinador y hasta tres agentes activos adicionales**. Los perfiles son responsabilidades reutilizables, no una obligación de ejecutar cuatro especialistas a la vez:

- [Contratos y recorridos](../../../.codex/agents/bloqer-audit-contracts.toml): trazabilidad funcional front/back y efectos entre módulos.
- [Datos y seguridad](../../../.codex/agents/bloqer-audit-data-security.toml): persistencia real, ERD, aislamiento, autorización e invariantes.
- [Experiencia y visuales](../../../.codex/agents/bloqer-audit-ux.toml): coherencia visual, accesibilidad y uso mobile/desktop.
- [Verificación independiente](../../../.codex/agents/bloqer-audit-verification.toml): reproducción, regresión, alcance probado y límites del cierre.

Paralelizar lecturas independientes. Para correcciones, asignar **un escritor por archivo** y secuenciar cambios de contratos o componentes compartidos antes de adaptar consumidores. Cada agente devuelve fuentes, ubicaciones, evidencia y límites; el coordinador verifica lo necesario y no considera la conclusión de un agente como prueba suficiente.

Si el cliente no carga los perfiles, leer el campo de instrucciones del archivo correspondiente y usarlo como prompt de una delegación manual con alcance y entregable explícitos. Si no hay delegación disponible, ejecutar las responsabilidades en secuencia y dejar constancia de que no hubo revisión independiente.

## 6. Seguir cada recorrido hasta la persistencia y de vuelta

Para cada acción relevante, reconstruir la cadena real:

1. Ruta, pantalla, formulario, parámetro de URL o punto de entrada no visual.
2. Action/API, sesión y contexto autorizado en servidor.
3. Validación de entrada, normalización y contrato de errores.
4. Service, política, transición, transacción y dominio involucrados.
5. Repositorio o acceso a persistencia que **efectivamente** se utiliza, modelos y relaciones de schema/migraciones.
6. Efectos: ledger, stock, AR/AP, auditoría, notificaciones, GL, archivos o tareas, según la documentación del flujo.
7. Lectura posterior y DTO; invalidación/refresh; renderizado, navegación y consumidores derivados.

Registrar ruta y función reales en cada salto; no dibujar un repositorio inexistente para acomodar el código a la arquitectura deseada. Si la persistencia se usa desde una capa que contradice las reglas, documentar la desviación y sus efectos antes de proponer la corrección.

Verificar, según corresponda:

- Éxito, error de validación, entidad ausente, permiso denegado, módulo deshabilitado y URL directa.
- Reintento, doble envío, concurrencia, rollback y ausencia de efectos duplicados.
- Estados y transiciones documentados; igualdad entre lo que ofrece la UI y lo que permite el servidor.
- Precisión y serialización según D-053; moneda/FX, cierre de período, saldos parciales y anti doble conteo según sus fuentes, sin introducir fórmulas propias.
- Datos vacíos, volumen y paginación, filtros, orden, fechas/zona horaria y estados derivados.
- Fronteras RSC/cliente, DTOs serializables y ausencia de dependencias de servidor arrastradas al navegador.

### Contexto y autorización

Separar tenant, empresa y proyecto. Derivar identidad/contexto de la sesión y guards existentes; no confiar en IDs enviados por el cliente. Comprobar acceso a los objetos relacionados y no solamente a la entidad principal.

Aplicar [TENANT_COMPANY_SCOPING](./TENANT_COMPANY_SCOPING.md) según nullabilidad y clasificación reales: `companyId = null` compartido, entidades con empresa obligatoria y tesorería tenant-wide tienen tratamientos distintos. No uniformar filtros por intuición. Verificar memberships, alcance de proyecto, RBAC y module gates vigentes; no inventar roles o permisos.

Incluir enlaces de descarga, adjuntos, exportaciones y herramientas AI en los casos negativos. Probar con más de un tenant/contexto cuando exista fixture apropiada; si solo se inspeccionó código, informarlo así.

### Efectos entre módulos

Elegir los workflows documentados que cruza el lote, por ejemplo compra→recepción→stock→factura→AP→pago→tesorería/GL, o presupuesto→certificación→factura→AR→cobranza. Contrastar documento origen, derivados, reportes y reversión/anulación cuando corresponda. No asumir que cada flujo siempre tiene todos esos pasos: verificar el workflow y las alternativas aplicables.

## 7. Revisar experiencia y homogeneidad visual

El sistema visual implementado vive principalmente en [components/ui](../../../apps/web/components/ui/), [components/layout](../../../apps/web/components/layout/), [globals.css](../../../apps/web/app/globals.css) y [tailwind.config.ts](../../../apps/web/tailwind.config.ts). Comprobar también [packages/ui](../../../packages/ui/src/index.ts): no asumir que contiene composiciones que hoy están en web.

Usar componentes y tokens existentes como referencia: encabezados, anchos de página, KPI, formularios, tablas, badges, vacíos, confirmaciones, dialog/sheet, foco, botones y controles decimales. No introducir un rediseño, nueva biblioteca o nueva semántica operativa para resolver una diferencia estética.

Revisar jerarquía, densidad, alineación, espaciado, tipografía, colores semánticos, contraste, acciones primarias/secundarias, legibilidad de importes y estados de carga/error/vacío. Revisar teclado, nombre accesible, labels y errores asociados, foco y su restauración, Escape, zoom y significado que no dependa solo del color. [Requisitos no funcionales](../07-non-functional/NON_FUNCTIONAL_REQUIREMENTS.md) fija WCAG AA como objetivo; una inspección parcial no certifica conformidad completa.

Reutilizar como puntos de comparación los tamaños históricos 390×844, 430×932, 768×1024 y 1440×1000; agregar bordes de breakpoint cuando el cambio lo requiera. Comprobar temas claro/oscuro si están afectados, navegación cliente/recarga, tabla/tarjetas, menú y preferencias persistidas. Evaluar el comportamiento mobile/desktop documentado; no convertir por iniciativa una herramienta compleja de escritorio en un nuevo flujo móvil.

Guardar capturas antes/después con ruta, revisión desplegada, rol, viewport, tema y estado de datos. Ocultar información sensible. Sin ejecución visual, marcar «inspección estática» y conservar la validación visual pendiente.

Respetar [no-localhost-browser](../../../.cursor/rules/no-localhost-browser.mdc): no navegar localhost salvo pedido explícito, no reiniciar servidores para una comprobación improvisada y no abrir browser sin smoke solicitado. Cuando corresponda, verificar el portal tras publicación o pedir revisión al usuario. Una captura del portal no verifica código local todavía no desplegado.

## 8. Elegir verificaciones por riesgo y por efectos

Los paquetes usan principalmente **`node:test` con `tsx`**, no asumir Vitest. Leer [scripts raíz](../../../package.json) y los scripts del paquete antes de escoger comandos. Tras la remediación AG-00, `pnpm test` ejecuta las suites declaradas del workspace y estas usan patrones de archivos; verificar su selección efectiva si se agregan carpetas o extensiones. Web conserva una ejecución RSC separada. El lint web incluye features/hooks y exige cero warnings. Detalle vigente: [TESTING_STRATEGY](./TESTING_STRATEGY.md).

Ejemplos existentes para una selección acotada, después de leer las pruebas e imports:

```text
pnpm --filter @bloqer/services exec node --import tsx --test src/idempotency/idempotency.test.ts
pnpm --filter @bloqer/services exec node --import tsx --test src/finance/finance-access.d056.test.ts
pnpm --filter @bloqer/utils exec node --import tsx --test src/money.test.ts src/line-amounts.test.ts
pnpm --filter @bloqer/domain typecheck
pnpm --filter @bloqer/services typecheck
pnpm --filter @bloqer/web typecheck
```

Son ejemplos de selección, **no resultados de esta preparación**. Ajustar a archivos e invariantes afectados. Ejecutar lint y tests pertinentes según scripts actuales; ampliar después de un fallo, un cambio nuevo o una dependencia que lo justifique. Para bugs financieros, permisos, aislamiento, transacciones o contratos rotos, agregar o actualizar una regresión que observe el resultado. No agregar tests que repliquen el código para un cambio cosmético reversible.

### Distinguir operaciones antes de ejecutarlas

- **Estáticas o sin integración:** lectura de código, diff, tipos, lint y pruebas puras tras revisar sus imports. Pueden escribir cachés o artefactos locales sin ser pruebas de DB.
- **DB de solo lectura:** inspección autorizada de schema, constraints o datos mínimos; identificar destino real sin revelar credenciales y evitar exportar información sensible. No confundir «solo lectura» con permiso para consultar cualquier tenant.
- **Integración con escritura:** fixtures, tests live, seeds y pruebas de flujo pueden crear, editar o eliminar datos. Requieren entorno aislado y autorización suficiente; leer guards y teardown. Un rollback no convierte la prueba en solo lectura.
- **Servicios externos:** email, storage, AI live y jobs pueden enviar, cargar, facturar o disparar trabajo real. Usar adaptadores de prueba existentes o autorización explícita del flujo externo necesario.

Hay suites opt-in con `BLOQER_PROCUREMENT_LIVE_DB`, `BLOQER_CERTIFICATION_LIVE_DB`, `BLOQER_AI_LIVE_DB` o `BLOQER_D111_LIVE`; algunas cargan `.env` o usan `DATABASE_URL`. Comprobar flags heredados, guards y fixtures antes de ejecutar el glob de services. No activar esos flags por defecto ni inferir que una DB llamada `dev` es un entorno aislado apropiado.

El E2E mínimo de [web/e2e](../../../apps/web/e2e/README.md) depende de `E2E_BASE_URL` y credenciales, y puede omitir casos. Las [pruebas mobile](../mobile-audit/playwright.config.ts) tienen configuración y restricciones propias: leer cada spec y su destino antes de reutilizarlo. Omitido no equivale a aprobado.

**No usar un build como simple chequeo inocuo:** los scripts raíz y de database pueden ejecutar migraciones. `db:migrate`, `db:migrate:deploy`, `db:push`, seeds y herramientas de reparación no forman parte del diagnóstico predeterminado. Si la tarea pide migración del portal, aplicar la [regla de producción](../../../.cursor/rules/neon-production-migrations.mdc) y el workflow de migración pertinente; no declarar resuelto el portal por migrar solo local. No crear scripts one-off para suplir cobertura, corregir datos o simular el flujo real.

## 9. Consolidar hallazgos y corregir con trazabilidad

Usar IDs estables del registro de auditoría. Si se revalida un `BUG-*` previo, conservar su ID o enlazarlo expresamente; no generar duplicados para la misma causa. Separar:

- **Observación pendiente de confirmar:** falta reproducción o evidencia suficiente.
- **Bug/desviación confirmada:** evidencia verificable y fuente normativa cuando aplique.
- **Mejora propuesta:** comportamiento posible que requiere una decisión o cuyo beneficio no implica un bug.

Prioridad del proceso, independiente de los estados del producto:

- **P0:** exposición de datos o corrupción/pérdida financiera de impacto crítico demostrable.
- **P1:** flujo central bloqueado, autorización incorrecta u otro defecto de impacto alto demostrado.
- **P2:** comportamiento incorrecto o inconsistencia funcional de alcance acotado, con alternativa operativa.
- **P3:** claridad o homogeneidad cosmética sin pérdida del comportamiento operativo.

Justificar impacto y condiciones reales; no asignar severidad por una palabra en el código. Indicar si el defecto era previo a la base, fue introducido por el diff o no se pudo determinar. Un test fallido por configuración no prueba por sí solo un bug de producto.

Al corregir: solucionar la causa en su capa, mantener el lote revisable, incluir consumidores afectados y prueba pertinente, y volver a ejecutar los checks invalidados por el cambio. Verificar que el resultado satisface el contrato documentado, no solamente que compila.

Registrar preguntas de producto en [OPEN_QUESTIONS](../00-product/OPEN_QUESTIONS.md), técnicas en [PENDING_ARCHITECTURE_ITEMS](./PENDING_ARCHITECTURE_ITEMS.md) y contradicciones mediante `## Hallazgo` en los documentos afectados según AGENTS. No convertir una hipótesis del auditor en regla o migración.

## 10. Mantener ayuda y AI alineados

Aplicar [CHANGE_IMPACT_POLICY](../CHANGE_IMPACT_POLICY.md) y la [skill operativa](../../../.cursor/skills/operational-help-docs/SKILL.md). Un cambio de rutas, menús, etiquetas, significado, permisos, gates o procedimiento visible debe mantener Guía Operativa, ayuda in-app y capas de Bloqer AI pertinentes en el mismo PR.

Revisar knowledge, descripciones/schemas de tools, implementación, policy y evals; actualizar solo lo afectado. Regenerar/verificar el índice cuando cambien fuentes indexadas. Un ajuste exclusivamente cosmético o una documentación técnica sin efecto funcional puede declarar `sin impacto documental/AI`, con justificación. La auditoría no autoriza inventar pasos de ayuda que el producto no implementa.

## 11. Revisión independiente y cierre del lote

El revisor recibe el alcance, fuentes, diff final, criterios de aceptación y evidencia; reproduce lo necesario y busca regresiones sin editar simultáneamente los mismos archivos. Separar sus comprobaciones de las del implementador y dejar registradas discrepancias resueltas o pendientes.

Para cerrar, el reporte debe identificar:

- Recorridos, roles, contextos, estados y dimensiones realmente revisados, más exclusiones y motivo.
- Hallazgos confirmados, correcciones realizadas, propuestas y preguntas abiertas.
- Pruebas **aprobadas**, **fallidas**, **omitidas** y **no ejecutadas**, con comando, revisión, entorno y resultado pertinente.
- Evidencia estática, de integración, visual y operativa diferenciada; limitaciones que siguen vigentes.
- Qué está corregido localmente, integrado, publicado y comprobado en el destino. No inferir esas etapas entre sí.
- Alcance de regresión necesario al retomar y siguiente lote recomendado.

No afirmar «sin bugs», «plataforma perfecta», «seguridad certificada» o «auditado completo» por ausencia de hallazgos en una muestra. Un lote puede quedar con correcciones de código terminadas y validación de despliegue pendiente. Una revalidación futura toma el reporte, conserva IDs y repite únicamente las comprobaciones afectadas o cuya evidencia haya perdido vigencia.

Para cambios de identidad/contexto, reutilizar la [selección AG-01 de regresiones](./TESTING_STRATEGY.md#regresión-reutilizable-de-identidad-y-acceso--ag-01). Elegir las suites afectadas y sus consumidores según el diff; la suite global no necesita repetirse para un cambio local sin dependencia compartida. Los flags live requieren nombre aislado, ambas URLs explícitas y verificación de la base efectiva; un fallo de conexión no autoriza usar `neondb` ni producción como alternativa.
