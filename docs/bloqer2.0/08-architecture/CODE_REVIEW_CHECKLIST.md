# Code review checklist — Bloqer 2.0

> Lista práctica para PRs (humanos o IA). Marcar mentalmente cada ítem.

## Documentación consultada

- [ ] ¿El cambio cita o implica actualización de `docs/bloqer2.0/`?  
- [ ] ¿Hay `OPEN_QUESTIONS` o `PENDING_ARCHITECTURE_ITEMS` tocados?

## Tenant isolation

- [ ] Todo query/mutación con `tenant_id` (o justificación documentada).  
- [ ] Coherencia `company_id` ↔ `project_id` ↔ documento cuando aplique.

## Permissions

- [ ] Server valida rol/acción; UI no es suficiente.

## Financial correctness

- [ ] Sin `float` en dinero.  
- [ ] FX + `currency` + monto base cuando corresponda.  
- [ ] Period lock respetado.

## Source vs derived

- [ ] `payment_status` / `settlement_status` / balances no “inventados” en UI como verdad.  
- [ ] Si hay materialización, ¿invalidación documentada?

## Service layer

- [ ] Mutación importante pasa por `packages/services`.  
- [ ] Sin duplicar lógica entre Route Handler y Server Action.

## DB access

- [ ] Sin Prisma en componentes cliente.  
- [ ] Repositories scoped; sin delete físico en ledger/stock confirmado.

## Frontend

- [ ] Sin reglas críticas solo en cliente.  
- [ ] TanStack Table / Recharts según tipo de pantalla.

## Tests

- [ ] Tests nuevos o actualizados para lógica financiera / tenant / permiso afectado.

## Security

- [ ] Uploads y downloads con auth + tenant.  
- [ ] Sin secret en cliente.

## Performance

- [ ] Listados con índice esperado ([`INDEXING_STRATEGY.md`](./INDEXING_STRATEGY.md)) o nota de deuda.

## Observability

- [ ] Logs estructurados con `tenant_id` / `request_id` en paths críticos.

## Migrations

- [ ] Expand/contract si aplica; sin pérdida de precisión NUMERIC.

## i18n

- [ ] Sin strings es-AR como enum; copy vía i18n keys.

## Anti-overengineering

- [ ] ¿Se puede explicar el diseño en dos frases? Si no, reconsiderar.

## Referencias

- [`AGENT_GUARDRAILS.md`](./AGENT_GUARDRAILS.md)  
- [`TESTING_STRATEGY.md`](./TESTING_STRATEGY.md)
