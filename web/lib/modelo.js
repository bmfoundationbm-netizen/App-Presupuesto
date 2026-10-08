// Mi Presupuesto · modelo de datos del hogar
//
// Un hogar es un objeto JSON que se guarda en un archivo .presupuesto. Todo lo que sale
// de un archivo pasa por normalizarHogar: arregla lo que falta, descarta referencias
// rotas y convierte montos a centavos enteros, así un archivo editado a mano o de una
// versión vieja no rompe la app.

import { INDICES, SECCIONES, SUGERIDAS, INESPERADOS, MEDIOS_PAGO, claseSugerida } from './catalogo.js';
import { mesActual, mesesDelAnio, anioDe, sumarMeses } from './fechas.js';

export const FORMATO = 'mi-presupuesto';
export const VERSION = 1;

let contador = 0;
export function nuevoId(prefijo = 'x') {
  contador = (contador + 1) % 1296;
  return `${prefijo}${Date.now().toString(36)}${contador.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

const ahora = () => new Date().toISOString();

// Categorías fijas de cada hogar: las 12 del IPC para gastos y una por cada otra sección.
function categoriasBase() {
  const cats = [];
  let orden = 0;
  cats.push({ id: 'cat_ingresos', seccion: 'ingresos', nombre: 'Ingresos', indice: 'general', orden: orden++ });
  for (const ind of INDICES) {
    cats.push({ id: `cat_${ind.clave}`, seccion: 'gastos', nombre: ind.nombre, indice: ind.clave, orden: orden++ });
  }
  cats.push({ id: 'cat_inesperados', seccion: 'inesperados', nombre: 'Gastos inesperados', indice: null, orden: orden++ });
  cats.push({ id: 'cat_ahorro', seccion: 'ahorro', nombre: 'Ahorro', indice: 'general', orden: orden++ });
  cats.push({ id: 'cat_deudas', seccion: 'deudas', nombre: 'Deudas y préstamos', indice: null, orden: orden++ });
  cats.push({ id: 'cat_inversiones', seccion: 'inversiones', nombre: 'Inversiones', indice: 'general', orden: orden++ });
  return cats;
}

export function hogarVacio({ nombre = 'Mi hogar', region = 'gba', dolar = 'oficial' } = {}) {
  const h = {
    formato: FORMATO,
    version: VERSION,
    id: nuevoId('h'),
    creado: ahora(),
    modificado: ahora(),
    nombre,
    region,
    vivienda: null,
    dolar,
    dolarManual: {},
    integrantes: [],
    medios: MEDIOS_PAGO.map((n, i) => ({ id: `med_${i + 1}`, nombre: n })),
    categorias: categoriasBase(),
    lineas: [],
    planes: [],
    planActivo: {},
    reales: {},
    movimientos: [],
    cuotas: [],
    metas: [],
    deudas: [],
    inversiones: [],
    proyectos: [],
    cierres: {},
    fondo: { cubrirInesperados: true },
    analisis: {
      comparaciones: { regla: true, parecidos: true, historial: true, topes: true },
      topes: {},
      descartados: []
    },
    importacion: { plantillas: [], reglas: [] },
    preferencias: {}
  };
  // Líneas automáticas que siempre existen.
  agregarLinea(h, { categoriaId: 'cat_ingresos', nombre: 'Sobrante del mes anterior', auto: 'saldo', naturaleza: 'variable' });
  for (const [nombreL, indice] of INESPERADOS) {
    agregarLinea(h, { categoriaId: 'cat_inesperados', nombre: nombreL, indice, naturaleza: 'variable', clase: 'esencial' });
  }
  return h;
}

export function categoria(h, id) { return h.categorias.find((c) => c.id === id); }
export function linea(h, id) { return h.lineas.find((l) => l.id === id); }
export function seccionDeLinea(h, l) { const c = categoria(h, l.categoriaId); return c ? c.seccion : 'gastos'; }
export function categoriaDeIndice(h, indice) { return h.categorias.find((c) => c.seccion === 'gastos' && c.indice === indice); }

// Índice de precios de una línea: el propio o el de su categoría.
export function indiceDeLinea(h, l) {
  if (l.indice !== undefined && l.indice !== null && l.indice !== '') return l.indice === 'ninguno' ? null : l.indice;
  const c = categoria(h, l.categoriaId);
  return c ? c.indice : null;
}

export function agregarLinea(h, datos) {
  const cat = categoria(h, datos.categoriaId);
  const seccion = cat ? cat.seccion : 'gastos';
  const hermanas = h.lineas.filter((l) => l.categoriaId === datos.categoriaId);
  const l = {
    id: datos.id || nuevoId('l'),
    categoriaId: datos.categoriaId,
    nombre: datos.nombre || 'Nuevo concepto',
    orden: datos.orden ?? (hermanas.length ? Math.max(...hermanas.map((x) => x.orden || 0)) + 1 : 0),
    naturaleza: datos.naturaleza || 'variable',
    clase: seccion === 'gastos' || seccion === 'inesperados'
      ? (datos.clase || claseSugerida(datos.nombre, cat && cat.indice)) : null,
    claseManual: !!datos.claseManual,
    personaId: datos.personaId || null,
    moneda: datos.moneda === 'USD' ? 'USD' : 'ARS',
    indice: datos.indice ?? null,
    aguinaldo: !!datos.aguinaldo,
    auto: datos.auto || null,
    metaId: datos.metaId || null,
    deudaId: datos.deudaId || null,
    inversionId: datos.inversionId || null,
    archivada: false
  };
  h.lineas.push(l);
  return l;
}

// Línea automática de aguinaldo: existe mientras haya algún sueldo con aguinaldo.
export function asegurarAguinaldo(h) {
  const hay = h.lineas.some((l) => l.aguinaldo && !l.archivada);
  let ag = h.lineas.find((l) => l.auto === 'aguinaldo');
  if (hay && !ag) ag = agregarLinea(h, { categoriaId: 'cat_ingresos', nombre: 'Aguinaldo', auto: 'aguinaldo', naturaleza: 'variable' });
  if (ag) ag.archivada = !hay;
  return ag;
}

// ── Planes (presupuestos por período) ──────────────────────────────────────────────
export function nuevoPlan(h, anio, nombre) {
  const p = { id: nuevoId('p'), nombre: nombre || `Presupuesto ${anio}`, anio, creado: ahora(), origen: null, montos: {} };
  h.planes.push(p);
  if (!h.planActivo[anio]) h.planActivo[anio] = p.id;
  return p;
}

export function planActivo(h, anio) {
  const id = h.planActivo[anio];
  return h.planes.find((p) => p.id === id) || h.planes.find((p) => p.anio === anio) || null;
}

export function fijarPlan(plan, lineaId, mes, centavos) {
  if (!plan.montos[lineaId]) plan.montos[lineaId] = {};
  if (centavos === null || centavos === undefined) delete plan.montos[lineaId][mes];
  else plan.montos[lineaId][mes] = Math.round(centavos);
  if (!Object.keys(plan.montos[lineaId]).length) delete plan.montos[lineaId];
}

// Carga un monto en un mes de una línea fija y lo repite en los meses siguientes del
// plan que estaban vacíos o tenían el mismo valor que el mes editado antes del cambio.
export function fijarPlanFijo(plan, lineaId, mes, centavos) {
  const meses = mesesDelAnio(plan.anio).filter((m) => m >= mes);
  const previo = (plan.montos[lineaId] || {})[mes];
  fijarPlan(plan, lineaId, mes, centavos);
  for (const m of meses.slice(1)) {
    const v = (plan.montos[lineaId] || {})[m];
    if (v === undefined || v === previo) fijarPlan(plan, lineaId, m, centavos);
    else break;
  }
}

export function fijarReal(h, lineaId, mes, centavos) {
  if (!h.reales[lineaId]) h.reales[lineaId] = {};
  if (centavos === null || centavos === undefined) delete h.reales[lineaId][mes];
  else h.reales[lineaId][mes] = Math.round(centavos);
  if (!Object.keys(h.reales[lineaId]).length) delete h.reales[lineaId];
}

// ── Hogar desde el asistente de inicio ─────────────────────────────────────────────
// r = { nombre, region, dolar, integrantes: [{nombre, tipo, edad, sexo}],
//       ingresos: [{nombre, monto, moneda, aguinaldo, personaIndice}],
//       gastos: [{indice, nombre, monto, naturaleza, clase}],
//       fondoMeses, meta: {nombre, monto, fecha} | null }
export function hogarDesdeAsistente(r, { mes = mesActual() } = {}) {
  const h = hogarVacio({ nombre: r.nombre || 'Mi hogar', region: r.region || 'gba', dolar: r.dolar || 'oficial' });
  h.vivienda = ['propia', 'alquilada', 'otra'].includes(r.vivienda) ? r.vivienda : null;
  h.integrantes = (r.integrantes || []).map((i, k) => ({
    id: `per_${k + 1}`,
    nombre: i.nombre || (i.tipo === 'menor' ? `Menor ${k + 1}` : `Adulto ${k + 1}`),
    tipo: i.tipo === 'menor' ? 'menor' : 'adulto',
    edad: Number.isFinite(i.edad) ? i.edad : null,
    sexo: i.sexo === 'v' || i.sexo === 'm' ? i.sexo : null
  }));
  const anio = anioDe(mes);
  const plan = nuevoPlan(h, anio);
  const meses = mesesDelAnio(anio).filter((m) => m >= mes);
  const cargar = (l, monto) => {
    if (!(monto > 0)) return;
    for (const m of meses) fijarPlan(plan, l.id, m, monto);
  };

  for (const ing of r.ingresos || []) {
    const persona = Number.isInteger(ing.personaIndice) ? h.integrantes[ing.personaIndice] : null;
    const l = agregarLinea(h, {
      categoriaId: 'cat_ingresos', nombre: ing.nombre || 'Sueldo', naturaleza: 'fijo',
      moneda: ing.moneda, aguinaldo: !!ing.aguinaldo, personaId: persona ? persona.id : null
    });
    cargar(l, ing.monto);
  }
  asegurarAguinaldo(h);

  const hayMenores = h.integrantes.some((i) => i.tipo === 'menor');
  const elegidos = r.gastos || gastosIniciales({ hayMenores });
  for (const g of elegidos) {
    const cat = categoriaDeIndice(h, g.indice);
    if (!cat) continue;
    const l = agregarLinea(h, { categoriaId: cat.id, nombre: g.nombre, naturaleza: g.naturaleza, clase: g.clase, moneda: g.moneda });
    cargar(l, g.monto);
  }

  const fondo = nuevaMeta(h, {
    nombre: 'Fondo de emergencia', tipo: 'fondo',
    mesesCobertura: Number.isFinite(r.fondoMeses) ? r.fondoMeses : 3,
    objetivoMes: mes
  });
  if (r.fondoAporte > 0) cargar(linea(h, fondo.lineaId), r.fondoAporte);
  if (r.meta && r.meta.nombre) {
    const m = nuevaMeta(h, { nombre: r.meta.nombre, objetivo: r.meta.monto, fecha: r.meta.fecha || null, objetivoMes: mes });
    if (r.meta.aporte > 0) cargar(linea(h, m.lineaId), r.meta.aporte);
  }
  return h;
}

// Gastos con los que arranca un hogar nuevo si no se eligieron otros.
export function gastosIniciales({ hayMenores = false } = {}) {
  const out = [];
  for (const [indice, lista] of Object.entries(SUGERIDAS)) {
    for (const [nombre, naturaleza, clase, inicial] of lista) {
      const escolar = indice === 'educacion' && (nombre === 'Cuota escolar' || nombre.startsWith('Útiles'));
      if (inicial || (hayMenores && escolar)) out.push({ indice, nombre, naturaleza, clase, monto: 0 });
    }
  }
  return out;
}

// ── Metas, deudas, inversiones y compras en cuotas ─────────────────────────────────
export function nuevaMeta(h, d) {
  const meta = {
    id: nuevoId('m'),
    nombre: d.nombre || 'Meta de ahorro',
    tipo: d.tipo === 'fondo' ? 'fondo' : 'meta',
    objetivo: Math.max(0, Math.round(d.objetivo || 0)),
    objetivoMes: d.objetivoMes || mesActual(),
    fecha: d.fecha || null,
    ajustaIPC: d.ajustaIPC !== false,
    mesesCobertura: d.tipo === 'fondo' ? (d.mesesCobertura || 3) : null,
    saldoInicial: Math.round(d.saldoInicial || 0),
    saldoInicialMes: d.saldoInicialMes || d.objetivoMes || mesActual(),
    moneda: d.moneda === 'USD' ? 'USD' : 'ARS',
    lineaId: null
  };
  const l = agregarLinea(h, { categoriaId: 'cat_ahorro', nombre: meta.nombre, naturaleza: 'fijo', moneda: meta.moneda, metaId: meta.id });
  meta.lineaId = l.id;
  h.metas.push(meta);
  return meta;
}

export function nuevaDeuda(h, d) {
  const deuda = {
    id: nuevoId('d'),
    nombre: d.nombre || 'Préstamo',
    cuota: Math.round(d.cuota || 0),
    cuotas: Math.max(1, Math.round(d.cuotas || 1)),
    primerMes: d.primerMes || mesActual(),
    montoOriginal: Math.round(d.montoOriginal || 0),
    tasa: Number.isFinite(d.tasa) ? d.tasa : null,
    moneda: d.moneda === 'USD' ? 'USD' : 'ARS',
    lineaId: null
  };
  const l = agregarLinea(h, { categoriaId: 'cat_deudas', nombre: deuda.nombre, naturaleza: 'fijo', moneda: deuda.moneda, deudaId: deuda.id });
  deuda.lineaId = l.id;
  h.deudas.push(deuda);
  return deuda;
}

export function nuevaInversion(h, d) {
  const inv = {
    id: nuevoId('i'),
    nombre: d.nombre || 'Inversión',
    tipo: d.tipo || 'otra',
    moneda: d.moneda === 'USD' ? 'USD' : 'ARS',
    plazoFijo: d.tipo === 'plazo_fijo' ? {
      capital: Math.round((d.plazoFijo && d.plazoFijo.capital) || 0),
      tna: (d.plazoFijo && d.plazoFijo.tna) || 0,
      inicio: (d.plazoFijo && d.plazoFijo.inicio) || `${mesActual()}-01`,
      dias: (d.plazoFijo && d.plazoFijo.dias) || 30,
      renovar: !d.plazoFijo || d.plazoFijo.renovar !== false
    } : null,
    valuaciones: [],
    lineaId: null
  };
  const l = agregarLinea(h, { categoriaId: 'cat_inversiones', nombre: inv.nombre, naturaleza: 'variable', moneda: inv.moneda, inversionId: inv.id });
  inv.lineaId = l.id;
  h.inversiones.push(inv);
  return inv;
}

export function nuevaCompraEnCuotas(h, d) {
  const c = {
    id: nuevoId('c'),
    lineaId: d.lineaId,
    descripcion: d.descripcion || 'Compra en cuotas',
    montoCuota: Math.round(d.montoCuota || 0),
    cantidad: Math.max(1, Math.round(d.cantidad || 1)),
    primerMes: d.primerMes || mesActual(),
    medioId: d.medioId || null,
    personaId: d.personaId || null
  };
  h.cuotas.push(c);
  return c;
}

export function mesFinCuotas(c) { return sumarMeses(c.primerMes, c.cantidad - 1); }

// Borra una línea y todo lo que cuelga de ella.
export function borrarLinea(h, lineaId) {
  const l = linea(h, lineaId);
  if (!l) return;
  h.lineas = h.lineas.filter((x) => x.id !== lineaId);
  delete h.reales[lineaId];
  for (const p of h.planes) delete p.montos[lineaId];
  h.movimientos = h.movimientos.filter((m) => m.lineaId !== lineaId);
  h.cuotas = h.cuotas.filter((c) => c.lineaId !== lineaId);
  if (l.metaId) h.metas = h.metas.filter((m) => m.id !== l.metaId);
  if (l.deudaId) h.deudas = h.deudas.filter((d) => d.id !== l.deudaId);
  if (l.inversionId) h.inversiones = h.inversiones.filter((i) => i.id !== l.inversionId);
  h.importacion.reglas = h.importacion.reglas.filter((r) => r.lineaId !== lineaId);
}

// ── Validación y migración de lo que sale de un archivo ─────────────────────────────
const esTexto = (x) => typeof x === 'string';
const entero = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);
const esMes = (x) => esTexto(x) && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
const esFecha = (x) => esTexto(x) && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x);
const texto = (x, max = 200) => (esTexto(x) ? x.slice(0, max) : '');

function mapaMeses(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [m, v] of Object.entries(obj)) if (esMes(m) && Number.isFinite(Number(v))) out[m] = Math.round(Number(v));
  }
  return out;
}

export function normalizarHogar(entrada) {
  const avisos = [];
  if (!entrada || typeof entrada !== 'object') throw new Error('El archivo no tiene un hogar válido.');
  if (entrada.formato && entrada.formato !== FORMATO) throw new Error('El archivo no es de Mi Presupuesto.');
  if (entrada.version > VERSION) avisos.push('El archivo se creó con una versión más nueva del programa; puede que algo no se vea.');

  const base = hogarVacio();
  const h = { ...base, ...entrada, formato: FORMATO, version: VERSION };
  h.nombre = texto(entrada.nombre, 120) || 'Mi hogar';
  h.region = esTexto(entrada.region) ? entrada.region : 'gba';
  h.vivienda = ['propia', 'alquilada', 'otra'].includes(entrada.vivienda) ? entrada.vivienda : null;
  h.dolar = esTexto(entrada.dolar) ? entrada.dolar : 'oficial';
  h.dolarManual = {};
  for (const [m, v] of Object.entries(entrada.dolarManual || {})) if (esMes(m) && Number(v) > 0) h.dolarManual[m] = Number(v);

  h.integrantes = (Array.isArray(entrada.integrantes) ? entrada.integrantes : []).filter((i) => i && esTexto(i.id)).map((i) => ({
    id: i.id, nombre: texto(i.nombre, 80) || 'Integrante', tipo: i.tipo === 'menor' ? 'menor' : 'adulto',
    edad: Number.isFinite(i.edad) && i.edad >= 0 && i.edad < 120 ? Math.floor(i.edad) : null,
    sexo: i.sexo === 'v' || i.sexo === 'm' ? i.sexo : null
  }));
  const personas = new Set(h.integrantes.map((i) => i.id));

  h.medios = (Array.isArray(entrada.medios) ? entrada.medios : base.medios).filter((m) => m && esTexto(m.id)).map((m) => ({ id: m.id, nombre: texto(m.nombre, 60) || 'Medio de pago' }));
  const medios = new Set(h.medios.map((m) => m.id));

  // Categorías: las fijas siempre están; se conservan nombres y orden editados.
  const cats = new Map(base.categorias.map((c) => [c.id, c]));
  for (const c of Array.isArray(entrada.categorias) ? entrada.categorias : []) {
    if (!c || !esTexto(c.id)) continue;
    const sec = SECCIONES.some((s) => s.clave === c.seccion) ? c.seccion : 'gastos';
    cats.set(c.id, { id: c.id, seccion: sec, nombre: texto(c.nombre, 80) || 'Categoría', indice: c.indice ?? null, orden: entero(c.orden), plegada: !!c.plegada });
  }
  h.categorias = [...cats.values()].sort((a, b) => a.orden - b.orden);

  const lineas = [];
  const ids = new Set();
  for (const l of Array.isArray(entrada.lineas) ? entrada.lineas : []) {
    if (!l || !esTexto(l.id) || ids.has(l.id)) continue;
    let categoriaId = l.categoriaId;
    if (!cats.has(categoriaId)) { categoriaId = 'cat_varios'; avisos.push(`"${texto(l.nombre)}" no tenía una categoría válida: quedó en Otros bienes y servicios.`); }
    ids.add(l.id);
    lineas.push({
      id: l.id, categoriaId, nombre: texto(l.nombre, 120) || 'Concepto', orden: entero(l.orden),
      naturaleza: l.naturaleza === 'fijo' ? 'fijo' : 'variable',
      clase: ['esencial', 'reducible', 'prescindible'].includes(l.clase) ? l.clase : null,
      claseManual: !!l.claseManual,
      personaId: personas.has(l.personaId) ? l.personaId : null,
      moneda: l.moneda === 'USD' ? 'USD' : 'ARS',
      indice: l.indice ?? null,
      aguinaldo: !!l.aguinaldo,
      auto: ['aguinaldo', 'saldo'].includes(l.auto) ? l.auto : null,
      metaId: esTexto(l.metaId) ? l.metaId : null,
      deudaId: esTexto(l.deudaId) ? l.deudaId : null,
      inversionId: esTexto(l.inversionId) ? l.inversionId : null,
      archivada: !!l.archivada
    });
  }
  // Las líneas automáticas que falten se recrean.
  h.lineas = lineas;
  if (!h.lineas.some((l) => l.auto === 'saldo')) agregarLinea(h, { categoriaId: 'cat_ingresos', nombre: 'Sobrante del mes anterior', auto: 'saldo' });
  const lineaIds = new Set(h.lineas.map((l) => l.id));

  h.planes = (Array.isArray(entrada.planes) ? entrada.planes : []).filter((p) => p && esTexto(p.id) && Number.isInteger(p.anio)).map((p) => {
    const montos = {};
    for (const [lid, meses] of Object.entries(p.montos || {})) if (lineaIds.has(lid)) montos[lid] = mapaMeses(meses);
    return { id: p.id, nombre: texto(p.nombre, 120) || `Presupuesto ${p.anio}`, anio: p.anio, creado: p.creado || ahora(), origen: p.origen || null, montos };
  });
  h.planActivo = {};
  for (const [a, id] of Object.entries(entrada.planActivo || {})) if (h.planes.some((p) => p.id === id)) h.planActivo[a] = id;

  h.reales = {};
  for (const [lid, meses] of Object.entries(entrada.reales || {})) if (lineaIds.has(lid)) h.reales[lid] = mapaMeses(meses);

  h.movimientos = (Array.isArray(entrada.movimientos) ? entrada.movimientos : []).filter((m) => m && esFecha(m.fecha) && lineaIds.has(m.lineaId)).map((m) => ({
    id: esTexto(m.id) ? m.id : nuevoId('mv'), fecha: m.fecha, lineaId: m.lineaId, monto: entero(m.monto),
    descripcion: texto(m.descripcion, 200), medioId: medios.has(m.medioId) ? m.medioId : null,
    personaId: personas.has(m.personaId) ? m.personaId : null, proyectoId: esTexto(m.proyectoId) ? m.proyectoId : null,
    origen: esTexto(m.origen) ? m.origen : null, importado: m.importado || null
  }));

  h.cuotas = (Array.isArray(entrada.cuotas) ? entrada.cuotas : []).filter((c) => c && lineaIds.has(c.lineaId) && esMes(c.primerMes)).map((c) => ({
    id: esTexto(c.id) ? c.id : nuevoId('c'), lineaId: c.lineaId, descripcion: texto(c.descripcion, 200),
    montoCuota: entero(c.montoCuota), cantidad: Math.max(1, entero(c.cantidad)), primerMes: c.primerMes,
    medioId: medios.has(c.medioId) ? c.medioId : null, personaId: personas.has(c.personaId) ? c.personaId : null
  }));

  h.metas = (Array.isArray(entrada.metas) ? entrada.metas : []).filter((m) => m && esTexto(m.id) && lineaIds.has(m.lineaId)).map((m) => ({
    id: m.id, nombre: texto(m.nombre, 120) || 'Meta', tipo: m.tipo === 'fondo' ? 'fondo' : 'meta',
    objetivo: Math.max(0, entero(m.objetivo)), objetivoMes: esMes(m.objetivoMes) ? m.objetivoMes : mesActual(),
    fecha: esMes(m.fecha) ? m.fecha : null, ajustaIPC: m.ajustaIPC !== false,
    mesesCobertura: m.tipo === 'fondo' ? Math.max(1, entero(m.mesesCobertura) || 3) : null,
    saldoInicial: entero(m.saldoInicial), saldoInicialMes: esMes(m.saldoInicialMes) ? m.saldoInicialMes : (esMes(m.objetivoMes) ? m.objetivoMes : mesActual()),
    moneda: m.moneda === 'USD' ? 'USD' : 'ARS', lineaId: m.lineaId
  }));
  h.deudas = (Array.isArray(entrada.deudas) ? entrada.deudas : []).filter((d) => d && esTexto(d.id) && lineaIds.has(d.lineaId)).map((d) => ({
    id: d.id, nombre: texto(d.nombre, 120) || 'Deuda', cuota: entero(d.cuota), cuotas: Math.max(1, entero(d.cuotas)),
    primerMes: esMes(d.primerMes) ? d.primerMes : mesActual(), montoOriginal: entero(d.montoOriginal),
    tasa: Number.isFinite(d.tasa) ? d.tasa : null, moneda: d.moneda === 'USD' ? 'USD' : 'ARS', lineaId: d.lineaId
  }));
  h.inversiones = (Array.isArray(entrada.inversiones) ? entrada.inversiones : []).filter((i) => i && esTexto(i.id) && lineaIds.has(i.lineaId)).map((i) => ({
    id: i.id, nombre: texto(i.nombre, 120) || 'Inversión', tipo: esTexto(i.tipo) ? i.tipo : 'otra', moneda: i.moneda === 'USD' ? 'USD' : 'ARS',
    plazoFijo: i.plazoFijo && typeof i.plazoFijo === 'object' ? {
      capital: entero(i.plazoFijo.capital), tna: Number(i.plazoFijo.tna) || 0,
      inicio: esFecha(i.plazoFijo.inicio) ? i.plazoFijo.inicio : `${mesActual()}-01`,
      dias: Math.max(1, entero(i.plazoFijo.dias) || 30), renovar: i.plazoFijo.renovar !== false
    } : null,
    valuaciones: (Array.isArray(i.valuaciones) ? i.valuaciones : []).filter((v) => v && esFecha(v.fecha)).map((v) => ({ fecha: v.fecha, valor: entero(v.valor) })),
    lineaId: i.lineaId
  }));
  // Las líneas que apuntan a una meta, deuda o inversión borrada quedan como líneas comunes.
  const metas = new Set(h.metas.map((m) => m.id)), deudas = new Set(h.deudas.map((d) => d.id)), invs = new Set(h.inversiones.map((i) => i.id));
  for (const l of h.lineas) {
    if (l.metaId && !metas.has(l.metaId)) l.metaId = null;
    if (l.deudaId && !deudas.has(l.deudaId)) l.deudaId = null;
    if (l.inversionId && !invs.has(l.inversionId)) l.inversionId = null;
  }

  h.proyectos = (Array.isArray(entrada.proyectos) ? entrada.proyectos : []).filter((p) => p && esTexto(p.id)).map((p) => ({
    id: p.id, nombre: texto(p.nombre, 120) || 'Proyecto', fecha: esMes(p.fecha) ? p.fecha : null,
    mesPrecios: esMes(p.mesPrecios) ? p.mesPrecios : mesActual(), metaId: metas.has(p.metaId) ? p.metaId : null,
    creado: p.creado || ahora(), origen: p.origen || null, notas: texto(p.notas, 2000),
    items: (Array.isArray(p.items) ? p.items : []).filter((it) => it && esTexto(it.id)).map((it) => ({
      id: it.id, descripcion: texto(it.descripcion, 200), indice: it.indice || 'general',
      presupuestado: entero(it.presupuestado), gastado: entero(it.gastado)
    }))
  }));

  h.cierres = {};
  for (const [m, c] of Object.entries(entrada.cierres || {})) {
    if (!esMes(m) || !c || typeof c !== 'object') continue;
    h.cierres[m] = { fecha: c.fecha || ahora(), resultado: entero(c.resultado), destino: c.destino && typeof c.destino === 'object' ? c.destino : { tipo: 'nada' }, monto: entero(c.monto) };
  }

  h.fondo = { cubrirInesperados: !entrada.fondo || entrada.fondo.cubrirInesperados !== false };
  const an = entrada.analisis || {};
  h.analisis = {
    comparaciones: { ...base.analisis.comparaciones, ...(an.comparaciones || {}) },
    topes: an.topes && typeof an.topes === 'object' ? an.topes : {},
    descartados: Array.isArray(an.descartados) ? an.descartados.filter(esTexto) : []
  };
  const imp = entrada.importacion || {};
  h.importacion = {
    plantillas: Array.isArray(imp.plantillas) ? imp.plantillas.filter((p) => p && esTexto(p.id)) : [],
    reglas: Array.isArray(imp.reglas) ? imp.reglas.filter((r) => r && esTexto(r.texto) && lineaIds.has(r.lineaId)) : []
  };
  h.preferencias = entrada.preferencias && typeof entrada.preferencias === 'object' ? entrada.preferencias : {};
  asegurarAguinaldo(h);
  return { hogar: h, avisos };
}
