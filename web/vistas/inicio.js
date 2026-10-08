// Mi Presupuesto · pantalla de inicio (sin hogar abierto)

import { estado } from '../estado.js';
import { h, crudo, montar, icono, LOGO } from '../ui.js';
import { abrirArchivo, abrirEjemplo, nuevoHogar } from '../acciones.js';

function fechaCorta(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function render(raiz) {
  montar(raiz, h`<div class="inicio"><div class="inicio-caja">
    <div class="inicio-marca">${crudo(LOGO.replace('class="marca-logo"', 'class="inicio-logo"'))}
      <div><h1>Mi Presupuesto</h1><p class="apagado">El presupuesto de tu casa, mes a mes, con la inflación de cada categoría.</p></div></div>
    <div class="inicio-opciones">
      <button class="inicio-opcion primaria" data-accion="nuevo">${icono('casa')}<strong>Crear mi hogar</strong><span>Un asistente de 6 pasos: quiénes viven, ingresos, gastos y ahorro. Lleva unos 5 minutos.</span></button>
      <button class="inicio-opcion" data-accion="abrir">${icono('carpeta')}<strong>Abrir un hogar guardado</strong><span>Un archivo .presupuesto de esta computadora, de un pendrive o de una copia.</span></button>
      <button class="inicio-opcion" data-accion="ejemplo">${icono('estrella')}<strong>Probar con un ejemplo</strong><span>Una familia de 2 adultos y 2 chicos con el año cargado, para ver todo funcionando.</span></button>
    </div>
    <div id="recientes"></div>
    <p class="inicio-pie apagado chico">${icono('candado')} Tus datos quedan en tu computadora, en el archivo que elijas. El programa solo se conecta a internet para bajar el IPC, la canasta básica y el dólar.
      · Versión ${estado.info.version || ''}</p>
  </div></div>`);
  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'nuevo') nuevoHogar();
    else if (b.dataset.accion === 'abrir') abrirArchivo();
    else if (b.dataset.accion === 'ejemplo') abrirEjemplo();
    else if (b.dataset.accion === 'reciente') abrirArchivo(b.dataset.ruta);
    else if (b.dataset.accion === 'quitar') { await window.mp.archivo.quitarReciente(b.dataset.ruta); recientes(raiz); }
  });
  recientes(raiz);
}

async function recientes(raiz) {
  const lista = await window.mp.archivo.recientes();
  const cont = raiz.querySelector('#recientes');
  if (!cont) return;
  if (!lista.length) { cont.innerHTML = ''; return; }
  montar(cont, h`<h3 style="margin:22px 0 8px">Abiertos hace poco</h3>
    <div class="inicio-recientes">${lista.map((r) => h`<div class="reciente ${r.existe ? '' : 'falta'}">
      <button class="reciente-abrir" data-accion="reciente" data-ruta="${r.ruta}" ${r.existe ? '' : crudo('disabled')}>${icono('archivo')}<span><strong>${r.nombre}</strong><small>${r.existe ? r.ruta : 'No se encuentra el archivo'}</small></span><em>${fechaCorta(r.fecha)}</em></button>
      <button class="boton icono chico fantasma" data-accion="quitar" data-ruta="${r.ruta}" data-ayuda="Quitar de la lista (no borra el archivo)">${icono('cerrar')}</button>
    </div>`)}</div>`);
}

export default { titulo: 'Inicio', icono: 'casa', render };
