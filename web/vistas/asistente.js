// Mi Presupuesto · asistente para crear un hogar nuevo (6 pasos)

import { estado, cargarHogar, irA } from '../estado.js';
import { h, crudo, montar, icono, opciones, leerMonto, avisar, LOGO } from '../ui.js';
import { REGIONES, COMPOSICIONES, INDICES, SUGERIDAS, COTIZACIONES } from '../lib/catalogo.js';
import { hogarDesdeAsistente, gastosIniciales } from '../lib/modelo.js';
import { mesActual, sumarMeses, nombreMes, capitalizar } from '../lib/fechas.js';
import { pesos } from '../lib/dinero.js';
import { guardarComo } from '../acciones.js';
import { iniciarRecorrido } from './recorrido.js';

const PASOS = ['Tu hogar', 'Quiénes viven', 'Ingresos', 'Gastos', 'Ahorro', 'Guardar'];
let w = null;

function nuevoEstado() {
  return {
    paso: 0, nombre: '', region: 'gba', vivienda: 'alquilada',
    integrantes: [persona('adulto', 1), persona('adulto', 2)],
    ingresos: [], gastos: [], gastosArmados: false,
    fondoMeses: 3, fondoAporte: '', meta: { nombre: '', monto: '', fecha: '' }, dolar: 'oficial',
    clave: '', clave2: ''
  };
}
function persona(tipo, n) { return { nombre: '', tipo, edad: '', sexo: '', n }; }
const nombrePersona = (p, k) => p.nombre.trim() || (p.tipo === 'menor' ? `Menor ${k + 1}` : `Adulto ${k + 1}`);

function armarIngresos() {
  const adultos = w.integrantes.map((p, k) => ({ p, k })).filter((x) => x.p.tipo === 'adulto');
  const previos = w.ingresos;
  w.ingresos = adultos.map(({ p, k }, j) => previos[j] || { nombre: `Sueldo de ${nombrePersona(p, k)}`, monto: '', moneda: 'ARS', aguinaldo: true, persona: k });
  for (const x of previos.slice(adultos.length)) if (x.extra) w.ingresos.push(x);
}

function armarGastos() {
  if (w.gastosArmados) return;
  const hayMenores = w.integrantes.some((p) => p.tipo === 'menor');
  const lista = gastosIniciales({ hayMenores });
  if (w.vivienda === 'alquilada') lista.unshift({ indice: 'vivienda', nombre: 'Alquiler', naturaleza: 'fijo', clase: 'esencial' }, { indice: 'vivienda', nombre: 'Expensas', naturaleza: 'fijo', clase: 'esencial' });
  w.gastos = lista.map((g) => ({ ...g, monto: '', incluido: true }));
  w.gastosArmados = true;
}

function render(raiz) {
  if (!w) w = nuevoEstado();
  dibujar(raiz);
  raiz.addEventListener('input', (e) => entrada(e));
  raiz.addEventListener('change', (e) => entrada(e, raiz));
  raiz.addEventListener('click', (e) => clic(e, raiz));
}

function dibujar(raiz) {
  montar(raiz, h`<div class="asistente">
    <div class="asistente-cab">${crudo(LOGO)}<div><h1>Crear un hogar</h1><p class="apagado">Lo que no sepas, dejalo vacío: después se completa en la planilla.</p></div>
      <button class="boton fantasma" data-accion="cancelar">Cancelar</button></div>
    <ol class="pasos">${PASOS.map((p, i) => h`<li class="${i === w.paso ? 'actual' : i < w.paso ? 'hecho' : ''}"><span>${i < w.paso ? icono('ok') : i + 1}</span>${p}</li>`)}</ol>
    <div class="asistente-cuerpo">${[paso0, paso1, paso2, paso3, paso4, paso5][w.paso]()}</div>
    <div class="asistente-pie">
      ${w.paso > 0 ? h`<button class="boton" data-accion="atras">${icono('izquierda')}Atrás</button>` : h`<span></span>`}
      <span class="espacio"></span>
      ${w.paso < PASOS.length - 1 ? h`<button class="boton primario" data-accion="siguiente">Siguiente${icono('derecha')}</button>` : h`<button class="boton primario" data-accion="crear">${icono('guardar')}Elegir dónde guardar y crear</button>`}
    </div>
  </div>`);
  const foco = raiz.querySelector('[autofocus]');
  if (foco) foco.focus();
}

