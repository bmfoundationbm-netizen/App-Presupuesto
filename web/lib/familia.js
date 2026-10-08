// Mi Presupuesto · composición familiar, canasta básica y hogares parecidos

import { adultoEquivalente, AE_PROMEDIO, COMPOSICIONES, nombreRegion } from './catalogo.js';
import { aPesos, valorReal, valorPlan, totalesPeriodo } from './calculos.js';
import { indiceDeLinea } from './modelo.js';

// Unidades de adulto equivalente de un integrante. Si falta la edad o el sexo se usa el
// promedio del grupo (adultos de 18 a 60 años, menores de 0 a 17).
export function aeIntegrante(i) {
  const grupo = i.tipo === 'menor' ? 'menor' : 'adulto';
  if (Number.isFinite(i.edad)) {
    if (i.sexo === 'v' || i.sexo === 'm') return adultoEquivalente(i.sexo, i.edad);
    return (adultoEquivalente('v', i.edad) + adultoEquivalente('m', i.edad)) / 2;
  }
  return AE_PROMEDIO[grupo][i.sexo === 'v' || i.sexo === 'm' ? i.sexo : 'x'];
}

export function aeHogar(h) {
  if (!h.integrantes.length) return AE_PROMEDIO.adulto.x;
  return h.integrantes.reduce((s, i) => s + aeIntegrante(i), 0);
}

export function composicion(h) {
  const adultos = h.integrantes.filter((i) => i.tipo !== 'menor').length;
  const menores = h.integrantes.length - adultos;
  const preset = COMPOSICIONES.find((c) => c.adultos === adultos && c.menores === menores);
  const exacta = h.integrantes.length > 0 && h.integrantes.every((i) => Number.isFinite(i.edad) && (i.sexo === 'v' || i.sexo === 'm'));
  return {
    adultos, menores, preset, exacta,
    nombre: preset ? preset.nombre : `${adultos} ${adultos === 1 ? 'adulto' : 'adultos'} y ${menores} ${menores === 1 ? 'menor' : 'menores'}`
  };
}

// Líneas de indigencia y pobreza del hogar en un mes (en centavos).
export function canastaHogar(ctx, mes) {
  const c = ctx.indices.canasta(ctx.hogar.region, mes);
  const ae = aeHogar(ctx.hogar);
  return {
    ...c, ae,
    indigencia: c.cba ? Math.round(c.cba * ae * 100) : null,
    pobreza: c.cbt ? Math.round(c.cbt * ae * 100) : null
  };
}

// Ingresos del hogar en un mes, sin contar el sobrante que viene del mes anterior.
export function ingresosDelMes(ctx, mes, fuente = 'real') {
  const t = totalesPeriodo(ctx, [mes], fuente);
  let total = t.porSeccion.ingresos;
  for (const l of ctx.hogar.lineas) if (l.auto === 'saldo') total -= t.porLinea.get(l.id) || 0;
  return total;
}

export function situacion(ctx, mes, ingresos) {
  const c = canastaHogar(ctx, mes);
  if (!c.pobreza) return null;
  const veces = ingresos / c.pobreza;
  const nivel = ingresos < c.indigencia ? 'indigencia' : ingresos < c.pobreza ? 'pobreza' : 'arriba';
  return { ...c, ingresos, veces, nivel };
}

// Quintil de ingreso según la ENGHo, medido en veces la canasta básica total del hogar.
export function quintil(ctx, engho, ingresos, mes) {
  const c = canastaHogar(ctx, mes);
  if (!engho || !c.pobreza || !(ingresos > 0)) return null;
  const veces = ingresos / c.pobreza;
  return { q: 1 + engho.umbralesQuintil.filter((u) => veces > u).length, veces };
}

const NOMBRE_QUINTIL = ['', 'el 20 % de menores ingresos', 'el segundo 20 %', 'el 20 % del medio', 'el cuarto 20 %', 'el 20 % de mayores ingresos'];

// Cómo reparten el gasto los hogares parecidos según la ENGHo 2017-2018, con las
// proporciones actualizadas por los precios relativos de cada categoría desde 2018 y el
// nivel de gasto llevado a pesos de hoy con la canasta básica del hogar.
export function referenciaParecidos(ctx, engho, mes, ingresos) {
  if (!engho || !engho.celdas) return null;
  const h = ctx.hogar;
  const comp = composicion(h);
  const a = Math.min(3, Math.max(1, comp.adultos || 1));
  const m = Math.min(3, comp.menores);
  const qi = quintil(ctx, engho, ingresos, mes);
  const q = qi ? qi.q : 0;
  const region = h.region || 'nacional';
  const t = tenencia(ctx);
  const candidatas = [];
  for (const tt of [t, 'x']) {
    candidatas.push(
      [`${a}-${m}-${region}-${q}-${tt}`, 'misma composición, región e ingresos'],
      [`${a}-${m}-nacional-${q}-${tt}`, 'misma composición e ingresos, todo el país'],
      [`${a}-${m}-${region}-0-${tt}`, 'misma composición y región, todos los ingresos'],
      [`${a}-${m}-nacional-0-${tt}`, 'misma composición, todo el país y todos los ingresos']);
  }
  const elegida = candidatas.find(([k]) => engho.celdas[k]);
  if (!elegida) return null;
  const [clave, alcance] = elegida;
  const celda = engho.celdas[clave];
  const regIpc = region === 'nacional' ? 'nacional' : region;
  const pesos = engho.categorias.map((cat, i) => celda.p[i] * ctx.indices.factor(regIpc, cat, engho.mesReferencia, mes).f);
  const suma = pesos.reduce((s, x) => s + x, 0) || 1;
  const can = canastaHogar(ctx, mes);
  const total = can.pobreza ? Math.round(celda.g * can.pobreza) : null;
  const partes = engho.categorias.map((cat, i) => ({
    indice: cat,
    proporcion: pesos[i] / suma,
    proporcion2018: celda.p[i],
    monto: total ? Math.round(total * (pesos[i] / suma)) : null
  }));
  const compTxt = `${a === 3 ? '3 o más adultos' : `${a} ${a === 1 ? 'adulto' : 'adultos'}`}` +
    (m ? ` y ${m === 3 ? '3 o más menores' : `${m} ${m === 1 ? 'menor' : 'menores'}`}` : ', sin menores');
  const regTxt = clave.includes('-nacional-') ? 'todo el país' : nombreRegion(region);
  const qTxt = clave.split('-')[3] === '0' ? 'todos los niveles de ingreso' : NOMBRE_QUINTIL[q];
  const tTxt = { i: ', que alquilan', p: ', que no alquilan', x: '' }[clave.split('-')[4]];
  return {
    clave, alcance, n: celda.n, quintil: q, veces: qi ? qi.veces : null, tenencia: clave.split('-')[4],
    descripcion: `Hogares de ${compTxt}${tTxt}, ${regTxt}, ${qTxt}`,
    partes, total, gastoEnCanastas: celda.g
  };
}

