// Mi Presupuesto · ahorro, fondo de emergencia, deudas, cuotas e inversiones

import { estado, mutar, irA } from '../estado.js';
import { h, crudo, montar, icono, dialogo, avisar, leerMonto, pesosRedondos, montoTexto } from '../ui.js';
import { estadoMeta, estadoDeuda, cuotasPendientes, compromisosFuturos, estadoInversion, patrimonio, gastoMensualReferencia } from '../lib/ahorro.js';
import { planActivo, nuevoPlan, fijarPlan, linea as buscarLinea } from '../lib/modelo.js';
import { libroFondo } from '../lib/calculos.js';
import { TIPOS_INVERSION } from '../lib/catalogo.js';
import { nombreMes, capitalizar, mesesDelAnio, anioDe, hoy, formatoFecha, MES_CORTO, numMes, rangoMeses } from '../lib/fechas.js';
import { porcentaje, compacto } from '../lib/dinero.js';
import { dialogoMeta, dialogoDeuda, dialogoInversion, dialogoCompraCuotas, valorMonto } from './dialogos.js';

function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const pat = patrimonio(ctx);
  const fondo = hg.metas.find((m) => m.tipo === 'fondo');
  const metas = hg.metas.filter((m) => m.tipo !== 'fondo');
  const ref = gastoMensualReferencia(ctx);
  const comp = compromisosFuturos(ctx, 12);
  const pendientes = cuotasPendientes(ctx);

  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Ahorro y deudas</h1><div class="subtitulo">Lo que tenés guardado, lo que debés y lo que ya está comprometido.</div></div>
      <span class="espacio"></span>
      <button class="boton" data-accion="nueva-deuda">${icono('mas')}Préstamo</button>
      <button class="boton" data-accion="nueva-inversion">${icono('mas')}Inversión</button>
      <button class="boton primario" data-accion="nueva-meta">${icono('mas')}Meta de ahorro</button></div>

    <div class="kpis" style="margin-bottom:16px">
      <div class="kpi"><div class="kpi-etiqueta">Ahorrado en metas</div><div class="kpi-valor">${pesosRedondos(pat.metas)}</div><div class="kpi-delta">incluye el fondo de emergencia</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Inversiones (valor actual)</div><div class="kpi-valor">${pesosRedondos(pat.inversiones)}</div><div class="kpi-delta">los dólares, a la cotización de hoy</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Deudas y cuotas pendientes</div><div class="kpi-valor">${pesosRedondos(pat.deudas + pat.cuotas)}</div><div class="kpi-delta">préstamos ${pesosRedondos(pat.deudas)} · cuotas ${pesosRedondos(pat.cuotas)}</div></div>
      <div class="kpi"><div class="kpi-etiqueta">Patrimonio neto</div><div class="kpi-valor" style="color:${pat.neto < 0 ? 'var(--critico-texto)' : 'inherit'}">${pesosRedondos(pat.neto)}</div><div class="kpi-delta">lo ahorrado e invertido menos lo que se debe</div></div>
    </div>

    ${fondo ? tarjetaFondo(ctx, fondo, ref) : ''}

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Metas de ahorro</h2></div>
      ${metas.length ? h`<div class="grilla-metas">${metas.map((m) => tarjetaMeta(ctx, m))}</div>` : h`<p class="apagado">Todavía no hay metas. Una meta tiene un monto y una fecha, y sube sola con la inflación para no quedar corta.</p>`}
    </div>

    <div class="dos-columnas" style="margin-top:14px">
      <div class="tarjeta"><div class="tarjeta-titulo"><h2>Préstamos</h2></div>
        ${hg.deudas.length ? h`<table class="tabla"><thead><tr><th>Préstamo</th><th class="der">Cuota</th><th>Pagadas</th><th>Termina</th><th class="der">Falta pagar</th><th></th></tr></thead>
          <tbody>${hg.deudas.map((d) => { const e = estadoDeuda(ctx, d); return h`<tr><td>${d.nombre}${e.terminada ? h` <span class="etiqueta-chip bien">terminado</span>` : ''}</td><td class="der">${montoTexto(d.cuota, d.moneda)}</td><td>${e.pagadas} de ${d.cuotas}</td><td>${capitalizar(nombreMes(e.fin))}</td><td class="der">${montoTexto(e.saldo, d.moneda)}</td>
            <td><button class="acciones-linea" data-accion="editar-deuda" data-id="${d.id}" aria-label="Editar">${icono('editar')}</button></td></tr>`; })}</tbody></table>`
          : h`<p class="apagado">Sin préstamos cargados.</p>`}
      </div>
      <div class="tarjeta"><div class="tarjeta-titulo"><h2>Compras en cuotas</h2></div>
        ${pendientes.length ? h`<table class="tabla"><thead><tr><th>Compra</th><th>Quedan</th><th>Hasta</th><th class="der">Falta pagar</th><th></th></tr></thead>
          <tbody>${pendientes.map((c) => h`<tr><td>${c.compra.descripcion}</td><td>${c.restantes} de ${c.compra.cantidad}</td><td>${capitalizar(nombreMes(c.fin))}</td><td class="der">${montoTexto(c.saldo, c.moneda)}</td>
            <td><button class="acciones-linea" data-accion="editar-cuota" data-id="${c.compra.id}" aria-label="Editar">${icono('editar')}</button></td></tr>`)}</tbody></table>`
          : h`<p class="apagado">No quedan cuotas por pagar. Las compras en cuotas se cargan desde "Cargar gasto".</p>`}
      </div>
    </div>

    ${comp.some((x) => x.total) ? h`<div class="tarjeta" style="margin-top:14px"><div class="tarjeta-titulo"><h2>Ya comprometido en los próximos meses</h2><span class="apagado chico">cuotas de compras y de préstamos</span></div>
      ${graficoCompromisos(comp)}</div>` : ''}

    <div class="tarjeta" style="margin-top:14px"><div class="tarjeta-titulo"><h2>Inversiones</h2></div>
      ${hg.inversiones.length ? h`<table class="tabla"><thead><tr><th>Inversión</th><th>Tipo</th><th class="der">Puesto (neto)</th><th class="der">Valor actual</th><th class="der">Rendimiento</th><th class="der" data-ayuda="Rendimiento descontada la inflación desde el primer aporte (solo en pesos)">Contra la inflación</th><th></th></tr></thead>
        <tbody>${hg.inversiones.map((inv) => {
          const e = estadoInversion(ctx, inv, hoy());
          return h`<tr><td>${inv.nombre}</td><td>${TIPOS_INVERSION[inv.tipo] || inv.tipo}</td><td class="der">${montoTexto(e.neto, inv.moneda)}</td>
            <td class="der">${montoTexto(e.valor, inv.moneda)}<div class="chico apagado">${e.fuente === 'plazoFijo' ? 'calculado con la tasa' : e.fuente === 'valuacion' ? `al ${formatoFecha(e.fechaValor)}` : 'sin valuar'}</div></td>
            <td class="der" style="color:${e.rendimiento < 0 ? 'var(--critico-texto)' : 'inherit'}">${e.rendimientoPct !== null ? porcentaje(e.rendimientoPct, 1) : '—'}</td>
            <td class="der">${e.rendimientoReal !== null ? h`<span style="color:${e.rendimientoReal < 0 ? 'var(--critico-texto)' : 'var(--bien-texto)'}">${e.rendimientoReal < 0 ? '▼' : '▲'} ${porcentaje(e.rendimientoReal, 1)}</span>` : '—'}</td>
            <td class="acciones-tabla">${inv.tipo !== 'plazo_fijo' ? h`<button class="boton chico" data-accion="valuar" data-id="${inv.id}">Cargar valor</button>` : ''}<button class="acciones-linea" data-accion="editar-inversion" data-id="${inv.id}" aria-label="Editar">${icono('editar')}</button></td></tr>`;
        })}</tbody></table>
        <p class="chico apagado" style="margin-top:8px">Lo que ponés o rescatás cada mes se carga en la planilla, en la sección Inversiones.</p>`
        : h`<p class="apagado">Sin inversiones cargadas.</p>`}
    </div>
  </div>`);
  raiz.addEventListener('click', (e) => clic(e));
  raiz.addEventListener('change', (e) => {
    if (e.target.matches('[data-campo="cubrir"]')) mutar((x) => { x.fondo.cubrirInesperados = e.target.checked; });
  });
}

function tarjetaFondo(ctx, fondo, ref) {
  const e = estadoMeta(ctx, fondo);
  const libro = libroFondo(ctx, ctx.mesHoy);
  const anio = anioDe(ctx.mesHoy);
  let cubierto = 0;
  for (const [mes, x] of libro) if (anioDe(mes) === anio) cubierto += x.cobertura;
  const mesesCubiertos = ref.monto > 0 ? e.saldo / ref.monto : 0;
  return h`<div class="tarjeta">
    <div class="tarjeta-titulo"><h2>Fondo de emergencia</h2><button class="boton chico" data-accion="editar-meta" data-id="${fondo.id}">${icono('editar')}Editar</button></div>
    <div class="fondo">
      <div><div class="valor-grande">${pesosRedondos(e.saldo)}</div><div class="apagado">de ${pesosRedondos(e.objetivoFinal)} (${fondo.mesesCobertura} meses de gastos de ${pesosRedondos(ref.monto)})</div>
        <div class="barra-progreso" style="margin-top:10px;height:10px"><span style="width:${Math.round(e.avance * 100)}%"></span></div></div>
      <div class="fondo-datos">
        <div><span>Cubre</span><strong>${mesesCubiertos.toFixed(1).replace('.', ',')} meses</strong></div>
        <div><span>Imprevistos pagados en ${anio}</span><strong>${pesosRedondos(cubierto)}</strong></div>
        <div><span>Falta</span><strong>${pesosRedondos(e.faltante)}</strong></div>
      </div>
    </div>
    <label class="casilla" style="margin-top:12px"><span class="interruptor"><input type="checkbox" data-campo="cubrir" ${estado.hogar.fondo.cubrirInesperados ? crudo('checked') : ''}><span></span></span> Pagar los gastos inesperados con el fondo (mientras tenga plata)</label>
    <p class="chico apagado" style="margin-top:6px">El gasto mensual de referencia es el promedio ${ref.fuente === 'real' ? `real de ${ref.meses.map((m) => nombreMes(m, { conAnio: false })).join(', ')}` : 'planeado para este mes'} (gastos y cuotas de préstamos).</p>
  </div>`;
}

function tarjetaMeta(ctx, m) {
  const e = estadoMeta(ctx, m);
  const plan = planActivo(estado.hogar, anioDe(ctx.mesHoy));
  const aporte = plan && plan.montos[m.lineaId] ? plan.montos[m.lineaId][ctx.mesHoy] || 0 : 0;
  const falta = e.aporteSugerido && aporte < e.aporteSugerido;
  return h`<div class="meta">
    <div class="meta-cab"><strong>${m.nombre}</strong>${e.alcanzada ? h`<span class="etiqueta-chip bien">${icono('ok')}lograda</span>` : e.vencida ? h`<span class="etiqueta-chip alerta">vencida</span>` : ''}
      <button class="acciones-linea" data-accion="editar-meta" data-id="${m.id}" aria-label="Editar">${icono('editar')}</button></div>
    <div class="meta-valores"><span class="valor-grande">${montoTexto(Math.round(e.saldo / 100) * 100, m.moneda)}</span><span class="apagado">de ${montoTexto(Math.round(e.objetivoFinal / 100) * 100, m.moneda)}</span></div>
    <div class="barra-progreso"><span style="width:${Math.round(e.avance * 100)}%;background:var(--fam-ahorro)"></span></div>
    <div class="meta-pie chico apagado">
      ${m.fecha ? h`<span>${icono('calendario')} ${capitalizar(nombreMes(m.fecha))} · faltan ${e.mesesRestantes} ${e.mesesRestantes === 1 ? 'mes' : 'meses'}</span>` : h`<span>Sin fecha</span>`}
      ${m.ajustaIPC && m.moneda === 'ARS' ? h`<span data-ayuda="${`Pediste ${pesosRedondos(m.objetivo)} en pesos de ${nombreMes(m.objetivoMes)}; hoy equivale a ${pesosRedondos(e.objetivoHoy)}${m.fecha ? ` y para ${nombreMes(m.fecha)} se estima ${pesosRedondos(e.objetivoFinal)}` : ''}.`}">${icono('ipc')} ajustada por IPC</span>` : ''}
    </div>
    ${e.aporteSugerido && !e.alcanzada ? h`<div class="nota ${falta ? 'aviso' : ''}" style="margin-top:8px">Para llegar: <strong>${montoTexto(e.aporteSugerido, m.moneda)}</strong> por mes. Planeado este mes: ${montoTexto(aporte, m.moneda)}.
      ${falta ? h`<div style="margin-top:6px"><button class="boton chico" data-accion="usar-sugerido" data-id="${m.id}">Planear ${montoTexto(e.aporteSugerido, m.moneda)} por mes</button></div>` : ''}</div>` : ''}
  </div>`;
}

function graficoCompromisos(comp) {
  const max = Math.max(...comp.map((x) => x.total), 1);
  const ancho = 60, alto = 120, x0 = 8;
  const barras = comp.map((x, i) => {
    const hgt = Math.round((x.total / max) * (alto - 24));
    const xx = x0 + i * ancho + 18;
    return h`<g><title>${capitalizar(nombreMes(x.mes))}: ${pesosRedondos(x.total)}</title>
      <path d="M${xx} ${alto - 18} v${-Math.max(0, hgt - 4)} q0 -4 4 -4 h16 q4 0 4 4 v${Math.max(0, hgt - 4)} z" fill="var(--serie-1)" opacity="${x.total ? 1 : 0}"/>
      <text x="${xx + 12}" y="${alto - 4}" text-anchor="middle" class="eje-texto">${MES_CORTO[numMes(x.mes) - 1]}</text>
      ${i === 0 || x.total === max ? h`<text x="${xx + 12}" y="${alto - 22 - hgt}" text-anchor="middle" class="valor-texto">${compacto(x.total)}</text>` : ''}</g>`;
  });
  return h`<svg class="grafico-compromisos" viewBox="0 0 ${x0 * 2 + comp.length * ancho} ${alto}" role="img" aria-label="Cuotas comprometidas por mes">
    <line x1="0" x2="${x0 * 2 + comp.length * ancho}" y1="${alto - 18}" y2="${alto - 18}" stroke="var(--eje)"/>${barras}</svg>
    <table class="sr"><tbody>${comp.map((x) => h`<tr><td>${nombreMes(x.mes)}</td><td>${pesosRedondos(x.total)}</td></tr>`)}</tbody></table>`;
}

async function clic(e) {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const hg = estado.hogar;
  const id = b.dataset.id;
  switch (b.dataset.accion) {
    case 'nueva-meta': dialogoMeta({}); break;
    case 'nueva-deuda': dialogoDeuda({}); break;
    case 'nueva-inversion': dialogoInversion({}); break;
    case 'editar-meta': dialogoMeta({ meta: hg.metas.find((m) => m.id === id) }); break;
    case 'editar-deuda': dialogoDeuda({ deuda: hg.deudas.find((d) => d.id === id) }); break;
    case 'editar-inversion': dialogoInversion({ inversion: hg.inversiones.find((i) => i.id === id) }); break;
    case 'editar-cuota': dialogoCompraCuotas({ compra: hg.cuotas.find((c) => c.id === id) }); break;
    case 'usar-sugerido': {
      const m = hg.metas.find((x) => x.id === id);
      const e = estadoMeta(estado.ctx, m);
      const mesHoy = estado.ctx.mesHoy;
      const hasta = m.fecha || `${anioDe(mesHoy)}-12`;
      mutar((x) => {
        for (const mes of rangoMeses(mesHoy, hasta)) {
          const anio = anioDe(mes);
          const plan = planActivo(x, anio) || nuevoPlan(x, anio);
          fijarPlan(plan, m.lineaId, mes, e.aporteSugerido);
        }
      });
      avisar(`Se planearon ${montoTexto(e.aporteSugerido, m.moneda)} por mes para "${m.nombre}".`, { tipo: 'ok' });
      break;
    }
    case 'valuar': {
      const inv = hg.inversiones.find((i) => i.id === id);
      const r = await dialogo({
        titulo: `Valor de "${inv.nombre}"`,
        cuerpo: h`<div class="fila-campos"><div class="campo"><label>Fecha</label><input class="entrada" type="date" name="fecha" value="${hoy()}"></div>
          <div class="campo"><label>Valor total ${inv.moneda === 'USD' ? '(en dólares)' : ''}</label><input class="entrada monto" name="valor" autofocus></div></div>
          ${inv.valuaciones.length ? h`<p class="chico apagado">Últimos valores: ${inv.valuaciones.slice(-4).reverse().map((v) => `${formatoFecha(v.fecha)}: ${montoTexto(v.valor, inv.moneda)}`).join(' · ')}</p>` : ''}`,
        botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Guardar', valor: 'ok', tipo: 'primario' }],
        validar: (d) => (!(leerMonto(d.valor) >= 0) ? 'Escribí el valor.' : null)
      });
      if (r.boton === 'ok') mutar((x) => { const i = x.inversiones.find((y) => y.id === id); i.valuaciones.push({ fecha: r.datos.fecha, valor: leerMonto(r.datos.valor) }); i.valuaciones.sort((a, b) => a.fecha.localeCompare(b.fecha)); });
      break;
    }
    default: break;
  }
}

export default { titulo: 'Ahorro y deudas', icono: 'ahorro', render };
