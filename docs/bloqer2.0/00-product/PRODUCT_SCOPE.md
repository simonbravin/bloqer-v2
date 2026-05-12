# Product Scope — Bloqer 2.0

> Este documento define **qué entra y qué no entra** en Bloqer 2.0 desde el lanzamiento.  
> El usuario fue explícito: **"el MVP es el producto final"**. No se hace una versión recortada para luego ampliar — se construye el producto completo, pero por bloques ordenados.

---

## 1. Filosofía de scope

- Bloqer 2.0 se construye **completo desde el primer día**, módulo por módulo.
- No hay "MVP recortado" ni "versión light" comercial.
- Lo que sí hay son **fases de implementación** internas que ordenan la construcción técnica.
- Una funcionalidad no se libera al usuario hasta que está **completa, conectada y trazable**.

---

## 2. Fases de implementación (internas)

| Fase | Descripción | Cuándo |
|---|---|---|
| **Fase 1** | Núcleo operativo y financiero. Producto utilizable para una constructora típica de obra privada o pública. | Primer release |
| **Fase 2** | Profundización: subcontratos avanzados, conciliación bancaria semi-automática, BI avanzado, certificaciones de subcontratos. | Después de Fase 1 estable |
| **Fase 3** | Integraciones externas: AFIP, bancos (CBU, CSV, OFX), BI, móvil para obra, automatizaciones avanzadas. | Cuando el dominio está maduro |

Cada documento de módulo indica en su §18 a qué fase pertenece cada feature.

---

## 3. Lo que ENTRA (Fase 1)

### 3.1 Multitenancy y administración

- Multi-tenant desde día 1 (cada empresa tiene sus datos aislados).
- Multi-empresa por tenant (un tenant puede tener varias razones sociales — a confirmar en `OPEN_QUESTIONS.md`).
- Multi-moneda con ARS como base y FX manual.
- Multi-usuario con permisos por módulo (ver/crear-editar/aprobar).
- Auditoría completa de acciones críticas.
- Cierre de periodo configurable por admin.

### 3.2 Directorio y partes

- Directorio unificado de contactos con **roles múltiples** (cliente, proveedor, subcontratista, empleado, otro).
- Un mismo contacto puede ser **cliente y proveedor a la vez**.
- Datos fiscales por contacto.

### 3.3 Proyectos y planificación

- Proyectos (obras) con cliente, ubicación, fechas, estados, tipo (público/privado), monto.
- **Cronograma temporal** (Gantt / hitos — formato a confirmar).
- Múltiples presupuestos por proyecto (versión activa + adendas/fases).
- Estados del proyecto con máquina formal.

### 3.4 Presupuestos y costeo

- WBS jerárquica.
- Ítems de presupuesto con cómputo (cantidad × precio).
- Análisis de costos por ítem: materiales + mano de obra + equipos + subcontratos + GG + costo financiero + utilidad + impuestos.
- Versionado de presupuestos.
- Presupuesto cerrado **solo se modifica con adenda**.
- Adendas como entidad propia.

### 3.5 Contratos, change orders y RFIs

- Contratos con cliente y con proveedor/subcontratista.
- Adendas que extienden alcance/precio del contrato.
- **Change orders** (órdenes de cambio): ajustes de alcance/precio sin abrir nueva fase.
- RFIs (requests for information) con estados y respuestas.

### 3.6 Certificaciones

- Avance físico **y** económico por ítem.
- Avance financiero (cobrado) trackeado.
- Sobrecertificación bloqueada en obra pública (requiere adenda).
- Sobrecertificación permitida en obra privada con alerta y nota.
- Generación de comprobante de certificación.
- Histórico por proyecto y por ítem.

### 3.7 Compras

- Compras directas (sin OC) y compras por OC.
- Órdenes de compra como entidad separada.
- Recepciones como entidad separada (puede haber recepción parcial).
- Facturas de compra como entidad separada.
- Conexión OC → recepción → factura → pago.
- Imputación de compra a proyecto/ítem.
- Comparativa de proveedores (Fase 1 mínima, Fase 2 avanzada).

### 3.8 Subcontratos

- Subcontrato como contrato con un contacto que tiene rol "subcontratista".
- Avance del subcontratista (físico/económico) — modelo a confirmar (`OPEN_QUESTIONS.md`).
- Pagos a subcontratistas.
- Retenciones manuales aplicables a subcontratos.

### 3.9 Inventario

