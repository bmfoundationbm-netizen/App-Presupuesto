// Mi Presupuesto · asistente de importación (movimientos de un banco o una planilla)

import { estado, mutar, irA } from '../estado.js';
import { h, crudo, montar, icono, opciones, avisar, montoTexto, pesosRedondos } from '../ui.js';
import {
  leerCsv, detectarEncabezado, proponerColumnas, interpretarFilas, sugerirLinea, claveDeRegla, esDuplicado,
  firmaEncabezado, detectarMeses, detectarEncabezadoMeses, interpretarPlanilla, indiceProbable
} from '../lib/importar.js';
import { SECCIONES, INDICES } from '../lib/catalogo.js';
import { categoria, seccionDeLinea, agregarLinea, nuevoId, planActivo, nuevoPlan, fijarPlan, fijarReal, categoriaDeIndice } from '../lib/modelo.js';
import { formatoFecha, mesDe, anioDe, mesActual } from '../lib/fechas.js';

const MAX_FILAS = 400;
let w = null;   // estado del asistente

export async function abrirImportacion() {
  if (!estado.hogar) return;
  const r = await window.mp.importar.elegir();
  if (r.cancelado) return;
  if (!r.ok) { avisar(r.error, { tipo: 'error', duracion: 7000 }); return; }
  const hojas = r.tipo === 'csv' ? [{ nombre: r.nombre, filas: leerCsv(r.texto) }] : r.hojas;
  if (!hojas.length || !hojas.some((x) => x.filas.length)) { avisar('El archivo está vacío.', { tipo: 'error' }); return; }
  w = { archivo: r.nombre, hojas, hoja: 0, modo: null, elecciones: new Map(), incluidas: new Map() };
  prepararHoja();
  abrirVentana();
}

function filas() { return w.hojas[w.hoja].filas; }

function prepararHoja() {
  const f = filas();
  const encMeses = detectarEncabezadoMeses(f);
  const hg = estado.hogar;
  w.elecciones = new Map();
  w.incluidas = new Map();
  if (w.modo === null) w.modo = encMeses >= 0 ? 'planilla' : 'movimientos';
  // Movimientos
  w.encabezado = detectarEncabezado(f);
  w.columnas = proponerColumnas(f, w.encabezado);
  w.signo = 'negativoEsGasto';
  const firma = firmaEncabezado(f, w.encabezado);
  const plantilla = hg.importacion.plantillas.find((p) => p.firma === firma);
  if (plantilla) { w.encabezado = plantilla.encabezado; w.columnas = { ...plantilla.columnas }; w.signo = plantilla.signo; w.plantillaUsada = plantilla.nombre; }
  else w.plantillaUsada = null;
  w.guardarPlantilla = !plantilla;
  w.nombrePlantilla = plantilla ? plantilla.nombre : w.archivo.replace(/\.[^.]+$/, '');
  const gastos = hg.lineas.filter((l) => seccionDeLinea(hg, l) === 'gastos' && !l.auto);
  w.porDefecto = (gastos.find((l) => /otros gastos/i.test(l.nombre)) || gastos[0] || {}).id || '';
  // Planilla
  w.encMeses = encMeses >= 0 ? encMeses : 0;
  w.colConcepto = 0;
  w.anio = anioDe(mesActual());
  w.destino = 'plan';
}

// ── Ventana ─────────────────────────────────────────────────────────────────────
function abrirVentana() {
  cerrarVentana();
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.id = 'velo-importar';
  velo.innerHTML = '<div class="dialogo muy-ancho" role="dialog" aria-modal="true"></div>';
  document.body.appendChild(velo);
  const caja = velo.querySelector('.dialogo');
  caja.addEventListener('change', (e) => cambio(e));
  caja.addEventListener('click', (e) => clic(e));
  document.addEventListener('keydown', escape, true);
  dibujar();
}

function escape(e) { if (e.key === 'Escape' && document.getElementById('velo-importar')) { e.stopPropagation(); cerrarVentana(); } }
function cerrarVentana() {
  const v = document.getElementById('velo-importar');
  if (v) v.remove();
  document.removeEventListener('keydown', escape, true);
}

