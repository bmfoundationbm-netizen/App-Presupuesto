// Mi Presupuesto · ayuda en pantalla (F1 o el botón "?")

import { h, montar, icono } from '../ui.js';
import { iniciarRecorrido } from './recorrido.js';
import { estado } from '../estado.js';

const AYUDA = {
  planilla: {
    titulo: 'La planilla',
    partes: [
      ['Cómo se usa', 'Cada fila es un concepto (Sueldo, Alquiler, Supermercado…) y cada columna un mes. Elegí una celda y escribí el monto: Enter baja, Tab va a la derecha. Supr borra. Podés pegar celdas copiadas de Excel o de una planilla de Google.'],
      ['Planeado, real y comparar', '"Planeado" es el presupuesto: lo que pensás cobrar y gastar. "Real" es lo que pasó. En "Comparar" cada celda muestra lo real arriba y lo planeado abajo, con ▲ cuando te pasaste y ● cuando ya usaste el 90 %.'],
      ['Dos formas de cargar lo real', 'Escribí el total del mes en la celda, o cargá cada gasto con "Cargar gasto" (fecha, descripción, medio de pago). Si un mes tiene gastos sueltos, la celda los suma y aparece un punto azul arriba a la izquierda.'],
      ['Fijos', 'Un concepto fijo (marcado F) se repite: al cargar un mes se copia a los siguientes. Y en los meses ya empezados se da por pagado igual a lo planeado (se ve en cursiva) hasta que cargues otro monto o cierres el mes.'],
      ['Cuotas', 'Una compra en cuotas aparece sola en cada mes que le toca (triángulo violeta en la esquina de la celda), también en los meses que vienen: es plata ya comprometida.'],
      ['Aguinaldo', 'Si un sueldo está marcado "en relación de dependencia", en junio y diciembre aparece el aguinaldo calculado: la mitad del mejor sueldo del semestre. Si escribís otro monto, manda el tuyo.'],
      ['Imprevistos y fondo de emergencia', 'Los gastos inesperados se pagan con el fondo de emergencia mientras tenga plata: la fila "Pagado con el fondo" los descuenta y no afectan el resultado del mes.'],
      ['Resultado del mes', 'Ingresos menos gastos, imprevistos que no cubrió el fondo, ahorro, cuotas de préstamos e inversiones. Si es positivo sobra plata; si es negativo, falta.'],
      ['Cerrar el mes', 'Al terminar un mes, cerralo: se confirman los fijos y elegís qué hacer con lo que sobró (a una meta o al mes siguiente) o cómo cubrir lo que faltó. Se puede reabrir.'],
      ['Atajos', 'Flechas para moverse · Shift+flechas para elegir varias celdas (abajo se ve la suma) · Ctrl+R repite lo planeado hasta diciembre · Ctrl+Z deshace · Ctrl+S guarda · clic derecho en un concepto para más opciones.']
    ],
    recorrido: true
  },
  movimientos: {
    titulo: 'Movimientos',
    partes: [
      ['Qué es', 'La lista de todos los gastos e ingresos cargados uno por uno, de todos los meses. Se filtra por mes, concepto, medio de pago, persona o texto.'],
      ['Importar del banco', 'Con "Importar" podés traer el Excel o CSV que baja tu home banking. Le indicás una vez qué columna es la fecha, la descripción y el monto, y queda guardado para la próxima.'],
      ['Reglas', 'Al importar, el programa recuerda a qué concepto asignaste cada descripción ("COTO" → Supermercado) y lo propone solo la próxima vez.']
    ]
  },
  presupuestos: {
    titulo: 'Presupuestos y proyectos',
    partes: [
      ['Presupuestos por año', 'Cada año puede tener varios presupuestos (el original, uno ajustado, uno con recortes). El que está marcado como activo es el que se ve como "planeado" en la planilla.'],
      ['Actualizar al IPC', 'Crea una copia con los montos ajustados por la inflación de cada categoría: alimentos con el IPC de alimentos, transporte con el de transporte. Se puede llevar a pesos de un mes ("¿cuánto sería hoy?") o proyectar a otro año con la inflación esperada. El original no se toca.'],
      ['Qué no se ajusta', 'Los montos en dólares, las cuotas de préstamos (son fijas) y lo que se calcula solo. Los ingresos se ajustan si lo elegís.'],
      ['Proyectos', 'Un gasto puntual con sus partes: reformar el baño, unas vacaciones, un cumpleaños. Cada ítem se actualiza con su propio IPC y podés crear una meta de ahorro para juntar la plata.']
    ]
  },
  ahorro: {
    titulo: 'Ahorro y deudas',
    partes: [
      ['Metas', 'Una meta tiene monto y fecha. Si está en pesos y marcás "que suba con la inflación", el objetivo se ajusta con el IPC (y con la inflación esperada para los meses que faltan): así no queda corta.'],
      ['Fondo de emergencia', 'Su objetivo es una cantidad de meses de gastos (el promedio de los últimos meses). Los imprevistos se pagan de acá.'],
      ['Deudas y cuotas', 'Los préstamos muestran cuántas cuotas faltan y cuánto se debe. Las compras en cuotas de tarjeta se ven con su fin, y abajo lo que queda comprometido para los próximos meses.'],
      ['Inversiones', 'Un plazo fijo calcula solo sus intereses con la tasa. Para fondos, acciones o cripto, cargá el valor actual cada tanto. Se muestra el rendimiento y si le ganó a la inflación.']
    ]
  },
  familia: {
    titulo: 'Familia y canasta básica',
    partes: [
      ['Para qué sirve', 'Con quiénes viven, el programa calcula la canasta básica de tu hogar (líneas de pobreza e indigencia del INDEC), te compara con hogares parecidos y reparte el gasto entre cada integrante.'],
      ['Adulto equivalente', 'El INDEC no cuenta a todos igual: un varón de 30 a 60 años es 1; una mujer de esa edad, 0,77; un nene de 6 años, 0,64. La familia tipo (35, 31, 6 y 8 años) suma 3,09. Si no cargás edad y sexo se usa un promedio.'],
      ['Hogares parecidos', 'Salen de la Encuesta Nacional de Gastos de los Hogares 2017-2018 del INDEC: hogares con la misma cantidad de adultos y menores, la misma región, ingresos parecidos y si alquilan o no. Las proporciones se actualizan con los precios de hoy de cada categoría.'],
      ['Costo por integrante', 'Lo que se asignó a cada persona (su prepaga, su colegio) más su parte de lo compartido, repartida según el adulto equivalente.']
    ]
  },
  analisis: {
    titulo: 'Análisis y recortes',
    partes: [
      ['Qué compara', 'Usa el promedio real de los últimos 3 meses completos. Podés prender o apagar cada comparación: la regla 50/30/20, hogares parecidos, tu propio historial contra la inflación y los topes que pongas.'],
      ['Esencial, reducible, prescindible', 'Cada gasto tiene una clasificación propuesta por el programa que podés cambiar en la planilla. Los esenciales nunca se recortan en el plan; los prescindibles son los primeros.'],
      ['Plan de recorte', 'Decís cuánto querés ahorrar de más por mes y el programa propone cuánto bajar en cada concepto, empezando por lo prescindible y por lo que está por encima de hogares parecidos o de tu historial. Podés ajustar cada uno y crear un presupuesto con ese plan.'],
      ['Consejo con Claude', 'Opcional. Manda un resumen con los totales por categoría (no los gastos sueltos ni las descripciones) a Claude, la inteligencia artificial de Anthropic, con tu propia clave de API. Antes de mandarlo ves exactamente qué sale.']
    ]
  },
  graficos: {
    titulo: 'Gráficos',
    partes: [
      ['Sankey', 'Muestra cómo fluye la plata: de dónde entra (cada ingreso) al total disponible, y de ahí a cada categoría y concepto. El ancho de cada banda es el monto. Tocá una categoría para abrirla o cerrarla.'],
      ['Período y fuente', 'Arriba elegís el mes, el año o un rango, y si se ve lo planeado o lo real. Todos los gráficos usan lo mismo.'],
      ['Colores', 'Los colores agrupan categorías parecidas (vivienda y equipamiento, comida, salud…) y son siempre los mismos. Cada gráfico tiene su tabla con todos los valores.']
    ]
  },
  datos: {
    titulo: 'Datos públicos',
    partes: [
      ['De dónde salen', 'IPC por región y categoría y canasta básica: INDEC (vía datos.gob.ar). Inflación esperada: Relevamiento de Expectativas de Mercado (REM) del Banco Central. Dólar oficial, MEP y blue: ArgentinaDatos y DolarApi. Mayorista: Banco Central.'],
      ['Cuándo se actualizan', 'Una tarea del proyecto los vuelve a armar todas las semanas y el programa los baja solo. El IPC sale alrededor del 15 de cada mes.'],
      ['Meses sin publicar', 'Si el INDEC todavía no publicó un mes, podés cargar la inflación a mano. Para los meses que vienen se usa la proyección elegida: el REM (lo que esperan los analistas), una tasa propia o el promedio de los últimos 3 meses.']
    ]
  },
  ajustes: {
    titulo: 'Ajustes',
    partes: [
      ['Del hogar', 'Nombre, región, vivienda, cotización del dólar, medios de pago y contraseña. Se guardan en el archivo del hogar.'],
      ['Del programa', 'Tema claro u oscuro y la clave de API de Claude. Quedan en esta computadora.'],
      ['Respaldos', 'Antes del primer guardado de cada sesión y una vez por día se guarda una copia del archivo anterior. Se pueden abrir desde acá.']
    ]
  }
};

