// Mi Presupuesto · familia, canasta básica, hogares parecidos y costo por integrante

import { estado, mutar, notificar } from '../estado.js';
import { h, montar, icono, opciones, avisar, confirmar, pesosRedondos } from '../ui.js';
import { REGIONES, COMPOSICIONES, nombreIndice, nombreRegion } from '../lib/catalogo.js';
import { aeIntegrante, aeHogar, composicion, canastaHogar, situacion, ingresosDelMes, referenciaParecidos, gastoPorIndice, costoPorIntegrante, tenencia } from '../lib/familia.js';
import { periodoAnalisis } from '../lib/analisis.js';
import { mesConDatos } from '../lib/calculos.js';
import { nombreMes, capitalizar, sumarMeses } from '../lib/fechas.js';
import { porcentaje } from '../lib/dinero.js';
import { TEXTO_TIPO } from '../lib/indices.js';
import { FAMILIA_DE_INDICE, colorFamilia } from '../graficos/colores.js';

const dec = (x, d = 2) => x.toFixed(d).replace('.', ',');

function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const comp = composicion(hg);
  const per = periodoAnalisis(ctx);
  const mesCanasta = estado.ui.mesCanasta || (mesConDatos(ctx, sumarMeses(ctx.mesHoy, -1)) ? sumarMeses(ctx.mesHoy, -1) : ctx.mesHoy);
  const fuenteCanasta = mesCanasta < ctx.mesHoy && mesConDatos(ctx, mesCanasta) ? 'real' : 'plan';
  const ingresos = ingresosDelMes(ctx, mesCanasta, fuenteCanasta);
  const sit = situacion(ctx, mesCanasta, ingresos);
  const ingresoRef = Math.round(per.meses.reduce((s, m) => s + ingresosDelMes(ctx, m, per.fuente), 0) / per.meses.length);
  const ref = referenciaParecidos(ctx, estado.engho, per.meses[per.meses.length - 1], ingresoRef);
  const gi = gastoPorIndice(ctx, per.meses, per.fuente);
  const costos = costoPorIntegrante(ctx, per.meses, per.fuente);
  const n = per.meses.length;
  const mesesCanasta = Array.from({ length: 24 }, (_, i) => sumarMeses(ctx.mesHoy, -i));

  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Familia</h1><div class="subtitulo">${comp.nombre}${comp.preset && comp.preset.nota ? ` (${comp.preset.nota})` : ''} · ${dec(aeHogar(hg))} adultos equivalentes · ${nombreRegion(hg.region)}</div></div></div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Quiénes viven</h2></div>
      <div class="atajos" style="margin-bottom:12px">${COMPOSICIONES.map((c) => h`<button class="boton chico ${comp.adultos === c.adultos && comp.menores === c.menores ? 'primario' : ''}" data-comp="${c.clave}">${c.nombre}</button>`)}</div>
      <table class="tabla"><thead><tr><th>Nombre</th><th>Edad</th><th>Sexo</th><th></th><th class="der" data-ayuda="Unidades de adulto equivalente del INDEC: cuánto necesita esa persona comparada con un varón adulto">Adulto equivalente</th><th></th></tr></thead>
        <tbody>${hg.integrantes.map((p) => h`<tr data-persona="${p.id}">
          <td><input class="entrada en-tabla" data-campo="nombre" value="${p.nombre}"></td>
          <td><input class="entrada en-tabla" style="width:70px" type="number" min="0" max="110" data-campo="edad" value="${p.edad ?? ''}" placeholder="—"></td>
          <td><select class="entrada en-tabla" data-campo="sexo">${opciones([['', '—'], ['m', 'Mujer'], ['v', 'Varón']], p.sexo || '')}</select></td>
          <td><select class="entrada en-tabla" data-campo="tipo">${opciones([['adulto', 'Adulto'], ['menor', 'Menor de 18']], p.tipo)}</select></td>
          <td class="der">${dec(aeIntegrante(p))}${p.edad === null || !p.sexo ? h` <span class="apagado chico" data-ayuda="Falta la edad o el sexo: se usa un promedio">≈</span>` : ''}</td>
          <td><button class="acciones-linea" data-accion="quitar" data-id="${p.id}" aria-label="Quitar">${icono('cerrar')}</button></td></tr>`)}</tbody></table>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <button class="boton chico" data-accion="agregar">${icono('mas')}Agregar a alguien</button>
        <span class="espacio" style="flex:1"></span>
        <label class="chico">Región <select class="entrada" data-hogar="region" style="width:auto;height:28px">${opciones(REGIONES.map((r) => [r.clave, r.nombre]), hg.region)}</select></label>
        <label class="chico">Vivienda <select class="entrada" data-hogar="vivienda" style="width:auto;height:28px">${opciones([['', `Sin indicar (${tenencia(ctx) === 'i' ? 'parece alquilada' : 'parece propia'})`], ['alquilada', 'Alquilada'], ['propia', 'Propia'], ['otra', 'Otra']], hg.vivienda || '')}</select></label>
      </div>
    </div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Canasta básica del hogar</h2>
        <select class="entrada" data-mes-canasta style="width:auto">${opciones(mesesCanasta.map((m) => [m, capitalizar(nombreMes(m))]), mesCanasta)}</select></div>
      ${sit ? canasta(ctx, sit, mesCanasta, fuenteCanasta) : h`<p class="apagado">Sin datos de canasta básica para ese mes.</p>`}
    </div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Comparado con hogares parecidos</h2><span class="apagado chico">${per.descripcion}</span></div>
      ${ref ? parecidos(ref, gi, n) : h`<p class="apagado">Hace falta la composición del hogar para comparar.</p>`}
    </div>

    <div class="tarjeta">
      <div class="tarjeta-titulo"><h2>Cuánto cuesta cada integrante</h2><span class="apagado chico">${per.descripcion}, por mes</span></div>
      ${costos.length ? h`<table class="tabla"><thead><tr><th>Integrante</th><th class="der">Asignado a esa persona</th><th class="der">Parte de lo compartido</th><th class="der">Total por mes</th><th class="der">Del gasto</th></tr></thead>
        <tbody>${costos.map((c) => h`<tr><td>${c.integrante.nombre}</td><td class="der">${pesosRedondos(c.directo / n)}</td><td class="der">${pesosRedondos(c.compartido / n)}</td><td class="der"><strong>${pesosRedondos(c.total / n)}</strong></td><td class="der">${porcentaje(c.proporcion, 0)}</td></tr>`)}</tbody></table>
        <p class="chico apagado" style="margin-top:8px">Lo compartido (alquiler, súper, servicios) se reparte según el adulto equivalente de cada uno. Para asignar un gasto a una persona, elegila en la configuración del concepto (planilla) o al cargar el gasto.</p>`
      : h`<p class="apagado">Cargá a los integrantes para ver cuánto cuesta cada uno.</p>`}
    </div>
  </div>`);

  raiz.addEventListener('click', (e) => clic(e));
  raiz.addEventListener('change', (e) => cambio(e));
}

function canasta(ctx, sit, mes, fuente) {
  const max = Math.max(sit.pobreza * 2.2, sit.ingresos * 1.08);
  const x = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const historial = Array.from({ length: 6 }, (_, i) => sumarMeses(mes, -5 + i)).map((m) => {
    const f = m < ctx.mesHoy && mesConDatos(ctx, m) ? 'real' : 'plan';
    const ing = ingresosDelMes(ctx, m, f);
    const s = situacion(ctx, m, ing);
    return { m, f, ing, s };
  }).filter((r) => r.s);
  const nivel = { indigencia: ['alerta', 'Por debajo de la línea de indigencia'], pobreza: ['aviso', 'Por debajo de la línea de pobreza'], arriba: ['bien', 'Por encima de la línea de pobreza'] }[sit.nivel];
  return h`
    <div class="canasta-resumen">
      <div><span>Ingresos del mes${fuente === 'plan' ? ' (planeados)' : ''}</span><strong>${pesosRedondos(sit.ingresos)}</strong></div>
      <div><span>Canasta básica total del hogar</span><strong>${pesosRedondos(sit.pobreza)}</strong><small>${pesosRedondos(Math.round(sit.cbt * 100))} por adulto equivalente</small></div>
      <div><span>Canasta alimentaria del hogar</span><strong>${pesosRedondos(sit.indigencia)}</strong><small>${pesosRedondos(Math.round(sit.cba * 100))} por adulto equivalente</small></div>
      <div><span>Situación</span><strong><span class="etiqueta-chip ${nivel[0]}">${icono(sit.nivel === 'arriba' ? 'ok' : 'alerta')}${nivel[1]}</span></strong><small>${dec(sit.veces)} veces la canasta total</small></div>
    </div>
    <div class="escala-canasta" role="img" aria-label="Ingresos del hogar comparados con las líneas de indigencia y pobreza">
      <div class="escala-pista"><div class="escala-ingreso" style="width:${x(sit.ingresos)}"></div></div>
      <div class="escala-marca" style="left:${x(sit.indigencia)}"><span>Indigencia</span></div>
      <div class="escala-marca" style="left:${x(sit.pobreza)}"><span>Pobreza</span></div>
    </div>
    <p class="chico apagado">Canasta de ${nombreRegion(sit.region === 'gba' && estado.hogar.region === 'nacional' ? 'gba' : sit.region || estado.hogar.region)} · ${TEXTO_TIPO[sit.tipo]}${sit.tipo === 'estimado' ? ' (el INDEC publica las otras regiones con atraso: se estima con la relación con GBA)' : sit.tipo === 'proyectado' ? ' (el INDEC todavía no la publicó: se proyecta con el IPC)' : ''} · fuente: INDEC.</p>
    ${historial.length > 1 ? h`<table class="tabla" style="margin-top:8px"><thead><tr><th>Mes</th><th class="der">Ingresos</th><th class="der">Canasta total del hogar</th><th class="der">Veces la canasta</th></tr></thead>
      <tbody>${historial.map((r) => h`<tr><td>${capitalizar(nombreMes(r.m))}${r.f === 'plan' ? h` <span class="apagado chico">planeado</span>` : ''}</td><td class="der">${pesosRedondos(r.ing)}</td><td class="der">${pesosRedondos(r.s.pobreza)}</td><td class="der">${dec(r.s.veces)}</td></tr>`)}</tbody></table>` : ''}`;
}

function parecidos(ref, gi, n) {
  const tot = gi.total / n;
  const filas = ref.partes.map((p) => ({ ...p, tuyo: Math.round((gi.porIndice.get(p.indice) || 0) / n), tuyoProp: tot ? (gi.porIndice.get(p.indice) || 0) / n / tot : 0 }));
  const maxProp = Math.max(...filas.map((f) => Math.max(f.tuyoProp, f.proporcion)), 0.01);
  return h`
    <p>${ref.descripcion}. <span class="apagado">${ref.n} hogares encuestados · ${ref.alcance}.</span></p>
    <div class="leyenda"><span><i style="background:var(--serie-1)"></i>Tu hogar</span><span><i style="background:var(--fam-neutro)"></i>Hogares parecidos</span></div>
    <table class="tabla tabla-parecidos"><thead><tr><th>Categoría</th><th class="der">Tu hogar</th><th class="der">%</th><th style="width:34%"></th><th class="der">%</th><th class="der" data-ayuda="Lo que gastan los hogares parecidos, llevado a pesos de hoy">Hogares parecidos</th></tr></thead>
      <tbody>${filas.map((f) => {
        const mucho = f.tuyoProp > f.proporcion * 1.3 && f.tuyoProp - f.proporcion > 0.02;
        return h`<tr><td><span class="punto-color" style="background:${colorFamilia(FAMILIA_DE_INDICE[f.indice])}"></span> ${nombreIndice(f.indice)}</td>
          <td class="der">${pesosRedondos(f.tuyo)}</td><td class="der">${porcentaje(f.tuyoProp, 0)}${mucho ? h` <span data-ayuda="Bastante más que hogares parecidos" style="color:var(--critico-texto)">▲</span>` : ''}</td>
          <td><svg class="barras-par" viewBox="0 0 200 22" preserveAspectRatio="none" aria-hidden="true">
            <rect x="0" y="2" height="8" rx="2" width="${Math.max(0.5, (f.tuyoProp / maxProp) * 200)}" fill="var(--serie-1)"/>
            <rect x="0" y="12" height="8" rx="2" width="${Math.max(0.5, (f.proporcion / maxProp) * 200)}" fill="var(--fam-neutro)"/></svg></td>
          <td class="der">${porcentaje(f.proporcion, 0)}</td><td class="der">${f.monto !== null ? pesosRedondos(f.monto) : '—'}</td></tr>`;
      })}</tbody>
      <tfoot><tr><td>Total de gasto de consumo</td><td class="der">${pesosRedondos(tot)}</td><td></td><td></td><td></td><td class="der">${ref.total !== null ? pesosRedondos(ref.total) : '—'}</td></tr></tfoot></table>
    <p class="chico apagado" style="margin-top:8px">Fuente: INDEC, Encuesta Nacional de Gastos de los Hogares 2017-2018 (microdatos). Las proporciones se actualizaron con la suba de precios de cada categoría desde 2018; el gasto total típico es de ${dec(ref.gastoEnCanastas)} veces la canasta básica total del hogar. Es una referencia, no una regla: cada casa es distinta.</p>`;
}

async function clic(e) {
  const hg = estado.hogar;
  const comp = e.target.closest('[data-comp]');
  if (comp) {
    const c = COMPOSICIONES.find((x) => x.clave === comp.dataset.comp);
    const adultos = hg.integrantes.filter((p) => p.tipo !== 'menor');
    const menores = hg.integrantes.filter((p) => p.tipo === 'menor');
    const quitados = [...adultos.slice(c.adultos), ...menores.slice(c.menores)];
    if (quitados.length && !(await confirmar('Cambiar la composición', `Se quitan: ${quitados.map((p) => p.nombre).join(', ')}. Lo que tenían asignado pasa a ser de todo el hogar.`, { si: 'Cambiar' }))) return;
    mutar((x) => {
      const ad = x.integrantes.filter((p) => p.tipo !== 'menor').slice(0, c.adultos);
      const me = x.integrantes.filter((p) => p.tipo === 'menor').slice(0, c.menores);
      let k = x.integrantes.length;
      while (ad.length < c.adultos) ad.push({ id: `per_${Date.now().toString(36)}${k++}`, nombre: `Adulto ${ad.length + 1}`, tipo: 'adulto', edad: null, sexo: null });
      while (me.length < c.menores) me.push({ id: `per_${Date.now().toString(36)}${k++}`, nombre: `Menor ${me.length + 1}`, tipo: 'menor', edad: null, sexo: null });
      x.integrantes = [...ad, ...me];
      limpiarAsignaciones(x);
    });
    return;
  }
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  if (b.dataset.accion === 'agregar') {
    mutar((x) => { x.integrantes.push({ id: `per_${Date.now().toString(36)}`, nombre: `Integrante ${x.integrantes.length + 1}`, tipo: 'adulto', edad: null, sexo: null }); });
  } else if (b.dataset.accion === 'quitar') {
    const p = hg.integrantes.find((x) => x.id === b.dataset.id);
    if (hg.integrantes.length === 1) { avisar('Tiene que quedar al menos una persona.'); return; }
    if (await confirmar('Quitar integrante', `Se quita a ${p.nombre}. Lo que tenía asignado pasa a ser de todo el hogar.`, { si: 'Quitar' })) {
      mutar((x) => { x.integrantes = x.integrantes.filter((y) => y.id !== p.id); limpiarAsignaciones(x); });
    }
  }
}

function limpiarAsignaciones(x) {
  const ids = new Set(x.integrantes.map((p) => p.id));
  for (const l of x.lineas) if (l.personaId && !ids.has(l.personaId)) l.personaId = null;
  for (const m of x.movimientos) if (m.personaId && !ids.has(m.personaId)) m.personaId = null;
  for (const c of x.cuotas) if (c.personaId && !ids.has(c.personaId)) c.personaId = null;
}

function cambio(e) {
  const t = e.target;
  if (t.matches('[data-mes-canasta]')) { estado.ui.mesCanasta = t.value; notificar('vista'); return; }
  if (t.dataset.hogar) { mutar((x) => { x[t.dataset.hogar] = t.value || null; }); return; }
  const fila = t.closest('[data-persona]');
  if (!fila || !t.dataset.campo) return;
  let v = t.value;
  if (t.dataset.campo === 'edad') v = v === '' ? null : Math.max(0, Math.min(110, Math.floor(Number(v))));
  if (t.dataset.campo === 'sexo') v = v || null;
  if (t.dataset.campo === 'nombre' && !String(v).trim()) return;
  mutar((x) => {
    const p = x.integrantes.find((y) => y.id === fila.dataset.persona);
    p[t.dataset.campo] = v;
    if (t.dataset.campo === 'edad' && v !== null) p.tipo = v >= 18 ? 'adulto' : 'menor';
  });
}

export default { titulo: 'Familia', icono: 'familia', render };
