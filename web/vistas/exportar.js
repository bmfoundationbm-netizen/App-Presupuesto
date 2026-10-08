// Mi Presupuesto · exportar a Excel y a un informe en PDF

import { estado } from '../estado.js';
import { esc, avisar, pesosRedondos } from '../ui.js';
import { calcularAnio, aPesos, totalesPeriodo, mesConDatos } from '../lib/calculos.js';
import { SECCIONES, CLASES, nombreRegion } from '../lib/catalogo.js';
import { categoria, seccionDeLinea } from '../lib/modelo.js';
import { MES_CORTO, nombreMes, capitalizar, formatoFecha, sumarMeses, mesesDelAnio, anioDe } from '../lib/fechas.js';
import { porcentaje } from '../lib/dinero.js';
import { analizar, periodoAnalisis } from '../lib/analisis.js';
import { estadoMeta, estadoDeuda } from '../lib/ahorro.js';
import { composicion, aeHogar, situacion, ingresosDelMes } from '../lib/familia.js';
import { datosSankey } from '../lib/sankey.js';
import { planContraReal } from '../lib/series.js';
import { colorCategoria, familiaDeCategoria } from '../graficos/colores.js';
import * as G from '../graficos/graficos.js';

const P = (c) => (c === null || c === undefined ? null : Math.round(c) / 100);   // centavos → pesos (número)

// ── Excel ───────────────────────────────────────────────────────────────────────
function hojaPlanilla(hg, res, fuente) {
  const k = fuente === 'plan' ? 'planPesos' : 'realPesos';
  const meses = res.meses.map((m, i) => capitalizar(MES_CORTO[i]));
  const filas = [
    { tipo: 'titulo', valores: [`${hg.nombre} · ${res.anio} · ${fuente === 'plan' ? 'Planeado' : 'Real'}`] },
    { tipo: 'subtitulo', valores: ['Montos en pesos. Los conceptos en dólares están convertidos con la cotización de cada mes.'] },
    { tipo: 'encabezado', valores: ['Concepto', ...meses, 'Total'] }
  ];
  const suma = (a) => a.reduce((s, x) => s + (x || 0), 0);
  for (const s of SECCIONES) {
    const v = res.secciones[s.clave][fuente];
    filas.push({ tipo: 'seccion', valores: [s.nombre.toUpperCase(), ...v.map(P), P(suma(v))] });
    const cats = hg.categorias.filter((c) => c.seccion === s.clave).sort((a, b) => a.orden - b.orden);
    for (const c of cats) {
      const ls = hg.lineas.filter((l) => l.categoriaId === c.id && res.lineas.get(l.id) && res.lineas.get(l.id).tieneValores).sort((a, b) => a.orden - b.orden);
      if (!ls.length) continue;
      if (s.clave === 'gastos') {
        const vc = res.categorias.get(c.id)[fuente];
        filas.push({ tipo: 'categoria', nivel: 1, sangria: 1, valores: [c.nombre, ...vc.map(P), P(suma(vc))] });
      }
      for (const l of ls) {
        const f = res.lineas.get(l.id)[k];
        filas.push({ tipo: 'linea', nivel: s.clave === 'gastos' ? 2 : 1, sangria: s.clave === 'gastos' ? 2 : 1, valores: [`${l.nombre}${l.moneda === 'USD' ? ' (US$)' : ''}`, ...f.map((x) => (x ? P(x) : null)), P(suma(f))] });
      }
    }
    if (s.clave === 'inesperados' && fuente === 'real' && res.anual.cobertura) {
      filas.push({ tipo: 'linea', nivel: 1, sangria: 1, valores: ['Pagado con el fondo de emergencia', ...res.cobertura.map((x) => (x ? -P(x) : null)), -P(res.anual.cobertura)] });
    }
  }
  const r = res.resultado[fuente];
  filas.push({ tipo: 'resultado', valores: ['RESULTADO DEL MES', ...r.map(P), P(suma(r))] });
  return { nombre: `${fuente === 'plan' ? 'Planeado' : 'Real'} ${res.anio}`, columnas: [{ ancho: 38 }, ...meses.map(() => ({ ancho: 13 })), { ancho: 15 }], filas, congelar: { x: 1, y: 3 } };
}

