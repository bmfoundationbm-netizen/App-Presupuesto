# Mi Presupuesto (App-Presupuesto)

Programa de escritorio para Windows de presupuesto familiar, estilo planilla: ingresos,
gastos, gastos inesperados, ahorro, deudas e inversiones; análisis de dónde recortar;
composición familiar con canasta básica; gráfico de Sankey; presupuestos actualizables
por IPC y divididos por categorías. Es público: lo puede bajar cualquiera.

Repo: `bmfoundationbm-netizen/App-Presupuesto` (Nacho le dice "bmfoundation").

## Decisiones de Nacho (cuestionario del 2026-10-07)

No revertirlas sin preguntar.

- **Plataforma:** Electron, solo Windows. Instalador y portable en GitHub Releases; el
  programa avisa cuando hay versión nueva (no se actualiza solo). Licencia MIT.
- **Para quién:** cualquiera que lo baje → asistente de inicio, hogar de ejemplo y ayuda
  completa en pantalla. Nombre visible: **Mi Presupuesto**.
- **Datos:** un archivo `.presupuesto` por hogar (Abrir / Guardar / Guardar como), guardado
  automático y respaldos. Contraseña opcional por hogar (archivo cifrado).
- **Planilla:** grilla editable, conceptos en filas y 12 meses en columnas, totales
  automáticos, sin fórmulas propias. Se carga el total del mes en la celda **o** gastos
  sueltos con fecha que la celda suma. Los fijos se repiten solos cada mes.
- **Tipos:** ingresos, gastos (fijos y variables), inesperados, ahorro, deudas y
  préstamos, inversiones. Categorías = las 12 divisiones del IPC del INDEC, editables, con
  un nivel de subcategorías. Gasto asignable a un integrante (opcional). Medio de pago como
  etiqueta. Compras en cuotas que se reparten solas. Aguinaldo calculado solo.
- **Dólares:** pesos y dólares; cotización elegible por hogar (oficial BNA, mayorista BCRA,
  MEP, blue) bajada sola, o a mano.
- **Imprevistos:** fondo de emergencia con meta (meses de gastos) que los cubre.
- **Metas de ahorro:** con fecha y ajustadas por IPC. El sobrante del mes se decide al
  cerrar el mes (meta, fondo o mes siguiente).
- **Presupuestos:** las dos cosas: planes del hogar por año y proyectos puntuales con
  ítems. Plan contra real con avisos (90 % y pasado). Actualizar al IPC: a pesos de un mes
  y proyectar a otro año; siempre crea una copia.
- **IPC:** automático (INDEC vía datos.gob.ar) más carga manual para los meses sin
  publicar; un índice por categoría; región por defecto GBA (cada hogar elige).
  Proyección a futuro: REM del BCRA, editable.
- **Familia:** atajos (1, 2, 1+1, 1+2, 2+1, 2+2, 2+3) y armado libre; edad y sexo
  opcionales. Se usa para canasta básica (pobreza e indigencia), hogares parecidos (ENGHo)
  y costo por integrante. **No** para sugerir montos.
- **Recortes:** comparaciones elegibles (regla 50/30/20, hogares parecidos, historial
  propio contra la inflación, topes propios). La app clasifica esencial / reducible /
  prescindible y cada uno corrige. Plan de recorte sugerido hacia una meta.
- **IA:** opcional con Claude (clave de API de cada usuario; se mandan totales, no el
  detalle). El resto del análisis son reglas propias, sin internet.
- **Gráficos:** Sankey de 4 niveles (fuentes → total → categorías → subcategorías, con
  sobrante o faltante; clic abre y cierra categorías), torta, evolución mensual, plan
  contra real y contra la inflación.
- **Bancos:** asistente de importación para cualquier banco (Excel/CSV, columnas
  elegidas a mano, plantilla guardada). Exportar a Excel y PDF; importar Excel y CSV.
- Sin preguntar se eligió: tema claro y oscuro según Windows; Sobres (la app de Android)
  queda separada; el Sankey elige período (mes, año o rango) y plan o real.

## Estructura

