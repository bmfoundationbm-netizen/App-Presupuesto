// Mi Presupuesto · acciones de archivo compartidas por las pantallas

import { estado, cargarHogar, cerrarHogar, guardarYa, notificar, irA } from './estado.js';
import { crearEjemplo } from './lib/ejemplo.js';
import { mesActual } from './lib/fechas.js';
import { avisar, dialogo, h, confirmar } from './ui.js';

async function pedirClave(ruta, error) {
  const nombre = String(ruta).split(/[\\/]/).pop();
  const r = await dialogo({
    titulo: 'Este hogar tiene contraseña',
    cuerpo: h`
      <p>Escribí la contraseña de <strong>${nombre}</strong>.</p>
      <div class="campo"><input class="entrada ${error ? 'invalida' : ''}" type="password" name="clave" autofocus autocomplete="current-password"></div>
      ${error ? h`<p class="chico" style="color:var(--critico-texto)">${error}</p>` : ''}
      <p class="chico apagado">Si la olvidaste no hay forma de recuperarla: probá con un respaldo sin contraseña, si lo hay.</p>`,
    botones: [{ texto: 'Cancelar', valor: 'no' }, { texto: 'Abrir', valor: 'ok', tipo: 'primario' }]
  });
  return r.boton === 'ok' ? r.datos.clave : null;
}

export async function abrirArchivo(ruta = null) {
  await guardarYa();
  let r = await window.mp.archivo.abrir(ruta);
  if (r.cancelado) return false;
  while (!r.ok && r.necesitaClave) {
    const clave = await pedirClave(r.ruta, r.error);
    if (clave === null) return false;
    r = await window.mp.archivo.abrirConClave(r.ruta, clave);
  }
  if (!r.ok) {
    avisar(r.error || 'No se pudo abrir el archivo.', { tipo: 'error', duracion: 7000 });
    return false;
  }
  let avisos;
  try { avisos = cargarHogar(r.hogar, { ruta: r.ruta, cifrado: r.cifrado }); }
  catch (e) { avisar(e.message, { tipo: 'error' }); return false; }
  irA('planilla');
  window.mp.app.titulo(`${estado.hogar.nombre} · Mi Presupuesto`);
  if (avisos.length) avisar(avisos.join(' '), { duracion: 8000 });
  return true;
}

export async function abrirEjemplo() {
  await guardarYa();
  await window.mp.archivo.cerrar();
  const h = crearEjemplo({ mesHoy: mesActual(), datos: estado.datos });
  cargarHogar(h, { ejemplo: true });
  irA('planilla');
  window.mp.app.titulo('Hogar de ejemplo · Mi Presupuesto');
}

// Guarda el hogar en un archivo nuevo (también sirve para guardar el ejemplo como propio).
export async function guardarComo({ clave } = {}) {
  if (!estado.hogar) return { ok: false };
  const opciones = clave !== undefined ? { clave } : {};
  const r = await window.mp.archivo.guardarComo(JSON.stringify(estado.hogar), estado.hogar.nombre, opciones);
  if (r.ok) {
    estado.ruta = r.ruta;
    estado.cifrado = r.cifrado;
    estado.ejemplo = false;
    estado.guardado = 'guardado';
    notificar('guardado');
    window.mp.app.titulo(`${estado.hogar.nombre} · Mi Presupuesto`);
    avisar('Hogar guardado.', { tipo: 'ok' });
  } else if (!r.cancelado) avisar(r.error || 'No se pudo guardar.', { tipo: 'error' });
  return r;
}

export async function cerrarArchivo() {
  if (estado.ejemplo && !(await confirmar('Cerrar el ejemplo', 'Los cambios que hiciste en el hogar de ejemplo no se guardan.', { si: 'Cerrar' }))) return;
  await guardarYa();
  await window.mp.archivo.cerrar();
  cerrarHogar();
  irA('inicio');
  window.mp.app.titulo('Mi Presupuesto');
}

export async function nuevoHogar() {
  await guardarYa();
  irA('asistente');
}
