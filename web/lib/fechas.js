// Mi Presupuesto · meses y fechas
// Un mes se representa como texto 'AAAA-MM' y una fecha como 'AAAA-MM-DD': se comparan
// como texto, se guardan tal cual en el archivo y no dependen de la zona horaria.

export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad = (n) => String(n).padStart(2, '0');

export function mesDe(anio, mes1a12) { return `${anio}-${pad(mes1a12)}`; }
export function anioDe(mes) { return Number(mes.slice(0, 4)); }
export function numMes(mes) { return Number(mes.slice(5, 7)); }

export function sumarMeses(mes, n) {
  const t = anioDe(mes) * 12 + (numMes(mes) - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function mesesEntre(desde, hasta) {
  return (anioDe(hasta) - anioDe(desde)) * 12 + (numMes(hasta) - numMes(desde));
}

// Lista de meses desde..hasta inclusive.
export function rangoMeses(desde, hasta) {
  const n = mesesEntre(desde, hasta);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(sumarMeses(desde, i));
  return out;
}

export function mesesDelAnio(anio) {
  return Array.from({ length: 12 }, (_, i) => mesDe(anio, i + 1));
}

// "Hoy" según el reloj local de la PC. Se puede fijar para pruebas.
let hoyFijo = null;
export function fijarHoy(fecha) { hoyFijo = fecha; }
export function hoy() {
  if (hoyFijo) return hoyFijo;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function mesActual() { return hoy().slice(0, 7); }

export function nombreMes(mes, { corto = false, conAnio = true } = {}) {
  const n = (corto ? MES_CORTO : NOMBRES_MES)[numMes(mes) - 1];
  return conAnio ? `${n} ${corto ? String(anioDe(mes)).slice(2) : anioDe(mes)}` : n;
}

export function capitalizar(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function diasDelMes(mes) {
  return new Date(anioDe(mes), numMes(mes), 0).getDate();
}

export function ultimoDia(mes) { return `${mes}-${pad(diasDelMes(mes))}`; }

// Días entre dos fechas 'AAAA-MM-DD' (b - a).
export function diasEntre(a, b) {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86400000);
}

export function sumarDias(fecha, n) {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatoFecha(fecha) {
  if (!fecha) return '';
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

// Interpreta fechas escritas a mano o leídas de un banco: 31/12/2026, 31-12-26,
// 2026-12-31, 31.12.2026 y números de serie de Excel.
export function leerFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor)) {
    return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    const d = new Date(Math.round((valor - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(valor).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = +m[3];
    if (a < 100) a += a < 70 ? 2000 : 1900;
    return valida(a, +m[2], +m[1]);
  }
  return null;
}

function valida(a, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2200) return null;
  const f = new Date(a, m - 1, d);
  if (f.getMonth() !== m - 1) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}
