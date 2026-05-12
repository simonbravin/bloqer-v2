# Master Data — Bloqer 2.0

> Catálogos parametrizables que **alimentan** los módulos. La empresa los configura al onboarding (o usa defaults) y luego se reutilizan en todo el sistema.

---

## 1. Filosofía

- Hay un **set de defaults** que viene precargado con cada tenant nuevo (catálogo argentino base).
- Cada tenant puede **agregar, editar y archivar** sus propios valores.
- Los catálogos jerárquicos (Categorías) soportan árbol con nivel ilimitado.
- Los valores **referenciados por entidades existentes** no se pueden eliminar — solo archivar.

---

## 2. Catálogos del sistema

### 2.1 Currency (Monedas)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | ISO 4217: `ARS`, `USD`, `EUR`, `BRL`, etc. |
| `name` | string | "Peso Argentino", "Dólar Estadounidense" |
| `symbol` | string | `$`, `US$`, `€` |
| `decimals` | int | 2 default |
| `is_base` | boolean | true solo para ARS |
| `enabled` | boolean | habilitada para uso |

**Defaults precargados:** `ARS` (base, enabled), `USD` (enabled), `EUR` (deshabilitada).

---

### 2.2 Unit (Unidades de medida)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `m2`, `m3`, `kg`, `un`, `gl`, `hr`, `ml`, `dia` |
| `name` | string | "Metro cuadrado" |
| `symbol` | string | "m²" |
| `type` | enum | `LENGTH`, `AREA`, `VOLUME`, `WEIGHT`, `TIME`, `UNIT`, `OTHER` |
| `enabled` | boolean | |

**Defaults precargados:** unidades comunes de construcción (m, m², m³, kg, ton, un, gl, hr, día, jor, etc.).

---

### 2.3 Category (Categorías jerárquicas)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | corto, único por tenant y type |
| `name` | string | nombre legible |
| `parent_id` | uuid? | null si es raíz |
| `type` | enum | `COST`, `REVENUE`, `MOVEMENT`, `PRODUCT`, `WBS_RUBRO` |
| `level` | int | calculado |
| `enabled` | boolean | |

**Tipos:**
- `COST`: para clasificar costos (mano de obra, materiales, servicios, etc.).
- `REVENUE`: para ingresos (certificación, venta directa, otros).
- `MOVEMENT`: categorías de movimientos de tesorería.
- `PRODUCT`: para clasificar productos del inventario.
- `WBS_RUBRO`: rubros típicos de WBS (movimiento de suelos, hormigones, mampostería, instalaciones, etc.).

**Estructura típica precargada (ejemplo, COST):**
```
Mano de Obra
  Albañilería
  Plomería
  Electricidad
Materiales
  Áridos
  Cemento y cales
  Aceros
  Cerámicos
Servicios
  Subcontratos
  Alquiler equipos
Otros
```

---

### 2.4 TaxType (Tipos de impuesto / retención)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `IVA_21`, `IVA_10_5`, `IIBB_BA`, `GANANCIAS`, `SUSS` |
| `name` | string | "IVA 21%" |
| `default_rate` | decimal | 21.0000 |
| `default_base` | enum | `GROSS`, `NET`, `MANUAL` |
| `sign` | enum | `+` percepción/impuesto, `-` retención |
| `enabled` | boolean | |

**Defaults precargados:** IVA 21%, IVA 10.5%, IVA 27%, IIBB CABA, IIBB BA, IIBB Córdoba, Ganancias, SUSS Construcción, IB Tucumán (algunos como "uso opcional").

---

### 2.5 MovementCategory (Categorías de movimiento de tesorería)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `INC_COBRANZA`, `OUT_PAGO_PROVEEDOR`, `OUT_GASTO_GENERAL`, `INT_TRANSFER` |
| `name` | string | "Cobranza de cliente" |
| `type` | enum | `INCOME`, `OUTCOME`, `TRANSFER` |
| `default_account_id` | uuid? | sugerencia |
| `is_system` | boolean | true para las que el sistema usa internamente |
| `enabled` | boolean | |

