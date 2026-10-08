// Mi Presupuesto · cálculo de la planilla
//
// Para cada concepto (línea) y cada mes hay dos valores:
//   plan  lo presupuestado en el plan activo del año (o derivado: cuota de un préstamo,
//         aguinaldo calculado a partir de los sueldos)
//   real  lo que pasó. En orden de prioridad:
//           1. un total escrito a mano en la celda
//           2. la suma de los movimientos cargados y las cuotas de compras de ese mes
//           3. automático (aguinaldo, sobrante del mes anterior)
//           4. "supuesto": un concepto fijo de un mes ya empezado se da por pagado igual
//              a lo planeado hasta que se cargue otra cosa o se cierre el mes
// Los montos de cada línea están en su moneda; los totales, siempre en pesos.

import { mesesDelAnio, sumarMeses, numMes, anioDe, rangoMeses } from './fechas.js';
import { Indices } from './indices.js';
import { planActivo, seccionDeLinea } from './modelo.js';
import { SECCIONES } from './catalogo.js';

export function crearContexto(hogar, datos, { ipc = {}, mesHoy } = {}) {
  const indices = new Indices(datos, ipc);
  const ctx = { hogar, datos, indices, mesHoy: mesHoy || hoyMes(), cache: new Map(), avisos: new Set() };
  indexar(ctx);
  return ctx;
}

function hoyMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function indexar(ctx) {
  const h = ctx.hogar;
  ctx.lineaPorId = new Map(h.lineas.map((l) => [l.id, l]));
  ctx.seccionDe = new Map(h.lineas.map((l) => [l.id, seccionDeLinea(h, l)]));
  ctx.deudaPorId = new Map(h.deudas.map((d) => [d.id, d]));
  ctx.movs = new Map();
  for (const m of h.movimientos) {
    const k = `${m.lineaId}|${m.fecha.slice(0, 7)}`;
    const e = ctx.movs.get(k) || { suma: 0, n: 0 };
    e.suma += m.monto; e.n++;
    ctx.movs.set(k, e);
  }
  ctx.cuotasIdx = new Map();
  for (const c of h.cuotas) {
    for (let i = 0; i < c.cantidad; i++) {
      const k = `${c.lineaId}|${sumarMeses(c.primerMes, i)}`;
      const e = ctx.cuotasIdx.get(k) || { suma: 0, n: 0 };
      e.suma += c.montoCuota; e.n++;
      ctx.cuotasIdx.set(k, e);
    }
  }
  ctx.planPorAnio = new Map();
}

export function planDe(ctx, anio) {
  if (!ctx.planPorAnio.has(anio)) ctx.planPorAnio.set(anio, planActivo(ctx.hogar, anio));
  return ctx.planPorAnio.get(anio);
}

// Pesos por dólar en un mes, según la cotización elegida en el hogar.
export function cotizacion(ctx, mes) {
  const k = `cot|${mes}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k);
  const d = ctx.indices.dolar(ctx.hogar.dolar, mes, ctx.hogar.dolarManual);
  if (!d.v) ctx.avisos.add('Sin cotización del dólar: los montos en dólares no se suman a los totales.');
  ctx.cache.set(k, d.v || 0);
  return d.v || 0;
}

export function aPesos(ctx, centavos, moneda, mes) {
  if (!centavos) return 0;
  return moneda === 'USD' ? Math.round(centavos * cotizacion(ctx, mes)) : centavos;
}

const seAsumeReal = (seccion) => seccion === 'ingresos' || seccion === 'gastos' || seccion === 'deudas';

// ── Plan ────────────────────────────────────────────────────────────────────────────
export function valorPlan(ctx, l, mes, plan = planDe(ctx, anioDe(mes))) {
  const ex = plan && plan.montos[l.id] ? plan.montos[l.id][mes] : undefined;
  if (ex !== undefined) return { v: ex, origen: 'plan' };
  if (l.deudaId) {
    const d = ctx.deudaPorId.get(l.deudaId);
    if (d && mes >= d.primerMes && mes <= sumarMeses(d.primerMes, d.cuotas - 1)) return { v: d.cuota, origen: 'deuda' };
  }
  if (l.auto === 'aguinaldo' && (numMes(mes) === 6 || numMes(mes) === 12)) {
    const v = aguinaldo(ctx, 'plan', mes, plan);
    if (v) return { v, origen: 'auto' };
  }
  return { v: null, origen: null };
}

// ── Real ────────────────────────────────────────────────────────────────────────────
export function valorReal(ctx, l, mes) {
  const k = `r|${l.id}|${mes}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k);
  const r = calcularReal(ctx, l, mes);
  ctx.cache.set(k, r);
  return r;
}

