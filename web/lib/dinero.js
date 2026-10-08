// Mi Presupuesto · plata
// Los montos se guardan en centavos, como enteros: con decimales de coma flotante
// 0,1 + 0,2 no da 0,3 y los totales dejan de cerrar. Se pasa a pesos solo al mostrar.

export const aCentavos = (pesos) => Math.round(Number(pesos) * 100);
export const aPesos = (centavos) => centavos / 100;

// Redondeo de un monto calculado (por ejemplo, después de aplicar un índice).
export const redondear = (centavos) => Math.round(centavos);

const separarMiles = (entero) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// 123456789 -> "1.234.567,89"; sin decimales cuando son ,00 y se pide compacto.
export function formatear(centavos, { decimales = 'auto', signo = false, moneda = '' } = {}) {
  if (centavos === null || centavos === undefined || Number.isNaN(centavos)) return '';
  const negativo = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  const entero = separarMiles(String(Math.floor(abs / 100)));
  const cent = String(abs % 100).padStart(2, '0');
  const conDecimales = decimales === true || (decimales === 'auto' && cent !== '00');
  const cuerpo = conDecimales ? `${entero},${cent}` : entero;
  const prefijo = moneda ? `${moneda} ` : '';
  if (negativo) return `−${prefijo}${cuerpo}`;
  return `${signo && centavos > 0 ? '+' : ''}${prefijo}${cuerpo}`;
}

export const pesos = (c, op = {}) => formatear(c, { moneda: '$', ...op });
export const dolares = (c, op = {}) => formatear(c, { moneda: 'US$', ...op });
export const enMoneda = (c, moneda, op = {}) => moneda === 'USD' ? dolares(c, op) : pesos(c, op);

// Versión corta para gráficos y etiquetas: $ 1,2 M, $ 350 mil.
export function compacto(centavos, moneda = '$') {
  const v = centavos / 100;
  const abs = Math.abs(v);
  const s = v < 0 ? '−' : '';
  const num = (x, d) => x.toFixed(d).replace('.', ',').replace(/,0+$/, '');
  if (abs >= 1e9) return `${s}${moneda} ${num(abs / 1e9, 1)} mil M`;
  if (abs >= 1e6) return `${s}${moneda} ${num(abs / 1e6, abs >= 1e7 ? 1 : 2)} M`;
  if (abs >= 1e4) return `${s}${moneda} ${num(abs / 1e3, 0)} mil`;
  return `${s}${moneda} ${separarMiles(String(Math.round(abs)))}`;
}

export function porcentaje(x, decimales = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '';
  return `${(x * 100).toFixed(decimales).replace('.', ',')} %`;
}

// Interpreta lo que alguien escribe en una celda o lo que trae un archivo del banco.
// Acepta "1.234,56", "1234,56", "1234.56", "$ 1.234", "-1.234,5", "(1.234,50)",
// "1,234.56" (formato inglés) y "1.234" (miles). Devuelve centavos o null.
export function leerMonto(texto) {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto * 100) : null;
  let s = String(texto).trim();
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s ]|US\$|USD|ARS|U\$S|u\$s/gi, '');
  if (/^[-−–]/.test(s)) { negativo = !negativo; s = s.slice(1); }
  if (/[-−–]$/.test(s)) { negativo = !negativo; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s)) return null;
  const comas = (s.match(/,/g) || []).length;
  const puntos = (s.match(/\./g) || []).length;
  let normal;
  if (comas && puntos) {
    // El separador que aparece último es el decimal.
    normal = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comas) {
    // Una sola coma es la decimal ("1,5", "1234,56"); varias son miles en formato inglés.
    normal = comas === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (puntos) {
    // "1.234" o "1.234.567" -> miles (así se escribe en Argentina); "12.5" -> decimal.
    normal = puntos > 1 || /^\d{1,3}\.\d{3}$/.test(s) ? s.replace(/\./g, '') : s;
  } else normal = s;
  const v = Number(normal);
  if (!Number.isFinite(v)) return null;
  const c = Math.round(v * 100);
  return negativo ? -c : c;
}

// Suma segura de centavos (ignora null).
export function sumar(...valores) {
  let t = 0;
  for (const v of valores.flat()) if (Number.isFinite(v)) t += v;
  return t;
}
