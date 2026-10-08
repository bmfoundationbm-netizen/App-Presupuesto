// Mi Presupuesto · catálogo fijo: regiones, categorías del IPC, secciones de la planilla,
// subcategorías sugeridas, composiciones familiares y adulto equivalente.

export const REGIONES = [
  { clave: 'gba', nombre: 'GBA', detalle: 'Ciudad de Buenos Aires y los 24 partidos del conurbano' },
  { clave: 'pampeana', nombre: 'Pampeana', detalle: 'Resto de Buenos Aires, Córdoba, Santa Fe, Entre Ríos y La Pampa' },
  { clave: 'nea', nombre: 'Noreste', detalle: 'Chaco, Corrientes, Formosa y Misiones' },
  { clave: 'noa', nombre: 'Noroeste', detalle: 'Catamarca, Jujuy, La Rioja, Salta, Santiago del Estero y Tucumán' },
  { clave: 'cuyo', nombre: 'Cuyo', detalle: 'Mendoza, San Juan y San Luis' },
  { clave: 'patagonia', nombre: 'Patagonia', detalle: 'Chubut, Neuquén, Río Negro, Santa Cruz y Tierra del Fuego' },
  { clave: 'nacional', nombre: 'Todo el país', detalle: 'IPC nacional; para la canasta básica se usa la de GBA' }
];
export const nombreRegion = (clave) => (REGIONES.find((r) => r.clave === clave) || {}).nombre || clave;

// Las 12 divisiones del IPC del INDEC (y del gasto de la ENGHo), más el nivel general.
export const INDICES = [
  { clave: 'alimentos', nombre: 'Alimentos y bebidas', oficial: 'Alimentos y bebidas no alcohólicas' },
  { clave: 'alcohol', nombre: 'Alcohol y tabaco', oficial: 'Bebidas alcohólicas y tabaco' },
  { clave: 'ropa', nombre: 'Ropa y calzado', oficial: 'Prendas de vestir y calzado' },
  { clave: 'vivienda', nombre: 'Vivienda y servicios', oficial: 'Vivienda, agua, electricidad, gas y otros combustibles' },
  { clave: 'equipamiento', nombre: 'Equipamiento del hogar', oficial: 'Equipamiento y mantenimiento del hogar' },
  { clave: 'salud', nombre: 'Salud', oficial: 'Salud' },
  { clave: 'transporte', nombre: 'Transporte', oficial: 'Transporte' },
  { clave: 'comunicacion', nombre: 'Comunicación', oficial: 'Comunicación' },
  { clave: 'recreacion', nombre: 'Recreación y cultura', oficial: 'Recreación y cultura' },
  { clave: 'educacion', nombre: 'Educación', oficial: 'Educación' },
  { clave: 'restaurantes', nombre: 'Restaurantes y hoteles', oficial: 'Restaurantes y hoteles' },
  { clave: 'varios', nombre: 'Otros bienes y servicios', oficial: 'Bienes y servicios varios' }
];
export const INDICE_GENERAL = { clave: 'general', nombre: 'Nivel general', oficial: 'Nivel general' };
export const CLAVES_DIVISION = INDICES.map((i) => i.clave);
export const nombreIndice = (clave) => clave === 'general' ? INDICE_GENERAL.nombre
  : clave ? ((INDICES.find((i) => i.clave === clave) || {}).nombre || clave) : 'Sin ajuste';

// Secciones de la planilla, en el orden en que se muestran. "signo" indica si suma o
// resta en el resultado del mes.
export const SECCIONES = [
  { clave: 'ingresos', nombre: 'Ingresos', signo: 1, indice: 'general' },
  { clave: 'gastos', nombre: 'Gastos', signo: -1, indice: null },
  { clave: 'inesperados', nombre: 'Gastos inesperados', signo: -1, indice: null },
  { clave: 'ahorro', nombre: 'Ahorro', signo: -1, indice: 'general' },
  { clave: 'deudas', nombre: 'Deudas y préstamos', signo: -1, indice: null },
  { clave: 'inversiones', nombre: 'Inversiones', signo: -1, indice: 'general' }
];
export const seccion = (clave) => SECCIONES.find((s) => s.clave === clave);

export const NATURALEZAS = { fijo: 'Fijo', variable: 'Variable' };
export const CLASES = {
  esencial: { nombre: 'Esencial', detalle: 'No se puede dejar de pagar sin un problema serio.' },
  reducible: { nombre: 'Reducible', detalle: 'Hace falta, pero se puede gastar menos.' },
  prescindible: { nombre: 'Prescindible', detalle: 'Se puede dejar de pagar por un tiempo.' }
};