function calcularReal(ctx, l, mes) {
  const h = ctx.hogar;
  const manual = h.reales[l.id] ? h.reales[l.id][mes] : undefined;
  const mv = ctx.movs.get(`${l.id}|${mes}`);
  const cu = ctx.cuotasIdx.get(`${l.id}|${mes}`);
  const items = { movimientos: mv ? mv.n : 0, cuotas: cu ? cu.n : 0, sumaCuotas: cu ? cu.suma : 0 };
  if (manual !== undefined) return { v: manual, origen: 'manual', ...items };
  if (mv || cu) return { v: (mv ? mv.suma : 0) + (cu ? cu.suma : 0), origen: mv ? 'movimientos' : 'cuotas', ...items };
  if (l.auto === 'saldo') {
    const c = h.cierres[sumarMeses(mes, -1)];
    if (c && c.destino && c.destino.tipo === 'siguiente' && c.monto) return { v: c.monto, origen: 'auto', ...items };
    return { v: null, origen: null, ...items };
  }
  if (mes > ctx.mesHoy) return { v: null, origen: null, ...items };
  if (l.auto === 'aguinaldo') {
    if (numMes(mes) !== 6 && numMes(mes) !== 12) return { v: null, origen: null, ...items };
    const v = aguinaldo(ctx, 'real', mes);
    return v ? { v, origen: 'auto', ...items } : { v: null, origen: null, ...items };
  }
  const seccion = ctx.seccionDe.get(l.id);
  if ((l.naturaleza === 'fijo' || l.deudaId) && seAsumeReal(seccion) && !h.cierres[mes]) {
    const p = valorPlan(ctx, l, mes);
    if (p.v !== null) return { v: p.v, origen: 'supuesto', ...items };
  }
  return { v: null, origen: null, ...items };
}

// Aguinaldo (SAC): la mitad del mejor sueldo mensual del semestre, en junio y diciembre,
// por cada sueldo marcado "en relación de dependencia".
export function aguinaldo(ctx, fuente, mes, plan) {
  const m = numMes(mes);
  if (m !== 6 && m !== 12) return 0;
  const inicio = sumarMeses(mes, -5);
  const meses = rangoMeses(inicio, mes);
  let total = 0;
  for (const l of ctx.hogar.lineas) {
    if (!l.aguinaldo || l.auto) continue;
    let mejor = 0;
    for (const x of meses) {
      const v = fuente === 'plan' ? valorPlan(ctx, l, x, plan).v : (x <= ctx.mesHoy ? valorReal(ctx, l, x).v : null);
      const pesos = aPesos(ctx, v || 0, l.moneda, x);
      if (pesos > mejor) mejor = pesos;
    }
    total += Math.round(mejor / 2);
  }
  return total;
}

// ── Fondo de emergencia: cubre los gastos inesperados con lo ahorrado ───────────────
export function fondo(ctx) {
  return ctx.hogar.metas.find((m) => m.tipo === 'fondo') || null;
}

