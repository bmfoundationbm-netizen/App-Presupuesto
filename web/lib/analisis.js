// Mi Presupuesto · análisis del gasto y dónde recortar
//
// Cuatro comparaciones, que cada hogar puede prender o apagar:
//   regla      regla 50/30/20: necesidades, gustos y ahorro sobre los ingresos
//   parecidos  hogares de la misma composición, región e ingresos (ENGHo, INDEC)
//   historial  el propio gasto de los 6 meses anteriores, llevado a pesos de hoy con el
//              IPC de cada categoría (lo que sube más que la inflación)
//   topes      límites que pone cada uno por categoría
// Además, los gastos marcados como prescindibles siempre aparecen como recortables.

import { totalesPeriodo, ultimosMesesConDatos, mesConDatos, calcularAnio, planDe } from './calculos.js';
import { referenciaParecidos, gastoPorIndice, ingresosDelMes, situacion } from './familia.js';
import { estadoMeta } from './ahorro.js';
import { categoria, indiceDeLinea } from './modelo.js';
import { nombreIndice, CLASES } from './catalogo.js';
import { sumarMeses, rangoMeses, nombreMes as nombreMesBase, anioDe, mesesDelAnio, capitalizar } from './fechas.js';
import { pesos as pesosExactos, porcentaje } from './dinero.js';

// En los textos: meses con mayúscula y pesos sin centavos.
const nombreMes = (m, op) => capitalizar(nombreMesBase(m, op));
const pesos = (c) => pesosExactos(Math.round(c / 100) * 100);

export function periodoAnalisis(ctx, { modo = 'ultimos', mes } = {}) {
  if (modo === 'mes' && mes) {
    const real = mes <= ctx.mesHoy && mesConDatos(ctx, mes);
    return { meses: [mes], fuente: real ? 'real' : 'plan', descripcion: `${real ? 'Lo real' : 'Lo planeado'} de ${nombreMes(mes)}` };
  }
  // Solo meses completos: el mes en curso todavía no terminó.
  const meses = ultimosMesesConDatos(ctx, 3, sumarMeses(ctx.mesHoy, -1));
  if (meses.length) {
    return {
      meses, fuente: 'real',
      descripcion: meses.length === 1 ? `Lo real de ${nombreMes(meses[0])}` : `Promedio real de ${meses.map((m) => nombreMes(m, { conAnio: false })).join(', ')}`
    };
  }
  return { meses: [ctx.mesHoy], fuente: 'plan', descripcion: `Lo planeado para ${nombreMes(ctx.mesHoy)} (todavía no hay gastos reales cargados)` };
}

// Promedio mensual por línea en el período.
function promediosPorLinea(ctx, periodo) {
  const t = totalesPeriodo(ctx, periodo.meses, periodo.fuente);
  const n = periodo.meses.length;
  const por = new Map();
  for (const [lid, v] of t.porLinea) por.set(lid, Math.round(v / n));
  return { t, por, n };
}

