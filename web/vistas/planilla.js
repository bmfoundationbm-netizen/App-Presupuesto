// Mi Presupuesto · planilla (vista principal)

import { estado, mutar, irA, notificar } from '../estado.js';
import { h, crudo, montar, icono, montoCelda, montoTexto, leerMonto, avisar, dialogo, confirmar, menu, opciones, pedirTexto } from '../ui.js';
import { calcularAnio, aPesos } from '../lib/calculos.js';
import { SECCIONES, INDICES, CLASES, nombreIndice, claseSugerida } from '../lib/catalogo.js';
import { MES_CORTO, mesesDelAnio, nombreMes, anioDe, mesActual, capitalizar, formatoFecha, sumarMeses } from '../lib/fechas.js';
import {
  fijarPlan, fijarPlanFijo, fijarReal, borrarLinea, planActivo, nuevoPlan, categoria, asegurarAguinaldo,
  linea as buscarLinea, seccionDeLinea, indiceDeLinea, mesFinCuotas
} from '../lib/modelo.js';
import { crearPlanAnio } from '../lib/presupuestos.js';
import { formatear, pesos, porcentaje } from '../lib/dinero.js';
import { colorCategoria, COLOR_SECCION } from '../graficos/colores.js';
import { dialogoLinea, dialogoMovimiento, dialogoCompraCuotas, dialogoMeta, dialogoDeuda, dialogoInversion, valorMonto } from './dialogos.js';
import { abrirCierre } from './cierre.js';

const ui = () => estado.ui;
let filasNav = [];        // líneas navegables, en el orden en que se ven
let res = null;           // cálculo del año
let editor = null;        // edición en curso { input, lineaId, i }

const esGastoLike = (sec) => sec === 'gastos' || sec === 'inesperados' || sec === 'deudas';

// ── Armado de filas ─────────────────────────────────────────────────────────────
function construirFilas(hg) {
  const filas = [];
  const modo = ui().modo;
  for (const s of SECCIONES) {
    const cats = hg.categorias.filter((c) => c.seccion === s.clave).sort((a, b) => a.orden - b.orden);
    filas.push({ tipo: 'seccion', seccion: s });
    const lineasDe = (cat) => hg.lineas.filter((l) => l.categoriaId === cat.id && visible(l)).sort((a, b) => a.orden - b.orden);
    if (s.clave === 'gastos') {
      for (const c of cats) {
        const ls = lineasDe(c);
        if (!ls.length && !ui().mostrarVacias) continue;
        filas.push({ tipo: 'categoria', categoria: c, cantidad: ls.length });
        if (!c.plegada) {
          for (const l of ls) filas.push({ tipo: 'linea', linea: l, seccion: s.clave, nivel: 2 });
          filas.push({ tipo: 'agregar', seccion: s.clave, categoriaId: c.id, nivel: 2 });
        }
      }
      if (!ui().mostrarVacias) filas.push({ tipo: 'agregar', seccion: s.clave, categoriaId: null, nivel: 1, texto: 'Agregar concepto de gasto' });
    } else {
      for (const c of cats) for (const l of lineasDe(c)) filas.push({ tipo: 'linea', linea: l, seccion: s.clave, nivel: 1 });
      filas.push({ tipo: 'agregar', seccion: s.clave, categoriaId: cats[0] && cats[0].id, nivel: 1 });
      if (s.clave === 'inesperados' && modo !== 'plan' && res.cobertura.some((x) => x)) filas.push({ tipo: 'cobertura' });
    }
  }
  filas.push({ tipo: 'resultado' });
  filas.push({ tipo: 'acumulado' });
  return filas;
}

function visible(l) {
  const f = res.lineas.get(l.id);
  if (l.auto === 'saldo') return !!(f && f.real.some((x) => x));
  if (l.archivada) return !!(f && f.tieneValores);
  return true;
}

// ── Celdas ──────────────────────────────────────────────────────────────────────
function estadoComparacion(sec, plan, real, origen, mes) {
  if (!(plan > 0) || real === null || real === undefined || origen === 'supuesto' || mes > estado.ctx.mesHoy) return null;
  if (esGastoLike(sec)) {
    if (real > plan) return { clase: 'pasado', texto: `▲${Math.round((real / plan - 1) * 100)}%` };
    // "Cerca del límite" solo tiene sentido en el mes que está corriendo.
    if (real >= plan * 0.9 && mes === estado.ctx.mesHoy) return { clase: 'cerca', texto: '●' };
  } else if (sec === 'ingresos' && real < plan * 0.98 && mes < estado.ctx.mesHoy) {
    return { clase: 'pasado', texto: `▼${Math.round((1 - real / plan) * 100)}%` };
  }
  return null;
}

function celdaLinea(l, sec, fila, i, mes) {
  const modo = ui().modo;
  const sel = ui().seleccion && ui().seleccion.lineaId === l.id && ui().seleccion.i === i;
  const clases = ['c'];
  if (mes === estado.ctx.mesHoy) clases.push('mes-actual');
  if (sel) clases.push('sel');
  if (enRango(l.id, i)) clases.push('en-rango');
  const usd = l.moneda === 'USD';
  const fmt = (v) => (v === null || v === undefined ? '' : montoCelda(v, l.moneda));
  if (modo === 'plan') {
    const v = fila.plan[i];
    const o = fila.origenPlan[i];
    if (o === 'deuda' || o === 'auto') clases.push('auto');
    if (l.auto !== 'saldo') clases.push('editable');
    return h`<td class="${clases.join(' ')}" data-l="${l.id}" data-i="${i}">${fmt(v)}</td>`;
  }
  const v = fila.real[i];
  const o = fila.origenReal[i];
  const it = fila.items[i];
  if (o === 'supuesto') clases.push('supuesto');
  if (o === 'auto') clases.push('auto');
  if (it.movimientos) clases.push('con-movs');
  if (it.cuotas) clases.push('con-cuotas');
  if (mes > estado.ctx.mesHoy) clases.push('futuro-real');
  if (modo === 'real') {
    if (l.auto !== 'saldo') clases.push('editable');
    return h`<td class="${clases.join(' ')}" data-l="${l.id}" data-i="${i}">${fmt(v)}</td>`;
  }
  const est = estadoComparacion(sec, fila.plan[i], v, o, mes);
  if (est) clases.push(`${est.clase}-bg`);
  return h`<td class="${clases.join(' ')}" data-l="${l.id}" data-i="${i}"><span class="real">${fmt(v)}${est ? h`<span class="estado ${est.clase}">${est.texto}</span>` : ''}</span><span class="plan">${fila.plan[i] !== null ? fmt(fila.plan[i]) : ''}</span></td>`;
}

function celdasTotales(valoresPlan, valoresReal, { sec = null, claseExtra = '' } = {}) {
  const modo = ui().modo;
  const meses = res.meses;
  const out = [];
  let totP = 0, totR = 0;
  for (let i = 0; i < 12; i++) {
    const p = valoresPlan[i] || 0, r = valoresReal[i] || 0;
    totP += p; totR += r;
    const actual = meses[i] === estado.ctx.mesHoy ? 'mes-actual' : '';
    if (modo === 'plan') out.push(h`<td class="c ${actual} ${claseExtra}">${p ? montoCelda(p) : ''}</td>`);
    else if (modo === 'real') out.push(h`<td class="c ${actual} ${claseExtra} ${meses[i] > estado.ctx.mesHoy ? 'futuro-real' : ''}">${r ? montoCelda(r) : ''}</td>`);
    else {
      const est = sec ? estadoComparacion(sec, p, r, null, meses[i]) : null;
      out.push(h`<td class="c ${actual} ${claseExtra} ${est ? `${est.clase}-bg` : ''}"><span class="real">${r ? montoCelda(r) : ''}${est ? h`<span class="estado ${est.clase}">${est.texto}</span>` : ''}</span><span class="plan">${p ? montoCelda(p) : ''}</span></td>`);
    }
  }
  const tot = modo === 'plan' ? totP : totR;
  out.push(modo === 'comparar'
    ? h`<td class="c total"><span class="real">${montoCelda(totR)}</span><span class="plan">${montoCelda(totP)}</span></td>`
    : h`<td class="c total">${tot ? montoCelda(tot) : ''}</td>`);
  return out;
}