// ── Pasos ───────────────────────────────────────────────────────────────────────
function paso0() {
  return h`
    <div class="campo"><label>¿Cómo le ponemos al hogar?</label><input class="entrada grande" data-w="nombre" value="${w.nombre}" placeholder="Ej.: Casa de los Pérez, Mi departamento" autofocus></div>
    <div class="campo"><div class="etiqueta">¿En qué región viven?</div><div class="ayuda">Se usa para el IPC de cada categoría y para la canasta básica.</div>
      <div class="tarjetas-eleccion">${REGIONES.map((r) => h`<label class="eleccion ${w.region === r.clave ? 'elegida' : ''}"><input type="radio" name="region" data-w="region" value="${r.clave}" ${w.region === r.clave ? crudo('checked') : ''}><strong>${r.nombre}</strong><small>${r.detalle}</small></label>`)}</div></div>
    <div class="campo"><div class="etiqueta">La vivienda</div>
      <div class="segmentado">${[['alquilada', 'Alquilan'], ['propia', 'Es propia'], ['otra', 'Otra situación']].map(([v, t]) => h`<button type="button" class="${w.vivienda === v ? 'activo' : ''}" data-vivienda="${v}">${t}</button>`)}</div>
      <div class="ayuda">Sirve para compararte con hogares en la misma situación: alquilar cambia mucho cuánto se va en vivienda.</div></div>`;
}

function paso1() {
  const comp = `${w.integrantes.filter((p) => p.tipo === 'adulto').length}-${w.integrantes.filter((p) => p.tipo === 'menor').length}`;
  return h`
    <div class="campo"><div class="etiqueta">Elegí una opción rápida o armalo a mano</div>
      <div class="atajos">${COMPOSICIONES.map((c) => h`<button type="button" class="boton ${comp === c.clave ? 'primario' : ''}" data-comp="${c.clave}">${c.nombre}${c.nota ? h` <small>· ${c.nota}</small>` : ''}</button>`)}</div></div>
    <table class="tabla tabla-integrantes"><thead><tr><th>Nombre (opcional)</th><th>Edad (opcional)</th><th>Sexo (opcional)</th><th></th><th></th></tr></thead>
      <tbody>${w.integrantes.map((p, k) => h`<tr>
        <td><input class="entrada" data-int="${k}" data-campo="nombre" value="${p.nombre}" placeholder="${p.tipo === 'menor' ? `Menor ${k + 1}` : `Adulto ${k + 1}`}"></td>
        <td><input class="entrada" style="width:80px" type="number" min="0" max="110" data-int="${k}" data-campo="edad" value="${p.edad}"></td>
        <td><select class="entrada" data-int="${k}" data-campo="sexo">${opciones([['', '—'], ['m', 'Mujer'], ['v', 'Varón']], p.sexo)}</select></td>
        <td><select class="entrada" data-int="${k}" data-campo="tipo">${opciones([['adulto', 'Adulto (18 o más)'], ['menor', 'Menor de 18']], p.tipo)}</select></td>
        <td>${w.integrantes.length > 1 ? h`<button type="button" class="boton icono chico fantasma" data-quitar-int="${k}" aria-label="Quitar">${icono('cerrar')}</button>` : ''}</td></tr>`)}</tbody></table>
    <button type="button" class="boton chico" data-accion="agregar-int" style="margin-top:8px">${icono('mas')}Agregar a alguien</button>
    <p class="chico apagado" style="margin-top:12px">${icono('info')} La edad y el sexo hacen exacto el cálculo de la canasta básica: el INDEC no cuenta igual lo que necesita un chico de 6 años que uno de 15. Si no los ponés, se usa un promedio.</p>`;
}

function paso2() {
  armarIngresos();
  const total = w.ingresos.reduce((s, x) => s + (x.moneda === 'ARS' ? leerMonto(x.monto) || 0 : 0), 0);
  return h`
    <p class="apagado">Lo que entra por mes, ya con los descuentos (lo que llega al bolsillo).</p>
    <table class="tabla"><thead><tr><th>Ingreso</th><th class="der">Por mes</th><th>Moneda</th><th>Aguinaldo</th><th></th></tr></thead>
      <tbody>${w.ingresos.map((x, k) => h`<tr>
        <td><input class="entrada" data-ing="${k}" data-campo="nombre" value="${x.nombre}"></td>
        <td><input class="entrada monto" style="width:150px" data-ing="${k}" data-campo="monto" value="${x.monto}" placeholder="0" ${k === 0 ? crudo('autofocus') : ''}></td>
        <td><select class="entrada" data-ing="${k}" data-campo="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], x.moneda)}</select></td>
        <td><label class="casilla" data-ayuda="Sueldo en relación de dependencia: el aguinaldo de junio y diciembre se calcula solo"><input type="checkbox" data-ing="${k}" data-campo="aguinaldo" ${x.aguinaldo ? crudo('checked') : ''}> En relación de dependencia</label></td>
        <td>${x.extra ? h`<button type="button" class="boton icono chico fantasma" data-quitar-ing="${k}" aria-label="Quitar">${icono('cerrar')}</button>` : ''}</td></tr>`)}</tbody></table>
    <button type="button" class="boton chico" data-accion="agregar-ing" style="margin-top:8px">${icono('mas')}Otro ingreso (alquiler que cobran, changas, cuota alimentaria…)</button>
    ${total ? h`<p style="margin-top:14px">Total en pesos por mes: <strong>${pesos(total)}</strong>${w.ingresos.some((x) => x.moneda === 'USD' && leerMonto(x.monto) > 0) ? h` <span class="apagado chico">más lo que entra en dólares, que se pasa a pesos con la cotización que elijas en el paso 5</span>` : ''}</p>` : ''}`;
}