```
electron/        proceso principal
  main.js        ventana, protocolo app://mp, bloqueo de red de la ventana, IPC
  archivo.js     .presupuesto: leer, guardar seguro (tmp + rename), cifrado, respaldos
  datos.js       datos públicos (incluidos o bajados del repo), dólar del día, versión nueva
  exportar.js    Excel (ExcelJS), PDF (printToPDF en ventana oculta), leer planillas (SheetJS)
  claude.js      consejo con Claude (SDK oficial; clave con safeStorage)
  ajustes.js     ajustes del programa en userData/ajustes.json
web/             interfaz: HTML + módulos ES, sin framework. web/package.json = type module
  app.js         arranque, estructura de la ventana, navegación y atajos
  estado.js      hogar abierto, mutar() con deshacer/rehacer, guardado automático
  ui.js          h`` (escapa todo), íconos, diálogos, avisos, menús
  acciones.js    abrir, ejemplo, guardar como, cerrar
  vistas/        una pantalla por archivo + dialogos.js, cierre.js, importar.js, exportar.js
  graficos/      colores.js (familias de color) y graficos.js (d3: Sankey, torta, líneas, barras)
  lib/           motor de cálculo, sin DOM (lo que prueban las pruebas)
  data/          datos.json (datos públicos) y engho.json (encuesta de gastos, fijo)
tools/           construir-datos.js (semanal), procesar-engho.js (una vez), generar-icono.js
pruebas/         node:test sobre web/lib con los datos públicos reales
.github/workflows  pruebas.yml, datos.yml (lunes), publicar.yml (etiquetas v*)
```

### web/lib

| módulo | qué hace |
|---|---|
| `fechas.js` | meses `'AAAA-MM'` y fechas `'AAAA-MM-DD'` como texto; `leerFecha` para bancos |
| `dinero.js` | centavos enteros, formato argentino, `leerMonto` (1.234,56 / 1234.56 / (1.234)) |
| `catalogo.js` | regiones, 12 divisiones del IPC, subcategorías sugeridas, adulto equivalente |
| `modelo.js` | hogar, líneas, planes, metas, deudas, inversiones, cuotas; `normalizarHogar` |
| `indices.js` | IPC oficial + manual + proyección (REM), dólar del mes, canasta básica |
| `calculos.js` | plan y real por línea y mes, totales, resultado, fondo de emergencia |
| `cierre.js` | cerrar y reabrir un mes |
| `ahorro.js` | metas ajustadas por IPC, deudas, cuotas pendientes, inversiones |
| `familia.js` | adulto equivalente, canasta del hogar, hogares parecidos, costo por persona |
| `presupuestos.js` | copiar y actualizar planes por IPC, plan por año, proyectos, recortes |
| `analisis.js` | 50/30/20, parecidos, historial, topes, plan de recorte, avisos |
| `importar.js` | CSV, detección de columnas de bancos, reglas, planillas con meses en columnas |
| `sankey.js`, `series.js` | datos de los gráficos |
| `ejemplo.js` | hogar de ejemplo (familia tipo de GBA, se arma con los datos reales) |

## Interfaz: decisiones

- **La ventana no tiene Node ni internet** (sandbox, contextIsolation, todo pedido http
  cancelado). Todo lo de red y disco pasa por `preload.js` → `main.js`.
- **Todo texto de un archivo pasa por `h```** (escapa). Solo `crudo()` entra como HTML.
- **mutar(fn)** es la única forma de cambiar el hogar: guarda para deshacer, recalcula el
  contexto, programa el guardado (700 ms) y redibuja. `historial: false` para cosas de
  interfaz (plegar una categoría).
- **Cada redibujo crea un nodo nuevo para la vista** (los listeners no se duplican) y
  conserva el desplazamiento de los elementos con `data-scroll`.
- **Planilla:** los montos se muestran en pesos enteros; el detalle, con centavos. Editar
  un fijo en el plan repite el monto en los meses siguientes (`fijarPlanFijo`). Escribir un
  total en una celda con gastos sueltos pide confirmación (el total manda sobre la suma).
- **El mes en curso no entra** en el análisis, la evolución ni el gráfico de inflación: está
  incompleto. En los avisos, los fijos supuestos no cuentan y "cerca del límite" solo
  aplica al mes en curso.

## Colores de los datos

Guía de visualización (skill dataviz), validada con su script:
- 8 familias fijas por significado, nunca por tamaño: casa (vivienda + equipamiento),
  comida (alimentos + alcohol), salud, educación, ocio (recreación + restaurantes), ahorro
  (ahorro + inversiones), transporte, deudas (deudas + imprevistos); otros en gris
  (ropa, comunicación, varios). Las 12 categorías se distinguen por nombre o tabla.
- Gris de "Otros": `#6f6e69` en claro, `#a3a19a` en oscuro.
- Pares que se confunden (ver `CHOCAN` en `graficos/colores.js`): la torta busca un orden
  circular sin esos vecinos y tiene como mucho 5 grupos + Otros.
- Evolución mensual: series 1-3 (azul, naranja, aqua), las únicas que pasan todos los
  pares. Verde + naranja falla con daltonismo: no usar juntos.
- Texto de los gráficos siempre con tintas de texto (clases `eje-texto`, `etiqueta-*`).

## Claude (opcional)

