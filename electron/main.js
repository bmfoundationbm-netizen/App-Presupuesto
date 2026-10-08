/* Mi Presupuesto · proceso principal de Electron */
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, session, nativeTheme } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const archivo = require('./archivo');
const ajustes = require('./ajustes');
const datos = require('./datos');
const exportar = require('./exportar');
const claude = require('./claude');

const WEB = path.join(__dirname, '..', 'web');
const RAIZ = path.join(__dirname, '..');
const VENDOR = {
  'vendor/d3.min.js': path.join(RAIZ, 'node_modules', 'd3', 'dist', 'd3.min.js'),
  'vendor/d3-sankey.min.js': path.join(RAIZ, 'node_modules', 'd3-sankey', 'dist', 'd3-sankey.min.js')
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};
const FILTRO_HOGAR = [{ name: 'Hogar de Mi Presupuesto', extensions: ['presupuesto'] }];

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } }
]);

let ventana = null;
let cerrando = false;
let archivoPendiente = archivoDeArgumentos(process.argv);

function archivoDeArgumentos(argv) {
  const a = argv.slice(app.isPackaged ? 1 : 2).find((x) => /\.presupuesto$/i.test(x));
  return a ? path.resolve(a) : null;
}

// Una sola instancia: si se abre otro archivo con doble clic, va a la ventana abierta.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const ruta = archivoDeArgumentos(argv);
    if (ventana) {
      if (ventana.isMinimized()) ventana.restore();
      ventana.focus();
      if (ruta) ventana.webContents.send('mp:abrir-desde-sistema', ruta);
    }
  });
}

function colorDeFondo() {
  const tema = ajustes.leer().tema;
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && nativeTheme.shouldUseDarkColors);
  return oscuro ? '#14171d' : '#f5f6f8';
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    backgroundColor: colorDeFondo(),
    show: false,
    title: 'Mi Presupuesto',
    icon: path.join(RAIZ, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  Menu.setApplicationMenu(null);
  ventana.once('ready-to-show', () => ventana.show());
  ventana.loadURL('app://mp/index.html');

  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  ventana.webContents.on('will-navigate', (e, url) => { if (url !== ventana.webContents.getURL()) e.preventDefault(); });

  // Antes de cerrar, la ventana guarda lo pendiente y avisa (con un tope de 4 segundos).
  ventana.on('close', (e) => {
    if (cerrando) return;
    e.preventDefault();
    ventana.webContents.send('mp:antes-de-cerrar');
    setTimeout(() => { cerrando = true; if (ventana) ventana.close(); }, 4000);
  });
  ventana.on('closed', () => { ventana = null; });
}

