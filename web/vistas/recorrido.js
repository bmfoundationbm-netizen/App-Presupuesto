// Mi Presupuesto · recorrido guiado de la planilla (la primera vez)

import { guardarAjustes } from '../estado.js';
import { h, montar } from '../ui.js';

const PASOS = [
  { sel: '.planilla-scroll', titulo: 'Tu planilla', texto: 'Los conceptos en filas y los 12 meses en columnas. Escribí en cualquier celda y apretá Enter: los totales y el resultado se calculan solos.' },
  { sel: '.segmentado', titulo: 'Planeado, real y comparar', texto: 'En "Planeado" armás el presupuesto. En "Real" cargás lo que pasó. "Comparar" muestra los dos juntos y avisa cuando te pasás.' },
  { sel: '[data-accion="nuevo-mov"]', titulo: 'Gastos sueltos', texto: 'Si preferís anotar cada compra (con fecha y medio de pago), usá "Cargar gasto": la celda del mes las suma sola. También sirve para compras en cuotas.' },
  { sel: '.planilla-kpis', titulo: 'El mes de un vistazo', texto: 'Ingresos, gastos, ahorro y lo que sobra o falta. Tocá un mes en el encabezado de la planilla para verlo.' },
  { sel: '.lateral', titulo: 'Todo lo demás', texto: 'Movimientos, presupuestos y proyectos, ahorro, familia y canasta básica, análisis de dónde recortar, el gráfico de Sankey y los datos del IPC. La ayuda de cada pantalla está en el botón "?" o con F1.' }
];

export function iniciarRecorrido(paso = 0) {
  cerrar();
  const p = PASOS[paso];
  const el = document.querySelector(p.sel);
  if (!el) { if (paso + 1 < PASOS.length) iniciarRecorrido(paso + 1); else terminar(); return; }
  const r = el.getBoundingClientRect();
  const foco = document.createElement('div');
  foco.className = 'recorrido-foco';
  Object.assign(foco.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${Math.min(r.height, innerHeight - r.top - 8) + 8}px` });
  const caja = document.createElement('div');
  caja.className = 'recorrido-caja';
  montar(caja, h`<h3>${p.titulo}</h3><p>${p.texto}</p><div class="pie"><span class="paso">${paso + 1} de ${PASOS.length}</span>
    <button class="boton chico fantasma" data-r="salir">Saltear</button><button class="boton chico primario" data-r="sig">${paso + 1 < PASOS.length ? 'Siguiente' : 'Listo'}</button></div>`);
  document.body.append(foco, caja);
  const c = caja.getBoundingClientRect();
  let top = r.bottom + 12, left = r.left;
  if (top + c.height > innerHeight - 10) top = Math.max(10, r.top - c.height - 12);
  if (r.height > innerHeight * 0.6) { top = r.top + 20; left = r.left + 20; }
  if (r.width < 260 && r.left < 300) { left = r.right + 16; top = r.top + 20; }
  caja.style.top = `${top}px`;
  caja.style.left = `${Math.max(10, Math.min(left, innerWidth - c.width - 10))}px`;
  caja.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    if (b.dataset.r === 'salir') terminar();
    else if (paso + 1 < PASOS.length) iniciarRecorrido(paso + 1);
    else terminar();
  });
  caja.querySelector('[data-r="sig"]').focus();
}

function cerrar() { document.querySelectorAll('.recorrido-foco, .recorrido-caja').forEach((x) => x.remove()); }
function terminar() { cerrar(); guardarAjustes({ recorrido: true }); }