// Libro mes a mes del fondo: saldo al empezar, aportes, imprevistos cubiertos y saldo final.
export function libroFondo(ctx, hasta) {
  const f = fondo(ctx);
  if (!f) return new Map();
  const k = `fondo|${hasta}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k);
  const l = ctx.lineaPorId.get(f.lineaId);
  const libro = new Map();
  if (!l || hasta < f.saldoInicialMes) { ctx.cache.set(k, libro); return libro; }
  let saldo = aPesos(ctx, f.saldoInicial, f.moneda, f.saldoInicialMes);
  const cubrir = ctx.hogar.fondo.cubrirInesperados;
  for (const mes of rangoMeses(f.saldoInicialMes, hasta)) {
    const aportes = aPesos(ctx, valorReal(ctx, l, mes).v || 0, l.moneda, mes);
    const inesperados = mes <= ctx.mesHoy ? totalSeccionReal(ctx, 'inesperados', mes) : 0;
    const disponible = Math.max(0, saldo + aportes);
    const cobertura = cubrir ? Math.min(Math.max(0, inesperados), disponible) : 0;
    const inicio = saldo;
    saldo = saldo + aportes - cobertura;
    libro.set(mes, { inicio, aportes, inesperados, cobertura, fin: saldo });
  }
  ctx.cache.set(k, libro);
  return libro;
}

export function coberturaFondo(ctx, mes) {
  const f = fondo(ctx);
  if (!f || mes < f.saldoInicialMes || mes > ctx.mesHoy) return 0;
  const e = libroFondo(ctx, ctx.mesHoy).get(mes);
  return e ? e.cobertura : 0;
}

function totalSeccionReal(ctx, sec, mes) {
  let t = 0;
  for (const l of ctx.hogar.lineas) {
    if (ctx.seccionDe.get(l.id) !== sec) continue;
    t += aPesos(ctx, valorReal(ctx, l, mes).v || 0, l.moneda, mes);
  }
  return t;
}

// ── Año completo ────────────────────────────────────────────────────────────────────
export function estadoDelMes(ctx, mes) {
  if (mes < ctx.mesHoy) return 'pasado';
  if (mes === ctx.mesHoy) return 'actual';
  return 'futuro';
}

export function calcularAnio(ctx, anio, { planId } = {}) {
  const clave = `anio|${anio}|${planId || ''}`;
  if (ctx.cache.has(clave)) return ctx.cache.get(clave);
  const h = ctx.hogar;
  const plan = planId ? h.planes.find((p) => p.id === planId) : planDe(ctx, anio);
  const meses = mesesDelAnio(anio);
  const vacio = () => new Array(12).fill(0);
  const res = {
    anio, meses, plan,
    estado: meses.map((m) => estadoDelMes(ctx, m)),
    cerrado: meses.map((m) => !!h.cierres[m]),
    lineas: new Map(),
    categorias: new Map(),
    secciones: {},
    cobertura: meses.map((m) => coberturaFondo(ctx, m)),
    resultado: { plan: vacio(), real: vacio() },
    cotizacion: meses.map((m) => cotizacion(ctx, m))
  };
  for (const s of SECCIONES) res.secciones[s.clave] = { plan: vacio(), real: vacio() };
  for (const c of h.categorias) res.categorias.set(c.id, { plan: vacio(), real: vacio() });

  for (const l of h.lineas) {
    const fila = { plan: [], real: [], origenPlan: [], origenReal: [], items: [], planPesos: vacio(), realPesos: vacio() };
    let tieneValores = false;
    meses.forEach((mes, i) => {
      const p = valorPlan(ctx, l, mes, plan);
      const r = valorReal(ctx, l, mes);
      fila.plan.push(p.v); fila.origenPlan.push(p.origen);
      fila.real.push(r.v); fila.origenReal.push(r.origen);
      fila.items.push({ movimientos: r.movimientos, cuotas: r.cuotas, sumaCuotas: r.sumaCuotas });
      fila.planPesos[i] = aPesos(ctx, p.v || 0, l.moneda, mes);
      fila.realPesos[i] = aPesos(ctx, r.v || 0, l.moneda, mes);
      if (p.v || r.v) tieneValores = true;
    });
    fila.tieneValores = tieneValores;
    res.lineas.set(l.id, fila);
    const cat = res.categorias.get(l.categoriaId);
    const sec = res.secciones[ctx.seccionDe.get(l.id)];
    for (let i = 0; i < 12; i++) {
      if (cat) { cat.plan[i] += fila.planPesos[i]; cat.real[i] += fila.realPesos[i]; }
      if (sec) { sec.plan[i] += fila.planPesos[i]; sec.real[i] += fila.realPesos[i]; }
    }
  }
  const S = res.secciones;
  for (let i = 0; i < 12; i++) {
    for (const k of ['plan', 'real']) {
      const cob = k === 'real' ? res.cobertura[i] : 0;
      res.resultado[k][i] = S.ingresos[k][i] - S.gastos[k][i] - (S.inesperados[k][i] - cob)
        - S.ahorro[k][i] - S.deudas[k][i] - S.inversiones[k][i];
    }
  }
  const suma = (a) => a.reduce((s, x) => s + x, 0);
  res.anual = {
    resultado: { plan: suma(res.resultado.plan), real: suma(res.resultado.real) },
    cobertura: suma(res.cobertura),
    secciones: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, { plan: suma(v.plan), real: suma(v.real) }]))
  };
  ctx.cache.set(clave, res);
  return res;
}

// ── Períodos que cruzan años (análisis, Sankey, gráficos) ───────────────────────────
// Devuelve, para una lista de meses, el total en pesos de cada línea, de cada categoría
// y de cada sección, según la fuente ('plan' o 'real').
export function totalesPeriodo(ctx, meses, fuente = 'real') {
  const porLinea = new Map(), porCategoria = new Map(), porSeccion = {};
  for (const s of SECCIONES) porSeccion[s.clave] = 0;
  let cobertura = 0;
  for (const mes of meses) {
    const plan = planDe(ctx, anioDe(mes));
    for (const l of ctx.hogar.lineas) {
      const v = fuente === 'plan' ? valorPlan(ctx, l, mes, plan).v : valorReal(ctx, l, mes).v;
      if (!v) continue;
      const pesos = aPesos(ctx, v, l.moneda, mes);
      porLinea.set(l.id, (porLinea.get(l.id) || 0) + pesos);
      porCategoria.set(l.categoriaId, (porCategoria.get(l.categoriaId) || 0) + pesos);
      porSeccion[ctx.seccionDe.get(l.id)] += pesos;
    }
    if (fuente === 'real') cobertura += coberturaFondo(ctx, mes);
  }
  const S = porSeccion;
  const resultado = S.ingresos - S.gastos - (S.inesperados - cobertura) - S.ahorro - S.deudas - S.inversiones;
  return { meses, fuente, porLinea, porCategoria, porSeccion, cobertura, resultado };
}

// ¿El mes tiene gastos reales cargados (a mano o con movimientos)? Las cuotas solas o
// los fijos supuestos no cuentan: no muestran que alguien haya llevado las cuentas.
export function mesConDatos(ctx, mes) {
  for (const l of ctx.hogar.lineas) {
    const r = valorReal(ctx, l, mes);
    if (r.origen === 'manual' || r.origen === 'movimientos') {
      const sec = ctx.seccionDe.get(l.id);
      if (sec === 'gastos' || sec === 'inesperados') return true;
    }
  }
  return false;
}

// Últimos n meses con datos reales, hasta el mes indicado inclusive.
export function ultimosMesesConDatos(ctx, n = 3, hasta = ctx.mesHoy) {
  const out = [];
  for (let i = 0; i < 36 && out.length < n; i++) {
    const m = sumarMeses(hasta, -i);
    if (mesConDatos(ctx, m)) out.push(m);
  }
  return out.reverse();
}
