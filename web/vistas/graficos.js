// Mi Presupuesto · gráficos: Sankey, torta, evolución, planeado contra real e inflación

import { estado, notificar } from '../estado.js';
import { h, montar, icono, opciones, pesosRedondos } from '../ui.js';
import { datosSankey } from '../lib/sankey.js';
import { evolucionAnual, gastoPorCategoria, planContraReal, contraInflacion } from '../lib/series.js';
import { categoria } from '../lib/modelo.js';
import { nombreMes, capitalizar, sumarMeses, mesesDelAnio, rangoMeses, anioDe, mesActual } from '../lib/fechas.js';
import { porcentaje } from '../lib/dinero.js';
import { familiaDeCategoria, FAMILIAS, colorFamilia, colorCategoria } from '../graficos/colores.js';
import * as G from '../graficos/graficos.js';

const PESTANIAS = [['sankey', 'Sankey'], ['torta', 'Torta por categoría'], ['evolucion', 'Evolución mes a mes'], ['planreal', 'Planeado contra real'], ['inflacion', 'Contra la inflación']];

function ui() {
  if (!estado.ui.graficos) {
    const ult = sumarMeses(mesActual(), -1);
    estado.ui.graficos = { pestania: 'sankey', tipo: 'mes', mes: ult, anio: anioDe(mesActual()), desde: sumarMeses(ult, -2), hasta: ult, fuente: 'real', plegadas: new Set(), tabla: false };
  }
  return estado.ui.graficos;
}

function mesesDelPeriodo(u) {
  if (u.tipo === 'anio') return mesesDelAnio(u.anio);
  if (u.tipo === 'rango') return u.desde <= u.hasta ? rangoMeses(u.desde, u.hasta) : rangoMeses(u.hasta, u.desde);
  return [u.mes];
}

function textoPeriodo(u) {
  if (u.tipo === 'anio') return `${u.anio}`;
  if (u.tipo === 'rango') return `${nombreMes(u.desde)} a ${nombreMes(u.hasta)}`;
  return nombreMes(u.mes);
}

function render(raiz) {
  const ctx = estado.ctx;
  const u = ui();
  const meses = Array.from({ length: 36 }, (_, i) => sumarMeses(ctx.mesHoy, 12 - i)).reverse();
  const anios = [...new Set([...meses.map(anioDe), ...estado.hogar.planes.map((p) => p.anio)])].sort();
  const usaPeriodo = u.pestania !== 'evolucion' && u.pestania !== 'inflacion';
  montar(raiz, h`<div class="pagina ancha">
    <div class="encabezado-pagina"><div><h1>Gráficos</h1><div class="subtitulo">${usaPeriodo ? `${capitalizar(textoPeriodo(u))} · ${u.fuente === 'real' ? 'lo real' : 'lo planeado'}` : u.pestania === 'evolucion' ? `Año ${u.tipo === 'anio' ? u.anio : anioDe(u.tipo === 'rango' ? u.hasta : u.mes)}` : 'Últimos meses con datos reales'}</div></div></div>
    <div class="filtros">
      <div class="segmentado">${[['mes', 'Mes'], ['anio', 'Año'], ['rango', 'Rango']].map(([k, t]) => h`<button class="${u.tipo === k ? 'activo' : ''}" data-tipo="${k}">${t}</button>`)}</div>
      ${u.tipo === 'mes' ? h`<select class="entrada" data-u="mes">${opciones(meses.map((m) => [m, capitalizar(nombreMes(m))]), u.mes)}</select>` : ''}
      ${u.tipo === 'anio' ? h`<select class="entrada" data-u="anio">${opciones(anios.map((a) => [a, String(a)]), u.anio)}</select>` : ''}
      ${u.tipo === 'rango' ? h`<select class="entrada" data-u="desde">${opciones(meses.map((m) => [m, capitalizar(nombreMes(m))]), u.desde)}</select><span style="align-self:center">a</span><select class="entrada" data-u="hasta">${opciones(meses.map((m) => [m, capitalizar(nombreMes(m))]), u.hasta)}</select>` : ''}
      <div class="segmentado">${[['real', 'Real'], ['plan', 'Planeado']].map(([k, t]) => h`<button class="${u.fuente === k ? 'activo' : ''}" data-fuente="${k}">${t}</button>`)}</div>
      <span class="espacio" style="flex:1"></span>
      <button class="boton ${u.tabla ? 'activo' : ''}" data-accion="tabla">${icono('planilla')}${u.tabla ? 'Ocultar tabla' : 'Ver tabla'}</button>
    </div>
    <div class="pestanias">${PESTANIAS.map(([k, t]) => h`<button class="${u.pestania === k ? 'activa' : ''}" data-pestania="${k}">${t}</button>`)}</div>
    <div class="tarjeta">
      <div id="explicacion" class="chico apagado" style="margin-bottom:8px"></div>
      <div id="leyenda"></div>
      <div class="lienzo" id="lienzo"></div>
      <div id="tabla" style="margin-top:14px"></div>
    </div>
  </div>`);

  raiz.addEventListener('click', (e) => clic(e));
  raiz.addEventListener('change', (e) => {
    const el = e.target.closest('[data-u]');
    if (!el) return;
    u[el.dataset.u] = el.dataset.u === 'anio' ? Number(el.value) : el.value;
    notificar('vista');
  });
  // El lienzo necesita su ancho real: se dibuja después de montar.
  requestAnimationFrame(() => dibujar(raiz));
}