- Productos / materiales con unidad y categoría.
- Múltiples depósitos por empresa.
- Movimientos: ingreso, egreso, ajuste, transferencia entre depósitos.
- Stock disponible por depósito y consolidado.
- Valuación: **promedio ponderado móvil O FIFO**, configurable por empresa.

### 3.10 Tesorería

- Cuentas: bancarias y cajas.
- Movimientos: ingreso, egreso, transferencia interna.
- Estados: borrador / confirmado / conciliado / anulado.
- Saldos por cuenta + consolidado + por moneda + por proyecto.
- Conciliación bancaria **manual** en Fase 1 (importación CSV/OFX en Fase 2).
- Modelo híbrido de 4 vistas (extracto, ledger, posición, flujo de fondos).

### 3.11 Cuentas por cobrar y pagar

- AR generadas desde certificaciones, ventas directas, o cargadas manualmente.
- AP generadas desde compras, subcontratos, o cargadas manualmente.
- Pagos y cobranzas **parciales** habilitados.
- Aging por proyecto, por contacto, global.

### 3.12 Impuestos y retenciones

- Carga **manual** por movimiento (% o monto fijo).
- No hay motor fiscal automático.
- Reportes resumen por periodo.

### 3.13 Documentos

- Repositorio de documentos vinculado a entidades (proyecto, contacto, certificación, factura, OC, etc.).
- Tipos de documento parametrizables.
- Trazabilidad legal de OCs, certificados, facturas, recibos, órdenes de pago.

### 3.14 Reportes

- Rentabilidad por proyecto (bruta y neta).
- Presupuesto vs real (con toggle Comprometido/Pagado).
- Avance vs costo.
- Cashflow real y proyección de caja.
- AR/AP con aging.
- Stock y valorización.
- Compras por proveedor / multi-proyecto.
- Materiales más caros, evolución de certificados, materiales por proyecto.
- Auditoría.
- **Query builder** (constructor custom) — ver `OPEN_QUESTIONS.md` sobre forma.
- Exportación a XLSX y PDF.

### 3.15 Libro de obra

- Partes diarios.
- Eventos de obra (clima, paros, hitos, observaciones).
- Adjunto de fotos.
- Vinculación a proyecto y a fecha.

---

## 4. Lo que ENTRA en Fase 2 (post-lanzamiento, pero ya planeado)

- Conciliación bancaria con importación de extractos (CSV/OFX).
- Comparativas avanzadas de proveedores con histórico.
- Devengado como vista financiera adicional.
- Aprobaciones multinivel configurables.
- Plantillas de presupuesto reutilizables.
- BI con dashboards más profundos.
- Notificaciones por email (Fase 1 solo in-app — a confirmar).

---

## 5. Lo que ENTRA en Fase 3 (futuro)

- Integraciones bancarias en vivo.
- AFIP / facturación electrónica automática.
- App móvil para parte de obra desde el celular.
- Automatizaciones tipo Zapier dentro del producto.
- Marketplace de plantillas de presupuesto / análisis de precios.
- Forecast financiero con escenarios.
- Diferencias de cambio automatizadas.

---

## 6. Lo que NO entra (nunca, o no en este horizonte)

- **Sueldos y RRHH** (cálculo de jornales, recibos de sueldo formales). Bloqer registra mano de obra como costo, no procesa nóminas legales.
- **Diseño / CAD / BIM**.
- **Contabilidad de partida doble** completa con plan de cuentas tradicional. Bloqer es operativo, alimenta al contador externo.
- **CRM con embudo de ventas** completo. Bloqer gestiona el contacto y el proyecto, no la prospección comercial.
- **Gestión de stock industrial complejo** (lotes, vencimientos químicos, trazabilidad sanitaria).
- **Marketplace abierto a terceros** (proveedores externos vendiendo dentro de Bloqer).

---

## 7. Reglas de scope (cómo decidir qué entra)

Antes de aceptar una nueva funcionalidad:

1. ¿Resuelve un problema **real y recurrente** de una constructora típica?
2. ¿Está conectada con el resto del sistema (no es una isla)?
3. ¿Se puede explicar en 1 párrafo a un constructor sin formación técnica?
4. ¿Tiene impacto trazable en alguna de las **6 dimensiones núcleo**: proyecto, presupuesto, certificación, compras, inventario, tesorería?

Si responde "no" a más de una, **no entra**.

---

## 8. Decisiones de scope abiertas

Las decisiones de scope todavía abiertas viven en [`OPEN_QUESTIONS.md`](./OPEN_QUESTIONS.md).