function hojaComparacion(hg, res) {
  const filas = [
    { tipo: 'titulo', valores: [`${hg.nombre} · ${res.anio} · Planeado contra real`] },
    { tipo: 'encabezado', valores: ['Concepto', 'Planeado', 'Real', 'Diferencia', 'Real / planeado'] }
  ];
  const fila = (tipo, nombre, plan, real, extra = {}) => ({ tipo, ...extra, valores: [nombre, P(plan), P(real), P(real - plan), plan ? real / plan : null] });
  const suma = (a) => a.reduce((s, x) => s + (x || 0), 0);
  for (const s of SECCIONES) {
    const v = res.secciones[s.clave];
    filas.push(fila('seccion', s.nombre.toUpperCase(), suma(v.plan), suma(v.real)));
    for (const c of hg.categorias.filter((x) => x.seccion === s.clave)) {
      const ls = hg.lineas.filter((l) => l.categoriaId === c.id && res.lineas.get(l.id) && res.lineas.get(l.id).tieneValores);
      if (!ls.length) continue;
      if (s.clave === 'gastos') { const vc = res.categorias.get(c.id); filas.push(fila('categoria', c.nombre, suma(vc.plan), suma(vc.real), { nivel: 1, sangria: 1 })); }
      for (const l of ls) { const f = res.lineas.get(l.id); filas.push(fila('linea', l.nombre, suma(f.planPesos), suma(f.realPesos), { nivel: s.clave === 'gastos' ? 2 : 1, sangria: s.clave === 'gastos' ? 2 : 1 })); }
    }
  }
  filas.push(fila('resultado', 'RESULTADO DEL AÑO', res.anual.resultado.plan, res.anual.resultado.real));
  return { nombre: `Comparación ${res.anio}`, columnas: [{ ancho: 38 }, { ancho: 16 }, { ancho: 16 }, { ancho: 16 }, { ancho: 14, formato: 'porcentaje' }], filas, congelar: { x: 1, y: 2 } };
}

