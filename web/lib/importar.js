// Mi Presupuesto · importar movimientos y planillas (Excel o CSV de cualquier banco)
//
// Cada banco arma su archivo distinto. Por eso no hay formatos fijos: se detecta la fila
// de encabezados y se proponen las columnas de fecha, descripción y monto (o débito y
// crédito), que cada uno confirma. La elección se guarda como plantilla para la próxima.

import { leerFecha, MES_CORTO, NOMBRES_MES } from './fechas.js';
import { leerMonto } from './dinero.js';
import { SUGERIDAS } from './catalogo.js';

// ── CSV ─────────────────────────────────────────────────────────────────────────
export function detectarSeparador(texto) {
  const muestra = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  let mejor = ',', puntaje = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const cuentas = muestra.map((l) => partirLinea(l, sep).length);
    const moda = cuentas.sort((a, b) => cuentas.filter((x) => x === b).length - cuentas.filter((x) => x === a).length)[0] || 1;
    const p = moda > 1 ? moda * cuentas.filter((x) => x === moda).length : 0;
    if (p > puntaje) { puntaje = p; mejor = sep; }
  }
  return mejor;
}

function partirLinea(linea, sep) {
  const out = [];
  let campo = '', comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"') { if (linea[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { out.push(campo); campo = ''; }
    else campo += c;
  }
  out.push(campo);
  return out;
}

export function leerCsv(texto, sep = detectarSeparador(texto)) {
  const filas = [];
  let actual = '';
  let comillas = false;
  // Junta líneas cortadas dentro de comillas.
  for (const linea of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    actual = actual ? `${actual}\n${linea}` : linea;
    comillas = ((actual.match(/"/g) || []).length % 2) === 1;
    if (comillas) continue;
    if (actual.trim() !== '') filas.push(partirLinea(actual, sep).map((x) => x.trim()));
    actual = '';
  }
  return filas;
}

// ── Detección de columnas ───────────────────────────────────────────────────────
const normal = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const esFecha = (v) => leerFecha(v) !== null && !(typeof v === 'number' && v < 20000);
const esMonto = (v) => typeof v === 'number' || (typeof v === 'string' && /\d/.test(v) && leerMonto(v) !== null && !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v.trim()));

export function detectarEncabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const f = filas[i] || [];
    const textos = f.filter((c) => typeof c === 'string' && c.trim() && !esMonto(c) && !esFecha(c)).length;
    if (textos < 2) continue;
    const siguientes = filas.slice(i + 1, i + 6);
    const conDatos = siguientes.filter((s) => s && s.some(esFecha) && s.some((c) => esMonto(c) && !esFecha(c))).length;
    if (conDatos >= Math.min(2, siguientes.length)) return i;
  }
  return 0;
}

export function proponerColumnas(filas, filaEncabezado) {
  const cab = (filas[filaEncabezado] || []).map(normal);
  const datos = filas.slice(filaEncabezado + 1, filaEncabezado + 41);
  const n = Math.max(...filas.slice(filaEncabezado, filaEncabezado + 41).map((f) => (f ? f.length : 0)), 0);
  const prop = (col, test) => datos.filter((f) => f && f[col] !== null && f[col] !== undefined && f[col] !== '').reduce((s, f) => s + (test(f[col]) ? 1 : 0), 0) / Math.max(1, datos.filter((f) => f && f[col] !== null && f[col] !== '' && f[col] !== undefined).length);
  const buscar = (re) => cab.findIndex((c) => re.test(c));
  const res = { fecha: -1, descripcion: -1, monto: -1, debito: -1, credito: -1 };
  res.fecha = buscar(/^fecha|fecha (de )?(operacion|movimiento|origen)|^date/);
  if (res.fecha < 0) for (let c = 0; c < n; c++) if (prop(c, esFecha) > 0.7) { res.fecha = c; break; }
  res.descripcion = buscar(/descrip|concepto|detalle|referencia|movimiento|comercio|establecimiento/);
  if (res.descripcion < 0) {
    let mejor = -1, largo = 0;
    for (let c = 0; c < n; c++) {
      if (c === res.fecha) continue;
      const l = datos.reduce((s, f) => s + (f && typeof f[c] === 'string' && !esMonto(f[c]) ? f[c].length : 0), 0);
      if (l > largo) { largo = l; mejor = c; }
    }
    res.descripcion = mejor;
  }
  res.debito = buscar(/debito|debe|egreso|cargo|salida/);
  res.credito = buscar(/credito|haber|ingreso|abono|entrada/);
  res.monto = buscar(/^importe|^monto|^valor|importe en pesos|monto en pesos|^pesos|\$/);
  if (res.monto < 0 && (res.debito < 0 || res.credito < 0)) {
    for (let c = n - 1; c >= 0; c--) {
      if (c === res.fecha || c === res.descripcion || /saldo/.test(cab[c] || '')) continue;
      if (prop(c, esMonto) > 0.8) { res.monto = c; break; }
    }
  }
  if (res.debito >= 0 && res.credito >= 0) res.monto = -1;
  return res;
}

