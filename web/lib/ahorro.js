// Mi Presupuesto · metas de ahorro, fondo de emergencia, deudas e inversiones

import { aPesos, valorReal, libroFondo, totalesPeriodo, ultimosMesesConDatos, cotizacion } from './calculos.js';
import { mesesEntre, sumarMeses, rangoMeses, diasEntre, hoy } from './fechas.js';

const min = (a, b) => (a < b ? a : b);

// Saldo de una meta al final de un mes (en la moneda de la meta).
export function saldoMeta(ctx, meta, hasta = ctx.mesHoy) {
  const tope = min(hasta, ctx.mesHoy);
  if (meta.tipo === 'fondo') {
    if (tope < meta.saldoInicialMes) return meta.saldoInicial;
    const e = libroFondo(ctx, ctx.mesHoy).get(tope);
    return e ? e.fin : meta.saldoInicial;
  }
  const l = ctx.lineaPorId.get(meta.lineaId);
  let saldo = meta.saldoInicial;
  if (!l || tope < meta.saldoInicialMes) return saldo;
  for (const mes of rangoMeses(meta.saldoInicialMes, tope)) saldo += valorReal(ctx, l, mes).v || 0;
  return saldo;
}

// Gasto mensual de referencia para el fondo de emergencia: promedio de gastos y cuotas
// de deudas de los últimos 3 meses con datos reales; si no hay, lo planeado este mes.
export function gastoMensualReferencia(ctx) {
  const meses = ultimosMesesConDatos(ctx, 3);
  if (meses.length) {
    const t = totalesPeriodo(ctx, meses, 'real');
    return { monto: Math.round((t.porSeccion.gastos + t.porSeccion.deudas) / meses.length), fuente: 'real', meses };
  }
  const t = totalesPeriodo(ctx, [ctx.mesHoy], 'plan');
  return { monto: t.porSeccion.gastos + t.porSeccion.deudas, fuente: 'plan', meses: [ctx.mesHoy] };
}

export function estadoMeta(ctx, meta) {
  const region = ctx.hogar.region;
  const saldo = saldoMeta(ctx, meta);
  let objetivoHoy, objetivoFinal, tipoFactor = 'oficial';
  if (meta.tipo === 'fondo') {
    const ref = gastoMensualReferencia(ctx);
    objetivoHoy = objetivoFinal = ref.monto * (meta.mesesCobertura || 3);
  } else if (meta.ajustaIPC && meta.moneda === 'ARS') {
    const fh = ctx.indices.factor(region, 'general', meta.objetivoMes, ctx.mesHoy);
    objetivoHoy = Math.round(meta.objetivo * fh.f);
    if (meta.fecha && meta.fecha > ctx.mesHoy) {
      const ff = ctx.indices.factor(region, 'general', meta.objetivoMes, meta.fecha);
      objetivoFinal = Math.round(meta.objetivo * ff.f);
      tipoFactor = ff.tipo;
    } else objetivoFinal = objetivoHoy;
  } else objetivoHoy = objetivoFinal = meta.objetivo;

  const faltante = Math.max(0, objetivoFinal - saldo);
  const mesesRestantes = meta.fecha ? Math.max(1, mesesEntre(ctx.mesHoy, meta.fecha) + 1) : null;
  return {
    meta, saldo, objetivoHoy, objetivoFinal, faltante, mesesRestantes,
    aporteSugerido: mesesRestantes ? Math.ceil(faltante / mesesRestantes) : null,
    avance: objetivoFinal > 0 ? Math.min(1, Math.max(0, saldo / objetivoFinal)) : (saldo > 0 ? 1 : 0),
    alcanzada: objetivoFinal > 0 && saldo >= objetivoFinal,
    vencida: !!(meta.fecha && meta.fecha < ctx.mesHoy && saldo < objetivoFinal),
    tipoFactor
  };
}

// ── Deudas ──────────────────────────────────────────────────────────────────────────
export function estadoDeuda(ctx, d) {
  const fin = sumarMeses(d.primerMes, d.cuotas - 1);
  let pagadas;
  if (ctx.mesHoy < d.primerMes) pagadas = 0;
  else pagadas = Math.min(d.cuotas, mesesEntre(d.primerMes, ctx.mesHoy) + 1);
  const restantes = d.cuotas - pagadas;
  return {
    deuda: d, fin, pagadas, restantes,
    saldo: restantes * d.cuota,
    saldoPesos: aPesos(ctx, restantes * d.cuota, d.moneda, ctx.mesHoy),
    terminada: restantes === 0,
    proxima: restantes > 0 ? (ctx.mesHoy < d.primerMes ? d.primerMes : sumarMeses(ctx.mesHoy, 1)) : null
  };
}

// Compras en cuotas que todavía tienen cuotas por pagar después de este mes.
export function cuotasPendientes(ctx) {
  const out = [];
  for (const c of ctx.hogar.cuotas) {
    const fin = sumarMeses(c.primerMes, c.cantidad - 1);
    if (fin <= ctx.mesHoy) continue;
    const pagadas = ctx.mesHoy < c.primerMes ? 0 : mesesEntre(c.primerMes, ctx.mesHoy) + 1;
    const restantes = c.cantidad - pagadas;
    const l = ctx.lineaPorId.get(c.lineaId);
    out.push({ compra: c, fin, pagadas, restantes, saldo: restantes * c.montoCuota, moneda: l ? l.moneda : 'ARS' });
  }
  return out.sort((a, b) => a.fin.localeCompare(b.fin));
}