function paso3() {
  armarGastos();
  const porIndice = new Map();
  w.gastos.forEach((g, k) => { if (!porIndice.has(g.indice)) porIndice.set(g.indice, []); porIndice.get(g.indice).push([g, k]); });
  const total = w.gastos.filter((g) => g.incluido).reduce((s, g) => s + (leerMonto(g.monto) || 0), 0);
  const ingresos = w.ingresos.reduce((s, x) => s + (x.moneda === 'ARS' ? leerMonto(x.monto) || 0 : 0), 0);
  return h`
    <p class="apagado">Los gastos de todos los meses, organizados con las categorías del IPC. Destildá lo que no tengan y agregá lo que falte.</p>
    <div class="gastos-asistente">${INDICES.filter((i) => porIndice.has(i.clave)).map((i) => h`<div class="grupo-gastos"><h4>${i.nombre}</h4>
      ${porIndice.get(i.clave).map(([g, k]) => h`<div class="fila-gasto ${g.incluido ? '' : 'excluido'}">
        <label class="casilla"><input type="checkbox" data-gas="${k}" data-campo="incluido" ${g.incluido ? crudo('checked') : ''}><span>${g.nombre}</span></label>
        <span class="marca-mini" data-ayuda="${g.naturaleza === 'fijo' ? 'Fijo: se repite igual cada mes' : 'Variable'}">${g.naturaleza === 'fijo' ? 'F' : 'V'}</span>
        <input class="entrada monto" data-gas="${k}" data-campo="monto" value="${g.monto}" placeholder="0"></div>`)}</div>`)}</div>
    <div class="agregar-gasto"><select class="entrada" id="nuevo-indice">${opciones(INDICES.map((i) => [i.clave, i.nombre]), 'varios')}</select>
      <input class="entrada" id="nuevo-nombre" placeholder="Otro gasto, ej.: Cuota del club"><button type="button" class="boton" data-accion="agregar-gasto">${icono('mas')}Agregar</button></div>
    <div class="nota" style="margin-top:12px">Gastos: <strong>${pesos(total)}</strong> por mes${ingresos ? h` · Ingresos en pesos: <strong>${pesos(ingresos)}</strong> · ${total > ingresos ? h`<span style="color:var(--critico-texto)">${icono('alerta')}Falta ${pesos(total - ingresos)}</span>` : h`Quedan <strong>${pesos(ingresos - total)}</strong> para ahorro, cuotas e imprevistos`}` : ''}</div>`;
}

function paso4() {
  const meses = Array.from({ length: 48 }, (_, i) => { const m = sumarMeses(mesActual(), i + 1); return [m, capitalizar(nombreMes(m))]; });
  const hoy = estado.dolarHoy || {};
  return h`
    <div class="dos-columnas">
      <div class="tarjeta"><h3>Fondo de emergencia</h3>
        <p class="apagado chico">Plata guardada para imprevistos (el auto, el dentista, un electrodoméstico). Los gastos inesperados se pagan de acá.</p>
        <div class="campo"><label>Que cubra</label><select class="entrada" data-w="fondoMeses">${opciones([1, 2, 3, 4, 6, 9, 12].map((n) => [n, `${n} ${n === 1 ? 'mes' : 'meses'} de gastos`]), w.fondoMeses)}</select><div class="ayuda">Se suele recomendar entre 3 y 6 meses.</div></div>
        <div class="campo"><label>Cuánto separar por mes (opcional)</label><input class="entrada monto" data-w="fondoAporte" value="${w.fondoAporte}" placeholder="0"></div></div>
      <div class="tarjeta"><h3>Una meta de ahorro (opcional)</h3>
        <div class="campo"><label>Para qué</label><input class="entrada" data-meta="nombre" value="${w.meta.nombre}" placeholder="Ej.: Vacaciones, Auto, Mudanza"></div>
        <div class="fila-campos"><div class="campo"><label>Cuánto (en pesos de hoy)</label><input class="entrada monto" data-meta="monto" value="${w.meta.monto}"></div>
          <div class="campo"><label>Para cuándo</label><select class="entrada" data-meta="fecha">${opciones([['', 'Sin fecha'], ...meses], w.meta.fecha)}</select></div></div>
        <p class="chico apagado">La meta sube sola con la inflación para que no quede corta.</p></div>
    </div>
    <div class="tarjeta" style="margin-top:14px"><h3>Dólares</h3>
      <div class="campo"><label>Si tienen ingresos, gastos o ahorro en dólares, se pasan a pesos con</label>
        <select class="entrada" data-w="dolar">${opciones(Object.entries(COTIZACIONES).map(([k, v]) => [k, `${v}${hoy[k] ? ` · hoy $ ${String(hoy[k].venta).replace('.', ',')}` : ''}`]), w.dolar)}</select></div></div>`;
}