export function analizar(ctx, engho, periodo = periodoAnalisis(ctx)) {
  const h = ctx.hogar;
  const cmp = h.analisis.comparaciones;
  const { t, por, n } = promediosPorLinea(ctx, periodo);
  const prom = (x) => Math.round(x / n);
  const S = Object.fromEntries(Object.entries(t.porSeccion).map(([k, v]) => [k, prom(v)]));
  let saldoAnterior = 0;
  for (const l of h.lineas) if (l.auto === 'saldo') saldoAnterior += por.get(l.id) || 0;
  const ingresos = S.ingresos - saldoAnterior;
  const cobertura = prom(t.cobertura);
  const resultado = prom(t.resultado);
  const hallazgos = [];

  // Líneas de gasto con su promedio mensual.
  const lineas = [];
  for (const l of h.lineas) {
    const sec = ctx.seccionDe.get(l.id);
    if (sec !== 'gastos') continue;
    const monto = por.get(l.id) || 0;
    if (monto <= 0) continue;
    lineas.push({ linea: l, monto, clase: l.clase || 'reducible', categoria: categoria(h, l.categoriaId), señales: [] });
  }
  const gastoTotal = lineas.reduce((s, x) => s + x.monto, 0);

  // ── Regla 50/30/20 ──
  let regla = null;
  if (cmp.regla && ingresos > 0) {
    const esenciales = lineas.filter((x) => x.clase === 'esencial').reduce((s, x) => s + x.monto, 0);
    const gustos = lineas.filter((x) => x.clase !== 'esencial').reduce((s, x) => s + x.monto, 0);
    const necesidades = esenciales + Math.max(0, S.inesperados - cobertura) + S.deudas;
    const ahorro = S.ahorro + S.inversiones + Math.max(0, resultado);
    regla = {
      necesidades, gustos, ahorro,
      prop: { necesidades: necesidades / ingresos, gustos: gustos / ingresos, ahorro: ahorro / ingresos },
      objetivo: { necesidades: 0.5, gustos: 0.3, ahorro: 0.2 }
    };
    if (regla.prop.gustos > 0.3) {
      const exceso = Math.round(gustos - 0.3 * ingresos);
      hallazgos.push({
        id: 'regla-gustos', tipo: 'regla', nivel: 'aviso',
        titulo: `Los gastos que no son esenciales son el ${porcentaje(regla.prop.gustos, 0)} de tus ingresos`,
        detalle: `La regla 50/30/20 sugiere que los gustos no pasen del 30 %. Bajarlos a ese nivel libera ${pesos(exceso)} por mes.`,
        ahorroPosible: exceso
      });
    }
    if (regla.prop.ahorro < 0.2) {
      hallazgos.push({
        id: 'regla-ahorro', tipo: 'regla', nivel: regla.prop.ahorro < 0.05 ? 'aviso' : 'info',
        titulo: `Ahorrás el ${porcentaje(Math.max(0, regla.prop.ahorro), 0)} de tus ingresos`,
        detalle: `La regla sugiere el 20 %: serían ${pesos(Math.round(0.2 * ingresos))} por mes (incluye lo que sobra a fin de mes).`,
        ahorroPosible: 0
      });
    }
    if (regla.prop.necesidades > 0.5) {
      hallazgos.push({
        id: 'regla-necesidades', tipo: 'regla', nivel: 'info',
        titulo: `Lo esencial se lleva el ${porcentaje(regla.prop.necesidades, 0)} de tus ingresos`,
        detalle: 'Es más del 50 % que sugiere la regla. Ahí el margen está en revisar contratos y tarifas (alquiler, prepaga, servicios, seguros), más que en dejar de pagar.',
        ahorroPosible: 0
      });
    }
  }

  // ── Hogares parecidos (ENGHo) ──
  let parecidos = null;
  if (cmp.parecidos && engho) {
    const mesRef = periodo.meses[periodo.meses.length - 1];
    const ref = referenciaParecidos(ctx, engho, mesRef, ingresos);
    if (ref) {
      const gi = gastoPorIndice(ctx, periodo.meses, periodo.fuente);
      const totalTuyo = gi.total / n;
      const filas = ref.partes.map((p) => {
        const tuyo = Math.round((gi.porIndice.get(p.indice) || 0) / n);
        return { indice: p.indice, nombre: nombreIndice(p.indice), tuyo, tuyoProp: totalTuyo ? tuyo / totalTuyo : 0, ref: p.monto, refProp: p.proporcion };
      });
      parecidos = { ref, filas, totalTuyo: Math.round(totalTuyo) };
      for (const f of filas) {
        const exceso = Math.round((f.tuyoProp - f.refProp) * totalTuyo);
        if (f.tuyoProp > f.refProp * 1.3 && exceso > 0.02 * totalTuyo) {
          hallazgos.push({
            id: `parecidos-${f.indice}`, tipo: 'parecidos', nivel: 'aviso', indice: f.indice,
            titulo: `${f.nombre}: ${porcentaje(f.tuyoProp, 0)} de tu gasto`,
            detalle: `Hogares parecidos destinan el ${porcentaje(f.refProp, 0)}. Llevarlo a esa proporción son ${pesos(exceso)} por mes.`,
            ahorroPosible: exceso
          });
          for (const x of lineas) if (indiceDeLinea(h, x.linea) === f.indice) x.señales.push('parecidos');
        }
      }
    }
  }

  // ── Historial propio contra la inflación ──
  const historial = [];
  if (cmp.historial && periodo.fuente === 'real') {
    const inicio = periodo.meses[0];
    const previos = rangoMeses(sumarMeses(inicio, -6), sumarMeses(inicio, -1)).filter((m) => mesConDatos(ctx, m));
    const fin = periodo.meses[periodo.meses.length - 1];
    if (previos.length >= 2) {
      const porCat = new Map();
      for (const x of lineas) {
        const c = x.categoria;
        if (!porCat.has(c.id)) porCat.set(c.id, { categoria: c, actual: 0, anterior: 0 });
        porCat.get(c.id).actual += x.monto;
      }
      const tPrev = new Map();
      for (const m of previos) {
        const tm = totalesPeriodo(ctx, [m], 'real');
        for (const c of h.categorias) {
          if (c.seccion !== 'gastos') continue;
          const v = tm.porCategoria.get(c.id) || 0;
          const f = ctx.indices.factor(h.region, c.indice || 'general', m, fin);
          tPrev.set(c.id, (tPrev.get(c.id) || 0) + v * f.f);
        }
      }
      for (const [cid, e] of porCat) {
        e.anterior = Math.round((tPrev.get(cid) || 0) / previos.length);
        e.variacionReal = e.anterior > 0 ? e.actual / e.anterior - 1 : null;
        historial.push(e);
        const extra = e.actual - e.anterior;
        if (e.variacionReal !== null && e.variacionReal > 0.15 && extra > 0.01 * gastoTotal) {
          hallazgos.push({
            id: `historial-${cid}`, tipo: 'historial', nivel: 'aviso', categoriaId: cid,
            titulo: `${e.categoria.nombre} subió ${porcentaje(e.variacionReal, 0)} más que la inflación`,
            detalle: `Comparado con tus ${previos.length} meses anteriores llevados a pesos de hoy: ${pesos(extra)} más por mes.`,
            ahorroPosible: extra
          });
          for (const x of lineas) if (x.categoria.id === cid) x.señales.push('historial');
        }
      }
    }
  }

  // ── Topes propios ──
  const topes = [];
  if (cmp.topes) {
    for (const [cid, tope] of Object.entries(h.analisis.topes || {})) {
      const c = categoria(h, cid);
      if (!c || !tope || !(tope.valor > 0)) continue;
      const gasto = prom(t.porCategoria.get(cid) || 0);
      const limite = tope.tipo === 'porcentaje' ? Math.round((tope.valor / 100) * ingresos) : tope.valor;
      const e = { categoria: c, tope, limite, gasto, exceso: Math.max(0, gasto - limite) };
      topes.push(e);
      if (e.exceso > 0) {
        hallazgos.push({
          id: `tope-${cid}`, tipo: 'tope', nivel: 'alerta', categoriaId: cid,
          titulo: `${c.nombre} pasó tu tope`,
          detalle: `Gastás ${pesos(gasto)} por mes y el tope es ${pesos(limite)}${tope.tipo === 'porcentaje' ? ` (${tope.valor} % de los ingresos)` : ''}.`,
          ahorroPosible: e.exceso
        });
        for (const x of lineas) if (x.categoria.id === cid) x.señales.push('tope');
      }
    }
  }

  // ── Prescindibles ──
  const prescindibles = lineas.filter((x) => x.clase === 'prescindible').sort((a, b) => b.monto - a.monto);
  if (prescindibles.length) {
    const total = prescindibles.reduce((s, x) => s + x.monto, 0);
    hallazgos.push({
      id: 'prescindibles', tipo: 'prescindible', nivel: 'info',
      titulo: `${pesos(total)} por mes en gastos prescindibles`,
      detalle: prescindibles.slice(0, 6).map((x) => `${x.linea.nombre}: ${pesos(x.monto)}`).join(' · '),
      ahorroPosible: total
    });
  }

  const descartados = new Set(h.analisis.descartados || []);
  const visibles = hallazgos.filter((x) => !descartados.has(x.id));
  const capacidad = lineas.reduce((s, x) => s + Math.round(x.monto * rangoRecorte(x.clase, new Set(x.señales).size, false).sugerido), 0);
  return {
    periodo, n, ingresos, saldoAnterior, gastoTotal, secciones: S, cobertura, resultado,
    regla, parecidos, historial, topes, lineas, hallazgos: visibles, descartados: hallazgos.length - visibles.length,
    capacidadSugerida: capacidad
  };
}

