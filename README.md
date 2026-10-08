# Mi Presupuesto

Programa de escritorio para Windows para armar y seguir el presupuesto de tu casa, con el
formato de una planilla: ingresos, gastos, gastos inesperados, ahorro, deudas e
inversiones, mes a mes, con la inflación de cada categoría.

**[Descargar la última versión](https://github.com/bmfoundationbm-netizen/App-Presupuesto/releases/latest)**
· instalador o versión portable (sin instalar).

> Windows puede mostrar "Windows protegió su PC" porque el programa no está firmado con un
> certificado comercial: tocá **Más información** y después **Ejecutar de todas formas**.

## Qué hace

- **Planilla con los 12 meses del año.** Conceptos en filas, meses en columnas, totales y
  resultado calculados solos. Tres modos: lo planeado, lo real y los dos comparados (con
  avisos cuando te pasás). Se escribe como en Excel: Enter, Tab, flechas, copiar y pegar.
- **Dos formas de cargar lo real:** el total del mes en la celda, o cada gasto con su
  fecha, descripción y medio de pago. Los gastos fijos se repiten solos y se dan por
  pagados hasta que cargues otra cosa.
- **Categorías del IPC del INDEC** (alimentos, vivienda, transporte, salud, educación…),
  cada una con su propia inflación, por región.
- **Varios presupuestos por año y proyectos** (una reforma, unas vacaciones). Se actualizan
  al IPC con una copia: "¿cuánto sería hoy?" o proyectado a otro año con la inflación
  esperada del REM del Banco Central.
- **Compras en cuotas** que se reparten solas, **préstamos**, **aguinaldo** calculado,
  **dólares** con la cotización que elijas (oficial, mayorista, MEP o blue).
- **Fondo de emergencia** que paga los imprevistos y **metas de ahorro** que suben con la
  inflación. Cierre de mes: decidís a dónde va lo que sobró.
- **Composición familiar** (2 adultos y 2 menores, 1 adulto y 1 menor, etc., con edad y
  sexo opcionales): canasta básica del hogar (líneas de pobreza e indigencia), comparación
  con hogares parecidos de la Encuesta de Gastos de los Hogares del INDEC y costo por
  integrante.
- **Dónde recortar:** regla 50/30/20, hogares parecidos, tu propio historial contra la
  inflación y topes propios (cada comparación se prende o se apaga). Cada gasto es
  esencial, reducible o prescindible, y el programa arma un plan de recorte hacia una meta.
- **Gráfico de Sankey** de ingresos, gastos y resultado, más torta por categoría,
  evolución mes a mes, planeado contra real e ingresos contra la inflación.
- **Importar** el Excel o CSV de cualquier banco (se eligen las columnas una vez y queda
  guardado) o una planilla con meses en columnas. **Exportar** a Excel y a un informe en PDF.
- **Consejo opcional con Claude** (la inteligencia artificial de Anthropic), con tu propia
  clave de API.

## Privacidad

- Cada hogar es un archivo `.presupuesto` que guardás donde quieras. Nada se sube a
  ningún servidor.
- Contraseña opcional: el archivo queda cifrado (AES-256-GCM). Si la olvidás, no hay forma
  de recuperarlo.
- El programa se conecta a internet solo para bajar los datos públicos, avisar si hay una
  versión nueva y, si lo usás, pedir consejo a Claude. Lo que se manda a Claude son
  totales por categoría (no los gastos sueltos ni sus descripciones) y lo ves antes de
  mandarlo.
- Se guardan copias de respaldo automáticas en la carpeta del usuario.

## Datos públicos

| Dato | Fuente |
|---|---|
| IPC por región y categoría (base dic. 2016) | INDEC, vía [datos.gob.ar](https://datos.gob.ar/dataset/sspm-indice-precios-al-consumidor-nacional-ipc-base-diciembre-2016) |
| Canasta básica alimentaria y total | INDEC, vía datos.gob.ar |
| Hogares parecidos | INDEC, Encuesta Nacional de Gastos de los Hogares 2017-2018 (microdatos) |
| Inflación esperada | Relevamiento de Expectativas de Mercado (REM) del Banco Central |
| Dólar oficial, MEP y blue | ArgentinaDatos y DolarApi |
| Dólar mayorista | Banco Central |

Una tarea del proyecto los vuelve a armar todas las semanas y el programa los baja solo.
Los meses que el INDEC todavía no publicó se pueden cargar a mano.

## Desarrollo

```
npm install
npm start          # abre el programa
npm test           # pruebas del motor de cálculo (node:test)
npm run datos      # vuelve a bajar los datos públicos (web/data/datos.json)
npm run dist       # arma el instalador y el portable en dist/
```

- `electron/`: proceso principal (archivos, cifrado, exportar, datos, Claude).
- `web/`: la interfaz (HTML y módulos de JavaScript, sin framework). `web/lib/` es el motor
  de cálculo, sin DOM, y es lo que prueban las pruebas.
- `tools/`: armado de los datos públicos y procesamiento de la ENGHo.

Para publicar una versión: `git tag v1.0.1 && git push --tags`. GitHub Actions arma el
instalador y el portable y los sube a Releases.

## Licencia

MIT. Ver [LICENSE](LICENSE).
