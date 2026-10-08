// Mi Presupuesto · series para los gráficos (evolución, torta, plan contra real, inflación)

import { totalesPeriodo, calcularAnio, mesConDatos } from './calculos.js';
import { ingresosDelMes } from './familia.js';
import { rangoMeses } from './fechas.js';

// Evolución mes a mes de un año: ingresos, gastos (con inesperados netos y cuotas de
// deudas), ahorro e inversiones, y resultado.
export function evolucionAnual(ctx, anio, fuente = 'real') {
  const res = calcularAnio(ctx, anio);
  const S = res.secciones;
  return res.meses.map((mes, i) => {
    const cob = fuente === 'real' ? res.cobertura[i] : 0;
    const futuro = fuente === 'real' && mes > ctx.mesHoy;
    return {
      mes, futuro,
      ingresos: S.ingresos[fuente][i],
      gastos: S.gastos[fuente][i] + S.inesperados[fuente][i] - cob + S.deudas[fuente][i],
      ahorro: S.ahorro[fuente][i] + S.inversiones[fuente][i],
      resultado: res.resultado[fuente][i]
    };
  });
}

// Gasto por categoría en un período (para la torta), de mayor a menor.
export function gastoPorCategoria(ctx, meses, fuente = 'real') {
  const t = totalesPeriodo(ctx, meses, fuente);
  const out = [];
  for (const c of ctx.hogar.categorias) {
    if (c.seccion !== 'gastos' && c.seccion !== 'inesperados') continue;
    const v = t.porCategoria.get(c.id) || 0;
    if (v > 0) out.push({ categoria: c, monto: v });
  }
  return out.sort((a, b) => b.monto - a.monto);
}

export function planContraReal(ctx, meses) {
  const p = totalesPeriodo(ctx, meses, 'plan');
  const r = totalesPeriodo(ctx, meses, 'real');
  const out = [];
  for (const c of ctx.hogar.categorias) {
    if (c.seccion !== 'gastos' && c.seccion !== 'inesperados') continue;
    const plan = p.porCategoria.get(c.id) || 0;
    const real = r.porCategoria.get(c.id) || 0;
    if (plan || real) out.push({ categoria: c, plan, real, diferencia: real - plan });
  }
  return out.sort((a, b) => Math.max(b.plan, b.real) - Math.max(a.plan, a.real));
}

// Gastos e ingresos contra la inflación: índices base 100 en el primer mes con datos, y
// el ingreso en pesos del último mes (ingreso real).
export function contraInflacion(ctx, desde, hasta) {
  const meses = rangoMeses(desde, hasta).filter((m) => m <= ctx.mesHoy && mesConDatos(ctx, m));
  if (meses.length < 2) return { puntos: [], meses };
  const region = ctx.hogar.region;
  const base = meses[0], fin = meses[meses.length - 1];
  const puntos = meses.map((mes) => {
    const t = totalesPeriodo(ctx, [mes], 'real');
    const gasto = t.porSeccion.gastos + t.porSeccion.inesperados - t.cobertura;
    const ingreso = ingresosDelMes(ctx, mes, 'real');
    const ipc = ctx.indices.factor(region, 'general', base, mes);
    const aHoy = ctx.indices.factor(region, 'general', mes, fin);
    return { mes, gasto, ingreso, ipc: ipc.f * 100, tipoIpc: ipc.tipo, ingresoReal: Math.round(ingreso * aHoy.f), gastoReal: Math.round(gasto * aHoy.f) };
  });
  const g0 = puntos[0].gasto || 1, i0 = puntos[0].ingreso || 1;
  for (const p of puntos) { p.gastoIdx = (p.gasto / g0) * 100; p.ingresoIdx = (p.ingreso / i0) * 100; }
  const ult = puntos[puntos.length - 1];
  return {
    meses, puntos,
    ipcAcumulado: ult.ipc / 100 - 1,
    ingresoAcumulado: puntos[0].ingreso ? ult.ingreso / puntos[0].ingreso - 1 : null,
    gastoAcumulado: puntos[0].gasto ? ult.gasto / puntos[0].gasto - 1 : null,
    // Si el ingreso creció más o menos que los precios en el período.
    ingresoContraIpc: puntos[0].ingreso ? (ult.ingreso / puntos[0].ingreso) / (ult.ipc / 100) - 1 : null
  };
}