function paso5() {
  const adultos = w.integrantes.filter((p) => p.tipo === 'adulto').length;
  const menores = w.integrantes.length - adultos;
  const ing = w.ingresos.filter((x) => leerMonto(x.monto) > 0).length;
  const gas = w.gastos.filter((g) => g.incluido).length;
  return h`
    <div class="nota"><strong>${w.nombre || 'Mi hogar'}</strong> · ${REGIONES.find((r) => r.clave === w.region).nombre} · ${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}${menores ? ` y ${menores} ${menores === 1 ? 'menor' : 'menores'}` : ''}
      · ${ing} ${ing === 1 ? 'ingreso' : 'ingresos'} · ${gas} conceptos de gasto · fondo de emergencia de ${w.fondoMeses} meses${w.meta.nombre ? ` · meta: ${w.meta.nombre}` : ''}</div>
    <div class="tarjeta" style="margin-top:14px"><h3>Contraseña (opcional)</h3>
      <p class="apagado chico">Si ponés contraseña, el archivo queda cifrado y nadie lo puede abrir sin ella. <strong>Si la olvidás, no hay forma de recuperarla.</strong></p>
      <div class="fila-campos"><div class="campo"><label>Contraseña</label><input class="entrada" type="password" data-w="clave" value="${w.clave}" autocomplete="new-password"></div>
        <div class="campo"><label>Repetila</label><input class="entrada" type="password" data-w="clave2" value="${w.clave2}" autocomplete="new-password"></div></div></div>
    <p class="apagado" style="margin-top:14px">Al tocar el botón vas a elegir la carpeta y el nombre del archivo (por ejemplo, en Documentos). Después se guarda solo con cada cambio y se hacen copias de respaldo.</p>`;
}

// ── Eventos ─────────────────────────────────────────────────────────────────────
function entrada(e, raiz) {
  const t = e.target;
  const valor = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset.w) w[t.dataset.w] = t.dataset.w === 'fondoMeses' ? Number(valor) : valor;
  else if (t.dataset.int !== undefined) {
    const p = w.integrantes[Number(t.dataset.int)];
    p[t.dataset.campo] = valor;
    if (t.dataset.campo === 'edad' && valor !== '') p.tipo = Number(valor) >= 18 ? 'adulto' : 'menor';
    if (e.type === 'change' && (t.dataset.campo === 'tipo' || t.dataset.campo === 'edad')) { w.gastosArmados = false; dibujar(raiz); }
  } else if (t.dataset.ing !== undefined) w.ingresos[Number(t.dataset.ing)][t.dataset.campo] = valor;
  else if (t.dataset.gas !== undefined) {
    const g = w.gastos[Number(t.dataset.gas)];
    g[t.dataset.campo] = valor;
    if (t.dataset.campo === 'monto' && leerMonto(valor) > 0) g.incluido = true;
  } else if (t.dataset.meta) w.meta[t.dataset.meta] = valor;
  if (e.type === 'change' && raiz && (t.dataset.w === 'region' || t.dataset.campo === 'incluido' || t.dataset.campo === 'monto' && t.dataset.gas !== undefined)) dibujar(raiz);
}