function opcionesLineas(hg, elegida, { soloIngresos = false } = {}) {
  return SECCIONES.filter((s) => !soloIngresos || s.clave === 'ingresos').map((s) => {
    const ls = hg.lineas.filter((l) => seccionDeLinea(hg, l) === s.clave && !l.auto);
    if (!ls.length) return '';
    return h`<optgroup label="${s.nombre}">${opciones(ls.map((l) => [l.id, s.clave === 'gastos' ? `${categoria(hg, l.categoriaId).nombre} › ${l.nombre}` : l.nombre]), elegida)}</optgroup>`;
  });
}

function dibujar() {
  const caja = document.querySelector('#velo-importar .dialogo');
  if (!caja) return;
  const hg = estado.hogar;
  const f = filas();
  const cab = f[w.modo === 'planilla' ? w.encMeses : w.encabezado] || [];
  const colOpc = [[-1, '—'], ...Array.from({ length: Math.max(...f.slice(0, 50).map((x) => (x ? x.length : 0)), 1) }, (_, i) => [i, `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}: ${cab[i] !== null && cab[i] !== undefined && cab[i] !== '' ? String(cab[i]).slice(0, 30) : '(sin título)'}`])];
  montar(caja, h`
    <div class="dialogo-cab"><h2>Importar ${w.archivo}</h2><button class="boton icono fantasma" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button></div>
    <div class="dialogo-cuerpo">
      <div class="filtros">
        ${w.hojas.length > 1 ? h`<select class="entrada" data-w="hoja">${opciones(w.hojas.map((x, i) => [i, `Hoja: ${x.nombre}`]), w.hoja)}</select>` : ''}
        <div class="segmentado"><button class="${w.modo === 'movimientos' ? 'activo' : ''}" data-modo="movimientos">Movimientos (una fila por gasto)</button><button class="${w.modo === 'planilla' ? 'activo' : ''}" data-modo="planilla">Planilla (meses en columnas)</button></div>
      </div>
      ${w.modo === 'movimientos' ? cuerpoMovimientos(hg, f, colOpc) : cuerpoPlanilla(hg, f, colOpc)}
    </div>
    <div class="dialogo-pie"><button class="boton" data-cerrar>Cancelar</button><button class="boton primario" data-accion="importar">${icono('importar')}${textoBoton()}</button></div>`);
}

let vistaPrevia = [];

