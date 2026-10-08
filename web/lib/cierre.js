// Mi Presupuesto · cierre de mes
//
// Cerrar un mes:
//   1. confirma los fijos que se daban por pagados (pasan a ser montos reales cargados)
//   2. decide qué pasa con el resultado:
//        sobrante → a una meta de ahorro (o al fondo), o pasa al mes siguiente
//        faltante → se cubre con una meta de ahorro (retiro), o pasa al mes siguiente
//        o no se hace nada
// Reabrir un mes deshace todo eso.

import { calcularAnio, valorReal, cotizacion } from './calculos.js';
import { fijarReal, nuevoId, linea as buscarLinea } from './modelo.js';
import { anioDe, mesesDelAnio, ultimoDia, nombreMes } from './fechas.js';

export function resumenCierre(ctx, mes) {
  const res = calcularAnio(ctx, anioDe(mes));
  const i = mesesDelAnio(anioDe(mes)).indexOf(mes);
  const supuestos = [];
  for (const l of ctx.hogar.lineas) {
    const r = valorReal(ctx, l, mes);
    if (r.origen === 'supuesto') supuestos.push({ linea: l, monto: r.v });
  }
  const S = res.secciones;
  return {
    mes,
    ingresos: S.ingresos.real[i],
    gastos: S.gastos.real[i] + S.inesperados.real[i] - res.cobertura[i] + S.deudas.real[i],
    ahorro: S.ahorro.real[i] + S.inversiones.real[i],
    cobertura: res.cobertura[i],
    resultado: res.resultado.real[i],
    supuestos,
    cerrado: !!ctx.hogar.cierres[mes]
  };
}

// destino: { tipo: 'meta', metaId } | { tipo: 'siguiente' } | { tipo: 'nada' }
export function cerrarMes(ctx, mes, destino = { tipo: 'nada' }) {
  const h = ctx.hogar;
  const resumen = resumenCierre(ctx, mes);
  const confirmados = [];
  for (const s of resumen.supuestos) {
    fijarReal(h, s.linea.id, mes, s.monto);
    confirmados.push(s.linea.id);
  }
  const cierre = { fecha: new Date().toISOString(), resultado: resumen.resultado, destino, monto: 0, confirmados, ajuste: null };
  const resultado = resumen.resultado;
  if (destino.tipo === 'siguiente') {
    cierre.monto = resultado;
  } else if (destino.tipo === 'meta' && resultado !== 0) {
    const meta = h.metas.find((m) => m.id === destino.metaId);
    const l = meta && buscarLinea(h, meta.lineaId);
    if (l) {
      // El sobrante se suma como aporte a la meta; un faltante se cubre con un retiro.
      const cot = l.moneda === 'USD' ? cotizacion(ctx, mes) : 1;
      const monto = Math.round(resultado / (cot || 1));
      const manual = h.reales[l.id] ? h.reales[l.id][mes] : undefined;
      if (manual !== undefined) {
        fijarReal(h, l.id, mes, manual + monto);
        cierre.ajuste = { lineaId: l.id, monto };
      } else {
        h.movimientos.push({
          id: nuevoId('mv'), fecha: ultimoDia(mes), lineaId: l.id, monto,
          descripcion: resultado > 0 ? `Sobrante de ${nombreMes(mes)}` : `Para cubrir el faltante de ${nombreMes(mes)}`,
          medioId: null, personaId: null, proyectoId: null, origen: 'cierre', importado: null
        });
      }
      cierre.monto = resultado;
    }
  }
  h.cierres[mes] = cierre;
  return cierre;
}

export function reabrirMes(h, mes) {
  const c = h.cierres[mes];
  if (!c) return;
  h.movimientos = h.movimientos.filter((m) => !(m.origen === 'cierre' && m.fecha.slice(0, 7) === mes));
  if (c.ajuste) {
    const actual = h.reales[c.ajuste.lineaId] ? h.reales[c.ajuste.lineaId][mes] : undefined;
    if (actual !== undefined) fijarReal(h, c.ajuste.lineaId, mes, actual - c.ajuste.monto);
  }
  for (const lid of c.confirmados || []) fijarReal(h, lid, mes, null);
  delete h.cierres[mes];
}

