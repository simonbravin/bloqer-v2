---
name: bloqer-platform-audit
description: Audita Bloqer de forma global, por módulo, por cambios o para revalidar hallazgos. Conecta UI, contratos, servicios, datos, permisos y evidencia visual, y coordina correcciones cuando están solicitadas. Usar para auditorías de la plataforma o de un área; no para imponer una auditoría global a un arreglo ordinario.
---

# Auditoría de Bloqer

Trabajar sobre el repositorio Bloqer y su documentación vigente. La skill organiza el trabajo; no agrega reglas de producto ni autoriza publicación, migraciones o escrituras externas por sí misma.

## Elegir la ejecución

Inferir del pedido y la conversación:

- **Planificar**: preparar alcance y etapas; no comenzar correcciones ni declarar la plataforma auditada.
- **Global**: reconciliar inventario AG-00 y avanzar por lotes del plan.
- **Módulo**: seguir los recorridos completos del área y sus conexiones.
- **Cambio**: fijar base/revisión/diff y ampliar a consumidores afectados.
- **Revalidación**: comprobar hallazgos o informes previos sobre la revisión actual, preservando IDs.

Consultar primero la modalidad autorizada del plan de campaña. Para esta campaña el usuario confirmó el 03/11/2026 corregir y verificar todos los hallazgos confirmados de cada fase antes de avisar que terminó; esperar su indicación antes de avanzar a la siguiente. No reconfirmar una autorización de corrección ya dada. Fuera de esa modalidad, auditar es diagnóstico por defecto si no se pidió corregir. Una ambigüedad funcional bloquea esa decisión, no las tareas independientes. Si falta base del diff, aclararla antes de atribuir regresiones.

## Fuentes y arranque

1. Leer `AGENTS.md` raíz y las fuentes obligatorias en su orden, incluido el módulo funcional correspondiente. Luego decisiones, estados, fórmulas y workflows aplicables.
2. Leer el [plan](../../../docs/bloqer2.0/08-architecture/PLATFORM_AUDIT_PLAN.md), el [runbook](../../../docs/bloqer2.0/08-architecture/PLATFORM_AUDIT_RUNBOOK.md) y el [registro](../../../docs/bloqer2.0/08-architecture/platform-audit/README.md). Cargar solamente las referencias de la franja elegida.
3. Fijar revisión, cambios locales y límites de ejecución. Conservar trabajo ajeno. Inventariar qué existe, se expone y se prueba; no inferir implementación desde el roadmap ni problemas vigentes desde diagnósticos antiguos.

## Coordinar

Si hay subagentes, delegar perspectivas independientes con alcance y archivos claros:

- [Contratos](../../../.codex/agents/bloqer-audit-contracts.toml).
- [Datos y seguridad](../../../.codex/agents/bloqer-audit-data-security.toml).
- [Experiencia y visuales](../../../.codex/agents/bloqer-audit-ux.toml).
- [Verificación](../../../.codex/agents/bloqer-audit-verification.toml).

Usar los perfiles por nombre cuando el entorno lo permita. En caso contrario, leer el archivo y pasar sus instrucciones al subagente disponible. Respetar la concurrencia disponible; no fijar modelos ni crear nuevos chats del usuario para subtareas. Si no hay delegación, efectuar pasadas separadas y declarar la limitación de revisión independiente. Un responsable por archivo durante correcciones.

## Ejecutar y cerrar

Seguir el runbook:

- Trazar requisito → pantalla → Action/API → validator → service → persistencia real/schema → efectos → lectura/DTO → invalidación/listado/KPI/exportación. No presuponer repositorios donde aún no existen.
- Expandir según contratos compartidos, relaciones, permisos, dinero, estados y consumidores demostrados, no por proximidad de carpetas.
- Confirmar hallazgos con fuente, ubicación, impacto y reproducción o razonamiento comprobable; separar sospechas y antecedentes históricos.
- Si se pidió corregir, reparar la causa en un lote acotado y verificar el comportamiento afectado. No inventar campos/estados/reglas/dependencias ni improvisar arquitectura.
- Verificar destino efectivo antes de pruebas con escritura; no ejecutar pruebas mutantes en producción ni seeds ad hoc. Leer scripts antes de build: pueden migrar con `VERCEL=1`. No abrir navegador salvo smoke solicitado ni localhost salvo pedido explícito, según regla del repo.
- Aplicar Guía + Ayuda + impacto Bloqer AI ante cambios funcionales visibles; para cambios puramente internos/cosméticos, justificar `sin impacto documental/AI` según la policy.
- Usar la [plantilla](../../../docs/bloqer2.0/08-architecture/platform-audit/REPORT_TEMPLATE.md), consolidar IDs sin duplicar, actualizar el registro y vincular evidencia. No crear informes ficticios para ejemplos o pruebas de la skill.
- Separar passed/failed/skipped/no ejecutado y corrección/verificación visual/publicación. No declarar cobertura completa desde muestreo, tipos o lint.

## Pedidos de ejemplo

- “Usá bloqer-platform-audit para preparar el plan global sin empezar a corregir”.
- “Auditá y corregí Compras, incluyendo el vínculo OC → recepción → factura → pago”.
- “Auditá los cambios desde una revisión base concreta y sus consumidores”.
- “Revalidá los hallazgos de AG-09 en la revisión actual”.

No programar recurrencias por inferencia. Si se solicita calendario, usar las herramientas de automatización disponibles con la cadencia indicada.