**Defaults precargados:** Cobranza, Pago a proveedor, Pago a subcontratista, Gasto general, Sueldos, Impuestos, Transferencia interna, Ingreso vario, Egreso vario.

---

### 2.6 DocumentType (Tipos de documento legales)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `OC`, `FAC_A`, `FAC_B`, `FAC_C`, `FAC_E`, `NC_A`, `ND_A`, `RECIBO`, `OP`, `CERT`, `CONTRACT` |
| `name` | string | "Factura A" |
| `requires_legal_number` | boolean | |
| `default_template_id` | uuid? | plantilla de impresión |
| `enabled` | boolean | |

**Defaults precargados:** Factura A/B/C/E, Nota de crédito A/B/C, Nota de débito A/B/C, Recibo, OC, Orden de pago, Certificado, Contrato, Adenda, Change Order, RFI.

---

### 2.7 Account (Cuentas — semilla)

> No es estrictamente master data porque cada cuenta es operativa, pero se precargan algunas estándar.

**Defaults sugeridos al crear tenant:**
- "Caja Pesos" — `CASH`, `ARS`
- "Caja Dólares" — `CASH`, `USD`
- "Banco Nación CC ARS" — `BANK`, `ARS` (placeholder)
- "Banco Nación CA USD" — `BANK`, `USD` (placeholder)

El usuario puede borrar / editar estos placeholders.

---

### 2.8 Warehouse (Depósitos — semilla)

**Default:** un depósito "Central" creado al onboarding. Método de valuación = elección del tenant entre FIFO o promedio móvil.

---

### 2.9 PaymentTerm (Condiciones de pago)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | `CONTADO`, `30D`, `60D`, `90D`, `15D_30D`, `CUSTOM` |
| `name` | string | "30 días fecha factura" |
| `days_offset` | int | 30 |
| `description` | string | |
| `enabled` | boolean | |

**Defaults precargados:** Contado, 7 días, 15 días, 30 días, 60 días, 90 días.

---

### 2.10 Bank (Bancos)

| Campo | Tipo | Notas |
|---|---|---|
| `code` | string | "BNA", "GAL", "BBVA", "ICBC" |
| `name` | string | |
| `enabled` | boolean | |

**Defaults precargados:** lista de bancos argentinos típicos.

---

### 2.11 Province / City (Provincias y ciudades)

| Campo | Tipo |
|---|---|
| `province.code` | string (ISO/AR) |
| `province.name` | string |
| `city.province_id` | FK |
| `city.name` | string |

**Defaults precargados:** 24 provincias argentinas + ciudades capitales. Localidades secundarias se agregan a demanda.

---

### 2.12 ProjectType / ProjectStatus

> Estos son enums fijos del sistema (no editables por tenant).

- `ProjectType`: `PUBLIC`, `PRIVATE`.
- `ProjectStatus`: ver [`STATE_MACHINES.md`](./STATE_MACHINES.md) §2.

---

## 3. Configuración por tenant (parámetros generales)

Algunos parámetros viven en una entidad `TenantSettings` (no master data en sentido estricto, pero relacionado):

| Parámetro | Tipo | Default | Notas |
|---|---|---|---|
| `base_currency` | string | `ARS` | inmutable |
| `default_stock_method` | enum | `MOVING_AVG` | FIFO o MOVING_AVG ([D-007]) |
| `decimal_places_money` | int | 2 | |
| `decimal_places_qty` | int | 4 | para cómputos |
| `decimal_places_fx` | int | 4 | |
| `period_close_enabled` | boolean | true | |
| `numeration_scope` | enum | `COMPANY` | COMPANY / PROJECT / CONFIGURABLE — [Q-002] |
| `po_approval_threshold_ars` | decimal? | null | si null = sin umbral |
| `allow_overcertification_private` | boolean | true | obras privadas (D-004) |
| `allow_self_approval` | boolean | true | |
| `notifications_email_enabled` | boolean | true | depende de [Q-009] |
| `documents_max_size_mb` | int | 25 | [Q-020] |
| `gross_profit_visible_to_pm` | boolean | true | |
| `net_profit_visible_to_pm` | boolean | false | configurable |
| `default_payment_term_id` | uuid? | "30 días" | |
| `time_zone` | string | `America/Argentina/Buenos_Aires` | |
| `language` | string | `es-AR` | |

