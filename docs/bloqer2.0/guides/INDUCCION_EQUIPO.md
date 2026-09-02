# Inducción Bloqer — 10 minutos (guía del llamado)

> **Audiencia:** equipo Indari que ya opera en portal (compras, administración, PM, obra).
> **Duración:** 10 minutos de pantallazo + Q&A después.
> **Modo:** vos compartís pantalla en `portal.bloqer.app`. Este documento es **tu libreto**, no un tutorial para leer en voz alta.
> **Fuente:** alineado a la Guía operativa Bloqer v2 (lo que el sistema hace hoy).

---

## 0. Antes de entrar (30 s, vos solo)

Tené abiertas (o listas para abrir) estas pestañas:

1. Inicio / menú **empresa** (`/dashboard`)
2. Una **obra activa** (sidebar de proyecto)
3. Compras → **Tablero de compras**
4. Finanzas → **Transacciones** (nivel empresa)
5. Dentro de la obra: **Facturas proveedor**
6. Pie del menú → **Ayuda** (`/ayuda`)

Si podés, dejá un ejemplo real de ellos: una SC que debió ser OC, y un gasto de obra cargado en empresa.

---

## 1. Apertura — 0:00 a 0:45

**Pantalla:** dashboard / menú empresa.

**Decí esto (casi textual):**

> Bloqer no es un Excel compartido. Es el mismo circuito que usan para comprar, gastar, certificar y pagar, con dos pisos: **empresa** y **obra**. Si cargás en el piso equivocado, el número “cierra” en caja pero **ensucia el costo de la obra** o al revés: la oficina parece más cara de lo que es.

**Mostrá:** el menú izquierdo de empresa (General · Finanzas · Tesorería · Contabilidad · Configuración).

**No te enredes:** no expliques contabilidad, políticas ni reportes programados en este llamado.

---

## 2. Dos pisos — 0:45 a 2:15

**Pantalla:** menú empresa → entrá a **una obra** y mostrá que el menú **cambia**.

| Piso | Para qué | Ejemplos que ellos tocan |
|------|----------|--------------------------|
| **Empresa** (menú azul de siempre) | Datos maestros y plata **sin obra** | Directorio, Tesorería, alquiler, sueldos de oficina, CxP/CxC corporativas |
| **Obra** (menú del proyecto) | Todo lo que **es de esa construcción** | Presupuesto/EDT, cronograma, Materiales, SC/OC, subcontratos, libro de obra, facturas de esa obra |

**Regla de oro (anotala en el chat o en un slide):**

> Si el gasto tiene **partida de presupuesto (EDT)**, se carga **adentro de la obra**.  
> Si es de estructura (oficina, alquiler, sueldo admin, monotributista de la casa), se carga en **Finanzas de empresa**.

**Error que ellos cometen:** gasto de ferretería / flete / jornal de obra cargado en Finanzas → Transacciones. Eso **no imputa EDT**: la obra queda “barata” y la empresa “cara”.

**Mostrá 5 segundos:** Finanzas → Transacciones = caja operativa **sin** partida. Después: obra → Facturas proveedor = **con** partida.

---

## 3. Cómo se “transacciona” plata — 2:15 a 3:30

**Pantalla:** obra → Planificación → **EDT y costos** (aunque sea un vistazo de 20 s).

Tres palabras. Si estas no quedan, el resto no sirve:

| Palabra | Cuándo pasa en Bloqer | Qué NO es |
|---------|------------------------|-----------|
| **Comprometido** | OC **Confirmada** (o subcontrato activo) | Aprobar la OC **no** reserva $ |
| **Devengado** | Factura de proveedor **emitida** (o certificación de subcontrato facturada) | Recibir mercadería **no** abre deuda |
| **Pagado** | Pago desde CxP (o “Emitir y pagar ahora”) | Tesorería se mueve acá, no en la OC |

**Frase para clavar:**

> Aprobar es un OK interno. **Confirmar al proveedor** es cuando Bloqer reserva el dinero en la EDT. Recibir es stock. Facturar es la deuda. Pagar es la caja.

**Pendientes** (globo rojo): es la cola de **acciones** (cotizar, aprobar, confirmar, recibir, facturar). No es “listo para pagar” — eso va por la **campana**.

---

## 4. El tema del día: SC vs OC — 3:30 a 6:15

**Pantalla:** obra → Compras → **Tablero de compras**. Después **Solicitudes** y **Órdenes de compra**.

### Qué es cada cosa

| Documento | Para qué existe | Cuándo usarlo |
|-----------|-----------------|---------------|
| **SC — Solicitud de compra** | Pedido interno: “necesito esto, para esta fecha, en esta partida”. Después se **cotiza** y se elige proveedor. | Hay que **comparar** precios / plazos, o la política de la empresa **obliga** SC (umbral). Atajo: Materiales → **Pedir**. |
| **OC — Orden de compra** | El pedido **al proveedor**. Es el documento que, al **confirmar**, compromete $. | Ya sabés a quién le comprás y a qué precio. Proveedor habitual, reposición, emergencia habilitada, o salís de una SC ya elegida. |

### Lo que les está pasando

Están abriendo **muchas SC** cuando el camino corto es **OC directa** (si Políticas lo permite y no es “alto nivel”).

Cada SC extra = fecha requerida + enviar + cotizar + elegir + recién ahí nace la OC. **Pierden tiempo** y saturan Pendientes.

**Decí:**

> La SC no compra. La SC **pide permiso para comparar**. La OC **compra**. Si el proveedor ya está definido y no hace falta cotizar, no armen una SC “por las dudas”.

### Caminito (mostrá Ayuda → mapa “Compra: si esto, entonces aquello” o el tablero)

