/* Mi Presupuesto · arma web/data/datos.json con los datos públicos que usa la app
 *
 *   IPC por región y categoría   INDEC, vía datos.gob.ar (base diciembre 2016 = 100)
 *   Canasta básica (CBA y CBT)    INDEC, vía datos.gob.ar, por adulto equivalente
 *   Dólar oficial, MEP y blue     ArgentinaDatos (recopila las cotizaciones publicadas)
 *   Dólar mayorista               Banco Central (API de estadísticas cambiarias)
 *   Inflación esperada (REM)      Banco Central, planilla del último relevamiento
 *
 * Si una fuente falla, se conserva lo que ya había en datos.json para esa parte y se
 * anota el error: un corte de una fuente nunca deja a la app sin datos.
 * Lo corre la tarea mensual de GitHub (.github/workflows/datos.yml) y también a mano
 * con `npm run datos`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { bajar, series, leerCsv, aArreglo } = require('./comun');

const SALIDA = path.join(__dirname, '..', 'web', 'data', 'datos.json');

const REGIONES = ['nacional', 'gba', 'pampeana', 'nea', 'noa', 'cuyo', 'patagonia'];
const CATEGORIAS = [
  ['alimentos', 'alimentos_bebidas_no_alcoholicas'],
  ['alcohol', 'bebidas_alcoholicas_tabaco'],
  ['ropa', 'prendas_vestir_calzado'],
  ['vivienda', 'vivienda_agua_electricidad_combustibles'],
  ['equipamiento', 'equipamiento_mantenimientos_hogar'],
  ['salud', 'salud'],
  ['transporte', 'transporte'],
  ['comunicacion', 'comunicaciones'],
  ['recreacion', 'recreacion_cultura'],
  ['educacion', 'educacion'],
  ['restaurantes', 'restaurantes_hoteles'],
  ['varios', 'bienes_servicios_varios']
];
const IPC_CAPITULOS = 'https://infra.datos.gob.ar/catalog/sspm/dataset/145/distribution/145.5/download/' +
  'indice-precios-al-consumidor-apertura-por-capitulos-base-diciembre-2016-mensual.csv';
const IPC_GENERAL = {
  nacional: '145.3_INGNACNAL_DICI_M_15', gba: '145.3_INGGBAGBA_DICI_M_10',
  pampeana: '145.3_INGPAMANA_DICI_M_15', nea: '145.3_INGNEANEA_DICI_M_10',
  noa: '145.3_INGNOANOA_DICI_M_10', cuyo: '145.3_INGCUYUYO_DICI_M_11',
  patagonia: '145.3_INGPATNIA_DICI_M_16'
};
// La CBA y la CBT de GBA salen todos los meses; las de las otras regiones, con atraso.
const CANASTA_GBA = { cba: '150.1_CSTA_BARIA_0_D_26', cbt: '150.1_CSTA_BATAL_0_D_20' };
const CANASTA_REGION = { gba: 'GBA', pampeana: 'Pampeana', nea: 'Noreste', noa: 'Noroeste', cuyo: 'Cuyo', patagonia: 'Patagonia' };
const DOLAR_AD = { oficial: 'oficial', mep: 'bolsa', blue: 'blue' };
const BCRA_USD = 'https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/USD';
const REM_PAGINA = 'https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/';

// Fecha de hoy en Argentina: la API del BCRA rechaza fechas futuras, y a la noche la
// fecha UTC ya es la de mañana.
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

async function ipc() {
  const csv = leerCsv(await bajar(IPC_CAPITULOS));
  const cab = csv[0];
  const regiones = {};
  for (const r of REGIONES) {
    regiones[r] = {};
    for (const [clave, col] of CATEGORIAS) {
      const i = cab.indexOf(`ipc_${col}_${r}`);
      if (i < 0) throw new Error(`Falta la columna ipc_${col}_${r} en el IPC por capítulos`);
      const mapa = {};
      for (const f of csv.slice(1)) {
        const v = Number(f[i]);
        if (f[i] !== '' && Number.isFinite(v)) mapa[f[0].slice(0, 7)] = v;
      }
      regiones[r][clave] = mapa;
    }
  }
  const gen = await series(Object.values(IPC_GENERAL));
  for (const r of REGIONES) regiones[r].general = gen[IPC_GENERAL[r]];

  // Todas las series arrancan en 2016-12 = 100; se guardan alineadas desde ese mes.
  const desde = '2016-12';
  let hasta = desde;
  for (const r of REGIONES) for (const s of Object.values(regiones[r]))
    for (const m of Object.keys(s)) if (m > hasta) hasta = m;
  const out = { desde, hasta, series: {} };
  for (const r of REGIONES) {
    out.series[r] = {};
    for (const [clave, mapa] of Object.entries(regiones[r])) {
      const arr = aArreglo(Object.fromEntries(Object.entries(mapa).filter(([m]) => m >= desde)), 4);
      if (!arr || arr.desde !== desde) throw new Error(`La serie ${r}/${clave} no empieza en ${desde}`);
      out.series[r][clave] = arr.valores;
    }
  }
  return out;
}

async function canasta() {
  const ids = [CANASTA_GBA.cba, CANASTA_GBA.cbt];
  for (const n of Object.values(CANASTA_REGION)) ids.push(`444.1_CANASTA_BARIA${n}_0_0_26_47`, `444.1_CANASTA_batot${n}_0_0_26_47`);
  const s = await series(ids);
  const gba = { cba: s[CANASTA_GBA.cba], cbt: s[CANASTA_GBA.cbt] };
  const out = { unidad: 'pesos por adulto equivalente por mes', regiones: {} };
  for (const [r, n] of Object.entries(CANASTA_REGION)) {
    const reg = { cba: { ...(s[`444.1_CANASTA_BARIA${n}_0_0_26_47`] || {}) }, cbt: { ...(s[`444.1_CANASTA_batot${n}_0_0_26_47`] || {}) } };
    if (r === 'gba') { Object.assign(reg.cba, gba.cba); Object.assign(reg.cbt, gba.cbt); }
    // Meses que la región todavía no tiene: se estiman con la relación región/GBA del
    // último mes publicado por las dos, aplicada a la canasta de GBA.
    let estimadoDesde = null;
    for (const k of ['cba', 'cbt']) {
      const propios = Object.keys(reg[k]).sort();
      const ultimo = propios[propios.length - 1];
      if (!ultimo || !gba[k][ultimo]) continue;
      const relacion = reg[k][ultimo] / gba[k][ultimo];
      for (const m of Object.keys(gba[k]).sort()) {
        if (m > ultimo) {
          reg[k][m] = gba[k][m] * relacion;
          if (!estimadoDesde || m < estimadoDesde) estimadoDesde = m;
        }
      }
    }
    // Las dos series quedan alineadas desde el primer mes que tienen ambas.
    const desde = [Object.keys(reg.cba).sort()[0], Object.keys(reg.cbt).sort()[0]].sort()[1];
    const desdeAhi = (mapa) => Object.fromEntries(Object.entries(mapa).filter(([m]) => m >= desde));
    out.regiones[r] = { desde, cba: aArreglo(desdeAhi(reg.cba), 2).valores, cbt: aArreglo(desdeAhi(reg.cbt), 2).valores };
    if (estimadoDesde) out.regiones[r].estimadoDesde = estimadoDesde;
  }
  return out;
}

function promediosMensuales(diarios) {
  const suma = {};
  for (const [fecha, v] of diarios) {
    if (!(v > 0)) continue;
    const m = fecha.slice(0, 7);
    (suma[m] = suma[m] || [0, 0]);
    suma[m][0] += v; suma[m][1]++;
  }
  return Object.fromEntries(Object.entries(suma).map(([m, [s, n]]) => [m, s / n]));
}

async function dolarArgentinaDatos(casa) {
  const j = await bajar(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}`, { tipo: 'json' });
  const filas = j.filter((x) => x.fecha >= '2016-01-01').sort((a, b) => a.fecha.localeCompare(b.fecha));
  const arr = aArreglo(promediosMensuales(filas.map((x) => [x.fecha, Number(x.venta)])), 2);
  const u = filas[filas.length - 1];
  return { desde: arr.desde, venta: arr.valores, ultimo: { fecha: u.fecha, compra: Number(u.compra), venta: Number(u.venta) } };
}

async function dolarMayorista() {
  const filas = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const j = await bajar(`${BCRA_USD}?fechadesde=2016-01-01&fechahasta=${hoy()}&limit=1000&offset=${offset}`, { tipo: 'json' });
    for (const r of j.results || []) {
      const d = (r.detalle || []).find((x) => x.codigoMoneda === 'USD');
      if (d && d.tipoCotizacion > 0) filas.push([r.fecha, Number(d.tipoCotizacion)]);
    }
    if (!j.results || j.results.length < 1000) break;
  }
  filas.sort((a, b) => a[0].localeCompare(b[0]));
  const arr = aArreglo(promediosMensuales(filas), 2);
  const u = filas[filas.length - 1];
  return { desde: arr.desde, venta: arr.valores, ultimo: { fecha: u[0], compra: u[1], venta: u[1] } };
}

async function dolar() {
  const out = {};
  const nombres = {
    oficial: 'Oficial (Banco Nación, venta al público)',
    mayorista: 'Oficial mayorista (Banco Central)',
    mep: 'MEP (bolsa)',
    blue: 'Blue (informal)'
  };
  const errores = {};
  for (const [clave, casa] of Object.entries(DOLAR_AD)) {
    try { out[clave] = { nombre: nombres[clave], ...(await dolarArgentinaDatos(casa)) }; }
    catch (e) { errores[clave] = e.message; }
  }
  try { out.mayorista = { nombre: nombres.mayorista, ...(await dolarMayorista()) }; }
  catch (e) { errores.mayorista = e.message; }
  return { out, errores };
}

// Planilla del REM: inflación mensual esperada (mediana) y las expectativas a 12 y 24 meses.
async function rem() {
  const html = await bajar(REM_PAGINA);
  const m = [...html.matchAll(/href="([^"]*relevamiento-expectativas-mercado-tablas-(\d{4})-(\d{2})\.xlsx)"/gi)];
  if (!m.length) throw new Error('No encontré la planilla de resultados del REM en la página del BCRA');
  m.sort((a, b) => (b[2] + b[3]).localeCompare(a[2] + a[3]));
  const [, href, anio, mesTxt] = m[0];
  const url = new URL(href, REM_PAGINA).href;
  const wb = XLSX.read(await bajar(url, { tipo: 'buffer' }), { type: 'buffer' });
  const hoja = wb.Sheets[wb.SheetNames.find((n) => /cuadros/i.test(n)) || wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });

  // El primer bloque es "Precios minoristas (IPC nivel general-Nacional; INDEC)".
  let i = filas.findIndex((f) => f.some((c) => typeof c === 'string' && /IPC nivel general/i.test(c)));
  if (i < 0) throw new Error('La planilla del REM no tiene el bloque de IPC nivel general');
  const cab = filas.findIndex((f, k) => k > i && f.some((c) => c === 'Período'));
  const colPer = filas[cab].indexOf('Período'), colRef = filas[cab].indexOf('Referencia'), colMed = filas[cab].indexOf('Mediana');
  const out = { relevamiento: `${anio}-${mesTxt}`, url, mensual: [], anual: {} };
  for (let k = cab + 1; k < filas.length; k++) {
    const f = filas[k];
    const per = f[colPer], ref = String(f[colRef] || ''), med = Number(f[colMed]);
    if (per === null && ref === '') break;
    if (!Number.isFinite(med)) continue;
    if (typeof per === 'number' && per > 30000 && /mensual/i.test(ref)) {
      const fecha = new Date(Math.round((per - 25569) * 86400000));
      out.mensual.push({ mes: fecha.toISOString().slice(0, 7), v: Math.round(med * 1000) / 1000 });
    } else if (/12 meses/i.test(String(per))) out.prox12 = Math.round(med * 100) / 100;
    else if (/24 meses/i.test(String(per))) out.prox24 = Math.round(med * 100) / 100;
    else if (/^\s*20\d\d\s*$/.test(String(per))) out.anual[String(per).trim()] = Math.round(med * 100) / 100;
  }
  if (!out.mensual.length) throw new Error('No pude leer la inflación mensual esperada del REM');
  return out;
}

async function main() {
  let anterior = {};
  try { anterior = JSON.parse(fs.readFileSync(SALIDA, 'utf8')); } catch (e) { /* primera vez */ }
  const datos = { version: 1, generado: new Date().toISOString(), fuentes: {} };

  const tareas = [
    ['ipc', ipc, 'INDEC, IPC base diciembre 2016, por región y por división (datos.gob.ar)'],
    ['canasta', canasta, 'INDEC, canasta básica alimentaria y total por adulto equivalente (datos.gob.ar)'],
    ['rem', rem, 'Banco Central, Relevamiento de Expectativas de Mercado (REM)']
  ];
  for (const [clave, fn, fuente] of tareas) {
    try {
      datos[clave] = await fn();
      datos.fuentes[clave] = { fuente, actualizado: hoy() };
      console.log(`✓ ${clave}`);
    } catch (e) {
      console.error(`✗ ${clave}: ${e.message}`);
      if (anterior[clave]) {
        datos[clave] = anterior[clave];
        datos.fuentes[clave] = { ...(anterior.fuentes || {})[clave], error: e.message, intento: hoy() };
      } else datos.fuentes[clave] = { fuente, error: e.message, intento: hoy() };
    }
  }

  const { out, errores } = await dolar();
  datos.dolar = { ...(anterior.dolar || {}), ...out };
  datos.fuentes.dolar = { fuente: 'ArgentinaDatos (oficial, MEP y blue) y Banco Central (mayorista)', actualizado: hoy() };
  if (Object.keys(errores).length) datos.fuentes.dolar.errores = errores;
  console.log(`${Object.keys(errores).length ? '✗' : '✓'} dolar ${Object.keys(out).join(', ')}`);

  if (!datos.ipc) throw new Error('Sin IPC no se puede armar datos.json');
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(datos));
  const kb = Math.round(fs.statSync(SALIDA).size / 1024);
  console.log(`Listo: ${path.relative(process.cwd(), SALIDA)} (${kb} KB). IPC hasta ${datos.ipc.hasta}` +
    (datos.rem ? `, REM de ${datos.rem.relevamiento}` : '') + '.');
}

main().catch((e) => { console.error(e); process.exit(1); });
