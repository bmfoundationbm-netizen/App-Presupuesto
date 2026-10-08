/* Mi Presupuesto · ajustes del programa (no del hogar): tema, recientes, IPC cargado a mano,
 * proyección de inflación, modelo de Claude. Se guardan en la carpeta de datos del usuario. */
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const ARCHIVO = () => path.join(app.getPath('userData'), 'ajustes.json');

const BASE = {
  tema: 'sistema',             // 'sistema' | 'claro' | 'oscuro'
  recientes: [],               // [{ ruta, nombre, fecha }]
  ultimo: null,                // ruta del último hogar abierto
  ipcManual: {},               // { 'AAAA-MM': % mensual } para meses que el INDEC no publicó
  proyeccion: { modo: 'rem', tasa: null },
  claudeModelo: null,
  recorrido: false,            // si ya vio el recorrido de la planilla
  avisoVersion: null           // última versión nueva avisada
};

let cache = null;

function leer() {
  if (cache) return cache;
  try { cache = { ...BASE, ...JSON.parse(fs.readFileSync(ARCHIVO(), 'utf8')) }; }
  catch (e) { cache = { ...BASE }; }
  return cache;
}

function guardar(cambios) {
  cache = { ...leer(), ...cambios };
  try {
    fs.mkdirSync(path.dirname(ARCHIVO()), { recursive: true });
    fs.writeFileSync(ARCHIVO(), JSON.stringify(cache, null, 2));
  } catch (e) { /* sin disco: los ajustes quedan en memoria */ }
  return cache;
}

function agregarReciente(ruta, nombre) {
  const r = leer().recientes.filter((x) => x.ruta.toLowerCase() !== ruta.toLowerCase());
  r.unshift({ ruta, nombre, fecha: new Date().toISOString() });
  guardar({ recientes: r.slice(0, 12), ultimo: ruta });
}

function quitarReciente(ruta) {
  guardar({ recientes: leer().recientes.filter((x) => x.ruta !== ruta), ultimo: leer().ultimo === ruta ? null : leer().ultimo });
}

module.exports = { leer, guardar, agregarReciente, quitarReciente };
