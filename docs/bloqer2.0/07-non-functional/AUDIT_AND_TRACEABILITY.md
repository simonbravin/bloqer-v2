# Auditoría y trazabilidad

## Alcance
Toda mutación en entidades financieras y comprobantes legales + cambios de permisos + cierre período ([`AUDIT_LOG.md`](../02-modules/AUDIT_LOG.md)).

## Principios
1. **Append-only** para audit log ([BR-AUD-004]).
2. Comprobantes emitidos **inmutables**; anulación explícita ([BR-AUD-002]).
3. Diff **antes/después** en JSON para campos relevantes.

## Retención
Configurable por tenant; default acorde normativa local (definir legal).

## Referencias
- [`../01-domain/BUSINESS_RULES.md`](../01-domain/BUSINESS_RULES.md) sección Auditoría
