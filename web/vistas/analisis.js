// Mi Presupuesto · análisis de dónde recortar, avisos y consejo opcional con Claude

import { estado, mutar, irA, notificar } from '../estado.js';
import { h, crudo, montar, icono, opciones, dialogo, avisar, leerMonto, pesosRedondos, esc } from '../ui.js';
import { analizar, periodoAnalisis, planDeRecorte, alertas } from '../lib/analisis.js';
import { planConRecortes } from '../lib/presupuestos.js';
import { planActivo } from '../lib/modelo.js';
import { CLASES, nombreIndice, nombreRegion } from '../lib/catalogo.js';
import { composicion, canastaHogar, tenencia } from '../lib/familia.js';
import { estadoMeta } from '../lib/ahorro.js';
import { nombreMes, capitalizar, sumarMeses, anioDe, mesActual } from '../lib/fechas.js';
import { porcentaje } from '../lib/dinero.js';
import { abrirCierre } from './cierre.js';
import { valorMonto } from './dialogos.js';

const COMPARACIONES = [
  ['regla', 'Regla 50/30/20', 'Necesidades, gustos y ahorro como parte de los ingresos'],
  ['parecidos', 'Hogares parecidos', 'Encuesta de Gastos de los Hogares del INDEC'],
  ['historial', 'Tu historial', 'Lo que subió más que la inflación frente a tus 6 meses anteriores'],
  ['topes', 'Tus topes', 'Límites que ponés por categoría']
];
const NIVEL = { alerta: ['alerta', 'alerta'], aviso: ['alerta', 'aviso'], info: ['info', ''] };

function ui() {
  if (!estado.ui.analisis) estado.ui.analisis = { modo: 'ultimos', mes: sumarMeses(mesActual(), -1), objetivo: '', esenciales: false, ajustes: null, claude: '', claudeError: '', claudeCargando: false };
  return estado.ui.analisis;
}

