import test from 'node:test';
import assert from 'node:assert/strict';
import { leerMonto, formatear, pesos, compacto } from '../web/lib/dinero.js';
import { sumarMeses, mesesEntre, rangoMeses, leerFecha, diasEntre, ultimoDia } from '../web/lib/fechas.js';

test('leerMonto entiende cómo se escribe la plata en Argentina', () => {
  const casos = [
    ['1.234,56', 123456], ['1234,56', 123456], ['1234.56', 123456], ['$ 1.234', 123400],
    ['1.234.567', 123456700], ['-1.234,50', -123450], ['(1.234,50)', -123450], ['1,234.56', 123456],
    ['450000', 45000000], ['0,5', 50], ['US$ 150', 15000], ['1.234,5-', -123450], ['12.5', 1250],
    ['', null], ['abc', null], [1234.5, 123450], [null, null], ['1,234,567', 123456700]
  ];
  for (const [entrada, esperado] of casos) assert.equal(leerMonto(entrada), esperado, `leerMonto(${JSON.stringify(entrada)})`);
});

test('formatear muestra miles con punto y decimales con coma', () => {
  assert.equal(formatear(123456789), '1.234.567,89');
  assert.equal(formatear(100000), '1.000');
  assert.equal(formatear(100000, { decimales: true }), '1.000,00');
  assert.equal(pesos(-250050), '−$ 2.500,50');
  assert.equal(formatear(5, { decimales: true }), '0,05');
  assert.equal(compacto(123456789), '$ 1,23 M');
  assert.equal(compacto(35000000), '$ 350 mil');
});

test('meses: sumar, contar y recorrer cruzando años', () => {
  assert.equal(sumarMeses('2026-11', 3), '2027-02');
  assert.equal(sumarMeses('2026-01', -1), '2025-12');
  assert.equal(mesesEntre('2025-11', '2026-02'), 3);
  assert.deepEqual(rangoMeses('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
  assert.equal(ultimoDia('2028-02'), '2028-02-29');
  assert.equal(diasEntre('2026-07-15', '2026-08-14'), 30);
});

test('leerFecha acepta los formatos de los bancos', () => {
  assert.equal(leerFecha('31/12/2026'), '2026-12-31');
  assert.equal(leerFecha('5-3-26'), '2026-03-05');
  assert.equal(leerFecha('2026-03-05'), '2026-03-05');
  assert.equal(leerFecha('31.01.2026'), '2026-01-31');
  assert.equal(leerFecha(46295), '2026-09-30');
  assert.equal(leerFecha('31/02/2026'), null);
  assert.equal(leerFecha('hola'), null);
});
