// Mi Presupuesto · hogar de ejemplo
// Una familia tipo de GBA (2 adultos y 2 menores) con el año en curso cargado: sirve para
// mostrar el programa funcionando y para las pruebas. Los montos están pensados a precios
// de octubre de 2026 y los meses anteriores se descuentan con una inflación de ~2 % mensual.

import {
  hogarVacio, agregarLinea, asegurarAguinaldo, nuevoPlan, fijarPlan, fijarReal, nuevaMeta,
  nuevaDeuda, nuevaInversion, nuevaCompraEnCuotas, categoriaDeIndice, nuevoId
} from './modelo.js';
import { nuevoProyecto } from './presupuestos.js';
import { crearContexto } from './calculos.js';
import { resumenCierre, cerrarMes } from './cierre.js';
import { mesesDelAnio, anioDe, sumarMeses, mesesEntre, diasDelMes } from './fechas.js';

// Generador pseudoaleatorio con semilla: el ejemplo sale siempre igual.
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const $ = (pesos) => Math.round(pesos * 100);

export function crearEjemplo({ mesHoy, datos }) {
  const r = azar(2026);
  const anio = anioDe(mesHoy);
  const meses = mesesDelAnio(anio);
  const referencia = `${anio}-10`;
  const precio = (pesosOct, mes) => $(pesosOct / Math.pow(1.021, mesesEntre(mes, referencia)));
  const ruido = (x, amplitud) => x * (1 + (r() * 2 - 1) * amplitud);

  const h = hogarVacio({ nombre: 'Familia Ejemplo', region: 'gba', dolar: 'oficial' });
  h.vivienda = 'alquilada';
  h.integrantes = [
    { id: 'per_1', nombre: 'Laura', tipo: 'adulto', edad: 38, sexo: 'm' },
    { id: 'per_2', nombre: 'Martín', tipo: 'adulto', edad: 40, sexo: 'v' },
    { id: 'per_3', nombre: 'Sofía', tipo: 'menor', edad: 9, sexo: 'm' },
    { id: 'per_4', nombre: 'Tomás', tipo: 'menor', edad: 6, sexo: 'v' }
  ];
  const plan = nuevoPlan(h, anio);
  const pasados = meses.filter((m) => m < mesHoy);

  // [nombre, índice o 'ingreso', naturaleza, pesos de octubre, variación real, persona]
  const definicion = [
    ['Sueldo de Laura', 'ingreso', 'fijo', 2150000, 0, 'per_1', { aguinaldo: true }],
    ['Sueldo de Martín', 'ingreso', 'fijo', 1750000, 0, 'per_2', { aguinaldo: true }],
    ['Trabajos por cuenta propia', 'ingreso', 'variable', 250000, 0.6, 'per_2'],
    ['Alquiler', 'vivienda', 'fijo', 650000, 0],
    ['Expensas', 'vivienda', 'fijo', 125000, 0.03],
    ['Electricidad', 'vivienda', 'variable', 48000, 0.25],
    ['Gas', 'vivienda', 'variable', 32000, 0.45],
    ['Agua', 'vivienda', 'fijo', 19000, 0],
    ['Supermercado', 'alimentos', 'variable', 640000, 0.08],
    ['Verdulería y carnicería', 'alimentos', 'variable', 270000, 0.1],
    ['Artículos de limpieza', 'equipamiento', 'variable', 62000, 0.15],
    ['Muebles y electrodomésticos', 'equipamiento', 'variable', 0, 0],
    ['Prepaga u obra social', 'salud', 'fijo', 390000, 0],
    ['Medicamentos', 'salud', 'variable', 42000, 0.4],
    ['Transporte público', 'transporte', 'variable', 52000, 0.1],
    ['Combustible', 'transporte', 'variable', 125000, 0.2],
    ['Seguro del auto', 'transporte', 'fijo', 72000, 0],
    ['Internet', 'comunicacion', 'fijo', 36000, 0],
    ['Celulares', 'comunicacion', 'fijo', 41000, 0],
    ['Streaming y suscripciones', 'recreacion', 'fijo', 27000, 0],
    ['Salidas y entretenimiento', 'recreacion', 'variable', 150000, 0.35],
    ['Deportes y gimnasio', 'recreacion', 'fijo', 46000, 0, 'per_1'],
    ['Cuota escolar', 'educacion', 'fijo', 360000, 0],
    ['Útiles y uniformes', 'educacion', 'variable', 25000, 0.6],
    ['Delivery y comida afuera', 'restaurantes', 'variable', 135000, 0.3],
    ['Ropa', 'ropa', 'variable', 95000, 0.5],
    ['Calzado', 'ropa', 'variable', 0, 0],
    ['Cuidado personal', 'varios', 'variable', 52000, 0.2]
  ];

  const lineas = {};
  for (const [nombre, ind, naturaleza, oct, variacion, persona, extra = {}] of definicion) {
    const categoriaId = ind === 'ingreso' ? 'cat_ingresos' : categoriaDeIndice(h, ind).id;
    const l = agregarLinea(h, { categoriaId, nombre, naturaleza, personaId: persona || null, ...extra });
    lineas[nombre] = l;
    if (!oct) continue;
    for (const m of meses) fijarPlan(plan, l.id, m, precio(oct, m));
    for (const m of pasados) {
      if (naturaleza === 'fijo' && variacion === 0) { fijarReal(h, l.id, m, precio(oct, m)); continue; }
      let v = ruido(oct, variacion);
      if (nombre === 'Gas' && [6, 7, 8].includes(Number(m.slice(5)))) v *= 2.2;
      if (nombre === 'Útiles y uniformes' && Number(m.slice(5)) === 2) v *= 6;
      fijarReal(h, l.id, m, precio(v, m));
    }
  }
  asegurarAguinaldo(h);

  // El supermercado de los últimos meses va con movimientos sueltos (con medio de pago).
  const sup = lineas.Supermercado;
  for (const m of pasados.slice(-3)) {
    delete (h.reales[sup.id] || {})[m];
    const compras = 6 + Math.floor(r() * 4);
    const total = precio(ruido(640000, 0.08), m) / 100;
    let restante = total;
    for (let k = 0; k < compras; k++) {
      const monto = k === compras - 1 ? restante : Math.round((total / compras) * (0.6 + r() * 0.8));
      restante -= monto;
      const dia = String(Math.min(diasDelMes(m), 1 + Math.floor((k / compras) * diasDelMes(m)) + Math.floor(r() * 3))).padStart(2, '0');
      h.movimientos.push({
        id: nuevoId('mv'), fecha: `${m}-${dia}`, lineaId: sup.id, monto: $(monto),
        descripcion: ['Coto', 'Carrefour', 'Día', 'Jumbo', 'Chino del barrio'][Math.floor(r() * 5)],
        medioId: r() < 0.5 ? 'med_2' : (r() < 0.6 ? 'med_3' : 'med_5'), personaId: null, proyectoId: null, origen: null, importado: null
      });
    }
  }

  // Compras en cuotas: una heladera y unas zapatillas.
  nuevaCompraEnCuotas(h, { lineaId: lineas['Muebles y electrodomésticos'].id, descripcion: 'Heladera', montoCuota: $(98000), cantidad: 6, primerMes: sumarMeses(mesHoy, -2), medioId: 'med_3' });
  nuevaCompraEnCuotas(h, { lineaId: lineas.Calzado.id, descripcion: 'Zapatillas de los chicos', montoCuota: $(42000), cantidad: 3, primerMes: sumarMeses(mesHoy, -1), medioId: 'med_3' });

  // Imprevistos del año (los cubre el fondo de emergencia).
  const imprevisto = (nombre, mes, pesosOct, descripcion) => {
    const l = h.lineas.find((x) => x.nombre === nombre && x.categoriaId === 'cat_inesperados');
    if (l && mes < mesHoy && mes >= `${anio}-01`) {
      h.movimientos.push({ id: nuevoId('mv'), fecha: `${mes}-14`, lineaId: l.id, monto: precio(pesosOct, mes), descripcion, medioId: 'med_4', personaId: null, proyectoId: null, origen: null, importado: null });
    }
  };
  imprevisto('Salud', sumarMeses(mesHoy, -5), 120000, 'Dentista');
  imprevisto('Reparaciones de la casa', sumarMeses(mesHoy, -3), 185000, 'Calefón');
  imprevisto('Auto', sumarMeses(mesHoy, -2), 260000, 'Embrague');

  // Préstamo personal en 12 cuotas.
  nuevaDeuda(h, { nombre: 'Préstamo personal', cuota: $(150000), cuotas: 12, primerMes: `${anio}-03`, montoOriginal: $(1300000) });

  // Fondo de emergencia y una meta con fecha.
  const fondo = nuevaMeta(h, { nombre: 'Fondo de emergencia', tipo: 'fondo', mesesCobertura: 3, saldoInicial: $(1500000), saldoInicialMes: `${anio}-01`, objetivoMes: `${anio}-01` });
  for (const m of meses) fijarPlan(plan, fondo.lineaId, m, precio(150000, m));
  for (const m of pasados) fijarReal(h, fondo.lineaId, m, precio(150000, m));
  const vacaciones = nuevaMeta(h, { nombre: 'Vacaciones de verano', objetivo: $(2400000), objetivoMes: `${anio}-06`, fecha: `${anio + 1}-01`, saldoInicialMes: `${anio}-06` });
  for (const m of meses.filter((x) => x >= `${anio}-06`)) fijarPlan(plan, vacaciones.lineaId, m, $(220000));
  for (const m of pasados.filter((x) => x >= `${anio}-06`)) fijarReal(h, vacaciones.lineaId, m, $(220000));

  // Inversiones: un plazo fijo, un fondo común y dólares.
  // El plazo fijo se armó con el aguinaldo de junio.
  const pf = nuevaInversion(h, { nombre: 'Plazo fijo', tipo: 'plazo_fijo', plazoFijo: { capital: $(1000000), tna: 26, inicio: `${anio}-06-22`, dias: 30, renovar: true } });
  fijarReal(h, pf.lineaId, `${anio}-06`, $(1000000));
  fijarPlan(plan, pf.lineaId, `${anio}-06`, $(1000000));
  const fci = nuevaInversion(h, { nombre: 'Fondo común de inversión', tipo: 'fci' });
  fijarReal(h, fci.lineaId, `${anio}-04`, $(300000));
  fci.valuaciones.push({ fecha: `${sumarMeses(mesHoy, -1)}-28`, valor: $(338000) });
  const usd = nuevaInversion(h, { nombre: 'Ahorro en dólares', tipo: 'dolares', moneda: 'USD' });
  for (const m of pasados.filter((x) => Number(x.slice(5)) % 2 === 0)) fijarReal(h, usd.lineaId, m, $(150));
  for (const m of meses.filter((x) => Number(x.slice(5)) % 2 === 0)) fijarPlan(plan, usd.lineaId, m, $(150));

  // Un proyecto: reforma del baño, presupuestada en marzo.
  nuevoProyecto(h, {
    nombre: 'Reforma del baño', fecha: `${anio + 1}-03`, mesPrecios: `${anio}-03`,
    items: [
      { descripcion: 'Sanitarios', indice: 'equipamiento', presupuestado: $(780000) },
      { descripcion: 'Cerámicos y pegamento', indice: 'vivienda', presupuestado: $(560000) },
      { descripcion: 'Grifería', indice: 'equipamiento', presupuestado: $(260000) },
      { descripcion: 'Mano de obra', indice: 'vivienda', presupuestado: $(1050000) }
    ]
  });

  // Un tope propio: comer afuera no más del 3 % de los ingresos.
  h.analisis.topes[categoriaDeIndice(h, 'restaurantes').id] = { tipo: 'porcentaje', valor: 3 };

  // Meses cerrados: todos los anteriores menos el último, que queda para cerrar. Lo que
  // sobra en los meses pares va a una meta (el fondo hasta mayo, las vacaciones después);
  // en los impares, y si falta plata, pasa al mes siguiente.
  for (const m of pasados.slice(0, -1)) {
    const ctx = crearContexto(h, datos, { mesHoy });
    const { resultado } = resumenCierre(ctx, m);
    const meta = m >= `${anio}-06` ? vacaciones : fondo;
    const destino = resultado > 0 && Number(m.slice(5)) % 2 === 0 ? { tipo: 'meta', metaId: meta.id } : { tipo: 'siguiente' };
    cerrarMes(ctx, m, destino);
  }

  h.preferencias = { ejemplo: true };
  return h;
}