function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const u = ui();
  const per = periodoAnalisis(ctx, { modo: u.modo, mes: u.mes });
  const a = analizar(ctx, estado.engho, per);
  const avisos = alertas(ctx);
  const objetivo = leerMonto(u.objetivo) || 0;
  const plan = objetivo > 0 || u.ajustes ? planDeRecorte(a, objetivo, { permitirEsenciales: u.esenciales, ajustes: u.ajustes }) : null;
  const meses = Array.from({ length: 18 }, (_, i) => sumarMeses(ctx.mesHoy, -i));
  const irAvisos = estado.opcionesVista && estado.opcionesVista.seccion === 'avisos';
  if (irAvisos) estado.opcionesVista = null;

  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Análisis</h1><div class="subtitulo">Dónde se va la plata, qué se puede recortar y avisos del mes.</div></div></div>
    <div class="filtros">
      <select class="entrada" data-u="modo">${opciones([['ultimos', 'Últimos 3 meses completos'], ['mes', 'Un mes']], u.modo)}</select>
      ${u.modo === 'mes' ? h`<select class="entrada" data-u="mes">${opciones(meses.map((m) => [m, capitalizar(nombreMes(m))]), u.mes)}</select>` : ''}
      <span class="apagado" style="align-self:center">${per.descripcion}</span>
    </div>

    <div class="tarjeta" id="avisos">
      <div class="tarjeta-titulo"><h2>Avisos</h2><span class="apagado chico">del mes en curso y del hogar</span></div>
      ${avisos.length ? h`<div class="lista-hallazgos">${avisos.map((x) => h`<div class="hallazgo ${NIVEL[x.nivel][1]}">
        <span class="hallazgo-icono">${icono(NIVEL[x.nivel][0])}</span><div class="hallazgo-texto"><strong>${x.titulo}</strong><p>${x.detalle}</p></div>
        ${x.accion ? h`<button class="boton chico" data-aviso="${x.accion.tipo}" data-mes="${x.accion.mes || ''}">${{ planilla: 'Ver en la planilla', cerrar: 'Cerrar el mes', ahorro: 'Ver ahorro', familia: 'Ver familia' }[x.accion.tipo] || 'Ver'}</button>` : ''}</div>`)}</div>`
        : h`<p class="apagado">${icono('ok')} Nada para avisar.</p>`}
    </div>

    <div class="kpis" style="margin:14px 0">
      <div class="kpi"><div class="kpi-etiqueta">Ingresos por mes</div><div class="kpi-valor">${pesosRedondos(a.ingresos)}</div><div class="kpi-delta">${per.fuente === 'plan' ? 'planeados' : 'reales'}</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Gastos de consumo por mes</div><div class="kpi-valor">${pesosRedondos(a.gastoTotal)}</div><div class="kpi-delta">${a.ingresos ? `${porcentaje(a.gastoTotal / a.ingresos, 0)} de los ingresos` : ''}</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Resultado por mes</div><div class="kpi-valor" style="color:${a.resultado < 0 ? 'var(--critico-texto)' : 'inherit'}">${pesosRedondos(a.resultado)}</div><div class="kpi-delta">después de ahorro y cuotas</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Se podría liberar</div><div class="kpi-valor">${pesosRedondos(a.capacidadSugerida)}</div><div class="kpi-delta">por mes, con recortes moderados</div></div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Qué comparar</h2></div>
      <div class="comparaciones">${COMPARACIONES.map(([k, t, d]) => h`<label class="comparacion"><span class="interruptor"><input type="checkbox" data-cmp="${k}" ${hg.analisis.comparaciones[k] ? crudo('checked') : ''}><span></span></span><span><strong>${t}</strong><small>${d}</small></span></label>`)}</div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Lo que encontramos</h2>${a.descartados ? h`<button class="boton chico fantasma" data-accion="restaurar">Ver ${a.descartados} ${a.descartados === 1 ? 'descartado' : 'descartados'}</button>` : ''}</div>
      ${a.hallazgos.length ? h`<div class="lista-hallazgos">${a.hallazgos.map((x) => h`<div class="hallazgo ${NIVEL[x.nivel][1]}">
        <span class="hallazgo-icono">${icono(NIVEL[x.nivel][0])}</span>
        <div class="hallazgo-texto"><strong>${x.titulo}</strong><p>${x.detalle}</p></div>
        ${x.ahorroPosible > 0 ? h`<div class="hallazgo-monto"><span>hasta</span><strong>${pesosRedondos(x.ahorroPosible)}</strong><span>por mes</span></div>` : ''}
        <button class="boton icono chico fantasma" data-descartar="${x.id}" data-ayuda="Descartar este hallazgo">${icono('cerrar')}</button></div>`)}</div>`
        : h`<p class="apagado">${icono('ok')} No encontramos nada llamativo con las comparaciones elegidas.</p>`}
    </div>

    ${a.regla ? regla(a) : ''}
    ${hg.analisis.comparaciones.topes ? topes(hg, a) : ''}
    ${planRecorte(hg, a, plan, u)}
    ${claude(a, per)}
  </div>`);

  raiz.addEventListener('change', (e) => cambio(e));
  raiz.addEventListener('input', (e) => entrada(e));
  raiz.addEventListener('click', (e) => clic(e, a, per, plan));
  if (irAvisos) setTimeout(() => raiz.querySelector('#avisos').scrollIntoView({ block: 'start' }), 30);
}

// Regla 50/30/20: barra apilada propia contra la regla.
function regla(a) {
  const r = a.regla;
  const partes = [['necesidades', 'Necesidades', 'var(--serie-1)'], ['gustos', 'Gustos', 'var(--serie-2)'], ['ahorro', 'Ahorro', 'var(--serie-3)']];
  const barra = (props, etiqueta) => {
    const total = Math.max(1, props.necesidades + props.gustos + Math.max(0, props.ahorro));
    let x = 0;
    return h`<div class="fila-apilada"><span class="etiqueta-apilada">${etiqueta}</span><svg viewBox="0 0 1000 26" preserveAspectRatio="none" class="apilada">${partes.map(([k, t, c], i) => {
      const w = (Math.max(0, props[k]) / total) * 1000;
      const seg = h`<g><title>${t}: ${porcentaje(props[k], 0)}</title><rect x="${x + (i ? 2 : 0)}" y="0" width="${Math.max(0, w - (i ? 2 : 0))}" height="26" fill="${c}" rx="${i === 2 ? 4 : 0}"/></g>`;
      x += w;
      return seg;
    })}</svg><span class="valores-apilada">${partes.map(([k, t]) => h`<span>${t} <strong>${porcentaje(props[k], 0)}</strong></span>`)}</span></div>`;
  };
  return h`<div class="tarjeta"><div class="tarjeta-titulo"><h2>Regla 50/30/20</h2><span class="apagado chico">sobre los ingresos</span></div>
    <div class="leyenda">${partes.map(([, t, c]) => h`<span><i style="background:${c}"></i>${t}</span>`)}</div>
    ${barra(r.prop, 'Tu hogar')}${barra(r.objetivo, 'La regla')}
    <p class="chico apagado" style="margin-top:8px">Necesidades: gastos esenciales, imprevistos y cuotas de deudas (${pesosRedondos(r.necesidades)}). Gustos: lo reducible y lo prescindible (${pesosRedondos(r.gustos)}). Ahorro: metas, inversiones y lo que sobra (${pesosRedondos(r.ahorro)}).</p></div>`;
}

function topes(hg, a) {
  const cats = hg.categorias.filter((c) => c.seccion === 'gastos' && hg.lineas.some((l) => l.categoriaId === c.id));
  const gasto = (cid) => a.lineas.filter((x) => x.categoria.id === cid).reduce((s, x) => s + x.monto, 0);
  return h`<div class="tarjeta"><div class="tarjeta-titulo"><h2>Tus topes por categoría</h2><span class="apagado chico">opcional: un límite propio, en % de los ingresos o en pesos</span></div>
    <table class="tabla"><thead><tr><th>Categoría</th><th class="der">Gasto por mes</th><th class="der">% de ingresos</th><th>Tope</th><th></th></tr></thead>
    <tbody>${cats.map((c) => {
      const t = hg.analisis.topes[c.id] || { tipo: 'porcentaje', valor: 0 };
      const g = gasto(c.id);
      const limite = t.valor > 0 ? (t.tipo === 'porcentaje' ? (t.valor / 100) * a.ingresos : t.valor) : null;
      return h`<tr data-tope="${c.id}"><td>${c.nombre}</td><td class="der">${pesosRedondos(g)}</td><td class="der">${a.ingresos ? porcentaje(g / a.ingresos, 1) : '—'}</td>
        <td><input class="entrada en-tabla monto" style="width:110px" data-tope-valor value="${t.valor ? (t.tipo === 'porcentaje' ? String(t.valor).replace('.', ',') : valorMonto(t.valor)) : ''}" placeholder="sin tope">
          <select class="entrada en-tabla" style="width:auto" data-tope-tipo>${opciones([['porcentaje', '% de ingresos'], ['monto', 'pesos']], t.tipo)}</select></td>
        <td>${limite !== null ? (g > limite ? h`<span class="etiqueta-chip alerta">${icono('alerta')}pasado por ${pesosRedondos(g - limite)}</span>` : h`<span class="etiqueta-chip bien">${icono('ok')}dentro</span>`) : ''}</td></tr>`;
    })}</tbody></table></div>`;
}

function planRecorte(hg, a, plan, u) {
  const metas = hg.metas;
  return h`<div class="tarjeta" id="plan-recorte"><div class="tarjeta-titulo"><h2>Plan de recorte</h2></div>
    <div class="fila-campos" style="align-items:end">
      <div class="campo"><label>¿Cuánto querés liberar por mes?</label><input class="entrada monto" data-u="objetivo" value="${u.objetivo}" placeholder="Ej.: 200000"></div>
      <div class="campo"><label class="casilla"><input type="checkbox" data-u="esenciales" ${u.esenciales ? crudo('checked') : ''}> Permitir bajar hasta 10 % los esenciales</label></div>
      <div class="campo">${u.ajustes ? h`<button class="boton chico" data-accion="reiniciar-plan">Volver a la propuesta</button>` : ''}</div>
    </div>
    ${plan ? h`
      <div class="nota ${plan.alcanza ? '' : 'aviso'}" style="margin-bottom:10px">${plan.alcanza ? h`${icono('ok')} Con estos recortes se liberan <strong>${pesosRedondos(plan.total)}</strong> por mes.` : h`${icono('alerta')} Con lo recortable llegás a <strong>${pesosRedondos(plan.total)}</strong>: faltan ${pesosRedondos(plan.faltante)}. Revisá los esenciales (alquiler, prepaga, servicios) o los ingresos.`}</div>
      <table class="tabla"><thead><tr><th>Concepto</th><th>Por qué</th><th class="der">Gasto por mes</th><th style="width:180px">Recorte</th><th class="der">Libera</th><th class="der">Queda</th></tr></thead>
        <tbody>${plan.filas.filter((f) => f.maximo > 0 || f.recorte > 0).map((f) => h`<tr>
          <td>${f.nombre}<div class="chico apagado">${f.categoria}</div></td><td class="chico">${f.motivo}</td><td class="der">${pesosRedondos(f.monto)}</td>
          <td><div class="control-recorte"><input type="range" min="0" max="${Math.round(f.maximo * 100)}" step="5" value="${Math.round(f.porcentaje * 100)}" data-recorte="${f.lineaId}"><span>${Math.round(f.porcentaje * 100)} %</span></div></td>
          <td class="der">${f.recorte ? pesosRedondos(f.recorte) : ''}</td><td class="der">${pesosRedondos(f.nuevo)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="der">${pesosRedondos(plan.total)}</td><td></td></tr></tfoot></table>
      <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <span>Crear un presupuesto con este plan desde</span>
        <select class="entrada" style="width:auto" data-plan-desde>${opciones(Array.from({ length: 6 }, (_, i) => sumarMeses(estado.ctx.mesHoy, i)).filter((m) => anioDe(m) === anioDe(estado.ctx.mesHoy)).map((m) => [m, capitalizar(nombreMes(m))]), sumarMeses(estado.ctx.mesHoy, 1) <= `${anioDe(estado.ctx.mesHoy)}-12` ? sumarMeses(estado.ctx.mesHoy, 1) : estado.ctx.mesHoy)}</select>
        ${metas.length ? h`<span>y sumar lo liberado a</span><select class="entrada" style="width:auto" data-plan-meta>${opciones([['', 'ninguna meta'], ...metas.map((m) => [m.lineaId, m.nombre])], (metas.find((m) => m.tipo !== 'fondo') || metas[0]).lineaId)}</select>` : ''}
        <button class="boton primario" data-accion="aplicar-plan">${icono('presupuestos')}Crear presupuesto</button></div>`
      : h`<p class="apagado">Escribí un monto y el programa propone cuánto bajar en cada concepto: primero lo prescindible, después lo reducible que está por encima de hogares parecidos o de tu historial. Lo esencial no se toca.</p>`}
  </div>`;
}

function claude(a, per) {
  const u = ui();
  return h`<div class="tarjeta"><div class="tarjeta-titulo"><h2>${icono('chispa')} Pedir consejo a Claude</h2><span class="etiqueta-chip">opcional</span></div>
    <p class="apagado">Claude es la inteligencia artificial de Anthropic. Se le manda un resumen con los totales por categoría (no los gastos sueltos ni sus descripciones) y devuelve sugerencias. Usa tu propia clave de API: cada consulta tiene un costo chico que se cobra en tu cuenta de Anthropic.</p>
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
      <button class="boton" data-accion="claude-ver">${icono('info')}Ver lo que se manda</button>
      <button class="boton primario" data-accion="claude-pedir" ${u.claudeCargando ? crudo('disabled') : ''}>${icono('chispa')}${u.claudeCargando ? 'Pensando…' : 'Pedir consejo'}</button>
      <button class="boton fantasma" data-accion="claude-ajustes">Clave y modelo</button>
    </div>
    <div id="claude-respuesta" class="${u.claude || u.claudeError || u.claudeCargando ? 'respuesta-claude' : ''}">${u.claudeError ? h`<p style="color:var(--critico-texto)">${u.claudeError}</p>` : u.claude ? crudo(markdownSimple(u.claude)) : u.claudeCargando ? h`<p class="apagado">Esperando la respuesta…</p>` : ''}</div>
  </div>`;
}

// Markdown mínimo y seguro: negritas, viñetas y párrafos. Todo se escapa antes.
function markdownSimple(texto) {
  const lineas = esc(texto).split(/\r?\n/);
  let html = '', enLista = false;
  for (const l of lineas) {
    const vineta = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const conFormato = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^#{1,4}\s*(.*)$/, '<strong>$1</strong>');
    if (vineta) { if (!enLista) { html += '<ul>'; enLista = true; } html += `<li>${conFormato(vineta[1])}</li>`; continue; }
    if (enLista) { html += '</ul>'; enLista = false; }
    if (l.trim()) html += `<p>${conFormato(l)}</p>`;
  }
  if (enLista) html += '</ul>';
  return html;
}

// Resumen que se manda a Claude (solo totales y clasificaciones).
export function resumenParaClaude(a, per, { nombres = true } = {}) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const comp = composicion(hg);
  const edades = hg.integrantes.filter((p) => Number.isFinite(p.edad)).map((p) => `${p.tipo === 'menor' ? 'menor' : 'adulto'} de ${p.edad}`);
  const ult = per.meses[per.meses.length - 1];
  const can = canastaHogar(ctx, ult);
  const P = (c) => pesosRedondos(c);
  const out = [];
  out.push(`Hogar: ${comp.nombre}${edades.length ? ` (${edades.join(', ')})` : ''}, región ${nombreRegion(hg.region)}, ${tenencia(ctx) === 'i' ? 'alquila' : 'no alquila'}.`);
  out.push(`Período: ${per.descripcion.toLowerCase()}. Montos en pesos por mes.`);
  out.push(`Ingresos: ${P(a.ingresos)}.${can.pobreza ? ` Canasta básica total del hogar: ${P(can.pobreza)} (los ingresos son ${(a.ingresos / can.pobreza).toFixed(2).replace('.', ',')} veces).` : ''}`);
  out.push('Gastos de consumo por categoría:');
  const porCat = new Map();
  for (const x of a.lineas) {
    if (!porCat.has(x.categoria.id)) porCat.set(x.categoria.id, { nombre: x.categoria.nombre, total: 0, lineas: [] });
    const c = porCat.get(x.categoria.id);
    c.total += x.monto;
    c.lineas.push(x);
  }
  for (const c of [...porCat.values()].sort((x, y) => y.total - x.total)) {
    const detalle = nombres ? ` (${c.lineas.sort((x, y) => y.monto - x.monto).map((x) => `${x.linea.nombre} ${P(x.monto)}, ${x.linea.naturaleza}, ${CLASES[x.clase] ? CLASES[x.clase].nombre.toLowerCase() : x.clase}`).join('; ')})` : '';
    out.push(`- ${c.nombre}: ${P(c.total)}${detalle}`);
  }
  const S = a.secciones;
  out.push(`Imprevistos: ${P(S.inesperados)} (pagados con el fondo de emergencia: ${P(a.cobertura)}). Cuotas de préstamos: ${P(S.deudas)}. Ahorro: ${P(S.ahorro)}. Inversiones: ${P(S.inversiones)}. Resultado del mes: ${P(a.resultado)}.`);
  const fondo = hg.metas.find((m) => m.tipo === 'fondo');
  if (fondo) { const e = estadoMeta(ctx, fondo); out.push(`Fondo de emergencia: ${P(e.saldo)} de un objetivo de ${P(e.objetivoFinal)} (${fondo.mesesCobertura} meses de gastos).`); }
  for (const m of hg.metas.filter((x) => x.tipo !== 'fondo')) { const e = estadoMeta(ctx, m); out.push(`Meta "${nombres ? m.nombre : 'de ahorro'}": ${P(e.saldo)} de ${P(e.objetivoFinal)}${m.fecha ? ` para ${nombreMes(m.fecha)}` : ''}.`); }
  if (a.parecidos) {
    out.push(`Comparación con hogares parecidos (ENGHo 2017-18 del INDEC, actualizada por precios): ${a.parecidos.ref.descripcion}.`);
    for (const f of a.parecidos.filas) if (f.tuyo || f.refProp > 0.03) out.push(`- ${nombreIndice(f.indice)}: este hogar ${porcentaje(f.tuyoProp, 0)} del gasto, hogares parecidos ${porcentaje(f.refProp, 0)}.`);
  }
  if (a.hallazgos.length) {
    out.push('Lo que ya detectó el programa:');
    for (const x of a.hallazgos) out.push(`- ${x.titulo}. ${x.detalle}`);
  }
  out.push('¿Qué me recomendás para ordenar este presupuesto?');
  return out.join('\n');
}