1. ¿Política permite OC directa y no es alto nivel? → **Nueva OC**.
2. Si no → SC → cotizar → elegir → OC borrador.
3. Enviar a aprobación → **Aprobar** (aún no $) → **Confirmar al proveedor** (= Comprometido).
4. **Recibir** (stock; no es CxP).
5. **Registrar factura** (= deuda) → **Pagar** desde CxP.

**Tercer camino (no lo mezcles):** paquete de ejecución (albañil, electricista) = **Subcontrato**, no OC de materiales.

---

## 5. Gastos de obra vs gastos de empresa — 6:15 a 8:00

**Pantalla A:** Finanzas → **Transacciones** → Registrar transacción → Gasto / factura.  
**Pantalla B:** Obra → Finanzas del proyecto → **Facturas proveedor** → Nueva → modo **Costo directo**.

| Situación | Dónde | Clase que vas a ver |
|-----------|--------|---------------------|
| Alquiler de oficina, internet, sueldo admin | Empresa → Transacciones o Facturas y gastos | Gasto general (sin EDT) |
| Capataz compró en ferretería para una partida | **Obra** → Facturas proveedor → **Costo directo** + partida EDT | Costo directo de obra |
| Compra con orden | Obra → factura **Contra OC** (trae líneas) | Compra comprometida |
| Subcontratista certifica | Obra → Subcontratos → certificar → factura | Subcontrato |
| Empleado adelantó plata **de la obra** | Obra → factura sin OC, payee = **Empleado**, con EDT | Costo directo de obra |
| Empleado adelantó plata **de la oficina** | Empresa → Transacciones, payee = Empleado, **sin** obra | Gasto general |

**Frase:**

> Si lo vas a mirar en **EDT y costos** de la obra, tenés que haber entrado a **esa obra** para cargarlo. Transacciones de empresa no tiene casillero de partida.

**No hagas** en 10 minutos: GG, conciliación, cierre de mes. Solo nombrá: “eso es otro llamado”.

---

## 6. Cómo se registra el día a día — 8:00 a 9:15

**Pantalla:** **Pendientes** (empresa y, si hay, de la obra).

Recorré el caminito con el dedo, sin cargar nada si no hace falta:

1. **Directorio** — el contacto tiene el rol correcto (Proveedor / Empleado / Subcontratista / Cliente). Si no aparece en “A quién se le paga”, falta el rol.
2. **Obra ACTIVE** + presupuesto **Aprobado** (si no, Materiales y certificaciones no fluyen).
3. Comprar: SC solo si hace falta comparar; si no, **OC**.
4. **Confirmar** → comprometido.
5. **Recibir** → stock / cantidades.
6. **Facturar** → CxP.
7. **Pagar** → caja (fondos insuficientes = Bloqer bloquea).
8. Avance de obra: **Libro de obra** (aprueba el PM) — no es lo mismo que certificar al cliente.

**Ayuda:** pie del menú, ícono `?`. Buscá “comprar material”, “gasto de obra”, “sueldo”. Clic en el mapa para verlo grande.

---

## 7. Cierre — 9:15 a 10:00

Dejá **cuatro reglas** (podés pegarlas en el chat):

1. **Obra o empresa:** ¿tiene EDT? → obra. ¿Es de oficina? → empresa.
2. **SC no es compra.** SC = comparar. OC = comprar. Confirmar = $ reservado.
3. **Recibir ≠ facturar ≠ pagar.** Tres clics distintos, tres impactos distintos.
4. **Pendientes** es tu lista de deberes. Si hay 20 SC abiertas, primero pregunten: ¿esto debía ser OC?

**Cierre:**

> No les pido que memoricen el menú. Les pido que, antes de cargar, se pregunten esas cuatro. Si dudan: Ayuda o avísenme y lo vemos en la ficha concreta, no en abstracto.

Q&A. Si alguien trae un caso, abrilo en portal y clasificá en voz alta: “esto es OC directa” / “esto es costo directo de obra” / “esto es gasto de empresa”.

---

## Hoja de bolsillo (para dejarles o mandar después)

### ¿SC o OC?

- **SC:** no sé el precio final / tengo que cotizar / la política me obliga.
- **OC:** ya sé proveedor y precio (o vengo de una SC elegida).
- **Subcontrato:** alguien **ejecuta un paquete** (no te vende una bolsa de cemento).

### ¿Empresa o obra?

- **Empresa:** no hay partida. Transacciones / Facturas y gastos.
- **Obra:** siempre **partida hoja**. Facturas proveedor de esa obra (contra OC o costo directo).

### ¿Dónde está el $ de la obra?

- **EDT y costos** — comprometido / devengado / pagado por partida.
- **Materiales** — cantidades (faltante → Pedir = SC, no siempre es el atajo correcto si ya hay proveedor).

### Palabras que no hay que mezclar

- Aprobar OC ≠ Comprometer  
- Recibir ≠ Abrir CxP  
- Transacciones (empresa) ≠ Factura de la obra  

---

## Notas para vos (no leer en el llamado)

- Políticas de OC directa / umbral / atajos (autorizar y comprometer, al aprobar confirmar) viven en Configuración → **Políticas**. Si Indari tiene SC obligatoria en todo, el “usen OC” hay que contrastarlo con lo que tienen prendido. Antes del llamado: mirá Políticas 30 s.
- Si el umbral los obliga a SC, no los retés: cambiá el mensaje a “cuando la política lo permite, no armen SC de más”.
- No prometas valuación de stock FIFO, retenciones automáticas ni cobro inline en factura de obra: no están.
- Guía larga: `docs/bloqer2.0/GUIA_OPERATIVA_BLOQER_V2.md` y `/ayuda`.
- Regenerar este Word: `cd docs/bloqer2.0/guides && node build_induccion.js`.
