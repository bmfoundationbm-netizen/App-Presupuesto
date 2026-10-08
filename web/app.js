// Mi Presupuesto · arranque, estructura de la ventana, navegación y atajos

import {
  estado, alCambiar, notificar, irA, deshacer, rehacer, puedeDeshacer, puedeRehacer,
  guardarYa, recalcular, guardarAjustes
} from './estado.js';
import { h, crudo, montar, icono, avisar, activarAyudasFlotantes, menu, LOGO } from './ui.js';
import { abrirArchivo, abrirEjemplo, guardarComo, cerrarArchivo, nuevoHogar } from './acciones.js';
import { alertas } from './lib/analisis.js';
import { abrirAyuda } from './vistas/ayuda.js';
import { aplicarTemaDesdeAjustes as aplicarTema } from './vistas/tema.js';
import { exportarExcel, exportarPdf } from './vistas/exportar.js';
import { abrirImportacion } from './vistas/importar.js';
import inicio from './vistas/inicio.js';
import asistente from './vistas/asistente.js';
import planilla from './vistas/planilla.js';
import movimientos from './vistas/movimientos.js';
import presupuestos from './vistas/presupuestos.js';
import ahorro from './vistas/ahorro.js';
import familia from './vistas/familia.js';
import analisis from './vistas/analisis.js';
import graficos from './vistas/graficos.js';
import datos from './vistas/datos.js';
import ajustes from './vistas/ajustes.js';

const VISTAS = { inicio, asistente, planilla, movimientos, presupuestos, ahorro, familia, analisis, graficos, datos, ajustes };
const NAV = [
  'planilla', 'movimientos', 'presupuestos', 'ahorro', 'familia', 'analisis', 'graficos', '-', 'datos', 'ajustes'
];



// ── Estructura ──────────────────────────────────────────────────────────────────
function cantidadAvisos() {
  if (!estado.ctx) return { n: 0, nivel: null };
  try {
    const a = alertas(estado.ctx);
    return { n: a.length, nivel: a.some((x) => x.nivel === 'alerta') ? 'alerta' : a.some((x) => x.nivel === 'aviso') ? 'aviso' : 'info' };
  } catch (e) { return { n: 0, nivel: null }; }
}

function textoGuardado() {
  if (estado.ejemplo) return ['Ejemplo sin guardar', 'pendiente'];
  switch (estado.guardado) {
    case 'guardado': return [estado.cifrado ? 'Guardado · con contraseña' : 'Guardado', ''];
    case 'pendiente': case 'guardando': return ['Guardando…', 'pendiente'];
    case 'error': return ['No se pudo guardar', 'error'];
    default: return ['Sin guardar', 'pendiente'];
  }
}

function dibujarEstructura() {
  const raiz = document.getElementById('app');
  montar(raiz, h`
    <div id="franjas"></div>
    <div class="marco">
      <nav class="lateral" aria-label="Secciones">
        <div class="marca">${crudo(LOGO)}<div class="marca-texto"><div class="marca-nombre">Mi Presupuesto</div><div class="marca-hogar" id="nombre-hogar"></div></div></div>
        <div id="nav"></div>
        <div class="nav-pie">
          <button class="nav-item" data-accion="menu-archivo">${icono('archivo')}<span>Archivo</span></button>
        </div>
      </nav>
      <main class="principal">
        <header class="barra-sup">
          <h1 id="titulo-vista"></h1>
          <span class="estado-guardado" id="estado-guardado"><span class="punto"></span><span class="texto"></span></span>
          <span class="espacio"></span>
          <button class="boton icono fantasma" data-accion="deshacer" data-ayuda="Deshacer (Ctrl+Z)">${icono('deshacer')}</button>
          <button class="boton icono fantasma" data-accion="rehacer" data-ayuda="Rehacer (Ctrl+Y)">${icono('rehacer')}</button>
          <button class="boton fantasma" data-accion="avisos" data-ayuda="Avisos del mes y del hogar">${icono('campana')}<span id="num-avisos"></span></button>
          <button class="boton icono fantasma" data-accion="ayuda" data-ayuda="Ayuda de esta pantalla (F1)">${icono('ayuda')}</button>
        </header>
        <div class="contenido" id="contenido"></div>
      </main>
    </div>`);
  raiz.querySelector('.marco').addEventListener('click', clicEstructura);
}

