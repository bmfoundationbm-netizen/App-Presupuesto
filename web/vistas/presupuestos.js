// Mi Presupuesto · presupuestos por año y proyectos

import { estado, mutar, irA } from '../estado.js';
import { h, crudo, montar, icono, opciones, dialogo, confirmar, pedirTexto, avisar, leerMonto, pesosRedondos, menu } from '../ui.js';
import { calcularAnio } from '../lib/calculos.js';
import { actualizarPlan, copiarPlan, crearPlanAnio, nuevoProyecto, totalesProyecto, actualizarProyecto, metaParaProyecto } from '../lib/presupuestos.js';
import { planActivo, nuevoId } from '../lib/modelo.js';
import { estadoMeta } from '../lib/ahorro.js';
import { INDICES, nombreIndice } from '../lib/catalogo.js';
import { nombreMes, capitalizar, mesActual, anioDe, sumarMeses } from '../lib/fechas.js';
import { porcentaje } from '../lib/dinero.js';
import { valorMonto } from './dialogos.js';

function textoOrigen(hg, p) {
  const o = p.origen;
  if (!o) return 'Creado a mano';
  const base = hg.planes.find((x) => x.id === o.planId);
  const nombreBase = base ? base.nombre : 'un presupuesto borrado';
  if (o.tipo === 'actualizacion') return o.modo === 'aAnio' ? `De "${nombreBase}" ajustado por IPC` : `De "${nombreBase}" a pesos de ${nombreMes(o.mesReferencia)}`;
  if (o.tipo === 'recorte') return `De "${nombreBase}" con un plan de recorte desde ${nombreMes(o.desdeMes)}`;
  if (o.tipo === 'fijos') return `Con los fijos de "${nombreBase}"`;
  return `Copia de "${nombreBase}"`;
}

