/* Mi Presupuesto · datos públicos y avisos de versión nueva
 *
 * El programa trae web/data/datos.json (IPC, canasta, dólar, REM) y engho.json. Una tarea
 * de GitHub los vuelve a armar todas las semanas en el repositorio; al abrir el programa y
 * cada 6 horas se baja la versión del repositorio y, si es más nueva, se guarda en la
 * carpeta del usuario y se usa en lugar de la que vino con el programa.
 * El dólar del día se consulta aparte (dolarapi.com) porque cambia todos los días.
 * Todo esto lo hace este proceso: la ventana no tiene acceso a internet.
 */
'use strict';
const { app } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const REPO = 'bmfoundationbm-netizen/App-Presupuesto';
const URL_DATOS = `https://raw.githubusercontent.com/${REPO}/main/web/data/datos.json`;
const URL_VERSION = `https://api.github.com/repos/${REPO}/releases/latest`;
const URL_DOLAR = 'https://dolarapi.com/v1/dolares';
const AGENTE = `MiPresupuesto/${app.getVersion()} (+https://github.com/${REPO})`;

const INCLUIDO = path.join(__dirname, '..', 'web', 'data', 'datos.json');
const ENGHO = path.join(__dirname, '..', 'web', 'data', 'engho.json');
const DESCARGADO = () => path.join(app.getPath('userData'), 'datos', 'datos.json');

async function leerJson(ruta) {
  try { return JSON.parse(await fs.readFile(ruta, 'utf8')); } catch (e) { return null; }
}

async function bajar(url, tipo = 'json', timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'user-agent': AGENTE, accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
    return tipo === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

// Los datos vigentes: los descargados si son más nuevos que los que vinieron con el programa.
async function vigentes() {
  const incluido = await leerJson(INCLUIDO);
  const descargado = await leerJson(DESCARGADO());
  if (descargado && descargado.ipc && (!incluido || descargado.generado > incluido.generado)) {
    return { datos: descargado, origen: 'descargado' };
  }
  return { datos: incluido, origen: 'incluido' };
}

async function obtener() {
  const { datos, origen } = await vigentes();
  return { datos, engho: await leerJson(ENGHO), origen, generado: datos ? datos.generado : null };
}

// Busca datos nuevos en el repositorio. estado: 'nuevos' | 'iguales' | 'error'.
async function actualizar() {
  try {
    const remoto = await bajar(URL_DATOS);
    if (!remoto || !remoto.ipc || !remoto.generado) return { estado: 'error', error: 'Los datos del repositorio vinieron incompletos.' };
    const { datos } = await vigentes();
    if (datos && datos.generado >= remoto.generado) return { estado: 'iguales', generado: datos.generado };
    await fs.mkdir(path.dirname(DESCARGADO()), { recursive: true });
    await fs.writeFile(DESCARGADO(), JSON.stringify(remoto));
    return { estado: 'nuevos', generado: remoto.generado };
  } catch (e) {
    return { estado: 'error', error: e.name === 'AbortError' ? 'Sin respuesta (¿sin internet?)' : e.message };
  }
}

const CASAS = { oficial: 'oficial', blue: 'blue', bolsa: 'mep', mayorista: 'mayorista' };

async function dolarHoy() {
  try {
    const lista = await bajar(URL_DOLAR);
    const out = {};
    for (const x of lista) {
      const clave = CASAS[x.casa];
      if (clave && x.venta > 0) out[clave] = { compra: x.compra, venta: x.venta, fecha: String(x.fechaActualizacion || '').slice(0, 10) };
    }
    return { ok: true, cotizaciones: out };
  } catch (e) { return { ok: false, error: e.message }; }
}

function compararVersiones(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

async function buscarVersion() {
  try {
    const r = await bajar(URL_VERSION);
    const version = String(r.tag_name || '').replace(/^v/, '');
    if (version && compararVersiones(version, app.getVersion()) > 0) {
      return { nueva: true, version, url: r.html_url, notas: r.body || '' };
    }
    return { nueva: false, version: app.getVersion() };
  } catch (e) {
    return { nueva: false, error: e.status === 404 ? 'Todavía no hay versiones publicadas.' : e.message };
  }
}

module.exports = { obtener, actualizar, dolarHoy, buscarVersion, compararVersiones, REPO };