function actualizarEstructura() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const { n, nivel } = cantidadAvisos();
  montar(nav, NAV.map((id) => {
    if (id === '-') return h`<div class="nav-sep"></div>`;
    const v = VISTAS[id];
    return h`<button class="nav-item ${estado.vista === id ? 'activo' : ''}" data-ir="${id}">${icono(v.icono)}<span>${v.titulo}</span>${id === 'analisis' && n && nivel !== 'info' ? h`<span class="insignia ${nivel === 'aviso' ? 'aviso' : ''}">${n}</span>` : ''}</button>`;
  }));
  document.getElementById('nombre-hogar').textContent = estado.hogar ? estado.hogar.nombre : '';
  document.getElementById('titulo-vista').textContent = (VISTAS[estado.vista] || {}).titulo || '';
  document.getElementById('num-avisos').textContent = n ? String(n) : '';
  document.querySelector('[data-accion="deshacer"]').disabled = !puedeDeshacer();
  document.querySelector('[data-accion="rehacer"]').disabled = !puedeRehacer();
  actualizarGuardado();
  dibujarFranjas();
}

function actualizarGuardado() {
  const el = document.getElementById('estado-guardado');
  if (!el) return;
  const [texto, clase] = textoGuardado();
  el.className = `estado-guardado ${clase}`;
  el.querySelector('.texto').textContent = texto;
  el.dataset.ayuda = estado.ruta ? estado.ruta : 'Este hogar todavía no está guardado en un archivo';
}

function dibujarFranjas() {
  const f = document.getElementById('franjas');
  if (!f) return;
  const partes = [];
  if (estado.ejemplo) {
    partes.push(h`<div class="franja aviso">${icono('info')}<span>Estás probando el <strong>hogar de ejemplo</strong>: los cambios no se guardan.</span><span class="espacio"></span>
      <button class="boton chico" data-accion="guardar-como">Guardar una copia</button>
      <button class="boton chico primario" data-accion="nuevo">Crear mi hogar</button></div>`);
  }
  if (estado.guardado === 'error') {
    partes.push(h`<div class="franja aviso">${icono('alerta')}<span>No se pudo guardar: ${estado.errorGuardado || ''}</span><span class="espacio"></span>
      <button class="boton chico" data-accion="reintentar">Reintentar</button><button class="boton chico" data-accion="guardar-como">Guardar en otro lugar</button></div>`);
  }
  if (estado.versionNueva && estado.ajustes.avisoVersion !== estado.versionNueva.version) {
    partes.push(h`<div class="franja">${icono('estrella')}<span>Hay una versión nueva de Mi Presupuesto: <strong>${estado.versionNueva.version}</strong>.</span><span class="espacio"></span>
      <button class="boton chico primario" data-accion="ver-version">Descargar</button><button class="boton chico fantasma" data-accion="ocultar-version">Más tarde</button></div>`);
  }
  montar(f, partes);
  f.onclick = clicEstructura;
}

async function clicEstructura(e) {
  const ir = e.target.closest('[data-ir]');
  if (ir) { irA(ir.dataset.ir); return; }
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  switch (b.dataset.accion) {
    case 'deshacer': deshacer(); break;
    case 'rehacer': rehacer(); break;
    case 'ayuda': abrirAyuda(estado.vista); break;
    case 'avisos': irA('analisis', { seccion: 'avisos' }); break;
    case 'guardar-como': guardarComo(); break;
    case 'nuevo': nuevoHogar(); break;
    case 'reintentar': estado.guardado = 'pendiente'; guardarYa(); break;
    case 'ver-version': window.mp.app.externo(estado.versionNueva.url); break;
    case 'ocultar-version': await guardarAjustes({ avisoVersion: estado.versionNueva.version }); dibujarFranjas(); break;
    case 'menu-archivo': {
      const r = b.getBoundingClientRect();
      menu(r.right + 4, r.top - 230, [
        { texto: 'Nuevo hogar…', icono: 'mas', fn: nuevoHogar },
        { texto: 'Abrir…', icono: 'carpeta', fn: () => abrirArchivo() },
        { texto: 'Guardar como…', icono: 'guardar', fn: () => guardarComo() },
        '-',
        { texto: 'Importar movimientos o planilla…', icono: 'importar', fn: abrirImportacion },
        { texto: 'Exportar a Excel…', icono: 'exportar', fn: exportarExcel },
        { texto: 'Exportar informe en PDF…', icono: 'exportar', fn: exportarPdf },
        '-',
        { texto: 'Abrir el hogar de ejemplo', icono: 'estrella', fn: abrirEjemplo },
        { texto: 'Cerrar este hogar', icono: 'cerrar', fn: cerrarArchivo }
      ]);
      break;
    }
    default: break;
  }
}

// ── Vistas ──────────────────────────────────────────────────────────────────────
let vistaActual = null;

