# Reporte de auditoría — <fecha y alcance>

> Copiar esta plantilla al iniciar una ejecución; completar solo evidencia real y eliminar instrucciones sin uso. Referencias: [plan global](../PLATFORM_AUDIT_PLAN.md) y [procedimiento canónico](../PLATFORM_AUDIT_RUNBOOK.md). Este template no registra una auditoría ejecutada.

## 1. Encargo y base

- Fecha y responsable:
- Modo: global / módulo / cambio / revalidación.
- Resultado autorizado: diagnóstico / diagnóstico y corrección.
- Área, recorrido o lote del plan:
- Rama y SHA de HEAD:
- Revisión base y revisión final; cómo se obtuvo el diff:
- Árbol inicial: cambios previos, archivos sin seguimiento y trabajo ajeno relevante:
- Archivos atribuibles a esta ejecución:
- Entorno, versión desplegada conocida y tipo de acceso:
- Requisitos disponibles y limitaciones iniciales, sin secretos:
- Reportes anteriores y hallazgos revalidados:
- Agentes participantes, responsabilidad y archivos asignados:

## 2. Fuentes y alcance

Referenciar módulos, workflows, decisiones `D-*`, reglas `BR-*`, ERD funcional/técnico, fórmulas, estados y permisos aplicables. Enlazar archivo y sección; no copiar extensamente las fuentes.

### Inventario del alcance

Repetir por caso de uso:

- **Caso de uso / recorrido:**
- **Documentado:** fuente que define comportamiento y condiciones.
- **Implementado:** archivos/funciones reales y punto de persistencia.
- **Expuesto:** rutas, Actions/APIs, jobs/tools y navegación; roles y gates.
- **Probado previamente:** evidencia anterior con revisión y entorno; vigencia pendiente o revalidada.
- **Probado en esta ejecución:** pruebas y evidencia enlazadas.
- **Diferencias entre inventarios:** implementación no expuesta, contrato sin consumidor, prueba ausente u otra diferencia, sin declararla bug hasta confirmar.

### Dimensiones de cobertura

Para cada dimensión, indicar alcance concreto y evidencia, o «no revisada» / «no aplica» con motivo:

- Contrato front→Action/API→validator→service→persistencia→lectura/invalidation.
- Schema, migraciones e integridad de relaciones.
- Tenant/empresa/proyecto, auth, RBAC, memberships y module gates.
- Finanzas, precisión, moneda/FX, estados, transacciones y concurrencia.
- Efectos y consumidores entre módulos; reportes/exportaciones y jobs.
- UI/UX, estados de pantalla, accesibilidad, temas y responsive.
- Archivos, email, notificaciones y servicios externos.
- Ayuda, Guía Operativa y Bloqer AI.
- Rendimiento/observabilidad, únicamente con mediciones o inspección identificadas.

Listar recorridos, roles, contextos, estados y viewports cubiertos; indicar si se inspeccionó código, se ejecutó integración o se navegó la UI. Registrar exclusiones, motivo y condición para completarlas.

### Alcance de regresión

- Cambio disparador o revisión base:
- Dependencias y consumidores compartidos descubiertos:
- Razón para incluir/excluir cada área vecina:
- Evidencia histórica invalidada por el cambio:

## 3. Evidencia de recorridos

Repetir por recorrido revisado:

### <identificador de recorrido y nombre>

- Entrada, actor y precondiciones:
- Cadena real de archivos y funciones hasta persistencia:
- Lectura posterior, refresh/invalidation y consumidores:
- Casos positivos/negativos/reintento/concurrencia revisados:
- Resultado esperado y fuente:
- Resultado observado:
- Evidencia y límites:

No completar saltos con capas hipotéticas. Si el código omite una capa exigida, describirlo y vincular el hallazgo correspondiente.

## 4. Hallazgos

Repetir por hallazgo; conservar el ID si ya existía. Enlazar duplicados y registrar una sola causa con sus consumidores.

### <ID estable> — <título concreto>

