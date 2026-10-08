// Mi Presupuesto · gráficos en SVG con d3 (cargado como script global)
//
// Reglas de la guía de visualización: trazos finos (líneas de 2 px, barras de hasta 24 px
// con la punta redondeada), 2 px de separación entre áreas que se tocan, grilla y ejes de
// línea fina, texto siempre con tintas de texto (nunca con el color de la serie), un solo
// eje vertical, leyenda cuando hay dos series o más, tooltip al pasar el mouse y tabla
// con los mismos valores.

import { compacto, pesos, porcentaje } from '../lib/dinero.js';
import { MES_CORTO, numMes, nombreMes, capitalizar } from '../lib/fechas.js';
import { colorFamilia, FAMILIAS, ordenSeguro, SERIES } from './colores.js';

const d3g = () => window.d3;
const SVGNS = 'http://www.w3.org/2000/svg';

// ── Tooltip ─────────────────────────────────────────────────────────────────────
function tooltip(cont) {
  let t = cont.querySelector('.tooltip-grafico');
  if (!t) { t = document.createElement('div'); t.className = 'tooltip-grafico'; cont.appendChild(t); }
  return {
    mostrar(x, y, filas, titulo) {
      t.replaceChildren();
      if (titulo) { const h = document.createElement('div'); h.className = 'tt-titulo'; h.textContent = titulo; t.appendChild(h); }
      for (const f of filas) {
        const r = document.createElement('div'); r.className = 'tt-fila';
        if (f.color) { const k = document.createElement('i'); k.style.background = f.color; r.appendChild(k); }
        const v = document.createElement('strong'); v.textContent = f.valor; r.appendChild(v);
        const n = document.createElement('span'); n.textContent = f.nombre; r.appendChild(n);
        t.appendChild(r);
      }
      t.style.display = 'block';
      const rc = cont.getBoundingClientRect();
      const tw = t.offsetWidth, th = t.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + tw > rc.width - 4) left = x - tw - 14;
      if (top + th > rc.height - 4) top = Math.max(4, y - th - 14);
      t.style.left = `${left}px`; t.style.top = `${top}px`;
    },
    ocultar() { t.style.display = 'none'; }
  };
}

