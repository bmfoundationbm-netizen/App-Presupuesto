/* Mi Presupuesto · utilidades compartidas por las herramientas de datos */
'use strict';
const zlib = require('zlib');

const AGENTE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MiPresupuesto (+https://github.com/bmfoundationbm-netizen/App-Presupuesto)';
const SERIES_API = 'https://apis.datos.gob.ar/series/api/series/';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Descarga con reintentos. Las fuentes públicas fallan seguido por un rato y vuelven.
async function bajar(url, { tipo = 'texto', intentos = 4, timeoutMs = 90000 } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: { 'user-agent': AGENTE }, signal: ctrl.signal, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      if (tipo === 'json') return await r.json();
      if (tipo === 'buffer') return Buffer.from(await r.arrayBuffer());
      return await r.text();
    } catch (e) {
      ultimo = e;
      if (i < intentos - 1) await esperar(2000 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw ultimo;
}

// API de series de tiempo de datos.gob.ar: devuelve { ids: { 'AAAA-MM': valor } } mensual.
async function series(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const url = `${SERIES_API}?ids=${lote.join(',')}&format=json&limit=5000&metadata=none`;
    const j = await bajar(url, { tipo: 'json' });
    for (const id of lote) out[id] = {};
    for (const fila of j.data) {
      const m = String(fila[0]).slice(0, 7);
      lote.forEach((id, k) => {
        const v = fila[k + 1];
        if (v !== null && v !== undefined && Number.isFinite(Number(v))) out[id][m] = Number(v);
      });
    }
  }
  return out;
}

// CSV simple con comillas opcionales.
function leerCsv(texto, sep = ',') {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Extrae un archivo de un ZIP (deflate o sin comprimir) leyendo el directorio central.
function extraerDeZip(buf, nombre) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const nombres = [];
  for (let k = 0; k < total; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP con directorio central dañado');
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const n = buf.toString('latin1', p + 46, p + 46 + largoNombre);
    nombres.push(n);
    if (!nombre || n === nombre || n.toLowerCase().endsWith(String(nombre).toLowerCase())) {
      const ln = buf.readUInt16LE(local + 26);
      const le = buf.readUInt16LE(local + 28);
      const ini = local + 30 + ln + le;
      const datos = buf.subarray(ini, ini + comprimido);
      if (metodo === 0) return Buffer.from(datos);
      if (metodo === 8) return zlib.inflateRawSync(datos);
      throw new Error(`Método de compresión ${metodo} no soportado`);
    }
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  throw new Error(`No está ${nombre} en el ZIP (hay: ${nombres.join(', ')})`);
}

// Meses como texto 'AAAA-MM'.
function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function mesesEntre(desde, hasta) {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

// Convierte { 'AAAA-MM': v } en { desde, valores: [...] } sin huecos (los huecos quedan en null).
function aArreglo(mapa, decimales = 4) {
  const meses = Object.keys(mapa).sort();
  if (!meses.length) return null;
  const desde = meses[0], hasta = meses[meses.length - 1];
  const f = 10 ** decimales;
  const valores = [];
  for (let i = 0; i <= mesesEntre(desde, hasta); i++) {
    const v = mapa[sumarMeses(desde, i)];
    valores.push(v === undefined ? null : Math.round(v * f) / f);
  }
  return { desde, valores };
}

module.exports = { bajar, series, leerCsv, extraerDeZip, sumarMeses, mesesEntre, aArreglo, esperar };
