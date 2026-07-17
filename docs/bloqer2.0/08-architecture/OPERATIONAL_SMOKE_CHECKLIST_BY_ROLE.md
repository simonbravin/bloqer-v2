# Smoke checklist operativo por rol — Bloqer v2 (J-02)

> **Propósito:** guión verificable de capacitación / UAT funcional por rol.  
> **No sustituye** el smoke post-deploy técnico ([`DEPLOYMENT_SMOKE_TEST.md`](./DEPLOYMENT_SMOKE_TEST.md)).  
> **Complementa** UAT de finanzas de proyecto ([`PROJECT_FINANCE_QA_UAT_BY_ROLE.md`](./PROJECT_FINANCE_QA_UAT_BY_ROLE.md)).  
> **Regla:** checklist **manual** en un tenant de prueba. **Prohibido** scripts one-off (`AGENT_GUARDRAILS.md`).

---

## 0. Cómo usar este documento

| Campo | Valor |
|-------|-------|
| **Cuándo** | Tras estabilizar UI (Lotes 1–6) o antes de una sesión de capacitación |
| **Ambiente** | Staging o tenant de prueba (sin reset destructivo de prod) |
| **Prerrequisitos** | Migraciones aplicadas; al menos un proyecto `ACTIVE` con presupuesto `APPROVED`; módulos operativos habilitados (default-on) |
| **Registro** | Anotar rol, usuario, fecha, entorno, PASS/FAIL por ítem |

Cada ítem tiene: **Ruta** · **Acción** · **Criterio de éxito**. Los bloques **Negativo** validan que el rol **no** pueda hacer lo que no le corresponde.

### Roles cubiertos

| Rol | Sección |
|-----|---------|
| `OWNER` / `ADMIN` | §1 |
| `PROJECT_MANAGER` | §2 |
| `PROCUREMENT` | §3 |
| `FINANCE` | §4 |
| `SITE_FOREMAN` | §5 |
| `WAREHOUSE` | §6 |
| `VIEWER` | §7 |
| `SALES` (opcional) | §8 |

Roles de proyecto `PROJECT_VIEWER`: fuera de alcance Fase 1 (portal externo).

---

## 1. OWNER / ADMIN

### 1.1 Configuración y permisos

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| A1 | `/dashboard` | Ingresar con Google | Shell carga; nav de empresa visible |
| A2 | `/configuracion/equipo` | Abrir Equipo | Listado de miembros; CTA Invitar |
| A3 | `/configuracion/permisos` | Abrir matriz | Banner **solo lectura**; módulos fantasma (Contratos, RFIs, etc.) marcados como no disponibles en esta versión |
| A4 | `/configuracion/compras` | Abrir política de compras | Card / form de umbrales y auto-aprobación visibles desde Configuración |
| A5 | `/configuracion/reportes` | Crear o abrir un envío | Copy de **cron diario**; estados de última corrida con hint Omitido ≠ Fallido |
| A6 | `/configuracion/reportes/[id]` | Ver historial + link a emails | Enlace a `/notificaciones/emails?…` funciona |
| A7 | `/notificaciones` (campana) | Abrir inbox | **Sin** ítem “Notificaciones” en sidebar; campana del header con conteo |
| A8 | `/notificaciones/alertas` | Ver card “Última actividad” | Fecha/conteo o vacío explicativo; link a emails de alerta |
| A9 | `/notificaciones/emails` | Filtrar por estado | Leyenda Enviado / Omitido / Fallido comprensible |

### 1.2 Negativos / plataforma

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| AN1 | Usuario empresa (no superadmin) busca link Plataforma | No aparece `/platform` en la UI |
| AN2 | Intentar aprobar **segundo** presupuesto `APPROVED` en el mismo proyecto | Rechazo / conflicto (un solo APPROVED por obra) |

---

## 2. PROJECT_MANAGER

