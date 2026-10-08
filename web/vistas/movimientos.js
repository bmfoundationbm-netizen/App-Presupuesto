// Mi Presupuesto · movimientos (gastos e ingresos cargados uno por uno)

import { estado, notificar } from '../estado.js';
import { h, montar, icono, opciones, montoTexto, pesosRedondos, avisar } from '../ui.js';
import { aPesos } from '../lib/calculos.js';
import { categoria, seccionDeLinea } from '../lib/modelo.js';
import { SECCIONES } from '../lib/catalogo.js';
import { formatoFecha, nombreMes, capitalizar, mesActual, sumarMeses } from '../lib/fechas.js';
import { formatear } from '../lib/dinero.js';
import { dialogoMovimiento, dialogoCompraCuotas } from './dialogos.js';
import { abrirImportacion } from './importar.js';

const LIMITE = 400;

function filtros() {
  if (!estado.ui.movFiltros) estado.ui.movFiltros = { mes: '', lineaId: '', medioId: '', personaId: '', texto: '', limite: LIMITE };
  if (estado.opcionesVista && estado.opcionesVista.mes) { estado.ui.movFiltros.mes = estado.opcionesVista.mes; estado.opcionesVista = null; }
  return estado.ui.movFiltros;
}

function filtrar(hg, f) {
  const t = f.texto.trim().toLowerCase();
  return hg.movimientos.filter((m) => (!f.mes || m.fecha.startsWith(f.mes)) && (!f.lineaId || m.lineaId === f.lineaId) &&
    (!f.medioId || m.medioId === f.medioId) && (!f.personaId || m.personaId === f.personaId) &&
    (!t || (m.descripcion || '').toLowerCase().includes(t))).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function render(raiz) {
  const hg = estado.hogar;
  const ctx = estado.ctx;
  const f = filtros();
  const lista = filtrar(hg, f);
  const meses = [...new Set(hg.movimientos.map((m) => m.fecha.slice(0, 7)))].sort().reverse();
  if (!meses.includes(mesActual())) meses.unshift(mesActual());
  const lineaDe = new Map(hg.lineas.map((l) => [l.id, l]));
  const total = lista.reduce((s, m) => { const l = lineaDe.get(m.lineaId); return s + aPesos(ctx, m.monto, l ? l.moneda : 'ARS', m.fecha.slice(0, 7)); }, 0);
  const grupos = SECCIONES.map((s) => [s.nombre, hg.lineas.filter((l) => seccionDeLinea(hg, l) === s.clave && !l.auto)]).filter(([, ls]) => ls.length);
  const medio = (id) => (hg.medios.find((m) => m.id === id) || {}).nombre || '';
  const persona = (id) => (hg.integrantes.find((p) => p.id === id) || {}).nombre || '';
  const pendientes = hg.cuotas.filter((c) => sumarMeses(c.primerMes, c.cantidad - 1) >= mesActual());

  montar(raiz, h`<div class="pagina ancha">
    <div class="encabezado-pagina"><div><h1>Movimientos</h1><div class="subtitulo">Los gastos e ingresos cargados uno por uno. La planilla los suma en el mes de cada uno.</div></div>
      <span class="espacio"></span>
      <button class="boton" data-accion="exportar">${icono('exportar')}Exportar CSV</button>
      <button class="boton" data-accion="importar">${icono('importar')}Importar del banco o de un Excel</button>
      <button class="boton primario" data-accion="nuevo">${icono('mas')}Cargar gasto</button></div>
    <div class="filtros">
      <select class="entrada" data-f="mes">${opciones([['', 'Todos los meses'], ...meses.map((m) => [m, capitalizar(nombreMes(m))])], f.mes)}</select>
      <select class="entrada" data-f="lineaId"><option value="">Todos los conceptos</option>${grupos.map(([g, ls]) => h`<optgroup label="${g}">${opciones(ls.map((l) => [l.id, l.nombre]), f.lineaId)}</optgroup>`)}</select>
      <select class="entrada" data-f="medioId">${opciones([['', 'Cualquier medio de pago'], ...hg.medios.map((m) => [m.id, m.nombre])], f.medioId)}</select>
      ${hg.integrantes.length ? h`<select class="entrada" data-f="personaId">${opciones([['', 'Todas las personas'], ...hg.integrantes.map((p) => [p.id, p.nombre])], f.personaId)}</select>` : ''}
      <input class="entrada" data-f="texto" placeholder="Buscar en la descripción" value="${f.texto}">
      ${f.mes || f.lineaId || f.medioId || f.personaId || f.texto ? h`<button class="boton fantasma" data-accion="limpiar">Limpiar filtros</button>` : ''}
    </div>
    <div class="tarjeta" style="padding:0">
      ${lista.length ? h`<table class="tabla tabla-movs"><thead><tr><th>Fecha</th><th>Concepto</th><th>Descripción</th><th>Medio</th>${hg.integrantes.length ? h`<th>Persona</th>` : ''}<th class="der">Monto</th><th></th></tr></thead>
        <tbody>${lista.slice(0, f.limite).map((m) => {
          const l = lineaDe.get(m.lineaId);
          const c = l && categoria(hg, l.categoriaId);
          return h`<tr data-mov="${m.id}" class="clicable">
            <td class="num">${formatoFecha(m.fecha)}</td>
            <td>${l ? l.nombre : '—'}${c && c.seccion === 'gastos' ? h`<div class="chico apagado">${c.nombre}</div>` : ''}</td>
            <td>${m.descripcion}${m.origen === 'cierre' ? h` <span class="etiqueta-chip">cierre de mes</span>` : ''}${m.importado ? h` <span class="etiqueta-chip">importado</span>` : ''}${m.proyectoId ? h` <span class="etiqueta-chip acento">proyecto</span>` : ''}</td>
            <td>${medio(m.medioId)}</td>
            ${hg.integrantes.length ? h`<td>${persona(m.personaId)}</td>` : ''}
            <td class="der" style="${m.monto < 0 ? 'color:var(--critico-texto)' : ''}">${montoTexto(m.monto, l ? l.moneda : 'ARS')}</td>
            <td><button class="acciones-linea" data-accion="editar" data-mov="${m.id}" aria-label="Editar">${icono('editar')}</button></td></tr>`;
        })}</tbody>
        <tfoot><tr><td colspan="${hg.integrantes.length ? 5 : 4}">${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}</td><td class="der">${pesosRedondos(total)}</td><td></td></tr></tfoot></table>
        ${lista.length > f.limite ? h`<div style="padding:10px;text-align:center"><button class="boton" data-accion="mas">Mostrar ${Math.min(LIMITE, lista.length - f.limite)} más</button></div>` : ''}`
      : h`<div class="vacio">${icono('movimientos')}<p>${hg.movimientos.length ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no cargaste gastos sueltos. Podés escribir los totales directo en la planilla, o cargar cada gasto acá.'}</p></div>`}
    </div>
    ${pendientes.length ? h`<div class="tarjeta" style="margin-top:14px"><div class="tarjeta-titulo"><h2>Compras en cuotas en curso</h2></div>
      <table class="tabla"><thead><tr><th>Compra</th><th>Concepto</th><th>Cuotas</th><th>Hasta</th><th class="der">Cuota</th><th></th></tr></thead>
      <tbody>${pendientes.map((c) => { const l = lineaDe.get(c.lineaId); return h`<tr><td>${c.descripcion}</td><td>${l ? l.nombre : ''}</td><td>${c.cantidad}</td><td>${capitalizar(nombreMes(sumarMeses(c.primerMes, c.cantidad - 1)))}</td><td class="der">${montoTexto(c.montoCuota, l ? l.moneda : 'ARS')}</td>
        <td><button class="acciones-linea" data-accion="editar-cuota" data-c="${c.id}" aria-label="Editar">${icono('editar')}</button></td></tr>`; })}</tbody></table></div>` : ''}
  </div>`);

  raiz.addEventListener('change', (e) => {
    const el = e.target.closest('[data-f]');
    if (!el) return;
    f[el.dataset.f] = el.value;
    f.limite = LIMITE;
    notificar('filtro');
  });
  raiz.addEventListener('input', (e) => {
    const el = e.target.closest('[data-f="texto"]');
    if (!el) return;
    f.texto = el.value;
    clearTimeout(raiz._t);
    raiz._t = setTimeout(() => {
      notificar('filtro');
      const nuevo = document.querySelector('[data-f="texto"]');
      if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
    }, 250);
  });
  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    const fila = e.target.closest('tr[data-mov]');
    if (b) {
      switch (b.dataset.accion) {
        case 'nuevo': await dialogoMovimiento({ lineaId: f.lineaId || null }); break;
        case 'importar': abrirImportacion(); break;
        case 'editar': await dialogoMovimiento({ mov: hg.movimientos.find((m) => m.id === b.dataset.mov) }); break;
        case 'editar-cuota': await dialogoCompraCuotas({ compra: hg.cuotas.find((c) => c.id === b.dataset.c) }); break;
        case 'limpiar': Object.assign(f, { mes: '', lineaId: '', medioId: '', personaId: '', texto: '', limite: LIMITE }); notificar('filtro'); break;
        case 'mas': f.limite += LIMITE; notificar('filtro'); break;
        case 'exportar': exportarCsv(lista, lineaDe, medio, persona); break;
        default: break;
      }
      return;
    }
    if (fila) await dialogoMovimiento({ mov: hg.movimientos.find((m) => m.id === fila.dataset.mov) });
  });
}

async function exportarCsv(lista, lineaDe, medio, persona) {
  if (!lista.length) { avisar('No hay movimientos para exportar.'); return; }
  const celda = (x) => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = [['Fecha', 'Concepto', 'Descripción', 'Medio de pago', 'Persona', 'Moneda', 'Monto'].join(';')];
  for (const m of lista) {
    const l = lineaDe.get(m.lineaId);
    filas.push([formatoFecha(m.fecha), l ? l.nombre : '', m.descripcion, medio(m.medioId), persona(m.personaId), l ? l.moneda : 'ARS', formatear(m.monto, { decimales: true }).replace(/\./g, '')].map(celda).join(';'));
  }
  const r = await window.mp.exportar.texto(filas.join('\r\n'), `Movimientos ${estado.hogar.nombre}.csv`);
  if (r.ok) avisar('Movimientos exportados.', { tipo: 'ok', accion: { texto: 'Mostrar', fn: () => window.mp.app.mostrarEnCarpeta(r.ruta) } });
}

export default { titulo: 'Movimientos', icono: 'movimientos', render };