function enRango(lineaId, i) {
  const r = ui().rango;
  if (!r) return false;
  const f = filasNav.findIndex((l) => l.id === lineaId);
  const f1 = Math.min(r.a.f, r.b.f), f2 = Math.max(r.a.f, r.b.f);
  const i1 = Math.min(r.a.i, r.b.i), i2 = Math.max(r.a.i, r.b.i);
  return f >= f1 && f <= f2 && i >= i1 && i <= i2 && !(f1 === f2 && i1 === i2);
}

function marcasLinea(l, sec) {
  const m = [];
  if (l.moneda === 'USD') m.push(h`<span class="marca-mini usd" data-ayuda="En dólares">US$</span>`);
  if (l.naturaleza === 'fijo' && !l.auto) m.push(h`<span class="marca-mini" data-ayuda="Fijo: se repite cada mes y, si el mes ya empezó, se da por pagado igual a lo planeado">F</span>`);
  if (l.auto) m.push(h`<span class="marca-mini" data-ayuda="${l.auto === 'aguinaldo' ? 'Se calcula solo: la mitad del mejor sueldo de cada semestre' : 'Viene del cierre del mes anterior'}">auto</span>`);
  if (sec === 'gastos' && l.clase === 'prescindible') m.push(h`<span class="marca-mini prescindible" data-ayuda="Prescindible: se puede dejar de pagar por un tiempo">P</span>`);
  return m;
}

function filaHtml(f, hg) {
  const meses = res.meses;
  switch (f.tipo) {
    case 'seccion': {
      const s = f.seccion;
      const v = res.secciones[s.clave];
      // Los ingresos se comparan línea por línea: el total incluye el sobrante del mes
      // anterior, que no se planea.
      return h`<tr class="f-seccion" style="--color-seccion:${COLOR_SECCION[s.clave]}"><td class="col-concepto"><div class="nombre-seccion"><span class="franja-color"></span>${s.nombre}</div></td>${celdasTotales(v.plan, v.real, { sec: s.clave === 'ingresos' ? null : s.clave })}</tr>`;
    }
    case 'categoria': {
      const c = f.categoria;
      const v = res.categorias.get(c.id);
      return h`<tr class="f-categoria" data-cat="${c.id}"><td class="col-concepto"><div class="celda-concepto">
        <button class="plegar ${c.plegada ? 'cerrada' : ''}" data-accion="plegar" data-cat="${c.id}" aria-label="Plegar o desplegar">${icono('abajo')}</button>
        <span class="punto-color" style="background:${colorCategoria(c)}"></span><span class="nombre">${c.nombre}</span>
        <span class="marcas">${c.plegada ? h`<span class="marca-mini">${f.cantidad}</span>` : ''}<button class="acciones-linea" data-accion="agregar" data-sec="gastos" data-cat="${c.id}" data-ayuda="Agregar un concepto a ${c.nombre}">${icono('mas')}</button></span>
      </div></td>${celdasTotales(v.plan, v.real, { sec: 'gastos' })}</tr>`;
    }
    case 'linea': {
      const l = f.linea;
      const fila = res.lineas.get(l.id);
      const sel = ui().seleccion && ui().seleccion.lineaId === l.id;
      const total = (arr) => arr.reduce((s, x) => s + (x || 0), 0);
      const modo = ui().modo;
      const tot = modo === 'plan' ? total(fila.plan) : total(fila.real);
      const persona = l.personaId ? hg.integrantes.find((p) => p.id === l.personaId) : null;
      return h`<tr class="f-linea ${sel ? 'fila-sel' : ''}" data-linea="${l.id}"><td class="col-concepto"><div class="celda-concepto">
        <span class="${f.nivel === 2 ? 'sangria-2' : 'sangria'}"></span>
        <span class="nombre" data-ayuda="${persona ? `${l.nombre} · ${persona.nombre}` : l.nombre}">${l.nombre}</span>
        <span class="marcas">${marcasLinea(l, f.seccion)}<button class="acciones-linea" data-accion="menu-linea" data-l="${l.id}" aria-label="Opciones">${icono('puntos')}</button></span>
      </div></td>${meses.map((m, i) => celdaLinea(l, f.seccion, fila, i, m))}${modo === 'comparar'
        ? h`<td class="c total"><span class="real">${montoCelda(total(fila.real), l.moneda)}</span><span class="plan">${montoCelda(total(fila.plan), l.moneda)}</span></td>`
        : h`<td class="c total">${tot ? montoCelda(tot, l.moneda) : ''}</td>`}</tr>`;
    }
    case 'agregar':
      return h`<tr class="f-agregar"><td class="col-concepto"><div class="celda-concepto"><span class="${f.nivel === 2 ? 'sangria-2' : 'sangria'}"></span>
        <button class="boton-agregar" data-accion="agregar" data-sec="${f.seccion}" data-cat="${f.categoriaId || ''}">${icono('mas')}${f.texto || textoAgregar(f.seccion)}</button></div></td><td colspan="13"></td></tr>`;
    case 'cobertura':
      return h`<tr class="f-sub"><td class="col-concepto"><div class="celda-concepto"><span class="sangria"></span><span class="nombre" data-ayuda="Los imprevistos se pagan con lo ahorrado en el fondo de emergencia, hasta lo que tenga">Pagado con el fondo de emergencia</span></div></td>
        ${res.cobertura.map((v, i) => h`<td class="c ${res.meses[i] === estado.ctx.mesHoy ? 'mes-actual' : ''}">${v ? `−${montoCelda(v)}` : ''}</td>`)}<td class="c total">${res.anual.cobertura ? `−${montoCelda(res.anual.cobertura)}` : ''}</td></tr>`;
    case 'resultado': {
      const modo = ui().modo;
      const valores = modo === 'plan' ? res.resultado.plan : res.resultado.real;
      const celdas = valores.map((v, i) => {
        const futuro = modo !== 'plan' && res.meses[i] > estado.ctx.mesHoy;
        const clase = futuro ? 'futuro-real' : v > 0 ? 'positivo' : v < 0 ? 'negativo' : '';
        if (modo === 'comparar') return h`<td class="c ${clase}"><span class="real">${futuro ? '' : montoCelda(v)}</span><span class="plan">${montoCelda(res.resultado.plan[i])}</span></td>`;
        return h`<td class="c ${clase}">${futuro ? '' : montoCelda(v)}</td>`;
      });
      const tot = modo === 'plan' ? res.anual.resultado.plan : res.anual.resultado.real;
      return h`<tr class="f-resultado"><td class="col-concepto"><div class="celda-concepto"><span class="sangria"></span><span class="nombre">Resultado del mes</span>
        <span class="marcas"><span class="marca-mini" data-ayuda="Ingresos menos gastos, imprevistos (lo que no cubrió el fondo), ahorro, cuotas de deudas e inversiones. Positivo: sobra. Negativo: falta.">?</span></span></div></td>
        ${celdas}<td class="c total ${tot > 0 ? 'positivo' : tot < 0 ? 'negativo' : ''}">${montoCelda(tot)}</td></tr>`;
    }
    case 'acumulado': {
      const modo = ui().modo === 'plan' ? 'plan' : 'real';
      let acum = 0;
      return h`<tr class="f-sub"><td class="col-concepto"><div class="celda-concepto"><span class="sangria"></span><span class="nombre">Acumulado del año</span></div></td>
        ${res.resultado[modo].map((v, i) => { acum += v; const futuro = modo === 'real' && res.meses[i] > estado.ctx.mesHoy; return h`<td class="c">${futuro ? '' : montoCelda(acum)}</td>`; })}<td class="c total"></td></tr>`;
    }
    default: return '';
  }
}

