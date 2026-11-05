# AG-12 — Dashboards, reportes y exportaciones

Fecha 05/11/2026. Modo global por etapa con diagnóstico y corrección. Base local `86134c599cb6c28ad2a3961d9f034169c0c312a5` en `codex/pruebas`. La [publicación AG-11](./2026-11-05-ag-11-publication.md) quedó verificada antes de integrar las correcciones de esta etapa. AG-12 se verifica en el entorno local aislado.

**Estado.** Cerrada y verificada localmente. AG-13 queda pendiente de indicación del Owner.

## Alcance y fuentes

- Hubs de empresa y obra, resúmenes e indicadores, avance (R-002), rentabilidad (R-003/R-004), caja y proyección (R-005 a R-008), compras y proveedores (R-009/R-010/R-AP-03), evolución de certificaciones (R-012), subcontratos, portafolio, inventario, gastos generales, descargas y correo. Fuentes [Reporting](../../02-modules/REPORTING.md), [catálogo](../../06-reports/REPORT_CATALOG.md), [fórmulas](../../04-formulas/), [ERD de reporting](../REPORTING_ERD_GUARDRAILS.md) y [envíos programados](../SCHEDULED_REPORTS_ARCHITECTURE.md).
- Contratos y entrega con el agente de contratos. Alcance de empresa y obra, moneda y fórmulas con el agente de datos. Pantallas y paridad de archivos con el agente de UX. Coordinación, correcciones de reportes operativos, decisiones, verificación local y publicación de la etapa anterior a cargo del agente principal.
- La evidencia usa registros sintéticos en `bloqer_audit_ag01_20261103`. Los casos que escriben comprueban primero la identidad efectiva de esa base. La revisión integral de UX/UI queda en su etapa posterior. Email y otros proveedores externos usan simulación o se mantienen deshabilitados.

## Recorridos y correcciones

### GA-AG-12-001 — Tableros y portafolio con alcance verificable

El tablero inicial y el resumen de obra consultaban conteos de documentos de empresas distintas en una obra compartida. Las consultas de presupuestos, compras, recepciones, certificados, partes y documentos ahora verifican el proyecto, la empresa efectiva y la habilitación de la fuente. El portafolio conserva las obras accesibles y distingue moneda o ausencia de base comparable. Entradas en Dashboard, Resumen y Reportes → Portafolio. Fuentes D-111, [aislamiento](../TENANT_ISOLATION_MODEL.md) y [catálogo](../../06-reports/REPORT_CATALOG.md).

### GA-AG-12-002 — Permisos de lecturas financieras y saldos de caja

Las lecturas de caja usan los permisos AR, AP y Tesorería de cada fuente. El proyecto compartido conserva su filtro de empresa. La proyección que carece de una fuente muestra el alcance disponible. Tesorería agrupa los movimientos y saldos por moneda canónica de la cuenta y conserva la comprobación de moneda real. El Aging usa saldo actual y fecha de referencia para vencimientos en pantalla y en archivos. Pruebas aisladas de roles, empresa, crédito aplicado y variación histórica del código de moneda.

### GA-AG-12-003 — Rentabilidad por presupuesto

La pantalla, agregación multi-obra y descargas usan los permisos de D-013. La aprobación de [Q-088](./2026-11-05-ag-12-profitability-basis-proposal.md) quedó formalizada en D-141. `Facturado` utiliza el subtotal de facturas emitidas vinculadas a certificaciones del presupuesto, más ND y menos NC emitidas por factura origen. Las ventas directas quedan disponibles en la facturación de obra. Cuando no hay base comparable, la pantalla y el archivo muestran el faltante. La prueba SQL compara neto 100 + 20 − 30, con tributos, una nota borrador, una venta directa y una factura de otra empresa en el fixture.

### GA-AG-12-004 — Devengado y tendencia por moneda

Ingresos vs gastos de empresa y obra y sus tendencias reutilizan las agregaciones por moneda de origen. Cada bloque identifica qué fuentes pudo consultar y muestra margen si ambas son comparables. Los archivos conservan el mismo alcance. La prueba de devengado confirma la separación ARS/USD y el recorte de empresa de AP en una obra compartida.

### GA-AG-12-005 — Fechas, moneda y compromisos de compras

Análisis de compras aplica Desde/Hasta antes de calcular las capas. La parte histórica APU de cada OC sigue disponible ante un agregado sin base comparable y conserva la moneda de la orden. Un devengado directo no reduce el compromiso de una orden; el piso del compromiso abierto se calcula por orden. El servicio verifica permiso de Compras, proyecto, empresa y grafo de presupuesto, y oculta AP cuando corresponde. En Proveedores el usuario elige la moneda y las descargas usan la misma. Compras multi-obra filtra por obras asignadas, separa filas por moneda y advierte el límite de filas de órdenes abiertas. Pruebas SQL con dos empresas, órdenes ARS/USD, orden de obra no asignada y factura directa.

### GA-AG-12-006 — Evolución y cartera de certificaciones

Certificaciones obtiene el selector de presupuestos en su propio flujo de lectura. Controla relaciones entre certificado, factura, obligación y cobranza antes de producir los importes. La serie identifica moneda y usa fin de período, emisión y cobranza respectivamente. Una NC aplicada reduce la obligación sin generar cobro en caja. La prueba aislada confirma el avance certificado sin AR y el saldo cancelado por NC con cero cobrado para un usuario autorizado.

