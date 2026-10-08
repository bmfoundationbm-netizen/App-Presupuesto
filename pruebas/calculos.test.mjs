import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hogarVacio, agregarLinea, nuevoPlan, fijarPlan, fijarPlanFijo, fijarReal, nuevaMeta, nuevaDeuda,
  nuevaCompraEnCuotas, asegurarAguinaldo, categoriaDeIndice, normalizarHogar
} from '../web/lib/modelo.js';
import { crearContexto, calcularAnio, valorReal, valorPlan, totalesPeriodo, coberturaFondo } from '../web/lib/calculos.js';
import { mesesDelAnio } from '../web/lib/fechas.js';
import { datos, MES_HOY } from './ayuda.mjs';

const $ = (p) => Math.round(p * 100);

function hogarBase() {
  const h = hogarVacio({ region: 'gba' });
  const plan = nuevoPlan(h, 2026);
  const sueldo = agregarLinea(h, { categoriaId: 'cat_ingresos', nombre: 'Sueldo', naturaleza: 'fijo', aguinaldo: true });
  const alquiler = agregarLinea(h, { categoriaId: categoriaDeIndice(h, 'vivienda').id, nombre: 'Alquiler', naturaleza: 'fijo' });
  const super_ = agregarLinea(h, { categoriaId: categoriaDeIndice(h, 'alimentos').id, nombre: 'Supermercado' });
  asegurarAguinaldo(h);
  for (const m of mesesDelAnio(2026)) {
    fijarPlan(plan, sueldo.id, m, $(1000000));
    fijarPlan(plan, alquiler.id, m, $(400000));
    fijarPlan(plan, super_.id, m, $(300000));
  }
  return { h, plan, sueldo, alquiler, super_ };
}

test('un fijo de un mes ya empezado se da por pagado igual a lo planeado', () => {
  const { h, alquiler, super_ } = hogarBase();
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  assert.deepEqual([valorReal(ctx, alquiler, '2026-09').origen, valorReal(ctx, alquiler, '2026-09').v], ['supuesto', $(400000)]);
  assert.equal(valorReal(ctx, alquiler, MES_HOY).origen, 'supuesto');
  assert.equal(valorReal(ctx, alquiler, '2026-11').v, null, 'un mes futuro no se supone');
  assert.equal(valorReal(ctx, super_, '2026-09').v, null, 'un variable no se supone');
});

test('total a mano > movimientos y cuotas > supuesto', () => {
  const { h, alquiler, super_ } = hogarBase();
  h.movimientos.push({ id: 'a', fecha: '2026-09-03', lineaId: super_.id, monto: $(120000) }, { id: 'b', fecha: '2026-09-20', lineaId: super_.id, monto: $(90000) });
  nuevaCompraEnCuotas(h, { lineaId: super_.id, descripcion: 'Freezer', montoCuota: $(50000), cantidad: 3, primerMes: '2026-09' });
  fijarReal(h, alquiler.id, '2026-08', $(410000));
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  const s9 = valorReal(ctx, super_, '2026-09');
  assert.equal(s9.v, $(260000));
  assert.equal(s9.movimientos, 2);
  assert.equal(s9.cuotas, 1);
  assert.equal(valorReal(ctx, super_, '2026-11').v, $(50000), 'las cuotas futuras quedan comprometidas');
  assert.equal(valorReal(ctx, super_, '2026-12').v, null);
  assert.equal(valorReal(ctx, alquiler, '2026-08').origen, 'manual');
});

test('aguinaldo: la mitad del mejor sueldo del semestre, en junio y diciembre', () => {
  const { h, plan, sueldo } = hogarBase();
  fijarPlan(plan, sueldo.id, '2026-04', $(1300000));
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  const ag = h.lineas.find((l) => l.auto === 'aguinaldo');
  assert.equal(valorPlan(ctx, ag, '2026-06').v, $(650000));
  assert.equal(valorPlan(ctx, ag, '2026-12').v, $(500000));
  assert.equal(valorPlan(ctx, ag, '2026-07').v, null);
  // Real de junio: los sueldos fijos supuestos (1.000.000) y abril planeado en 1.300.000.
  assert.equal(valorReal(ctx, ag, '2026-06').v, $(650000));
});

test('resultado del mes y totales por sección', () => {
  const { h } = hogarBase();
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  const r = calcularAnio(ctx, 2026);
  const i = 2; // marzo
  assert.equal(r.secciones.ingresos.plan[i], $(1000000));
  assert.equal(r.secciones.gastos.plan[i], $(700000));
  assert.equal(r.resultado.plan[i], $(300000));
  // Real de marzo: sueldo y alquiler supuestos, supermercado sin cargar.
  assert.equal(r.resultado.real[i], $(600000));
  assert.equal(r.anual.secciones.gastos.plan, $(700000) * 12);
});

