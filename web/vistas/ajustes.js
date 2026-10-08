// Mi Presupuesto · ajustes del hogar y del programa

import { estado, mutar, notificar, guardarAjustes, cargarHogar, irA } from '../estado.js';
import { h, crudo, montar, icono, opciones, dialogo, confirmar, avisar } from '../ui.js';
import { REGIONES, COTIZACIONES } from '../lib/catalogo.js';
import { guardarComo } from '../acciones.js';
import { aplicarTemaDesdeAjustes } from './tema.js';

let claudeEstado = null;
let respaldos = null;

function render(raiz) {
  const hg = estado.hogar;
  const irClaude = estado.opcionesVista && estado.opcionesVista.seccion === 'claude';
  if (irClaude) estado.opcionesVista = null;
  montar(raiz, h`<div class="pagina">
    <div class="encabezado-pagina"><div><h1>Ajustes</h1></div></div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Este hogar</h2></div>
      <div class="fila-campos">
        <div class="campo"><label>Nombre</label><input class="entrada" data-hogar="nombre" value="${hg.nombre}"></div>
        <div class="campo"><label>Región</label><select class="entrada" data-hogar="region">${opciones(REGIONES.map((r) => [r.clave, `${r.nombre} · ${r.detalle}`]), hg.region)}</select></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label>Vivienda</label><select class="entrada" data-hogar="vivienda">${opciones([['', 'Sin indicar'], ['alquilada', 'Alquilada'], ['propia', 'Propia'], ['otra', 'Otra']], hg.vivienda || '')}</select></div>
        <div class="campo"><label>Cotización del dólar</label><select class="entrada" data-hogar="dolar">${opciones(Object.entries(COTIZACIONES), hg.dolar)}</select></div>
      </div>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Archivo y contraseña</h2></div>
      ${estado.ejemplo ? h`<p>Es el hogar de ejemplo: todavía no está guardado.</p><button class="boton primario" data-accion="guardar-como">${icono('guardar')}Guardar una copia</button>`
        : estado.ruta ? h`<p class="ruta-archivo">${icono('archivo')}<span>${estado.ruta}</span></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="boton" data-accion="mostrar">${icono('carpeta')}Mostrar en la carpeta</button>
          <button class="boton" data-accion="guardar-como">${icono('guardar')}Guardar una copia como…</button>
          <button class="boton" data-accion="clave">${icono(estado.cifrado ? 'candado' : 'abierto')}${estado.cifrado ? 'Cambiar o quitar la contraseña' : 'Ponerle contraseña'}</button>
        </div>
        <p class="chico apagado" style="margin-top:8px">${estado.cifrado ? 'El archivo está cifrado (AES-256): sin la contraseña no se puede abrir.' : 'El archivo no tiene contraseña: cualquiera que lo abra puede verlo.'}</p>`
        : h`<p>Este hogar todavía no está guardado.</p><button class="boton primario" data-accion="guardar-como">${icono('guardar')}Guardar</button>`}
      ${estado.ruta ? h`<h3 style="margin-top:18px">Respaldos</h3><p class="chico apagado">Antes del primer guardado de cada sesión y una vez por día se guarda una copia. Se guardan las últimas 30.</p>
        <div id="respaldos"></div>` : ''}
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Medios de pago</h2></div>
      <div class="lista-editable">${hg.medios.map((m) => h`<div class="fila-editable"><input class="entrada" data-medio="${m.id}" value="${m.nombre}"><button class="boton icono chico fantasma" data-accion="quitar-medio" data-id="${m.id}" aria-label="Quitar">${icono('cerrar')}</button></div>`)}</div>
      <button class="boton chico" data-accion="agregar-medio" style="margin-top:6px">${icono('mas')}Agregar medio de pago</button>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Nombres de las categorías</h2><span class="apagado chico">cada una sigue usando el IPC de su categoría del INDEC</span></div>
      <div class="lista-editable columnas">${hg.categorias.filter((c) => c.seccion === 'gastos').map((c) => h`<div class="fila-editable"><input class="entrada" data-categoria="${c.id}" value="${c.nombre}"></div>`)}</div>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Apariencia</h2></div>
      <div class="segmentado">${[['sistema', 'Como Windows'], ['claro', 'Claro'], ['oscuro', 'Oscuro']].map(([k, t]) => h`<button class="${(estado.ajustes.tema || 'sistema') === k ? 'activo' : ''}" data-tema="${k}">${t}</button>`)}</div>
    </div>

    <div class="tarjeta" id="claude"><div class="tarjeta-titulo"><h2>${icono('chispa')} Consejo con Claude (opcional)</h2></div>
      <div id="claude-estado"><p class="apagado">Cargando…</p></div>
    </div>

    <div class="tarjeta"><div class="tarjeta-titulo"><h2>Acerca de Mi Presupuesto</h2></div>
      <p>Versión ${estado.info.version} · código abierto con licencia MIT.</p>
      <p class="apagado chico">Tus datos quedan en tu computadora, en el archivo de cada hogar. El programa se conecta a internet solo para bajar los datos públicos (IPC, canasta, dólar, REM), avisar si hay una versión nueva y, si lo usás, pedir consejo a Claude.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="boton" data-accion="version">${icono('refrescar')}Buscar versión nueva</button>
        <button class="boton" data-accion="proyecto">${icono('enlace')}Página del proyecto</button>
        <button class="boton fantasma" data-accion="recorrido">Ver el recorrido guiado</button>
      </div>
    </div>
  </div>`);

  raiz.addEventListener('change', (e) => cambio(e));
  raiz.addEventListener('click', (e) => clic(e));
  dibujarClaude(raiz);
  if (estado.ruta) dibujarRespaldos(raiz);
  if (irClaude) setTimeout(() => raiz.querySelector('#claude').scrollIntoView({ block: 'start' }), 30);
}