// Cuánto hay comprometido en cuotas para cada uno de los próximos meses.
export function compromisosFuturos(ctx, meses = 12) {
  const out = [];
  for (let i = 1; i <= meses; i++) {
    const mes = sumarMeses(ctx.mesHoy, i);
    let total = 0;
    for (const c of ctx.hogar.cuotas) {
      const fin = sumarMeses(c.primerMes, c.cantidad - 1);
      if (mes >= c.primerMes && mes <= fin) {
        const l = ctx.lineaPorId.get(c.lineaId);
        total += aPesos(ctx, c.montoCuota, l ? l.moneda : 'ARS', mes);
      }
    }
    for (const d of ctx.hogar.deudas) {
      if (mes >= d.primerMes && mes <= sumarMeses(d.primerMes, d.cuotas - 1)) total += aPesos(ctx, d.cuota, d.moneda, mes);
    }
    out.push({ mes, total });
  }
  return out;
}

// ── Inversiones ─────────────────────────────────────────────────────────────────────
export function valorPlazoFijo(pf, fecha = hoy()) {
  if (!pf || !(pf.capital > 0)) return null;
  const transcurridos = Math.max(0, diasEntre(pf.inicio, fecha));
  const tasaPeriodo = (pf.tna / 100) * (pf.dias / 365);
  if (pf.renovar) {
    const periodos = Math.floor(transcurridos / pf.dias);
    const resto = transcurridos - periodos * pf.dias;
    return Math.round(pf.capital * Math.pow(1 + tasaPeriodo, periodos) * (1 + (pf.tna / 100) * (resto / 365)));
  }
  const dias = Math.min(transcurridos, pf.dias);
  return Math.round(pf.capital * (1 + (pf.tna / 100) * (dias / 365)));
}

export function estadoInversion(ctx, inv, fecha = hoy()) {
  const l = ctx.lineaPorId.get(inv.lineaId);
  let aportado = 0, rescatado = 0, primerMes = null;
  if (l) {
    const meses = new Set();
    for (const m of ctx.hogar.movimientos) if (m.lineaId === l.id) meses.add(m.fecha.slice(0, 7));
    for (const m of Object.keys(ctx.hogar.reales[l.id] || {})) meses.add(m);
    for (const mes of [...meses].sort()) {
      if (mes > ctx.mesHoy) continue;
      const v = valorReal(ctx, l, mes).v || 0;
      if (v > 0) { aportado += v; if (!primerMes) primerMes = mes; }
      else rescatado -= v;
    }
  }
  const neto = aportado - rescatado;
  let valor = null, fuente = 'neto', fechaValor = null;
  if (inv.tipo === 'plazo_fijo' && inv.plazoFijo) {
    const pf = { ...inv.plazoFijo, capital: inv.plazoFijo.capital || neto };
    valor = valorPlazoFijo(pf, fecha);
    if (valor !== null) { fuente = 'plazoFijo'; fechaValor = fecha; }
    if (!primerMes && inv.plazoFijo.inicio) primerMes = inv.plazoFijo.inicio.slice(0, 7);
  }
  if (valor === null) {
    const vals = (inv.valuaciones || []).filter((v) => v.fecha <= fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (vals.length) { valor = vals[vals.length - 1].valor; fuente = 'valuacion'; fechaValor = vals[vals.length - 1].fecha; }
  }
  if (valor === null) valor = neto;
  const base = inv.tipo === 'plazo_fijo' && inv.plazoFijo && inv.plazoFijo.capital ? inv.plazoFijo.capital : neto;
  const rendimiento = valor - base;
  // Rendimiento contra la inflación desde el primer aporte (solo inversiones en pesos).
  let rendimientoReal = null;
  if (inv.moneda === 'ARS' && primerMes && base > 0) {
    const f = ctx.indices.factor(ctx.hogar.region, 'general', primerMes, ctx.mesHoy);
    if (f.tipo !== 'sinDatos') rendimientoReal = valor / (base * f.f) - 1;
  }
  return {
    inversion: inv, aportado, rescatado, neto, valor, fuente, fechaValor,
    rendimiento, rendimientoPct: base > 0 ? rendimiento / base : null, rendimientoReal,
    valorPesos: inv.moneda === 'USD' ? Math.round(valor * cotizacion(ctx, ctx.mesHoy)) : valor
  };
}

// Patrimonio: lo ahorrado en metas, inversiones valuadas y deudas pendientes, en pesos.
export function patrimonio(ctx) {
  let metas = 0, inversiones = 0, deudas = 0, cuotas = 0;
  for (const m of ctx.hogar.metas) metas += aPesos(ctx, saldoMeta(ctx, m), m.moneda, ctx.mesHoy);
  for (const i of ctx.hogar.inversiones) inversiones += estadoInversion(ctx, i).valorPesos;
  for (const d of ctx.hogar.deudas) deudas += estadoDeuda(ctx, d).saldoPesos;
  for (const c of cuotasPendientes(ctx)) cuotas += aPesos(ctx, c.saldo, c.moneda, ctx.mesHoy);
  return { metas, inversiones, deudas, cuotas, neto: metas + inversiones - deudas - cuotas };
}