// ── Plan de recorte ─────────────────────────────────────────────────────────────────
const RANGO_CLASE = { prescindible: 3, reducible: 2, esencial: 1 };

function rangoRecorte(clase, señales, permitirEsenciales) {
  if (clase === 'prescindible') return { sugerido: 0.5, maximo: 1 };
  if (clase === 'reducible') return { sugerido: Math.min(0.3, 0.15 + 0.05 * señales), maximo: 0.5 };
  return { sugerido: 0, maximo: permitirEsenciales ? 0.1 : 0 };
}

// objetivo: centavos por mes que se quieren liberar. ajustes: { lineaId: porcentaje 0..1 }
// elegido a mano (si están, mandan).
export function planDeRecorte(analisis, objetivo, { permitirEsenciales = false, ajustes = null } = {}) {
  const cand = analisis.lineas.map((x) => {
    const s = new Set(x.señales).size;
    return { ...x, nSeñales: s, rango: rangoRecorte(x.clase, s, permitirEsenciales) };
  }).sort((a, b) => (RANGO_CLASE[b.clase] - RANGO_CLASE[a.clase]) || (b.nSeñales - a.nSeñales) || (b.monto - a.monto));
  const elegido = new Map();
  if (ajustes) {
    for (const c of cand) elegido.set(c.linea.id, Math.max(0, Math.min(1, ajustes[c.linea.id] || 0)));
  } else {
    let falta = objetivo;
    for (const fase of ['sugerido', 'maximo']) {
      for (const c of cand) {
        if (falta <= 0) break;
        const ya = elegido.get(c.linea.id) || 0;
        const tope = c.rango[fase];
        if (tope <= ya) continue;
        const posible = Math.round(c.monto * (tope - ya));
        const toma = Math.min(posible, falta);
        elegido.set(c.linea.id, ya + toma / c.monto);
        falta -= toma;
      }
    }
  }
  const filas = cand.map((c) => {
    const p = elegido.get(c.linea.id) || 0;
    const recorte = Math.round(c.monto * p);
    return {
      lineaId: c.linea.id, nombre: c.linea.nombre, categoria: c.categoria.nombre, clase: c.clase,
      monto: c.monto, porcentaje: p, recorte, nuevo: c.monto - recorte, maximo: c.rango.maximo,
      motivo: motivo(c)
    };
  });
  const total = filas.reduce((s, f) => s + f.recorte, 0);
  return { filas, total, objetivo, alcanza: total >= objetivo, faltante: Math.max(0, objetivo - total) };
}