- Tipo: observación pendiente de confirmar / bug o desviación confirmada / mejora propuesta.
- Prioridad P0/P1/P2/P3 y justificación de impacto:
- Origen respecto de la revisión base: previo / introducido / no determinado, con evidencia.
- Área, rutas, roles y contextos afectados:
- Fuente funcional/técnica y decisión/regla aplicable:
- Archivo y línea o función en la revisión inspeccionada:
- Precondiciones y reproducción, sin credenciales ni datos sensibles:
- Resultado esperado:
- Resultado observado y evidencia:
- Causa identificada o incertidumbre pendiente:
- Consumidores y efectos relacionados:
- Relación con IDs anteriores, duplicados o regresiones:
- Corrección propuesta y autorización/decisión necesaria, si aplica:
- Situación al cierre y próximo responsable/acción:

Una preferencia estética, búsqueda de texto o sospecha sin confirmación debe conservar esa calificación. No presentar una mejora de producto como bug.

## 5. Cambios aplicados

Separar lo corregido de lo recomendado. Si el encargo fue solo diagnóstico, indicar que no se aplicaron correcciones.

Repetir por corrección:

- ID del hallazgo:
- Causa corregida y comportamiento resultante:
- Archivos modificados y consumidores adaptados:
- Regresión cubierta y verificaciones invalidadas/repetidas:
- Impacto en Guía Operativa, ayuda y Bloqer AI; enlaces o justificación de `sin impacto documental/AI`:
- Decisión de producto/arquitectura vinculada, si existió:
- Revisión de código que contiene la corrección:
- Integración/publicación conocidas y evidencia; indicar pendiente cuando corresponda:

## 6. Verificación

Registrar comando o procedimiento, revisión, entorno, alcance y artefacto de resultado. No incluir contraseñas, tokens, cookies ni cadenas de conexión.

### Pruebas aprobadas

Solo ejecuciones terminadas con resultado observado. Indicar cantidad de casos cuando la salida la permita y aclarar qué contrato comprueban.

### Pruebas fallidas

Indicar fallo, reproducción, atribución a baseline/diff/entorno o incertidumbre, y siguiente acción. No atribuir un fallo al entorno sin evidencia.

### Pruebas omitidas

Indicar casos/suites saltados por el runner, condición/flag/credencial faltante y cobertura que dejan pendiente. Un comando con salida exitosa y casos omitidos no equivale a ejecutar esos casos.

### Pruebas no ejecutadas

Indicar comprobación necesaria, razón, riesgo/cobertura pendiente y requisito para ejecutarla. Separar una prueba elegida pero no corrida de un skip del runner.

### Verificación visual y operativa

- Rutas, roles, estados de datos y recorrido observado:
- Revisión desplegada conocida:
- Viewports/tema y dispositivo real o emulado:
- Capturas antes/después o pasos manuales y resultado:
- Accesibilidad inspeccionada y aspectos no comprobados:
- Limitaciones de portal, credenciales y regla de no localhost:

La inspección estática no se registra como validación visual. Un smoke en producción no valida cambios locales aún sin publicar.

## 7. Revisión independiente

- Revisor/agente y alcance recibido:
- Revisión final inspeccionada:
- Comprobaciones repetidas y evidencia propia:
- Hallazgos nuevos o discrepancias:
- Resoluciones y pendientes:
- Si no hubo revisión independiente, declararlo y explicar el límite:

## 8. Cierre, preguntas y continuación

- Hallazgos confirmados resueltos y pendientes, referenciados por ID:
- Qué está corregido en código, verificado automáticamente, verificado visualmente, integrado y publicado; indicar evidencia separada:
- Cobertura pendiente y condiciones para completarla:
- Preguntas de producto: enlazar [OPEN_QUESTIONS](../../00-product/OPEN_QUESTIONS.md).
- Preguntas técnicas: enlazar [PENDING_ARCHITECTURE_ITEMS](../PENDING_ARCHITECTURE_ITEMS.md).
- Contradicciones documentales y enlaces a sus `## Hallazgo`:
- Próximas acciones ordenadas, responsable y dependencias:
- Próximo lote sugerido del [plan](../PLATFORM_AUDIT_PLAN.md):
- Condiciones que obligan a revalidar este resultado:
- Artefactos entregados y enlaces:

Concluir con el alcance que la evidencia permite sostener. No sustituir pendientes por declaraciones de perfección ni llamar auditada a toda la plataforma por revisar una muestra.