function hojaMovimientos(hg, ctx) {
  const lineaDe = new Map(hg.lineas.map((l) => [l.id, l]));
  const medio = (id) => (hg.medios.find((m) => m.id === id) || {}).nombre || '';
  const persona = (id) => (hg.integrantes.find((p) => p.id === id) || {}).nombre || '';
  const filas = [{ tipo: 'encabezado', valores: ['Fecha', 'Concepto', 'Categoría', 'Descripción', 'Medio de pago', 'Persona', 'Moneda', 'Monto', 'Monto en pesos'] }];
  for (const m of [...hg.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const l = lineaDe.get(m.lineaId);
    const c = l && categoria(hg, l.categoriaId);
    filas.push({ tipo: 'linea', valores: [m.fecha, l ? l.nombre : '', c ? c.nombre : '', m.descripcion, medio(m.medioId), persona(m.personaId), l ? l.moneda : 'ARS', P(m.monto), P(aPesos(ctx, m.monto, l ? l.moneda : 'ARS', m.fecha.slice(0, 7)))] });
  }
  return { nombre: 'Movimientos', columnas: [{ ancho: 12, formato: 'fecha' }, { ancho: 28 }, { ancho: 24 }, { ancho: 40 }, { ancho: 18 }, { ancho: 14 }, { ancho: 9 }, { ancho: 15 }, { ancho: 16 }], filas, congelar: { x: 0, y: 1 }, autofiltro: 'A1:I1' };
}

function hojaResumen(hg, ctx) {
  const comp = composicion(hg);
  const filas = [
    { tipo: 'titulo', valores: [hg.nombre] },
    { tipo: 'subtitulo', valores: [`Exportado el ${new Date().toLocaleDateString('es-AR')} con Mi Presupuesto`] },
    { tipo: 'linea', valores: ['Composición', `${comp.nombre} (${aeHogar(hg).toFixed(2).replace('.', ',')} adultos equivalentes)`] },
    { tipo: 'linea', valores: ['Región', nombreRegion(hg.region)] },
    { tipo: 'linea', valores: ['Integrantes', hg.integrantes.map((p) => `${p.nombre}${Number.isFinite(p.edad) ? ` (${p.edad})` : ''}`).join(', ')] },
    { tipo: 'encabezado', valores: ['Metas de ahorro', 'Juntado', 'Objetivo', 'Para'] }
  ];
  for (const m of hg.metas) { const e = estadoMeta(ctx, m); filas.push({ tipo: 'linea', valores: [m.nombre, P(e.saldo), P(e.objetivoFinal), m.fecha ? capitalizar(nombreMes(m.fecha)) : ''] }); }
  if (hg.deudas.length) {
    filas.push({ tipo: 'encabezado', valores: ['Préstamos', 'Cuota', 'Cuotas pagadas', 'Falta pagar'] });
    for (const d of hg.deudas) { const e = estadoDeuda(ctx, d); filas.push({ tipo: 'linea', valores: [d.nombre, P(d.cuota), `${e.pagadas} de ${d.cuotas}`, P(e.saldo)] }); }
  }
  return { nombre: 'Resumen', columnas: [{ ancho: 30 }, { ancho: 40 }, { ancho: 16 }, { ancho: 16 }], filas };
}

export async function exportarExcel() {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  if (!hg) return;
  const res = calcularAnio(ctx, estado.ui.anio);
  const modelo = { hojas: [hojaPlanilla(hg, res, 'plan'), hojaPlanilla(hg, res, 'real'), hojaComparacion(hg, res), hojaMovimientos(hg, ctx), hojaResumen(hg, ctx)] };
  const r = await window.mp.exportar.excel(modelo, `${hg.nombre} ${res.anio}.xlsx`);
  if (r.ok) avisar('Planilla exportada a Excel.', { tipo: 'ok', accion: { texto: 'Mostrar', fn: () => window.mp.app.mostrarEnCarpeta(r.ruta) } });
  else if (!r.cancelado) avisar(r.error || 'No se pudo exportar.', { tipo: 'error' });
}

// ── PDF ─────────────────────────────────────────────────────────────────────────
const CSS_INFORME = `
:root { --plano:#fff; --superficie:#fff; --superficie-2:#f3f2ee; --borde:rgba(11,11,11,.12); --grilla:#e1e0d9; --eje:#c3c2b7; --tinta:#0b0b0b; --tinta-2:#52514e; --tinta-3:#6f6e69; --apagada:#898781;
  --serie-1:#2a78d6; --serie-2:#eb6834; --serie-3:#1baf7a; --serie-4:#eda100; --serie-5:#e87ba4; --serie-6:#008300; --serie-7:#4a3aa7; --serie-8:#e34948;
  --fam-casa:var(--serie-1); --fam-comida:var(--serie-2); --fam-salud:var(--serie-3); --fam-educacion:var(--serie-4); --fam-ocio:var(--serie-5); --fam-ahorro:var(--serie-6); --fam-transporte:var(--serie-7); --fam-deudas:var(--serie-8); --fam-otros:#6f6e69; --fam-ingresos:#52514e; --fam-neutro:#898781; --critico:#d03b3b; --critico-texto:#b02a2a; --bien-texto:#006300; }
* { box-sizing: border-box; }
body { font: 10.5px/1.45 "Segoe UI", system-ui, sans-serif; color: var(--tinta); margin: 0; }
h1 { font-size: 22px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 18px 0 8px; break-after: avoid; } .sub { color: var(--tinta-3); }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
.kpi { border: 1px solid var(--borde); border-radius: 6px; padding: 8px 10px; } .kpi span { color: var(--tinta-3); font-size: 10px; } .kpi strong { display: block; font-size: 16px; }
table { width: 100%; border-collapse: collapse; } th, td { padding: 3px 5px; border-bottom: 1px solid var(--borde); text-align: right; white-space: nowrap; }
th:first-child, td:first-child { text-align: left; } th { font-size: 9.5px; color: var(--tinta-2); border-bottom: 1px solid var(--eje); }
tr.sec td { background: var(--superficie-2); font-weight: 700; } tr.res td { font-weight: 700; border-top: 2px solid var(--eje); }
td.neg { color: var(--critico-texto); }
.pagina { break-before: page; } .grafico { width: 100%; height: auto; } svg text { font-family: "Segoe UI", sans-serif; }
svg .eje-texto { font-size: 11px; fill: var(--apagada); } svg .valor-texto { font-size: 11px; fill: var(--tinta-2); font-weight: 600; }
svg .etiqueta-texto { font-size: 12px; fill: var(--tinta); } svg .etiqueta-sec { font-size: 11px; fill: var(--tinta-3); } svg .texto-critico { font-size: 11px; font-weight: 600; fill: var(--critico-texto); }
svg .total-dona { font-size: 22px; font-weight: 600; fill: var(--tinta); }
.etiqueta-sankey.con-halo tspan { paint-order: stroke; stroke: #fff; stroke-width: 4px; stroke-linejoin: round; }
ul { margin: 4px 0; padding-left: 18px; } li { margin: 3px 0; } .punto { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:4px; }
.fuentes { color: var(--tinta-3); font-size: 9.5px; margin-top: 18px; }`;

function svgFueraDePantalla(dibujo) {
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;left:-12000px;top:0;width:1060px';
  document.body.appendChild(div);
  try { dibujo(div); const svg = div.querySelector('svg'); return svg ? svg.outerHTML : ''; }
  finally { div.remove(); }
}

export async function exportarPdf() {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  if (!hg) return;
  avisar('Armando el informe…', { duracion: 2500 });
  const anio = estado.ui.anio;
  const res = calcularAnio(ctx, anio);
  const mesesCompletos = mesesDelAnio(anio).filter((m) => m < ctx.mesHoy);
  const ultimo = [...mesesCompletos].reverse().find((m) => mesConDatos(ctx, m)) || mesesCompletos[mesesCompletos.length - 1] || ctx.mesHoy;
  const S = res.secciones;
  const i = res.meses.indexOf(ultimo);
  const suma = (a) => a.reduce((s, x) => s + (x || 0), 0);
  const gastosMes = (k) => S.gastos[k][i] + S.inesperados[k][i] - (k === 'real' ? res.cobertura[i] : 0) + S.deudas[k][i];
  const per = periodoAnalisis(ctx);
  const a = analizar(ctx, estado.engho, per);
  const sit = situacion(ctx, ultimo, ingresosDelMes(ctx, ultimo, 'real'));
  const comp = composicion(hg);
  const meses = res.meses;
  const filaTabla = (nombre, valores, clase = '') => `<tr class="${clase}"><td>${esc(nombre)}</td>${valores.map((v, k) => `<td class="${v < 0 ? 'neg' : ''}">${meses[k] && meses[k] >= ctx.mesHoy ? '' : (v ? esc(pesosRedondos(v).replace('$ ', '')) : '')}</td>`).join('')}<td>${esc(pesosRedondos(suma(valores.slice(0, mesesCompletos.length))).replace('$ ', ''))}</td></tr>`;
  let tabla = '';
  for (const s of SECCIONES) {
    tabla += filaTabla(s.nombre, S[s.clave].real, 'sec');
    if (s.clave === 'gastos') for (const c of hg.categorias.filter((x) => x.seccion === 'gastos')) { const v = res.categorias.get(c.id).real; if (suma(v)) tabla += filaTabla(c.nombre, v); }
  }
  if (res.anual.cobertura) tabla += filaTabla('Pagado con el fondo de emergencia', res.cobertura.map((x) => -x));
  tabla += filaTabla('Resultado del mes', res.resultado.real, 'res');
  const mesesTodos = mesesCompletos.length ? mesesCompletos : [ultimo];
  const colorDe = (n) => (n.nivel >= 2 && n.id.startsWith('cat:cat_') ? colorCategoria(categoria(hg, n.id.slice(4))) : (n.nivel === 3 && n.categoriaId && n.categoriaId.startsWith('cat:cat_') ? colorCategoria(categoria(hg, n.categoriaId.slice(4))) : null));
  // En el informe, todas las categorías cerradas: fuentes, total y categorías.
  const completo = datosSankey(ctx, { meses: mesesTodos, fuente: 'real' });
  const plegadas = new Set(completo.nodos.filter((n) => n.nivel === 2).map((n) => n.id));
  const sankey = svgFueraDePantalla((div) => G.sankey(div, datosSankey(ctx, { meses: mesesTodos, fuente: 'real', plegadas }), { colorDe, interactivo: false }));
  const pvr = svgFueraDePantalla((div) => G.planVsReal(div, planContraReal(ctx, mesesTodos).map((x) => ({ nombre: x.categoria.nombre, familia: familiaDeCategoria(x.categoria), plan: x.plan, real: x.real }))));
  const metas = hg.metas.map((m) => { const e = estadoMeta(ctx, m); return `<tr><td>${esc(m.nombre)}</td><td>${esc(pesosRedondos(e.saldo))}</td><td>${esc(pesosRedondos(e.objetivoFinal))}</td><td>${esc(porcentaje(e.avance, 0))}</td><td>${m.fecha ? esc(capitalizar(nombreMes(m.fecha))) : ''}</td></tr>`; }).join('');
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>${esc(hg.nombre)}</title><style>${CSS_INFORME}</style></head><body>
    <h1>${esc(hg.nombre)} · ${anio}</h1>
    <div class="sub">${esc(comp.nombre)} · ${esc(nombreRegion(hg.region))} · informe del ${esc(new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }))} · Mi Presupuesto</div>
    <h2>${esc(capitalizar(nombreMes(ultimo)))}</h2>
    <div class="kpis">
      <div class="kpi"><span>Ingresos</span><strong>${esc(pesosRedondos(S.ingresos.real[i]))}</strong><span>planeado ${esc(pesosRedondos(S.ingresos.plan[i]))}</span></div>
      <div class="kpi"><span>Gastos, imprevistos y cuotas</span><strong>${esc(pesosRedondos(gastosMes('real')))}</strong><span>planeado ${esc(pesosRedondos(gastosMes('plan')))}</span></div>
      <div class="kpi"><span>Ahorro e inversiones</span><strong>${esc(pesosRedondos(S.ahorro.real[i] + S.inversiones.real[i]))}</strong><span>planeado ${esc(pesosRedondos(S.ahorro.plan[i] + S.inversiones.plan[i]))}</span></div>
      <div class="kpi"><span>Resultado</span><strong>${esc(pesosRedondos(res.resultado.real[i]))}</strong><span>planeado ${esc(pesosRedondos(res.resultado.plan[i]))}</span></div>
    </div>
    ${sit ? `<p>Ingresos del mes: <strong>${esc(sit.veces.toFixed(2).replace('.', ','))} veces</strong> la canasta básica total del hogar (${esc(pesosRedondos(sit.pobreza))}).</p>` : ''}
    <h2>Lo real de ${anio}, por mes</h2>
    <table><thead><tr><th>Concepto</th>${meses.map((m, k) => `<th>${esc(capitalizar(MES_CORTO[k]))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${tabla}</tbody></table>
    <div class="pagina"><h2>De dónde entra y a dónde va la plata (${esc(mesesTodos.length > 1 ? `${nombreMes(mesesTodos[0], { conAnio: false })} a ${nombreMes(mesesTodos[mesesTodos.length - 1])}` : nombreMes(mesesTodos[0]))})</h2>${sankey}</div>
    <div class="pagina"><h2>Planeado contra real por categoría</h2>${pvr}
      <h2>Lo que encontró el análisis (${esc(per.descripcion.toLowerCase())})</h2>
      <ul>${a.hallazgos.map((x) => `<li><strong>${esc(x.titulo)}.</strong> ${esc(x.detalle)}</li>`).join('') || '<li>Nada llamativo.</li>'}</ul>
      ${metas ? `<h2>Metas de ahorro</h2><table><thead><tr><th>Meta</th><th>Juntado</th><th>Objetivo</th><th>Avance</th><th>Para</th></tr></thead><tbody>${metas}</tbody></table>` : ''}
      <p class="fuentes">IPC y canasta básica: INDEC (vía datos.gob.ar). Hogares parecidos: INDEC, Encuesta Nacional de Gastos de los Hogares 2017-2018. Inflación esperada: REM del BCRA. Dólar: ArgentinaDatos, DolarApi y BCRA. Los montos en dólares se convierten con la cotización elegida para el hogar.</p></div>
  </body></html>`;
  const r = await window.mp.exportar.pdf(html, `${hg.nombre} ${anio}.pdf`, { horizontal: true });
  if (r.ok) avisar('Informe exportado a PDF.', { tipo: 'ok', accion: { texto: 'Mostrar', fn: () => window.mp.app.mostrarEnCarpeta(r.ruta) } });
  else if (!r.cancelado) avisar(r.error || 'No se pudo exportar.', { tipo: 'error' });
}