function posicion(e, cont) {
  const r = cont.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function crearSvg(cont, ancho, alto, etiqueta) {
  const svg = d3g().select(cont).append('svg').attr('viewBox', `0 0 ${ancho} ${alto}`).attr('width', ancho).attr('height', alto)
    .attr('class', 'grafico').attr('role', 'img').attr('aria-label', etiqueta);
  return svg;
}

const pesosCompactos = (c) => compacto(c);

// ── Sankey ──────────────────────────────────────────────────────────────────────
const COLOR_TIPO = {
  ingreso: 'var(--fam-ingresos)', saldo: 'var(--fam-ingresos)', fondo: 'var(--fam-ahorro)', retiro: 'var(--fam-ahorro)',
  faltante: 'var(--critico)', total: 'var(--tinta-2)', ahorro: 'var(--fam-ahorro)', inversion: 'var(--fam-ahorro)',
  deuda: 'var(--fam-deudas)', inesperado: 'var(--fam-deudas)', sobrante: 'var(--fam-ahorro)'
};

export function sankey(cont, datos, { colorDe, alClic, interactivo = true } = {}) {
  const d3 = d3g();
  cont.replaceChildren();
  if (!datos.enlaces.length) { cont.innerHTML = '<p class="vacio">No hay montos en este período.</p>'; return; }
  const ancho = Math.max(900, cont.clientWidth || 1100);
  const hojas = datos.nodos.filter((n) => n.nivel === 3).length;
  const fuentes = datos.nodos.filter((n) => n.nivel === 0).length;
  const cats = datos.nodos.filter((n) => n.nivel === 2).length;
  const alto = Math.max(440, Math.min(1500, Math.max(hojas, fuentes, cats) * 30 + 40));
  const margen = { izq: 170, der: hojas ? 190 : 150, arr: 10, aba: 10 };
  const niveles = Math.max(...datos.nodos.map((n) => n.nivel));
  const color = (n) => colorDe(n) || COLOR_TIPO[n.tipo] || 'var(--fam-otros)';
  const gen = d3.sankey().nodeId((d) => d.id).nodeAlign((d) => d.nivel).nodeWidth(12).nodePadding(16)
    .nodeSort(null).linkSort(null).extent([[margen.izq, margen.arr], [ancho - margen.der, alto - margen.aba]]);
  const grafo = gen({ nodes: datos.nodos.map((n) => ({ ...n })), links: datos.enlaces.map((l) => ({ ...l })) });
  const svg = crearSvg(cont, ancho, alto, 'Gráfico de Sankey de ingresos, gastos y resultado');
  const tt = tooltip(cont);
  const total = datos.total;

  const enlaces = svg.append('g').attr('fill', 'none').selectAll('path').data(grafo.links).join('path')
    .attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (l) => (l.source.nivel === 0 ? color(l.source) : color(l.target)))
    .attr('stroke-opacity', (l) => (l.source.nivel === 0 ? 0.22 : 0.3))
    .attr('stroke-width', (l) => Math.max(1, l.width))
    .attr('class', 'enlace-sankey');

  const nodos = svg.append('g').selectAll('g').data(grafo.nodes).join('g').attr('class', (n) => `nodo-sankey ${n.expandible ? 'expandible' : ''}`);
  nodos.append('rect').attr('x', (n) => n.x0).attr('y', (n) => n.y0).attr('width', (n) => n.x1 - n.x0)
    .attr('height', (n) => Math.max(1, n.y1 - n.y0)).attr('rx', 2).attr('fill', (n) => color(n));
  // Zona de clic más grande que el nodo.
  nodos.append('rect').attr('x', (n) => n.x0 - 6).attr('y', (n) => n.y0 - 3).attr('width', (n) => n.x1 - n.x0 + 12)
    .attr('height', (n) => Math.max(10, n.y1 - n.y0 + 6)).attr('fill', 'transparent');

  // Etiquetas: nombre si el nodo tiene al menos 9 px; el monto, si entra en dos renglones.
  // Las que chocarían con la anterior de la misma columna se omiten (quedan en el tooltip
  // y en la tabla).
  const visible = new Set();
  for (let nivel = 0; nivel <= niveles; nivel++) {
    let piso = -Infinity;
    for (const n of grafo.nodes.filter((x) => x.nivel === nivel).sort((a, b) => a.y0 - b.y0)) {
      const centro = (n.y0 + n.y1) / 2;
      // Los conceptos (último nivel) muy finos no llevan etiqueta; las categorías sí, si entra.
      if (!(n.y1 - n.y0 >= 6 || nivel <= 2)) continue;
      // Dos renglones (nombre y monto) si entran; si no, solo el nombre.
      for (const alto of (n.y1 - n.y0 >= 22 || nivel <= 1 ? [26, 14] : [14])) {
        if (centro - alto / 2 >= piso) {
          visible.add(n.id); n.dosRenglones = alto === 26; piso = centro + alto / 2 + 2;
          break;
        }
      }
    }
  }
  const etiquetas = nodos.filter((n) => visible.has(n.id)).append('text')
    .attr('x', (n) => (n.nivel === 0 ? n.x0 - 8 : n.x1 + 8))
    .attr('y', (n) => (n.y0 + n.y1) / 2)
    .attr('text-anchor', (n) => (n.nivel === 0 ? 'end' : 'start'))
    .attr('class', (n) => `etiqueta-sankey ${n.nivel > 0 && n.nivel < niveles ? 'con-halo' : ''}`);
  etiquetas.append('tspan').attr('class', 'etiqueta-texto').attr('dy', (n) => (n.dosRenglones ? '-0.15em' : '0.35em')).text((n) => `${n.nombre}${n.expandible && interactivo ? (n.plegada ? ' ▸' : ' ▾') : ''}`);
  etiquetas.filter((n) => n.dosRenglones).append('tspan').attr('class', 'etiqueta-sec').attr('x', (n) => (n.nivel === 0 ? n.x0 - 8 : n.x1 + 8)).attr('dy', '1.15em')
    .text((n) => `${pesosCompactos(n.valor)} · ${porcentaje(n.valor / total, 0)}`);

  const resaltar = (fn) => {
    enlaces.attr('stroke-opacity', (l) => (fn(l) ? 0.6 : 0.08));
  };
  const normal = () => enlaces.attr('stroke-opacity', (l) => (l.source.nivel === 0 ? 0.22 : 0.3));
  enlaces.on('pointermove', (e, l) => {
    resaltar((x) => x === l);
    const [x, y] = posicion(e, cont);
    tt.mostrar(x, y, [{ valor: pesos(Math.round(l.value / 100) * 100), nombre: porcentaje(l.value / total, 1) + ' del total', color: color(l.target) }], `${l.source.nombre} → ${l.target.nombre}`);
  }).on('pointerleave', () => { normal(); tt.ocultar(); });
  nodos.on('pointermove', (e, n) => {
    resaltar((l) => l.source === n || l.target === n);
    const [x, y] = posicion(e, cont);
    const filas = [{ valor: pesos(Math.round(n.valor / 100) * 100), nombre: `${porcentaje(n.valor / total, 1)} del total`, color: color(n) }];
    if (n.detalle) filas.push({ valor: '', nombre: n.detalle.join(', ') });
    if (n.expandible) filas.push({ valor: '', nombre: n.plegada ? 'Clic para abrir' : 'Clic para cerrar' });
    tt.mostrar(x, y, filas, n.nombre);
  }).on('pointerleave', () => { normal(); tt.ocultar(); })
    .on('click', (e, n) => { if (n.expandible && alClic) alClic(n); });
}

