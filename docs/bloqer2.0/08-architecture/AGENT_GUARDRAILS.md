# Agent guardrails — Bloqer 2.0

> Reglas **duras** para agentes IA (y humanos). Violación = PR inválido.

## Qué puede decidir un agente **solo**

- Nombres de **variables locales** y estructura de archivos **dentro** de las convenciones ya documentadas.  
- Refactors mecánicos que **no** cambian comportamiento observable.  
- Orden de imports, extracción de función pura ya cubierta por doc.

## Qué debe **preguntar** (o detenerse)

- Cualquier nuevo **estado**, **campo persistido**, o **regla financiera** no listada en `01-domain/` o `02-modules/`.  
- Cambiar semántica de `D-xxx` o `BR-xxx`.  
- Introducir **nueva dependencia** npm (necesita criterio humano / ADR).

## Qué **jamás** debe inventar

- Campos de base de datos, enums, eventos, montos implícitos.  
- Atajos “solo para demo” con datos cross-tenant.  
- `float` / `double` para dinero.  
- `payment_status` en `certification` como columna editable sin spec de materialización.  
- Microservicios o segunda base de verdad operativa.

## Trabajo por módulos

- Un PR grande → preferir **franja por módulo** (`certifications` solo, etc.).  
- No importar cinco módulos desde un solo componente UI.

## Cómo registrar dudas

- [`PENDING_ARCHITECTURE_ITEMS.md`](./PENDING_ARCHITECTURE_ITEMS.md), `OPEN_QUESTIONS.md`, o comentario `// OPEN:` solo si el equipo acepta ese prefijo (mejor ticket).

## Cómo citar documentos

- Ruta relativa desde repo: `docs/bloqer2.0/...`  
- Incluir **ID de regla** cuando exista: `[BR-COS-002]`, `[D-026]`.

## Cómo detectar contradicciones

- Si código y `BUSINESS_RULES` difieren → **código mal** hasta que se actualice la spec **por decisión explícita**.  
- Si dos docs funcionales contradicen → anotar en PR y escalar a producto.

## Evitar overengineering

- No abstraer “plugin system” sin necesidad.  
- No crear capa `AbstractFactory` si un service + repository alcanza.

## Evitar shortcuts peligrosos

- “Solo esta vez” sin `tenant_id`.  
- “Confío en el front” para aprobar pago.  
- Borrar movimiento confirmado en lugar de compensar.

## Referencias

- [`../AGENTS.md`](../AGENTS.md)  
- [`AI_DEVELOPMENT_WORKFLOW.md`](./AI_DEVELOPMENT_WORKFLOW.md)