async function dibujarClaude(raiz) {
  claudeEstado = await window.mp.claude.estado();
  const cont = raiz.querySelector('#claude-estado');
  if (!cont) return;
  const modelo = estado.ajustes.claudeModelo || claudeEstado.porDefecto;
  montar(cont, h`
    <p class="apagado">Con tu clave de API de Anthropic, el botón "Pedir consejo" de Análisis le manda a Claude un resumen con los totales por categoría y te devuelve sugerencias. La clave se guarda cifrada con la protección de Windows y nunca se manda a otro lado.</p>
    ${claudeEstado.tieneClave
      ? h`<p>${icono('ok')} Hay una clave guardada. <button class="boton chico peligro" data-accion="borrar-clave">Borrarla</button></p>`
      : h`<div class="fila-campos" style="align-items:end"><div class="campo"><label>Clave de API</label><input class="entrada" type="password" id="clave-claude" placeholder="sk-ant-…" autocomplete="off"></div>
          <div class="campo"><button class="boton primario" data-accion="guardar-clave">Guardar clave</button></div></div>
        <p class="chico apagado">Se consigue en console.anthropic.com (hace falta cargar crédito). <button class="enlace" data-accion="consola">Abrir la consola de Anthropic</button></p>`}
    <div class="campo" style="margin-top:10px"><label>Modelo</label><select class="entrada" data-modelo>${opciones(Object.entries(claudeEstado.modelos).map(([k, m]) => [k, `${m.nombre}${k === claudeEstado.porDefecto ? ' (recomendado)' : ''} · ${m.detalle}`]), modelo)}</select>
      <div class="ayuda">Una consulta usa unos pocos miles de tokens: con el modelo recomendado cuesta del orden de un par de centavos de dólar.</div></div>`);
}

async function dibujarRespaldos(raiz) {
  respaldos = await window.mp.archivo.respaldos();
  const cont = raiz.querySelector('#respaldos');
  if (!cont) return;
  montar(cont, respaldos.length ? h`<table class="tabla"><tbody>${respaldos.slice(0, 8).map((r) => h`<tr><td>${new Date(r.fecha).toLocaleString('es-AR')}</td><td class="der chico apagado">${Math.round(r.tamano / 1024)} KB</td>
      <td class="der"><button class="boton chico" data-accion="abrir-respaldo" data-ruta="${r.archivo}">Abrir como copia</button></td></tr>`)}</tbody></table>
      <button class="boton chico fantasma" data-accion="carpeta-respaldos" style="margin-top:6px">${icono('carpeta')}Abrir la carpeta de respaldos</button>`
    : h`<p class="apagado chico">Todavía no hay respaldos: se crea el primero la próxima vez que se guarde.</p>`);
}

async function cambio(e) {
  const t = e.target;
  if (t.dataset.hogar) {
    const campo = t.dataset.hogar;
    const v = t.value;
    if (campo === 'nombre' && !v.trim()) return;
    mutar((x) => { x[campo] = campo === 'vivienda' ? (v || null) : (campo === 'nombre' ? v.trim() : v); });
    if (campo === 'nombre') window.mp.app.titulo(`${v.trim()} · Mi Presupuesto`);
    return;
  }
  if (t.dataset.medio) { if (t.value.trim()) mutar((x) => { x.medios.find((m) => m.id === t.dataset.medio).nombre = t.value.trim(); }); return; }
  if (t.dataset.categoria) { if (t.value.trim()) mutar((x) => { x.categorias.find((c) => c.id === t.dataset.categoria).nombre = t.value.trim(); }); return; }
  if (t.matches('[data-modelo]')) { await guardarAjustes({ claudeModelo: t.value }); avisar('Modelo guardado.', { tipo: 'ok', duracion: 1500 }); }
}