Usar un usuario con rol de proyecto `PROJECT_MANAGER` (y sin roles globales que enmascaren límites, si se quiere validar techos).

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| P1 | `/proyectos` → `/proyectos/[id]` | Abrir obra | Menú del proyecto con secciones Planificación / Operación / Finanzas |
| P2 | Menú Operación | Ver **Recepciones** y **Consumos** | Ítems visibles: `/proyectos/[id]/recepciones`, `/proyectos/[id]/consumos` |
| P3 | `/presupuestos` | Revisar copy de adendas | Habla de adenda operativa **sin** “versión” formal automática |
| P4 | `/libro-obra` | Crear parte → Enviar | Parte en `SUBMITTED` |
| P5 | `/libro-obra/[logId]` | Aprobar (si el usuario puede) | Pasa a `APPROVED`; avance/cronograma coherente |
| P6 | `/certificaciones/[certId]` | Certificación `APPROVED` | CTA **Emitir factura** o panel de factura vinculada |
| P7 | `/solicitudes-compra` → OC | Flujo hasta OC `CONFIRMED` | OC confirmada; link a recepción |
| P8 | `/proyectos/[id]/recepciones` | Abrir listado | Listado carga (no solo URL oculta) |
| P9 | `/proyectos/[id]/consumos` | Abrir listado | Listado de movimientos de consumo; CTA alta |
| P10 | `/ordenes-compra/[poId]` | Seguir a factura / CxP | Cross-links a documentos relacionados visibles |
| P11 | Empty states (p. ej. proyectos sin ítems) | Ver CTA | Empty con título/descripción/acción usable |

### Negativos

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| PN1 | Mutación financiera fuera de su matriz (p. ej. anular pago `CONFIRMED` si no es ADMIN) | Forbidden / sin CTA |

---

## 3. PROCUREMENT

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| C1 | `/directorio` | Abrir / crear proveedor | Contacto `SUPPLIER` usable |
| C2 | `/configuracion/compras` | Leer política | Umbrales PR/OC y texto de auto-aprobación claros |
| C3 | `/proyectos/[id]/ordenes-compra` | Crear o abrir OC | Flujo DRAFT → … → CONFIRMED según política |
| C4 | `/ordenes-compra/[poId]/recepciones/nueva` | Registrar recepción | Recepción confirmable; stock si hay depósito |
| C5 | `/proyectos/[id]/recepciones` | Ver listado | Visible desde menú Operación |
| C6 | `/proyectos/[id]/facturas-proveedor` | Factura ligada a OC | Links OC ↔ factura ↔ CxP |
| C7 | Cert. subcontrato `APPROVED` | CTA factura proveedor | Borrador de factura o enlace al draft |

### Negativos

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| CN1 | Buscar rentabilidad neta / precios de venta | No visibles (o sin acceso) |
| CN2 | Anticipo a proveedor | **Sin** CTA que llame al stub (limitación ADR-013) |

---

## 4. FINANCE

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| F1 | `/finanzas` | Abrir hub | Indicadores y accesos sin botones redundantes bajo el título |
| F2 | `/finanzas/cuentas-por-pagar` | Ver aging + listado | Export **aging** y **listado** CSV/PDF |
| F3 | `/finanzas/facturas-proveedor` | Nueva factura + exportar | Alta abre en diálogo; Exportar CSV/PDF |
| F4 | `/finanzas/transacciones?sourceType=PAYMENT&type=OUTFLOW` | Consultar pagos | Lista movimientos de pago; detalle contextual accesible |
| F5 | `/finanzas/cuentas-por-cobrar` | Aging + empty state | Empty accionable si no hay datos |
| F6 | `/tesoreria` | Subnav | Cuentas / Transferencias / Reportes |
| F7 | Cobranza o pago | Moneda cuenta ≠ documento | Error `CONFLICT` claro (sin FX) |
| F8 | Proyecto: `/cobranzas` o CxC | Registrar cobranza | Movimiento tesorería + saldo AR |

### Negativos / módulos

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| FN1 | Tenant con módulo AR/AP **off** (plataforma) | Rutas financieras bloqueadas / nav oculta |
| FN2 | Ver “conciliación bancaria” como módulo operativo | No disponible en esta versión |

---

## 5. SITE_FOREMAN

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| S1 | `/proyectos/[id]/libro-obra` | Crear parte diario | Clima, cuadrilla, avance WBS, fotos |
| S2 | Enviar parte | `SUBMITTED` | Visible para aprobación del PM |
| S3 | Consultar `/presupuestos` o inventario | Solo lectura según matriz | Sin editar economía congelada |
| S4 | Solicitud de compra (si tiene permiso) | Crear solicitud | **Sin** OC directa si la política lo exige |