function textoAgregar(sec) {
  return { ingresos: 'Agregar ingreso', inesperados: 'Agregar tipo de imprevisto', ahorro: 'Agregar meta de ahorro', deudas: 'Agregar préstamo o deuda', inversiones: 'Agregar inversión', gastos: 'Agregar concepto' }[sec];
}

// ── Indicadores del mes ─────────────────────────────────────────────────────────
function kpis() {
  const anio = ui().anio;
  const mes = anioDe(ui().mesFoco) === anio ? ui().mesFoco : `${anio}-01`;
  const i = res.meses.indexOf(mes);
  const S = res.secciones;
  const futuro = mes > estado.ctx.mesHoy;
  const fuente = futuro ? 'plan' : 'real';
  const gastos = (k) => S.gastos[k][i] + S.inesperados[k][i] - (k === 'real' ? res.cobertura[i] : 0) + S.deudas[k][i];
  const ahorro = (k) => S.ahorro[k][i] + S.inversiones[k][i];
  const ing = { plan: S.ingresos.plan[i], real: S.ingresos.real[i] };
  const gas = { plan: gastos('plan'), real: gastos('real') };
  const aho = { plan: ahorro('plan'), real: ahorro('real') };
  const resu = { plan: res.resultado.plan[i], real: res.resultado.real[i] };
  const deTanto = (k, v) => (futuro || !v[k === 'real' ? 'plan' : 'real'] ? '' : h`de ${pesos(Math.round(v.plan / 100) * 100)} planeados`);
  const prop = gas.plan > 0 ? gas.real / gas.plan : 0;
  const cerrado = !!estado.hogar.cierres[mes];
  const estadoMes = cerrado ? h`<span class="etiqueta-chip">${icono('candado')} Cerrado</span>` : mes === estado.ctx.mesHoy ? h`<span class="etiqueta-chip acento">Mes en curso</span>` : futuro ? h`<span class="etiqueta-chip">Planeado</span>` : h`<span class="etiqueta-chip aviso">Sin cerrar</span>`;
  return h`
    <div class="planilla-kpis">
      <div class="titulo-mes"><strong>${capitalizar(nombreMes(mes))}</strong> ${estadoMes}
        ${!futuro && !cerrado && mes < estado.ctx.mesHoy ? h`<button class="boton chico" data-accion="cerrar-mes" data-mes="${mes}">${icono('candado')}Cerrar ${nombreMes(mes, { conAnio: false })}</button>` : ''}
        ${cerrado ? h`<button class="boton chico fantasma" data-accion="reabrir-mes" data-mes="${mes}">Reabrir</button>` : ''}
        <span class="apagado chico">${futuro ? 'Lo planeado para ese mes.' : mes === estado.ctx.mesHoy ? 'Lo cargado hasta ahora, con los fijos que se dan por pagados.' : 'Lo real del mes.'} Tocá un mes en el encabezado de la planilla para cambiarlo.</span>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-etiqueta">Ingresos</div><div class="kpi-valor">${pesos(Math.round(ing[fuente] / 100) * 100)}</div><div class="kpi-delta">${deTanto(fuente, ing)}</div></div>
        <div class="kpi"><div class="kpi-etiqueta">Gastos, imprevistos y cuotas</div><div class="kpi-valor">${pesos(Math.round(gas[fuente] / 100) * 100)}</div>
          <div class="kpi-delta">${futuro ? '' : h`${deTanto(fuente, gas)}${prop > 1 ? h`<span class="mal">${icono('alerta')} ${porcentaje(prop - 1, 0)} más</span>` : ''}`}</div>
          ${!futuro && gas.plan > 0 ? h`<div class="medidor ${prop > 1 ? 'critico' : prop >= 0.9 ? 'atencion' : ''}" role="meter" aria-valuenow="${Math.round(prop * 100)}"><span style="width:${Math.min(100, prop * 100)}%"></span></div>` : ''}</div>
        <div class="kpi"><div class="kpi-etiqueta">Ahorro e inversiones</div><div class="kpi-valor">${pesos(Math.round(aho[fuente] / 100) * 100)}</div><div class="kpi-delta">${deTanto(fuente, aho)}</div></div>
        <div class="kpi"><div class="kpi-etiqueta">${resu[fuente] >= 0 ? 'Sobrante' : 'Faltante'}${mes === estado.ctx.mesHoy ? ' hasta ahora' : ''}</div><div class="kpi-valor" style="color:${resu[fuente] < 0 ? 'var(--critico-texto)' : 'inherit'}">${pesos(Math.round(Math.abs(resu[fuente]) / 100) * 100)}</div>
          <div class="kpi-delta">${futuro ? 'según lo planeado' : h`planeado: ${pesos(Math.round(resu.plan / 100) * 100)}`}</div></div>
      </div>
    </div>`;
}

// ── Panel de detalle ────────────────────────────────────────────────────────────
const TEXTO_ORIGEN = {
  manual: 'escrito a mano en la celda',
  movimientos: 'suma de los movimientos cargados',
  cuotas: 'cuotas de compras',
  auto: 'calculado automáticamente',
  supuesto: 'se da por pagado igual a lo planeado'
};

