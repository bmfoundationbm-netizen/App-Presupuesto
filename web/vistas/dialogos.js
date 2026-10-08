// Mi Presupuesto · diálogos compartidos: concepto, gasto, compra en cuotas, meta, deuda e inversión

import { estado, mutar } from '../estado.js';
import { h, crudo, dialogo, opciones, leerMonto } from '../ui.js';
import { SECCIONES, INDICES, SUGERIDAS, CLASES, TIPOS_INVERSION } from '../lib/catalogo.js';
import {
  agregarLinea, fijarPlan, fijarReal, nuevoPlan, planActivo, nuevaMeta, nuevaDeuda, nuevaInversion,
  nuevaCompraEnCuotas, nuevoId, asegurarAguinaldo, categoria, linea as buscarLinea, seccionDeLinea, borrarLinea
} from '../lib/modelo.js';
import { mesesDelAnio, mesActual, hoy, nombreMes, anioDe, sumarMeses, capitalizar, leerFecha, ultimoDia } from '../lib/fechas.js';
import { formatear } from '../lib/dinero.js';

// Monto para un campo editable: sin separador de miles (como en Excel) o con él.
const valorMonto = (c, { miles = false } = {}) => (c === null || c === undefined ? '' : miles ? formatear(c, { decimales: 'auto' }) : formatear(c, { decimales: 'auto' }).replace(/\./g, ''));
export { valorMonto };

// Carga un monto mensual en el plan desde un mes hasta diciembre (crea el plan si falta).
export function cargarDesde(h, lineaId, mes, monto) {
  if (!(monto > 0)) return;
  const anio = anioDe(mes);
  const plan = planActivo(h, anio) || nuevoPlan(h, anio);
  for (const m of mesesDelAnio(anio).filter((x) => x >= mes)) fijarPlan(plan, lineaId, m, monto);
}

function opcionesMeses(desde, cantidad, elegido) {
  const lista = [];
  for (let i = 0; i < cantidad; i++) { const m = sumarMeses(desde, i); lista.push([m, capitalizar(nombreMes(m))]); }
  return opciones(lista, elegido);
}

