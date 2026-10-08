// Mi Presupuesto · presupuestos por período, actualización por IPC y proyectos
//
// Actualizar nunca pisa el original: siempre crea una copia nueva.
//   "a pesos de un mes": cada monto se multiplica por la inflación de su categoría entre
//                         su mes y el mes de referencia
//   "a otro año":        cada mes se lleva al mismo mes del año elegido; los meses que
//                         todavía no pasaron usan la inflación proyectada

import { nuevoId, fijarPlan, indiceDeLinea, seccionDeLinea, linea as buscarLinea, nuevaMeta } from './modelo.js';
import { mesesDelAnio, mesDe, numMes, nombreMes, anioDe } from './fechas.js';
import { valorPlan, aPesos } from './calculos.js';

const ahora = () => new Date().toISOString();

// Índice con el que se actualiza una línea (null = no se toca).
export function indiceParaActualizar(h, l, { ajustarIngresos = true } = {}) {
  if (l.moneda === 'USD' || l.deudaId || l.auto) return null;
  if (seccionDeLinea(h, l) === 'ingresos' && !ajustarIngresos) return null;
  return indiceDeLinea(h, l);
}

export function copiarPlan(h, plan, { nombre, anio = plan.anio } = {}) {
  const nuevo = { id: nuevoId('p'), nombre: nombre || `${plan.nombre} (copia)`, anio, creado: ahora(), origen: { planId: plan.id, tipo: 'copia', fecha: ahora() }, montos: {} };
  for (const [lid, meses] of Object.entries(plan.montos)) {
    for (const [m, v] of Object.entries(meses)) fijarPlan(nuevo, lid, anio === plan.anio ? m : mesDe(anio, numMes(m)), v);
  }
  return nuevo;
}

// Devuelve { plan, resumen } sin agregarlo al hogar.
export function actualizarPlan(ctx, plan, opciones) {
  const h = ctx.hogar;
  const { modo, ajustarIngresos = true } = opciones;
  const region = h.region;
  const anioDestino = modo === 'aAnio' ? opciones.anioDestino : plan.anio;
  const ref = opciones.mesReferencia;
  const nombre = modo === 'aAnio'
    ? `Presupuesto ${anioDestino} (desde ${plan.nombre}, ajustado por IPC)`
    : `${plan.nombre} (a pesos de ${nombreMes(ref)})`;
  const nuevo = {
    id: nuevoId('p'), nombre, anio: anioDestino, creado: ahora(),
    origen: { planId: plan.id, tipo: 'actualizacion', modo, mesReferencia: ref || null, anioDestino, ajustarIngresos, fecha: ahora() },
    montos: {}
  };
  const tipos = new Set();
  const factores = {};
  let ajustadas = 0, sinCambio = 0;
  for (const [lid, meses] of Object.entries(plan.montos)) {
    const l = buscarLinea(h, lid);
    if (!l) continue;
    const ind = indiceParaActualizar(h, l, { ajustarIngresos });
    let tocada = false;
    for (const [m, v] of Object.entries(meses)) {
      const destino = modo === 'aAnio' ? mesDe(anioDestino, numMes(m)) : m;
      const hasta = modo === 'aAnio' ? destino : ref;
      let valor = v;
      if (ind) {
        const f = ctx.indices.factor(region, ind, m, hasta);
        if (f.tipo !== 'sinDatos') {
          valor = Math.round(v * f.f);
          tipos.add(f.tipo);
          if (!(ind in factores)) factores[ind] = f.f;
          tocada = true;
        }
      }
      fijarPlan(nuevo, lid, destino, valor);
    }
    if (tocada) ajustadas++; else sinCambio++;
  }
  nuevo.origen.fuentes = [...tipos];
  return { plan: nuevo, resumen: { ajustadas, sinCambio, tipos: [...tipos], factores } };
}

// Plan para un año nuevo. base: 'vacio' | 'fijos' | 'copia' | 'ipc'.
export function crearPlanAnio(ctx, anio, { base = 'fijos', desdePlan = null, ajustarIngresos = true } = {}) {
  const h = ctx.hogar;
  if (base === 'ipc' && desdePlan) return actualizarPlan(ctx, desdePlan, { modo: 'aAnio', anioDestino: anio, ajustarIngresos }).plan;
  if (base === 'copia' && desdePlan) return copiarPlan(h, desdePlan, { nombre: `Presupuesto ${anio}`, anio });
  const nuevo = { id: nuevoId('p'), nombre: `Presupuesto ${anio}`, anio, creado: ahora(), origen: null, montos: {} };
  if (base === 'fijos' && desdePlan) {
    // Los conceptos fijos siguen con el último monto planeado del año anterior.
    const ultimo = mesDe(desdePlan.anio, 12);
    for (const l of h.lineas) {
      if (l.naturaleza !== 'fijo' || l.auto || l.deudaId) continue;
      let v = null;
      for (let m = 12; m >= 1 && v === null; m--) {
        const x = (desdePlan.montos[l.id] || {})[mesDe(desdePlan.anio, m)];
        if (x !== undefined) v = x;
      }
      if (v) for (const mes of mesesDelAnio(anio)) fijarPlan(nuevo, l.id, mes, v);
    }
    nuevo.origen = { planId: desdePlan.id, tipo: 'fijos', desde: ultimo, fecha: ahora() };
  }
  return nuevo;
}

