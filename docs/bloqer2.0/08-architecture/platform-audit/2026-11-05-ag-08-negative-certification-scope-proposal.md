# AG-08 — Alcance de certificaciones negativas

**Estado: punto 1 aprobado por el Owner el 05/11/2026; formalizado en D-132.** Q-079 resuelta en alcance. Se conserva el contrato no negativo; cualquier rectificación exige diseño previo separado, sin prometer una función de certificaciones negativas. Las correcciones de los recorridos existentes continúan.

## Contradicción comprobada

CERTIFICATIONS §13 anuncia líneas negativas con autorización, pero el formulario y los validadores actuales admiten cantidades no negativas. No se define quién autoriza, qué estados admiten ese descuento ni cómo se representa en factura, CxC y notas de crédito. D-119 define topes acumulados; D-115 define NC/ND, pero ninguno completa ese procedimiento de certificación negativa.

El servicio directo puede eludir hoy parte de la validación de entrada. Corregir ese bypass para aplicar el contrato vigente sí pertenece a AG-08; no equivale a implementar la autorización negativa ausente.

## Propuesta recomendada

Tratar la certificación negativa como desarrollo separado, con diseño y aprobación previos de permisos, cantidades/porcentajes, acumulados, precio snapshot, signos, facturación/NC/AR, anulación y trazabilidad. En AG-08 conservar el flujo no negativo actual, reparar sus fallos y documentar que no hay un procedimiento de certificación negativa autorizado disponible. No modificar ni regularizar históricos, inventar una autorización o simular el descuento mediante otro documento.

## Alternativa

Mantener AG-08 abierta hasta diseñar, aprobar, implementar y verificar ese procedimiento completo. No habilitar cantidades negativas solo quitando una validación.

## Verificación prevista

Entradas negativas rechazadas por servicio y UI según el contrato vigente, sin efectos parciales; topes D-119, históricos y notas D-115 conservados. Guía y ayuda distinguen capacidades disponibles de ese desarrollo pendiente.