### Negativos

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| SN1 | Aprobar parte propio / ajeno sin APPROVE | Sin CTA o forbidden |
| SN2 | `/finanzas` corporativo / pagos | Sin acceso o nav oculta |

---

## 6. WAREHOUSE

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| W1 | `/inventario` | Subnav | Productos, depósitos, movimientos, transferencias, reportes |
| W2 | `/inventario/movimientos` | Alta movimiento | Empty state con CTA si vacío |
| W3 | `/inventario/transferencias` | Transferencia entre depósitos | Flujo completo o mensaje claro |
| W4 | `/proyectos/[id]/inventario` | Stock de obra | Listado carga |
| W5 | `/proyectos/[id]/consumos` | Listado + alta | Listado visible; alta `/consumos/nuevo` |
| W6 | Recepción OC confirmada (con PROCUREMENT) | Stock IN | Saldo actualizado |

### Negativos

| # | Acción | Criterio de éxito |
|---|--------|-------------------|
| WN1 | Ver precios de compra/venta por defecto | No visibles |
| WN2 | Ajuste `ADJUSTMENT` como flujo de UI | No expuesto (reservado) |

---

## 7. VIEWER

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| V1 | `/proyectos`, `/directorio`, reportes lectura | Navegar | Listados visibles |
| V2 | Buscar botones Crear / Editar / Aprobar | — | Ausentes en pantallas clave |
| V3 | URL directa a mutación (p. ej. `/…/nueva`) | Abrir | Redirect / forbidden / notFound |
| V4 | Rentabilidad neta consolidada | Intentar ver | No visible por defecto |

---

## 8. SALES (opcional)

| # | Ruta | Acción | Criterio de éxito |
|---|------|--------|-------------------|
| SA1 | Clientes / facturas / cobranzas de proyecto | Operar AR de venta | Flujo emisión + cobranza |
| SA2 | Costos / rentabilidad | Consultar | Costos no visibles |

---

## 9. Circuitos transversales (cualquier rol con permiso)

Validar al menos una vez por tenant de capacitación (pueden repartirse entre roles):

| Circuito | Pasos mínimos | Criterio |
|----------|---------------|----------|
| **PR → OC → recepción** | Solicitud → OC confirmada → recepción | Stock / cantidades recibidas |
| **Certificación → factura → CxC** | Cert `APPROVED` → emitir factura → ver CxC | Cross-links |
| **Factura proveedor → CxP → pago** | ISSUED → payable → pago | Tesorería OUTFLOW; movimiento visible en Transacciones y detalle contextual del pago |
| **Documentos PLACEHOLDER** | Subir con R2 off (si aplica) | Badge PLACEHOLDER; descarga con mensaje claro |
| **Reportes programados** | OWNER/ADMIN: ejecutar envío | Historial; Omitido si Resend off |
| **Empty states / tablas** | Abrir listados densos | CTA en vacíos; scroll horizontal usable |

---

## 10. Relación con otros docs

| Documento | Uso |
|-----------|-----|
| [`DEPLOYMENT_SMOKE_TEST.md`](./DEPLOYMENT_SMOKE_TEST.md) | Post-deploy técnico (cron, auth, PDF API) |
| [`PROJECT_FINANCE_QA_UAT_BY_ROLE.md`](./PROJECT_FINANCE_QA_UAT_BY_ROLE.md) | Detalle AR/AP proyecto |
| [`../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md`](../GUIA_OPERATIVA_BLOQER_V2_REVISADA.md) | Narrativa operativa (hábitos §18) |
| [`../guides/CHANGELOG_UI_LOTES_1_6.md`](../guides/CHANGELOG_UI_LOTES_1_6.md) | Diff UI para regenerar DOCX más adelante |
| [`../00-product/USER_ROLES.md`](../00-product/USER_ROLES.md) | Definición de roles |
| [`PERMISSIONS_ROUTE_MATRIX.md`](./PERMISSIONS_ROUTE_MATRIX.md) | Rutas × permisos |

---

*J-02 · Lote 7. Actualizar si cambian rutas de nav o techos de rol.*