// Subcategorías sugeridas para cada categoría de gasto: [nombre, naturaleza, clase, inicial].
// "inicial" marca las que aparecen en un hogar nuevo; las demás se ofrecen al agregar.
export const SUGERIDAS = {
  alimentos: [
    ['Supermercado', 'variable', 'esencial', true],
    ['Verdulería y carnicería', 'variable', 'esencial', true],
    ['Panadería y almacén', 'variable', 'esencial', false],
    ['Bebidas sin alcohol', 'variable', 'reducible', false]
  ],
  alcohol: [
    ['Bebidas alcohólicas', 'variable', 'prescindible', false],
    ['Cigarrillos', 'variable', 'prescindible', false]
  ],
  ropa: [
    ['Ropa', 'variable', 'reducible', true],
    ['Calzado', 'variable', 'reducible', false]
  ],
  vivienda: [
    ['Alquiler', 'fijo', 'esencial', false],
    ['Expensas', 'fijo', 'esencial', false],
    ['Electricidad', 'variable', 'esencial', true],
    ['Gas', 'variable', 'esencial', true],
    ['Agua', 'fijo', 'esencial', true],
    ['Impuestos municipales (ABL)', 'fijo', 'esencial', false],
    ['Mantenimiento y reparaciones', 'variable', 'reducible', false]
  ],
  equipamiento: [
    ['Artículos de limpieza', 'variable', 'esencial', true],
    ['Servicio doméstico', 'fijo', 'reducible', false],
    ['Muebles y electrodomésticos', 'variable', 'prescindible', false]
  ],
  salud: [
    ['Prepaga u obra social', 'fijo', 'esencial', true],
    ['Medicamentos', 'variable', 'esencial', true],
    ['Consultas y estudios', 'variable', 'esencial', false],
    ['Óptica y odontología', 'variable', 'reducible', false]
  ],
  transporte: [
    ['Transporte público', 'variable', 'esencial', true],
    ['Combustible', 'variable', 'reducible', false],
    ['Seguro del auto', 'fijo', 'esencial', false],
    ['Patente', 'fijo', 'esencial', false],
    ['Mantenimiento del auto', 'variable', 'reducible', false],
    ['Estacionamiento y peajes', 'variable', 'reducible', false],
    ['Taxis y aplicaciones', 'variable', 'prescindible', false]
  ],
  comunicacion: [
    ['Internet', 'fijo', 'esencial', true],
    ['Celulares', 'fijo', 'esencial', true],
    ['Televisión por cable', 'fijo', 'prescindible', false]
  ],
  recreacion: [
    ['Streaming y suscripciones', 'fijo', 'prescindible', true],
    ['Salidas y entretenimiento', 'variable', 'prescindible', true],
    ['Deportes y gimnasio', 'fijo', 'reducible', false],
    ['Vacaciones', 'variable', 'reducible', false],
    ['Mascotas', 'variable', 'reducible', false],
    ['Libros y juegos', 'variable', 'prescindible', false]
  ],
  educacion: [
    ['Cuota escolar', 'fijo', 'esencial', false],
    ['Útiles y uniformes', 'variable', 'esencial', false],
    ['Cursos y capacitación', 'fijo', 'reducible', false]
  ],
  restaurantes: [
    ['Delivery y comida afuera', 'variable', 'prescindible', true],
    ['Viandas y comedor', 'variable', 'reducible', false]
  ],
  varios: [
    ['Cuidado personal', 'variable', 'reducible', true],
    ['Seguros', 'fijo', 'esencial', false],
    ['Regalos', 'variable', 'prescindible', false],
    ['Gastos bancarios y comisiones', 'fijo', 'reducible', false],
    ['Otros gastos', 'variable', 'reducible', false]
  ]
};

// Líneas de gastos inesperados: cada una con el índice que le corresponde.
export const INESPERADOS = [
  ['Salud', 'salud'],
  ['Reparaciones de la casa', 'vivienda'],
  ['Auto', 'transporte'],
  ['Electrodomésticos', 'equipamiento'],
  ['Otros imprevistos', 'varios']
];

