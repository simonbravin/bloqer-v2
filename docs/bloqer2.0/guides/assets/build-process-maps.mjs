/**
 * Generates branded process-map HTML (same poster aesthetic).
 * Run: node build-process-maps.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function card(n, title, who, body, items, state) {
  const lis = items.map((i) => `<li>${i}</li>`).join("");
  return `<article class="card">
          <div class="card-top">
            <h3><span class="n">${n}</span>${title}</h3>
            <span class="who">${who}</span>
          </div>
          <p>${body}</p>
          <ul>${lis}</ul>
          <span class="state">${state}</span>
        </article>`;
}

function wrap(map, inner) {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="utf-8" />
  <title>Bloqer — ${map.title}</title>
  <link rel="stylesheet" href="../mapa-poster.css" />
</head>
<body>
  <div class="poster">
    <header>
      <img src="../bloqer-logo.png" alt="Bloqer" />
      <div class="header-copy">
        <p>${map.kicker}</p>
        <h1>${map.title}</h1>
        <span>${map.subtitle}</span>
      </div>
    </header>
    <div class="body">
      <div class="lede">
        <p>${map.lede}</p>
        <div class="legend">
          <span class="chip info">Camino feliz</span>
          <span class="chip warn">Vuelve atrás</span>
          <span class="chip block">Queda trabado</span>
          <span class="chip ok">Impacta $ / stock</span>
        </div>
      </div>
      ${inner}
    </div>
    <footer>
      <span>Bloqer · ${map.title} · Guía operativa ${map.guideRef}</span>
      <span>${map.footerRight}</span>
    </footer>
  </div>
</body>
</html>
`;
}

const maps = [
  {
    file: "mapa-puesta-en-marcha",
    kicker: "Nivel empresa · guía para usuarios",
    title: "Puesta en marcha",
    subtitle: "Dejar la empresa lista y abrir la primera obra",
    guideRef: "§0.1 · §1 · §3 · §4 · §5 · §15.0",
    footerRight: "Directorio · Tesorería · Contabilidad · Proyectos",
    lede: "Antes de operar una obra hay que cargar <strong>maestros de empresa</strong>. Sin cliente no se crea el proyecto. Sin cuentas de tesorería no se cobra ni se paga. Sin plantilla contable los asientos no tienen plan.",
    html: wrap => wrap(`
      <p class="section-label">1 · Empresa (una vez)</p>
      <div class="row cols-4">
        ${card(1, "Directorio", "Admin", "Cargá contactos con el <strong>rol correcto</strong>. Un contacto puede tener varios roles.", ["Cliente (obligatorio para crear obra)", "Proveedor, empleado, subcontratista", "Activo: si no, no sale en los selectores"], "Listo para usar")}
        ${card(2, "Equipo y permisos", "OWNER / ADMIN", "Invitá usuarios y revisá qué ve cada rol. La autorización también corre en el backend.", ["Configuración → Equipo → Invitar", "Módulos habilitados por empresa", "Company tools ≠ tools de obra"], "Usuarios activos")}
        ${card(3, "Tesorería", "Tesorería", "Alta de cuentas caja/banco. Sin esto se bloquean cobros y pagos.", ["Tesorería → Cuentas", "Moneda de cada cuenta", "Saldo inicial si aplica"], "Cuentas listas")}
        ${card(4, "Contabilidad", "Contabilidad", "Si el plan está vacío: <strong>Aplicar plantilla AR</strong>. Es una vez por empresa.", ["Contabilidad → Cuentas", "Revisar Reglas Debe/Haber", "No sustituye AFIP"], "Plan + reglas")}
      </div>
      <p class="section-label">2 · Primera obra</p>
      <div class="row cols-3">
        ${card(5, "Crear proyecto", "OWNER / PM", "Proyectos → Nuevo. Elegí el <strong>Cliente</strong> del Directorio.", ["Tipo Privado / Público", "Queda en Borrador", "Código y nombre de obra"], "Estado: Borrador")}
        ${card(6, "Activar obra", "OWNER / PM", "En el resumen: <strong>Activar obra</strong>. Sin esto la operación diaria queda limitada.", ["Pasa a ACTIVE", "Ahí aparecen menús de obra", "Asigná equipo de avisos si hace falta"], "Estado: Activa")}
        ${card(7, "Presupuesto", "PM", "Planificación → Presupuesto: EDT + APU → enviar → <strong>Aprobar</strong>.", ["Habilita certificaciones y Materiales", "Un solo APPROVED por obra", "Después: cronograma e importar desde presupuesto"], "Baseline listo")}
      </div>
      <div class="alt">
        <strong>Orden del día a día</strong>
        <p>Recién con obra activa y presupuesto aprobado: libro de obra, SC/OC, subcontratos, certificar, cobrar y pagar. El control de $ por partida está en <strong>EDT y costos</strong>.</p>
      </div>
      <p class="section-label">Si falta un maestro o se traba</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Proyecto en Borrador: se puede completar datos y activar después.</li>
            <li>Presupuesto devuelto: corregir EDT/APU y reenviar a revisión.</li>
            <li>Contacto sin el rol: abrí la ficha y asignalo; no dupliques el contacto.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Sin Cliente activo no se crea la obra.</li>
            <li>Sin cuenta de tesorería no hay cobro ni pago.</li>
            <li>Sin presupuesto APPROVED/CLOSED no se certifica con normalidad ni corre Materiales MAT.</li>
            <li>Módulo apagado o sin permiso: el menú ni aparece.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-pago-corporativo",
    kicker: "Nivel empresa · guía para usuarios",
    title: "Pagar desde la empresa",
    subtitle: "Sueldo, reintegro o gasto: factura → CxP → caja",
    guideRef: "§12.2 · §12.2.1 · §12.2.2",
    footerRight: "Finanzas → Transacciones · Facturas y gastos · CxP",
    lede: "Bloqer <strong>no liquida nómina</strong>. Un sueldo, un reintegro o un gasto de oficina se registran como <strong>factura/gasto</strong> ligado a un contacto (Empleado o Proveedor). Siempre existe la cadena Factura → CxP → Pago, aunque se pague en el mismo momento.",
    html: wrap => wrap(`
      <p class="section-label">1 · Elegir el camino</p>
      <div class="row cols-3">
        ${card(1, "Sueldo", "Admin / Finanzas", "Registro de costo, no liquidación de haberes.", ["Payee = Empleado del Directorio", "Transacciones → Gasto / factura", "No uses Solo caja (eso es ingreso)"], "Gasto mapeado al empleado")}
        ${card(2, "Reintegro", "Admin / Finanzas", "El empleado adelantó plata y la empresa se la devuelve.", ["Payee = empleado, no el comercio", "Adjunto del ticket", "Si es monotributista con factura C: rol Proveedor"], "Mismo circuito AP")}
        ${card(3, "Gasto / factura", "Admin / Finanzas", "Alquiler, servicios, proveedor de oficina. Sin obra.", ["Facturas y gastos o Transacciones", "Clase: Gasto general", "A quién se le paga = Proveedor o Empleado"], "Borrador o pago al emitir")}
      </div>
      <p class="section-label">2 · Circuito común</p>
      <div class="row cols-4">
        ${card(4, "Cargar", "Admin", "Líneas, fechas y adjunto. Crear factura deja <strong>borrador</strong>.", ["A quién se le paga (activo + rol)", "Desc. % opcional antes de IVA", "Sin proyecto = corporativo"], "Factura borrador")}
        ${card(5, "Emitir", "Admin / Finanzas", "<strong>Emitir</strong> crea la CxP y el asiento DRAFT.", ["Devengado", "Ya se puede pagar", "Opción: Emitir y pagar ahora"], "Factura emitida + CxP")}
        ${card(6, "Pagar", "Tesorería", "CxP → Registrar pago, o el checkbox al emitir.", ["Cuenta de tesorería + fecha", "Método y referencia", "Default = saldo pendiente"], "Pagado + egreso")}
        ${card(7, "Contabilizar", "Contabilidad", "El asiento nace en borrador. Hay que <strong>Contabilizar</strong> para los libros.", ["Hub Contabilidad → Borradores", "Nunca se auto-posta", "Reportes solo ven POSTED"], "Asiento POSTED")}
      </div>
      <p class="section-label">Qué cambia en cada hito</p>
      <div class="impact cols-4">
        <div class="i1"><b>Borrador</b><span>Todavía no hay CxP ni caja.</span></div>
        <div class="i2"><b>Emitida</b><span>Devengado + cuenta por pagar.</span></div>
        <div class="i3"><b>Pago</b><span>Pagado + egreso de tesorería.</span></div>
        <div class="i4"><b>Contabilizar</b><span>Entra a libros gerenciales.</span></div>
      </div>
      <p class="section-label">Si no se puede pagar</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Factura en borrador: se edita. Una vez emitida, se anula (no se edita).</li>
            <li>Contacto que no aparece: asignale rol Proveedor o Empleado y que esté activo.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Fondos insuficientes en la cuenta: Bloqer bloquea Emitir y pagar ahora / el pago.</li>
            <li>Periodo contable cerrado en esa fecha.</li>
            <li>Movimiento ya conciliado: hay que desemparejar antes de cancelar el pago.</li>
            <li>No uses Solo caja para “pagar” un sueldo o reintegro (eso es ingreso).</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-tesoreria-conciliacion",
    kicker: "Nivel empresa · guía para usuarios",
    title: "Tesorería y conciliación",
    subtitle: "Del movimiento de caja a cuadrar el extracto",
    guideRef: "§4 · §4.2 · §4.3",
    footerRight: "Tesorería → Cuentas · Movimientos · Conciliación",
    lede: "Los cobros y pagos ya generan movimientos. La <strong>conciliación</strong> empareja el extracto del banco con lo que Bloqer tiene en la cuenta. No reemplaza el pago: solo cuadra.",
    html: wrap => wrap(`
      <p class="section-label">1 · Caja del día a día</p>
      <div class="row cols-4">
        ${card(1, "Cuentas", "Tesorería", "Alta de caja o banco. Cada una tiene moneda.", ["Tesorería → Cuentas", "Sin cuenta no hay cobro/pago", "Detalle muestra el ledger"], "Cuentas activas")}
        ${card(2, "Movimientos", "Tesorería", "Ingresos, egresos, transferencias y ajustes.", ["Cobro / pago confirman caja", "Transferir entre cuentas", "Ajuste manual con motivo"], "Confirmado")}
        ${card(3, "Flujo de caja", "Finanzas", "Vista de proyección y movimientos.", ["Tesorería → Flujo de caja", "No es el extracto del banco", "Sirve para ver holgura"], "Consulta")}
        ${card(4, "Ajuste", "Tesorería", "Diferencias que no son cobro/pago (cargo bancario, redondeo).", ["Detalle de cuenta → Ajuste manual", "Monto, sentido y motivo", "Genera ADJUSTMENT confirmado"], "Impacta saldo")}
      </div>
      <p class="section-label">2 · Conciliar el banco</p>
      <div class="row cols-4">
        ${card(5, "Nueva sesión", "Tesorería", "Tesorería → Conciliación → Nueva.", ["Elegí cuenta y rango", "Saldos inicial/final del extracto", "Una sesión abierta por cuenta"], "Borrador")}
        ${card(6, "Cargar extracto", "Tesorería", "Importar CSV, OFX/QFX o líneas a mano.", ["Iniciar si está en borrador", "Workspace de dos columnas", "Extracto vs movimientos Bloqer"], "En progreso")}
        ${card(7, "Emparejar", "Tesorería", "Línea de extracto + movimiento → Emparejar.", ["El movimiento pasa a Conciliado", "Si falta el movimiento: Crear desde la línea", "El resumen tiene que cuadrar"], "Matches")}
        ${card(8, "Cerrar", "Tesorería", "Cuando saldo extracto = saldo sistema.", ["Cerrar conciliación", "Reabrir con motivo si hay que corregir", "Los matches se conservan"], "Cerrada")}
      </div>
      <p class="section-label">Qué queda registrado</p>
      <div class="impact cols-3">
        <div class="i1"><b>Movimiento</b><span>Cambia el saldo de la cuenta.</span></div>
        <div class="i3"><b>Conciliado</b><span>Cuadró con el banco. Cancelar el pago se bloquea.</span></div>
        <div class="i5"><b>Sesión cerrada</b><span>Matches congelados hasta reabrir.</span></div>
      </div>
      <p class="section-label">Si no cierra o se traba</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Reabrir sesión (motivo obligatorio) para desemparejar o corregir.</li>
            <li>Ajuste manual si la diferencia no viene de un cobro/pago.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Cancelar un pago/cobranza ya Conciliado: primero desemparejá.</li>
            <li>Dos sesiones abiertas sobre la misma cuenta: no se permite.</li>
            <li>Cerrar el mes contable antes de terminar la conciliación complica las correcciones.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-cerrar-el-mes",
    kicker: "Nivel empresa · guía para usuarios",
    title: "Cerrar el mes",
    subtitle: "Contabilizar → conciliar → cerrar el período",
    guideRef: "§15.2 · §15.3",
    footerRight: "Contabilidad → Asientos · Cierres",
    lede: "El cierre mensual <strong>congela tesorería y asientos</strong> de ese mes. No es el cierre de gastos generales ni un cierre de ejercicio AFIP. Solo OWNER/ADMIN. El asiento nace en borrador: <strong>apareció ≠ está en los libros</strong>.",
    html: wrap => wrap(`
      <p class="section-label">1 · Orden recomendado del mes</p>
      <div class="row cols-4">
        ${card(1, "Terminar operación", "Finanzas / PM", "Cerrar cobros, pagos, facturas y transferencias del mes.", ["Fechas dentro del mes", "Emitir lo que falte", "No dejes CxP colgadas sin registrar"], "Operación lista")}
        ${card(2, "Contabilizar", "Contabilidad", "Hub Contabilidad → Borradores → <strong>Contabilizar</strong>.", ["Nunca se auto-posta", "Origen operativo: montos bloqueados", "Revertir si hay que corregir un POSTED"], "Asientos POSTED")}
        ${card(3, "Conciliar banco", "Tesorería", "Cuadrar extracto vs movimientos del mes (§4.2).", ["Cerrar la sesión de conciliación", "Desemparejar antes de anular pagos", "Si falta un movimiento: crearlo desde el extracto"], "Banco cuadrado")}
        ${card(4, "Cerrar período", "OWNER / ADMIN", "Contabilidad → Cierres → <strong>Cerrar</strong> el mes.", ["Confirmar en el diálogo", "Pasa a Cerrado", "Cualquier mutación de esa fecha → PERIOD_CLOSED"], "Mes cerrado")}
      </div>
      <div class="alt">
        <strong>Reabrir</strong>
        <p>Si hay que corregir: <strong>Reabrir</strong> con <strong>motivo obligatorio</strong> (queda auditado). El mes vuelve a Abierto. No confundir con el cierre de GG en Finanzas → Gastos generales.</p>
      </div>
      <p class="section-label">Qué bloquea el cierre</p>
      <div class="impact cols-4">
        <div class="i1"><b>Tesorería</b><span>No se crean, anulan ni confirman movimientos de ese mes.</span></div>
        <div class="i2"><b>Asientos</b><span>No se posta ni se revierte con fecha en el mes cerrado.</span></div>
        <div class="i3"><b>Compras con impacto</b><span>Confirmar OC, recepción o factura de esa fecha se bloquea.</span></div>
        <div class="i5"><b>Libros</b><span>Los reportes siguen leyendo solo POSTED ya contabilizados.</span></div>
      </div>
      <p class="section-label">Si no se puede cerrar o ya cerró mal</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Reabrir con motivo, corregir, contabilizar / conciliar, y volver a cerrar.</li>
            <li>Revertir un asiento POSTED crea la reversa; no borra historia.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Cerrar antes de postear: los reportes del mes quedan cortos y después no podés postear esa fecha.</li>
            <li>Cerrar antes de conciliar: no vas a poder crear el movimiento que falta.</li>
            <li>Anular un documento origen con asiento POSTED sin reverso: bloqueado.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-presupuesto-edt",
    kicker: "Nivel proyecto · guía para usuarios",
    title: "Presupuesto y EDT",
    subtitle: "Armar, enviar, aprobar — y qué pasa si lo devuelven",
    guideRef: "§6 · §6.2 · §6.3",
    footerRight: "Planificación → Presupuesto · EDT y costos",
    lede: "La EDT son <strong>partidas hoja</strong> certificables. Los hierros y jornales van en el <strong>APU</strong>, no como hijos EDT. Sin presupuesto <strong>Aprobado o Cerrado</strong> no se certifica con normalidad ni corre el tablero Materiales.",
    html: wrap => wrap(`
      <p class="section-label">1 · Armar</p>
      <div class="row cols-4">
        ${card(1, "Crear presupuesto", "PM", "Planificación → Presupuesto, con la obra activa.", ["Moneda y % económicos", "Un presupuesto en curso por obra", "Borrador = se puede editar todo"], "Estado: Borrador")}
        ${card(2, "Cargar EDT", "PM", "Capítulos y partidas hoja. La hoja es lo que se certifica y se imputa.", ["No uses hijos EDT para insumos", "Código y descripción claros", "GG de obra = partida, no línea suelta"], "Estructura")}
        ${card(3, "Completar APU", "PM", "En cada partida: materiales, MO, equipos, SUB, otros.", ["APU requerido para aprobar", "Insumos × rendimiento", "Venta / costo según el formulario"], "Precios unitarios")}
        ${card(4, "Enviar a revisión", "PM", "<strong>Enviar a revisión</strong> bloquea la economía.", ["Pasa a En revisión", "Ya no se edita la plata", "Aprobador lo ve en Pendientes"], "En revisión")}
      </div>
      <p class="section-label">2 · Autorizar</p>
      <div class="row cols-3">
        ${card(5, "Aprobar", "OWNER / ADMIN", "<strong>Aprobar presupuesto</strong> congela y habilita la obra.", ["Un solo APPROVED a la vez", "Habilita certificaciones y Materiales", "Baseline de EDT y costos"], "Aprobado")}
        ${card(6, "Devolver", "Aprobador", "Si no cierra: <strong>Devolver</strong> → correcciones → reenviar.", ["Vuelve a Devuelto para cambios", "Hay que reenviar a revisión", "No se aprueba a medias"], "Otra vez edición")}
        ${card(7, "Cerrar / adenda", "OWNER", "Cerrar = base contractual de presentación. Cambio contractual hoy = <strong>Crear adenda / fase</strong>.", ["CLOSED no se edita por la excepción de políticas", "Adenda: nuevo presupuesto vinculado al padre", "No hay entidad formal de contrato aún"], "Cerrado o nueva fase")}
      </div>
      <div class="alt">
        <strong>Excepción OWNER/ADMIN</strong>
        <p>Para retocar un Aprobado: Políticas → Presupuestos (organización + obra). Al terminar, <strong>Congelar</strong>. Un Cerrado no entra: ahí se usa adenda.</p>
      </div>
      <p class="section-label">Si no se aprueba o se arma mal</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Devolver a cambios: se corrige EDT/APU y se reenvía.</li>
            <li>Insumos mal cargados como hijos EDT: pasarlos al APU de la partida hoja.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Sin APU completo no se aprueba.</li>
            <li>Sin APPROVED/CLOSED no hay certificación al cliente ni Materiales MAT.</li>
            <li>Dos presupuestos Aprobados a la vez: no se permite.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-subcontrato",
    kicker: "Nivel proyecto · guía para usuarios",
    title: "Subcontrato hasta el pago",
    subtitle: "Paquete de ejecución: certificar → factura → CxP → pagar",
    guideRef: "§10 · §12.2",
    footerRight: "Finanzas del proyecto → Subcontratos · Facturas proveedor · CxP",
    lede: "Un subcontrato <strong>no es una OC</strong>. El albañil o el electricista van por este circuito. No se paga eligiendo al subcontratista en un gasto genérico ni creando una orden de compra.",
    html: wrap => wrap(`
      <p class="section-label">1 · Contratar</p>
      <div class="row cols-3">
        ${card(1, "Alta en Directorio", "Admin", "Contacto con rol <strong>Subcontratista</strong> (activo).", ["No uses rol Proveedor si es paquete de ejecución", "Se busca por razón social o fantasía", "Puede tener otro rol además"], "Contacto listo")}
        ${card(2, "Crear subcontrato", "PM / Compras", "Finanzas del proyecto → Subcontratos → Nuevo.", ["Alcance e imputación a partidas", "Categoría SUB en el APU cuando corresponda", "No genera comprometido de OC"], "Subcontrato activo")}
        ${card(3, "Certificación del período", "PM", "Nueva certificación de subcontrato (mes / avance).", ["Borrador editable", "Montos / partidas del período", "Luego Emitir"], "Cert. borrador")}
      </div>
      <p class="section-label">2 · Autorizar, facturar y pagar</p>
      <div class="row cols-4">
        ${card(4, "Emitir", "PM", "Pasa a Emitida e inmutable.", ["Ya no se edita esa versión", "El aprobador la revisa", "Se puede anular / rechazar según reglas"], "Emitida")}
        ${card(5, "Aprobar o rechazar", "Aprobador", "<strong>Aprobar</strong> habilita la factura. Rechazo es terminal: nueva versión.", ["APPROVED genera CTA a factura borrador", "Payee = el subcontratista", "REJECTED no crea CxP"], "Aprobada · o rechazada")}
        ${card(6, "Emitir factura", "Admin / Finanzas", "Revisar y emitir la factura de proveedor.", ["Crea CxP + asiento DRAFT", "No cambies a quién se le paga", "Clase: Subcontrato"], "Factura + CxP")}
        ${card(7, "Pagar", "Tesorería", "CxP → Registrar pago (o Emitir y pagar ahora).", ["Cuenta de tesorería", "Sin fondos: bloquea", "Cierra el período certificado"], "Pagado")}
      </div>
      <p class="section-label">Qué cambia</p>
      <div class="impact cols-4">
        <div class="i1"><b>Aprobar cert.</b><span>Avance del paquete. Todavía no hay CxP.</span></div>
        <div class="i2"><b>Factura emitida</b><span>Devengado + cuenta por pagar.</span></div>
        <div class="i3"><b>Pago</b><span>Pagado + egreso. Actualiza settlement del subcontrato.</span></div>
        <div class="i5"><b>No es OC</b><span>No uses compras ni gasto genérico para pagarlo.</span></div>
      </div>
      <p class="section-label">Si no se autoriza</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Certificación en borrador: se edita. Emitida: anular o nueva versión si fue rechazada.</li>
            <li>Factura en borrador: se revisa y se emite. No se paga el subcontrato desde OC.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Sin Aprobar no hay factura ni CxP.</li>
            <li>Rechazo terminal: no “des-rechazás”; nueva certificación que reemplaza.</li>
            <li>Periodo cerrado o sin fondos: mismo bloqueo que cualquier AP.</li>
            <li>Retenciones y anticipos de subcontrato no están modelados como entidad.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-certificar-cobrar",
    kicker: "Nivel proyecto · guía para usuarios",
    title: "Certificar, facturar y cobrar",
    subtitle: "Avance al cliente → factura de venta → CxC → cobranza",
    guideRef: "§11 · §12.1",
    footerRight: "Operación → Certificaciones · Facturas emitidas · CxC",
    lede: "Aprobar la certificación <strong>no cobra</strong> y <strong>no crea la factura sola</strong>. Solo registra avance certificado. La plata entra cuando emitís la factura de venta y registrás la <strong>cobranza</strong> en CxC.",
    html: wrap => wrap(`
      <p class="section-label">1 · Certificar al cliente</p>
      <div class="row cols-4">
        ${card(1, "Precondición", "PM", "Presupuesto <strong>Aprobado o Cerrado</strong>.", ["Sin baseline no se certifica con normalidad", "Partidas hoja de la EDT", "Pública vs Privada cambia el techo"], "Presupuesto listo")}
        ${card(2, "Nueva certificación", "PM", "Operación → Certificaciones. Período desde / hasta.", ["Δ% físico y/o $ económico por partida", "Pública: no superar 100% acumulado", "Privada: puede superar con nota"], "Borrador")}
        ${card(3, "Emitir", "PM", "<strong>Emitir</strong> la deja inmutable (ISSUED).", ["Ya no se edita", "El mandante todavía no aprobó", "No mueve caja"], "Emitida")}
        ${card(4, "Aprobar o rechazar", "PM / Admin", "Según respuesta del cliente.", ["Aprobar = avance certificado", "Rechazar = no se factura esta versión", "Aprobado ≠ cobrado"], "Aprobada · o rechazada")}
      </div>
      <p class="section-label">2 · Facturar y cobrar</p>
      <div class="row cols-3">
        ${card(5, "Emitir factura", "Admin / Finanzas", "En la certificación Aprobada: <strong>Emitir factura</strong>.", ["Es manual: aprobar no la crea", "Genera cuenta por cobrar", "Facturas emitidas quedan inmutables"], "Factura + CxC")}
        ${card(6, "Cobrar", "Tesorería / Finanzas", "CxC del proyecto → <strong>Cobrar</strong>. No hay Cobrar ahora en el alta de factura de obra.", ["Cuenta de tesorería + fecha", "Aviso Listo para cobrar (campana)", "Solo la cobranza confirmada acredita banco"], "Ingreso de caja")}
        ${card(7, "Contabilizar", "Contabilidad", "Factura y cobranza generan asientos DRAFT.", ["Contabilizar para los libros", "Clase: Venta de obra / certificación", "Anticipo / venta rápida es otro atajo"], "POSTED")}
      </div>
      <p class="section-label">Qué cambia en cada hito</p>
      <div class="impact cols-4">
        <div class="i1"><b>Cert. aprobada</b><span>Avance certificado. No hay plata en banco.</span></div>
        <div class="i2"><b>Factura emitida</b><span>Abre la CxC. Todavía no cobraste.</span></div>
        <div class="i3"><b>Cobranza</b><span>INFLOW en tesorería. Cierra (o parcial) la CxC.</span></div>
        <div class="i5"><b>Anticipo</b><span>Atajo: factura + CxC (+ cobro opcional) en un paso.</span></div>
      </div>
      <p class="section-label">Si el cliente no aprueba o no se cobra</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Rechazo del mandante: esa certificación no se factura; se corrige en una nueva.</li>
            <li>Factura de venta emitida: solo se anula (no se edita).</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Obra pública: Bloqer bloquea si el acumulado supera 100%.</li>
            <li>Sin presupuesto aprobado/cerrado no arranca el circuito.</li>
            <li>Aprobar la certificación no genera CxC: hay que Emitir factura.</li>
            <li>Periodo cerrado o cuenta sin usar: la cobranza se bloquea igual que cualquier tesorería.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-cargar-edt-apu",
    kicker: "Nivel proyecto · guía para usuarios",
    title: "Cargar EDT y APU",
    subtitle: "Excel o a mano, reordenar partidas y armar el análisis de precio",
    guideRef: "§6.0 · §6.1 · §6.1a · §6.1b",
    footerRight: "Planificación → Presupuesto · Estructura de trabajo (EDT)",
    lede: "La EDT son <strong>capítulos y partidas hoja</strong>. Hierros, jornales y equipos van en el <strong>APU</strong>, no como hijos del árbol. El presupuesto tiene que estar en <strong>Borrador</strong> para importar, agregar o reordenar. Unidad e importes <strong>no</strong> viajan en el Excel: se cargan después en la partida / APU.",
    html: wrap => wrap(`
      <p class="section-label">1 · Crear el presupuesto y la estructura</p>
      <div class="row cols-4">
        ${card(1, "Nuevo presupuesto", "PM", "Planificación → Presupuesto → <strong>Nuevo presupuesto</strong>.", ["Nombre, moneda y % económicos", "Opcional: precarga / Importar EDT en el alta", "Queda en Borrador y abre el detalle"], "Estado: Borrador")}
        ${card(2, "Importar EDT", "PM", "En el detalle: <strong>Importar EDT</strong> → diálogo <strong>Importar estructura EDT</strong>.", ["CSV o Excel (.xlsx)", "Columna A = numeración (ARQ 1 / 1.1)", "Columna B = nombre. Sin unidades ni $", "Multi-rubro: ARQ, EST… → ARQ.1.1.1"], "Vista previa + Importar")}
        ${card(3, "Cargar a mano", "PM", "Toolbar: <strong>Agregar tarea</strong>. En cada nodo: menú → <strong>Agregar ítem</strong>.", ["Capítulo (GROUP) vs partida hoja (ITEM)", "En la hoja: unidad + cantidad → Guardar", "Código único por presupuesto"], "Árbol editable")}
        ${card(4, "Reordenar", "PM", "Menú del nodo: <strong>Mover arriba</strong> / <strong>Mover abajo</strong>.", ["Solo hermanos del mismo padre", "No hay sangrar en EDT (el código marca el nivel)", "Eliminar borra el nodo si no está usado"], "Orden del cómputo")}
      </div>
      <div class="alt">
        <strong>Reemplazar al importar</strong>
        <p>Si ya hay EDT, el diálogo ofrece <strong>Reemplazar toda la estructura EDT existente (no se puede deshacer)</strong>. Sin ese check, se agrega sobre lo que hay. Errores de fila se listan antes de confirmar.</p>
      </div>
      <p class="section-label">2 · Completar el APU de cada partida hoja</p>
      <div class="row cols-4">
        ${card(5, "Abrir la partida", "PM", "Click en la hoja → <strong>APU — Análisis de precio unitario</strong>.", ["El modal es solo costo (D-058)", "PU y venta se editan en la tabla EDT", "Chevron: filas APU·MAT de solo lectura"], "Partida abierta")}
        ${card(6, "Líneas de insumo", "PM", "Materiales / MO / Equipos / SUB / Otros.", ["Descripción, unidad, cant., precio", "Por unidad o Total partida (default)", "Global (gl) = importe sin compra: no genera necesidad en Materiales"], "Costo directo")}
        ${card(7, "Guardar", "PM", "<strong>Guardar cambios</strong> en el APU. Después <strong>Guardar</strong> la partida si cambiaste unidad/cantidad.", ["APU requerido para aprobar el presupuesto", "Click en una fila detalle reabre el APU", "Esas filas no se certifican ni se compran"], "APU guardado")}
        ${card(8, "Anti-patrón", "PM", "No crees hijos EDT para hierros o cuadrillas.", ["Insumo ≠ partida certificable", "Subdividir un ITEM convierte al padre en GROUP", "Sirve para partir alcance, no para el BOM"], "Insumos solo en APU")}
      </div>
      <p class="section-label">Qué queda listo</p>
      <div class="impact cols-4">
        <div class="i1"><b>Capítulo</b><span>Solo agrupa. Sin unidad operativa.</span></div>
        <div class="i2"><b>Partida hoja</b><span>Se certifica, se compra y se imputa.</span></div>
        <div class="i3"><b>APU</b><span>Compone el costo. Alimenta Materiales si hay MAT.</span></div>
        <div class="i5"><b>Excel</b><span>Solo estructura (código + nombre). El $ se carga acá.</span></div>
      </div>
      <p class="section-label">Si el archivo no entra o se arma mal</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Errores en la vista previa: corregí el Excel (fila / campo) y volvé a subir.</li>
            <li>Presupuesto en revisión o aprobado: no se importa ni se reordena. Hay que devolver o usar la excepción / adenda.</li>
            <li>Insumos mal creados como hijos EDT: pasalos al APU de la partida hoja.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado</h2>
          <ul>
            <li>Reemplazar EDT existente no se deshace.</li>
            <li>Profundidad máxima: 3 niveles (o 4 si es multi-rubro). Más segmentos = error de importación.</li>
            <li>Sin APU no se aprueba el presupuesto.</li>
            <li>No se borran partidas ya usadas en certificaciones, OC o cronograma.</li>
          </ul>
        </div>
      </div>`),
  },
  {
    file: "mapa-armar-cronograma",
    kicker: "Nivel proyecto · guía para usuarios",
    title: "Armar el cronograma",
    subtitle: "Importar la EDT, fechas, dependencias, hitos y reordenar",
    guideRef: "§7.0 · §7.1",
    footerRight: "Planificación → Cronograma · Gantt / Tabla / + Tarea / hito",
    lede: "El cronograma no nace vacío: lo habitual es <strong>Importar desde presupuesto</strong> para que las tareas queden alineadas a la EDT. Las fechas se editan en <strong>hojas</strong>, no en contenedores. Las dependencias son solo <strong>Finish-to-Start (FS)</strong>: avisan, no bloquean.",
    html: wrap => wrap(`
      <p class="section-label">1 · Traer la EDT y acomodar el árbol</p>
      <div class="row cols-4">
        ${card(1, "Importar", "PM", "<strong>Importar desde presupuesto</strong> → diálogo <strong>Importar EDT al cronograma</strong>.", ["Elegí el presupuesto aprobado", "Por defecto: estructura, sin fechas", "Opcional: fechas estimadas de borrador (reparte el rango; no respeta FS)", "Después podés sumar hitos y tareas sin EDT"], "Tareas enlazadas")}
        ${card(2, "+ Tarea / hito", "PM", "Alta suelta. Tipo <strong>Tarea</strong> o <strong>Hito</strong> + fechas.", ["Ubicación: Colocar bajo + Insertar después de", "Si la EDT ya tiene una tarea hoja, propone hermano (no hijo)", "El vínculo EDT no mueve la fila"], "Ítem en el árbol")}
        ${card(3, "Reordenar", "PM", "En Gantt, Tabla o detalle: <strong>↑ ↓</strong>, <strong>sangrar →</strong>, <strong>← disminuir sangría</strong>.", ["↑ ↓ = hermanos", "Sangrar bajo una hoja: esa hoja pasa a contenedor (pide confirmación)", "Se le quita el vínculo EDT al nuevo contenedor"], "Árbol del Gantt")}
        ${card(4, "Filtros", "PM", "Tipo = Todos / Tareas / Hitos. Estado. ▾ colapsa capítulos.", ["Hitos = diamante, color fijo", "Canceladas ocultas por defecto", "Aviso si el presupuesto base ≠ el aprobado actual"], "Vista Gantt default")}
      </div>
      <p class="section-label">2 · Fechas, FS e hitos</p>
      <div class="row cols-4">
        ${card(5, "Fechas en hojas", "PM", "Arrastrá / redimensioná en el Gantt o editá en el detalle.", ["No edites fechas de contenedores: se pisan con el rollup", "Recalcular contenedores si hace falta", "Advertencia al guardar si rompés un FS"], "Plan (tiempo)")}
        ${card(6, "Dependencias FS", "PM", "Solo Finish-to-Start. Pestaña <strong>Dependencias</strong> o botón <strong>FS</strong> en el Gantt.", ["Las flechas del Gantt son de solo lectura", "Violación = aviso, no bloqueo", "Las fechas placeholder del import no respetan FS"], "Predecesoras")}
        ${card(7, "Vínculo EDT", "PM", "En el detalle: un nodo <strong>primario</strong>. Sin eso, chip <strong>Sin EDT</strong>.", ["Sin EDT no hay % Real ni métricas de costo/cert", "Hitos no toman % Real del libro (D-103)", "Chips Entrega OC / Recibido si hay compra"], "Costo + avance")}
        ${card(8, "Completar un hito", "PM", "A mano en el detalle, o al <strong>confirmar una recepción</strong> de la misma EDT (D-104).", ["Filtro Tipo = Hitos", "No anides un hito bajo la tarea de montaje", "Anular la recepción no reabre el hito"], "Completado")}
      </div>
      <p class="section-label">Las cuatro dimensiones (no las mezcles)</p>
      <div class="impact cols-4">
        <div class="i1"><b>Real</b><span>Libro de obra aprobado en tareas con EDT. Hitos: a mano o recepción.</span></div>
        <div class="i2"><b>Plan (tiempo)</b><span>Fechas vs hoy. Automático.</span></div>
        <div class="i3"><b>Cantidades</b><span>Físico vs presupuesto, desde el libro.</span></div>
        <div class="i5"><b>Certificado</b><span>Certificaciones emitidas. Solo lectura acá.</span></div>
      </div>
      <p class="section-label">Si se desarma el Gantt</p>
      <div class="cons">
        <div class="box warn">
          <h2>Vuelve atrás</h2>
          <ul>
            <li>Sangraste mal: disminuí sangría o mové el ítem. El contenedor nuevo ya no tiene EDT.</li>
            <li>Fechas placeholder raras: las editás a mano; el import no corre de nuevo las FS.</li>
            <li>Hito cerrado de más por una recepción: reabrilo a mano en el detalle.</li>
          </ul>
        </div>
        <div class="box block">
          <h2>Queda trabado / no hagas esto</h2>
          <ul>
            <li>Editar fechas de un contenedor: el rollup las pisa.</li>
            <li>Anidar un hito debajo de una tarea hoja: esa tarea deja de tener fechas editables.</li>
            <li>Kanban: un salto de estado inválido no se aplica (mensaje, no cambia).</li>
            <li>Sin presupuesto aprobado, el import no tiene de dónde nacer las tareas.</li>
          </ul>
        </div>
      </div>`),
  },
];

for (const map of maps) {
  const html = map.html((inner) => wrap(map, inner));
  const out = path.join(__dirname, "laminas", `${map.file}.html`);
  fs.writeFileSync(out, html, "utf8");
  console.log("HTML", out);
}
