// Mi Presupuesto · tema claro u oscuro (o el de Windows)
import { estado } from '../estado.js';

export function aplicarTemaDesdeAjustes() {
  const t = estado.ajustes.tema;
  if (t === 'claro' || t === 'oscuro') document.documentElement.dataset.tema = t;
  else delete document.documentElement.dataset.tema;
}