function panel(hg) {
  const s = ui().seleccion;
  if (!ui().panel) return '';
  const l = s && buscarLinea(hg, s.lineaId);
  if (!l) {
    return h`<aside class="panel-detalle" data-scroll="panel"><div class="seccion-panel">
      <h4>Detalle</h4><p class="apagado">Elegí una celda de un concepto para ver el detalle del mes, cargar gastos sueltos o cambiar su configuración.</p>
      <div class="nota" style="margin-top:12px">${icono('info')}<strong>Tip:</strong> escribí directo en una celda y apretá Enter. Podés pegar varias celdas copiadas de Excel.</div>
      <div class="leyenda-origen" style="flex-direction:column;align-items:flex-start;gap:6px;margin-top:14px">
        <span><i></i> tiene gastos sueltos cargados</span><span><i class="cuota"></i> incluye cuotas de compras</span><span><em>cursiva</em>: fijo que se da por pagado</span>
      </div></div></aside>`;
  }
  const mes = res.meses[s.i];
  const fila = res.lineas.get(l.id);
  const sec = seccionDeLinea(hg, l);
  const cat = categoria(hg, l.categoriaId);
  const plan = fila.plan[s.i], real = fila.real[s.i], oReal = fila.origenReal[s.i], oPlan = fila.origenPlan[s.i];
  const movs = hg.movimientos.filter((m) => m.lineaId === l.id && m.fecha.slice(0, 7) === mes).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cuotas = hg.cuotas.filter((c) => c.lineaId === l.id && mes >= c.primerMes && mes <= mesFinCuotas(c));
  const medio = (id) => (hg.medios.find((m) => m.id === id) || {}).nombre;
  const persona = (id) => (hg.integrantes.find((p) => p.id === id) || {}).nombre;
  const dif = real !== null && plan !== null ? real - plan : null;
  const meta = l.metaId && hg.metas.find((m) => m.id === l.metaId);
  const deuda = l.deudaId && hg.deudas.find((d) => d.id === l.deudaId);
  const inv = l.inversionId && hg.inversiones.find((i) => i.id === l.inversionId);
  const editableConfig = !l.auto;
  return h`<aside class="panel-detalle" data-scroll="panel">
    <div class="cab">
      <div class="linea-titulo"><span class="punto-color" style="background:${colorCategoria(cat)}"></span><h3>${l.nombre}</h3>
        <button class="boton icono chico fantasma" data-accion="cerrar-panel" aria-label="Cerrar el panel">${icono('cerrar')}</button></div>
      <div class="ruta">${SECCIONES.find((x) => x.clave === sec).nombre}${sec === 'gastos' ? ` › ${cat.nombre}` : ''}</div>
    </div>
    <div class="seccion-panel">
      <h4>${capitalizar(nombreMes(mes))}</h4>
      <div class="resumen-mes">
        <span>Planeado${oPlan === 'deuda' ? ' (cuota del préstamo)' : oPlan === 'auto' ? ' (calculado)' : ''}</span><span class="valor">${plan !== null ? montoTexto(plan, l.moneda) : '—'}</span>
        <span>Real${oReal ? h` <span class="apagado chico">(${TEXTO_ORIGEN[oReal]})</span>` : ''}</span><span class="valor">${real !== null ? montoTexto(real, l.moneda) : '—'}</span>
        ${dif !== null && mes <= estado.ctx.mesHoy ? h`<span>Diferencia</span><span class="valor" style="color:${(esGastoLike(sec) ? dif > 0 : dif < 0) ? 'var(--critico-texto)' : 'inherit'}">${montoTexto(dif, l.moneda)}</span>` : ''}
        ${l.moneda === 'USD' && real ? h`<span class="apagado">En pesos</span><span class="valor apagado">${pesos(aPesos(estado.ctx, real, 'USD', mes))}</span>` : ''}
      </div>
      ${oReal === 'supuesto' ? h`<div class="nota" style="margin-top:10px">Es un concepto fijo: se da por pagado igual a lo planeado hasta que cargues otro monto o cierres el mes.
        <div style="margin-top:8px;display:flex;gap:6px"><button class="boton chico" data-accion="confirmar-supuesto">${icono('ok')}Confirmar</button><button class="boton chico" data-accion="editar-real">Fue otro monto…</button></div></div>` : ''}
      ${oReal === 'manual' && (movs.length || cuotas.length) ? h`<div class="nota aviso" style="margin-top:10px">Hay un total escrito a mano: los ${movs.length + cuotas.length} gastos sueltos de abajo no se suman.
        <div style="margin-top:8px"><button class="boton chico" data-accion="usar-suma">Usar la suma de los gastos</button></div></div>` : ''}
    </div>
    ${l.auto === 'saldo' ? '' : h`<div class="seccion-panel">
      <h4>Gastos sueltos del mes</h4>
      ${movs.length ? h`<div class="lista-movs">${movs.map((m) => h`<div class="mov" data-mov="${m.id}"><span class="fecha">${formatoFecha(m.fecha).slice(0, 5)}</span>
        <span class="desc">${m.descripcion || h`<span class="apagado">Sin descripción</span>`}${m.medioId || m.personaId ? h`<small>${[medio(m.medioId), persona(m.personaId)].filter(Boolean).join(' · ')}</small>` : ''}</span>
        <span class="monto">${montoTexto(m.monto, l.moneda)}</span><button class="acciones-linea" data-accion="editar-mov" data-mov="${m.id}" aria-label="Editar">${icono('editar')}</button></div>`)}</div>` : h`<p class="apagado chico">No hay gastos sueltos en este mes.</p>`}
      <button class="boton chico" data-accion="nuevo-mov" style="margin-top:8px">${icono('mas')}Cargar un gasto</button>
    </div>
    <div class="seccion-panel">
      <h4>Compras en cuotas</h4>
      ${cuotas.length ? h`<div class="lista-movs">${cuotas.map((c) => {
        const n = (Number(mes.slice(0, 4)) - Number(c.primerMes.slice(0, 4))) * 12 + Number(mes.slice(5)) - Number(c.primerMes.slice(5)) + 1;
        return h`<div class="mov"><span class="fecha">${n}/${c.cantidad}</span><span class="desc">${c.descripcion}<small>hasta ${nombreMes(mesFinCuotas(c))}</small></span><span class="monto">${montoTexto(c.montoCuota, l.moneda)}</span><button class="acciones-linea" data-accion="editar-cuotas" data-c="${c.id}" aria-label="Editar">${icono('editar')}</button></div>`;
      })}</div>` : h`<p class="apagado chico">Ninguna en este mes.</p>`}
      <button class="boton chico" data-accion="nueva-cuota" style="margin-top:8px">${icono('tarjeta')}Nueva compra en cuotas</button>
    </div>`}
    ${meta ? h`<div class="seccion-panel"><h4>Meta de ahorro</h4><p>Este concepto es el aporte mensual a <strong>${meta.nombre}</strong>.</p><button class="boton chico" data-accion="ir-ahorro">Ver la meta</button></div>` : ''}
    ${deuda ? h`<div class="seccion-panel"><h4>Préstamo</h4><p>${deuda.cuotas} cuotas de ${montoTexto(deuda.cuota, deuda.moneda)} desde ${nombreMes(deuda.primerMes)}.</p><button class="boton chico" data-accion="editar-deuda">Editar el préstamo</button></div>` : ''}
    ${inv ? h`<div class="seccion-panel"><h4>Inversión</h4><p>Lo que ponés va positivo; lo que rescatás, negativo.</p><button class="boton chico" data-accion="ir-ahorro">Ver el valor y el rendimiento</button></div>` : ''}
    ${editableConfig ? configuracion(hg, l, sec) : h`<div class="seccion-panel"><p class="apagado chico">${l.auto === 'aguinaldo' ? 'El aguinaldo se calcula con los sueldos marcados "en relación de dependencia": la mitad del mejor sueldo de cada semestre, en junio y diciembre. Si escribís un monto, manda el tuyo.' : 'Cuando cerrás un mes y elegís pasar lo que sobró (o lo que faltó) al mes siguiente, aparece acá.'}</p></div>`}
  </aside>`;
}

