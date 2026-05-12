# Workflow: Gestionar RFI

## 1. Objetivo
Registrar consulta formal y cerrarla con respuesta ([`RFIS.md`](../02-modules/RFIS.md)).

## 2. Actor
PM o FOREMAN.

## 3. Precondiciones
- Proyecto activo.

## 4. Pasos
1. Crear **Rfi** en `DRAFT` con destinatario y `due_date`.
2. **Enviar** → `SUBMITTED`; notificar destinatario (in-app / email [Q-009]).
3. Cargar **respuesta** → `ANSWERED`.
4. **Cerrar** → `CLOSED` (flujo estándar). Si se cierra desde `SUBMITTED` sin respuesta, registrar `closure_without_response_reason` ([BR-RFI-001]).
5. Si vence sin cerrar → job marca **`is_overdue`** / emite `rfi.overdue` ([BR-RFI-002]).

## 5. Postcondiciones
- Queda trazabilidad en proyecto.

## 6. Eventos
- `rfi.*`

## Referencias
- [`OPEN_QUESTIONS.md`](../00-product/OPEN_QUESTIONS.md) Q-006