// ── Concepto nuevo ──────────────────────────────────────────────────────────────
export async function dialogoLinea({ seccion = 'gastos', categoriaId = null, mes = estado.ui.mesFoco } = {}) {
  if (seccion === 'ahorro') return dialogoMeta({ mes });
  if (seccion === 'deudas') return dialogoDeuda({ mes });
  if (seccion === 'inversiones') return dialogoInversion({ mes });
  const hg = estado.hogar;
  const cats = hg.categorias.filter((c) => c.seccion === seccion);
  const catSel = categoriaId || (cats[0] && cats[0].id);
  const sugeridas = (c) => {
    const cat = categoria(hg, c);
    if (!cat || cat.seccion !== 'gastos') return [];
    const usadas = new Set(hg.lineas.filter((l) => l.categoriaId === c).map((l) => l.nombre.toLowerCase()));
    return (SUGERIDAS[cat.indice] || []).filter((s) => !usadas.has(s[0].toLowerCase()));
  };
  const personas = [['', 'Todo el hogar'], ...hg.integrantes.map((i) => [i.id, i.nombre])];
  const r = await dialogo({
    titulo: seccion === 'ingresos' ? 'Nuevo ingreso' : seccion === 'inesperados' ? 'Nuevo tipo de gasto inesperado' : 'Nuevo concepto de gasto',
    cuerpo: h`
      ${cats.length > 1 ? h`<div class="campo"><label>Categoría</label><select class="entrada" name="categoriaId">${opciones(cats.map((c) => [c.id, c.nombre]), catSel)}</select></div>` : h`<input type="hidden" name="categoriaId" value="${catSel}">`}
      <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" list="lista-sugeridas" autofocus placeholder="${seccion === 'ingresos' ? 'Ej.: Sueldo, Alquiler que cobro, Changas' : 'Ej.: Supermercado, Luz, Netflix'}">
        <datalist id="lista-sugeridas">${sugeridas(catSel).map((s) => h`<option value="${s[0]}">`)}</datalist></div>
      <div class="fila-campos">
        <div class="campo"><label>Monto por mes (opcional)</label><input class="entrada monto" name="monto" placeholder="0"></div>
        <div class="campo"><label>Desde</label><select class="entrada" name="desde">${opcionesMeses(`${estado.ui.anio}-01`, 12, mes)}</select></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label>Tipo</label><select class="entrada" name="naturaleza">${opciones([['variable', 'Variable (cambia cada mes)'], ['fijo', 'Fijo (se repite igual)']], seccion === 'ingresos' ? 'fijo' : 'variable')}</select></div>
        <div class="campo"><label>Moneda</label><select class="entrada" name="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], 'ARS')}</select></div>
      </div>
      ${seccion === 'gastos' ? h`<div class="campo"><label>Clasificación</label><select class="entrada" name="clase">${opciones([['', 'Que la proponga el programa'], ...Object.entries(CLASES).map(([k, v]) => [k, `${v.nombre}: ${v.detalle}`])], '')}</select></div>` : ''}
      ${seccion === 'inesperados' ? h`<div class="campo"><label>Se actualiza con el IPC de</label><select class="entrada" name="indice">${opciones(INDICES.map((i) => [i.clave, i.nombre]), 'varios')}</select></div>` : ''}
      ${hg.integrantes.length ? h`<div class="campo"><label>${seccion === 'ingresos' ? 'Lo cobra' : 'Es de'}</label><select class="entrada" name="personaId">${opciones(personas, '')}</select></div>` : ''}
      ${seccion === 'ingresos' ? h`<label class="casilla"><input type="checkbox" name="aguinaldo"> Es un sueldo en relación de dependencia (calcula el aguinaldo)</label>` : ''}`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Agregar', valor: 'ok', tipo: 'primario' }],
    validar: (d) => (!d.nombre.trim() ? 'Poné un nombre.' : (d.monto && leerMonto(d.monto) === null ? 'El monto no se entiende.' : null)),
    alAbrir: (form) => {
      const sel = form.querySelector('[name=categoriaId]');
      const nombre = form.querySelector('[name=nombre]');
      const actualizar = () => {
        const dl = form.querySelector('#lista-sugeridas');
        dl.innerHTML = String(h`${sugeridas(sel.value).map((s) => h`<option value="${s[0]}">`)}`);
      };
      if (sel && sel.tagName === 'SELECT') sel.addEventListener('change', actualizar);
      nombre.addEventListener('change', () => {
        for (const lista of Object.values(SUGERIDAS)) {
          const s = lista.find((x) => x[0].toLowerCase() === nombre.value.trim().toLowerCase());
          if (s) form.querySelector('[name=naturaleza]').value = s[1];
        }
      });
    }
  });
  if (r.boton !== 'ok') return null;
  const d = r.datos;
  return mutar((hogar) => {
    const l = agregarLinea(hogar, {
      categoriaId: d.categoriaId, nombre: d.nombre.trim(), naturaleza: d.naturaleza, moneda: d.moneda,
      clase: d.clase || undefined, claseManual: !!d.clase, personaId: d.personaId || null,
      indice: d.indice || null, aguinaldo: !!d.aguinaldo
    });
    if (d.aguinaldo) asegurarAguinaldo(hogar);
    cargarDesde(hogar, l.id, d.desde, leerMonto(d.monto));
    return l;
  });
}