// ── Eventos ─────────────────────────────────────────────────────────────────────
function cambio(e) {
  const t = e.target;
  const u = ui();
  if (t.dataset.u) { u[t.dataset.u] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.u !== 'objetivo') { u.ajustes = null; notificar('vista'); } return; }
  if (t.dataset.cmp) { mutar((x) => { x.analisis.comparaciones[t.dataset.cmp] = t.checked; }); return; }
  const fila = t.closest('[data-tope]');
  if (fila) {
    const cid = fila.dataset.tope;
    const valorTxt = fila.querySelector('[data-tope-valor]').value.trim();
    const tipo = fila.querySelector('[data-tope-tipo]').value;
    let valor = 0;
    if (valorTxt) {
      valor = tipo === 'porcentaje' ? Number(valorTxt.replace(',', '.').replace('%', '')) : leerMonto(valorTxt);
      if (!(valor >= 0)) { avisar('Ese tope no se entiende.', { tipo: 'error' }); return; }
    }
    mutar((x) => { if (valor > 0) x.analisis.topes[cid] = { tipo, valor }; else delete x.analisis.topes[cid]; });
    return;
  }
  if (t.dataset.recorte) {
    const plan = document.querySelectorAll('[data-recorte]');
    const ajustes = {};
    plan.forEach((r) => { ajustes[r.dataset.recorte] = Number(r.value) / 100; });
    ui().ajustes = ajustes;
    notificar('vista');
  }
}