test('el fondo de emergencia cubre los imprevistos hasta su saldo', () => {
  const { h } = hogarBase();
  const fondo = nuevaMeta(h, { nombre: 'Fondo', tipo: 'fondo', saldoInicial: $(200000), saldoInicialMes: '2026-08' });
  fijarReal(h, fondo.lineaId, '2026-08', $(50000));
  const auto = h.lineas.find((l) => l.nombre === 'Auto');
  h.movimientos.push({ id: 'x', fecha: '2026-09-10', lineaId: auto.id, monto: $(300000) });
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  assert.equal(coberturaFondo(ctx, '2026-09'), $(250000));
  const r = calcularAnio(ctx, 2026);
  // Septiembre: 1.000.000 - 400.000 (alquiler supuesto) - (300.000 - 250.000 cubiertos).
  assert.equal(r.resultado.real[8], $(550000));
  h.fondo.cubrirInesperados = false;
  const ctx2 = crearContexto(h, datos, { mesHoy: MES_HOY });
  assert.equal(coberturaFondo(ctx2, '2026-09'), 0);
});

test('las líneas en dólares se suman a los totales con la cotización del mes', () => {
  const h = hogarVacio();
  const plan = nuevoPlan(h, 2026);
  const l = agregarLinea(h, { categoriaId: 'cat_ingresos', nombre: 'Honorarios', moneda: 'USD' });
  fijarPlan(plan, l.id, '2026-05', $(100));
  h.dolarManual['2026-05'] = 1200;
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  assert.equal(calcularAnio(ctx, 2026).secciones.ingresos.plan[4], $(120000));
});

test('cuota de un préstamo: plan automático y supuesta pagada', () => {
  const h = hogarVacio();
  nuevoPlan(h, 2026);
  const d = nuevaDeuda(h, { nombre: 'Préstamo', cuota: $(80000), cuotas: 3, primerMes: '2026-08' });
  const l = h.lineas.find((x) => x.deudaId === d.id);
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  assert.equal(valorPlan(ctx, l, '2026-10').v, $(80000));
  assert.equal(valorPlan(ctx, l, '2026-11').v, null);
  assert.equal(valorReal(ctx, l, '2026-09').origen, 'supuesto');
});

test('fijo: cargar un mes repite el monto en los siguientes que estaban iguales', () => {
  const { plan, alquiler } = hogarBase();
  fijarPlanFijo(plan, alquiler.id, '2026-07', $(450000));
  assert.equal(plan.montos[alquiler.id]['2026-06'], $(400000));
  assert.equal(plan.montos[alquiler.id]['2026-07'], $(450000));
  assert.equal(plan.montos[alquiler.id]['2026-12'], $(450000));
});

test('totales de un período que cruza años', () => {
  const { h, plan, sueldo } = hogarBase();
  const p27 = nuevoPlan(h, 2027);
  fijarPlan(p27, sueldo.id, '2027-01', $(1200000));
  const ctx = crearContexto(h, datos, { mesHoy: MES_HOY });
  const t = totalesPeriodo(ctx, ['2026-12', '2027-01'], 'plan');
  assert.equal(t.porLinea.get(sueldo.id), $(2200000));
  assert.ok(plan);
});

test('normalizarHogar repara un archivo dañado sin romperse', () => {
  const { h, super_ } = hogarBase();
  const crudo = JSON.parse(JSON.stringify(h));
  crudo.lineas.push({ id: 'rota', categoriaId: 'no-existe', nombre: 'Huérfana' });
  crudo.movimientos.push({ id: 'm1', fecha: 'ayer', lineaId: super_.id, monto: 5 });
  crudo.movimientos.push({ id: 'm2', fecha: '2026-05-02', lineaId: 'fantasma', monto: 5 });
  crudo.reales[super_.id] = { '2026-05': '123.4', 'basura': 9 };
  crudo.metas.push({ id: 'mx', nombre: 'Sin línea', lineaId: 'nada' });
  const { hogar, avisos } = normalizarHogar(crudo);
  assert.equal(hogar.lineas.find((l) => l.id === 'rota').categoriaId, 'cat_varios');
  assert.equal(hogar.movimientos.length, 0);
  assert.deepEqual(hogar.reales[super_.id], { '2026-05': 123 });
  assert.equal(hogar.metas.length, 0);
  assert.ok(avisos.length >= 1);
  assert.throws(() => normalizarHogar({ formato: 'otro' }));
});