const GLOSARIO = [
  ['IPC', 'Índice de Precios al Consumidor del INDEC. Mide cuánto suben los precios cada mes. Se publica por región y por categoría (división).'],
  ['Canasta básica alimentaria (CBA)', 'Lo mínimo en comida que necesita una persona adulta por mes. Si los ingresos del hogar no llegan a la CBA del hogar, el INDEC lo cuenta como indigente.'],
  ['Canasta básica total (CBT)', 'La CBA más otros bienes y servicios básicos (ropa, transporte, educación, salud). Por debajo de la CBT del hogar se considera pobreza.'],
  ['Adulto equivalente', 'Unidad para comparar las necesidades de personas de distinta edad y sexo. Un varón adulto vale 1.'],
  ['REM', 'Relevamiento de Expectativas de Mercado del Banco Central: lo que esperan consultoras y bancos para la inflación de los próximos meses.'],
  ['Dólar MEP', 'El que se compra con bonos en la bolsa, de forma legal. Dólar blue: el del mercado informal.'],
  ['Aguinaldo (SAC)', 'Sueldo anual complementario: en junio y diciembre se cobra la mitad del mejor sueldo mensual del semestre.'],
  ['TNA', 'Tasa nominal anual de un plazo fijo. 30 días al 30 % de TNA rinden 30 × 30 / 365 ≈ 2,5 %.'],
  ['Regla 50/30/20', 'Una guía simple: 50 % de los ingresos para necesidades, 30 % para gustos y 20 % para ahorro o pagar deudas.']
];

