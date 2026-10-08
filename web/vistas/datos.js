// Mi Presupuesto · datos públicos: IPC, proyección, dólar y canasta básica

import { estado, mutar, notificar, recalcular, guardarAjustes } from '../estado.js';
import { h, crudo, montar, icono, opciones, avisar, pesosRedondos, leerMonto } from '../ui.js';
import { INDICES, INDICE_GENERAL, REGIONES, COTIZACIONES, nombreRegion } from '../lib/catalogo.js';
import { TEXTO_TIPO } from '../lib/indices.js';
import { nombreMes, capitalizar, sumarMeses, rangoMeses, mesesEntre } from '../lib/fechas.js';

const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x.toFixed(d).replace('.', ',').replace('-', '−')} %`);
const fechaLarga = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }); };

function render(raiz) {
  const ctx = estado.ctx;
  const ind = ctx.indices;
  const datos = estado.datos || {};
  const hg = estado.hogar;
  const region = estado.ui.regionDatos || hg.region;
  const hasta = ind.hasta;
  const mesesTabla = rangoMeses(sumarMeses(hasta, -5), sumarMeses(hasta, 3));
  const sinPublicar = hasta < ctx.mesHoy ? rangoMeses(sumarMeses(hasta, 1), ctx.mesHoy) : [];
  const manual = estado.ajustes.ipcManual || {};
  const proy = estado.ajustes.proyeccion || { modo: 'rem' };
  const rem = datos.rem;
  const dolar = datos.dolar || {};
  const fuentes = datos.fuentes || {};
  const ultCanasta = ind.ultimaCanasta;
  const mesesDolar = rangoMeses(sumarMeses(ctx.mesHoy, -11), ctx.mesHoy).reverse();

  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Datos públicos</h1><div class="subtitulo">El IPC, la inflación esperada, el dólar y la canasta básica que usa el programa.</div></div>
      <span class="espacio"></span><button class="boton" data-accion="buscar">${icono('refrescar')}Buscar datos nuevos</button></div>
    <div class="nota" style="margin-bottom:14px">${icono('info')}Datos ${estado.origenDatos && estado.origenDatos.origen === 'descargado' ? 'bajados del proyecto' : 'que vinieron con el programa'}, armados el ${fechaLarga(datos.generado)}. IPC publicado hasta <strong>${nombreMes(hasta)}</strong>.
      ${Object.entries(fuentes).filter(([, f]) => f.error).map(([k, f]) => h`<div style="margin-top:4px">${icono('alerta')}${k}: la última actualización falló (${f.error}); se usan los datos anteriores.</div>`)}</div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Inflación mensual por categoría</h2>
        <select class="entrada" data-region style="width:auto">${opciones(REGIONES.map((r) => [r.clave, r.nombre]), region)}</select></div>
      <div style="overflow-x:auto"><table class="tabla tabla-ipc"><thead><tr><th>Categoría</th>${mesesTabla.map((m) => h`<th class="der ${m > hasta ? 'proyectado' : ''}">${capitalizar(nombreMes(m, { corto: true }))}</th>`)}<th class="der">Interanual</th></tr></thead>
        <tbody>${[INDICE_GENERAL, ...INDICES].map((i) => h`<tr class="${i.clave === 'general' ? 'fila-general' : ''}"><td>${i.nombre}</td>
          ${mesesTabla.map((m) => { const v = ind.variacionMensual(region, i.clave, m); return h`<td class="der ${v && v.tipo !== 'oficial' ? 'proyectado' : ''}" data-ayuda="${v ? TEXTO_TIPO[v.tipo] : ''}">${v ? pct(v.v) : '—'}</td>`; })}
          <td class="der">${(() => { const v = ind.variacionInteranual(region, i.clave, hasta); return v ? pct(v.v) : '—'; })()}</td></tr>`)}</tbody></table></div>
      <p class="chico apagado" style="margin-top:8px">En cursiva, los meses que todavía no publicó el INDEC (cargados a mano o proyectados). Fuente: INDEC, IPC base diciembre 2016, vía datos.gob.ar.</p>
    </div>

    <div class="dos-columnas" style="margin-top:14px">
      <div class="tarjeta"><div class="tarjeta-titulo"><h2>Meses sin publicar</h2></div>
        ${sinPublicar.length ? h`<p class="apagado chico">Si ya conocés la inflación de estos meses (por ejemplo, el dato que salió en las noticias), cargala: se usa para todas las categorías hasta que el INDEC la publique.</p>
          <table class="tabla">${sinPublicar.map((m) => h`<tr><td>${capitalizar(nombreMes(m))}</td><td><input class="entrada en-tabla monto" style="width:90px" data-manual="${m}" value="${Number.isFinite(manual[m]) ? String(manual[m]).replace('.', ',') : ''}" placeholder="${pct(ind.tasa(m).tasa)}"> %</td>
            <td class="chico apagado">${Number.isFinite(manual[m]) ? 'cargado a mano' : `proyectado (${ind.tasa(m).fuente === 'promedio' ? 'promedio' : ind.tasa(m).fuente === 'usuario' ? 'tasa propia' : 'REM'})`}</td></tr>`)}</table>`
          : h`<p class="apagado">El IPC está al día: no hay meses sin publicar.</p>`}
      </div>
      <div class="tarjeta"><div class="tarjeta-titulo"><h2>Inflación de los meses que vienen</h2></div>
        <label class="casilla"><input type="radio" name="proy" value="rem" ${proy.modo === 'rem' ? crudo('checked') : ''}> Lo que esperan los analistas (REM del Banco Central)</label>
        ${rem ? h`<div class="chico apagado" style="margin:4px 0 8px 24px">Relevamiento de ${nombreMes(rem.relevamiento)}: ${rem.mensual.slice(0, 4).map((x) => `${nombreMes(x.mes, { conAnio: false, corto: true })} ${pct(x.v)}`).join(' · ')}${Number.isFinite(rem.prox12) ? ` · próximos 12 meses ${pct(rem.prox12)}` : ''}</div>` : ''}
        <label class="casilla"><input type="radio" name="proy" value="usuario" ${proy.modo === 'usuario' ? crudo('checked') : ''}> Una tasa propia: <input class="entrada monto" style="width:80px;height:28px;margin:0 4px" data-tasa value="${Number.isFinite(proy.tasa) ? String(proy.tasa).replace('.', ',') : ''}" placeholder="2"> % por mes</label>
        <label class="casilla" style="margin-top:6px"><input type="radio" name="proy" value="promedio" ${proy.modo === 'promedio' ? crudo('checked') : ''}> El promedio de los últimos 3 meses publicados</label>
        <p class="chico apagado" style="margin-top:10px">Se usa para proyectar presupuestos a otro año y para que las metas de ahorro suban con la inflación. Es la misma para todas las categorías.</p>
      </div>
    </div>

    <div class="tarjeta" style="margin-top:14px"><div class="tarjeta-titulo"><h2>Dólar</h2>
      <label class="chico">Este hogar usa <select class="entrada" data-cotizacion style="width:auto;height:28px">${opciones(Object.entries(COTIZACIONES), hg.dolar)}</select></label></div>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">${['oficial', 'mayorista', 'mep', 'blue'].map((k) => {
        const d = dolar[k];
        return h`<div class="kpi ${hg.dolar === k ? 'kpi-elegido' : ''}"><div class="kpi-etiqueta">${COTIZACIONES[k]}</div><div class="kpi-valor">${d && d.ultimo ? `$ ${String(d.ultimo.venta).replace('.', ',')}` : '—'}</div><div class="kpi-delta">${d && d.ultimo ? `venta · ${d.ultimo.fecha.split('-').reverse().join('/')}` : 'sin datos'}</div></div>`;
      })}</div>
      <details><summary>Promedio de cada mes y carga a mano</summary>
        <table class="tabla" style="margin-top:8px"><thead><tr><th>Mes</th><th class="der">${COTIZACIONES[hg.dolar === 'manual' ? 'oficial' : hg.dolar]}</th><th>A mano (pesos por dólar)</th></tr></thead>
          <tbody>${mesesDolar.map((m) => { const v = ind.dolar(hg.dolar === 'manual' ? 'oficial' : hg.dolar, m, {}); return h`<tr><td>${capitalizar(nombreMes(m))}</td><td class="der">${v.v ? `$ ${v.v.toFixed(2).replace('.', ',')}` : '—'}</td>
            <td><input class="entrada en-tabla monto" style="width:120px" data-dolar-manual="${m}" value="${Number.isFinite(hg.dolarManual[m]) ? String(hg.dolarManual[m]).replace('.', ',') : ''}" placeholder="—"></td></tr>`; })}</tbody></table></details>
      <p class="chico apagado" style="margin-top:8px">Oficial, MEP y blue: ArgentinaDatos y DolarApi (recopilan las cotizaciones publicadas). Mayorista: Banco Central. Lo cargado a mano para un mes manda sobre lo bajado.</p>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Canasta básica por adulto equivalente</h2><span class="apagado chico">${nombreRegion(hg.region)}</span></div>
      ${ultCanasta ? h`<table class="tabla"><thead><tr><th>Mes</th><th class="der">Alimentaria (CBA)</th><th class="der">Total (CBT)</th><th></th></tr></thead>
        <tbody>${rangoMeses(sumarMeses(ultCanasta, -4), sumarMeses(ultCanasta, Math.max(0, mesesEntre(ultCanasta, ctx.mesHoy)))).reverse().map((m) => { const c = ind.canasta(hg.region, m); return h`<tr><td>${capitalizar(nombreMes(m))}</td><td class="der">${c.cba ? pesosRedondos(Math.round(c.cba * 100)) : '—'}</td><td class="der">${c.cbt ? pesosRedondos(Math.round(c.cbt * 100)) : '—'}</td><td class="chico apagado">${TEXTO_TIPO[c.tipo]}</td></tr>`; })}</tbody></table>` : h`<p class="apagado">Sin datos.</p>`}
      <p class="chico apagado" style="margin-top:8px">Fuente: INDEC (vía datos.gob.ar). GBA se publica todos los meses; las demás regiones con atraso, por eso los meses recientes se estiman con la relación con GBA.</p>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Fuentes</h2></div>
      <ul class="lista-fuentes">
        <li><button class="enlace" data-ir="https://datos.gob.ar/dataset/sspm-indice-precios-al-consumidor-nacional-ipc-base-diciembre-2016">IPC del INDEC en datos.gob.ar</button></li>
        <li><button class="enlace" data-ir="https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-43-149">Canasta básica alimentaria y total (INDEC)</button></li>
        <li><button class="enlace" data-ir="https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-45-155">Encuesta Nacional de Gastos de los Hogares 2017-2018 (INDEC)</button></li>
        <li><button class="enlace" data-ir="https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/">Relevamiento de Expectativas de Mercado (BCRA)</button></li>
        <li><button class="enlace" data-ir="https://argentinadatos.com">ArgentinaDatos</button> y <button class="enlace" data-ir="https://dolarapi.com">DolarApi</button></li>
      </ul>
    </div>
  </div>`);

  raiz.addEventListener('change', (e) => cambio(e));
  raiz.addEventListener('click', async (e) => {
    const ir = e.target.closest('[data-ir]');
    if (ir) { window.mp.app.externo(ir.dataset.ir); return; }
    const b = e.target.closest('[data-accion="buscar"]');
    if (!b) return;
    b.disabled = true;
    const r = await window.mp.datos.actualizar();
    if (r.estado === 'nuevos') {
      const d = await window.mp.datos.obtener();
      estado.datos = d.datos; estado.engho = d.engho; estado.origenDatos = { origen: d.origen, generado: d.generado };
      recalcular(); notificar('datos');
      avisar('Datos actualizados.', { tipo: 'ok' });
    } else if (r.estado === 'iguales') { avisar('Ya tenés los datos más nuevos.'); b.disabled = false; }
    else { avisar(`No se pudo buscar: ${r.error}`, { tipo: 'error' }); b.disabled = false; }
  });
}