// ── Torta (dona) ────────────────────────────────────────────────────────────────
// partes: [{ familia, monto, detalle: [nombres] }] ya agrupadas en ≤ 6 porciones.
export function torta(cont, partes, total) {
  const d3 = d3g();
  cont.replaceChildren();
  if (!total) { cont.innerHTML = '<p class="vacio">No hay gastos en este período.</p>'; return; }
  const orden = ordenSeguro(partes.map((p) => p.familia)) || partes.map((p) => p.familia);
  const datos = orden.map((f) => partes.find((p) => p.familia === f));
  const ancho = 780, alto = 400, r = 130, cx = ancho / 2, cy = alto / 2;
  const svg = crearSvg(cont, ancho, alto, 'Gastos por grupo de categorías');
  const tt = tooltip(cont);
  const pie = d3.pie().value((d) => d.monto).sort(null).padAngle(0.014);
  const arco = d3.arc().innerRadius(r * 0.62).outerRadius(r).cornerRadius(2);
  const arcoEtiqueta = d3.arc().innerRadius(r * 1.18).outerRadius(r * 1.18);
  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
  const arcos = pie(datos);
  g.selectAll('path.porcion').data(arcos).join('path').attr('class', 'porcion').attr('d', arco).attr('fill', (a) => colorFamilia(a.data.familia))
    .on('pointermove', (e, a) => {
      const [x, y] = posicion(e, cont);
      tt.mostrar(x, y, [{ valor: pesos(Math.round(a.data.monto / 100) * 100), nombre: porcentaje(a.data.monto / total, 1), color: colorFamilia(a.data.familia) }, ...(a.data.detalle.length > 1 ? [{ valor: '', nombre: a.data.detalle.join(', ') }] : [])], a.data.nombre);
    }).on('pointerleave', () => tt.ocultar());
  // Etiquetas directas afuera, con línea guía.
  for (const a of arcos) {
    const medio = (a.startAngle + a.endAngle) / 2;
    const [px, py] = arcoEtiqueta.centroid(a);
    const derecha = medio < Math.PI;
    const ex = (derecha ? 1 : -1) * (r + 46);
    const [ax, ay] = d3.arc().innerRadius(r + 4).outerRadius(r + 4).centroid(a);
    g.append('polyline').attr('points', `${ax},${ay} ${px},${py} ${ex},${py}`).attr('fill', 'none').attr('stroke', 'var(--eje)');
    const t = g.append('text').attr('x', ex + (derecha ? 6 : -6)).attr('y', py).attr('text-anchor', derecha ? 'start' : 'end').attr('dominant-baseline', 'middle');
    t.append('tspan').attr('class', 'etiqueta-texto').text(a.data.nombre);
    t.append('tspan').attr('class', 'etiqueta-sec').attr('dx', 6).text(porcentaje(a.data.monto / total, 0));
  }
  g.append('text').attr('text-anchor', 'middle').attr('y', -6).attr('class', 'etiqueta-sec').text('Total');
  g.append('text').attr('text-anchor', 'middle').attr('y', 16).attr('class', 'total-dona').text(compacto(total));
}

