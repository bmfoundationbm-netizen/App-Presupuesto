// Mi Presupuesto · herramientas de interfaz: HTML seguro, íconos, diálogos, avisos y menús
//
// Todo texto que viene de un archivo (nombres, descripciones, lo importado de un banco)
// pasa por h``, que lo escapa. Solo lo envuelto en crudo() entra como HTML.

import { pesos, dolares, formatear, leerMonto } from './lib/dinero.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

class Crudo { constructor(s) { this.s = s; } toString() { return this.s; } }
export const crudo = (s) => new Crudo(String(s));

function valor(v) {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof Crudo) return v.s;
  if (Array.isArray(v)) return v.map(valor).join('');
  return esc(v);
}

export function h(partes, ...valores) {
  let out = partes[0];
  for (let i = 0; i < valores.length; i++) out += valor(valores[i]) + partes[i + 1];
  return new Crudo(out);
}

export function montar(el, contenido) { el.innerHTML = Array.isArray(contenido) ? contenido.map(valor).join('') : valor(contenido); }

// ── Íconos (trazo de 1.75, 24×24) ───────────────────────────────────────────────
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONOS = {
  planilla: P('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>'),
  movimientos: P('<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/>'),
  presupuestos: P('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
  ahorro: P('<path d="M5 11a7 6 0 0 1 13-2.5h2v4l-2 1v2.5l-2 1.5h-2v-1.5H10V18H8v-2.4A6 6 0 0 1 5 11z"/><circle cx="14.5" cy="10.5" r=".8" fill="currentColor"/>'),
  familia: P('<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c.6-3.6 2.6-5.5 5-5.5s4.4 1.9 5 5.5M13.5 20c.4-2.6 1.8-4 3.5-4s3.1 1.4 3.5 4"/>'),
  analisis: P('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11.5l2 2 3.5-4"/>'),
  graficos: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  sankey: P('<path d="M3 5c8 0 8 7 18 7M3 12c8 0 8 0 18 0M3 19c8 0 8-7 18-7"/>'),
  datos: P('<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  ajustes: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  ayuda: P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01"/>'),
  campana: P('<path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  mas: P('<path d="M12 5v14M5 12h14"/>'),
  menos: P('<path d="M5 12h14"/>'),
  cerrar: P('<path d="M6 6l12 12M18 6L6 18"/>'),
  izquierda: P('<path d="M15 6l-6 6 6 6"/>'),
  derecha: P('<path d="M9 6l6 6-6 6"/>'),
  abajo: P('<path d="M6 9l6 6 6-6"/>'),
  puntos: P('<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>'),
  editar: P('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  borrar: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  candado: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  abierto: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  ok: P('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alerta: P('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
  deshacer: P('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  rehacer: P('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  exportar: P('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>'),
  importar: P('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>'),
  archivo: P('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'),
  carpeta: P('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  guardar: P('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>'),
  dolar: P('<path d="M12 3v18M16.5 7.5c-.8-1.5-2.4-2-4.5-2-2.5 0-4 1.2-4 3s1.3 2.7 4 3.2 4.3 1.4 4.3 3.3-1.6 3.2-4.3 3.2c-2.2 0-3.9-.7-4.6-2.3"/>'),
  calendario: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  tarjeta: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  estrella: P('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>'),
  chispa: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  copiar: P('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  ipc: P('<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>'),
  casa: P('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  enlace: P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  filtro: P('<path d="M4 5h16l-6 7v6l-4 2v-8z"/>'),
  buscar: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  refrescar: P('<path d="M20 11a8 8 0 0 0-14.7-3.5M4 4v4h4M4 13a8 8 0 0 0 14.7 3.5M20 20v-4h-4"/>'),
  personas: P('<circle cx="9" cy="8" r="3"/><path d="M3 20c.5-3.4 2.9-5.5 6-5.5s5.5 2.1 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5.5M18 14.8c1.7.7 2.8 2.6 3 5.2"/>')
};
export const icono = (n) => crudo(ICONOS[n] || '');

export const LOGO = `<svg class="marca-logo" viewBox="0 0 32 32" aria-hidden="true">
  <rect width="32" height="32" rx="8" fill="#2a78d6"/>
  <path d="M6 9.5c7 0 7 6 13 6h7M6 16c7 0 7 0 13 0h7M6 22.5c7 0 7-6 13-6h7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>
  <circle cx="26" cy="16" r="2.6" fill="#fff"/>
</svg>`;


// ── Formato ─────────────────────────────────────────────────────────────────────
// En la planilla se muestran pesos enteros (sin centavos); el detalle muestra todo.
export const enteros = (c) => (c === null || c === undefined ? null : Math.round(c / 100) * 100);
export function montoCelda(c, moneda = 'ARS') {
  if (c === null || c === undefined) return '';
  return moneda === 'USD' ? `US$ ${formatear(c, { decimales: false })}` : formatear(enteros(c), { decimales: false });
}
export const montoTexto = (c, moneda = 'ARS') => (moneda === 'USD' ? dolares(c) : pesos(c));
// Pesos redondeados a la unidad, para totales e indicadores.
export const pesosRedondos = (c) => pesos(Math.round((c || 0) / 100) * 100);
export { leerMonto };

// ── Avisos emergentes ───────────────────────────────────────────────────────────
let contTostadas = null;
export function avisar(texto, { tipo = 'info', duracion = 4200, accion = null } = {}) {
  if (!contTostadas) { contTostadas = document.createElement('div'); contTostadas.className = 'tostadas'; document.body.appendChild(contTostadas); }
  const t = document.createElement('div');
  t.className = `tostada ${tipo}`;
  t.innerHTML = `${ICONOS[tipo === 'error' ? 'alerta' : tipo === 'ok' ? 'ok' : 'info']}<span></span>`;
  t.querySelector('span').textContent = texto;
  if (accion) {
    const b = document.createElement('button');
    b.textContent = accion.texto;
    b.onclick = () => { accion.fn(); t.remove(); };
    t.appendChild(b);
  }
  contTostadas.appendChild(t);
  setTimeout(() => t.remove(), duracion);
}

// ── Diálogos ────────────────────────────────────────────────────────────────────
const esPrimario = (b) => !!(b && b.tipo && b.tipo.split(' ').includes('primario'));
// dialogo({ titulo, cuerpo (h``), botones: [{ texto, valor, tipo, izquierda }], ancho, alAbrir })
// Devuelve una promesa con { boton, datos (FormData como objeto), el }.
export function dialogo({ titulo, cuerpo = '', botones = [{ texto: 'Aceptar', valor: 'ok', tipo: 'primario' }], ancho = '', alAbrir = null, cerrable = true, validar = null }) {
  return new Promise((resolver) => {
    const previo = document.activeElement;
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = String(h`
      <form class="dialogo ${ancho}" role="dialog" aria-modal="true" novalidate>
        <div class="dialogo-cab"><h2></h2>${cerrable ? h`<button type="button" class="boton icono fantasma" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>` : ''}</div>
        <div class="dialogo-cuerpo">${cuerpo}</div>
        <div class="dialogo-pie">${botones.map((b, i) => h`<button type="${esPrimario(b) ? 'submit' : 'button'}" class="boton ${b.tipo || ''} ${b.izquierda ? 'izquierda' : ''}" data-indice="${i}">${b.texto}</button>`)}</div>
      </form>`);
    velo.querySelector('h2').textContent = titulo;
    const form = velo.querySelector('form');
    const terminar = (boton) => {
      const datos = {};
      for (const el of form.querySelectorAll('[name]')) {
        if (el.type === 'checkbox') datos[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) datos[el.name] = el.value; }
        else datos[el.name] = el.value;
      }
      if (boton && validar) {
        const err = validar(datos, form);
        if (err) { avisar(err, { tipo: 'error' }); return; }
      }
      velo.remove();
      document.removeEventListener('keydown', teclas, true);
      if (previo && previo.focus) previo.focus();
      resolver({ boton, datos, el: form });
    };
    const teclas = (e) => { if (e.key === 'Escape' && cerrable) { e.stopPropagation(); e.preventDefault(); terminar(null); } };
    document.addEventListener('keydown', teclas, true);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const i = botones.findIndex(esPrimario);
      terminar(i >= 0 ? botones[i].valor : 'ok');
    });
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-indice]');
      if (b && !esPrimario(botones[b.dataset.indice])) terminar(botones[b.dataset.indice].valor);
      if (e.target.closest('[data-cerrar]')) terminar(null);
    });
    velo.addEventListener('mousedown', (e) => { if (e.target === velo && cerrable) terminar(null); });
    document.body.appendChild(velo);
    const foco = form.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea') || form.querySelector('.boton.primario');
    if (foco) setTimeout(() => { foco.focus(); if (foco.select) foco.select(); }, 20);
    if (alAbrir) alAbrir(form);
  });
}

export async function confirmar(titulo, texto, { si = 'Aceptar', no = 'Cancelar', peligro = false } = {}) {
  const r = await dialogo({
    titulo, cuerpo: h`<p>${texto}</p>`,
    botones: [{ texto: no, valor: 'no' }, { texto: si, valor: 'si', tipo: peligro ? 'primario peligro lleno' : 'primario' }]
  });
  return r.boton === 'si';
}

export async function pedirTexto(titulo, { etiqueta = '', valor = '', ayuda = '', tipo = 'text' } = {}) {
  const r = await dialogo({
    titulo,
    cuerpo: h`<div class="campo"><label>${etiqueta}</label><input class="entrada" name="valor" type="${tipo}" value="${valor}" autofocus>${ayuda ? h`<div class="ayuda">${ayuda}</div>` : ''}</div>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Aceptar', valor: 'ok', tipo: 'primario' }]
  });
  return r.boton === 'ok' ? r.datos.valor : null;
}

// ── Menú contextual ─────────────────────────────────────────────────────────────
// opciones: [{ texto, icono, fn, peligro } | '-']
export function menu(x, y, opciones) {
  cerrarMenus();
  const m = document.createElement('div');
  m.className = 'menu';
  for (const o of opciones) {
    if (o === '-') { m.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    if (o.peligro) b.className = 'peligro';
    b.innerHTML = o.icono ? ICONOS[o.icono] : '';
    b.appendChild(document.createTextNode(o.texto));
    b.onclick = () => { cerrarMenus(); o.fn(); };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, innerWidth - r.width - 8)}px`;
  m.style.top = `${Math.min(y, innerHeight - r.height - 8)}px`;
  setTimeout(() => document.addEventListener('mousedown', cerrarSiAfuera, true), 0);
}
function cerrarSiAfuera(e) { if (!e.target.closest('.menu')) cerrarMenus(); }
export function cerrarMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  document.removeEventListener('mousedown', cerrarSiAfuera, true);
}

// ── Ayudas flotantes (data-ayuda="texto") ──────────────────────────────────────
let flotante = null;
export function activarAyudasFlotantes() {
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-ayuda]');
    if (!el) { if (flotante) flotante.remove(); flotante = null; return; }
    if (!flotante) { flotante = document.createElement('div'); flotante.className = 'ayuda-flotante'; document.body.appendChild(flotante); }
    flotante.textContent = el.dataset.ayuda;
    const r = el.getBoundingClientRect();
    const f = flotante.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + f.height > innerHeight - 8) top = r.top - f.height - 6;
    flotante.style.top = `${top}px`;
    flotante.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - f.width / 2, innerWidth - f.width - 8))}px`;
  });
  document.addEventListener('pointerdown', () => { if (flotante) { flotante.remove(); flotante = null; } });
}

// Opciones de <select> con la elegida marcada.
export function opciones(lista, elegida) {
  return lista.map(([valor, texto]) => h`<option value="${valor}" ${String(valor) === String(elegida) ? crudo('selected') : ''}>${texto}</option>`);
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.ahora = (...a) => { clearTimeout(t); t = null; return fn(...a); };
  d.pendiente = () => t !== null;
  return d;
}
