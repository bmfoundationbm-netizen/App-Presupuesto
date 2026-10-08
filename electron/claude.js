/* Mi Presupuesto · consejo opcional con Claude
 *
 * Cada persona usa su propia clave de API de Anthropic. La clave se guarda cifrada con
 * el almacenamiento seguro del sistema (DPAPI en Windows) y nunca sale de este proceso.
 * Se manda solo el resumen que arma la ventana (totales por categoría, sin movimientos ni
 * descripciones), que la persona ve antes de enviarlo.
 *
 * Modelo por defecto: Claude Opus 5.5, con esfuerzo "medium" explícito. Con Opus 5.5 y
 * Sonnet 5.5 se pide el respaldo del lado del servidor (fallbacks: "default"): si el
 * modelo declina el pedido, la API lo reintenta sola con el modelo recomendado.
 */
'use strict';
const { app, safeStorage } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const MODELOS = {
  'claude-opus-5-5': { nombre: 'Claude Opus 5.5', detalle: 'El más capaz. US$ 4 por millón de tokens de entrada y US$ 20 de salida.', esfuerzo: true, respaldo: true },
  'claude-sonnet-5-5': { nombre: 'Claude Sonnet 5.5', detalle: 'Rápido y más barato. US$ 2 y US$ 10 por millón de tokens.', esfuerzo: true, respaldo: true },
  'claude-haiku-4-5': { nombre: 'Claude Haiku 4.5', detalle: 'El más barato. US$ 1 y US$ 5 por millón de tokens.', esfuerzo: false, respaldo: false }
};
const MODELO_POR_DEFECTO = 'claude-opus-5-5';
const ARCHIVO_CLAVE = () => path.join(app.getPath('userData'), 'claude.clave');

async function guardarClave(clave) {
  clave = String(clave || '').trim();
  if (!clave) return { ok: false, error: 'La clave está vacía.' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Windows no permite guardar la clave de forma segura en esta cuenta.' };
  await fs.mkdir(path.dirname(ARCHIVO_CLAVE()), { recursive: true });
  await fs.writeFile(ARCHIVO_CLAVE(), safeStorage.encryptString(clave));
  return { ok: true };
}

async function leerClave() {
  try { return safeStorage.decryptString(await fs.readFile(ARCHIVO_CLAVE())); }
  catch (e) { return null; }
}

async function borrarClave() {
  await fs.rm(ARCHIVO_CLAVE(), { force: true });
  return { ok: true };
}

async function estado() {
  return { tieneClave: !!(await leerClave()), modelos: MODELOS, porDefecto: MODELO_POR_DEFECTO };
}

const SISTEMA = `Sos un asesor de finanzas personales para hogares de Argentina. Recibís el resumen \
del presupuesto de un hogar (montos mensuales en pesos argentinos, con su composición y región) \
y los hallazgos que ya calculó el programa Mi Presupuesto.

Respondé en español rioplatense (voseo), con calidez y sin juzgar. Formato:
1. Una oración con lo que está bien.
2. Entre 3 y 6 sugerencias concretas, de la que más plata libera a la que menos. Cada una con \
el concepto, qué hacer y cuánto se podría liberar por mes (estimado, en pesos).
3. Si hay riesgo (gastos por encima de los ingresos, ingresos debajo de la canasta básica, \
fondo de emergencia muy bajo), decilo con claridad y con un primer paso posible.

Tené en cuenta la inflación argentina, el aguinaldo, las cuotas sin interés y que los gastos \
esenciales (alquiler, servicios, salud, educación) se revisan renegociando o cambiando de \
proveedor, no dejándolos de pagar. No recomiendes productos financieros, bancos ni \
inversiones específicas. Usá negrita solo para los montos y viñetas simples. No pases de \
300 palabras.`;

// Hace la consulta. aviso(texto) recibe el texto a medida que llega.
async function consultar({ resumen, modelo }, aviso = () => {}) {
  const clave = await leerClave();
  if (!clave) return { ok: false, error: 'Falta cargar la clave de API de Anthropic en Ajustes.' };
  const id = MODELOS[modelo] ? modelo : MODELO_POR_DEFECTO;
  const m = MODELOS[id];
  const client = new Anthropic({ apiKey: clave, maxRetries: 2, timeout: 180000 });
  const params = {
    model: id,
    max_tokens: 16000,
    system: SISTEMA,
    messages: [{ role: 'user', content: String(resumen).slice(0, 60000) }]
  };
  if (m.esfuerzo) params.output_config = { effort: 'medium' };
  if (m.respaldo) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }

  try {
    const stream = client.beta.messages.stream(params);
    stream.on('text', (delta) => aviso(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude no pudo responder este pedido. Probá de nuevo con menos detalle o con otro modelo.' };
    }
    const texto = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return {
      ok: true, texto, modelo: final.model, cortado: final.stop_reason === 'max_tokens',
      uso: { entrada: final.usage.input_tokens, salida: final.usage.output_tokens }
    };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

function mensajeDeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'La clave de API no es válida. Revisala en Ajustes.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'La clave no tiene permiso para usar este modelo.';
  if (e instanceof Anthropic.NotFoundError) return 'El modelo elegido no está disponible para tu cuenta. Elegí otro en Ajustes.';
  if (e instanceof Anthropic.RateLimitError) return 'Se hicieron demasiadas consultas seguidas. Esperá un minuto y probá de nuevo.';
  if (e instanceof Anthropic.InternalServerError) return 'El servicio de Claude está saturado o con problemas. Probá en unos minutos o con otro modelo.';
  if (e instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con Claude. Revisá la conexión a internet.';
  if (e instanceof Anthropic.BadRequestError) return `La consulta fue rechazada: ${e.message}`;
  if (e instanceof Anthropic.APIError) {
    if (e.status === 402 || e.type === 'billing_error') return 'La cuenta de la API no tiene crédito. Cargalo en console.anthropic.com.';
    return `Error de la API (${e.status || 'sin código'}): ${e.message}`;
  }
  return `No se pudo consultar: ${e.message}`;
}

module.exports = { guardarClave, borrarClave, estado, consultar, MODELOS, MODELO_POR_DEFECTO };
