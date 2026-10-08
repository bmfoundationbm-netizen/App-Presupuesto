// Mi Presupuesto · estado de la app: hogar abierto, deshacer/rehacer y guardado automático
//
// Toda modificación del hogar pasa por mutar(): guarda una copia para deshacer, vuelve a
// armar el contexto de cálculo, programa el guardado y avisa a la pantalla.

import { crearContexto } from './lib/calculos.js';
import { normalizarHogar } from './lib/modelo.js';
import { mesActual, anioDe } from './lib/fechas.js';
import { debounce } from './ui.js';

export const estado = {
  hogar: null,
  ruta: null,
  cifrado: false,
  ejemplo: false,
  datos: null,
  engho: null,
  origenDatos: null,
  ajustes: {},
  ctx: null,
  vista: 'inicio',
  guardado: 'sinArchivo',     // 'guardado' | 'pendiente' | 'guardando' | 'error' | 'sinArchivo'
  errorGuardado: null,
  versionNueva: null,
  dolarHoy: null,
  info: {},
  ui: {
    anio: anioDe(mesActual()),
    mesFoco: mesActual(),
    modo: 'plan',               // planilla: 'plan' | 'real' | 'comparar'
    seleccion: null,            // { lineaId, mes }
    panel: true,
    mostrarVacias: false
  }
};

const deshacerPila = [];
const rehacerPila = [];
const MAX_PASOS = 80;
const oyentes = new Set();

export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
export function notificar(motivo) { for (const fn of oyentes) fn(motivo); }

export function recalcular() {
  estado.ctx = estado.hogar
    ? crearContexto(estado.hogar, estado.datos, {
      ipc: { manual: estado.ajustes.ipcManual || {}, proyeccion: estado.ajustes.proyeccion || { modo: 'rem' } },
      mesHoy: mesActual()
    })
    : null;
}

export function cargarHogar(hogar, { ruta = null, cifrado = false, ejemplo = false } = {}) {
  const { hogar: h, avisos } = normalizarHogar(hogar);
  estado.hogar = h;
  estado.ruta = ruta;
  estado.cifrado = cifrado;
  estado.ejemplo = ejemplo;
  estado.guardado = ruta ? 'guardado' : 'sinArchivo';
  estado.errorGuardado = null;
  deshacerPila.length = 0;
  rehacerPila.length = 0;
  const hoy = mesActual();
  estado.ui.anio = anioDe(hoy);
  estado.ui.mesFoco = hoy;
  estado.ui.seleccion = null;
  estado.ui.modo = (h.preferencias && h.preferencias.modo) || 'plan';
  recalcular();
  notificar('hogar');
  return avisos;
}

export function cerrarHogar() {
  estado.hogar = null;
  estado.ruta = null;
  estado.cifrado = false;
  estado.ejemplo = false;
  estado.ctx = null;
  deshacerPila.length = 0;
  rehacerPila.length = 0;
  estado.guardado = 'sinArchivo';
  notificar('hogar');
}

// historial: false para cambios de interfaz que no conviene deshacer (plegar una categoría).
export function mutar(fn, { historial = true } = {}) {
  if (!estado.hogar) return undefined;
  if (historial) {
    deshacerPila.push(JSON.stringify(estado.hogar));
    if (deshacerPila.length > MAX_PASOS) deshacerPila.shift();
    rehacerPila.length = 0;
  }
  const r = fn(estado.hogar);
  estado.hogar.modificado = new Date().toISOString();
  recalcular();
  programarGuardado();
  notificar('mutacion');
  return r;
}

export const puedeDeshacer = () => deshacerPila.length > 0;
export const puedeRehacer = () => rehacerPila.length > 0;

export function deshacer() {
  if (!deshacerPila.length) return false;
  rehacerPila.push(JSON.stringify(estado.hogar));
  estado.hogar = JSON.parse(deshacerPila.pop());
  recalcular();
  programarGuardado();
  notificar('mutacion');
  return true;
}

export function rehacer() {
  if (!rehacerPila.length) return false;
  deshacerPila.push(JSON.stringify(estado.hogar));
  estado.hogar = JSON.parse(rehacerPila.pop());
  recalcular();
  programarGuardado();
  notificar('mutacion');
  return true;
}

async function guardarAhora() {
  if (!estado.hogar || !estado.ruta) {
    estado.guardado = 'sinArchivo';
    notificar('guardado');
    return { ok: false, sinArchivo: true };
  }
  estado.guardado = 'guardando';
  notificar('guardado');
  const r = await window.mp.archivo.guardar(JSON.stringify(estado.hogar));
  estado.guardado = r.ok ? 'guardado' : 'error';
  estado.errorGuardado = r.ok ? null : r.error;
  notificar('guardado');
  return r;
}

const guardarDiferido = debounce(guardarAhora, 700);

export function programarGuardado() {
  if (!estado.ruta) { estado.guardado = 'sinArchivo'; return; }
  estado.guardado = 'pendiente';
  guardarDiferido();
}

// Guarda ya lo que esté pendiente (antes de cerrar, de abrir otro hogar, etc.).
export async function guardarYa() {
  if (!estado.ruta || !estado.hogar) return { ok: true };
  if (estado.guardado === 'guardado') return { ok: true };
  return guardarDiferido.ahora();
}

export function guardarAjustes(cambios) {
  Object.assign(estado.ajustes, cambios);
  return window.mp.ajustes.guardar(cambios);
}

// Navegación entre pantallas. opciones llega a la vista (por ejemplo, un mes a mostrar).
export function irA(vista, opciones = null) {
  estado.vista = vista;
  estado.opcionesVista = opciones;
  notificar('vista');
}