// Plan con un recorte aplicado desde un mes: baja los conceptos elegidos y suma lo
// liberado al aporte de una meta de ahorro.
export function planConRecortes(ctx, plan, recortes, { desdeMes, metaLineaId = null } = {}) {
  const h = ctx.hogar;
  const nuevo = copiarPlan(h, plan, { nombre: `${plan.nombre} con recortes` });
  nuevo.origen = { planId: plan.id, tipo: 'recorte', desdeMes, fecha: ahora() };
  const meses = mesesDelAnio(plan.anio).filter((m) => m >= desdeMes);
  for (const mes of meses) {
    let liberado = 0;
    for (const r of recortes) {
      if (!(r.porcentaje > 0)) continue;
      const l = buscarLinea(h, r.lineaId);
      if (!l) continue;
      const actual = valorPlan(ctx, l, mes, plan).v;
      const base = actual !== null && actual !== undefined ? actual : r.monto;
      const nuevoValor = Math.max(0, Math.round(base * (1 - r.porcentaje)));
      liberado += aPesos(ctx, base - nuevoValor, l.moneda, mes);
      fijarPlan(nuevo, l.id, mes, nuevoValor);
    }
    if (metaLineaId && liberado > 0) {
      const previo = (nuevo.montos[metaLineaId] || {})[mes] || 0;
      fijarPlan(nuevo, metaLineaId, mes, previo + liberado);
    }
  }
  return nuevo;
}

// ── Proyectos ───────────────────────────────────────────────────────────────────────
export function nuevoProyecto(h, { nombre = 'Proyecto', fecha = null, mesPrecios, items = [] } = {}) {
  const p = {
    id: nuevoId('pr'), nombre, fecha, mesPrecios, metaId: null, creado: ahora(), origen: null, notas: '',
    items: items.map((it) => ({ id: nuevoId('it'), descripcion: it.descripcion || '', indice: it.indice || 'general', presupuestado: Math.round(it.presupuestado || 0), gastado: Math.round(it.gastado || 0) }))
  };
  h.proyectos.push(p);
  return p;
}

export function totalesProyecto(ctx, p) {
  let presupuestado = 0, gastadoManual = 0;
  for (const it of p.items) { presupuestado += it.presupuestado; gastadoManual += it.gastado; }
  let movimientos = 0;
  for (const m of ctx.hogar.movimientos) {
    if (m.proyectoId !== p.id) continue;
    const l = ctx.lineaPorId.get(m.lineaId);
    movimientos += aPesos(ctx, m.monto, l ? l.moneda : 'ARS', m.fecha.slice(0, 7));
  }
  const gastado = gastadoManual + movimientos;
  // Presupuesto llevado a pesos de hoy con el índice de cada ítem.
  let presupuestadoHoy = 0;
  for (const it of p.items) {
    const f = ctx.indices.factor(ctx.hogar.region, it.indice || 'general', p.mesPrecios, ctx.mesHoy);
    presupuestadoHoy += Math.round(it.presupuestado * f.f);
  }
  return { presupuestado, presupuestadoHoy, gastado, movimientos, restante: presupuestado - gastado, avance: presupuestado ? gastado / presupuestado : 0 };
}

export function actualizarProyecto(ctx, p, mesDestino) {
  const region = ctx.hogar.region;
  const tipos = new Set();
  const copia = {
    ...p, id: nuevoId('pr'), nombre: `${p.nombre} (a pesos de ${nombreMes(mesDestino)})`, mesPrecios: mesDestino,
    creado: ahora(), metaId: null, origen: { proyectoId: p.id, tipo: 'actualizacion', desde: p.mesPrecios, hasta: mesDestino, fecha: ahora() },
    items: p.items.map((it) => {
      const f = ctx.indices.factor(region, it.indice || 'general', p.mesPrecios, mesDestino);
      tipos.add(f.tipo);
      return { ...it, id: nuevoId('it'), presupuestado: Math.round(it.presupuestado * f.f), gastado: 0 };
    })
  };
  copia.origen.fuentes = [...tipos];
  return copia;
}

// Meta de ahorro para juntar la plata de un proyecto (ajustada por IPC).
export function metaParaProyecto(ctx, p) {
  const t = totalesProyecto(ctx, p);
  const meta = nuevaMeta(ctx.hogar, { nombre: p.nombre, objetivo: t.presupuestado - t.gastado, objetivoMes: p.mesPrecios, fecha: p.fecha });
  p.metaId = meta.id;
  return meta;
}

export function anioDePlan(plan) { return plan ? plan.anio : anioDe(new Date().toISOString().slice(0, 7)); }