// ── Gasto (movimiento) ──────────────────────────────────────────────────────────
// mov: movimiento a editar o null. lineaId / fecha: valores iniciales para uno nuevo.
export async function dialogoMovimiento({ mov = null, lineaId = null, fecha = null } = {}) {
  const hg = estado.hogar;
  const lineas = hg.lineas.filter((l) => !l.auto && !l.archivada);
  const grupos = [];
  for (const s of SECCIONES) {
    const cats = hg.categorias.filter((c) => c.seccion === s.clave);
    const ls = lineas.filter((l) => cats.some((c) => c.id === l.categoriaId));
    if (ls.length) grupos.push([s.nombre, ls.map((l) => [l.id, cats.length > 1 ? `${categoria(hg, l.categoriaId).nombre} › ${l.nombre}` : l.nombre])]);
  }
  const elegida = mov ? mov.lineaId : (lineaId || (lineas.find((l) => seccionDeLinea(hg, l) === 'gastos') || lineas[0] || {}).id);
  const mesHoy = mesActual();
  const fechaIni = mov ? mov.fecha : (fecha || (estado.ui.mesFoco === mesHoy ? hoy() : ultimoDia(estado.ui.mesFoco)));
  const r = await dialogo({
    titulo: mov ? 'Editar movimiento' : 'Cargar un gasto o ingreso',
    cuerpo: h`
      <div class="campo"><label>Concepto</label><select class="entrada" name="lineaId">${grupos.map(([g, ls]) => h`<optgroup label="${g}">${opciones(ls, elegida)}</optgroup>`)}</select></div>
      <div class="fila-campos">
        <div class="campo"><label>Fecha</label><input class="entrada" type="date" name="fecha" value="${fechaIni}"></div>
        <div class="campo"><label>Monto</label><input class="entrada monto" name="monto" value="${mov ? valorMonto(mov.monto) : ''}" autofocus placeholder="0"></div>
      </div>
      <div class="campo"><label>Descripción (opcional)</label><input class="entrada" name="descripcion" value="${mov ? mov.descripcion : ''}" placeholder="Ej.: Coto, farmacia, cumpleaños de Sofi"></div>
      <div class="fila-campos">
        <div class="campo"><label>Medio de pago</label><select class="entrada" name="medioId">${opciones([['', 'Sin indicar'], ...hg.medios.map((m) => [m.id, m.nombre])], mov ? mov.medioId : '')}</select></div>
        ${hg.integrantes.length ? h`<div class="campo"><label>Es de</label><select class="entrada" name="personaId">${opciones([['', 'Todo el hogar'], ...hg.integrantes.map((i) => [i.id, i.nombre])], mov ? mov.personaId : '')}</select></div>` : ''}
      </div>
      ${hg.proyectos.length ? h`<div class="campo"><label>Proyecto (opcional)</label><select class="entrada" name="proyectoId">${opciones([['', 'Ninguno'], ...hg.proyectos.map((p) => [p.id, p.nombre])], mov ? mov.proyectoId : '')}</select></div>` : ''}
      ${mov ? '' : h`<label class="casilla"><input type="checkbox" name="enCuotas"> Es una compra en cuotas</label>
      <div class="fila-campos" data-cuotas style="margin-top:8px;display:none">
        <div class="campo"><label>Cantidad de cuotas</label><input class="entrada" type="number" min="2" max="60" name="cuotas" value="3"></div>
        <div class="campo"><label>El monto es</label><select class="entrada" name="tipoMonto">${opciones([['total', 'El total de la compra'], ['cuota', 'Lo que vale cada cuota']], 'total')}</select></div>
        <div class="campo"><label>Primera cuota en</label><select class="entrada" name="primerMes">${opcionesMeses(sumarMeses(mesHoy, -3), 9, sumarMeses(mesHoy, 1))}</select></div>
      </div>`}`,
    botones: [
      ...(mov ? [{ texto: 'Borrar', valor: 'borrar', tipo: 'peligro', izquierda: true }] : []),
      { texto: 'Cancelar', valor: 'no' }, { texto: mov ? 'Guardar' : 'Agregar', valor: 'ok', tipo: 'primario' }
    ],
    validar: (d) => {
      if (!leerFecha(d.fecha)) return 'Elegí una fecha.';
      const m = leerMonto(d.monto);
      if (m === null || m === 0) return 'Escribí el monto.';
      return null;
    },
    alAbrir: (form) => {
      const c = form.querySelector('[name=enCuotas]');
      if (c) c.addEventListener('change', () => { form.querySelector('[data-cuotas]').style.display = c.checked ? '' : 'none'; });
    }
  });
  if (r.boton === 'borrar') {
    mutar((hogar) => { hogar.movimientos = hogar.movimientos.filter((x) => x.id !== mov.id); });
    return null;
  }
  if (r.boton !== 'ok') return null;
  const d = r.datos;
  const monto = leerMonto(d.monto);
  return mutar((hogar) => {
    if (d.enCuotas) {
      const n = Math.max(2, Math.min(60, Number(d.cuotas) || 2));
      const cuota = d.tipoMonto === 'total' ? Math.round(monto / n) : monto;
      return nuevaCompraEnCuotas(hogar, { lineaId: d.lineaId, descripcion: d.descripcion || 'Compra en cuotas', montoCuota: cuota, cantidad: n, primerMes: d.primerMes, medioId: d.medioId || null, personaId: d.personaId || null });
    }
    const datos = {
      fecha: leerFecha(d.fecha), lineaId: d.lineaId, monto, descripcion: d.descripcion.trim(),
      medioId: d.medioId || null, personaId: d.personaId || null, proyectoId: d.proyectoId || null
    };
    if (mov) {
      const m = hogar.movimientos.find((x) => x.id === mov.id);
      if (m) Object.assign(m, datos);
      return m;
    }
    const nuevo = { id: nuevoId('mv'), origen: null, importado: null, ...datos };
    hogar.movimientos.push(nuevo);
    return nuevo;
  });
}

