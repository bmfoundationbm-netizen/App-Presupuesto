/* Mi Presupuesto · archivos de hogar (.presupuesto)
 *
 * Formato: JSON. Sin contraseña:
 *   { "formato": "mi-presupuesto", "version": 1, "cifrado": null, "hogar": { ... } }
 * Con contraseña (AES-256-GCM, clave derivada con scrypt):
 *   { "formato": "mi-presupuesto", "version": 1,
 *     "cifrado": { "alg": "aes-256-gcm", "kdf": "scrypt", "N": 32768, "r": 8, "p": 1,
 *                  "sal": "...", "iv": "...", "tag": "..." },
 *     "datos": "<hogar cifrado en base64>" }
 *
 * La contraseña nunca se guarda: queda en memoria mientras el hogar está abierto (para el
 * guardado automático). Si se olvida, el archivo no se puede abrir.
 *
 * Cada guardado escribe primero un archivo temporal y después lo renombra: un corte de luz
 * a mitad de camino no deja el hogar a medias. Antes del primer guardado de cada sesión y
 * una vez por día se copia el archivo anterior a la carpeta de respaldos.
 */
'use strict';
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const FORMATO = 'mi-presupuesto';
const KDF = { N: 32768, r: 8, p: 1 };
const MAX_RESPALDOS = 30;

let actual = { ruta: null, clave: null, sal: null, llave: null, respaldadoEnSesion: false, ultimoRespaldo: 0 };

const derivar = (clave, sal) => new Promise((ok, mal) =>
  crypto.scrypt(clave, sal, 32, { ...KDF, maxmem: 128 * 1024 * 1024 }, (e, k) => (e ? mal(e) : ok(k))));