function dibujar(raiz) {
  const ctx = estado.ctx;
  const u = ui();
  const lienzo = raiz.querySelector('#lienzo');
  const tabla = raiz.querySelector('#tabla');
  const leyenda = raiz.querySelector('#leyenda');
  const explicacion = raiz.querySelector('#explicacion');
  if (!lienzo) return;
  const meses = mesesDelPeriodo(u);
  const hg = estado.hogar;
  const n = meses.length;

  if (u.pestania === 'sankey') {
    const datos = datosSankey(ctx, { meses, fuente: u.fuente, plegadas: u.plegadas });
    explicacion.textContent = `De dónde entra la plata y a dónde va${n > 1 ? `, sumando ${n} meses` : ''}. El ancho de cada banda es el monto. Tocá una categoría para abrirla o cerrarla.${datos.resultado < 0 ? ' Lo que falta aparece como "Faltante" del lado de los ingresos.' : ''}`;
    montar(leyenda, '');
    G.sankey(lienzo, datos, {
      colorDe: (nodo) => {
        if (nodo.nivel >= 2 && nodo.id.startsWith('cat:cat_')) return colorCategoria(categoria(hg, nodo.id.slice(4)));
        if (nodo.nivel === 3 && nodo.categoriaId && nodo.categoriaId.startsWith('cat:cat_')) return colorCategoria(categoria(hg, nodo.categoriaId.slice(4)));
        return null;
      },
      alClic: (nodo) => { if (u.plegadas.has(nodo.id)) u.plegadas.delete(nodo.id); else u.plegadas.add(nodo.id); dibujar(raiz); }
    });
    const cats = datos.nodos.filter((x) => x.nivel === 2);
    const fuentes = datos.nodos.filter((x) => x.nivel === 0);
    montar(tabla, u.tabla ? h`<div class="dos-columnas"><table class="tabla"><thead><tr><th>Entra</th><th class="der">Monto</th><th class="der">%</th></tr></thead>
      <tbody>${fuentes.map((x) => h`<tr><td>${x.nombre}</td><td class="der">${pesosRedondos(x.valor)}</td><td class="der">${porcentaje(x.valor / datos.total, 1)}</td></tr>`)}</tbody></table>
      <table class="tabla"><thead><tr><th>Sale</th><th class="der">Monto</th><th class="der">%</th></tr></thead>
      <tbody>${cats.map((x) => h`<tr><td>${x.nombre}</td><td class="der">${pesosRedondos(x.valor)}</td><td class="der">${porcentaje(x.valor / datos.total, 1)}</td></tr>`)}</tbody></table></div>` : '');
  } else if (u.pestania === 'torta') {
    const porCat = gastoPorCategoria(ctx, meses, u.fuente);
    const total = porCat.reduce((s, x) => s + x.monto, 0);
    const porFam = new Map();
    for (const x of porCat) {
      const f = familiaDeCategoria(x.categoria);
      if (!porFam.has(f)) porFam.set(f, { familia: f, monto: 0, detalle: [] });
      const e = porFam.get(f); e.monto += x.monto; e.detalle.push(x.categoria.nombre);
    }
    // Hasta 5 grupos con color propio; el resto va a "Otros" (siempre gris).
    const orden = [...porFam.values()].filter((x) => x.familia !== 'otros').sort((a, b) => b.monto - a.monto);
    const visibles = orden.slice(0, 5);
    const otros = { familia: 'otros', monto: 0, detalle: [] };
    for (const x of [...orden.slice(5), ...(porFam.has('otros') ? [porFam.get('otros')] : [])]) { otros.monto += x.monto; otros.detalle.push(...x.detalle); }
    const partes = [...visibles, ...(otros.monto > 0 ? [otros] : [])].map((p) => ({ ...p, nombre: p.familia === 'deudas' ? 'Imprevistos' : p.familia === 'otros' ? 'Otros' : FAMILIAS[p.familia].nombre }));
    explicacion.textContent = `Cómo se reparte el gasto${n > 1 ? ` de ${n} meses` : ''} (gastos e imprevistos). Las categorías parecidas comparten color; el detalle de las 12 categorías del IPC está en la tabla.`;
    montar(leyenda, '');
    G.torta(lienzo, partes, total);
    montar(tabla, h`<table class="tabla"><thead><tr><th>Categoría</th><th>Grupo</th><th class="der">Monto${n > 1 ? ' del período' : ''}</th>${n > 1 ? h`<th class="der">Por mes</th>` : ''}<th class="der">%</th></tr></thead>
      <tbody>${porCat.map((x) => { const f = familiaDeCategoria(x.categoria); return h`<tr><td><span class="punto-color" style="background:${colorFamilia(f)}"></span> ${x.categoria.nombre}</td><td class="apagado">${f === 'deudas' ? 'Imprevistos' : FAMILIAS[f].nombre}</td><td class="der">${pesosRedondos(x.monto)}</td>${n > 1 ? h`<td class="der">${pesosRedondos(x.monto / n)}</td>` : ''}<td class="der">${porcentaje(x.monto / total, 1)}</td></tr>`; })}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="der">${pesosRedondos(total)}</td>${n > 1 ? h`<td class="der">${pesosRedondos(total / n)}</td>` : ''}<td></td></tr></tfoot></table>`);
  } else if (u.pestania === 'evolucion') {
    const anio = u.tipo === 'anio' ? u.anio : anioDe(u.tipo === 'rango' ? u.hasta : u.mes);
    const puntos = evolucionAnual(ctx, anio, u.fuente);
    explicacion.textContent = `Ingresos, gastos (con imprevistos y cuotas) y ahorro de ${anio}, ${u.fuente === 'real' ? 'reales' : 'planeados'}. Abajo, lo que sobró o faltó cada mes.`;
    montar(leyenda, h`<div class="leyenda"><span><i class="linea" style="background:var(--serie-1)"></i>Ingresos</span><span><i class="linea" style="background:var(--serie-2)"></i>Gastos y cuotas</span><span><i class="linea" style="background:var(--serie-3)"></i>Ahorro e inversiones</span><span><i style="background:var(--serie-1)"></i>Sobrante</span><span><i style="background:var(--serie-8)"></i>Faltante</span></div>`);
    G.evolucion(lienzo, puntos, { real: u.fuente === 'real' });
    montar(tabla, u.tabla ? h`<table class="tabla"><thead><tr><th>Mes</th><th class="der">Ingresos</th><th class="der">Gastos y cuotas</th><th class="der">Ahorro e inversiones</th><th class="der">Resultado</th></tr></thead>
      <tbody>${puntos.filter((p) => !(u.fuente === 'real' && p.futuro)).map((p) => h`<tr><td>${capitalizar(nombreMes(p.mes))}</td><td class="der">${pesosRedondos(p.ingresos)}</td><td class="der">${pesosRedondos(p.gastos)}</td><td class="der">${pesosRedondos(p.ahorro)}</td><td class="der">${pesosRedondos(p.resultado)}</td></tr>`)}</tbody></table>` : '');
  } else if (u.pestania === 'planreal') {
    const filas = planContraReal(ctx, meses).map((x) => ({ nombre: x.categoria.nombre, familia: familiaDeCategoria(x.categoria), plan: x.plan, real: x.real }));
    explicacion.textContent = `Lo real de cada categoría (barra) contra lo planeado (marca)${n > 1 ? `, sumando ${n} meses` : ''}. ▲ indica cuánto se pasó.`;
    montar(leyenda, h`<div class="leyenda"><span><i style="background:var(--serie-1)"></i>Real</span><span><i class="linea" style="background:var(--tinta);width:2px;height:12px"></i>Planeado</span></div>`);
    G.planVsReal(lienzo, filas);
    montar(tabla, u.tabla ? h`<table class="tabla"><thead><tr><th>Categoría</th><th class="der">Planeado</th><th class="der">Real</th><th class="der">Diferencia</th></tr></thead>
      <tbody>${filas.map((f) => h`<tr><td>${f.nombre}</td><td class="der">${pesosRedondos(f.plan)}</td><td class="der">${pesosRedondos(f.real)}</td><td class="der" style="color:${f.real > f.plan && f.plan ? 'var(--critico-texto)' : 'inherit'}">${pesosRedondos(f.real - f.plan)}</td></tr>`)}</tbody></table>` : '');
  } else if (u.pestania === 'inflacion') {
    const hasta = u.tipo === 'mes' ? u.mes : u.tipo === 'anio' ? `${u.anio}-12` : u.hasta;
    const desde = u.tipo === 'rango' ? u.desde : sumarMeses(hasta, -11);
    const r = contraInflacion(ctx, desde, hasta);
    explicacion.textContent = r.puntos.length >= 2
      ? `Desde ${nombreMes(r.meses[0])} los precios subieron ${porcentaje(r.ipcAcumulado, 1)}, tus ingresos ${porcentaje(r.ingresoAcumulado, 1)} y tus gastos ${porcentaje(r.gastoAcumulado, 1)}. ${r.ingresoContraIpc >= 0 ? `Tu ingreso le ganó a la inflación por ${porcentaje(r.ingresoContraIpc, 1)}.` : `Tu ingreso perdió ${porcentaje(-r.ingresoContraIpc, 1)} contra la inflación.`} Todo en base 100 en el primer mes.`
      : 'Hacen falta al menos dos meses con datos reales para comparar con la inflación.';
    montar(leyenda, h`<div class="leyenda"><span><i class="linea" style="background:var(--apagada)"></i>Precios (IPC de tu región)</span><span><i class="linea" style="background:var(--serie-1)"></i>Tus ingresos</span><span><i class="linea" style="background:var(--serie-2)"></i>Tus gastos</span></div>`);
    G.inflacion(lienzo, r.puntos);
    montar(tabla, u.tabla && r.puntos.length ? h`<table class="tabla"><thead><tr><th>Mes</th><th class="der">IPC (base 100)</th><th class="der">Ingresos</th><th class="der">Ingreso en pesos de ${nombreMes(r.meses[r.meses.length - 1], { conAnio: false })}</th><th class="der">Gastos</th></tr></thead>
      <tbody>${r.puntos.map((p) => h`<tr><td>${capitalizar(nombreMes(p.mes))}</td><td class="der">${p.ipc.toFixed(1).replace('.', ',')}</td><td class="der">${pesosRedondos(p.ingreso)}</td><td class="der">${pesosRedondos(p.ingresoReal)}</td><td class="der">${pesosRedondos(p.gasto)}</td></tr>`)}</tbody></table>` : '');
  }
}

function clic(e) {
  const u = ui();
  const p = e.target.closest('[data-pestania]');
  if (p) { u.pestania = p.dataset.pestania; notificar('vista'); return; }
  const t = e.target.closest('[data-tipo]');
  if (t) { u.tipo = t.dataset.tipo; notificar('vista'); return; }
  const f = e.target.closest('[data-fuente]');
  if (f) { u.fuente = f.dataset.fuente; notificar('vista'); return; }
  const b = e.target.closest('[data-accion="tabla"]');
  if (b) { u.tabla = !u.tabla; notificar('vista'); }
}

export default { titulo: 'Gráficos', icono: 'graficos', render };
