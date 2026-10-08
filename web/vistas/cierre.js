// Mi Presupuesto · diálogo para cerrar un mes

import { estado, mutar } from '../estado.js';
import { h, crudo, dialogo, opciones, montoTexto, avisar, pesosRedondos as pesos } from '../ui.js';
import { resumenCierre, cerrarMes } from '../lib/cierre.js';
import { estadoMeta } from '../lib/ahorro.js';
import { nombreMes, capitalizar, sumarMeses } from '../lib/fechas.js';

export async function abrirCierre(mes) {
  const ctx = estado.ctx;
  const r = resumenCierre(ctx, mes);
  if (r.cerrado) { avisar('Ese mes ya está cerrado.'); return; }
  const metas = estado.hogar.metas;
  const fondo = metas.find((m) => m.tipo === 'fondo');
  const sobra = r.resultado > 0;
  const metaSugerida = (() => {
    if (!sobra) return metas.find((m) => m.tipo !== 'fondo') || fondo;
    if (fondo && estadoMeta(ctx, fondo).avance < 1) return fondo;
    return metas.find((m) => m.tipo !== 'fondo' && !estadoMeta(ctx, m).alcanzada) || fondo;
  })();
  const siguiente = nombreMes(sumarMeses(mes, 1), { conAnio: false });
  const resp = await dialogo({
    titulo: `Cerrar ${nombreMes(mes)}`,
    ancho: 'ancho',
    cuerpo: h`
      <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
        <div class="kpi"><div class="kpi-etiqueta">Ingresos</div><div class="kpi-valor">${pesos(r.ingresos)}</div></div>
        <div class="kpi"><div class="kpi-etiqueta">Gastos y cuotas</div><div class="kpi-valor">${pesos(r.gastos)}</div>${r.cobertura ? h`<div class="kpi-delta">${pesos(r.cobertura)} de imprevistos pagados con el fondo</div>` : ''}</div>
        <div class="kpi"><div class="kpi-etiqueta">Ahorro e inversiones</div><div class="kpi-valor">${pesos(r.ahorro)}</div></div>
        <div class="kpi"><div class="kpi-etiqueta">${sobra ? 'Sobró' : r.resultado < 0 ? 'Faltó' : 'Resultado'}</div><div class="kpi-valor" style="color:${r.resultado < 0 ? 'var(--critico-texto)' : 'inherit'}">${pesos(Math.abs(r.resultado))}</div></div>
      </div>
      ${r.supuestos.length ? h`<div class="campo"><div class="etiqueta">Fijos que se daban por pagados (quedan confirmados así)</div>
        <div class="nota" style="max-height:150px;overflow:auto">${r.supuestos.map((s) => h`<div style="display:flex;justify-content:space-between;gap:12px"><span>${s.linea.nombre}</span><span class="num">${montoTexto(s.monto, s.linea.moneda)}</span></div>`)}</div>
        <div class="ayuda">Si alguno fue distinto, cancelá, cambialo en la planilla (modo Real) y volvé a cerrar.</div></div>` : ''}
      ${r.resultado !== 0 ? h`<div class="campo"><div class="etiqueta">${sobra ? '¿Qué hacemos con lo que sobró?' : '¿Cómo se cubre lo que faltó?'}</div>
        ${metas.length ? h`<label class="casilla"><input type="radio" name="destino" value="meta" ${crudo('checked')}> ${sobra ? 'Sumarlo a' : 'Sacarlo de'}
          <select class="entrada" name="metaId" style="margin-left:6px">${opciones(metas.map((m) => [m.id, m.nombre]), metaSugerida && metaSugerida.id)}</select></label>` : ''}
        <label class="casilla" style="margin-top:8px"><input type="radio" name="destino" value="siguiente" ${metas.length ? '' : crudo('checked')}> ${sobra ? `Pasarlo a ${siguiente} como ingreso` : `Pasarlo a ${siguiente} (empieza con ese faltante)`}</label>
        <label class="casilla" style="margin-top:8px"><input type="radio" name="destino" value="nada"> No hacer nada por ahora</label>
      </div>` : ''}
      <p class="chico apagado">Cerrar el mes no bloquea nada: después podés reabrirlo desde la planilla.</p>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Cerrar el mes', valor: 'ok', tipo: 'primario' }]
  });
  if (resp.boton !== 'ok') return;
  const d = resp.datos;
  const destino = r.resultado === 0 || !d.destino ? { tipo: 'nada' } : d.destino === 'meta' ? { tipo: 'meta', metaId: d.metaId } : { tipo: d.destino };
  mutar(() => cerrarMes(estado.ctx, mes, destino));
  avisar(`${capitalizar(nombreMes(mes))} cerrado.`, { tipo: 'ok' });
}