// ¿El hogar alquila? Lo que se cargó en "vivienda"; si no, se deduce de una línea de
// alquiler con montos. 'i' = alquila, 'p' = no alquila.
export function tenencia(ctx) {
  const h = ctx.hogar;
  if (h.vivienda === 'alquilada') return 'i';
  if (h.vivienda === 'propia' || h.vivienda === 'otra') return 'p';
  const conPlata = (l) => h.planes.some((p) => Object.values(p.montos[l.id] || {}).some((v) => v > 0)) ||
    Object.values(h.reales[l.id] || {}).some((v) => v > 0) || h.movimientos.some((m) => m.lineaId === l.id);
  return h.lineas.some((l) => /alquiler/i.test(l.nombre) && ctx.seccionDe.get(l.id) === 'gastos' && conPlata(l)) ? 'i' : 'p';
}

// Gasto del hogar por categoría del IPC (gastos e inesperados), en pesos, para un período.
export function gastoPorIndice(ctx, meses, fuente = 'real') {
  const t = totalesPeriodo(ctx, meses, fuente);
  const out = new Map();
  let total = 0;
  for (const l of ctx.hogar.lineas) {
    const sec = ctx.seccionDe.get(l.id);
    if (sec !== 'gastos' && sec !== 'inesperados') continue;
    const v = t.porLinea.get(l.id) || 0;
    if (!v) continue;
    let ind = indiceDeLinea(ctx.hogar, l);
    if (!ind || ind === 'general') ind = 'varios';
    out.set(ind, (out.get(ind) || 0) + v);
    total += v;
  }
  return { porIndice: out, total, cobertura: t.cobertura };
}

// Cuánto cuesta cada integrante: lo asignado a esa persona (líneas o movimientos) más su
// parte de lo compartido, repartido según el adulto equivalente de cada uno.
export function costoPorIntegrante(ctx, meses, fuente = 'real') {
  const h = ctx.hogar;
  if (!h.integrantes.length) return [];
  const ae = new Map(h.integrantes.map((i) => [i.id, aeIntegrante(i)]));
  const aeTotal = [...ae.values()].reduce((s, x) => s + x, 0);
  const directo = new Map(h.integrantes.map((i) => [i.id, 0]));
  let compartido = 0;
  // Movimientos asignados a una persona, por línea y mes.
  const conPersona = new Map();
  for (const m of h.movimientos) {
    if (!m.personaId || !directo.has(m.personaId)) continue;
    const k = `${m.lineaId}|${m.fecha.slice(0, 7)}`;
    if (!conPersona.has(k)) conPersona.set(k, []);
    conPersona.get(k).push(m);
  }
  for (const l of h.lineas) {
    const sec = ctx.seccionDe.get(l.id);
    if (sec !== 'gastos' && sec !== 'inesperados') continue;
    for (const mes of meses) {
      const r = fuente === 'real' ? valorReal(ctx, l, mes) : valorPlan(ctx, l, mes);
      const total = aPesos(ctx, r.v || 0, l.moneda, mes);
      if (!total) continue;
      let resto = total;
      // Si el real sale de movimientos, los que tienen persona se le asignan directo.
      if (fuente === 'real' && r.origen === 'movimientos' && !l.personaId) {
        for (const m of conPersona.get(`${l.id}|${mes}`) || []) {
          const p = aPesos(ctx, m.monto, l.moneda, mes);
          directo.set(m.personaId, directo.get(m.personaId) + p);
          resto -= p;
        }
      }
      if (l.personaId && directo.has(l.personaId)) directo.set(l.personaId, directo.get(l.personaId) + resto);
      else compartido += resto;
    }
  }
  const totalGeneral = [...directo.values()].reduce((s, x) => s + x, 0) + compartido;
  return h.integrantes.map((i) => {
    const parte = Math.round(compartido * (ae.get(i.id) / aeTotal));
    const total = directo.get(i.id) + parte;
    return { integrante: i, ae: ae.get(i.id), directo: directo.get(i.id), compartido: parte, total, proporcion: totalGeneral ? total / totalGeneral : 0 };
  });
}
