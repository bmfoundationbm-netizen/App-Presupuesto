// Mi Presupuesto · colores de los datos
//
// Ocho familias de color fijas por significado (nunca por posición ni por tamaño), con
// los tonos validados de la guía de visualización para claro y oscuro. Las 12 categorías
// del IPC se agrupan en esas familias; cuando hace falta distinguirlas a todas se usa una
// tabla o etiquetas directas, nunca un color generado.

export const FAMILIAS = {
  casa: { nombre: 'Vivienda y hogar', var: '--fam-casa' },
  comida: { nombre: 'Comida', var: '--fam-comida' },
  salud: { nombre: 'Salud', var: '--fam-salud' },
  educacion: { nombre: 'Educación', var: '--fam-educacion' },
  ocio: { nombre: 'Salidas y recreación', var: '--fam-ocio' },
  ahorro: { nombre: 'Ahorro e inversiones', var: '--fam-ahorro' },
  transporte: { nombre: 'Transporte', var: '--fam-transporte' },
  deudas: { nombre: 'Deudas e imprevistos', var: '--fam-deudas' },
  otros: { nombre: 'Otros gastos', var: '--fam-otros' }
};

export const FAMILIA_DE_INDICE = {
  vivienda: 'casa', equipamiento: 'casa',
  alimentos: 'comida', alcohol: 'comida',
  salud: 'salud', educacion: 'educacion',
  recreacion: 'ocio', restaurantes: 'ocio',
  transporte: 'transporte',
  ropa: 'otros', comunicacion: 'otros', varios: 'otros'
};

export function familiaDeCategoria(c) {
  if (!c) return 'otros';
  if (c.seccion === 'gastos') return FAMILIA_DE_INDICE[c.indice] || 'otros';
  if (c.seccion === 'ahorro' || c.seccion === 'inversiones') return 'ahorro';
  if (c.seccion === 'deudas' || c.seccion === 'inesperados') return 'deudas';
  return 'otros';
}

export const colorFamilia = (f) => `var(${(FAMILIAS[f] || FAMILIAS.otros).var})`;
export const colorCategoria = (c) => colorFamilia(familiaDeCategoria(c));

export const COLOR_SECCION = {
  ingresos: 'var(--fam-ingresos)', gastos: 'var(--eje)', inesperados: 'var(--fam-deudas)',
  ahorro: 'var(--fam-ahorro)', deudas: 'var(--fam-deudas)', inversiones: 'var(--fam-ahorro)'
};

// Series de la evolución mensual: los tres primeros tonos, que se distinguen entre sí en
// cualquier combinación (validado para todos los pares).
export const SERIES = { ingresos: 'var(--serie-1)', gastos: 'var(--serie-2)', ahorro: 'var(--serie-3)' };

// Pares de familias que no se distinguen bien (visión normal o daltonismo) en alguno de
// los dos temas, según el validador. En la torta nunca quedan una al lado de la otra.
const CHOCAN = new Set([
  'comida|educacion', 'comida|ocio', 'comida|ahorro', 'comida|deudas', 'ocio|deudas',
  'casa|transporte', 'salud|ocio', 'salud|ahorro', 'educacion|deudas',
  'otros|deudas', 'otros|educacion', 'otros|salud', 'otros|ocio'
]);
const chocan = (a, b) => CHOCAN.has(`${a}|${b}`) || CHOCAN.has(`${b}|${a}`);

// Orden circular para la torta: el más parecido al orden fijo de las familias en el que
// ningún par vecino se confunde. Si no hay ninguno, devuelve null.
export function ordenSeguro(familias) {
  const orden = Object.keys(FAMILIAS);
  const base = [...familias].sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  if (base.length <= 1) return base;
  let mejor = null, mejorCosto = Infinity;
  const usado = new Array(base.length).fill(false);
  const actual = [];
  const probar = (costo) => {
    if (costo >= mejorCosto) return;
    if (actual.length === base.length) {
      if (base.length > 2 && chocan(actual[0], actual[actual.length - 1])) return;
      mejor = [...actual]; mejorCosto = costo; return;
    }
    for (let i = 0; i < base.length; i++) {
      if (usado[i]) continue;
      if (actual.length && chocan(actual[actual.length - 1], base[i])) continue;
      usado[i] = true; actual.push(base[i]);
      probar(costo + Math.abs(i - (actual.length - 1)));
      actual.pop(); usado[i] = false;
    }
  };
  probar(0);
  return mejor;
}