### GA-AG-12-007 — Fuentes y comparación de materiales y subcontratos

Materiales usa la empresa efectiva del proyecto. Subcontratos valida fechas, módulos, presupuesto y correspondencia de la empresa entre contrato, certificado y pago. La fecha filtra certificados y pagos; contratado refleja contratos activos. Cuando CxP está fuera del alcance se omite Pagado. Las descargas presentan partidas, contratos y evolución en sus secciones.

### GA-AG-12-008 — Paridad CSV, Excel y PDF

Los formatos comparten filtros de fecha, moneda, presupuesto y capa. El CSV protege fórmulas y conserva negativos numéricos, comillas y campos multilínea al pasar a Excel. El PDF de flujo real incluye cada moneda y distingue su alcance frente a Caja y proyección. Compras identifica bruto, estado y detalle APU histórico. El botón de descarga valida el tipo de archivo y comunica errores en lugar de presentar una página HTML como exportación. Regresiones de CSV/Excel, PDF real, selector y respuesta de descarga.

### GA-AG-12-009 — Permisos por destinatario, historial y reintentos

El runner usa el acceso vigente para generar cada adjunto de acuerdo con [Q-087](./2026-11-05-ag-12-report-delivery-proposal.md) y D-140. El envío manual desde el reporte verifica acceso antes de construir el archivo o tomar datos de contexto. Configuración, historial y reintentos respetan empresa y obra. Se conserva la selección de un reporte legado al editar otros campos. El reintento usa la fecha original, verifica permisos y saltea entregas confirmadas. La prueba del runner simula el proveedor y la regresión D-100 usa la base aislada.

### GA-AG-12-010 — Calendario y concurrencia de reportes programados

La siguiente ejecución se calcula desde el calendario local de la zona configurada. La adquisición y finalización del bloqueo comprueban su vigencia y pertenencia. El resultado de corrida distingue entregas combinadas, omitidas y fallidas. La prueba de proveedor no acredita deduplicación externa si el proveedor acepta un correo y se pierde la escritura de su resultado local. Esa condición pertenece al contrato general de entrega y queda registrada para AG-13.

### GA-AG-12-011 — Ponderación y empresa en gastos generales

La consulta y las acciones de imputación verifican empresa activa y alcance de obra. El informe corporativo de imputaciones comprueba también el permiso de finanzas de empresa y las relaciones de sus proyectos. [Q-089 aprobada](./2026-11-05-ag-12-overhead-weight-currency-proposal.md) se formalizó como D-142. El reparto pondera los costos directos netos en ARS con FX histórico comprobable y conserva sus signos. El denominador incluye todas las obras elegibles de la empresa, mientras la vista previa lista las obras accesibles. La base incompleta impide asignar el reparto y congelar el período. El margen neto dependiente queda sin calcular y los cierres existentes se leen de sus snapshots.

## Evidencia y estado

- **Pruebas generales:** 2.733 aprobadas en 9 tareas. Las 42 suites de nivel superior omitidas por sus condiciones se informan por separado. Revalidación de web tras ajustar el nombre del breadcrumb. TypeScript 13/13 tareas y lint aprobados.
- **SQL aislado:** 32 casos distintos aprobados. Cinco operativos, quince financieros, uno de configuración e historial D-100/D-140, dos de Avances y nueve de Inventario. Las repeticiones focales se deduplicaron por archivo y título. El caso D-142 comprobó que 100 USD con FX histórico 1.250 y 100 ARS ponderan 125.000 y 100 ARS respectivamente. Verificó permisos, NC/ND, congelación, reapertura, falta de FX y un pool negativo sin base de costo.
- **Muestra de navegador:** escritorio 1440×1000 con conflicto de moneda y filtro de fecha en Análisis de compras, tablet 768×1024 con selector USD y descarga PDF de Proveedores, teléfono 390×844 con Certificaciones y exportación CSV para OWNER y PROJECT_VIEWER. Se comprobó que el permiso AR cambia el contenido tanto en pantalla como en el archivo. La muestra se tomó antes de los últimos ajustes de etiquetas, moneda de tablas y D-142. Los últimos ajustes se comprobaron mediante pruebas, revisión de código y compilación.
- **Revisión independiente:** 39 pruebas focales de runner y módulo, calendario/estado, CSV, render PDF y web. Cuatro pruebas focales adicionales de cierre de gastos generales. Estas pruebas se solapan con el total general.
- **Compilación final:** aprobada con el mismo contenido de las 128 fuentes congeladas. Base y proveedores deshabilitados durante la compilación. Se comprobó el diff y el manifiesto final de archivos. El esquema y las migraciones conservan su revisión base.
- **Fuentes y evidencia:** índice de conocimiento con 593 fragmentos. Resultados y fuentes congeladas en `output/platform-audit/ag-12-2026-11-05/`, incluidos `workspace-test-summary.json`, `sql-final-summary.json`, `browser-smoke.json` y los archivos de la muestra. Los usuarios y documentos de la muestra son sintéticos y se conservan solo en la base aislada.

La auditoría integral de UX/UI sigue como etapa posterior. La confirmación de correo entre el proveedor y la persistencia local queda registrada como P-AG13-01 para el canal general de entrega.