function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const anios = [...new Set(hg.planes.map((p) => p.anio))].sort((a, b) => b - a);
  const sigAnio = Math.max(anioDe(mesActual()), ...anios) + 1;

  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Presupuestos y proyectos</h1><div class="subtitulo">Cada año puede tener varios presupuestos; el activo es el que la planilla muestra como planeado.</div></div>
      <span class="espacio"></span>
      <button class="boton" data-accion="nuevo-plan">${icono('mas')}Nuevo presupuesto</button>
      <button class="boton primario" data-accion="actualizar">${icono('ipc')}Actualizar al IPC</button></div>

    ${anios.length ? anios.map((anio) => h`<div class="tarjeta">
      <div class="tarjeta-titulo"><h2>${anio}</h2></div>
      <table class="tabla"><thead><tr><th>Presupuesto</th><th>De dónde sale</th><th class="der">Ingresos del año</th><th class="der">Gastos del año</th><th class="der">Resultado</th><th></th></tr></thead>
      <tbody>${hg.planes.filter((p) => p.anio === anio).map((p) => {
        const r = calcularAnio(ctx, anio, { planId: p.id });
        const S = r.anual.secciones;
        const gastos = S.gastos.plan + S.inesperados.plan + S.deudas.plan;
        const activo = planActivo(hg, anio) && planActivo(hg, anio).id === p.id;
        return h`<tr>
          <td><strong>${p.nombre}</strong> ${activo ? h`<span class="etiqueta-chip acento">activo</span>` : ''}${p.origen && p.origen.fuentes && p.origen.fuentes.includes('proyectado') ? h` <span class="etiqueta-chip" data-ayuda="Usa inflación proyectada para meses que todavía no pasaron">con proyección</span>` : ''}</td>
          <td class="apagado">${textoOrigen(hg, p)}</td>
          <td class="der">${pesosRedondos(S.ingresos.plan)}</td><td class="der">${pesosRedondos(gastos)}</td>
          <td class="der" style="color:${r.anual.resultado.plan < 0 ? 'var(--critico-texto)' : 'inherit'}">${pesosRedondos(r.anual.resultado.plan)}</td>
          <td class="acciones-tabla">
            ${activo ? '' : h`<button class="boton chico" data-accion="activar" data-p="${p.id}">Usar este</button>`}
            <button class="boton chico fantasma" data-accion="ver" data-p="${p.id}" data-ayuda="Abrir en la planilla">${icono('planilla')}</button>
            <button class="boton chico fantasma" data-accion="menu-plan" data-p="${p.id}" aria-label="Más opciones">${icono('puntos')}</button></td></tr>`;
      })}</tbody></table></div>`) : h`<div class="tarjeta vacio">${icono('presupuestos')}<p>Todavía no hay presupuestos.</p></div>`}

    <div class="encabezado-pagina" style="margin-top:28px"><div><h2>Proyectos</h2><div class="subtitulo">Gastos puntuales con sus partes: una reforma, unas vacaciones, un cumpleaños. Cada parte se actualiza con su propio IPC.</div></div>
      <span class="espacio"></span><button class="boton" data-accion="nuevo-proyecto">${icono('mas')}Nuevo proyecto</button></div>
    ${hg.proyectos.length ? h`<div class="grilla-proyectos">${hg.proyectos.map((p) => tarjetaProyecto(hg, ctx, p))}</div>` : h`<div class="tarjeta vacio"><p>Sin proyectos por ahora.</p></div>`}
    <p class="chico apagado" style="margin-top:20px">Próximo año sin presupuesto: ${sigAnio}. Al pasar a ${sigAnio} en la planilla se ofrece crearlo desde el actual, ajustado por la inflación esperada.</p>
  </div>`);

  raiz.addEventListener('click', (e) => clic(e));
  raiz.addEventListener('change', (e) => cambioItem(e));
}

function tarjetaProyecto(hg, ctx, p) {
  const t = totalesProyecto(ctx, p);
  const meta = p.metaId && hg.metas.find((m) => m.id === p.metaId);
  const em = meta && estadoMeta(ctx, meta);
  return h`<div class="tarjeta proyecto" data-proyecto="${p.id}">
    <div class="tarjeta-titulo"><h3>${p.nombre}</h3><button class="boton chico fantasma" data-accion="menu-proyecto" data-pr="${p.id}" aria-label="Opciones">${icono('puntos')}</button></div>
    <div class="chico apagado" style="margin:-6px 0 10px">Precios de ${nombreMes(p.mesPrecios)}${p.fecha ? ` · para ${nombreMes(p.fecha)}` : ''}</div>
    <table class="tabla tabla-items"><thead><tr><th>Parte</th><th>Se ajusta con</th><th class="der">Presupuestado</th><th class="der">Gastado</th><th></th></tr></thead>
      <tbody>${p.items.map((it) => h`<tr data-item="${it.id}">
        <td><input class="entrada en-tabla" data-campo="descripcion" value="${it.descripcion}"></td>
        <td><select class="entrada en-tabla" data-campo="indice">${opciones([...INDICES.map((i) => [i.clave, i.nombre]), ['general', 'Nivel general']], it.indice)}</select></td>
        <td><input class="entrada en-tabla monto" data-campo="presupuestado" value="${valorMonto(it.presupuestado, { miles: true })}"></td>
        <td><input class="entrada en-tabla monto" data-campo="gastado" value="${it.gastado ? valorMonto(it.gastado, { miles: true }) : ''}" placeholder="0"></td>
        <td><button class="acciones-linea" data-accion="quitar-item" data-pr="${p.id}" data-it="${it.id}" aria-label="Quitar">${icono('cerrar')}</button></td></tr>`)}</tbody></table>
    <button class="boton chico" data-accion="agregar-item" data-pr="${p.id}" style="margin-top:6px">${icono('mas')}Agregar parte</button>
    <div class="resumen-proyecto">
      <div><span>Presupuestado</span><strong>${pesosRedondos(t.presupuestado)}</strong></div>
      <div><span>En pesos de hoy</span><strong>${pesosRedondos(t.presupuestadoHoy)}</strong></div>
      <div><span>Gastado${t.movimientos ? ' (con gastos cargados)' : ''}</span><strong>${pesosRedondos(t.gastado)}</strong></div>
      <div><span>Falta</span><strong>${pesosRedondos(Math.max(0, t.presupuestadoHoy - t.gastado))}</strong></div>
    </div>
    ${meta ? h`<div class="nota" style="margin-top:10px">${icono('ahorro')}Meta de ahorro: ${pesosRedondos(em.saldo)} de ${pesosRedondos(em.objetivoFinal)} (${porcentaje(em.avance, 0)})
      <div class="barra-progreso" style="margin-top:6px"><span style="width:${Math.round(em.avance * 100)}%"></span></div></div>`
      : h`<button class="boton chico" data-accion="crear-meta" data-pr="${p.id}" style="margin-top:10px">${icono('ahorro')}Crear una meta de ahorro para este proyecto</button>`}
  </div>`;
}

// ── Acciones ────────────────────────────────────────────────────────────────────
async function clic(e) {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const hg = estado.hogar;
  const plan = b.dataset.p && hg.planes.find((p) => p.id === b.dataset.p);
  const proy = b.dataset.pr && hg.proyectos.find((p) => p.id === b.dataset.pr);
  switch (b.dataset.accion) {
    case 'activar': mutar((x) => { x.planActivo[plan.anio] = plan.id; }); avisar(`"${plan.nombre}" es ahora el presupuesto de ${plan.anio}.`, { tipo: 'ok' }); break;
    case 'ver': estado.ui.anio = plan.anio; estado.ui.modo = 'plan'; mutar((x) => { x.planActivo[plan.anio] = plan.id; }, { historial: false }); irA('planilla'); break;
    case 'menu-plan': {
      const r = b.getBoundingClientRect();
      menu(r.left - 160, r.bottom + 2, [
        { texto: 'Actualizar al IPC…', icono: 'ipc', fn: () => dialogoActualizar(plan) },
        { texto: 'Duplicar', icono: 'copiar', fn: () => mutar((x) => { x.planes.push(copiarPlan(x, plan)); }) },
        { texto: 'Cambiar el nombre', icono: 'editar', fn: async () => { const n = await pedirTexto('Nombre del presupuesto', { valor: plan.nombre }); if (n && n.trim()) mutar((x) => { x.planes.find((p) => p.id === plan.id).nombre = n.trim(); }); } },
        '-',
        { texto: 'Borrar', icono: 'borrar', peligro: true, fn: () => borrarPlan(plan) }
      ]);
      break;
    }
    case 'actualizar': dialogoActualizar(planActivo(hg, estado.ui.anio) || hg.planes[0]); break;
    case 'nuevo-plan': dialogoNuevoPlan(); break;
    case 'nuevo-proyecto': dialogoNuevoProyecto(); break;
    case 'agregar-item': mutar((x) => { x.proyectos.find((p) => p.id === proy.id).items.push({ id: nuevoId('it'), descripcion: '', indice: 'general', presupuestado: 0, gastado: 0 }); }); break;
    case 'quitar-item': mutar((x) => { const p = x.proyectos.find((y) => y.id === proy.id); p.items = p.items.filter((it) => it.id !== b.dataset.it); }); break;
    case 'crear-meta': {
      mutar(() => metaParaProyecto(estado.ctx, proy));
      avisar('Meta creada: sube con la inflación y aparece en la planilla, en Ahorro.', { tipo: 'ok', accion: { texto: 'Ver', fn: () => irA('ahorro') } });
      break;
    }
    case 'menu-proyecto': {
      const r = b.getBoundingClientRect();
      menu(r.left - 200, r.bottom + 2, [
        { texto: 'Actualizar a pesos de otro mes…', icono: 'ipc', fn: () => dialogoActualizarProyecto(proy) },
        { texto: 'Cambiar nombre y fecha', icono: 'editar', fn: () => dialogoNuevoProyecto(proy) },
        { texto: 'Ver los gastos cargados', icono: 'movimientos', fn: () => irA('movimientos') },
        '-',
        { texto: 'Borrar', icono: 'borrar', peligro: true, fn: async () => { if (await confirmar('Borrar proyecto', `Se borra "${proy.nombre}". Los gastos cargados quedan, sin proyecto.`, { si: 'Borrar', peligro: true })) mutar((x) => { x.proyectos = x.proyectos.filter((p) => p.id !== proy.id); x.movimientos.forEach((m) => { if (m.proyectoId === proy.id) m.proyectoId = null; }); }); } }
      ]);
      break;
    }
    default: break;
  }
}

function cambioItem(e) {
  const campo = e.target.closest('[data-campo]');
  const fila = e.target.closest('[data-item]');
  const tarjeta = e.target.closest('[data-proyecto]');
  if (!campo || !fila || !tarjeta) return;
  const nombre = campo.dataset.campo;
  let valor = campo.value;
  if (nombre === 'presupuestado' || nombre === 'gastado') {
    valor = valor.trim() === '' ? 0 : leerMonto(valor);
    if (valor === null) { avisar('Ese monto no se entiende.', { tipo: 'error' }); return; }
  }
  mutar((x) => {
    const p = x.proyectos.find((y) => y.id === tarjeta.dataset.proyecto);
    const it = p && p.items.find((y) => y.id === fila.dataset.item);
    if (it) it[nombre] = valor;
  });
}

async function borrarPlan(plan) {
  if (!(await confirmar('Borrar presupuesto', `Se borra "${plan.nombre}". Lo real no se toca.`, { si: 'Borrar', peligro: true }))) return;
  mutar((x) => {
    x.planes = x.planes.filter((p) => p.id !== plan.id);
    if (x.planActivo[plan.anio] === plan.id) {
      const otro = x.planes.find((p) => p.anio === plan.anio);
      if (otro) x.planActivo[plan.anio] = otro.id; else delete x.planActivo[plan.anio];
    }
  });
}

// ── Actualizar al IPC ───────────────────────────────────────────────────────────
async function dialogoActualizar(planInicial) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  if (!hg.planes.length) { avisar('Primero creá un presupuesto.'); return; }
  const hasta = ctx.indices.hasta;
  const mesesRef = Array.from({ length: 30 }, (_, i) => sumarMeses(mesActual(), 6 - i));
  const anios = Array.from({ length: 4 }, (_, i) => anioDe(mesActual()) + i);
  const r = await dialogo({
    titulo: 'Actualizar un presupuesto al IPC', ancho: 'ancho',
    cuerpo: h`
      <p class="apagado">Se crea una copia con los montos ajustados por la inflación de cada categoría. El original no se toca.</p>
      <div class="campo"><label>Presupuesto</label><select class="entrada" name="planId">${opciones(hg.planes.map((p) => [p.id, `${p.nombre} (${p.anio})`]), planInicial && planInicial.id)}</select></div>
      <div class="campo"><div class="etiqueta">¿Qué querés hacer?</div>
        <label class="casilla"><input type="radio" name="modo" value="aAnio" checked> Proyectarlo a otro año:
          <select class="entrada" name="anioDestino" style="margin-left:6px;width:auto">${opciones(anios.map((a) => [a, String(a)]), anioDe(mesActual()) + 1)}</select></label>
        <div class="ayuda" style="margin:2px 0 8px 24px">Cada mes pasa al mismo mes del año elegido, con la inflación publicada y, para lo que todavía no pasó, la esperada.</div>
        <label class="casilla"><input type="radio" name="modo" value="pesosDe"> Llevarlo a pesos de:
          <select class="entrada" name="mesReferencia" style="margin-left:6px;width:auto">${opciones(mesesRef.map((m) => [m, `${capitalizar(nombreMes(m))}${m > hasta ? ' (estimado)' : ''}`]), hasta)}</select></label>
        <div class="ayuda" style="margin:2px 0 0 24px">"¿Cuánto sería hoy?": todos los meses quedan a los precios de un mismo mes.</div></div>
      <label class="casilla"><input type="checkbox" name="ajustarIngresos" checked> Ajustar también los ingresos (con el IPC general)</label>
      <div id="vista-previa" style="margin-top:12px"></div>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Crear la copia actualizada', valor: 'ok', tipo: 'primario' }],
    alAbrir: (form) => {
      const previa = () => {
        const d = Object.fromEntries([...form.querySelectorAll('[name]')].map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.type === 'radio' ? (el.checked ? el.value : undefined) : el.value]).filter(([, v]) => v !== undefined));
        d.modo = form.querySelector('[name=modo]:checked').value;
        const plan = hg.planes.find((p) => p.id === d.planId);
        if (!plan) return;
        const { resumen } = actualizarPlan(ctx, plan, { modo: d.modo, anioDestino: Number(d.anioDestino), mesReferencia: d.mesReferencia, ajustarIngresos: d.ajustarIngresos });
        const filas = Object.entries(resumen.factores).sort((a, b) => b[1] - a[1]);
        form.querySelector('#vista-previa').innerHTML = String(h`<div class="nota">
          <strong>Aumento por categoría</strong> (del primer mes del presupuesto)${resumen.tipos.includes('proyectado') ? h` · <span class="etiqueta-chip">incluye inflación proyectada (${estado.ajustes.proyeccion && estado.ajustes.proyeccion.modo === 'usuario' ? 'tasa propia' : 'REM del BCRA'})</span>` : ''}
          <div class="factores">${filas.map(([ind, f]) => h`<span>${nombreIndice(ind)} <strong>+${porcentaje(f - 1, 1)}</strong></span>`)}</div>
          <div class="chico apagado" style="margin-top:6px">${resumen.ajustadas} conceptos se ajustan · ${resumen.sinCambio} quedan igual (dólares, cuotas de préstamos, automáticos).</div></div>`);
      };
      form.addEventListener('change', previa);
      previa();
    }
  });
  if (r.boton !== 'ok') return;
  const d = r.datos;
  const plan = hg.planes.find((p) => p.id === d.planId);
  let nuevo;
  mutar((x) => {
    nuevo = actualizarPlan(estado.ctx, plan, { modo: d.modo, anioDestino: Number(d.anioDestino), mesReferencia: d.mesReferencia, ajustarIngresos: !!d.ajustarIngresos }).plan;
    x.planes.push(nuevo);
    if (!x.planActivo[nuevo.anio]) x.planActivo[nuevo.anio] = nuevo.id;
  });
  avisar(`Se creó "${nuevo.nombre}".`, { tipo: 'ok', duracion: 7000, accion: { texto: 'Usarlo', fn: () => { mutar((x) => { x.planActivo[nuevo.anio] = nuevo.id; }); estado.ui.anio = nuevo.anio; irA('planilla'); } } });
}