function cuerpoMovimientos(hg, f, colOpc) {
  const c = w.columnas;
  const listos = c.fecha >= 0 && (c.monto >= 0 || (c.debito >= 0 && c.credito >= 0));
  vistaPrevia = listos ? interpretarFilas(f, { filaEncabezado: w.encabezado, columnas: c, signo: w.signo }).slice(0, MAX_FILAS) : [];
  const lineasIngreso = new Set(hg.lineas.filter((l) => seccionDeLinea(hg, l) === 'ingresos').map((l) => l.id));
  for (const m of vistaPrevia) {
    if (!w.elecciones.has(m.fila)) {
      const s = sugerirLinea(m.descripcion, { reglas: hg.importacion.reglas, lineas: hg.lineas.filter((l) => !l.auto) });
      const dup = esDuplicado(m, hg.movimientos);
      // Las entradas de plata sin concepto reconocido suelen ser transferencias propias: quedan sin tildar.
      const linea = s ? s.lineaId : (m.monto > 0 ? w.porDefecto : '');
      w.elecciones.set(m.fila, linea);
      w.incluidas.set(m.fila, !dup && !!linea && (m.monto > 0 || (s && lineasIngreso.has(s.lineaId))));
      m.motivo = dup ? 'ya cargado' : s ? { regla: 'regla aprendida', palabra: 'reconocido', nombre: 'por el nombre' }[s.motivo] : '';
    } else m.motivo = esDuplicado(m, hg.movimientos) ? 'ya cargado' : '';
  }
  const n = vistaPrevia.filter((m) => w.incluidas.get(m.fila)).length;
  return h`
    ${w.plantillaUsada ? h`<div class="nota" style="margin-bottom:10px">${icono('ok')}Se usó la plantilla guardada "${w.plantillaUsada}".</div>` : ''}
    <div class="fila-campos">
      <div class="campo"><label>Fila de títulos</label><input class="entrada" type="number" min="1" data-w="encabezado" value="${w.encabezado + 1}"></div>
      <div class="campo"><label>Fecha</label><select class="entrada" data-col="fecha">${opciones(colOpc, c.fecha)}</select></div>
      <div class="campo"><label>Descripción</label><select class="entrada" data-col="descripcion">${opciones(colOpc, c.descripcion)}</select></div>
      <div class="campo"><label>Monto</label><select class="entrada" data-col="monto">${opciones(colOpc, c.monto)}</select></div>
      <div class="campo"><label>o Débito</label><select class="entrada" data-col="debito">${opciones(colOpc, c.debito)}</select></div>
      <div class="campo"><label>y Crédito</label><select class="entrada" data-col="credito">${opciones(colOpc, c.credito)}</select></div>
    </div>
    <div class="fila-campos">
      ${c.monto >= 0 ? h`<div class="campo"><label>En la columna de monto</label><select class="entrada" data-w="signo">${opciones([['negativoEsGasto', 'Los gastos vienen en negativo'], ['positivo', 'Todo es gasto (resumen de tarjeta)']], w.signo)}</select></div>` : ''}
      <div class="campo"><label>Lo que no se reconozca va a</label><select class="entrada" data-w="porDefecto">${opcionesLineas(hg, w.porDefecto)}</select></div>
      <div class="campo"><label class="casilla" style="margin-top:22px"><input type="checkbox" data-w="guardarPlantilla" ${w.guardarPlantilla ? crudo('checked') : ''}> Recordar estas columnas para este banco</label></div>
    </div>
    ${!listos ? h`<div class="nota aviso">${icono('alerta')}Elegí al menos la columna de fecha y la de monto (o las de débito y crédito).</div>` : h`
      <div class="tabla-importar"><table class="tabla"><thead><tr><th><input type="checkbox" data-todas ${n === vistaPrevia.length ? crudo('checked') : ''}></th><th>Fecha</th><th>Descripción</th><th class="der">Monto</th><th>Va a</th><th></th></tr></thead>
        <tbody>${vistaPrevia.map((m) => h`<tr class="${w.incluidas.get(m.fila) ? '' : 'excluida'}">
          <td><input type="checkbox" data-incluir="${m.fila}" ${w.incluidas.get(m.fila) ? crudo('checked') : ''}></td>
          <td class="num">${formatoFecha(m.fecha)}</td><td>${m.descripcion}</td>
          <td class="der" style="color:${m.monto < 0 ? 'var(--bien-texto)' : 'inherit'}">${m.monto < 0 ? '+' : ''}${montoTexto(Math.abs(m.monto))}</td>
          <td><select class="entrada en-tabla" data-linea="${m.fila}"><option value="">Elegí…</option>${opcionesLineas(hg, w.elecciones.get(m.fila))}</select></td>
          <td class="chico apagado">${m.motivo || ''}</td></tr>`)}</tbody></table></div>
      <p class="chico apagado">${vistaPrevia.length} movimientos leídos${vistaPrevia.length >= MAX_FILAS ? ` (se muestran los primeros ${MAX_FILAS})` : ''}. Los montos en verde son entradas de plata: si van a un gasto, se cargan como reintegro. Lo que elijas en "Va a" se recuerda para la próxima.</p>`}`;
}

