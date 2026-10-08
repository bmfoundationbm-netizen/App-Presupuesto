import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leerCsv, detectarSeparador, detectarEncabezado, proponerColumnas, interpretarFilas, sugerirLinea,
  claveDeRegla, esDuplicado, detectarMeses, detectarEncabezadoMeses, interpretarPlanilla, indiceProbable
} from '../web/lib/importar.js';

const CSV_BANCO = `Banco Ejemplo - Movimientos de cuenta
Cuenta: CA $ 123-456789/0

Fecha;Descripción;Referencia;Importe;Saldo
01/09/2026;COMPRA DEBITO COTO SUC 123;0001;-45.320,50;1.200.000,00
03/09/2026;"PAGO EDENOR; FACTURA 9";0002;-38.100,00;1.161.900,00
05/09/2026;ACREDITACION DE HABERES;0003;1.950.000,00;3.111.900,00
06/09/2026;NETFLIX.COM;0004;-12.999,00;3.098.901,00
`;

test('CSV de banco con punto y coma, título arriba y comillas', () => {
  assert.equal(detectarSeparador(CSV_BANCO), ';');
  const filas = leerCsv(CSV_BANCO);
  const enc = detectarEncabezado(filas);
  assert.equal(filas[enc][0], 'Fecha');
  const col = proponerColumnas(filas, enc);
  assert.deepEqual([col.fecha, col.descripcion, col.monto], [0, 1, 3]);
  const movs = interpretarFilas(filas, { filaEncabezado: enc, columnas: col });
  assert.equal(movs.length, 4);
  assert.deepEqual(movs[0], { fila: enc + 1, fecha: '2026-09-01', descripcion: 'COMPRA DEBITO COTO SUC 123', monto: 4532050 });
  assert.equal(movs[1].descripcion, 'PAGO EDENOR; FACTURA 9');
  assert.equal(movs[2].monto, -195000000, 'los ingresos quedan negativos (entrada de plata)');
});

test('Excel con columnas de débito y crédito', () => {
  const filas = [
    ['Últimos movimientos', null, null, null, null],
    ['Fecha', 'Concepto', 'Débito', 'Crédito', 'Saldo'],
    ['2026-09-02', 'PEDIDOSYA*BURGER', 15200, null, 500000],
    ['2026-09-04', 'TRANSFERENCIA RECIBIDA', null, 80000, 580000],
    ['2026-09-05', 'YPF SERVICENTRO', 42000.5, null, 538000]
  ];
  const enc = detectarEncabezado(filas);
  assert.equal(enc, 1);
  const col = proponerColumnas(filas, enc);
  assert.deepEqual([col.fecha, col.descripcion, col.debito, col.credito, col.monto], [0, 1, 2, 3, -1]);
  const movs = interpretarFilas(filas, { filaEncabezado: enc, columnas: col });
  assert.deepEqual(movs.map((m) => m.monto), [1520000, -8000000, 4200050]);
});

test('sugerir concepto: reglas aprendidas, palabras clave y nombre', () => {
  const lineas = [{ id: 'a', nombre: 'Supermercado' }, { id: 'b', nombre: 'Streaming y suscripciones' }, { id: 'c', nombre: 'Combustible' }, { id: 'd', nombre: 'Kiosco' }];
  assert.equal(sugerirLinea('COMPRA DEBITO COTO SUC 123', { lineas }).lineaId, 'a');
  assert.equal(sugerirLinea('NETFLIX.COM', { lineas }).lineaId, 'b');
  assert.equal(sugerirLinea('YPF SERVICENTRO', { lineas }).lineaId, 'c');
  assert.equal(sugerirLinea('KIOSCO EL PIBE', { lineas }).lineaId, 'd');
  assert.equal(sugerirLinea('COTO', { lineas, reglas: [{ texto: 'coto', lineaId: 'd' }] }).lineaId, 'd');
  assert.equal(sugerirLinea('ALGO RARO', { lineas }), null);
  assert.equal(claveDeRegla('COMPRA DEBITO COTO SUC 123'), 'coto');
  assert.ok(esDuplicado({ fecha: '2026-09-01', monto: -500, descripcion: 'X' }, [{ fecha: '2026-09-01', monto: 500, descripcion: 'x' }]));
});

test('planilla con meses en columnas', () => {
  const filas = [
    ['Presupuesto 2026'],
    ['Concepto', 'Enero', 'Febrero', 'Mar', 'abr.', 'Total'],
    ['Alquiler', 450000, 450000, 450000, 480000, 1830000],
    ['Luz', '35.000', '40.000', null, '38.500', ''],
    ['Total gastos', 485000, 490000, 450000, 518500, 1943500]
  ];
  assert.deepEqual(detectarMeses(filas[1]), [null, 1, 2, 3, 4, null]);
  const enc = detectarEncabezadoMeses(filas);
  assert.equal(enc, 1);
  const r = interpretarPlanilla(filas, { filaEncabezado: enc, colConcepto: 0, meses: detectarMeses(filas[enc]) });
  assert.equal(r.length, 2, 'saltea la fila de total');
  assert.deepEqual(r[1].valores, { 1: 3500000, 2: 4000000, 4: 3850000 });
  assert.equal(indiceProbable('Alquiler'), 'vivienda');
  assert.equal(indiceProbable('Netflix'), 'recreacion');
});
