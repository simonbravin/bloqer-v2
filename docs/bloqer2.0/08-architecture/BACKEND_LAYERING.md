# Backend layering — Bloqer 2.0

## Decisión

Definir capas claras en el servidor (dentro del monolito Next.js):

1. **Transport / handlers** — Server Actions, route handlers, o equivalente: parsing, auth, `tenant_id`, respuesta HTTP/JSON — criterio detallado en [`API_STRUCTURE.md`](./API_STRUCTURE.md).
2. **Application services** — orquestación, transacciones, políticas de uso de casos; **llaman** a dominio y persistencia.
3. **Domain rules** — invariantes y reglas alineadas a [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) y máquinas de estado [`../01-domain/STATE_MACHINES.md`](../01-domain/STATE_MACHINES.md); **sin** detalles de HTTP.
4. **Persistence** — Prisma (u otro acceso SQL) encapsulado; queries siempre **scoped por tenant** salvo tablas globales explícitas.
5. **Integration** — R2, Resend, proveedores externos; adaptadores con interfaces estables.

La **lógica financiera crítica** vive en **dominio + servicios**, nunca solo en la capa de transporte.

## Justificación para Bloqer 2.0

- ERP con **periodos cerrados** ([`../03-finance/PERIOD_CLOSE_AND_LOCKS.md`](../03-finance/PERIOD_CLOSE_AND_LOCKS.md)), **anulaciones compensatorias** y **ledger** ([`../03-finance/ACCOUNT_MOVEMENTS.md`](../03-finance/ACCOUNT_MOVEMENTS.md)) requiere transacciones y reglas centralizadas.
- Los handlers deben ser **delgados** para testear reglas sin levantar HTTP.
- Multitenancy ([D-001](../00-product/DECISION_LOG.md)) debe aplicarse **una vez** por request en la frontera y reforzarse en persistencia.

## Problemas que evita

- **Fat controllers** con SQL y reglas mezcladas.
- **Bypass** de reglas vía otro endpoint olvidado.
- **Tests** frágiles que mockean media aplicación.

## Qué NO hacer

- No poner **Prisma** en componentes React cliente.
- No implementar **“solo este endpoint”** que salta el service layer “por velocidad”.
- No mezclar **serialización de API** con **cálculo de negocio** en el mismo bloque sin separación conceptual.
- No definir aquí **rutas ni firmas** concretas de API (fuera de alcance de esta carpeta).

## Referencias funcionales

- Reglas: [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md)
- Eventos y efectos: [`../01-domain/EVENTS_AND_AUTOMATIONS.md`](../01-domain/EVENTS_AND_AUTOMATIONS.md)
- Auditoría: [`../02-modules/AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)
- Tesorería: [`../03-finance/TREASURY_MODEL.md`](../03-finance/TREASURY_MODEL.md)

## Documentos técnicos relacionados

- [`SERVICE_LAYER.md`](./SERVICE_LAYER.md)
- [`MULTITENANCY_ARCHITECTURE.md`](./MULTITENANCY_ARCHITECTURE.md)
- [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md)