// Arma movimientos a partir de las filas y la elección de columnas.
// signo: 'negativoEsGasto' (los gastos vienen con signo menos) | 'positivo' (todo es gasto).
export function interpretarFilas(filas, { filaEncabezado, columnas, signo = 'negativoEsGasto' }) {
  const out = [];
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f) continue;
    const fecha = leerFecha(f[columnas.fecha]);
    if (!fecha) continue;
    let monto;
    if (columnas.monto >= 0) {
      const m = leerMonto(f[columnas.monto]);
      if (m === null || m === 0) continue;
      monto = signo === 'positivo' ? Math.abs(m) : -m;
    } else {
      const d = leerMonto(f[columnas.debito]) || 0;
      const c = leerMonto(f[columnas.credito]) || 0;
      if (!d && !c) continue;
      monto = Math.abs(d) - Math.abs(c);
    }
    const descripcion = columnas.descripcion >= 0 ? String(f[columnas.descripcion] ?? '').replace(/\s+/g, ' ').trim() : '';
    // monto > 0: salida de plata (gasto). monto < 0: entrada (ingreso, reintegro).
    out.push({ fila: i, fecha, descripcion, monto });
  }
  return out;
}

export function firmaEncabezado(filas, filaEncabezado) {
  return (filas[filaEncabezado] || []).map(normal).join('|');
}

// ── Sugerir el concepto ─────────────────────────────────────────────────────────
const PALABRAS = [
  [/supermerc|coto|carrefour|jumbo|disco|vea|supermercado dia|changomas|walmart|la anonima|chango mas|makro|vital/, 'Supermercado'],
  [/verduler|carnicer|fiambrer|polleria/, 'Verdulería y carnicería'],
  [/farmacia|farmacity|medicament/, 'Medicamentos'],
  [/osde|swiss medical|galeno|medicus|omint|prepaga|obra social|ioma|pami/, 'Prepaga u obra social'],
  [/edenor|edesur|epec|edelap|luz |electric/, 'Electricidad'],
  [/metrogas|naturgy|camuzzi|litoral gas|ecogas|gas /, 'Gas'],
  [/aysa|absa|aguas |agua /, 'Agua'],
  [/fibertel|telecentro|personal flow|movistar fibra|claro hogar|internet|starlink/, 'Internet'],
  [/personal|movistar|claro|tuenti|celular|recarga/, 'Celulares'],
  [/netflix|spotify|disney|hbo|max |prime video|youtube|apple\.com|google play|paramount|crunchyroll|suscrip/, 'Streaming y suscripciones'],
  [/ypf|shell|axion|puma|nafta|combustible|estacion de servicio/, 'Combustible'],
  [/sube|subte|colectivo|tren |trenes/, 'Transporte público'],
  [/uber|cabify|didi|taxi|remis/, 'Taxis y aplicaciones'],
  [/pedidos ?ya|rappi|mcdonald|burger|resto|restaurant|parrilla|pizzer|cafe|starbucks|delivery/, 'Delivery y comida afuera'],
  [/colegio|escuela|cuota escolar|instituto|universidad/, 'Cuota escolar'],
  [/alquiler/, 'Alquiler'],
  [/expensa|consorcio/, 'Expensas'],
  [/seguro|la caja|sancor|federacion patronal|zurich|mapfre|rio uruguay/, 'Seguros'],
  [/gimnasio|megatlon|sportclub|club /, 'Deportes y gimnasio'],
  [/comision|mantenimiento de cuenta|impuesto ley|iva |sellos|percepcion|interes/, 'Gastos bancarios y comisiones'],
  [/abl|municipal|rentas|arba|agip/, 'Impuestos municipales (ABL)'],
  [/sueldo|haberes|remuneracion|acreditacion de haberes/, 'Sueldo']
];

