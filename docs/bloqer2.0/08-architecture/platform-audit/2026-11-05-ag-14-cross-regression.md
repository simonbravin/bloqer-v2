# AG-14 — Regresión cruzada y preparación de publicación

## Encargo y base

- Fecha 05/11/2026. Auditoría transversal, corrección y revalidación. Base local `45bdc41c6c3e825ad911f2727c62e101d10b9104` en `codex/pruebas`.
- El [PR #11](https://github.com/simonbravin/bloqer-v2/pull/11) publicó AG-13. La rama `main` quedó en `f3b76b37b4b9576106e0794e4716552bf6ff7db2` con el mismo árbol del lote. [Publicación](./2026-11-05-ag-13-publication.md).
- La etapa cubre certificación a cobranza, compra a pago, recepciones y stock, Tesorería y Contabilidad, Campo y Avances. Incluye dependencias de producción, aislamiento del paso de migración, recuperación, paquetes web y señales operativas.
- Se separaron los recorridos financieros, integridad de stock/caja, Campo y reportes y la revisión independiente de contrato y dependencias. Las mutaciones de prueba usan datos sintéticos en la base aislada de auditoría.

## Hallazgos y correcciones

### GA-AG-14-001 — Facturación de recepciones según cobertura por línea

El atajo D-108 y las acciones de CxP podían ocultar renglones pendientes cuando una factura de mayor precio agotaba el importe global de la OC. El panel, la vista previa, el servicio que crea el borrador y Pendientes utilizan cobertura de cantidades vinculadas. Los importes del panel siguen representando el control monetario. Las facturas históricas con líneas sueltas conservan la comprobación monetaria adicional. El servidor repite esa comprobación y verifica moneda dentro del bloqueo. [Compras](../../02-modules/PURCHASE_ORDERS_AND_RECEIPTS.md).

### GA-AG-14-002 — Borrador fiscal editado al recibir otra entrega

El refresco de un borrador automático podía sustituir precios, descuentos o referencias ya guardadas. D-145 conserva el borrador cuando el evento de edición identifica el mismo documento y el refresco modificaría sus líneas. La recepción conserva la confirmación y muestra cómo completar las nuevas cantidades. El botón **Actualizar borrador** usa el mismo control. La ampliación automática sigue disponible si el borrador carece de una edición guardada comprobable. [Q-092 aprobada](./2026-11-05-ag-14-edited-ap-draft-proposal.md).

### GA-AG-14-003 — Mutaciones confirmadas ante fallos de efectos secundarios

La emisión de facturas AP/AR y el alta compuesta podían devolver error después de guardar la factura y su obligación si fallaba la lectura para el aviso. El aviso completo es un efecto de mejor esfuerzo. En emisión, la notificación usa la deuda abierta y el saldo que el servicio puede verificar. En recepciones, una falla en el nombre del actor o en el borrador automático mantiene el resultado de la mutación. Los avisos muestran errores funcionales y el registro técnico usa un código controlado para errores inesperados. [Flujo de compra a pago](../../05-workflows/PURCHASE_TO_PAY.md) y [certificación a cobranza](../../05-workflows/CERTIFY_TO_COLLECT.md).

### GA-AG-14-004 — Pendientes de Campo con empresa, moneda y módulo comprobados

El alcance de certificaciones históricas con empresa nula se comprueba también en el presupuesto. Cada certificación muestra la moneda de ese presupuesto. Las recepciones parcialmente facturadas siguen en **Facturar** si queda cobertura pendiente y el actor puede operar CxP. El mismo criterio alimenta contador y listado. La lectura de cobertura agrupa candidatos en lotes de hasta 200. El costo total depende del número de órdenes candidatas. [Guía operativa](../../GUIA_OPERATIVA_BLOQER_V2.md).

### GA-AG-14-005 — Paridad de Avances y cartera de certificaciones

Avances (R-002) limita las consultas a las fuentes habilitadas y comprueba el vínculo de CxC, cobranza y notas de crédito antes de calcular saldos o cobranzas. Ante un vínculo inconsistente se conservan los importes facturados comprobables y se muestra una advertencia. Los cambios en compras, presupuesto y subcontratos refrescan la ruta de Avances. La cartera (R-012) deriva el estado de cobro con el mismo grafo que el detalle de certificación, incluidas las obligaciones de notas de débito. [Guía operativa](../../GUIA_OPERATIVA_BLOQER_V2.md).

### GA-AG-14-006 — Agregación de saldos de Tesorería

La consulta de saldos agrupa movimientos en la base por cuenta y tipo. En la regresión de 200 cuentas se ejecutaron dos consultas de saldo. El camino anterior ejecutaba tres por cuenta y transfería las filas históricas a la aplicación. Se comprobaron apertura negativa, movimientos conciliados y los cortes por fecha contable y valor. [Tesorería](../../02-modules/TREASURY.md).

### GA-AG-14-007 — Coherencia de los pares de transferencia y de la importación bancaria

El origen de Contabilidad valida el par de movimientos y las fechas valor de la transferencia antes de crear o contabilizar el asiento. El control reconoce vínculos históricos consistentes. Conciliación valida `CURDEF` de OFX/QFX cuando hay una moneda de encabezado inequívoca y rechaza la importación incompatible antes de insertar líneas. Los extractos sin declaración y los CSV conservan el flujo vigente. [Conciliación](../../02-modules/BANK_RECONCILIATION.md) y [especificación OFX Banking](https://financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%20Banking%20Specification%20v2.3.pdf).

### GA-AG-14-008 — Dependencias y protección de sesión

La resolución inicial tenía 42 avisos de producción. Se actualizaron Next.js 15, Auth.js 5, SheetJS, el detector de archivos, Zod y dependencias existentes relacionadas. SheetJS usa la distribución oficial 0.20.3 con integridad SHA-512 fijada. La transición Zod conserva validación de UUID históricos y transformación de valores predeterminados. Se revalidaron 118 entradas en 14 esquemas contra la versión anterior. El middleware requiere una sesión con ID de usuario en rutas privadas. El mínimo declarado de Node pasa a 20.9 por la dependencia de imágenes. [Aviso de Next.js](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Auth.js](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-8fpg-xm3f-6cx3), [SheetJS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) y [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

El resultado de producción tras las actualizaciones contiene cero avisos críticos, altos o moderados. Conserva un aviso bajo de `deepmerge`, sin versión corregida disponible. La rama de Resend que lo usa requiere el campo `react` y opciones de renderizado. El envío de Bloqer suministra HTML, texto y adjuntos. La revisión de esa cadena no encontró una entrada operativa que alcance la condición vulnerable. [Aviso de deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

### GA-AG-14-009 — Destino comprobado antes de migrar en Vercel

El paso que aplica migraciones valida el entorno, el host, la base y el esquema compartidos por las dos conexiones. Production requiere el destino de portal. Preview y Development requieren un compute diferente. Los errores de configuración detienen el paso antes de invocar Prisma y comunican el campo afectado sin incluir el valor. El build local de auditoría desactiva Vercel y la base. [Plan de despliegue](../DEPLOYMENT_PLAN.md).

### GA-AG-14-010 — Registro técnico de errores de persistencia

La salida automática de Prisma podía incluir el texto y argumentos de una consulta fallida. Fuera de desarrollo se registra un evento técnico fijo con hora y nivel. Los servicios pueden manejar el error de la operación con el mismo contrato. [Observabilidad](../OBSERVABILITY_ARCHITECTURE.md).

## Verificación y estado

- **Pruebas generales.** 2.776 aprobadas en diez tareas. El comando general omitió 44 suites de nivel superior por sus condiciones de ejecución. Tipos aprobados en 13 tareas y lint aprobado en paquetes y web.
- **PostgreSQL aislado.** 49 casos distintos aprobados en 13 ejecuciones seleccionadas. El circuito de certificación → factura → CxC → cobranza comprende 11 casos, incluidos cobros parciales, reintento y moneda extranjera. El de recepción → borrador → emisión → CxP → pago verificó un único egreso tras el reintento. Los demás casos cubren rollback, módulos y obras restringidos, stock, cierre, OFX, histórico de Campo, cronograma y reportes.
- **Migraciones.** Lectura aislada con 73 de 73 aplicadas. D-115 coincide con la variante CRLF del mismo SQL. El registro comprobó cero migraciones pendientes, inesperadas o inconclusas. La prueba de error de Prisma, en una transacción de solo lectura, registró un evento estructurado y excluyó el parámetro sintético de la consulta.
- **Compatibilidad.** Bloqer AI pasó 202 casos estructurales con proveedor simulado. La Guía y Ayuda alimentan el índice regenerado de 598 fragmentos. El lockfile pasó la comprobación congelada y el archivo de SheetJS coincide con su integridad fijada.
- **Alcance de la evidencia.** La facturación por renglón se concilia al nivel de la OC. Cuando un borrador agrupa varias recepciones, el marcador de origen identifica el disparador y la prueba no acredita un reparto histórico de cantidades por remito. Los flujos con sesión real, proveedores externos y tamaños de escritorio, tablet y teléfono quedan para sus validaciones específicas.
- **Compilación.** Aprobada con las 116 fuentes y archivos de dependencias congelados. Las compilaciones de AG-13 y AG-14 midieron 103 kB de carga inicial compartida. Las tres rutas comparadas mantuvieron su medida inicial redondeada, Dashboard 243 kB, Tesorería 363 kB y Avances 288 kB. Esta es una medición del build local.
- **Sesión compilada.** El sandbox Edge del build aceptó una sesión JWT válida y una sesión con el formato previo sin `authTime`. Redirigió a Acceso los casos vencido, alterado y anónimo. La compilación advierte sobre las APIs de compresión opcional de JWE en `jose`. Los tokens del flujo probado usan el formato de sesión sin compresión que emite Auth.js. [Contrato de compresión JWE](https://github.com/panva/jose/blob/main/docs/types/interfaces/CompactJWEHeaderParameters.md).
- **Reproducción.** `output/platform-audit/ag-14-2026-11-05/` contiene `sql-final-summary.json`, `workspace-test-summary.json`, `isolated-migrations.json`, `prisma-log-redaction.json`, `ai-fake-structural.json`, `edge-session-smoke.json`, `build-bundle-comparison.json`, los avisos npm y el manifiesto final.

**Estado.** AG-14 cerrada localmente, lista para publicación. La revisión integral de UX/UI en escritorio, tablet y móvil queda pendiente.
