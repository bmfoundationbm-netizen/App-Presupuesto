/* Mi Presupuesto · genera los íconos del programa a partir del logo (SVG)
 *
 * Se corre con Electron (no con Node), porque usa Chromium para dibujar el SVG:
 *   npx electron tools/generar-icono.js
 * Escribe build/icon.png (512 px), build/icon.ico (16 a 256 px) y web/icono.png.
 */
'use strict';
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">
  <rect width="32" height="32" rx="7" fill="#2a78d6"/>
  <path d="M6 9.5c7 0 7 6 13 6h7M6 16c7 0 7 0 13 0h7M6 22.5c7 0 7-6 13-6h7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".95"/>
  <circle cx="26" cy="16" r="2.6" fill="#fff"/>
</svg>`;

// ICO con imágenes PNG adentro (lo admite Windows desde Vista).
function armarIco(pngs) {
  const cab = Buffer.alloc(6 + 16 * pngs.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let desplazamiento = cab.length;
  pngs.forEach(({ tam, datos }, i) => {
    const e = 6 + 16 * i;
    cab.writeUInt8(tam >= 256 ? 0 : tam, e); cab.writeUInt8(tam >= 256 ? 0 : tam, e + 1);
    cab.writeUInt8(0, e + 2); cab.writeUInt8(0, e + 3);
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(datos.length, e + 8); cab.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += datos.length;
  });
  return Buffer.concat([cab, ...pngs.map((p) => p.datos)]);
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${SVG}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 400));
  const imagen = await w.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const raiz = path.join(__dirname, '..');
  fs.mkdirSync(path.join(raiz, 'build'), { recursive: true });
  const grande = imagen.resize({ width: 512, height: 512, quality: 'best' });
  fs.writeFileSync(path.join(raiz, 'build', 'icon.png'), grande.toPNG());
  fs.writeFileSync(path.join(raiz, 'web', 'icono.png'), imagen.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
  const pngs = [16, 24, 32, 48, 64, 128, 256].map((tam) => ({ tam, datos: nativeImage.createFromBuffer(grande.toPNG()).resize({ width: tam, height: tam, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(raiz, 'build', 'icon.ico'), armarIco(pngs));
  console.log('Íconos listos: build/icon.png, build/icon.ico, web/icono.png');
  app.quit();
});