// reglas: [{ texto, lineaId }] aprendidas; lineas: líneas del hogar (con nombre).
export function sugerirLinea(descripcion, { reglas = [], lineas = [] } = {}) {
  const d = normal(descripcion);
  if (!d) return null;
  const regla = reglas.filter((r) => d.includes(normal(r.texto))).sort((a, b) => b.texto.length - a.texto.length)[0];
  if (regla && lineas.some((l) => l.id === regla.lineaId)) return { lineaId: regla.lineaId, motivo: 'regla' };
  for (const [re, nombre] of PALABRAS) {
    if (!re.test(` ${d} `)) continue;
    const l = lineas.find((x) => normal(x.nombre) === normal(nombre)) || lineas.find((x) => normal(x.nombre).includes(normal(nombre).split(' ')[0]));
    if (l) return { lineaId: l.id, motivo: 'palabra' };
  }
  const directo = lineas.find((l) => l.nombre.length >= 4 && d.includes(normal(l.nombre)));
  if (directo) return { lineaId: directo.id, motivo: 'nombre' };
  return null;
}

// La palabra más útil de una descripción para guardar como regla ("COTO SUC 123" → "coto").
export function claveDeRegla(descripcion) {
  const palabras = normal(descripcion).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !['compra', 'pago', 'debito', 'credito', 'tarjeta', 'visa', 'master', 'transferencia', 'suc', 'cuota'].includes(p));
  return palabras.slice(0, 2).join(' ');
}

export function esDuplicado(mov, existentes) {
  return existentes.some((m) => m.fecha === mov.fecha && m.monto === Math.abs(mov.monto) && normal(m.descripcion) === normal(mov.descripcion));
}

// ── Planillas con meses en columnas ─────────────────────────────────────────────
const MESES_NORM = NOMBRES_MES.map(normal);
const CORTOS_NORM = MES_CORTO.map(normal);

// Devuelve, para cada columna del encabezado, el número de mes (1-12) o null.
export function detectarMeses(encabezado) {
  return (encabezado || []).map((c) => {
    if (c instanceof Date) return c.getMonth() + 1;
    const f = leerFecha(c);
    if (f && typeof c !== 'number') return Number(f.slice(5, 7));
    const t = normal(c).replace(/[^a-z]/g, ' ').trim().split(/\s+/)[0] || '';
    let k = MESES_NORM.indexOf(t);
    if (k < 0) k = CORTOS_NORM.indexOf(t.slice(0, 3));
    if (k < 0 && t === 'set') k = 8;
    return k >= 0 && t.length >= 3 ? k + 1 : null;
  });
}

export function detectarEncabezadoMeses(filas) {
  let mejor = -1, cuantos = 0;
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const n = detectarMeses(filas[i]).filter(Boolean).length;
    if (n > cuantos) { cuantos = n; mejor = i; }
  }
  return cuantos >= 3 ? mejor : -1;
}

// Filas de concepto con sus montos por mes. Saltea totales y filas vacías.
export function interpretarPlanilla(filas, { filaEncabezado, colConcepto, meses }) {
  const out = [];
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f) continue;
    const nombre = String(f[colConcepto] ?? '').trim();
    if (!nombre || /^total|^subtotal|^saldo|^resultado/i.test(normal(nombre))) continue;
    const valores = {};
    let alguno = false;
    meses.forEach((mes, col) => {
      if (!mes) return;
      const v = leerMonto(f[col]);
      if (v !== null && v !== 0) { valores[mes] = Math.abs(v); alguno = true; }
    });
    if (alguno) out.push({ fila: i, nombre, valores });
  }
  return out;
}

// Categoría probable de un concepto de planilla (por las subcategorías sugeridas).
export function indiceProbable(nombre) {
  const n = normal(nombre);
  for (const [indice, lista] of Object.entries(SUGERIDAS)) {
    if (lista.some(([s]) => n.includes(normal(s).split(' ')[0]))) return indice;
  }
  for (const [re, nombreSug] of PALABRAS) {
    if (re.test(` ${n} `)) {
      for (const [indice, lista] of Object.entries(SUGERIDAS)) if (lista.some(([s]) => s === nombreSug)) return indice;
    }
  }
  return 'varios';
}