function motivo(c) {
  const partes = [CLASES[c.clase] ? CLASES[c.clase].nombre : c.clase];
  const s = new Set(c.señales);
  if (s.has('parecidos')) partes.push('más que hogares parecidos');
  if (s.has('historial')) partes.push('subió más que la inflación');
  if (s.has('tope')) partes.push('pasó tu tope');
  return partes.join(' · ');
}

// ── Avisos ──────────────────────────────────────────────────────────────────────────
export function alertas(ctx) {
  const h = ctx.hogar;
  const out = [];
  const mes = ctx.mesHoy;
  const anio = anioDe(mes);
  const res = calcularAnio(ctx, anio);
  const i = mesesDelAnio(anio).indexOf(mes);

  // Lo gastado contra lo planeado en el mes en curso. Los fijos que se dan por pagados
  // (supuestos) no cuentan: son iguales a lo planeado por definición. El aviso de "cerca
  // del límite" mira solo los conceptos variables.
  for (const c of h.categorias) {
    if (c.seccion !== 'gastos') continue;
    let plan = 0, real = 0, planVar = 0, realVar = 0;
    for (const l of h.lineas) {
      if (l.categoriaId !== c.id) continue;
      const f = res.lineas.get(l.id);
      if (!f) continue;
      plan += f.planPesos[i];
      const r = f.origenReal[i] === 'supuesto' ? 0 : f.realPesos[i];
      real += r;
      if (l.naturaleza !== 'fijo') { planVar += f.planPesos[i]; realVar += r; }
    }
    if (!(plan > 0)) continue;
    const mesTxt = nombreMes(mes, { conAnio: false });
    if (real > plan) {
      out.push({ id: `pasado-${c.id}-${mes}`, nivel: 'alerta', titulo: `${c.nombre}: te pasaste de lo planeado`, detalle: `Llevás ${pesos(real)} de ${pesos(plan)} planeados para ${mesTxt.toLowerCase()} (${porcentaje(real / plan, 0)}).`, accion: { tipo: 'planilla', mes } });
    } else if (planVar > 0 && realVar / planVar >= 0.9) {
      out.push({ id: `cerca-${c.id}-${mes}`, nivel: 'aviso', titulo: `${c.nombre}: ya usaste el ${porcentaje(realVar / planVar, 0)} de lo variable`, detalle: `Quedan ${pesos(planVar - realVar)} de lo planeado para ${mesTxt.toLowerCase()} en gastos variables.`, accion: { tipo: 'planilla', mes } });
    }
  }

  // Meses cerrados sin cerrar (los anteriores al actual con datos o con plan).
  const sinCerrar = [];
  for (let k = 1; k <= 3; k++) {
    const m = sumarMeses(mes, -k);
    if (h.cierres[m]) break;
    const pl = planDe(ctx, anioDe(m));
    if (mesConDatos(ctx, m) || (pl && Object.values(pl.montos).some((x) => x[m]))) sinCerrar.push(m);
  }
  if (sinCerrar.length) {
    const m = sinCerrar[sinCerrar.length - 1];
    out.push({ id: `cerrar-${m}`, nivel: 'info', titulo: `${nombreMes(m)} está sin cerrar`, detalle: 'Al cerrarlo confirmás los gastos fijos y elegís a dónde va lo que sobró.', accion: { tipo: 'cerrar', mes: m } });
  }

  // Meses que vienen con faltante planeado.
  for (let k = i + 1; k < 12; k++) {
    if (res.plan && res.resultado.plan[k] < 0) {
      out.push({ id: `faltante-${res.meses[k]}`, nivel: 'aviso', titulo: `${nombreMes(res.meses[k])}: lo planeado no alcanza`, detalle: `Faltan ${pesos(-res.resultado.plan[k])}. Revisá ese mes o mové gastos.`, accion: { tipo: 'planilla', mes: res.meses[k] } });
      break;
    }
  }

  // Cuotas que terminan este mes: liberan plata desde el que viene.
  for (const c of h.cuotas) {
    if (sumarMeses(c.primerMes, c.cantidad - 1) === mes) {
      out.push({ id: `fin-cuotas-${c.id}`, nivel: 'info', titulo: `Este mes termina "${c.descripcion}"`, detalle: `Desde ${nombreMesBase(sumarMeses(mes, 1), { conAnio: false })} se liberan ${pesos(c.montoCuota)} por mes.` });
    }
  }

  // Metas y fondo de emergencia.
  for (const m of h.metas) {
    const e = estadoMeta(ctx, m);
    if (m.tipo === 'fondo' && e.objetivoFinal > 0 && e.avance < 0.5) {
      out.push({ id: `fondo-${mes}`, nivel: 'info', titulo: `El fondo de emergencia está al ${porcentaje(e.avance, 0)}`, detalle: `Tiene ${pesos(e.saldo)} de ${pesos(e.objetivoFinal)} (${m.mesesCobertura} meses de gastos).`, accion: { tipo: 'ahorro' } });
    }
    if (e.vencida) out.push({ id: `meta-vencida-${m.id}`, nivel: 'aviso', titulo: `La meta "${m.nombre}" venció sin completarse`, detalle: `Llegó al ${porcentaje(e.avance, 0)}. Podés cambiarle la fecha o el monto.`, accion: { tipo: 'ahorro' } });
  }

  // Ingresos del último mes completo contra la canasta básica.
  const ultimo = sumarMeses(mes, -1);
  if (mesConDatos(ctx, ultimo)) {
    const ing = ingresosDelMes(ctx, ultimo, 'real');
    const s = situacion(ctx, ultimo, ing);
    if (s && s.nivel !== 'arriba' && ing > 0) {
      out.push({ id: `canasta-${ultimo}`, nivel: 'info', titulo: `Los ingresos de ${nombreMesBase(ultimo, { conAnio: false })} no llegan a la canasta básica total`, detalle: `Para este hogar es de ${pesos(s.pobreza)} por mes (${s.ae.toFixed(2).replace('.', ',')} adultos equivalentes).`, accion: { tipo: 'familia' } });
    }
  }

  const orden = { alerta: 0, aviso: 1, info: 2 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