// Clase sugerida para una línea según su nombre (para las que agrega cada uno).
export function claseSugerida(nombre, indice) {
  const n = String(nombre || '').toLowerCase();
  for (const lista of Object.values(SUGERIDAS)) {
    const s = lista.find((x) => x[0].toLowerCase() === n);
    if (s) return s[2];
  }
  if (/alquiler|expensa|luz|electric|gas|agua|prepaga|obra social|medicament|colegio|escuela|cuota escolar|seguro|patente|internet|celular|abl|impuesto/.test(n)) return 'esencial';
  if (/netflix|spotify|disney|hbo|max|prime|streaming|suscrip|delivery|pedidosya|rappi|salida|bar|cine|regalo|cigarr|alcohol|apuesta|juego|uber|cabify|taxi|cable/.test(n)) return 'prescindible';
  if (indice === 'alcohol' || indice === 'restaurantes') return 'prescindible';
  if (indice === 'salud' || indice === 'vivienda' || indice === 'educacion') return 'esencial';
  return 'reducible';
}

export const MEDIOS_PAGO = ['Efectivo', 'Débito', 'Tarjeta de crédito', 'Transferencia', 'Billetera virtual'];

export const COMPOSICIONES = [
  { clave: '1-0', adultos: 1, menores: 0, nombre: '1 adulto' },
  { clave: '2-0', adultos: 2, menores: 0, nombre: '2 adultos' },
  { clave: '1-1', adultos: 1, menores: 1, nombre: '1 adulto y 1 menor' },
  { clave: '1-2', adultos: 1, menores: 2, nombre: '1 adulto y 2 menores' },
  { clave: '2-1', adultos: 2, menores: 1, nombre: '2 adultos y 1 menor' },
  { clave: '2-2', adultos: 2, menores: 2, nombre: '2 adultos y 2 menores', nota: 'la familia tipo del INDEC' },
  { clave: '2-3', adultos: 2, menores: 3, nombre: '2 adultos y 3 menores' }
];

// Unidades de adulto equivalente por edad y sexo que usa el INDEC para las canastas.
// Tomadas de la columna "adequi" de los microdatos de la ENGHo 2017-2018 (cada edad y
// sexo tiene un único valor). Índice = edad; desde 76 años en adelante, el último valor.
const AE = {
  v: [0.35, 0.35, 0.46, 0.51, 0.55, 0.60, 0.64, 0.66, 0.68, 0.69, 0.79, 0.82, 0.85, 0.90, 0.96, 1.00, 1.03, 1.04],
  m: [0.35, 0.35, 0.46, 0.51, 0.55, 0.60, 0.64, 0.66, 0.68, 0.69, 0.70, 0.72, 0.74, 0.76, 0.76, 0.77, 0.77, 0.77]
};
function aeAdulto(sexo, edad) {
  if (sexo === 'v') return edad <= 29 ? 1.02 : edad <= 60 ? 1.00 : edad <= 75 ? 0.83 : 0.74;
  return edad <= 29 ? 0.76 : edad <= 45 ? 0.77 : edad <= 60 ? 0.76 : edad <= 75 ? 0.67 : 0.63;
}
export function adultoEquivalente(sexo, edad) {
  const e = Math.max(0, Math.floor(edad));
  if (e < 18) return AE[sexo][e];
  return aeAdulto(sexo, e);
}

// Promedios para cuando no se cargó la edad o el sexo: el promedio simple de las edades
// de cada grupo (adultos de 18 a 60 años; menores de 0 a 17).
const promedio = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const edades = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const AE_PROMEDIO = {
  adulto: { v: promedio(edades(18, 60).map((e) => adultoEquivalente('v', e))), m: promedio(edades(18, 60).map((e) => adultoEquivalente('m', e))) },
  menor: { v: promedio(edades(0, 17).map((e) => adultoEquivalente('v', e))), m: promedio(edades(0, 17).map((e) => adultoEquivalente('m', e))) }
};
for (const g of ['adulto', 'menor']) AE_PROMEDIO[g].x = (AE_PROMEDIO[g].v + AE_PROMEDIO[g].m) / 2;

export const TIPOS_INVERSION = {
  plazo_fijo: 'Plazo fijo',
  fci: 'Fondo común de inversión',
  acciones: 'Acciones o CEDEARs',
  bonos: 'Bonos u obligaciones',
  dolares: 'Dólares',
  cripto: 'Criptomonedas',
  otra: 'Otra'
};

export const COTIZACIONES = {
  oficial: 'Oficial (Banco Nación, venta al público)',
  mayorista: 'Oficial mayorista (Banco Central)',
  mep: 'MEP (bolsa)',
  blue: 'Blue (informal)',
  manual: 'La cargo a mano'
};