export async function dialogoCompraCuotas({ compra = null, lineaId = null } = {}) {
  const hg = estado.hogar;
  const l = buscarLinea(hg, compra ? compra.lineaId : lineaId);
  const r = await dialogo({
    titulo: compra ? 'Compra en cuotas' : 'Nueva compra en cuotas',
    cuerpo: h`
      <p class="apagado">Concepto: <strong>${l ? l.nombre : ''}</strong>. Cada cuota aparece sola en el mes que le toca.</p>
      <div class="campo"><label>Qué se compró</label><input class="entrada" name="descripcion" value="${compra ? compra.descripcion : ''}" autofocus></div>
      <div class="fila-campos">
        <div class="campo"><label>Valor de cada cuota</label><input class="entrada monto" name="cuota" value="${compra ? valorMonto(compra.montoCuota) : ''}"></div>
        <div class="campo"><label>Cantidad de cuotas</label><input class="entrada" type="number" min="1" max="60" name="cantidad" value="${compra ? compra.cantidad : 6}"></div>
        <div class="campo"><label>Primera cuota</label><select class="entrada" name="primerMes">${opcionesMeses(sumarMeses(mesActual(), -12), 25, compra ? compra.primerMes : sumarMeses(mesActual(), 1))}</select></div>
      </div>`,
    botones: [
      ...(compra ? [{ texto: 'Borrar', valor: 'borrar', tipo: 'peligro', izquierda: true }] : []),
      { texto: 'Cancelar', valor: 'no' }, { texto: 'Guardar', valor: 'ok', tipo: 'primario' }
    ],
    validar: (d) => (!(leerMonto(d.cuota) > 0) ? 'Escribí el valor de la cuota.' : null)
  });
  if (r.boton === 'borrar') { mutar((hogar) => { hogar.cuotas = hogar.cuotas.filter((c) => c.id !== compra.id); }); return; }
  if (r.boton !== 'ok') return;
  const d = r.datos;
  mutar((hogar) => {
    const datos = { descripcion: d.descripcion || 'Compra en cuotas', montoCuota: leerMonto(d.cuota), cantidad: Math.max(1, Math.min(60, Number(d.cantidad) || 1)), primerMes: d.primerMes };
    if (compra) Object.assign(hogar.cuotas.find((c) => c.id === compra.id), datos);
    else nuevaCompraEnCuotas(hogar, { lineaId: l.id, ...datos });
  });
}