function cuerpoPlanilla(hg, f, colOpc) {
  const meses = detectarMeses(f[w.encMeses]);
  const filasPl = interpretarPlanilla(f, { filaEncabezado: w.encMeses, colConcepto: w.colConcepto, meses }).slice(0, MAX_FILAS);
  vistaPrevia = filasPl;
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  for (const r of filasPl) {
    if (!w.elecciones.has(r.fila)) {
      const existente = hg.lineas.find((l) => !l.auto && norm(l.nombre) === norm(r.nombre));
      const ingreso = /sueldo|ingreso|cobro|haber|aguinaldo|jubila|alquiler cobrado/i.test(r.nombre);
      w.elecciones.set(r.fila, existente ? existente.id : `nueva:${ingreso ? 'ingresos' : indiceProbable(r.nombre)}`);
      w.incluidas.set(r.fila, true);
    }
  }
  const nuevas = [['nueva:ingresos', 'Nuevo ingreso'], ...INDICES.map((i) => [`nueva:${i.clave}`, `Nuevo gasto en ${i.nombre}`])];
  const mesesEncontrados = meses.filter(Boolean).length;
  return h`
    <div class="fila-campos">
      <div class="campo"><label>Fila de los meses</label><input class="entrada" type="number" min="1" data-w="encMeses" value="${w.encMeses + 1}"></div>
      <div class="campo"><label>Columna de los conceptos</label><select class="entrada" data-w="colConcepto">${opciones(colOpc.filter(([v]) => v >= 0), w.colConcepto)}</select></div>
      <div class="campo"><label>Año</label><select class="entrada" data-w="anio">${opciones([w.anio - 2, w.anio - 1, w.anio, w.anio + 1].map((a) => [a, String(a)]), w.anio)}</select></div>
      <div class="campo"><label>Cargar como</label><select class="entrada" data-w="destino">${opciones([['plan', 'Lo planeado (presupuesto)'], ['real', 'Lo real (lo que pasó)']], w.destino)}</select></div>
    </div>
    <p class="chico apagado">${mesesEncontrados} meses reconocidos en los títulos. Las filas de totales se saltean.</p>
    <div class="tabla-importar"><table class="tabla"><thead><tr><th></th><th>Concepto</th><th class="der">Meses</th><th class="der">Total</th><th>Va a</th></tr></thead>
      <tbody>${filasPl.map((r) => h`<tr class="${w.incluidas.get(r.fila) ? '' : 'excluida'}"><td><input type="checkbox" data-incluir="${r.fila}" ${w.incluidas.get(r.fila) ? crudo('checked') : ''}></td>
        <td>${r.nombre}</td><td class="der">${Object.keys(r.valores).length}</td><td class="der">${pesosRedondos(Object.values(r.valores).reduce((s, x) => s + x, 0))}</td>
        <td><select class="entrada en-tabla" data-linea="${r.fila}">${opciones(nuevas, w.elecciones.get(r.fila))}${opcionesLineas(hg, w.elecciones.get(r.fila))}</select></td></tr>`)}</tbody></table></div>`;
}

function textoBoton() {
  const n = vistaPrevia.filter((m) => w.incluidas.get(m.fila) && w.elecciones.get(m.fila)).length;
  return w.modo === 'movimientos' ? `Importar ${n} ${n === 1 ? 'movimiento' : 'movimientos'}` : `Importar ${n} ${n === 1 ? 'concepto' : 'conceptos'}`;
}

// ── Eventos ─────────────────────────────────────────────────────────────────────
function cambio(e) {
  const t = e.target;
  if (t.dataset.w) {
    const k = t.dataset.w;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (k === 'encabezado' || k === 'encMeses') v = Math.max(0, Number(v) - 1);
    if (k === 'hoja' || k === 'colConcepto' || k === 'anio') v = Number(v);
    w[k] = v;
    if (k === 'hoja') { w.modo = null; prepararHoja(); }
    if (k === 'encabezado') w.columnas = proponerColumnas(filas(), w.encabezado);
    if (k !== 'guardarPlantilla' && k !== 'destino' && k !== 'anio') { w.elecciones = new Map(); w.incluidas = new Map(); }
    dibujar();
    return;
  }
  if (t.dataset.col) { w.columnas[t.dataset.col] = Number(t.value); if (t.dataset.col === 'monto' && Number(t.value) >= 0) { w.columnas.debito = -1; w.columnas.credito = -1; } w.elecciones = new Map(); w.incluidas = new Map(); dibujar(); return; }
  if (t.dataset.incluir) { w.incluidas.set(Number(t.dataset.incluir), t.checked); actualizarBoton(); t.closest('tr').classList.toggle('excluida', !t.checked); return; }
  if (t.dataset.linea) { w.elecciones.set(Number(t.dataset.linea), t.value); if (t.value) { w.incluidas.set(Number(t.dataset.linea), true); const c = t.closest('tr').querySelector('[data-incluir]'); if (c) c.checked = true; t.closest('tr').classList.remove('excluida'); } actualizarBoton(); return; }
  if (t.matches('[data-todas]')) { for (const m of vistaPrevia) w.incluidas.set(m.fila, t.checked); dibujar(); }
}

