import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEjemplo } from '../web/lib/ejemplo.js';
import { normalizarHogar, planActivo } from '../web/lib/modelo.js';
import { crearContexto, calcularAnio, totalesPeriodo } from '../web/lib/calculos.js';
import { aeHogar, aeIntegrante, canastaHogar, referenciaParecidos, costoPorIntegrante, ingresosDelMes } from '../web/lib/familia.js';
import { estadoMeta, estadoDeuda, estadoInversion, valorPlazoFijo, cuotasPendientes, patrimonio } from '../web/lib/ahorro.js';
import { actualizarPlan, crearPlanAnio, totalesProyecto, actualizarProyecto, planConRecortes } from '../web/lib/presupuestos.js';
import { analizar, periodoAnalisis, planDeRecorte, alertas } from '../web/lib/analisis.js';
import { datosSankey } from '../web/lib/sankey.js';
import { evolucionAnual, gastoPorCategoria, planContraReal, contraInflacion } from '../web/lib/series.js';
import { datos, engho, MES_HOY } from './ayuda.mjs';

const ejemplo = () => normalizarHogar(JSON.parse(JSON.stringify(crearEjemplo({ mesHoy: MES_HOY, datos })))).hogar;
const ctxEjemplo = () => crearContexto(ejemplo(), datos, { mesHoy: MES_HOY });

test('el hogar de ejemplo sobrevive a guardarse y leerse', () => {
  const h = crearEjemplo({ mesHoy: MES_HOY, datos });
  const { hogar, avisos } = normalizarHogar(JSON.parse(JSON.stringify(h)));
  assert.deepEqual(avisos, []);
  assert.equal(hogar.lineas.length, h.lineas.length);
  assert.equal(hogar.movimientos.length, h.movimientos.length);
  assert.equal(JSON.stringify(normalizarHogar(JSON.parse(JSON.stringify(hogar))).hogar), JSON.stringify(hogar));
});

test('familia tipo del INDEC: 3,09 adultos equivalentes', () => {
  const tipo = [
    { tipo: 'adulto', edad: 35, sexo: 'v' }, { tipo: 'adulto', edad: 31, sexo: 'm' },
    { tipo: 'menor', edad: 6, sexo: 'v' }, { tipo: 'menor', edad: 8, sexo: 'm' }
  ];
  assert.equal(Math.round(aeHogar({ integrantes: tipo }) * 100) / 100, 3.09);
  assert.ok(aeIntegrante({ tipo: 'adulto' }) > 0.85 && aeIntegrante({ tipo: 'adulto' }) < 0.9);
  assert.ok(aeIntegrante({ tipo: 'menor' }) > 0.6 && aeIntegrante({ tipo: 'menor' }) < 0.75);
});

test('canasta del hogar y hogares parecidos', () => {
  const ctx = ctxEjemplo();
  const c = canastaHogar(ctx, '2026-08');
  assert.ok(c.pobreza > c.indigencia && c.indigencia > 0);
  const ing = ingresosDelMes(ctx, '2026-09');
  assert.ok(ing > 0);
  const ref = referenciaParecidos(ctx, engho, '2026-09', ing);
  assert.ok(ref, 'hay celda de referencia');
  const suma = ref.partes.reduce((s, p) => s + p.proporcion, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9);
  assert.match(ref.descripcion, /2 adultos y 2 menores/);
});

test('costo por integrante reparte todo el gasto', () => {
  const ctx = ctxEjemplo();
  const meses = ['2026-07', '2026-08', '2026-09'];
  const filas = costoPorIntegrante(ctx, meses);
  const t = totalesPeriodo(ctx, meses, 'real');
  const total = filas.reduce((s, f) => s + f.total, 0);
  assert.ok(Math.abs(total - (t.porSeccion.gastos + t.porSeccion.inesperados)) <= filas.length);
});

test('metas, deudas, cuotas e inversiones', () => {
  const ctx = ctxEjemplo();
  const h = ctx.hogar;
  const fondo = estadoMeta(ctx, h.metas.find((m) => m.tipo === 'fondo'));
  assert.ok(fondo.objetivoFinal > 0 && fondo.saldo > 0);
  const vac = estadoMeta(ctx, h.metas.find((m) => m.nombre.startsWith('Vacaciones')));
  assert.ok(vac.objetivoFinal > vac.meta.objetivo, 'la meta sube con la inflación');
  assert.ok(vac.aporteSugerido > 0);
  const d = estadoDeuda(ctx, h.deudas[0]);
  assert.equal(d.pagadas + d.restantes, 12);
  assert.ok(cuotasPendientes(ctx).length >= 1);
  assert.equal(valorPlazoFijo({ capital: 100000000, tna: 36.5, inicio: '2026-01-01', dias: 30, renovar: false }, '2026-01-31'), 103000000);
  const pf = estadoInversion(ctx, h.inversiones.find((i) => i.tipo === 'plazo_fijo'), '2026-10-07');
  assert.ok(pf.valor > pf.neto);
  const usd = estadoInversion(ctx, h.inversiones.find((i) => i.moneda === 'USD'), '2026-10-07');
  assert.ok(usd.valorPesos > usd.valor);
  assert.ok(Number.isFinite(patrimonio(ctx).neto));
});

