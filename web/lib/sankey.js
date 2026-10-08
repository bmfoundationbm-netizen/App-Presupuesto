// Mi Presupuesto · datos del gráfico de Sankey
//
// Cuatro niveles: fuentes de ingreso → total disponible → categorías → subcategorías.
// Siempre cierra: lo que entra es igual a lo que sale. Si sobra plata aparece "Sobrante";
// si falta, "Faltante" entra del lado de los ingresos. Los retiros del fondo de
// emergencia, de metas de ahorro y los rescates de inversiones también son fuentes.

import { totalesPeriodo } from './calculos.js';
import { categoria } from './modelo.js';

export function datosSankey(ctx, { meses, fuente = 'real', plegadas = new Set(), umbralOtros = 0.012 } = {}) {
  const h = ctx.hogar;
  const t = totalesPeriodo(ctx, meses, fuente);
  const nodos = new Map();
  const enlaces = [];
  const nodo = (id, nombre, nivel, tipo, extra = {}) => {
    if (!nodos.has(id)) nodos.set(id, { id, nombre, nivel, tipo, valor: 0, ...extra });
    return nodos.get(id);
  };
  const enlace = (origen, destino, valor) => {
    if (!(valor > 0)) return;
    enlaces.push({ source: origen, target: destino, value: valor });
    nodos.get(origen).salida = (nodos.get(origen).salida || 0) + valor;
    nodos.get(destino).valor += valor;
  };

  nodo('total', 'Total disponible', 1, 'total');
  let entradas = 0, salidas = 0;
  const fuenteNodo = (id, nombre, valor, tipo = 'ingreso') => {
    if (!(valor > 0)) return;
    const n = nodo(id, nombre, 0, tipo);
    n.valor += valor;
    enlace(id, 'total', valor);
    entradas += valor;
  };

  // Usos agrupados por categoría (nivel 2) y por línea (nivel 3).
  const porCategoria = new Map();
  const usar = (catId, catNombre, tipo, linea, valor) => {
    if (!(valor > 0)) return;
    if (!porCategoria.has(catId)) porCategoria.set(catId, { id: catId, nombre: catNombre, tipo, lineas: [] });
    porCategoria.get(catId).lineas.push({ linea, valor });
    salidas += valor;
  };

  let retiros = 0, rescates = 0;
  for (const l of h.lineas) {
    const v = t.porLinea.get(l.id) || 0;
    if (!v) continue;
    const sec = ctx.seccionDe.get(l.id);
    if (sec === 'ingresos') {
      if (v > 0) fuenteNodo(`src:${l.id}`, l.nombre, v, l.auto === 'saldo' ? 'saldo' : 'ingreso');
      else usar('cat:faltante-anterior', 'Faltante del mes anterior', 'faltante', l, -v);
    } else if (sec === 'ahorro') {
      if (v > 0) usar('cat:ahorro', 'Ahorro', 'ahorro', l, v); else retiros += -v;
    } else if (sec === 'inversiones') {
      if (v > 0) usar('cat:inversiones', 'Inversiones', 'inversion', l, v); else rescates += -v;
    } else if (sec === 'deudas') {
      if (v > 0) usar('cat:deudas', 'Deudas y préstamos', 'deuda', l, v);
    } else if (sec === 'inesperados') {
      if (v > 0) usar('cat:inesperados', 'Gastos inesperados', 'inesperado', l, v);
    } else if (v > 0) {
      const c = categoria(h, l.categoriaId);
      usar(`cat:${c.id}`, c.nombre, 'gasto', l, v);
    }
  }
  fuenteNodo('src:fondo', 'Fondo de emergencia', t.cobertura, 'fondo');
  fuenteNodo('src:retiros', 'Retiros de ahorro', retiros, 'retiro');
  fuenteNodo('src:rescates', 'Rescates de inversiones', rescates, 'retiro');

  const resultado = entradas - salidas;
  if (resultado < 0) fuenteNodo('src:faltante', 'Faltante', -resultado, 'faltante');

  // Categorías ordenadas: gastos de mayor a menor, después inesperados, deudas,
  // ahorro, inversiones y el sobrante al final.
  const ordenTipo = { gasto: 0, faltante: 1, inesperado: 2, deuda: 3, ahorro: 4, inversion: 5 };
  const cats = [...porCategoria.values()].map((c) => ({ ...c, total: c.lineas.reduce((s, x) => s + x.valor, 0) }))
    .sort((a, b) => (ordenTipo[a.tipo] - ordenTipo[b.tipo]) || (b.total - a.total));
  const total = Math.max(entradas, salidas);
  for (const c of cats) {
    const plegada = plegadas.has(c.id);
    const n = nodo(c.id, c.nombre, 2, c.tipo, { expandible: c.lineas.length > 1 || c.lineas[0].linea.nombre !== c.nombre, plegada, cantidad: c.lineas.length });
    enlace('total', c.id, c.total);
    if (plegada) continue;
    // Una sola línea con el mismo nombre que la categoría no agrega nada.
    if (c.lineas.length === 1 && c.lineas[0].linea.nombre === c.nombre) { n.expandible = false; continue; }
    const chicas = [];
    for (const x of c.lineas.sort((a, b) => b.valor - a.valor)) {
      if (x.valor < umbralOtros * total && c.lineas.length > 2) { chicas.push(x); continue; }
      nodo(`lin:${x.linea.id}`, x.linea.nombre, 3, c.tipo, { lineaId: x.linea.id, categoriaId: c.id });
      enlace(c.id, `lin:${x.linea.id}`, x.valor);
    }
    if (chicas.length === 1) {
      const x = chicas[0];
      nodo(`lin:${x.linea.id}`, x.linea.nombre, 3, c.tipo, { lineaId: x.linea.id, categoriaId: c.id });
      enlace(c.id, `lin:${x.linea.id}`, x.valor);
    } else if (chicas.length > 1) {
      const id = `otros:${c.id}`;
      nodo(id, `Otros (${chicas.length})`, 3, c.tipo, { categoriaId: c.id, detalle: chicas.map((x) => x.linea.nombre) });
      enlace(c.id, id, chicas.reduce((s, x) => s + x.valor, 0));
    }
  }
  if (resultado > 0) {
    nodo('cat:sobrante', 'Sobrante', 2, 'sobrante');
    enlace('total', 'cat:sobrante', resultado);
  }

  return { nodos: [...nodos.values()], enlaces, entradas, total, resultado, meses, fuente };
}