export function abrirAyuda(vista) {
  cerrarAyuda();
  const a = AYUDA[vista] || AYUDA.planilla;
  const panel = document.createElement('div');
  panel.className = 'panel-ayuda';
  panel.setAttribute('role', 'dialog');
  montar(panel, h`<div class="cab">${icono('ayuda')}<h2>${a.titulo}</h2><button class="boton icono fantasma" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button></div>
    <div class="cuerpo">
      ${a.partes.map(([t, p]) => h`<h3>${t}</h3><p>${p}</p>`)}
      ${a.recorrido ? h`<p style="margin-top:14px"><button class="boton chico" data-recorrido>Ver el recorrido guiado</button></p>` : ''}
      <h3 style="margin-top:26px">Glosario</h3>
      <dl>${GLOSARIO.map(([t, d]) => h`<dt>${t}</dt><dd>${d}</dd>`)}</dl>
      <h3 style="margin-top:26px">Sobre el programa</h3>
      <p>Mi Presupuesto ${estado.info.version || ''} · código abierto (licencia MIT). Tus datos quedan en tu computadora.</p>
      <p><button class="boton chico" data-enlace="https://github.com/bmfoundationbm-netizen/App-Presupuesto">${icono('enlace')}Página del proyecto</button></p>
    </div>`);
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) cerrarAyuda();
    if (e.target.closest('[data-recorrido]')) { cerrarAyuda(); iniciarRecorrido(); }
    const l = e.target.closest('[data-enlace]');
    if (l) window.mp.app.externo(l.dataset.enlace);
  });
  document.body.appendChild(panel);
  const esc = (e) => { if (e.key === 'Escape') { cerrarAyuda(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);
}

export function cerrarAyuda() { document.querySelectorAll('.panel-ayuda').forEach((p) => p.remove()); }
