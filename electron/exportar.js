/* Mi Presupuesto · exportar a Excel y PDF, y leer planillas para importar
 *
 * Excel: la ventana arma un "modelo" (hojas con filas ya calculadas, montos en pesos) y
 * acá se escribe con ExcelJS, con estilos, formato de números, paneles fijos y filas
 * agrupadas por categoría.
 * PDF: la ventana arma un informe en HTML (con los gráficos en SVG) y se imprime con
 * Chromium en una ventana oculta.
 * Importar: Excel (.xlsx, .xls, .ods) se lee con SheetJS; los CSV se devuelven como texto
 * (detectando UTF-8 o Windows-1252) y los interpreta la ventana.
 */
'use strict';
const { BrowserWindow, app } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const ESTILOS = {
  titulo: { font: { bold: true, size: 14 } },
  subtitulo: { font: { italic: true, color: { argb: 'FF5A6475' } } },
  encabezado: { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: 'FF33415C' },
  seccion: { font: { bold: true }, fill: 'FFDDE7F3' },
  categoria: { font: { bold: true }, fill: 'FFF1F4F8' },
  linea: {},
  total: { font: { bold: true }, fill: 'FFE6ECF2', borde: true },
  resultado: { font: { bold: true, size: 12 }, fill: 'FFD7EFE6', borde: true },
  nota: { font: { italic: true, size: 9, color: { argb: 'FF7A8394' } } }
};
const FORMATO_PESOS = '#,##0.00;[Red]-#,##0.00';
const FORMATO_PORC = '0.0%;[Red]-0.0%';

async function excel(modelo) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mi Presupuesto';
  wb.created = new Date();
  for (const h of modelo.hojas) {
    const ws = wb.addWorksheet(String(h.nombre).slice(0, 31).replace(/[\\/?*[\]:]/g, '-'), {
      views: [{ state: 'frozen', xSplit: (h.congelar && h.congelar.x) || 0, ySplit: (h.congelar && h.congelar.y) || 0 }],
      properties: { outlineLevelRow: 2 }
    });
    ws.columns = h.columnas.map((c) => ({ width: c.ancho || 14 }));
    for (const f of h.filas) {
      const fila = ws.addRow(f.valores.map((v) => (v === undefined ? null : v)));
      const est = ESTILOS[f.tipo] || {};
      if (f.nivel) fila.outlineLevel = f.nivel;
      fila.eachCell({ includeEmpty: true }, (celda, col) => {
        if (est.font) celda.font = est.font;
        if (est.fill) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: est.fill } };
        if (est.borde) celda.border = { top: { style: 'thin', color: { argb: 'FF9AA5B5' } } };
        const formato = (h.columnas[col - 1] || {}).formato;
        if (formato === 'fecha' && typeof celda.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(celda.value)) {
          const [a, m, d] = celda.value.split('-').map(Number);
          celda.value = new Date(Date.UTC(a, m - 1, d));
          celda.numFmt = 'dd/mm/yyyy';
        } else if (typeof celda.value === 'number') {
          celda.numFmt = formato === 'porcentaje' ? FORMATO_PORC : formato === 'numero' ? '0.##' : FORMATO_PESOS;
          celda.alignment = { horizontal: 'right' };
        }
        if (col === 1 && f.sangria) celda.alignment = { indent: f.sangria };
      });
    }
    if (h.autofiltro) ws.autoFilter = h.autofiltro;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function pdf(html, { horizontal = true } = {}) {
  const tmp = path.join(os.tmpdir(), `mi-presupuesto-informe-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await w.loadFile(tmp);
    return await w.webContents.printToPDF({
      landscape: horizontal, pageSize: 'A4', printBackground: true,
      margins: { top: 0.4, bottom: 0.5, left: 0.4, right: 0.4 },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888;font-family:Segoe UI,sans-serif">Mi Presupuesto · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
    });
  } finally {
    w.destroy();
    fs.rm(tmp, { force: true }).catch(() => {});
  }
}

const pad = (n) => String(n).padStart(2, '0');
const fechaTexto = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

// Lee un archivo para importar. Devuelve { nombre, tipo: 'csv', texto } o
// { nombre, tipo: 'planilla', hojas: [{ nombre, filas }] }.
async function leerParaImportar(ruta) {
  const st = await fs.stat(ruta);
  if (st.size > 25 * 1024 * 1024) throw new Error('El archivo es demasiado grande (más de 25 MB).');
  const buf = await fs.readFile(ruta);
  const nombre = path.basename(ruta);
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv') return { nombre, tipo: 'csv', texto: decodificar(buf) };
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, dense: true });
  const hojas = wb.SheetNames.slice(0, 20).map((n) => {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false })
      .slice(0, 5000)
      .map((f) => f.slice(0, 60).map((v) => (v instanceof Date ? fechaTexto(v) : typeof v === 'string' ? v.trim() : v)));
    return { nombre: n, filas };
  }).filter((h) => h.filas.length);
  return { nombre, tipo: 'planilla', hojas };
}

module.exports = { excel, pdf, leerParaImportar };
