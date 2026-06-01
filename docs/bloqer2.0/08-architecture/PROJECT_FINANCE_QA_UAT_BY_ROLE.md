# Project Finance QA/UAT by Role

## 1. Objetivo

Definir una matriz minima de verificacion funcional para finanzas de empresa y finanzas de proyecto, alineada a permisos existentes y modulos habilitados por tenant.

## 2. Alcance

- Navegacion financiera de proyecto.
- Cuentas por cobrar (AR) y cuentas por pagar (AP) con aging.
- Hub de reportes de proyecto.
- Integracion operativa con certificaciones (sin cambiar RBAC base).

## 3. Supuestos

- No se crean permisos nuevos.
- El techo RBAC se mantiene en `can()` + `TenantModuleGate`.
- El portal superadmin gestiona solo habilitacion de modulos por tenant.

## 4. Perfiles y comportamiento esperado

### ADMIN

- Ve y opera AR/AP segun matriz vigente.
- En proyecto, accede a `Tablero de finanzas`, `Flujo de caja`, `CxC`, `CxP`.
- En `CxC`/`CxP` visualiza aging y bloques de transacciones relacionadas.
- En `Reportes del proyecto` ve tarjetas de aging AR/AP, caja, ingresos/gastos y rentabilidad segun modulos habilitados.

### FINANCE

- Puede operar cobranzas/pagos y revisar aging.
- Debe poder navegar de aging a documentos operativos sin friccion.
- Debe ver reportes financieros del proyecto (caja, ingresos/gastos) sin depender de vistas operativas.

### PROJECT_MANAGER

- Ve resumen financiero del proyecto segun permisos de lectura.
- No se exponen acciones de edicion financiera que no le correspondan.
- Puede navegar entre certificaciones y CxC para control de avance financiero.

## 5. Casos de verificacion obligatorios

### Caso A: Tenant con AR+AP+CERTIFICATIONS habilitados

1. Entrar a `proyectos/[id]/cuentas-por-cobrar`.
2. Verificar aging visible + tarjetas resumen + tabla.
3. Verificar links a facturas, cobranzas y certificaciones.
4. Entrar a `proyectos/[id]/cuentas-por-pagar`.
5. Verificar aging visible + links a facturas proveedor, pagos y reporte de caja.

### Caso B: Tenant sin AR o sin AP

1. Deshabilitar modulo AR o AP en plataforma.
2. Confirmar que las tarjetas correspondientes en `proyectos/[id]/reportes` aparecen como no disponibles.
3. Confirmar que no aparecen accesos de navegacion para el modulo deshabilitado.

### Caso C: Usuario sin permiso del area

1. Usuario con acceso a proyecto pero sin permiso AR/AP intenta URL directa de CxC/CxP.
2. Debe redirigir al resumen de proyecto, sin error 500.

### Caso D: Parametros invalidos

1. Probar `?page=abc` o `?page=-10` en CxC/CxP.
2. Debe resolver en pagina 1 sin crash.

## 6. Criterios de aceptacion

- Sin errores de permisos en runtime (FORBIDDEN controlado).
- Sin navegacion rota ni links legacy inconsistentes.
- Misma estetica visual de componentes (`Card`, `Button`, tipografias y colores del sistema).
- Sin duplicar logica financiera en UI (todo via services).

## 7. Decision sobre superadmin

- Cambios de estructura de navegacion/UX financiera no implican cambios obligatorios en superadmin.
- Solo requiere ajuste si se agregan nuevos modulos o se redefine la taxonomia de permisos.