async function clic(e) {
  const tema = e.target.closest('[data-tema]');
  if (tema) { await guardarAjustes({ tema: tema.dataset.tema }); aplicarTemaDesdeAjustes(); notificar('vista'); return; }
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const hg = estado.hogar;
  switch (b.dataset.accion) {
    case 'guardar-como': await guardarComo(); notificar('vista'); break;
    case 'mostrar': window.mp.app.mostrarEnCarpeta(estado.ruta); break;
    case 'clave': await dialogoClave(); break;
    case 'agregar-medio': mutar((x) => { x.medios.push({ id: `med_${Date.now().toString(36)}`, nombre: 'Nuevo medio de pago' }); }); break;
    case 'quitar-medio': {
      const usado = hg.movimientos.filter((m) => m.medioId === b.dataset.id).length;
      if (usado && !(await confirmar('Quitar medio de pago', `Hay ${usado} movimientos con este medio de pago: quedan sin indicar.`, { si: 'Quitar' }))) return;
      mutar((x) => { x.medios = x.medios.filter((m) => m.id !== b.dataset.id); x.movimientos.forEach((m) => { if (m.medioId === b.dataset.id) m.medioId = null; }); x.cuotas.forEach((c) => { if (c.medioId === b.dataset.id) c.medioId = null; }); });
      break;
    }
    case 'guardar-clave': {
      const v = document.getElementById('clave-claude').value.trim();
      if (!v) { avisar('Pegá la clave.'); return; }
      const r = await window.mp.claude.guardarClave(v);
      if (r.ok) { avisar('Clave guardada.', { tipo: 'ok' }); notificar('vista'); } else avisar(r.error, { tipo: 'error' });
      break;
    }
    case 'borrar-clave': if (await confirmar('Borrar la clave', 'Se borra la clave de API guardada en esta computadora.', { si: 'Borrar', peligro: true })) { await window.mp.claude.borrarClave(); notificar('vista'); } break;
    case 'consola': window.mp.app.externo('https://console.anthropic.com/'); break;
    case 'version': {
      const r = await window.mp.app.buscarVersion();
      if (r.nueva) { estado.versionNueva = r; avisar(`Hay una versión nueva: ${r.version}.`, { accion: { texto: 'Descargar', fn: () => window.mp.app.externo(r.url) } }); }
      else avisar(r.error ? `No se pudo buscar: ${r.error}` : 'Tenés la última versión.');
      break;
    }
    case 'proyecto': window.mp.app.externo(`https://github.com/${estado.info.repo}`); break;
    case 'recorrido': { irA('planilla'); const { iniciarRecorrido } = await import('./recorrido.js'); setTimeout(() => iniciarRecorrido(), 300); break; }
    case 'abrir-respaldo': {
      if (!(await confirmar('Abrir un respaldo', 'El respaldo se abre como una copia sin guardar: para quedártela, guardala con otro nombre. El archivo actual no se toca.', { si: 'Abrir' }))) return;
      const r = await window.mp.archivo.abrirRespaldo(b.dataset.ruta);
      if (!r.ok) { avisar(r.error || 'No se pudo abrir el respaldo.', { tipo: 'error' }); return; }
      cargarHogar(r.hogar, {});
      irA('planilla');
      avisar('Respaldo abierto como copia. Guardalo con "Guardar como" si lo querés conservar.', { duracion: 9000 });
      break;
    }
    case 'carpeta-respaldos': window.mp.archivo.carpetaRespaldos(); break;
    default: break;
  }
}

async function dialogoClave() {
  const r = await dialogo({
    titulo: estado.cifrado ? 'Contraseña del hogar' : 'Ponerle contraseña al hogar',
    cuerpo: h`<p class="apagado">Si la olvidás no hay forma de recuperar el archivo. ${estado.cifrado ? 'Dejá los campos vacíos para quitarla.' : ''}</p>
      <div class="campo"><label>Contraseña nueva</label><input class="entrada" type="password" name="a" autocomplete="new-password" autofocus></div>
      <div class="campo"><label>Repetila</label><input class="entrada" type="password" name="b" autocomplete="new-password"></div>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Guardar', valor: 'ok', tipo: 'primario' }],
    validar: (d) => (d.a !== d.b ? 'Las contraseñas no coinciden.' : (!d.a && !estado.cifrado ? 'Escribí una contraseña.' : null))
  });
  if (r.boton !== 'ok') return;
  const res = await window.mp.archivo.cambiarClave(JSON.stringify(estado.hogar), r.datos.a || null);
  if (res.ok) { estado.cifrado = res.cifrado; estado.guardado = 'guardado'; notificar('vista'); avisar(res.cifrado ? 'Contraseña guardada: el archivo quedó cifrado.' : 'Contraseña quitada.', { tipo: 'ok' }); }
  else avisar(res.error || 'No se pudo cambiar la contraseña.', { tipo: 'error' });
}

export default { titulo: 'Ajustes', icono: 'ajustes', render };
