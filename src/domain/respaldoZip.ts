/**
 * Respaldo completo en .zip: los datos (mismo JSON que "Descargar respaldo") más el
 * contenido de cada adjunto. Estructura:
 *
 *   respaldo.json                      ← Exportacion (ver docs/esquema.json)
 *   adjuntos/<id del adjunto>/<nombre> ← archivo original de cada Adjunto
 *   LEEME.txt
 */
import { unzip, zip, type AsyncZippable } from 'fflate';
import type { Adjunto, Exportacion } from './schema';

export const ARCHIVO_DATOS = 'respaldo.json';

const LEEME = `Respaldo completo de la plataforma de fichas kinesiológicas.

- respaldo.json: todos los datos (pacientes, ingresos, evaluaciones, sesiones, centros,
  biblioteca de ejercicios, plantillas y programas). Formato descrito en docs/esquema.json.
- adjuntos/<id>/<archivo>: el archivo de cada adjunto; <id> corresponde a "id" en la lista
  "adjuntos" de respaldo.json.

Para restaurar: en la app, Datos e IA → Importar respaldo… y elegir este .zip.
Contiene datos clínicos sensibles: guárdalo en un lugar seguro.
La Ley 26.529 exige al responsable conservar la historia clínica durante al menos diez años
desde la última actuación. La eliminación de la copia alojada por Kine no reemplaza esa obligación.
`;

const limpio = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'archivo';

export const rutaEnZip = (a: Pick<Adjunto, 'id' | 'nombreArchivo'>) => `adjuntos/${a.id}/${limpio(a.nombreArchivo)}`;

function comprimir(entradas: AsyncZippable): Promise<Uint8Array> {
  return new Promise((ok, mal) => zip(entradas, (e, d) => (e ? mal(e) : ok(d))));
}

function descomprimir(datos: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((ok, mal) => unzip(datos, (e, d) => (e ? mal(e) : ok(d))));
}

export interface ResultadoZip {
  zip: Blob;
  incluidos: number;
  /** Adjuntos cuyo archivo no se pudo leer (no están en este dispositivo o falló la descarga). */
  faltantes: Adjunto[];
}

export async function crearRespaldoZip(
  exportacion: Exportacion,
  leerArchivo: (a: Adjunto) => Promise<Blob>,
  progreso?: (hechos: number, total: number) => void,
): Promise<ResultadoZip> {
  const json = new TextEncoder().encode(JSON.stringify(exportacion, null, 2));
  const entradas: AsyncZippable = {
    [ARCHIVO_DATOS]: [json, { level: 6 }],
    'LEEME.txt': [new TextEncoder().encode(LEEME), { level: 6 }],
  };
  const faltantes: Adjunto[] = [];
  const total = exportacion.adjuntos.length;
  let hechos = 0;
  progreso?.(0, total);
  for (const a of exportacion.adjuntos) {
    try {
      const contenido = new Uint8Array(await (await leerArchivo(a)).arrayBuffer());
      // Fotos y PDF ya vienen comprimidos: guardarlos sin recomprimir es mucho más rápido.
      entradas[rutaEnZip(a)] = [contenido, { level: 0 }];
    } catch {
      faltantes.push(a);
    }
    progreso?.(++hechos, total);
  }
  const datos = await comprimir(entradas);
  return { zip: new Blob([datos as BlobPart], { type: 'application/zip' }), incluidos: total - faltantes.length, faltantes };
}

export interface ContenidoZip {
  datos: unknown;
  /** Archivo de cada adjunto, por id del adjunto. */
  archivos: Map<string, Blob>;
}

export async function leerRespaldoZip(archivo: Blob): Promise<ContenidoZip> {
  const entradas = await descomprimir(new Uint8Array(await archivo.arrayBuffer()));
  const json = entradas[ARCHIVO_DATOS];
  if (!json) throw new Error(`El .zip no contiene ${ARCHIVO_DATOS}: no parece un respaldo de esta app`);
  const datos = JSON.parse(new TextDecoder().decode(json)) as { adjuntos?: Adjunto[] };
  const tipos = new Map((datos.adjuntos ?? []).map((a) => [a.id, a.tipoMime]));
  const archivos = new Map<string, Blob>();
  for (const [ruta, contenido] of Object.entries(entradas)) {
    const m = /^adjuntos\/([^/]+)\/[^/]+$/.exec(ruta);
    if (m) archivos.set(m[1], new Blob([contenido as BlobPart], { type: tipos.get(m[1]) || 'application/octet-stream' }));
  }
  return { datos, archivos };
}

export const esZip = (f: File) => f.name.toLowerCase().endsWith('.zip') || f.type === 'application/zip';
