// Datos compartidos por las pruebas: los datos públicos reales del repositorio.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const datos = JSON.parse(readFileSync(join(raiz, 'web', 'data', 'datos.json'), 'utf8'));
export const engho = JSON.parse(readFileSync(join(raiz, 'web', 'data', 'engho.json'), 'utf8'));
export const MES_HOY = '2026-10';
