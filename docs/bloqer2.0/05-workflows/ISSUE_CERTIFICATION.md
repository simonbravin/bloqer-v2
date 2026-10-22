# Workflow: Emitir certificación

## 1. Objetivo
Generar certificado de avance **DRAFT → ISSUED** con validaciones de techo ([`CERTIFICATIONS.md`](../02-modules/CERTIFICATIONS.md)).

## 2. Actor
PM.

## 3. Precondiciones
- Budget `APPROVED/CLOSED`.
- Ítems con saldo certificable.

## 4. Pasos
1. Crear certificación borrador por período.
2. Ingresar por ítem: Δ% físico y monto económico período.
3. Sistema valida cantidad y físico acumulados de otros certificados emitidos/aprobados, más el período, sin superar 100% (PUBLIC y PRIVATE, [D-119]).
4. Si excede → corregir medición o tramitar alcance adicional por adenda. Una nota no habilita excedentes.
5. **Emitir** → `ISSUED` (inmutable).

## 5. Postcondiciones
- Lista para aprobación cliente / facturación según proceso.
- `payment_status` permanece **`UNPAID`** (sin AR vinculada) hasta facturación/cobranzas ([BR-CERT-PAYMENT-001]).

## 6. Eventos
- `certification.issued`. Un exceso bloquea la operación; no emite el antiguo evento de advertencia privada.

## Referencias
- [`CERTIFICATION_FORMULAS.md`](../04-formulas/CERTIFICATION_FORMULAS.md)