function actualizarBoton() {
  const b = document.querySelector('#velo-importar [data-accion="importar"]');
  if (b) b.lastChild.textContent = textoBoton();
}

function clic(e) {
  if (e.target.closest('[data-cerrar]')) { cerrarVentana(); return; }
  const m = e.target.closest('[data-modo]');
  if (m) { w.modo = m.dataset.modo; w.elecciones = new Map(); w.incluidas = new Map(); dibujar(); return; }
  if (e.target.closest('[data-accion="importar"]')) importar();
}

function importar() {
  const hg = estado.hogar;
  const elegidas = vistaPrevia.filter((m) => w.incluidas.get(m.fila) && w.elecciones.get(m.fila));
  if (!elegidas.length) { avisar('No hay nada elegido para importar.'); return; }
  if (w.modo === 'movimientos') {
    let reglasNuevas = 0;
    mutar((x) => {
      const lote = nuevoId('imp');
      for (const m of elegidas) {
        const lineaId = w.elecciones.get(m.fila);
        const esIngreso = seccionDeLinea(x, x.lineas.find((l) => l.id === lineaId)) === 'ingresos';
        // Una salida va positiva a su gasto; una entrada va positiva a un ingreso o negativa (reintegro) a un gasto.
        const monto = esIngreso ? Math.abs(m.monto) : m.monto;
        x.movimientos.push({ id: nuevoId('mv'), fecha: m.fecha, lineaId, monto, descripcion: m.descripcion.slice(0, 200), medioId: null, personaId: null, proyectoId: null, origen: null, importado: { lote, archivo: w.archivo } });
        const clave = claveDeRegla(m.descripcion);
        const sug = sugerirLinea(m.descripcion, { reglas: x.importacion.reglas, lineas: x.lineas });
        if (clave && (!sug || sug.lineaId !== lineaId)) {
          x.importacion.reglas = x.importacion.reglas.filter((r) => r.texto !== clave);
          x.importacion.reglas.push({ texto: clave, lineaId });
          reglasNuevas++;
        }
      }
      if (w.guardarPlantilla) {
        const firma = firmaEncabezado(filas(), w.encabezado);
        x.importacion.plantillas = x.importacion.plantillas.filter((p) => p.firma !== firma);
        x.importacion.plantillas.push({ id: nuevoId('pl'), nombre: w.nombrePlantilla || w.archivo, firma, encabezado: w.encabezado, columnas: { ...w.columnas }, signo: w.signo });
      }
    });
    cerrarVentana();
    avisar(`Se importaron ${elegidas.length} movimientos${reglasNuevas ? `; se aprendieron ${reglasNuevas} reglas para la próxima` : ''}.`, { tipo: 'ok', duracion: 7000, accion: { texto: 'Ver', fn: () => irA('movimientos') } });
    return;
  }
  mutar((x) => {
    const plan = w.destino === 'plan' ? (planActivo(x, w.anio) || nuevoPlan(x, w.anio)) : null;
    for (const r of elegidas) {
      let lineaId = w.elecciones.get(r.fila);
      if (lineaId.startsWith('nueva:')) {
        const destino = lineaId.slice(6);
        const categoriaId = destino === 'ingresos' ? 'cat_ingresos' : categoriaDeIndice(x, destino).id;
        lineaId = agregarLinea(x, { categoriaId, nombre: r.nombre.slice(0, 120), naturaleza: 'variable' }).id;
      }
      for (const [mes, v] of Object.entries(r.valores)) {
        const m = mesDe(w.anio, Number(mes));
        if (plan) fijarPlan(plan, lineaId, m, v); else fijarReal(x, lineaId, m, v);
      }
    }
  });
  const { anio, destino } = w;
  cerrarVentana();
  avisar(`Se importaron ${elegidas.length} conceptos a ${destino === 'plan' ? 'lo planeado' : 'lo real'} de ${anio}.`, { tipo: 'ok', duracion: 7000, accion: { texto: 'Ver la planilla', fn: () => { estado.ui.anio = anio; estado.ui.modo = destino; irA('planilla'); } } });
}