async function cifrar(texto, clave) {
  if (!actual.llave || actual.clave !== clave) {
    actual.sal = crypto.randomBytes(16);
    actual.llave = await derivar(clave, actual.sal);
    actual.clave = clave;
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', actual.llave, iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return {
    formato: FORMATO, version: 1,
    cifrado: { alg: 'aes-256-gcm', kdf: 'scrypt', ...KDF, sal: actual.sal.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64') },
    datos: datos.toString('base64')
  };
}

async function descifrar(sobre, clave) {
  const p = sobre.cifrado;
  const sal = Buffer.from(p.sal, 'base64');
  const llave = await derivar(clave, sal);
  const d = crypto.createDecipheriv('aes-256-gcm', llave, Buffer.from(p.iv, 'base64'));
  d.setAuthTag(Buffer.from(p.tag, 'base64'));
  let texto;
  try { texto = Buffer.concat([d.update(Buffer.from(sobre.datos, 'base64')), d.final()]).toString('utf8'); }
  catch (e) { const err = new Error('La contraseña no es correcta.'); err.codigo = 'clave'; throw err; }
  return { hogar: JSON.parse(texto), sal, llave };
}

// Lee un archivo. Si está cifrado y no vino la contraseña, avisa que hace falta.
async function leer(ruta, clave = null) {
  let texto;
  try { texto = await fs.readFile(ruta, 'utf8'); }
  catch (e) { return { ok: false, error: `No se pudo abrir el archivo: ${e.code === 'ENOENT' ? 'no existe' : e.message}` }; }
  let sobre;
  try { sobre = JSON.parse(texto.replace(/^﻿/, '')); }
  catch (e) { return { ok: false, error: 'El archivo no es un hogar de Mi Presupuesto (no es JSON válido).' }; }
  if (!sobre || sobre.formato !== FORMATO) return { ok: false, error: 'El archivo no es un hogar de Mi Presupuesto.' };
  if (sobre.cifrado) {
    if (!clave) return { ok: false, necesitaClave: true, ruta };
    try {
      const { hogar, sal, llave } = await descifrar(sobre, clave);
      actual = { ruta, clave, sal, llave, respaldadoEnSesion: false, ultimoRespaldo: 0 };
      return { ok: true, ruta, hogar, cifrado: true };
    } catch (e) {
      return { ok: false, necesitaClave: true, ruta, error: e.codigo === 'clave' ? e.message : `No se pudo descifrar: ${e.message}` };
    }
  }
  actual = { ruta, clave: null, sal: null, llave: null, respaldadoEnSesion: false, ultimoRespaldo: 0 };
  return { ok: true, ruta, hogar: sobre.hogar, cifrado: false };
}

async function escribirSeguro(ruta, contenido) {
  const tmp = `${ruta}.${process.pid}.tmp`;
  await fs.writeFile(tmp, contenido);
  try { await fs.rename(tmp, ruta); }
  catch (e) {
    // Un antivirus puede tener tomado el archivo un instante: se escribe directo.
    await fs.writeFile(ruta, contenido);
    await fs.rm(tmp, { force: true });
  }
}

function carpetaRespaldos(ruta = actual.ruta) {
  const h = crypto.createHash('sha1').update(String(ruta).toLowerCase()).digest('hex').slice(0, 10);
  return path.join(app.getPath('userData'), 'respaldos', h);
}

const sello = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

async function respaldar(ruta) {
  try {
    await fs.access(ruta);
  } catch (e) { return; }
  const dir = carpetaRespaldos(ruta);
  await fs.mkdir(dir, { recursive: true });
  const base = path.basename(ruta, path.extname(ruta));
  await fs.copyFile(ruta, path.join(dir, `${base}_${sello()}.presupuesto`));
  await fs.writeFile(path.join(dir, 'origen.txt'), ruta, 'utf8');
  const todos = (await fs.readdir(dir)).filter((n) => n.endsWith('.presupuesto')).sort();
  for (const n of todos.slice(0, Math.max(0, todos.length - MAX_RESPALDOS))) await fs.rm(path.join(dir, n), { force: true });
}

async function guardar(hogarJson, { ruta = actual.ruta, clave } = {}) {
  if (!ruta) return { ok: false, error: 'sinRuta' };
  const usarClave = clave === undefined ? actual.clave : clave;
  const mismo = actual.ruta && actual.ruta.toLowerCase() === ruta.toLowerCase();
  // Respaldo del archivo anterior: al primer guardado de la sesión y una vez por día.
  if (mismo && (!actual.respaldadoEnSesion || Date.now() - actual.ultimoRespaldo > 86400000)) {
    try { await respaldar(ruta); } catch (e) { /* un respaldo fallido no frena el guardado */ }
    actual.respaldadoEnSesion = true;
    actual.ultimoRespaldo = Date.now();
  }
  let sobre;
  if (usarClave) sobre = await cifrar(hogarJson, usarClave);
  else {
    let hogar;
    try { hogar = JSON.parse(hogarJson); } catch (e) { return { ok: false, error: 'Datos inválidos' }; }
    sobre = { formato: FORMATO, version: 1, cifrado: null, hogar };
  }
  try { await escribirSeguro(ruta, JSON.stringify(sobre)); }
  catch (e) { return { ok: false, error: `No se pudo guardar: ${e.message}` }; }
  if (!mismo) actual = { ...actual, ruta, respaldadoEnSesion: true, ultimoRespaldo: Date.now() };
  actual.clave = usarClave || null;
  if (!usarClave) { actual.sal = null; actual.llave = null; }
  return { ok: true, ruta, cifrado: !!usarClave };
}

async function cambiarClave(hogarJson, nueva) {
  if (!actual.ruta) return { ok: false, error: 'sinRuta' };
  actual.llave = null;
  actual.respaldadoEnSesion = false;
  return guardar(hogarJson, { clave: nueva || null });
}

async function listarRespaldos(ruta = actual.ruta) {
  if (!ruta) return [];
  const dir = carpetaRespaldos(ruta);
  try {
    const nombres = (await fs.readdir(dir)).filter((n) => n.endsWith('.presupuesto')).sort().reverse();
    const out = [];
    for (const n of nombres) {
      const st = await fs.stat(path.join(dir, n));
      out.push({ archivo: path.join(dir, n), nombre: n, fecha: st.mtime.toISOString(), tamano: st.size });
    }
    return out;
  } catch (e) { return []; }
}

function cerrar() { actual = { ruta: null, clave: null, sal: null, llave: null, respaldadoEnSesion: false, ultimoRespaldo: 0 }; }
function estado() { return { ruta: actual.ruta, cifrado: !!actual.clave }; }
function claveActual() { return actual.clave; }

module.exports = { leer, guardar, cambiarClave, listarRespaldos, carpetaRespaldos, cerrar, estado, claveActual, respaldar };