---

## 4. Reglas globales sobre master data

- **R-MD-001**: códigos son únicos por tenant y por tipo.
- **R-MD-002**: valores referenciados no se borran, solo archivan (`enabled = false`).
- **R-MD-003**: cambios en master data quedan auditados.
- **R-MD-004**: las jerarquías (categorías) no admiten ciclos.
- **R-MD-005**: el sistema viene con **defaults precargados** que el tenant puede editar/desactivar pero **no eliminar** ciertas entradas críticas (IVA 21%, ARS, etc.).
- **R-MD-006**: agregar / editar master data requiere `ADMIN` u `OWNER`.

---

## 5. Quién mantiene cada catálogo

| Catálogo | Mantiene | Cuándo se usa |
|---|---|---|
| Currency | OWNER, ADMIN | habilitar / deshabilitar monedas |
| Unit | OWNER, ADMIN | al crear unidades nuevas |
| Category | OWNER, ADMIN | al ajustar clasificaciones |
| TaxType | OWNER, ADMIN | al cambiar políticas fiscales |
| MovementCategory | OWNER, ADMIN | al ajustar tesorería |
| DocumentType | OWNER, ADMIN | raramente |
| PaymentTerm | OWNER, ADMIN | al definir condiciones |
| Bank | OWNER, ADMIN | al agregar nuevos bancos |
| Province / City | sistema | inmutable salvo agregados |
| TenantSettings | OWNER, ADMIN | configuración inicial |

---

## 6. Importación / Exportación de master data

**Fase 1:**
- Importación CSV de catálogos editables (Categorías, Unidades, TaxTypes).
- Exportación a CSV para backup.

**Fase 2:**
- Templates compartibles (ej. "set de categorías para empresa de pavimento").

---

## 7. Defaults precargados al crear un tenant nuevo

Al onboarding, el sistema **automáticamente** crea:

1. Currencies: ARS (base), USD.
2. Unidades: m, m², m³, kg, ton, un, gl, hr, día, jor.
3. Categories: estructura básica de COST, REVENUE, MOVEMENT, PRODUCT, WBS_RUBRO (ver §2.3).
4. TaxTypes: IVA 21, IVA 10.5, IIBB BA, IIBB CABA, Ganancias, SUSS Construcción.
5. MovementCategories: ver §2.5.
6. DocumentTypes: ver §2.6.
7. PaymentTerms: Contado, 7d, 15d, 30d, 60d, 90d.
8. Banks: lista de 30 bancos argentinos típicos.
9. Provinces y capitales argentinas.
10. 1 Warehouse: "Central".
11. 0 Accounts (las crea el usuario).
12. TenantSettings con defaults de §3.

---

## 8. Casos borde

### 8.1 Cambiar moneda base del tenant

**Política:** no permitido. Si se requiere, requiere proceso de soporte (re-onboarding).

### 8.2 Cambiar método de valuación del tenant

**Política:** permitido si **ningún depósito tiene movimientos**. Si tiene movimientos, requiere proceso especial ([BR-INV-004]).

### 8.3 Eliminar una unidad referenciada

**Política:** no permitido. Solo `enabled = false`.

### 8.4 Cambio de nombre de categoría

**Política:** permitido. La referencia se mantiene por id.

### 8.5 Migrar de categoría jerárquica simple a ramificada

**Política:** permitido editando padres. La auditoría queda.

---

## 9. Validaciones técnicas comunes

- Códigos en mayúsculas y sin espacios (`30D`, no `30 d`).
- Valores numéricos con precisión definida.
- Fechas en formato ISO.
- Booleans estrictos.

---

## 10. Pendientes / a confirmar

- [Q-009]: notificaciones por email habilitadas en Fase 1.
- [Q-018]: método de valuación por depósito o solo por tenant.
- [Q-020]: tipos de archivo permitidos en Documents.
- [Q-024]: roles personalizables (afecta si Roles también es master data).
- [Q-028]: jerarquía completa de categorías de movimiento.