Modelo por defecto `claude-opus-5-5` con `output_config.effort: 'medium'` y respaldo del
servidor (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`); también se
ofrecen `claude-sonnet-5-5` y `claude-haiku-4-5` (sin esfuerzo ni respaldo). Streaming con
`finalMessage()`; se revisa `stop_reason === 'refusal'`. Errores con las clases del SDK.
Antes de tocar esto, cargar la skill claude-api.

## Cómo funciona lo que no es obvio

- **Montos en centavos enteros**, en la moneda de cada línea. Los totales siempre en
  pesos (las líneas en dólares se convierten con la cotización del mes).
- **Real de una celda, en orden:** total escrito a mano → suma de movimientos y cuotas →
  automático (aguinaldo, sobrante del mes anterior) → **supuesto**: un fijo de ingresos,
  gastos o deudas de un mes ya empezado se da por pagado igual al plan hasta que se cargue
  otra cosa o se cierre el mes. Ahorro e inversiones nunca se suponen. Los supuestos no
  disparan avisos y no cuentan como "mes con datos".
- **Cuotas:** cuentan como real en cada mes, también en los futuros (compromiso).
- **Fondo de emergencia:** su libro mes a mes cubre los inesperados reales hasta su saldo;
  lo cubierto aparece como fuente en el Sankey y no pega en el resultado del mes.
- **IPC:** base dic-2016 = 100. Después del último mes publicado: inflación manual (si se
  cargó) y si no la proyección (REM mensual → lo que falta para el REM a 12 meses → REM a
  24 → anual). La proyección es la misma para todas las categorías.
- **Canasta:** CBA/CBT de GBA salen todos los meses; las otras regiones con atraso, así que
  `construir-datos.js` las estima con la relación región/GBA del último mes común.
  Región "Todo el país" usa la canasta de GBA.
- **ENGHo 2017-18:** los montos están en pesos de cada entrevista (nov-2017 a nov-2018),
  por eso solo se guardan proporciones por categoría y "veces la CBT del hogar". Celdas
  por adultos (1-3+), menores (0-3+), región, quintil de ingreso (en veces la CBT) y
  tenencia (alquila o no: cambia la vivienda de 11 % a 29 %). Las proporciones se
  actualizan con los precios relativos desde 2018-05.
- **Adulto equivalente:** tabla sacada de la columna `adequi` de los microdatos (familia
  tipo = 3,09).
- **Análisis:** usa los últimos 3 meses **completos** con datos reales; si no hay, el plan
  del mes en curso.
- **Actualizar al IPC** no toca líneas en dólares, cuotas de préstamos ni automáticas.

## Datos públicos

`npm run datos` arma `web/data/datos.json` (~120 KB). Fuentes verificadas el 2026-10-07:
IPC por capítulos (CSV de datos.gob.ar, dataset 145, distribución 145.5) y nivel general
por región (series `145.3_ING…`); canastas `150.1_CSTA_*` (GBA) y `444.1_CANASTA_*`
(regiones); dólar de api.argentinadatos.com (oficial, bolsa = MEP, blue) y API del BCRA
(mayorista; **rechaza fechas futuras**: usar la fecha de Argentina, no la UTC); REM: la
planilla `relevamiento-expectativas-mercado-tablas-AAAA-MM.xlsx` que se busca en la página
del REM del BCRA. Si una fuente falla se conserva lo anterior y se anota el error.

`npm run engho` (una sola vez) arma `web/data/engho.json` desde los microdatos de hogares.

## Verificar cambios

1. `npm test` (node:test, sin dependencias).
2. Probar en Electron real con un arnés propio (en esta máquina, ver la memoria
   `verificacion-electron`): `env -u ELECTRON_RUN_AS_NODE`, perfil aislado con
   `app.setPath('userData')`, ventana fuera de pantalla, pasos con `executeJavaScript` y
   `capturePage`. Los diálogos nativos se reemplazan por rutas de prueba.
   `capturePage` puede devolver el cuadro anterior: esperar un poco antes de capturar.
3. Empaquetado: `npx electron-builder --win dir` y abrir `dist/win-unpacked/Mi Presupuesto.exe`
   con `--remote-debugging-port` para revisarlo por CDP. El portable lanza el programa
   real como proceso hijo desde `%TEMP%`: al terminar la prueba hay que cerrar esos
   procesos "Mi Presupuesto" y borrar la carpeta de prueba de `%APPDATA%`.

## Publicar

- `git tag vX.Y.Z && git push --tags` → `publicar.yml` arma instalador y portable y crea la
  release. El programa avisa de la versión nueva (no se actualiza solo).
- `datos.yml` corre los lunes, sube `web/data/datos.json` y el programa lo baja solo.
- No hay firma de código: Windows muestra SmartScreen la primera vez.
