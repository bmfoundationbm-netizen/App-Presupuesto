// Mi Presupuesto · índices: IPC, proyección de inflación, dólar y canasta básica
//
// El IPC oficial (INDEC, base diciembre 2016 = 100) llega hasta el último mes publicado.
// Para los meses siguientes la serie se extiende con, en este orden:
//   1. la inflación que cada uno carga a mano para un mes que el INDEC todavía no publicó,
//   2. la proyección elegida: REM del Banco Central (por defecto), una tasa propia o el
//      promedio de los últimos 3 meses publicados.
// La proyección es la misma para todas las categorías: el REM solo pronostica el nivel
// general.

import { sumarMeses, mesesEntre, anioDe } from './fechas.js';

export const MES_BASE = '2016-12';

export class Indices {
  constructor(datos, { manual = {}, proyeccion = { modo: 'rem', tasa: null } } = {}) {
    this.datos = datos || {};
    this.ipc = this.datos.ipc || null;
    this.manual = manual || {};
    this.proyeccion = proyeccion || { modo: 'rem' };
    this._series = new Map();
    this._tasas = new Map();
  }

  get hasta() { return this.ipc ? this.ipc.hasta : null; }
  get desde() { return this.ipc ? this.ipc.desde : MES_BASE; }

  _oficial(region, clave) {
    const s = this.ipc && this.ipc.series;
    if (!s) return null;
    const r = s[region] || s.nacional;
    return (r && r[clave]) || (s.nacional && s.nacional[clave]) || null;
  }

  // Inflación mensual (en %) que se usa para un mes posterior al último publicado.
  tasa(mes) {
    if (this._tasas.has(mes)) return this._tasas.get(mes);
    let t;
    if (Number.isFinite(this.manual[mes])) t = { tasa: this.manual[mes], fuente: 'manual' };
    else t = this._proyectada(mes);
    this._tasas.set(mes, t);
    return t;
  }

  _promedioReciente() {
    const g = this._oficial('nacional', 'general');
    if (!g || g.length < 4) return 2;
    const n = g.length;
    const tasas = [1, 2, 3].map((k) => (g[n - k] / g[n - k - 1] - 1) * 100);
    return tasas.reduce((s, x) => s + x, 0) / tasas.length;
  }

  _proyectada(mes) {
    const p = this.proyeccion || {};
    if (p.modo === 'usuario' && Number.isFinite(p.tasa)) return { tasa: p.tasa, fuente: 'usuario' };
    const rem = this.datos.rem;
    if (p.modo === 'promedio' || !rem || !rem.mensual || !rem.mensual.length) {
      return { tasa: this._promedioReciente(), fuente: 'promedio' };
    }
    const directo = rem.mensual.find((x) => x.mes === mes);
    if (directo) return { tasa: directo.v, fuente: 'rem' };
    const rel = rem.relevamiento;
    const k = mesesEntre(rel, mes);
    if (k >= 1 && k <= 12 && Number.isFinite(rem.prox12)) {
      // Lo que falta para completar la inflación esperada a 12 meses, repartido parejo.
      let conocido = 1, quedan = 0;
      for (let i = 1; i <= 12; i++) {
        const m = sumarMeses(rel, i);
        const x = rem.mensual.find((y) => y.mes === m);
        if (x) conocido *= 1 + x.v / 100; else quedan++;
      }
      const resto = (1 + rem.prox12 / 100) / conocido;
      if (quedan > 0 && resto > 0) return { tasa: (Math.pow(resto, 1 / quedan) - 1) * 100, fuente: 'rem12' };
    }
    if (k > 12 && k <= 24 && Number.isFinite(rem.prox24)) {
      return { tasa: (Math.pow(1 + rem.prox24 / 100, 1 / 12) - 1) * 100, fuente: 'rem24' };
    }
    const anual = rem.anual || {};
    const anios = Object.keys(anual).map(Number).sort();
    if (anios.length) {
      const a = anios.includes(anioDe(mes)) ? anioDe(mes) : anios[anios.length - 1];
      return { tasa: (Math.pow(1 + anual[a] / 100, 1 / 12) - 1) * 100, fuente: 'remAnual' };
    }
    if (Number.isFinite(rem.prox24)) return { tasa: (Math.pow(1 + rem.prox24 / 100, 1 / 12) - 1) * 100, fuente: 'rem24' };
    return { tasa: this._promedioReciente(), fuente: 'promedio' };
  }