function entrada(e) {
  const t = e.target;
  if (t.dataset.u === 'objetivo') {
    ui().objetivo = t.value;
    ui().ajustes = null;
    clearTimeout(entrada._t);
    entrada._t = setTimeout(() => {
      notificar('vista');
      const el = document.querySelector('[data-u="objetivo"]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 400);
  }
  if (t.dataset.recorte) t.nextElementSibling.textContent = `${t.value} %`;
}

async function clic(e, a, per, plan) {
  const d = e.target.closest('[data-descartar]');
  if (d) { mutar((x) => { x.analisis.descartados.push(d.dataset.descartar); }); return; }
  const av = e.target.closest('[data-aviso]');
  if (av) {
    const tipo = av.dataset.aviso;
    if (tipo === 'planilla') { if (av.dataset.mes) { estado.ui.mesFoco = av.dataset.mes; estado.ui.anio = anioDe(av.dataset.mes); estado.ui.modo = 'comparar'; } irA('planilla'); }
    else if (tipo === 'cerrar') abrirCierre(av.dataset.mes);
    else irA(tipo);
    return;
  }
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  switch (b.dataset.accion) {
    case 'restaurar': mutar((x) => { x.analisis.descartados = []; }); break;
    case 'reiniciar-plan': ui().ajustes = null; notificar('vista'); break;
    case 'aplicar-plan': {
      const hg = estado.hogar;
      const desde = document.querySelector('[data-plan-desde]').value;
      const metaEl = document.querySelector('[data-plan-meta]');
      const metaLineaId = metaEl ? metaEl.value || null : null;
      const base = planActivo(hg, anioDe(desde));
      if (!base) { avisar('No hay presupuesto para ese año.'); return; }
      let nuevo;
      mutar((x) => {
        nuevo = planConRecortes(estado.ctx, base, plan.filas.filter((f) => f.porcentaje > 0), { desdeMes: desde, metaLineaId });
        x.planes.push(nuevo);
      });
      avisar(`Se creó "${nuevo.nombre}".`, { tipo: 'ok', duracion: 8000, accion: { texto: 'Usarlo en la planilla', fn: () => { mutar((x) => { x.planActivo[nuevo.anio] = nuevo.id; }); irA('planilla'); } } });
      break;
    }
    case 'claude-ver': {
      const texto = resumenParaClaude(a, per, { nombres: true });
      await dialogo({ titulo: 'Esto es lo que se manda a Claude', ancho: 'ancho', cuerpo: h`<pre class="resumen-claude">${texto}</pre><p class="chico apagado">Además se manda una instrucción con el formato de la respuesta. No se mandan movimientos, descripciones, nombres de personas ni el archivo.</p>`, botones: [{ texto: 'Cerrar', valor: 'ok', tipo: 'primario' }] });
      break;
    }
    case 'claude-ajustes': irA('ajustes', { seccion: 'claude' }); break;
    case 'claude-pedir': await pedirConsejo(a, per); break;
    default: break;
  }
}

async function pedirConsejo(a, per) {
  const u = ui();
  const est = await window.mp.claude.estado();
  if (!est.tieneClave) {
    avisar('Primero cargá tu clave de API de Anthropic en Ajustes.', { accion: { texto: 'Ir', fn: () => irA('ajustes', { seccion: 'claude' }) } });
    return;
  }
  u.claude = ''; u.claudeError = ''; u.claudeCargando = true;
  notificar('vista');
  const quitar = window.mp.claude.alTexto((t) => {
    u.claude += t;
    const cont = document.getElementById('claude-respuesta');
    if (cont) { cont.className = 'respuesta-claude'; cont.innerHTML = markdownSimple(u.claude); }
  });
  try {
    const r = await window.mp.claude.consultar({ resumen: resumenParaClaude(a, per, { nombres: true }), modelo: estado.ajustes.claudeModelo || est.porDefecto });
    if (r.ok) { u.claude = r.texto + (r.cortado ? '\n\n(La respuesta quedó cortada.)' : ''); }
    else { u.claudeError = r.error; }
  } finally {
    quitar();
    u.claudeCargando = false;
    notificar('vista');
  }
}

export default { titulo: 'Análisis', icono: 'analisis', render };