// ── Meta de ahorro ──────────────────────────────────────────────────────────────
export async function dialogoMeta({ meta = null, mes = mesActual() } = {}) {
  const esFondo = meta && meta.tipo === 'fondo';
  const r = await dialogo({
    titulo: meta ? (esFondo ? 'Fondo de emergencia' : 'Meta de ahorro') : 'Nueva meta de ahorro',
    cuerpo: h`
      <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" value="${meta ? meta.nombre : ''}" placeholder="Ej.: Vacaciones, Auto, Mudanza" autofocus></div>
      ${esFondo ? h`
        <div class="campo"><label>Meses de gastos que tiene que cubrir</label><select class="entrada" name="mesesCobertura">${opciones([1, 2, 3, 4, 6, 9, 12].map((n) => [n, `${n} ${n === 1 ? 'mes' : 'meses'}`]), meta.mesesCobertura)}</select>
        <div class="ayuda">La meta se calcula sola con el promedio de gastos de los últimos meses. Se suele recomendar entre 3 y 6.</div></div>` : h`
        <div class="fila-campos">
          <div class="campo"><label>Cuánto querés juntar</label><input class="entrada monto" name="objetivo" value="${meta ? valorMonto(meta.objetivo) : ''}"></div>
          <div class="campo"><label>Para cuándo</label><select class="entrada" name="fecha">${opciones([['', 'Sin fecha'], ...Array.from({ length: 48 }, (_, i) => { const m = sumarMeses(mesActual(), i + 1); return [m, capitalizar(nombreMes(m))]; })], meta ? meta.fecha || '' : '')}</select></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label>En pesos de</label><select class="entrada" name="objetivoMes">${opcionesMeses(sumarMeses(mesActual(), -24), 25, meta ? meta.objetivoMes : mesActual())}</select><div class="ayuda">El mes de los precios del monto.</div></div>
          <div class="campo"><label>Moneda</label><select class="entrada" name="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], meta ? meta.moneda : 'ARS')}</select></div>
        </div>
        <label class="casilla"><input type="checkbox" name="ajustaIPC" ${!meta || meta.ajustaIPC ? crudo('checked') : ''}> Que la meta suba con la inflación (para que no quede corta)</label>`}
      <div class="fila-campos" style="margin-top:12px">
        <div class="campo"><label>Lo que ya tenés juntado</label><input class="entrada monto" name="saldoInicial" value="${meta ? valorMonto(meta.saldoInicial) : ''}" placeholder="0"></div>
        <div class="campo"><label>A partir de</label><select class="entrada" name="saldoInicialMes">${opcionesMeses(sumarMeses(mesActual(), -24), 25, meta ? meta.saldoInicialMes : mesActual())}</select></div>
      </div>
      ${meta ? '' : h`<div class="campo"><label>Aporte por mes (opcional)</label><input class="entrada monto" name="aporte" placeholder="Se puede calcular después"></div>`}`,
    botones: [
      ...(meta && !esFondo ? [{ texto: 'Borrar meta', valor: 'borrar', tipo: 'peligro', izquierda: true }] : []),
      { texto: 'Cancelar', valor: 'no' }, { texto: meta ? 'Guardar' : 'Crear meta', valor: 'ok', tipo: 'primario' }
    ],
    validar: (d) => (!d.nombre.trim() ? 'Poné un nombre.' : (!esFondo && !(leerMonto(d.objetivo) > 0) ? 'Escribí cuánto querés juntar.' : null))
  });
  if (r.boton === 'borrar') {
    mutar((hogar) => borrarLinea(hogar, meta.lineaId));
    return null;
  }
  if (r.boton !== 'ok') return null;
  const d = r.datos;
  return mutar((hogar) => {
    if (meta) {
      const m = hogar.metas.find((x) => x.id === meta.id);
      m.nombre = d.nombre.trim();
      if (esFondo) m.mesesCobertura = Number(d.mesesCobertura) || 3;
      else Object.assign(m, { objetivo: leerMonto(d.objetivo), fecha: d.fecha || null, objetivoMes: d.objetivoMes, moneda: d.moneda, ajustaIPC: !!d.ajustaIPC });
      m.saldoInicial = leerMonto(d.saldoInicial) || 0;
      m.saldoInicialMes = d.saldoInicialMes;
      const l = buscarLinea(hogar, m.lineaId);
      if (l) { l.nombre = m.nombre; l.moneda = m.moneda; }
      return m;
    }
    const m = nuevaMeta(hogar, {
      nombre: d.nombre.trim(), objetivo: leerMonto(d.objetivo), fecha: d.fecha || null, objetivoMes: d.objetivoMes,
      moneda: d.moneda, ajustaIPC: !!d.ajustaIPC, saldoInicial: leerMonto(d.saldoInicial) || 0, saldoInicialMes: d.saldoInicialMes
    });
    cargarDesde(hogar, m.lineaId, mes > mesActual() ? mes : mesActual(), leerMonto(d.aporte));
    return m;
  });
}