  // Valor del índice para una región y categoría en un mes.
  // tipo: 'oficial' | 'manual' | 'proyectado' | 'sinDatos'.
  valor(region, clave, mes) {
    const serie = this._oficial(region, clave || 'general');
    if (!serie) return { v: null, tipo: 'sinDatos' };
    const i = mesesEntre(this.desde, mes);
    if (i < 0) return { v: null, tipo: 'sinDatos' };
    if (i < serie.length && serie[i] !== null) return { v: serie[i], tipo: 'oficial' };
    // Extensión hacia adelante desde el último valor oficial.
    const clv = `${region}|${clave}`;
    let ext = this._series.get(clv);
    if (!ext) {
      let ultimo = serie.length - 1;
      while (ultimo > 0 && serie[ultimo] === null) ultimo--;
      ext = { base: sumarMeses(this.desde, ultimo), valores: [serie[ultimo]], tipos: ['oficial'] };
      this._series.set(clv, ext);
    }
    const k = mesesEntre(ext.base, mes);
    if (k < 0) return { v: null, tipo: 'sinDatos' };
    while (ext.valores.length <= k) {
      const m = sumarMeses(ext.base, ext.valores.length);
      const t = this.tasa(m);
      const previo = ext.tipos[ext.tipos.length - 1];
      ext.valores.push(ext.valores[ext.valores.length - 1] * (1 + t.tasa / 100));
      ext.tipos.push(t.fuente === 'manual' && previo !== 'proyectado' ? 'manual' : 'proyectado');
    }
    return { v: ext.valores[k], tipo: ext.tipos[k] };
  }

  // Cuánto aumentaron los precios entre dos meses: valor(hasta) / valor(desde).
  factor(region, clave, desde, hasta) {
    if (desde === hasta) return { f: 1, tipo: 'oficial' };
    const a = this.valor(region, clave, desde), b = this.valor(region, clave, hasta);
    if (!a.v || !b.v) return { f: 1, tipo: 'sinDatos' };
    const orden = ['oficial', 'manual', 'proyectado'];
    const tipo = orden[Math.max(orden.indexOf(a.tipo), orden.indexOf(b.tipo))];
    return { f: b.v / a.v, tipo };
  }

  variacionMensual(region, clave, mes) {
    const f = this.factor(region, clave, sumarMeses(mes, -1), mes);
    return f.tipo === 'sinDatos' ? null : { v: (f.f - 1) * 100, tipo: f.tipo };
  }

  variacionInteranual(region, clave, mes) {
    const f = this.factor(region, clave, sumarMeses(mes, -12), mes);
    return f.tipo === 'sinDatos' ? null : { v: (f.f - 1) * 100, tipo: f.tipo };
  }

  // Dólar: pesos por dólar en un mes. manualHogar = { 'AAAA-MM': pesos } cargado a mano.
  dolar(tipo, mes, manualHogar = {}) {
    if (manualHogar && Number.isFinite(manualHogar[mes])) return { v: manualHogar[mes], tipo: 'manual' };
    if (tipo === 'manual') {
      const previos = Object.keys(manualHogar || {}).filter((m) => m <= mes && Number.isFinite(manualHogar[m])).sort();
      if (previos.length) return { v: manualHogar[previos[previos.length - 1]], tipo: 'manual' };
      tipo = 'oficial';
    }
    const d = (this.datos.dolar || {})[tipo] || (this.datos.dolar || {}).oficial;
    if (!d) return { v: null, tipo: 'sinDatos' };
    const i = mesesEntre(d.desde, mes);
    if (i < 0) return { v: d.venta.find((x) => x) || null, tipo: 'aproximado' };
    if (i < d.venta.length && d.venta[i]) {
      const enCurso = i === d.venta.length - 1;
      return { v: enCurso && d.ultimo ? d.ultimo.venta : d.venta[i], tipo: enCurso ? 'ultimo' : 'promedio' };
    }
    return { v: d.ultimo ? d.ultimo.venta : d.venta[d.venta.length - 1], tipo: 'ultimo' };
  }

  // Canasta básica por adulto equivalente (pesos por mes).
  // tipo: 'oficial' | 'estimado' (región sin publicar, estimada desde GBA) | 'proyectado'.
  canasta(region, mes) {
    const regiones = (this.datos.canasta || {}).regiones || {};
    const r = regiones[region] ? region : 'gba';
    const c = regiones[r];
    if (!c) return { cba: null, cbt: null, tipo: 'sinDatos' };
    const i = mesesEntre(c.desde, mes);
    if (i < 0) return { cba: null, cbt: null, tipo: 'sinDatos' };
    const n = Math.min(c.cba.length, c.cbt.length);
    if (i < n) {
      const est = c.estimadoDesde && mes >= c.estimadoDesde;
      return { cba: c.cba[i], cbt: c.cbt[i], tipo: est ? 'estimado' : 'oficial', region: r };
    }
    const ultimo = sumarMeses(c.desde, n - 1);
    const regIpc = region === 'nacional' ? 'gba' : r;
    const fa = this.factor(regIpc, 'alimentos', ultimo, mes).f;
    const fg = this.factor(regIpc, 'general', ultimo, mes).f;
    return { cba: c.cba[n - 1] * fa, cbt: c.cbt[n - 1] * fg, tipo: 'proyectado', region: r };
  }

  get ultimaCanasta() {
    const c = ((this.datos.canasta || {}).regiones || {}).gba;
    return c ? sumarMeses(c.desde, Math.min(c.cba.length, c.cbt.length) - 1) : null;
  }
}

export const TEXTO_TIPO = {
  oficial: 'dato oficial',
  manual: 'cargado a mano',
  proyectado: 'proyectado',
  estimado: 'estimado',
  sinDatos: 'sin datos',
  promedio: 'promedio del mes',
  ultimo: 'última cotización',
  aproximado: 'aproximado'
};