async function dialogoNuevoPlan() {
  const hg = estado.hogar;
  const anios = Array.from({ length: 5 }, (_, i) => anioDe(mesActual()) - 1 + i);
  const r = await dialogo({
    titulo: 'Nuevo presupuesto',
    cuerpo: h`
      <div class="fila-campos"><div class="campo"><label>Año</label><select class="entrada" name="anio">${opciones(anios.map((a) => [a, String(a)]), anioDe(mesActual()) + 1)}</select></div>
        <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" placeholder="Presupuesto ${anioDe(mesActual()) + 1}"></div></div>
      <div class="campo"><div class="etiqueta">Empezar con</div>
        ${hg.planes.length ? h`<label class="casilla"><input type="radio" name="base" value="ipc" checked> Otro presupuesto ajustado por IPC:</label>
        <select class="entrada" name="desde" style="margin:4px 0 8px 24px;width:calc(100% - 24px)">${opciones(hg.planes.map((p) => [p.id, `${p.nombre} (${p.anio})`]), (planActivo(hg, anioDe(mesActual())) || hg.planes[0]).id)}</select>
        <label class="casilla"><input type="radio" name="base" value="fijos"> Solo los gastos fijos de ese presupuesto</label>
        <label class="casilla" style="margin-top:6px"><input type="radio" name="base" value="copia"> Una copia igual, sin ajustar</label>` : ''}
        <label class="casilla" style="margin-top:6px"><input type="radio" name="base" value="vacio" ${hg.planes.length ? '' : crudo('checked')}> Vacío</label></div>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Crear', valor: 'ok', tipo: 'primario' }]
  });
  if (r.boton !== 'ok') return;
  const d = r.datos;
  const anio = Number(d.anio);
  mutar((x) => {
    const desde = x.planes.find((p) => p.id === d.desde);
    const nuevo = crearPlanAnio(estado.ctx, anio, { base: d.base || 'vacio', desdePlan: desde });
    if (d.nombre && d.nombre.trim()) nuevo.nombre = d.nombre.trim();
    x.planes.push(nuevo);
    if (!x.planActivo[anio]) x.planActivo[anio] = nuevo.id;
  });
  avisar(`Presupuesto ${anio} creado.`, { tipo: 'ok' });
}

async function dialogoNuevoProyecto(proy = null) {
  const meses = Array.from({ length: 48 }, (_, i) => sumarMeses(mesActual(), i));
  const r = await dialogo({
    titulo: proy ? 'Proyecto' : 'Nuevo proyecto',
    cuerpo: h`
      <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" value="${proy ? proy.nombre : ''}" placeholder="Ej.: Reforma del baño, Vacaciones de invierno" autofocus></div>
      <div class="campo"><label>Para cuándo (opcional)</label><select class="entrada" name="fecha">${opciones([['', 'Sin fecha'], ...meses.map((m) => [m, capitalizar(nombreMes(m))])], proy ? proy.fecha || '' : '')}</select></div>
      ${proy ? '' : h`<div class="campo"><label>Partes (una por renglón, con el monto al final)</label><textarea class="entrada" name="items" rows="5" placeholder="Pasajes 900000&#10;Alojamiento 1200000&#10;Comidas 500000"></textarea>
        <div class="ayuda">Los montos son en pesos de hoy. Después se pueden editar y elegir con qué IPC se ajusta cada parte.</div></div>`}`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: proy ? 'Guardar' : 'Crear', valor: 'ok', tipo: 'primario' }],
    validar: (d) => (!d.nombre.trim() ? 'Poné un nombre.' : null)
  });
  if (r.boton !== 'ok') return;
  const d = r.datos;
  if (proy) { mutar((x) => { const p = x.proyectos.find((y) => y.id === proy.id); p.nombre = d.nombre.trim(); p.fecha = d.fecha || null; }); return; }
  const items = (d.items || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s:$-]*([\d.,]+)\s*$/);
    return m ? { descripcion: m[1].trim(), presupuestado: leerMonto(m[2]) || 0, indice: 'general' } : { descripcion: l, presupuestado: 0, indice: 'general' };
  });
  mutar((x) => nuevoProyecto(x, { nombre: d.nombre.trim(), fecha: d.fecha || null, mesPrecios: mesActual(), items }));
}

async function dialogoActualizarProyecto(proy) {
  const meses = Array.from({ length: 18 }, (_, i) => sumarMeses(mesActual(), 6 - i));
  const r = await dialogo({
    titulo: `Actualizar "${proy.nombre}"`,
    cuerpo: h`<p class="apagado">Se crea una copia con cada parte ajustada por su IPC, desde ${nombreMes(proy.mesPrecios)}.</p>
      <div class="campo"><label>A pesos de</label><select class="entrada" name="mes">${opciones(meses.map((m) => [m, capitalizar(nombreMes(m))]), estado.ctx.indices.hasta)}</select></div>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Crear copia', valor: 'ok', tipo: 'primario' }]
  });
  if (r.boton !== 'ok') return;
  mutar((x) => { x.proyectos.push(actualizarProyecto(estado.ctx, proy, r.datos.mes)); });
  avisar('Copia actualizada creada.', { tipo: 'ok' });
}

export default { titulo: 'Presupuestos', icono: 'presupuestos', render };
export { dialogoActualizar };
