# Mi Presupuesto

Programa de escritorio para Windows para armar y seguir el presupuesto de un hogar, con el
formato de una planilla: ingresos, gastos, gastos inesperados, ahorro, deudas e
inversiones, mes a mes.

> En construcción. Esta primera etapa tiene los datos públicos y el motor de cálculo con
> sus pruebas; la interfaz llega en las próximas.

## Qué va a hacer

- Planilla con los 12 meses del año: lo planeado, lo real y la diferencia.
- Categorías del IPC del INDEC, cada una actualizable con su propia inflación.
- Varios presupuestos por hogar y proyectos puntuales, actualizables al IPC.
- Composición familiar con canasta básica (líneas de pobreza e indigencia) y comparación
  con hogares parecidos según la Encuesta de Gastos de los Hogares del INDEC.
- Análisis de dónde recortar y plan de recorte hacia una meta de ahorro.
- Gráfico de Sankey de ingresos, gastos y resultado.
- Todo queda en la computadora: un archivo por hogar, con contraseña opcional.

## Datos públicos que usa

- IPC por región y categoría, canasta básica alimentaria y total: INDEC (vía datos.gob.ar).
- Encuesta Nacional de Gastos de los Hogares 2017-2018: INDEC (microdatos).
- Inflación esperada: Relevamiento de Expectativas de Mercado (REM) del Banco Central.
- Dólar mayorista: Banco Central. Dólar oficial, MEP y blue: ArgentinaDatos.

## Desarrollo

```
npm install
npm test          # pruebas del motor de cálculo
npm run datos     # vuelve a bajar los datos públicos
```

Licencia MIT.