async function cambio(e) {
  const t = e.target;
  if (t.matches('[data-region]')) { estado.ui.regionDatos = t.value; notificar('vista'); return; }
  if (t.matches('[data-cotizacion]')) { mutar((x) => { x.dolar = t.value; }); return; }
  if (t.dataset.manual) {
    const v = t.value.trim() === '' ? null : Number(t.value.replace(',', '.').replace('%', ''));
    if (v !== null && !Number.isFinite(v)) { avisar('Escribí un porcentaje, por ejemplo 2,1.', { tipo: 'error' }); return; }
    const manual = { ...(estado.ajustes.ipcManual || {}) };
    if (v === null) delete manual[t.dataset.manual]; else manual[t.dataset.manual] = v;
    await guardarAjustes({ ipcManual: manual });
    recalcular(); notificar('datos');
    return;
  }
  if (t.name === 'proy' || t.matches('[data-tasa]')) {
    const modo = document.querySelector('[name=proy]:checked').value;
    const tasaTxt = document.querySelector('[data-tasa]').value.trim();
    const tasa = tasaTxt ? Number(tasaTxt.replace(',', '.')) : null;
    if (modo === 'usuario' && !Number.isFinite(tasa)) { if (t.name === 'proy') avisar('Escribí la tasa mensual que querés usar.'); return; }
    await guardarAjustes({ proyeccion: { modo, tasa } });
    recalcular(); notificar('datos');
    return;
  }
  if (t.dataset.dolarManual) {
    const v = t.value.trim() === '' ? null : (leerMonto(t.value) || 0) / 100;
    if (v !== null && !(v > 0)) { avisar('Escribí la cotización en pesos por dólar.', { tipo: 'error' }); return; }
    mutar((x) => { if (v === null) delete x.dolarManual[t.dataset.dolarManual]; else x.dolarManual[t.dataset.dolarManual] = v; });
  }
}

export default { titulo: 'Datos públicos', icono: 'datos', render };