function configuracion(hg, l, sec) {
  const cats = hg.categorias.filter((c) => c.seccion === sec);
  const sugerida = claseSugerida(l.nombre, indiceDeLinea(hg, l));
  return h`<div class="seccion-panel" data-config="${l.id}">
    <h4>Configuración del concepto</h4>
    <div class="campo"><label>Nombre</label><input class="entrada" data-campo="nombre" value="${l.nombre}"></div>
    ${cats.length > 1 ? h`<div class="campo"><label>Categoría</label><select class="entrada" data-campo="categoriaId">${opciones(cats.map((c) => [c.id, c.nombre]), l.categoriaId)}</select></div>` : ''}
    ${l.metaId || l.inversionId ? '' : h`<div class="campo"><label>Tipo</label><select class="entrada" data-campo="naturaleza">${opciones([['variable', 'Variable'], ['fijo', 'Fijo (se repite y se da por pagado)']], l.naturaleza)}</select></div>`}
    ${sec === 'gastos' || sec === 'inesperados' ? h`<div class="campo"><label>Clasificación ${l.claseManual ? '' : h`<span class="apagado">(propuesta por el programa)</span>`}</label>
      <select class="entrada" data-campo="clase">${opciones(Object.entries(CLASES).map(([k, v]) => [k, `${v.nombre}${k === sugerida && !l.claseManual ? ' (sugerida)' : ''}`]), l.clase || sugerida)}</select></div>` : ''}
    ${hg.integrantes.length ? h`<div class="campo"><label>${sec === 'ingresos' ? 'Lo cobra' : 'Es de'}</label><select class="entrada" data-campo="personaId">${opciones([['', 'Todo el hogar'], ...hg.integrantes.map((i) => [i.id, i.nombre])], l.personaId || '')}</select></div>` : ''}
    ${l.metaId || l.deudaId || l.inversionId ? '' : h`<div class="campo"><label>Moneda</label><select class="entrada" data-campo="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], l.moneda)}</select></div>`}
    ${sec === 'gastos' || sec === 'inesperados' ? h`<div class="campo"><label>Se actualiza con el IPC de</label><select class="entrada" data-campo="indice">${opciones([['', `Su categoría (${nombreIndice(categoria(hg, l.categoriaId).indice)})`], ...INDICES.map((i) => [i.clave, i.nombre]), ['general', 'Nivel general'], ['ninguno', 'No se actualiza']], l.indice || '')}</select></div>` : ''}
    ${sec === 'ingresos' ? h`<label class="casilla"><input type="checkbox" data-campo="aguinaldo" ${l.aguinaldo ? crudo('checked') : ''}> Sueldo en relación de dependencia (aguinaldo)</label>` : ''}
    <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="boton chico" data-accion="repetir-plan" data-ayuda="Copia lo planeado del mes elegido a todos los meses siguientes del año">Repetir en los meses siguientes</button>
      ${l.metaId || l.deudaId || l.inversionId ? '' : h`<button class="boton chico peligro" data-accion="borrar-linea">${icono('borrar')}Borrar</button>`}
    </div>
  </div>`;
}

// ── Render ──────────────────────────────────────────────────────────────────────
function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const anio = ui().anio;
  res = calcularAnio(ctx, anio);
  const filas = construirFilas(hg);
  filasNav = filas.filter((f) => f.tipo === 'linea').map((f) => f.linea);
  const planes = hg.planes.filter((p) => p.anio === anio);
  const plan = res.plan;
  const modo = ui().modo;
  const mesFoco = anioDe(ui().mesFoco) === anio ? ui().mesFoco : null;
  const sinPlan = !plan;

  montar(raiz, h`<div class="vista-planilla">
    <div class="planilla-herramientas">
      <div class="selector-anio">
        <button class="boton icono chico fantasma" data-accion="anio" data-d="-1" aria-label="Año anterior">${icono('izquierda')}</button>
        <strong>${anio}</strong>
        <button class="boton icono chico fantasma" data-accion="anio" data-d="1" aria-label="Año siguiente">${icono('derecha')}</button>
      </div>
      ${planes.length ? h`<select class="entrada selector-plan" data-accion="elegir-plan" data-ayuda="Presupuesto que se usa como planeado para ${anio}">${opciones(planes.map((p) => [p.id, p.nombre]), plan && plan.id)}</select>` : ''}
      <div class="segmentado" role="tablist">
        <button class="${modo === 'plan' ? 'activo' : ''}" data-modo="plan" data-ayuda="Lo que pensás gastar y cobrar">Planeado</button>
        <button class="${modo === 'real' ? 'activo' : ''}" data-modo="real" data-ayuda="Lo que realmente pasó">Real</button>
        <button class="${modo === 'comparar' ? 'activo' : ''}" data-modo="comparar" data-ayuda="Real arriba y planeado abajo, con avisos">Comparar</button>
      </div>
      <span class="espacio"></span>
      <button class="boton" data-accion="nuevo-mov">${icono('mas')}Cargar gasto</button>
      <button class="boton" data-accion="agregar" data-sec="gastos" data-cat="">${icono('planilla')}Nuevo concepto</button>
      <button class="boton icono ${ui().panel ? 'activo' : ''}" data-accion="panel" data-ayuda="Mostrar u ocultar el panel de detalle">${icono('info')}</button>
    </div>
    ${sinPlan ? h`<div class="franja-plan nota aviso">${icono('info')}Todavía no hay presupuesto para ${anio}. Lo real se puede cargar igual.
      <span style="display:inline-flex;gap:6px;margin-left:8px">
        ${planActivo(hg, anio - 1) ? h`<button class="boton chico primario" data-accion="crear-plan" data-base="ipc">Crear ${anio} desde ${anio - 1} ajustado por IPC</button>
        <button class="boton chico" data-accion="crear-plan" data-base="fijos">Solo los fijos de ${anio - 1}</button>` : ''}
        <button class="boton chico" data-accion="crear-plan" data-base="vacio">Empezar vacío</button></span></div>` : ''}
    ${kpis()}
    <div class="planilla-cuerpo">
      <div style="display:flex;flex-direction:column;min-height:0;min-width:0">
        <div class="planilla-scroll" tabindex="0" data-scroll="grilla" aria-label="Planilla ${anio}">
          <table class="planilla modo-${modo}">
            <thead><tr><th class="col-concepto">Concepto</th>
              ${res.meses.map((m, i) => h`<th class="${m === ctx.mesHoy ? 'actual' : ''} ${m === mesFoco ? 'foco' : ''}" data-mes="${m}" data-i="${i}">${res.cerrado[i] ? icono('candado') : ''}${capitalizar(MES_CORTO[i])}</th>`)}
              <th>Total ${anio}</th></tr></thead>
            <tbody>${filas.map((f) => filaHtml(f, hg))}</tbody>
          </table>
        </div>
        <div class="barra-estado" id="barra-estado"></div>
      </div>
      ${panel(hg)}
    </div>
  </div>`);

  const grilla = raiz.querySelector('.planilla-scroll');
  raiz.addEventListener('click', (e) => clic(e, raiz));
  raiz.addEventListener('dblclick', (e) => { const td = e.target.closest('td.c.editable'); if (td) empezarEdicion(td, null); });
  raiz.addEventListener('contextmenu', (e) => contextual(e));
  raiz.addEventListener('change', (e) => cambioConfig(e));
  raiz.addEventListener('mousedown', (e) => {
    const td = e.target.closest('td.c[data-l]');
    if (!td || e.button !== 0) return;
    if (e.shiftKey && ui().seleccion) { e.preventDefault(); extenderRango(td); }
  });
  grilla.addEventListener('keydown', teclado);
  grilla.addEventListener('copy', copiar);
  grilla.addEventListener('paste', pegar);
  actualizarBarraEstado(raiz);
  if (ui().enfocarGrilla) { ui().enfocarGrilla = false; grilla.focus({ preventScroll: true }); }
  if (ui().editarAlVolver) { const x = ui().editarAlVolver; ui().editarAlVolver = null; const td = celda(x.lineaId, x.i); if (td) empezarEdicion(td, x.texto); }
}

function celda(lineaId, i) {
  return document.querySelector(`.planilla td.c[data-l="${CSS.escape(lineaId)}"][data-i="${i}"]`);
}

// ── Selección y teclado ─────────────────────────────────────────────────────────
function seleccionar(lineaId, i, { rango = false, enfocar = true } = {}) {
  const f = filasNav.findIndex((l) => l.id === lineaId);
  if (f < 0) return;
  const anterior = ui().seleccion;
  ui().seleccion = { lineaId, i };
  ui().mesFoco = res.meses[i];
  ui().rango = rango && ui().rango ? { a: ui().rango.a, b: { f, i } } : (rango && anterior ? { a: { f: filasNav.findIndex((l) => l.id === anterior.lineaId), i: anterior.i }, b: { f, i } } : null);
  ui().enfocarGrilla = enfocar;
  redibujar();
}

function extenderRango(td) {
  seleccionar(td.dataset.l, Number(td.dataset.i), { rango: true });
}

// Vuelve a dibujar la vista entera (conserva el desplazamiento).
function redibujar() { notificar('planilla'); }

function mover(df, di, rango = false) {
  const s = ui().seleccion;
  if (!s) { if (filasNav.length) seleccionar(filasNav[0].id, 0); return; }
  const base = rango && ui().rango ? ui().rango.b : { f: filasNav.findIndex((l) => l.id === s.lineaId), i: s.i };
  const f = Math.max(0, Math.min(filasNav.length - 1, base.f + df));
  const i = Math.max(0, Math.min(11, base.i + di));
  if (rango) {
    const a = ui().rango ? ui().rango.a : { f: filasNav.findIndex((l) => l.id === s.lineaId), i: s.i };
    ui().rango = { a, b: { f, i } };
    ui().enfocarGrilla = true;
    redibujar();
    return;
  }
  seleccionar(filasNav[f].id, i);
  const td = celda(filasNav[f].id, i);
  if (td) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function teclado(e) {
  if (editor) return;
  const s = ui().seleccion;
  const k = e.key;
  if (k === 'ArrowDown') { e.preventDefault(); mover(1, 0, e.shiftKey); }
  else if (k === 'ArrowUp') { e.preventDefault(); mover(-1, 0, e.shiftKey); }
  else if (k === 'ArrowRight') { e.preventDefault(); mover(0, 1, e.shiftKey); }
  else if (k === 'ArrowLeft') { e.preventDefault(); mover(0, -1, e.shiftKey); }
  else if (k === 'Tab') { e.preventDefault(); mover(0, e.shiftKey ? -1 : 1); }
  else if (k === 'Home') { e.preventDefault(); if (s) seleccionar(s.lineaId, 0); }
  else if (k === 'End') { e.preventDefault(); if (s) seleccionar(s.lineaId, 11); }
  else if ((k === 'Enter' || k === 'F2') && s) { e.preventDefault(); const td = celda(s.lineaId, s.i); if (td && td.classList.contains('editable')) empezarEdicion(td, null); }
  else if ((k === 'Delete' || k === 'Backspace') && s) { e.preventDefault(); borrarSeleccion(); }
  else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'r' && s) { e.preventDefault(); repetirPlan(s.lineaId, s.i); }
  else if (s && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /[\d.,\-$]/.test(k)) {
    const td = celda(s.lineaId, s.i);
    if (td && td.classList.contains('editable')) { e.preventDefault(); empezarEdicion(td, k); }
  }
}

// ── Edición ─────────────────────────────────────────────────────────────────────
function valorCrudo(lineaId, i) {
  const f = res.lineas.get(lineaId);
  const v = ui().modo === 'plan' ? f.plan[i] : f.real[i];
  return v === null || v === undefined ? '' : valorMonto(v);
}

function empezarEdicion(td, inicial) {
  if (ui().modo === 'comparar') { avisar('Para escribir, pasá a "Planeado" o "Real".'); return; }
  terminarEdicion(false);
  const cont = td.closest('.planilla-scroll');
  const input = document.createElement('input');
  input.className = 'editor-celda';
  input.value = inicial !== null ? inicial : valorCrudo(td.dataset.l, Number(td.dataset.i));
  input.style.left = `${td.offsetLeft}px`;
  input.style.top = `${td.offsetTop}px`;
  input.style.width = `${td.offsetWidth}px`;
  input.style.height = `${td.offsetHeight}px`;
  cont.appendChild(input);
  editor = { input, lineaId: td.dataset.l, i: Number(td.dataset.i) };
  input.focus();
  if (inicial === null) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); terminarEdicion(true, e.shiftKey ? [-1, 0] : [1, 0]); }
    else if (e.key === 'Tab') { e.preventDefault(); terminarEdicion(true, [0, e.shiftKey ? -1 : 1]); }
    else if (e.key === 'Escape') { e.preventDefault(); terminarEdicion(false); }
  });
  input.addEventListener('blur', () => { if (editor && editor.input === input) terminarEdicion(true); });
}

async function terminarEdicion(guardar, mov = null) {
  if (!editor) return;
  const { input, lineaId, i } = editor;
  editor = null;
  const texto = input.value.trim();
  input.remove();
  if (!guardar) { ui().enfocarGrilla = true; redibujar(); return; }
  const v = texto === '' ? null : leerMonto(texto);
  if (texto !== '' && v === null) { avisar(`No entendí "${texto}" como monto.`, { tipo: 'error' }); ui().enfocarGrilla = true; redibujar(); return; }
  const ok = await escribir(lineaId, i, v);
  if (mov && ok !== false) {
    const f = filasNav.findIndex((l) => l.id === lineaId);
    const nf = Math.max(0, Math.min(filasNav.length - 1, f + mov[0]));
    const ni = Math.max(0, Math.min(11, i + mov[1]));
    ui().seleccion = { lineaId: filasNav[nf] ? filasNav[nf].id : lineaId, i: ni };
    ui().mesFoco = res.meses[ni];
  }
  ui().enfocarGrilla = true;
  redibujar();
}

async function escribir(lineaId, i, v) {
  const hg = estado.hogar;
  const l = buscarLinea(hg, lineaId);
  if (!l) return false;
  const mes = res.meses[i];
  if (ui().modo === 'plan') {
    const actual = res.lineas.get(lineaId).plan[i];
    if (actual === v) return true;
    mutar((hogar) => {
      const anio = ui().anio;
      const plan = planActivo(hogar, anio) || nuevoPlan(hogar, anio);
      if (l.naturaleza === 'fijo' && v !== null && !l.auto) fijarPlanFijo(plan, lineaId, mes, v);
      else fijarPlan(plan, lineaId, mes, v);
    });
    return true;
  }
  const f = res.lineas.get(lineaId);
  const it = f.items[i];
  if (v !== null && (it.movimientos || it.cuotas) && f.origenReal[i] !== 'manual') {
    const ok = await confirmar('Reemplazar la suma de gastos', `Este mes tiene ${it.movimientos + it.cuotas} gastos sueltos o cuotas que suman ${montoTexto(f.real[i], l.moneda)}. Si escribís un total, se usa ese total y los gastos sueltos quedan guardados pero no se suman.`, { si: 'Usar el total escrito' });
    if (!ok) return false;
  }
  mutar((hogar) => fijarReal(hogar, lineaId, mes, v));
  return true;
}

function celdasDelRango() {
  const r = ui().rango;
  const s = ui().seleccion;
  if (!r) return s ? [[s.lineaId, s.i]] : [];
  const out = [];
  for (let f = Math.min(r.a.f, r.b.f); f <= Math.max(r.a.f, r.b.f); f++) {
    for (let i = Math.min(r.a.i, r.b.i); i <= Math.max(r.a.i, r.b.i); i++) if (filasNav[f]) out.push([filasNav[f].id, i]);
  }
  return out;
}

function borrarSeleccion() {
  if (ui().modo === 'comparar') return;
  const celdas = celdasDelRango().filter(([lid]) => !buscarLinea(estado.hogar, lid).auto || ui().modo === 'plan');
  if (!celdas.length) return;
  mutar((hogar) => {
    const plan = planActivo(hogar, ui().anio);
    for (const [lid, i] of celdas) {
      const mes = res.meses[i];
      if (ui().modo === 'plan') { if (plan) fijarPlan(plan, lid, mes, null); }
      else fijarReal(hogar, lid, mes, null);
    }
  });
}

function repetirPlan(lineaId, i) {
  const f = res.lineas.get(lineaId);
  const v = f.plan[i];
  if (v === null) { avisar('Ese mes no tiene nada planeado para repetir.'); return; }
  mutar((hogar) => {
    const plan = planActivo(hogar, ui().anio) || nuevoPlan(hogar, ui().anio);
    for (let k = i + 1; k < 12; k++) fijarPlan(plan, lineaId, res.meses[k], v);
  });
  avisar(`Se repitió ${montoTexto(v)} hasta diciembre.`, { tipo: 'ok' });
}

function copiar(e) {
  if (editor) return;
  const r = ui().rango;
  const s = ui().seleccion;
  if (!s) return;
  const modo = ui().modo === 'plan' ? 'plan' : 'real';
  const filas = [];
  const f1 = r ? Math.min(r.a.f, r.b.f) : filasNav.findIndex((l) => l.id === s.lineaId);
  const f2 = r ? Math.max(r.a.f, r.b.f) : f1;
  const i1 = r ? Math.min(r.a.i, r.b.i) : s.i, i2 = r ? Math.max(r.a.i, r.b.i) : s.i;
  for (let f = f1; f <= f2; f++) {
    const fila = res.lineas.get(filasNav[f].id);
    const vals = [];
    for (let i = i1; i <= i2; i++) { const v = fila[modo][i]; vals.push(v === null ? '' : formatear(v, { decimales: 'auto' }).replace(/\./g, '')); }
    filas.push(vals.join('\t'));
  }
  e.clipboardData.setData('text/plain', filas.join('\r\n'));
  e.preventDefault();
  avisar('Copiado.', { duracion: 1200 });
}

function pegar(e) {
  if (editor || ui().modo === 'comparar') return;
  const s = ui().seleccion;
  if (!s) return;
  const texto = e.clipboardData.getData('text/plain');
  if (!texto) return;
  e.preventDefault();
  const filas = texto.replace(/\r/g, '').split('\n').filter((x, k, a) => x !== '' || k < a.length - 1).map((f) => f.split('\t'));
  const f0 = filasNav.findIndex((l) => l.id === s.lineaId);
  let malos = 0, puestos = 0;
  mutar((hogar) => {
    const plan = ui().modo === 'plan' ? (planActivo(hogar, ui().anio) || nuevoPlan(hogar, ui().anio)) : null;
    filas.forEach((vals, df) => {
      const l = filasNav[f0 + df];
      if (!l || l.auto === 'saldo') return;
      vals.forEach((t, di) => {
        const i = s.i + di;
        if (i > 11) return;
        const v = t.trim() === '' ? null : leerMonto(t);
        if (t.trim() !== '' && v === null) { malos++; return; }
        if (plan) fijarPlan(plan, l.id, res.meses[i], v); else fijarReal(hogar, l.id, res.meses[i], v);
        puestos++;
      });
    });
  });
  avisar(`Se pegaron ${puestos} celdas${malos ? ` (${malos} no se entendieron como montos)` : ''}.`, { tipo: malos ? 'error' : 'ok' });
}

function actualizarBarraEstado(raiz) {
  const barra = raiz.querySelector('#barra-estado');
  const celdas = celdasDelRango();
  let suma = 0, n = 0;
  const modo = ui().modo === 'plan' ? 'planPesos' : 'realPesos';
  for (const [lid, i] of celdas) { const f = res.lineas.get(lid); if (f && f[modo][i]) { suma += f[modo][i]; n++; } }
  montar(barra, h`
    ${celdas.length > 1 ? h`<span>Suma: <strong>${pesos(suma)}</strong></span><span>Promedio: <strong>${pesos(n ? Math.round(suma / n) : 0)}</strong></span><span>${celdas.length} celdas</span>` : h`<span class="apagado">Enter para escribir · Supr borra · Ctrl+R repite hasta diciembre · Shift+flechas elige varias</span>`}
    <span class="espacio"></span>
    <span class="leyenda-origen"><span><i></i>gastos sueltos</span><span><i class="cuota"></i>cuotas</span><span><em>cursiva</em>: fijo supuesto</span></span>`);
}

// ── Clics ───────────────────────────────────────────────────────────────────────
async function clic(e, raiz) {
  const td = e.target.closest('td.c[data-l]');
  if (td && !e.shiftKey) { seleccionar(td.dataset.l, Number(td.dataset.i)); return; }
  const th = e.target.closest('th[data-mes]');
  if (th) {
    ui().mesFoco = th.dataset.mes;
    if (ui().seleccion) ui().seleccion = { ...ui().seleccion, i: Number(th.dataset.i) };
    redibujar();
    return;
  }
  const modo = e.target.closest('[data-modo]');
  if (modo) {
    ui().modo = modo.dataset.modo;
    estado.hogar.preferencias.modo = ui().modo;
    redibujar();
    return;
  }
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const hg = estado.hogar;
  const s = ui().seleccion;
  const l = s && buscarLinea(hg, s.lineaId);
  switch (b.dataset.accion) {
    case 'anio': ui().anio += Number(b.dataset.d); ui().mesFoco = ui().anio === anioDe(mesActual()) ? mesActual() : `${ui().anio}-01`; ui().seleccion = null; ui().rango = null; redibujar(); break;
    case 'panel': ui().panel = !ui().panel; redibujar(); break;
    case 'cerrar-panel': ui().panel = false; redibujar(); break;
    case 'plegar': mutar((hogar) => { const c = categoria(hogar, b.dataset.cat); c.plegada = !c.plegada; }, { historial: false }); break;
    case 'agregar': {
      const nueva = await dialogoLinea({ seccion: b.dataset.sec, categoriaId: b.dataset.cat || null, mes: ui().mesFoco });
      if (nueva && nueva.lineaId) ui().seleccion = { lineaId: nueva.lineaId, i: res.meses.indexOf(ui().mesFoco) >= 0 ? res.meses.indexOf(ui().mesFoco) : 0 };
      else if (nueva && nueva.id) ui().seleccion = { lineaId: nueva.id, i: Math.max(0, res.meses.indexOf(ui().mesFoco)) };
      redibujar();
      break;
    }
    case 'nuevo-mov': await dialogoMovimiento({ lineaId: l && !l.auto ? l.id : null, fecha: null }); break;
    case 'editar-mov': await dialogoMovimiento({ mov: hg.movimientos.find((m) => m.id === b.dataset.mov) }); break;
    case 'nueva-cuota': if (l) await dialogoCompraCuotas({ lineaId: l.id }); break;
    case 'editar-cuotas': await dialogoCompraCuotas({ compra: hg.cuotas.find((c) => c.id === b.dataset.c) }); break;
    case 'confirmar-supuesto': if (l) mutar((hogar) => fijarReal(hogar, l.id, res.meses[s.i], res.lineas.get(l.id).real[s.i])); break;
    case 'editar-real': if (l) { ui().modo = 'real'; ui().editarAlVolver = { lineaId: l.id, i: s.i, texto: null }; redibujar(); } break;
    case 'usar-suma': if (l) mutar((hogar) => fijarReal(hogar, l.id, res.meses[s.i], null)); break;
    case 'repetir-plan': if (l) repetirPlan(l.id, s.i); break;
    case 'borrar-linea': if (l) borrarConfirmando(l); break;
    case 'menu-linea': { const r = b.getBoundingClientRect(); menuLinea(buscarLinea(hg, b.dataset.l), r.left, r.bottom + 2); break; }
    case 'editar-deuda': if (l) dialogoDeuda({ deuda: hg.deudas.find((d) => d.id === l.deudaId) }); break;
    case 'ir-ahorro': irA('ahorro'); break;
    case 'cerrar-mes': abrirCierre(b.dataset.mes); break;
    case 'reabrir-mes': {
      if (await confirmar('Reabrir el mes', `Los fijos de ${nombreMes(b.dataset.mes)} vuelven a darse por pagados y se deshace lo que se hizo con el sobrante.`, { si: 'Reabrir' })) {
        const { reabrirMes } = await import('../lib/cierre.js');
        mutar((hogar) => reabrirMes(hogar, b.dataset.mes));
      }
      break;
    }
    case 'crear-plan': {
      const base = b.dataset.base;
      const anio = ui().anio;
      mutar((hogar) => {
        const previo = planActivo(hogar, anio - 1);
        const nuevo = crearPlanAnio(estado.ctx, anio, { base, desdePlan: previo });
        hogar.planes.push(nuevo);
        hogar.planActivo[anio] = nuevo.id;
      });
      avisar(base === 'ipc' ? `Presupuesto ${anio} creado con los montos de ${anio - 1} ajustados por la inflación de cada categoría.` : `Presupuesto ${anio} creado.`, { tipo: 'ok', duracion: 6000 });
      break;
    }
    default: break;
  }
}

async function borrarConfirmando(l) {
  const n = estado.hogar.movimientos.filter((m) => m.lineaId === l.id).length;
  const ok = await confirmar('Borrar concepto', `Se borra "${l.nombre}" con todo lo planeado y lo real${n ? `, incluidos ${n} gastos sueltos` : ''}. Se puede deshacer con Ctrl+Z.`, { si: 'Borrar', peligro: true });
  if (!ok) return;
  ui().seleccion = null;
  mutar((hogar) => { borrarLinea(hogar, l.id); asegurarAguinaldo(hogar); });
}

function menuLinea(l, x, y) {
  if (!l) return;
  const s = ui().seleccion;
  const i = s && s.lineaId === l.id ? s.i : Math.max(0, res.meses.indexOf(ui().mesFoco));
  const opcionesMenu = [
    { texto: 'Cargar un gasto', icono: 'mas', fn: () => dialogoMovimiento({ lineaId: l.id }) },
    { texto: 'Nueva compra en cuotas', icono: 'tarjeta', fn: () => dialogoCompraCuotas({ lineaId: l.id }) },
    { texto: 'Repetir lo planeado de este mes hasta diciembre', icono: 'derecha', fn: () => repetirPlan(l.id, i) },
    { texto: 'Cambiar el nombre', icono: 'editar', fn: async () => { const n = await pedirTexto('Cambiar el nombre', { etiqueta: 'Nombre', valor: l.nombre }); if (n && n.trim()) mutar((hogar) => { buscarLinea(hogar, l.id).nombre = n.trim(); }); } },
    '-',
    { texto: 'Subir', icono: 'izquierda', fn: () => moverLinea(l, -1) },
    { texto: 'Bajar', icono: 'derecha', fn: () => moverLinea(l, 1) }
  ];
  if (l.metaId) opcionesMenu.push('-', { texto: 'Editar la meta', icono: 'ahorro', fn: () => dialogoMeta({ meta: estado.hogar.metas.find((m) => m.id === l.metaId) }) });
  if (l.deudaId) opcionesMenu.push('-', { texto: 'Editar el préstamo', icono: 'editar', fn: () => dialogoDeuda({ deuda: estado.hogar.deudas.find((d) => d.id === l.deudaId) }) });
  if (l.inversionId) opcionesMenu.push('-', { texto: 'Editar la inversión', icono: 'editar', fn: () => dialogoInversion({ inversion: estado.hogar.inversiones.find((d) => d.id === l.inversionId) }) });
  if (!l.auto && !l.metaId && !l.deudaId && !l.inversionId) opcionesMenu.push('-', { texto: 'Borrar concepto', icono: 'borrar', peligro: true, fn: () => borrarConfirmando(l) });
  menu(x, y, opcionesMenu);
}

function moverLinea(l, d) {
  mutar((hogar) => {
    const hermanas = hogar.lineas.filter((x) => x.categoriaId === l.categoriaId).sort((a, b) => a.orden - b.orden);
    hermanas.forEach((x, k) => { x.orden = k; });
    const k = hermanas.findIndex((x) => x.id === l.id);
    const otro = hermanas[k + d];
    if (!otro) return;
    [hermanas[k].orden, otro.orden] = [otro.orden, hermanas[k].orden];
  });
}

function contextual(e) {
  const fila = e.target.closest('tr.f-linea');
  if (fila) { e.preventDefault(); const td = e.target.closest('td.c[data-l]'); if (td) seleccionar(td.dataset.l, Number(td.dataset.i), { enfocar: false }); menuLinea(buscarLinea(estado.hogar, fila.dataset.linea), e.clientX, e.clientY); return; }
  const th = e.target.closest('th[data-mes]');
  if (th) {
    e.preventDefault();
    const mes = th.dataset.mes;
    const cerrado = !!estado.hogar.cierres[mes];
    const ops = [{ texto: `Ver los movimientos de ${nombreMes(mes)}`, icono: 'movimientos', fn: () => irA('movimientos', { mes }) }];
    if (mes < estado.ctx.mesHoy && !cerrado) ops.push({ texto: `Cerrar ${nombreMes(mes)}…`, icono: 'candado', fn: () => abrirCierre(mes) });
    menu(e.clientX, e.clientY, ops);
  }
}

function cambioConfig(e) {
  const campo = e.target.closest('[data-campo]');
  if (campo) {
    const cont = campo.closest('[data-config]');
    const id = cont.dataset.config;
    const nombre = campo.dataset.campo;
    const valor = campo.type === 'checkbox' ? campo.checked : campo.value;
    if (nombre === 'nombre' && !String(valor).trim()) return;
    mutar((hogar) => {
      const l = buscarLinea(hogar, id);
      if (!l) return;
      if (nombre === 'clase') { l.clase = valor; l.claseManual = true; }
      else if (nombre === 'personaId') l.personaId = valor || null;
      else if (nombre === 'indice') l.indice = valor || null;
      else if (nombre === 'nombre') {
        l.nombre = String(valor).trim();
        if (!l.claseManual) l.clase = claseSugerida(l.nombre, indiceDeLinea(hogar, l));
        const m = l.metaId && hogar.metas.find((x) => x.id === l.metaId); if (m) m.nombre = l.nombre;
        const d = l.deudaId && hogar.deudas.find((x) => x.id === l.deudaId); if (d) d.nombre = l.nombre;
        const i = l.inversionId && hogar.inversiones.find((x) => x.id === l.inversionId); if (i) i.nombre = l.nombre;
      } else l[nombre] = valor;
      if (nombre === 'aguinaldo') asegurarAguinaldo(hogar);
    });
    return;
  }
  const sel = e.target.closest('[data-accion="elegir-plan"]');
  if (sel) mutar((hogar) => { hogar.planActivo[ui().anio] = sel.value; });
}

export default { titulo: 'Planilla', icono: 'planilla', sinScroll: true, render };