test('actualizar un presupuesto por IPC crea una copia con montos mayores', () => {
  const ctx = ctxEjemplo();
  const plan = planActivo(ctx.hogar, 2026);
  const { plan: nuevo, resumen } = actualizarPlan(ctx, plan, { modo: 'aAnio', anioDestino: 2027 });
  assert.equal(nuevo.anio, 2027);
  assert.notEqual(nuevo.id, plan.id);
  const alquiler = ctx.hogar.lineas.find((l) => l.nombre === 'Alquiler');
  assert.ok(nuevo.montos[alquiler.id]['2027-03'] > plan.montos[alquiler.id]['2026-03']);
  assert.ok(resumen.tipos.includes('proyectado'));
  const prestamo = ctx.hogar.lineas.find((l) => l.deudaId);
  assert.equal(nuevo.montos[prestamo.id], undefined, 'las cuotas de un préstamo no se ajustan');
  const aHoy = actualizarPlan(ctx, plan, { modo: 'pesosDe', mesReferencia: '2026-08' });
  assert.ok(aHoy.plan.montos[alquiler.id]['2026-01'] > plan.montos[alquiler.id]['2026-01']);
  assert.equal(aHoy.plan.montos[alquiler.id]['2026-08'], plan.montos[alquiler.id]['2026-08']);
  const fijos = crearPlanAnio(ctx, 2027, { base: 'fijos', desdePlan: plan });
  assert.equal(fijos.montos[alquiler.id]['2027-06'], plan.montos[alquiler.id]['2026-12']);
});

test('proyecto: totales y actualización a pesos de otro mes', () => {
  const ctx = ctxEjemplo();
  const p = ctx.hogar.proyectos[0];
  const t = totalesProyecto(ctx, p);
  assert.ok(t.presupuestadoHoy > t.presupuestado);
  const c = actualizarProyecto(ctx, p, '2026-08');
  assert.ok(c.items[0].presupuestado > p.items[0].presupuestado);
});

test('análisis: hallazgos y plan de recorte que llega al objetivo', () => {
  const ctx = ctxEjemplo();
  const per = periodoAnalisis(ctx);
  assert.equal(per.fuente, 'real');
  assert.equal(per.meses.length, 3);
  const a = analizar(ctx, engho, per);
  assert.ok(a.ingresos > 0 && a.gastoTotal > 0);
  assert.ok(a.regla && a.parecidos && a.parecidos.filas.length === 12);
  assert.ok(a.hallazgos.some((x) => x.tipo === 'prescindible'));
  assert.ok(a.hallazgos.some((x) => x.tipo === 'tope'), 'el ejemplo pasa su tope de comer afuera');
  const objetivo = 20000000;
  const r = planDeRecorte(a, objetivo);
  assert.ok(r.alcanza, `recorta ${r.total} de ${objetivo}`);
  assert.ok(r.total >= objetivo && r.total < objetivo + 100);
  assert.equal(r.filas.filter((f) => f.clase === 'esencial' && f.recorte > 0).length, 0);
  const nuevo = planConRecortes(ctx, planActivo(ctx.hogar, 2026), r.filas, { desdeMes: '2026-11', metaLineaId: ctx.hogar.metas[1].lineaId });
  assert.ok(nuevo.montos[ctx.hogar.metas[1].lineaId]['2026-11'] > planActivo(ctx.hogar, 2026).montos[ctx.hogar.metas[1].lineaId]['2026-11']);
  const avisos = alertas(ctx);
  assert.ok(avisos.some((x) => x.id.startsWith('cerrar-')), 'avisa el mes sin cerrar');
});

test('el Sankey cierra: lo que entra es igual a lo que sale', () => {
  const ctx = ctxEjemplo();
  for (const fuente of ['plan', 'real']) {
    const s = datosSankey(ctx, { meses: ['2026-07', '2026-08', '2026-09'], fuente });
    const entra = s.enlaces.filter((e) => e.target === 'total').reduce((a, e) => a + e.value, 0);
    const sale = s.enlaces.filter((e) => e.source === 'total').reduce((a, e) => a + e.value, 0);
    assert.equal(entra, sale, fuente);
    for (const n of s.nodos.filter((x) => x.nivel === 2 && !x.plegada && x.expandible)) {
      const hijos = s.enlaces.filter((e) => e.source === n.id).reduce((a, e) => a + e.value, 0);
      assert.equal(hijos, n.valor, `${n.nombre} reparte todo`);
    }
  }
  const plegado = datosSankey(ctx, { meses: ['2026-09'], fuente: 'real', plegadas: new Set(['cat:cat_vivienda']) });
  assert.ok(!plegado.enlaces.some((e) => e.source === 'cat:cat_vivienda'));
});

test('series para los gráficos', () => {
  const ctx = ctxEjemplo();
  const ev = evolucionAnual(ctx, 2026, 'real');
  assert.equal(ev.length, 12);
  assert.ok(ev[0].ingresos > 0);
  assert.ok(gastoPorCategoria(ctx, ['2026-09']).length > 5);
  assert.ok(planContraReal(ctx, ['2026-09']).length > 5);
  const inf = contraInflacion(ctx, '2026-01', '2026-09');
  assert.ok(inf.puntos.length >= 6);
  assert.ok(inf.ipcAcumulado > 0);
  assert.ok(calcularAnio(ctx, 2026).resultado.real.length === 12);
});
