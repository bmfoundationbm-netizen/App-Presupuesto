/* Mi Presupuesto · puente entre la ventana y el sistema
 * La ventana corre aislada (sin Node ni internet): solo puede pedir lo que está acá. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const pedir = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);
const escuchar = (canal) => (fn) => {
  const h = (_e, ...args) => fn(...args);
  ipcRenderer.on(canal, h);
  return () => ipcRenderer.removeListener(canal, h);
};

contextBridge.exposeInMainWorld('mp', {
  archivo: {
    abrir: pedir('archivo:abrir'),
    abrirConClave: pedir('archivo:abrir-con-clave'),
    guardar: pedir('archivo:guardar'),
    guardarComo: pedir('archivo:guardar-como'),
    cambiarClave: pedir('archivo:cambiar-clave'),
    cerrar: pedir('archivo:cerrar'),
    estado: pedir('archivo:estado'),
    recientes: pedir('archivo:recientes'),
    quitarReciente: pedir('archivo:quitar-reciente'),
    pendiente: pedir('archivo:pendiente'),
    respaldos: pedir('archivo:respaldos'),
    abrirRespaldo: pedir('archivo:abrir-respaldo'),
    carpetaRespaldos: pedir('archivo:carpeta-respaldos'),
    alAbrirDesdeSistema: escuchar('mp:abrir-desde-sistema')
  },
  datos: {
    obtener: pedir('datos:obtener'),
    actualizar: pedir('datos:actualizar'),
    dolarHoy: pedir('datos:dolar-hoy'),
    alActualizar: escuchar('mp:datos-nuevos')
  },
  exportar: {
    excel: pedir('exportar:excel'),
    pdf: pedir('exportar:pdf'),
    texto: pedir('exportar:texto')
  },
  importar: { elegir: pedir('importar:elegir') },
  claude: {
    estado: pedir('claude:estado'),
    guardarClave: pedir('claude:guardar-clave'),
    borrarClave: pedir('claude:borrar-clave'),
    consultar: pedir('claude:consultar'),
    alTexto: escuchar('mp:claude-texto')
  },
  ajustes: { leer: pedir('ajustes:leer'), guardar: pedir('ajustes:guardar') },
  app: {
    info: pedir('app:info'),
    externo: pedir('app:externo'),
    mostrarEnCarpeta: pedir('app:mostrar-en-carpeta'),
    buscarVersion: pedir('app:buscar-version'),
    titulo: pedir('app:titulo'),
    listoParaCerrar: pedir('app:listo-para-cerrar'),
    alAntesDeCerrar: escuchar('mp:antes-de-cerrar'),
    alVersionNueva: escuchar('mp:version-nueva')
  }
});