// ── Deuda o préstamo ────────────────────────────────────────────────────────────
export async function dialogoDeuda({ deuda = null } = {}) {
  const r = await dialogo({
    titulo: deuda ? 'Préstamo' : 'Nuevo préstamo o deuda en cuotas',
    cuerpo: h`
      <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" value="${deuda ? deuda.nombre : ''}" placeholder="Ej.: Préstamo personal, Plan de pagos AFIP" autofocus></div>
      <div class="fila-campos">
        <div class="campo"><label>Cuota mensual</label><input class="entrada monto" name="cuota" value="${deuda ? valorMonto(deuda.cuota) : ''}"></div>
        <div class="campo"><label>Cantidad de cuotas</label><input class="entrada" type="number" min="1" max="360" name="cuotas" value="${deuda ? deuda.cuotas : 12}"></div>
        <div class="campo"><label>Primera cuota</label><select class="entrada" name="primerMes">${opcionesMeses(sumarMeses(mesActual(), -60), 73, deuda ? deuda.primerMes : sumarMeses(mesActual(), 1))}</select></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label>Monto que te prestaron (opcional)</label><input class="entrada monto" name="montoOriginal" value="${deuda && deuda.montoOriginal ? valorMonto(deuda.montoOriginal) : ''}"></div>
        <div class="campo"><label>Moneda</label><select class="entrada" name="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], deuda ? deuda.moneda : 'ARS')}</select></div>
      </div>
      <p class="chico apagado">Las cuotas aparecen solas en la planilla. Si una cuota cambia (préstamos en UVA, por ejemplo), escribí el monto real en el mes que corresponda.</p>`,
    botones: [
      ...(deuda ? [{ texto: 'Borrar', valor: 'borrar', tipo: 'peligro', izquierda: true }] : []),
      { texto: 'Cancelar', valor: 'no' }, { texto: 'Guardar', valor: 'ok', tipo: 'primario' }
    ],
    validar: (d) => (!d.nombre.trim() ? 'Poné un nombre.' : !(leerMonto(d.cuota) > 0) ? 'Escribí la cuota.' : null)
  });
  if (r.boton === 'borrar') {
    mutar((hogar) => borrarLinea(hogar, deuda.lineaId));
    return null;
  }
  if (r.boton !== 'ok') return null;
  const d = r.datos;
  return mutar((hogar) => {
    const datos = { nombre: d.nombre.trim(), cuota: leerMonto(d.cuota), cuotas: Math.max(1, Number(d.cuotas) || 1), primerMes: d.primerMes, montoOriginal: leerMonto(d.montoOriginal) || 0, moneda: d.moneda };
    if (deuda) {
      const x = hogar.deudas.find((y) => y.id === deuda.id);
      Object.assign(x, datos);
      const l = buscarLinea(hogar, x.lineaId);
      if (l) { l.nombre = x.nombre; l.moneda = x.moneda; }
      return x;
    }
    return nuevaDeuda(hogar, datos);
  });
}

