/* Mi Presupuesto · procesa los microdatos de la ENGHo 2017-2018 (INDEC)
 *
 * Arma web/data/engho.json: cómo reparten el gasto de consumo entre las 12 categorías
 * del IPC los hogares de cada composición (adultos y menores), región, quintil de
 * ingreso y tenencia de la vivienda (alquilan o no), y cuántas veces su canasta básica
 * total gastan por mes.
 *
 * La encuesta se hizo entre noviembre de 2017 y noviembre de 2018 y los montos están en
 * pesos del momento de cada entrevista. Por eso no se guardan pesos: se guardan
 * proporciones del gasto y "veces la canasta básica total" (CBT) del propio hogar,
 * medidas con la CBT de su región en el mes aproximado de la entrevista. Esas dos cosas
 * no dependen de la inflación de la época y la app las lleva a pesos de hoy con la CBT
 * y el IPC actuales.
 *
 * Los datos de la encuesta no cambian: este script se corre una sola vez (npm run engho)
 * y el resultado queda en el repositorio.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { bajar, series, extraerDeZip } = require('./comun');

const ZIP_URL = 'https://www.indec.gob.ar/ftp/cuadros/menusuperior/engho/engho2018_hogares.zip';
const CACHE = path.join(__dirname, '..', 'datos', 'descargas', 'engho2018_hogares.zip');
const SALIDA = path.join(__dirname, '..', 'web', 'data', 'engho.json');

const REGION = { 1: 'gba', 2: 'pampeana', 3: 'noa', 4: 'nea', 5: 'cuyo', 6: 'patagonia' };
const CBT = {
  gba: '444.1_CANASTA_batotGBA_0_0_26_47',
  pampeana: '444.1_CANASTA_batotPampeana_0_0_26_47',
  nea: '444.1_CANASTA_batotNoreste_0_0_26_47',
  noa: '444.1_CANASTA_batotNoroeste_0_0_26_47',
  cuyo: '444.1_CANASTA_batotCuyo_0_0_26_47',
  patagonia: '444.1_CANASTA_batotPatagonia_0_0_26_47'
};
const CATEGORIAS = ['alimentos', 'alcohol', 'ropa', 'vivienda', 'equipamiento', 'salud',
  'transporte', 'comunicacion', 'recreacion', 'educacion', 'restaurantes', 'varios'];
const MINIMO = 30;   // hogares encuestados por celda para publicarla

// Mes aproximado de cada trimestre operativo (noviembre de 2017 a noviembre de 2018).
function mesEntrevista(anio, trimestre) {
  if (anio === 2017) return '2017-12';
  return { 1: '2018-01', 2: '2018-03', 3: '2018-06', 4: '2018-09' }[trimestre] || '2018-05';
}

function cuantilPonderado(pares, q) {
  const v = pares.slice().sort((a, b) => a[0] - b[0]);
  const total = v.reduce((s, p) => s + p[1], 0);
  let acum = 0;
  for (const [x, w] of v) { acum += w; if (acum >= q * total) return x; }
  return v.length ? v[v.length - 1][0] : null;
}

async function main() {
  let zip;
  if (fs.existsSync(CACHE)) zip = fs.readFileSync(CACHE);
  else {
    console.log('Bajando microdatos de hogares de la ENGHo 2017-2018…');
    zip = await bajar(ZIP_URL, { tipo: 'buffer' });
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, zip);
  }
  const texto = extraerDeZip(zip, 'engho2018_hogares.txt').toString('latin1');

  console.log('Bajando la canasta básica total por región…');
  const cbt = await series(Object.values(CBT));

  const lineas = texto.split(/\r?\n/).filter(Boolean);
  const cab = lineas[0].split('|').map((c) => c.replace(/"/g, ''));
  const col = Object.fromEntries(cab.map((c, i) => [c, i]));
  const num = (f, c) => { const v = f[col[c]]; return v === '' || v === undefined ? NaN : Number(String(v).replace(/"/g, '')); };

  const hogares = [];
  let sinCbt = 0;
  for (const l of lineas.slice(1)) {
    const f = l.split('|');
    const region = REGION[num(f, 'region')];
    const miembros = num(f, 'cantmiem');
    const menores = num(f, 'menor18');
    const adultos = miembros - menores;
    const ae = num(f, 'cantadequi');
    const gasto = num(f, 'gastot');
    const ingreso = num(f, 'ingtoth');
    const w = num(f, 'pondera');
    if (!region || !(adultos >= 1) || !(ae > 0) || !(gasto > 0) || !(w > 0)) continue;
    const mes = mesEntrevista(num(f, 'anio'), num(f, 'trimestre'));
    const canasta = cbt[CBT[region]][mes];
    if (!canasta) { sinCbt++; continue; }
    const linea = canasta * ae;
    const partes = CATEGORIAS.map((_, i) => (num(f, `gc_${String(i + 1).padStart(2, '0')}`) || 0) / gasto);
    // Tenencia: 2 = inquilino; 1 (propietario) y 3 (ocupante y otros) no pagan alquiler.
    const tenencia = num(f, 'regten') === 2 ? 'i' : 'p';
    hogares.push({
      w, region, tenencia,
      a: Math.min(adultos, 3), m: Math.min(menores, 3),
      vecesIngreso: ingreso > 0 ? ingreso / linea : null,
      vecesGasto: gasto / linea,
      partes
    });
  }
  if (sinCbt) console.warn(`Aviso: ${sinCbt} hogares sin CBT para su mes; quedaron afuera.`);

  // Quintiles de ingreso medidos en "veces la CBT del hogar", para todo el país.
  const conIngreso = hogares.filter((h) => h.vecesIngreso !== null).map((h) => [h.vecesIngreso, h.w]);
  const umbrales = [0.2, 0.4, 0.6, 0.8].map((q) => Math.round(cuantilPonderado(conIngreso, q) * 1000) / 1000);
  const quintil = (v) => v === null ? null : 1 + umbrales.filter((u) => v > u).length;

  const celdas = new Map();
  const sumar = (clave, h) => {
    let c = celdas.get(clave);
    if (!c) celdas.set(clave, (c = { n: 0, w: 0, partes: new Array(CATEGORIAS.length).fill(0), gastos: [] }));
    c.n++; c.w += h.w;
    h.partes.forEach((p, i) => { c.partes[i] += p * h.w; });
    c.gastos.push([h.vecesGasto, h.w]);
  };
  for (const h of hogares) {
    const q = quintil(h.vecesIngreso);
    for (const r of [h.region, 'nacional']) {
      for (const qq of q ? [q, 0] : [0]) {
        for (const t of [h.tenencia, 'x']) sumar(`${h.a}-${h.m}-${r}-${qq}-${t}`, h);
      }
    }
  }

  const salida = {};
  for (const [clave, c] of [...celdas.entries()].sort()) {
    if (c.n < MINIMO) continue;
    salida[clave] = {
      n: c.n,
      p: c.partes.map((s) => Math.round((s / c.w) * 10000) / 10000),
      g: Math.round(cuantilPonderado(c.gastos, 0.5) * 100) / 100
    };
  }

  const resultado = {
    fuente: 'INDEC, Encuesta Nacional de Gastos de los Hogares 2017-2018 (base usuaria de hogares)',
    url: ZIP_URL,
    periodo: '2017-11/2018-11',
    mesReferencia: '2018-05',
    categorias: CATEGORIAS,
    nota: 'p: proporción promedio del gasto de consumo por categoría (promedio de hogares, ponderado). ' +
      'g: mediana del gasto de consumo mensual en veces la canasta básica total del hogar. ' +
      'Clave: adultos(1-3, 3 = 3 o más)-menores(0-3, 3 = 3 o más)-región-quintil(1-5, 0 = todos)-' +
      'tenencia (i = alquilan, p = propietarios u ocupantes, x = todos). ' +
      'Quintiles del ingreso total del hogar medido en veces su canasta básica total, para todo el país.',
    umbralesQuintil: umbrales,
    hogares: hogares.length,
    celdas: salida
  };
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(resultado));
  console.log(`Listo: ${hogares.length} hogares, ${Object.keys(salida).length} celdas, umbrales de quintil ${umbrales.join(' / ')} veces la CBT.`);

  for (const [clave, titulo] of [['2-2-nacional-0-x', 'todos'], ['2-2-nacional-0-i', 'inquilinos'], ['2-2-nacional-0-p', 'sin alquiler']]) {
    const c = salida[clave];
    if (!c) continue;
    console.log(`Familia tipo (2 adultos, 2 menores), todo el país, ${titulo} (n=${c.n}):`);
    console.log('  ' + CATEGORIAS.map((x, i) => `${x} ${(c.p[i] * 100).toFixed(1)}`).join(' · '));
    console.log(`  gasto mediano: ${c.g} veces la CBT del hogar`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