// ── Evolución mensual ───────────────────────────────────────────────────────────
// puntos: [{ mes, ingresos, gastos, ahorro, resultado, futuro }]
export function evolucion(cont, puntos, { real = true } = {}) {
  const d3 = d3g();
  cont.replaceChildren();
  const ancho = Math.max(760, cont.clientWidth || 900), alto = 300, altoRes = 150;
  const m = { izq: 64, der: 110, arr: 14, aba: 26 };
  const series = [['ingresos', 'Ingresos', SERIES.ingresos], ['gastos', 'Gastos y cuotas', SERIES.gastos], ['ahorro', 'Ahorro e inversiones', SERIES.ahorro]];
  const validos = puntos.filter((p) => !(real && p.futuro));
  const x = d3.scalePoint().domain(puntos.map((p) => p.mes)).range([m.izq, ancho - m.der]).padding(0.3);
  const maxY = d3.max(validos, (p) => Math.max(p.ingresos, p.gastos, p.ahorro)) || 1;
  const y = d3.scaleLinear().domain([0, maxY * 1.08]).nice().range([alto - m.aba, m.arr]);
  const svg = crearSvg(cont, ancho, alto + altoRes + 20, 'Ingresos, gastos y ahorro mes a mes');
  const tt = tooltip(cont);
  // Grilla y eje
  svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.izq).attr('x2', ancho - m.der).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--grilla)');
  svg.append('g').selectAll('text').data(y.ticks(5)).join('text').attr('x', m.izq - 8).attr('y', (v) => y(v)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('class', 'eje-texto').text((v) => compacto(v));
  svg.append('g').selectAll('text').data(puntos).join('text').attr('x', (p) => x(p.mes)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('class', 'eje-texto').text((p) => capitalizar(MES_CORTO[numMes(p.mes) - 1]));
  svg.append('line').attr('x1', m.izq).attr('x2', ancho - m.der).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--eje)');
  for (const [k, , c] of series) {
    const linea = d3.line().defined((p) => !(real && p.futuro)).x((p) => x(p.mes)).y((p) => y(p[k]));
    svg.append('path').datum(puntos).attr('d', linea).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const ult = validos[validos.length - 1];
    if (ult) {
      svg.append('circle').attr('cx', x(ult.mes)).attr('cy', y(ult[k])).attr('r', 4).attr('fill', c).attr('stroke', 'var(--superficie)').attr('stroke-width', 2);
    }
  }
  // Etiquetas al final de cada línea, separadas si se pisan.
  const ult = validos[validos.length - 1];
  if (ult) {
    const pos = series.map(([k, n]) => ({ n, y: y(ult[k]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < pos.length; i++) if (pos[i].y - pos[i - 1].y < 14) pos[i].y = pos[i - 1].y + 14;
    for (const p of pos) svg.append('text').attr('x', x(ult.mes) + 10).attr('y', p.y).attr('dominant-baseline', 'middle').attr('class', 'etiqueta-sec').text(p.n);
  }
  // Resultado: barras divergentes (azul si sobra, rojo si falta).
  const y0 = alto + 20;
  const maxR = d3.max(validos, (p) => Math.abs(p.resultado)) || 1;
  const yr = d3.scaleLinear().domain([-maxR, maxR]).range([y0 + altoRes - 16, y0 + 16]);
  svg.append('text').attr('x', m.izq).attr('y', y0 + 4).attr('class', 'etiqueta-sec').text('Resultado del mes (sobrante o faltante)');
  svg.append('line').attr('x1', m.izq).attr('x2', ancho - m.der).attr('y1', yr(0)).attr('y2', yr(0)).attr('stroke', 'var(--eje)');
  const anchoBarra = Math.min(24, x.step() * 0.5);
  svg.append('g').selectAll('path').data(validos).join('path').attr('d', (p) => {
    const xx = x(p.mes) - anchoBarra / 2, base = yr(0), tope = yr(p.resultado), alto2 = Math.abs(base - tope);
    if (alto2 < 1) return '';
    const r = Math.min(4, alto2);
    return p.resultado >= 0
      ? `M${xx},${base} V${tope + r} Q${xx},${tope} ${xx + r},${tope} H${xx + anchoBarra - r} Q${xx + anchoBarra},${tope} ${xx + anchoBarra},${tope + r} V${base} Z`
      : `M${xx},${base} V${tope - r} Q${xx},${tope} ${xx + r},${tope} H${xx + anchoBarra - r} Q${xx + anchoBarra},${tope} ${xx + anchoBarra},${tope - r} V${base} Z`;
  }).attr('fill', (p) => (p.resultado >= 0 ? 'var(--serie-1)' : 'var(--serie-8)'));
  svg.append('g').selectAll('text').data(validos.filter((p, i) => i === validos.length - 1 || p.resultado === d3.max(validos, (q) => q.resultado) || p.resultado === d3.min(validos, (q) => q.resultado))).join('text')
    .attr('x', (p) => x(p.mes)).attr('y', (p) => (p.resultado >= 0 ? yr(p.resultado) - 6 : yr(p.resultado) + 14)).attr('text-anchor', 'middle').attr('class', 'valor-texto').text((p) => compacto(p.resultado));
  // Línea vertical que sigue al puntero y tooltip con todas las series.
  const guia = svg.append('line').attr('y1', m.arr).attr('y2', y0 + altoRes).attr('stroke', 'var(--eje)').style('display', 'none');
  svg.append('rect').attr('x', m.izq).attr('y', 0).attr('width', ancho - m.izq - m.der).attr('height', y0 + altoRes).attr('fill', 'transparent')
    .on('pointermove', (e) => {
      const [px] = d3.pointer(e);
      const p = puntos.reduce((a, b) => (Math.abs(x(b.mes) - px) < Math.abs(x(a.mes) - px) ? b : a));
      guia.attr('x1', x(p.mes)).attr('x2', x(p.mes)).style('display', null);
      const [cx, cy] = posicion(e, cont);
      if (real && p.futuro) { tt.mostrar(cx, cy, [{ valor: '', nombre: 'Todavía no pasó' }], capitalizar(nombreMes(p.mes))); return; }
      tt.mostrar(cx, cy, [...series.map(([k, n, c]) => ({ valor: compacto(p[k]), nombre: n, color: c })), { valor: compacto(p.resultado), nombre: 'Resultado', color: p.resultado >= 0 ? 'var(--serie-1)' : 'var(--serie-8)' }], capitalizar(nombreMes(p.mes)));
    }).on('pointerleave', () => { guia.style('display', 'none'); tt.ocultar(); });
}

// ── Planeado contra real por categoría ─────────────────────────────────────────
// filas: [{ nombre, familia, plan, real }]
export function planVsReal(cont, filas) {
  const d3 = d3g();
  cont.replaceChildren();
  if (!filas.length) { cont.innerHTML = '<p class="vacio">No hay montos en este período.</p>'; return; }
  const ancho = Math.max(760, cont.clientWidth || 900), fila = 34;
  const m = { izq: 210, der: 140, arr: 8, aba: 26 };
  const alto = m.arr + filas.length * fila + m.aba;
  const max = d3.max(filas, (f) => Math.max(f.plan, f.real)) || 1;
  const x = d3.scaleLinear().domain([0, max * 1.05]).nice().range([m.izq, ancho - m.der]);
  const svg = crearSvg(cont, ancho, alto, 'Planeado contra real por categoría');
  const tt = tooltip(cont);
  svg.append('g').selectAll('line').data(x.ticks(5)).join('line').attr('x1', (v) => x(v)).attr('x2', (v) => x(v)).attr('y1', m.arr).attr('y2', alto - m.aba).attr('stroke', 'var(--grilla)');
  svg.append('g').selectAll('text').data(x.ticks(5)).join('text').attr('x', (v) => x(v)).attr('y', alto - 8).attr('text-anchor', 'middle').attr('class', 'eje-texto').text((v) => compacto(v));
  filas.forEach((f, i) => {
    const yy = m.arr + i * fila + fila / 2;
    const g = svg.append('g');
    g.append('circle').attr('cx', 14).attr('cy', yy).attr('r', 4).attr('fill', colorFamilia(f.familia));
    g.append('text').attr('x', 24).attr('y', yy).attr('dominant-baseline', 'middle').attr('class', 'etiqueta-texto').text(f.nombre);
    const w = Math.max(0, x(f.real) - x(0)), hb = 14;
    if (w > 0) g.append('path').attr('d', `M${x(0)},${yy - hb / 2} H${x(0) + Math.max(0, w - 4)} Q${x(0) + w},${yy - hb / 2} ${x(0) + w},${yy - hb / 2 + 4} V${yy + hb / 2 - 4} Q${x(0) + w},${yy + hb / 2} ${x(0) + Math.max(0, w - 4)},${yy + hb / 2} H${x(0)} Z`).attr('fill', 'var(--serie-1)');
    if (f.plan > 0) g.append('line').attr('x1', x(f.plan)).attr('x2', x(f.plan)).attr('y1', yy - 11).attr('y2', yy + 11).attr('stroke', 'var(--tinta)').attr('stroke-width', 2);
    const pasado = f.plan > 0 && f.real > f.plan * 1.01;
    const txt = g.append('text').attr('x', x(Math.max(f.real, f.plan)) + 10).attr('y', yy).attr('dominant-baseline', 'middle');
    txt.append('tspan').attr('class', 'valor-texto').text(compacto(f.real));
    if (pasado) txt.append('tspan').attr('dx', 6).attr('class', 'texto-critico').text(`▲ ${porcentaje(f.real / f.plan - 1, 0)}`);
    g.append('rect').attr('x', 0).attr('y', yy - fila / 2).attr('width', ancho).attr('height', fila).attr('fill', 'transparent')
      .on('pointermove', (e) => {
        const [cx, cy] = posicion(e, cont);
        tt.mostrar(cx, cy, [{ valor: pesos(Math.round(f.real / 100) * 100), nombre: 'Real', color: 'var(--serie-1)' }, { valor: pesos(Math.round(f.plan / 100) * 100), nombre: 'Planeado', color: 'var(--tinta)' },
          ...(f.plan ? [{ valor: porcentaje(f.real / f.plan - 1, 0), nombre: f.real > f.plan ? 'por encima de lo planeado' : 'por debajo de lo planeado' }] : [])], f.nombre);
      }).on('pointerleave', () => tt.ocultar());
  });
}

// ── Contra la inflación ─────────────────────────────────────────────────────────
// puntos: [{ mes, ipc, gastoIdx, ingresoIdx }]  (base 100 en el primer mes)
export function inflacion(cont, puntos) {
  const d3 = d3g();
  cont.replaceChildren();
  if (puntos.length < 2) { cont.innerHTML = '<p class="vacio">Hacen falta al menos dos meses con datos reales.</p>'; return; }
  const ancho = Math.max(760, cont.clientWidth || 900), alto = 320;
  const m = { izq: 54, der: 150, arr: 14, aba: 26 };
  const series = [['ipc', 'Precios (IPC)', 'var(--apagada)'], ['ingresoIdx', 'Tus ingresos', SERIES.ingresos], ['gastoIdx', 'Tus gastos', SERIES.gastos]];
  const x = d3.scalePoint().domain(puntos.map((p) => p.mes)).range([m.izq, ancho - m.der]).padding(0.2);
  const valores = puntos.flatMap((p) => series.map(([k]) => p[k]));
  const y = d3.scaleLinear().domain([Math.min(95, d3.min(valores)), d3.max(valores) * 1.03]).nice().range([alto - m.aba, m.arr]);
  const svg = crearSvg(cont, ancho, alto, 'Ingresos y gastos contra la inflación, base 100');
  const tt = tooltip(cont);
  svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.izq).attr('x2', ancho - m.der).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', (v) => (v === 100 ? 'var(--eje)' : 'var(--grilla)'));
  svg.append('g').selectAll('text').data(y.ticks(5)).join('text').attr('x', m.izq - 8).attr('y', (v) => y(v)).attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('class', 'eje-texto').text((v) => v);
  svg.append('g').selectAll('text').data(puntos).join('text').attr('x', (p) => x(p.mes)).attr('y', alto - 6).attr('text-anchor', 'middle').attr('class', 'eje-texto')
    .text((p, i) => (puntos.length > 14 && i % 2 ? '' : `${capitalizar(MES_CORTO[numMes(p.mes) - 1])}${numMes(p.mes) === 1 || i === 0 ? ` ${p.mes.slice(2, 4)}` : ''}`));
  for (const [k, , c] of series) {
    svg.append('path').datum(puntos).attr('d', d3.line().x((p) => x(p.mes)).y((p) => y(p[k]))).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('stroke-linejoin', 'round');
  }
  const ult = puntos[puntos.length - 1];
  const pos = series.map(([k, n, c]) => ({ n, c, y: y(ult[k]), v: ult[k] })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < pos.length; i++) if (pos[i].y - pos[i - 1].y < 15) pos[i].y = pos[i - 1].y + 15;
  for (const p of pos) {
    svg.append('text').attr('x', x(ult.mes) + 10).attr('y', p.y).attr('dominant-baseline', 'middle').attr('class', 'etiqueta-sec').text(`${p.n} ${Math.round(p.v)}`);
  }
  const guia = svg.append('line').attr('y1', m.arr).attr('y2', alto - m.aba).attr('stroke', 'var(--eje)').style('display', 'none');
  svg.append('rect').attr('x', m.izq).attr('y', 0).attr('width', ancho - m.izq - m.der).attr('height', alto).attr('fill', 'transparent')
    .on('pointermove', (e) => {
      const [px] = d3.pointer(e);
      const p = puntos.reduce((a, b) => (Math.abs(x(b.mes) - px) < Math.abs(x(a.mes) - px) ? b : a));
      guia.attr('x1', x(p.mes)).attr('x2', x(p.mes)).style('display', null);
      const [cx, cy] = posicion(e, cont);
      tt.mostrar(cx, cy, series.map(([k, n, c]) => ({ valor: String(Math.round(p[k] * 10) / 10).replace('.', ','), nombre: n, color: c })), capitalizar(nombreMes(p.mes)));
    }).on('pointerleave', () => { guia.style('display', 'none'); tt.ocultar(); });
}

export { FAMILIAS };
