import test from 'node:test';
import assert from 'node:assert/strict';
import { Indices } from '../web/lib/indices.js';
import { sumarMeses } from '../web/lib/fechas.js';
import { datos } from './ayuda.mjs';

const ind = new Indices(datos);
const hasta = datos.ipc.hasta;

test('el IPC oficial arranca en 100 en diciembre de 2016', () => {
  assert.equal(ind.valor('nacional', 'general', '2016-12').v, 100);
  assert.equal(ind.valor('gba', 'alimentos', '2016-12').v, 100);
  assert.equal(ind.valor('gba', 'general', hasta).tipo, 'oficial');
  assert.equal(ind.valor('gba', 'general', '2016-11').tipo, 'sinDatos');
});

test('después del último mes publicado se proyecta con el REM', () => {
  const sig = sumarMeses(hasta, 1);
  const v = ind.valor('gba', 'general', sig);
  assert.equal(v.tipo, 'proyectado');
  const remMes = datos.rem.mensual.find((x) => x.mes === sig);
  if (remMes) {
    const esperado = ind.valor('gba', 'general', hasta).v * (1 + remMes.v / 100);
    assert.ok(Math.abs(v.v - esperado) < 1e-6);
  }
  // Más allá de los meses del REM también hay tasa (expectativa a 12 y 24 meses, anual).
  for (let k = 1; k <= 40; k++) assert.ok(ind.tasa(sumarMeses(hasta, k)).tasa > 0);
});

test('la inflación cargada a mano manda sobre la proyección', () => {
  const sig = sumarMeses(hasta, 1);
  const manual = new Indices(datos, { manual: { [sig]: 10 } });
  const v = manual.valor('gba', 'transporte', sig);
  assert.equal(v.tipo, 'manual');
  assert.ok(Math.abs(v.v / manual.valor('gba', 'transporte', hasta).v - 1.1) < 1e-9);
});

test('una tasa propia reemplaza al REM', () => {
  const propia = new Indices(datos, { proyeccion: { modo: 'usuario', tasa: 3 } });
  const f = propia.factor('gba', 'general', hasta, sumarMeses(hasta, 2));
  assert.ok(Math.abs(f.f - 1.03 * 1.03) < 1e-9);
  assert.equal(f.tipo, 'proyectado');
});

test('factor entre dos meses oficiales', () => {
  const f = ind.factor('gba', 'general', '2025-08', '2026-08');
  assert.equal(f.tipo, 'oficial');
  assert.ok(f.f > 1.05 && f.f < 2, `interanual razonable: ${f.f}`);
});

test('dólar: promedio del mes, último valor y carga manual', () => {
  const d = ind.dolar('oficial', '2025-06');
  assert.equal(d.tipo, 'promedio');
  assert.ok(d.v > 500 && d.v < 3000);
  assert.equal(ind.dolar('blue', '2030-01').tipo, 'ultimo');
  assert.deepEqual(ind.dolar('oficial', '2026-05', { '2026-05': 1400 }), { v: 1400, tipo: 'manual' });
  assert.equal(ind.dolar('manual', '2026-07', { '2026-05': 1400 }).v, 1400);
});

test('canasta básica: oficial en GBA, estimada en otras regiones, proyectada después', () => {
  const c = ind.canasta('gba', '2026-08');
  assert.equal(c.tipo, 'oficial');
  assert.ok(c.cbt > c.cba && c.cba > 0);
  assert.equal(ind.canasta('pampeana', '2026-06').tipo, 'estimado');
  assert.equal(ind.canasta('gba', sumarMeses(ind.ultimaCanasta, 2)).tipo, 'proyectado');
  assert.equal(ind.canasta('nacional', '2026-08').region, 'gba');
});