async function clic(e, raiz) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.vivienda) { w.vivienda = b.dataset.vivienda; w.gastosArmados = false; dibujar(raiz); return; }
  if (b.dataset.comp) {
    const c = COMPOSICIONES.find((x) => x.clave === b.dataset.comp);
    const prev = w.integrantes;
    const adultos = prev.filter((p) => p.tipo === 'adulto'), menores = prev.filter((p) => p.tipo === 'menor');
    w.integrantes = [
      ...Array.from({ length: c.adultos }, (_, i) => adultos[i] || persona('adulto', i + 1)),
      ...Array.from({ length: c.menores }, (_, i) => menores[i] || persona('menor', i + 1))
    ];
    w.gastosArmados = false;
    dibujar(raiz);
    return;
  }
  if (b.dataset.quitarInt !== undefined) { w.integrantes.splice(Number(b.dataset.quitarInt), 1); w.gastosArmados = false; dibujar(raiz); return; }
  if (b.dataset.quitarIng !== undefined) { w.ingresos.splice(Number(b.dataset.quitarIng), 1); dibujar(raiz); return; }
  switch (b.dataset.accion) {
    case 'cancelar': w = null; irA('inicio'); break;
    case 'atras': w.paso--; dibujar(raiz); break;
    case 'siguiente': if (validar()) { w.paso++; dibujar(raiz); } break;
    case 'agregar-int': w.integrantes.push(persona('adulto', w.integrantes.length + 1)); dibujar(raiz); break;
    case 'agregar-ing': w.ingresos.push({ nombre: '', monto: '', moneda: 'ARS', aguinaldo: false, persona: null, extra: true }); dibujar(raiz); break;
    case 'agregar-gasto': {
      const nombre = raiz.querySelector('#nuevo-nombre').value.trim();
      if (!nombre) { avisar('Escribí el nombre del gasto.'); return; }
      const indice = raiz.querySelector('#nuevo-indice').value;
      const sug = Object.values(SUGERIDAS).flat().find((s) => s[0].toLowerCase() === nombre.toLowerCase());
      w.gastos.push({ indice, nombre, naturaleza: sug ? sug[1] : 'variable', clase: sug ? sug[2] : undefined, monto: '', incluido: true });
      dibujar(raiz);
      break;
    }
    case 'crear': await crear(); break;
    default: break;
  }
}

function validar() {
  if (w.paso === 1 && !w.integrantes.some((p) => p.tipo === 'adulto')) { avisar('Tiene que haber al menos un adulto.', { tipo: 'error' }); return false; }
  if (w.paso === 2) {
    const malo = w.ingresos.find((x) => x.monto && leerMonto(x.monto) === null);
    if (malo) { avisar(`No entendí el monto de "${malo.nombre}".`, { tipo: 'error' }); return false; }
  }
  if (w.paso === 3) {
    const malo = w.gastos.find((g) => g.incluido && g.monto && leerMonto(g.monto) === null);
    if (malo) { avisar(`No entendí el monto de "${malo.nombre}".`, { tipo: 'error' }); return false; }
  }
  return true;
}

async function crear() {
  if (w.clave !== w.clave2) { avisar('Las contraseñas no coinciden.', { tipo: 'error' }); return; }
  const r = {
    nombre: w.nombre.trim() || 'Mi hogar', region: w.region, vivienda: w.vivienda, dolar: w.dolar,
    integrantes: w.integrantes.map((p, k) => ({ nombre: nombrePersona(p, k), tipo: p.tipo, edad: p.edad === '' ? null : Number(p.edad), sexo: p.sexo || null })),
    ingresos: w.ingresos.filter((x) => x.nombre.trim()).map((x) => ({ nombre: x.nombre.trim(), monto: leerMonto(x.monto) || 0, moneda: x.moneda, aguinaldo: x.aguinaldo, personaIndice: Number.isInteger(x.persona) ? x.persona : null })),
    gastos: w.gastos.filter((g) => g.incluido).map((g) => ({ indice: g.indice, nombre: g.nombre, naturaleza: g.naturaleza, clase: g.clase, monto: leerMonto(g.monto) || 0 })),
    fondoMeses: w.fondoMeses, fondoAporte: leerMonto(w.fondoAporte) || 0,
    meta: w.meta.nombre.trim() ? { nombre: w.meta.nombre.trim(), monto: leerMonto(w.meta.monto) || 0, fecha: w.meta.fecha || null } : null
  };
  const hogar = hogarDesdeAsistente(r, { mes: mesActual() });
  cargarHogar(hogar, {});
  const g = await guardarComo({ clave: w.clave || null });
  w = null;
  irA('planilla');
  if (!g.ok) avisar('El hogar todavía no está guardado en un archivo. Usá Archivo › Guardar como cuando quieras.', { duracion: 8000 });
  if (!estado.ajustes.recorrido) setTimeout(() => iniciarRecorrido(), 400);
}

export default { titulo: 'Crear un hogar', icono: 'casa', render };
export function reiniciarAsistente() { w = null; }