function dibujarVista() {
  const pantallaCompleta = !estado.hogar || estado.vista === 'inicio' || estado.vista === 'asistente';
  const raiz = document.getElementById('app');
  if (pantallaCompleta) {
    vistaActual = null;
    montar(raiz, h`<div class="pantalla-completa" id="contenido"></div>`);
  } else if (!document.getElementById('nav')) {
    dibujarEstructura();
  }
  if (!pantallaCompleta) actualizarEstructura();
  const cont = document.getElementById('contenido');
  const id = pantallaCompleta && estado.vista !== 'asistente' ? 'inicio' : estado.vista;
  const vista = VISTAS[id] || VISTAS.planilla;
  const mismaVista = vistaActual === id;
  const scrolls = {};
  if (mismaVista) {
    scrolls.contenido = [cont.scrollTop, cont.scrollLeft];
    for (const el of cont.querySelectorAll('[data-scroll]')) scrolls[el.dataset.scroll] = [el.scrollTop, el.scrollLeft];
  }
  const nueva = document.createElement('div');
  nueva.className = 'vista-raiz';
  cont.classList.toggle('sin-scroll', !!vista.sinScroll);
  cont.replaceChildren(nueva);
  try {
    vista.render(nueva);
  } catch (err) {
    console.error(err);
    montar(nueva, h`<div class="pagina"><div class="nota alerta">${icono('alerta')}Algo falló al mostrar esta pantalla: ${err.message}</div></div>`);
  }
  if (mismaVista) {
    if (scrolls.contenido) [cont.scrollTop, cont.scrollLeft] = scrolls.contenido;
    for (const el of cont.querySelectorAll('[data-scroll]')) {
      const s = scrolls[el.dataset.scroll];
      if (s) [el.scrollTop, el.scrollLeft] = s;
    }
  }
  vistaActual = id;
}

function alCambio(motivo) {
  if (motivo === 'guardado') { actualizarGuardado(); dibujarFranjas(); return; }
  dibujarVista();
}

// ── Atajos de teclado ───────────────────────────────────────────────────────────
function enCampoDeTexto(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

async function atajos(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'F1') { e.preventDefault(); abrirAyuda(estado.vista); return; }
  if (!ctrl) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    if (!estado.hogar) return;
    if (estado.ruta) { await guardarYa(); avisar('Guardado.', { tipo: 'ok', duracion: 1600 }); } else guardarComo();
    return;
  }
  if (k === 'o') { e.preventDefault(); abrirArchivo(); return; }
  if (k === 'n') { e.preventDefault(); nuevoHogar(); return; }
  if (enCampoDeTexto(document.activeElement)) return;
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
  if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); return; }
  if (estado.hogar && /^[1-8]$/.test(e.key)) {
    const ids = NAV.filter((x) => x !== '-');
    const id = ids[Number(e.key) - 1];
    if (id) { e.preventDefault(); irA(id); }
  }
}

// ── Arranque ────────────────────────────────────────────────────────────────────
async function cotizacionesDelDia() {
  const r = await window.mp.datos.dolarHoy();
  if (!r.ok || !estado.datos || !estado.datos.dolar) return;
  let cambio = false;
  for (const [tipo, c] of Object.entries(r.cotizaciones)) {
    const d = estado.datos.dolar[tipo];
    if (d && c.fecha && (!d.ultimo || c.fecha >= d.ultimo.fecha)) { d.ultimo = { fecha: c.fecha, compra: c.compra, venta: c.venta }; cambio = true; }
  }
  estado.dolarHoy = r.cotizaciones;
  if (cambio && estado.hogar) { recalcular(); notificar('datos'); }
}

async function cargarDatos() {
  const d = await window.mp.datos.obtener();
  estado.datos = d.datos;
  estado.engho = d.engho;
  estado.origenDatos = { origen: d.origen, generado: d.generado };
}

async function iniciar() {
  activarAyudasFlotantes();
  estado.ajustes = await window.mp.ajustes.leer();
  aplicarTema();
  estado.info = await window.mp.app.info();
  await cargarDatos();
  alCambiar(alCambio);
  document.addEventListener('keydown', atajos);
  window.mp.app.alAntesDeCerrar(async () => {
    try { await guardarYa(); } finally { window.mp.app.listoParaCerrar(); }
  });
  window.mp.app.alVersionNueva((v) => { estado.versionNueva = v; dibujarFranjas(); });
  window.mp.datos.alActualizar(async () => {
    await cargarDatos();
    recalcular();
    notificar('datos');
    avisar('Llegaron datos públicos nuevos: IPC, canasta básica y dólar.', { tipo: 'ok' });
  });
  window.mp.archivo.alAbrirDesdeSistema((ruta) => abrirArchivo(ruta));

  const pendiente = await window.mp.archivo.pendiente();
  let abierto = false;
  if (pendiente) abierto = await abrirArchivo(pendiente);
  else if (estado.ajustes.ultimo) {
    const recientes = await window.mp.archivo.recientes();
    const ultimo = recientes.find((r) => r.ruta === estado.ajustes.ultimo);
    if (ultimo && ultimo.existe) abierto = await abrirArchivo(ultimo.ruta);
  }
  if (!abierto) irA('inicio');
  cotizacionesDelDia();
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('app').textContent = `No se pudo iniciar: ${e.message}`;
});