// ── Inversión ───────────────────────────────────────────────────────────────────
export async function dialogoInversion({ inversion = null } = {}) {
  const pf = inversion && inversion.plazoFijo;
  const r = await dialogo({
    titulo: inversion ? 'Inversión' : 'Nueva inversión',
    cuerpo: h`
      <div class="fila-campos">
        <div class="campo"><label>Nombre</label><input class="entrada" name="nombre" value="${inversion ? inversion.nombre : ''}" placeholder="Ej.: Plazo fijo Banco Nación" autofocus></div>
        <div class="campo"><label>Tipo</label><select class="entrada" name="tipo">${opciones(Object.entries(TIPOS_INVERSION), inversion ? inversion.tipo : 'plazo_fijo')}</select></div>
        <div class="campo"><label>Moneda</label><select class="entrada" name="moneda">${opciones([['ARS', 'Pesos'], ['USD', 'Dólares']], inversion ? inversion.moneda : 'ARS')}</select></div>
      </div>
      <div data-pf>
        <div class="fila-campos">
          <div class="campo"><label>Capital</label><input class="entrada monto" name="capital" value="${pf ? valorMonto(pf.capital) : ''}"></div>
          <div class="campo"><label>Tasa nominal anual (TNA, %)</label><input class="entrada monto" name="tna" value="${pf ? String(pf.tna).replace('.', ',') : ''}"></div>
        </div>
        <div class="fila-campos">
          <div class="campo"><label>Fecha de inicio</label><input class="entrada" type="date" name="inicio" value="${pf ? pf.inicio : hoy()}"></div>
          <div class="campo"><label>Plazo (días)</label><input class="entrada" type="number" min="1" name="dias" value="${pf ? pf.dias : 30}"></div>
        </div>
        <label class="casilla"><input type="checkbox" name="renovar" ${!pf || pf.renovar ? crudo('checked') : ''}> Se renueva solo con los intereses</label>
      </div>
      <p class="chico apagado" style="margin-top:10px">Lo que ponés o sacás cada mes se carga en la planilla, en la sección Inversiones (un número negativo es un rescate). El valor actual de fondos, acciones o cripto se actualiza desde Ahorro y deudas.</p>`,
    botones: [
      ...(inversion ? [{ texto: 'Borrar', valor: 'borrar', tipo: 'peligro', izquierda: true }] : []),
      { texto: 'Cancelar', valor: 'no' }, { texto: 'Guardar', valor: 'ok', tipo: 'primario' }
    ],
    validar: (d) => (!d.nombre.trim() ? 'Poné un nombre.' : null),
    alAbrir: (form) => {
      const tipo = form.querySelector('[name=tipo]');
      const act = () => { form.querySelector('[data-pf]').style.display = tipo.value === 'plazo_fijo' ? '' : 'none'; };
      tipo.addEventListener('change', act); act();
    }
  });
  if (r.boton === 'borrar') {
    mutar((hogar) => borrarLinea(hogar, inversion.lineaId));
    return null;
  }
  if (r.boton !== 'ok') return null;
  const d = r.datos;
  return mutar((hogar) => {
    const plazoFijo = d.tipo === 'plazo_fijo' ? {
      capital: leerMonto(d.capital) || 0, tna: Number(String(d.tna).replace(',', '.')) || 0,
      inicio: leerFecha(d.inicio) || hoy(), dias: Math.max(1, Number(d.dias) || 30), renovar: !!d.renovar
    } : null;
    if (inversion) {
      const x = hogar.inversiones.find((y) => y.id === inversion.id);
      Object.assign(x, { nombre: d.nombre.trim(), tipo: d.tipo, moneda: d.moneda, plazoFijo });
      const l = buscarLinea(hogar, x.lineaId);
      if (l) { l.nombre = x.nombre; l.moneda = x.moneda; }
      return x;
    }
    const x = nuevaInversion(hogar, { nombre: d.nombre.trim(), tipo: d.tipo, moneda: d.moneda, plazoFijo });
    // El capital de un plazo fijo ya empezado se registra como aporte de ese mes.
    if (plazoFijo && plazoFijo.capital > 0) {
      const mes = plazoFijo.inicio.slice(0, 7);
      if (mes <= mesActual()) fijarReal(hogar, x.lineaId, mes, plazoFijo.capital);
    }
    return x;
  });
}