async function servir(req) {
  const u = new URL(req.url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
  let ruta = VENDOR[rel];
  if (!ruta) {
    ruta = path.resolve(WEB, rel);
    if (!ruta.startsWith(path.resolve(WEB) + path.sep)) return new Response('Prohibido', { status: 403 });
  }
  try {
    const cuerpo = await fs.readFile(ruta);
    return new Response(cuerpo, { headers: { 'content-type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } });
  } catch (e) {
    return new Response('No encontrado', { status: 404 });
  }
}

app.whenReady().then(() => {
  protocol.handle('app', servir);
  // La ventana no sale a internet: todo lo que necesita red lo hace este proceso.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  crearVentana();

  // Datos públicos nuevos: al rato de abrir y cada 6 horas.
  const buscarDatos = async () => {
    const r = await datos.actualizar();
    if (r.estado === 'nuevos' && ventana) ventana.webContents.send('mp:datos-nuevos', r);
  };
  setTimeout(buscarDatos, 8000);
  setInterval(buscarDatos, 6 * 3600 * 1000);
  // Versión nueva del programa: al rato de abrir y una vez por día.
  const buscarVersion = async () => {
    const r = await datos.buscarVersion();
    if (r.nueva && ventana) ventana.webContents.send('mp:version-nueva', r);
  };
  setTimeout(buscarVersion, 20000);
  setInterval(buscarVersion, 24 * 3600 * 1000);
});

app.on('window-all-closed', () => app.quit());

// ── Archivos de hogar ──────────────────────────────────────────────────────────────
const nombreDe = (ruta) => path.basename(ruta, path.extname(ruta));

ipcMain.handle('archivo:abrir', async (_e, ruta) => {
  if (!ruta) {
    const r = await dialog.showOpenDialog(ventana, { title: 'Abrir un hogar', filters: FILTRO_HOGAR, properties: ['openFile'] });
    if (r.canceled || !r.filePaths.length) return { cancelado: true };
    ruta = r.filePaths[0];
  }
  const res = await archivo.leer(ruta);
  if (res.ok) ajustes.agregarReciente(ruta, nombreDe(ruta));
  return res;
});

ipcMain.handle('archivo:abrir-con-clave', async (_e, ruta, clave) => {
  const res = await archivo.leer(ruta, clave);
  if (res.ok) ajustes.agregarReciente(ruta, nombreDe(ruta));
  return res;
});

ipcMain.handle('archivo:guardar', async (_e, json) => archivo.guardar(json));

ipcMain.handle('archivo:guardar-como', async (_e, json, nombreSugerido, { clave } = {}) => {
  const docs = app.getPath('documents');
  const r = await dialog.showSaveDialog(ventana, {
    title: 'Guardar el hogar',
    defaultPath: path.join(docs, `${String(nombreSugerido || 'Mi hogar').replace(/[\\/:*?"<>|]/g, '-')}.presupuesto`),
    filters: FILTRO_HOGAR
  });
  if (r.canceled || !r.filePath) return { cancelado: true };
  const res = await archivo.guardar(json, { ruta: r.filePath, ...(clave !== undefined ? { clave } : {}) });
  if (res.ok) ajustes.agregarReciente(r.filePath, nombreDe(r.filePath));
  return res;
});

ipcMain.handle('archivo:cambiar-clave', async (_e, json, nueva) => archivo.cambiarClave(json, nueva));
ipcMain.handle('archivo:cerrar', async () => { archivo.cerrar(); ajustes.guardar({ ultimo: null }); return true; });
ipcMain.handle('archivo:estado', async () => archivo.estado());
ipcMain.handle('archivo:recientes', async () => {
  const lista = ajustes.leer().recientes;
  return Promise.all(lista.map(async (r) => ({ ...r, existe: await fs.access(r.ruta).then(() => true, () => false) })));
});
ipcMain.handle('archivo:quitar-reciente', async (_e, ruta) => { ajustes.quitarReciente(ruta); return true; });
ipcMain.handle('archivo:pendiente', async () => { const r = archivoPendiente; archivoPendiente = null; return r; });
ipcMain.handle('archivo:respaldos', async () => archivo.listarRespaldos());
ipcMain.handle('archivo:abrir-respaldo', async (_e, ruta) => {
  // Un respaldo se abre como copia: hay que guardarlo con otro nombre.
  const res = await archivo.leer(ruta, archivo.claveActual());
  archivo.cerrar();
  return res;
});
ipcMain.handle('archivo:carpeta-respaldos', async () => {
  const dir = archivo.carpetaRespaldos();
  await fs.mkdir(dir, { recursive: true });
  return shell.openPath(dir);
});

// ── Datos públicos ─────────────────────────────────────────────────────────────────
ipcMain.handle('datos:obtener', async () => datos.obtener());
ipcMain.handle('datos:actualizar', async () => datos.actualizar());
ipcMain.handle('datos:dolar-hoy', async () => datos.dolarHoy());
ipcMain.handle('app:buscar-version', async () => datos.buscarVersion());

// ── Exportar e importar ────────────────────────────────────────────────────────────
async function guardarArchivo(nombre, contenido, filtros) {
  const r = await dialog.showSaveDialog(ventana, { title: 'Exportar', defaultPath: path.join(app.getPath('documents'), nombre), filters: filtros });
  if (r.canceled || !r.filePath) return { cancelado: true };
  await fs.writeFile(r.filePath, contenido);
  return { ok: true, ruta: r.filePath };
}

ipcMain.handle('exportar:excel', async (_e, modelo, nombre) => {
  try { return await guardarArchivo(nombre, await exportar.excel(modelo), [{ name: 'Libro de Excel', extensions: ['xlsx'] }]); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('exportar:pdf', async (_e, html, nombre, opciones) => {
  try { return await guardarArchivo(nombre, await exportar.pdf(html, opciones), [{ name: 'PDF', extensions: ['pdf'] }]); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('exportar:texto', async (_e, texto, nombre) => {
  try { return await guardarArchivo(nombre, '﻿' + texto, [{ name: 'CSV', extensions: ['csv'] }]); }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('importar:elegir', async () => {
  const r = await dialog.showOpenDialog(ventana, {
    title: 'Importar movimientos o una planilla',
    filters: [{ name: 'Planillas y extractos', extensions: ['xlsx', 'xls', 'ods', 'csv', 'txt'] }],
    properties: ['openFile']
  });
  if (r.canceled || !r.filePaths.length) return { cancelado: true };
  try { return { ok: true, ...(await exportar.leerParaImportar(r.filePaths[0])) }; }
  catch (e) { return { ok: false, error: `No se pudo leer el archivo: ${e.message}` }; }
});

// ── Claude ─────────────────────────────────────────────────────────────────────────
ipcMain.handle('claude:estado', async () => claude.estado());
ipcMain.handle('claude:guardar-clave', async (_e, clave) => claude.guardarClave(clave));
ipcMain.handle('claude:borrar-clave', async () => claude.borrarClave());
ipcMain.handle('claude:consultar', async (e, pedido) => claude.consultar(pedido, (texto) => {
  if (!e.sender.isDestroyed()) e.sender.send('mp:claude-texto', texto);
}));

// ── Ajustes del programa y varios ──────────────────────────────────────────────────
ipcMain.handle('ajustes:leer', async () => ajustes.leer());
ipcMain.handle('ajustes:guardar', async (_e, cambios) => {
  const permitidos = ['tema', 'ipcManual', 'proyeccion', 'claudeModelo', 'recorrido', 'avisoVersion'];
  const limpio = Object.fromEntries(Object.entries(cambios || {}).filter(([k]) => permitidos.includes(k)));
  if (limpio.tema && ventana) ventana.setBackgroundColor(colorDeFondo());
  return ajustes.guardar(limpio);
});
ipcMain.handle('app:info', async () => ({
  version: app.getVersion(), electron: process.versions.electron, plataforma: process.platform,
  datosUsuario: app.getPath('userData'), repo: datos.REPO
}));
ipcMain.handle('app:externo', async (_e, url) => {
  if (/^https:\/\/([a-z0-9-]+\.)*(github\.com|indec\.gob\.ar|datos\.gob\.ar|bcra\.gob\.ar|argentinadatos\.com|dolarapi\.com|anthropic\.com|claude\.com)(\/|$)/i.test(String(url))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});
ipcMain.handle('app:mostrar-en-carpeta', async (_e, ruta) => { if (ruta) shell.showItemInFolder(ruta); return true; });
ipcMain.handle('app:listo-para-cerrar', async () => { cerrando = true; if (ventana) ventana.close(); return true; });
ipcMain.handle('app:titulo', async (_e, titulo) => { if (ventana) ventana.setTitle(String(titulo).slice(0, 200)); return true; });
