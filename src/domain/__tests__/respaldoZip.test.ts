import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { crearRespaldoZip, leerRespaldoZip, rutaEnZip } from '../respaldoZip';
import type { Adjunto, Exportacion } from '../schema';

const adjunto = (id: string, nombreArchivo: string, tipoMime: string): Adjunto => ({
  tipo: 'adjunto',
  id,
  creadoEn: '',
  actualizadoEn: '',
  pacienteId: 'p1',
  fecha: '2026-10-18',
  categoria: 'examen',
  descripcion: '',
  nombreArchivo,
  tipoMime,
  tamanoBytes: 3,
  ruta: `ruta/${id}`,
  evaluacionId: null,
});

const exportacion = (adjuntos: Adjunto[]): Exportacion => ({
  formato: 'kine-plataforma',
  versionEsquema: 1,
  exportadoEn: '2026-10-18T00:00:00Z',
  centros: [],
  pacientes: [],
  ingresos: [],
  evaluaciones: [],
  sesiones: [],
  adjuntos,
  ejercicios: [],
  plantillas: [],
  programas: [],
});

describe('respaldo .zip', () => {
  it('ida y vuelta: conserva datos y el contenido exacto de cada adjunto', async () => {
    const a1 = adjunto('a1', 'RM rodilla.pdf', 'application/pdf');
    const a2 = adjunto('a2', 'foto/rara:1.jpg', 'image/jpeg');
    const contenidos: Record<string, Uint8Array> = { a1: new Uint8Array([37, 80, 68, 70]), a2: new Uint8Array(5000).map((_, i) => i % 251) };
    const progreso: number[] = [];
    const r = await crearRespaldoZip(exportacion([a1, a2]), async (a) => new Blob([contenidos[a.id] as BlobPart]), (h) => progreso.push(h));
    expect(r.incluidos).toBe(2);
    expect(r.faltantes).toEqual([]);
    expect(progreso).toEqual([0, 1, 2]);
    expect(rutaEnZip(a2)).toBe('adjuntos/a2/foto_rara_1.jpg');

    const leido = await leerRespaldoZip(r.zip);
    expect(leido.datos).toEqual(exportacion([a1, a2]));
    expect(leido.archivos.size).toBe(2);
    for (const id of ['a1', 'a2']) {
      expect(new Uint8Array(await leido.archivos.get(id)!.arrayBuffer())).toEqual(contenidos[id]);
    }
    expect(leido.archivos.get('a1')!.type).toBe('application/pdf');
    const leeme = new TextDecoder().decode(unzipSync(new Uint8Array(await r.zip.arrayBuffer()))['LEEME.txt']);
    expect(leeme).toMatch(/datos clínicos sensibles/i);
    expect(leeme).toMatch(/diez años/i);
  });

  it('informa los adjuntos cuyo archivo no está disponible y respalda el resto', async () => {
    const r = await crearRespaldoZip(exportacion([adjunto('a1', 'x.pdf', 'application/pdf'), adjunto('a2', 'y.pdf', 'application/pdf')]), async (a) => {
      if (a.id === 'a2') throw new Error('no está en este navegador');
      return new Blob(['ok']);
    });
    expect(r.incluidos).toBe(1);
    expect(r.faltantes.map((a) => a.id)).toEqual(['a2']);
    const leido = await leerRespaldoZip(r.zip);
    expect([...leido.archivos.keys()]).toEqual(['a1']);
    expect((leido.datos as Exportacion).adjuntos).toHaveLength(2);
  });

  it('rechaza un .zip que no es un respaldo de la app', async () => {
    const ajeno = new Blob([zipSync({ 'otra-cosa.txt': new TextEncoder().encode('hola') }) as BlobPart]);
    await expect(leerRespaldoZip(ajeno)).rejects.toThrow(/respaldo\.json/);
  });
});

describe('importar un respaldo en otra cuenta (o de local a Supabase)', () => {
  it('reasigna los ids del catálogo al destino y actualiza las referencias, sin tocar lo propio', async () => {
    const { catalogoBase, plantillasBase, programasBase } = await import('../catalogo');
    const { adaptarIdsAlDestino } = await import('../importacion');
    const [ejLocal, plLocal, prLocal] = [await catalogoBase(''), await plantillasBase(''), await programasBase('')];
    const [ejDestino, plDestino] = [await catalogoBase('u1:'), await plantillasBase('u1:')];
    const propio = { ...ejLocal[0], id: 'mio-1', nombre: 'Mi ejercicio', predefinido: false };
    const sesion = {
      id: 's1',
      planificacion: { objetivos: '', notas: '', ejercicios: [{ id: 'x', ejercicioId: ejLocal[5].id }, { id: 'y', ejercicioId: 'mio-1' }, { id: 'z', ejercicioId: null }] },
    };
    // 'mio-1', 's1' y 'p' ya existen en la cuenta: conservan su id.
    const { entrada: r } = await adaptarIdsAlDestino(
      { ejercicios: [...ejLocal, propio], plantillas: plLocal, programas: prLocal, sesiones: [sesion], pacientes: [{ id: 'p' }] },
      'u1:',
      new Set(['mio-1', 's1', 'p']),
    );
    const ej = r.ejercicios as typeof ejLocal;
    expect(ej.slice(0, ejLocal.length).map((e) => e.id)).toEqual(ejDestino.map((e) => e.id));
    expect(ej.at(-1)!.id).toBe('mio-1');
    expect((r.plantillas as typeof plLocal).map((p) => p.id)).toEqual(plDestino.map((p) => p.id));
    expect((r.plantillas as typeof plLocal)[0].ejercicios.map((e) => e.ejercicioId)).toEqual(plDestino[0].ejercicios.map((e) => e.ejercicioId));
    const idsDestino = new Set(ejDestino.map((e) => e.id));
    for (const p of r.programas as typeof prLocal) for (const s of p.sesiones) for (const e of s.ejercicios) expect(idsDestino.has(e.ejercicioId!)).toBe(true);
    const refs = (r.sesiones as (typeof sesion)[])[0].planificacion.ejercicios.map((e) => e.ejercicioId);
    expect(refs).toEqual([ejDestino[5].id, 'mio-1', null]);
    expect(r.pacientes).toEqual([{ id: 'p' }]);
  });

  it('no cambia nada si el respaldo es de la misma cuenta', async () => {
    const { catalogoBase } = await import('../catalogo');
    const { adaptarIdsAlDestino } = await import('../importacion');
    const entrada = { ejercicios: await catalogoBase('u1:') };
    expect((await adaptarIdsAlDestino(entrada, 'u1:')).entrada).toBe(entrada);
  });
});

describe('importar en una cuenta de Supabase registros que no existen en ella', () => {
  const respaldo = () => ({
    centros: [{ id: 'c1', nombre: 'Clínica' }],
    pacientes: [{ id: 'p1', centroId: 'c1', identificacion: { nombre: 'Ana p1' } }],
    sesiones: [{ id: 's1', pacienteId: 'p1', planificacion: { ejercicios: [] } }],
    adjuntos: [{ id: 'a1', pacienteId: 'p1', ruta: 'u0/p1/a1-rm.pdf', evaluacionId: 'e1' }],
    evaluaciones: [{ id: 'e1', pacienteId: 'p1' }],
  });

  it('les da ids propios de la cuenta y actualiza todas las referencias', async () => {
    const { adaptarIdsAlDestino } = await import('../importacion');
    const { entrada, ids } = await adaptarIdsAlDestino(respaldo(), 'u2:');
    const r = entrada as ReturnType<typeof respaldo>;
    expect(ids.get('a1')).toBe(r.adjuntos[0].id);
    const [c, p, s, a, e] = [r.centros[0], r.pacientes[0], r.sesiones[0], r.adjuntos[0], r.evaluaciones[0]];
    for (const x of [c, p, s, a, e]) expect(['c1', 'p1', 's1', 'a1', 'e1']).not.toContain(x.id);
    expect(p.centroId).toBe(c.id);
    expect(s.pacienteId).toBe(p.id);
    expect(e.pacienteId).toBe(p.id);
    expect(a.evaluacionId).toBe(e.id);
    // los textos que solo contienen un id (no son iguales a él) no se tocan
    expect(p.identificacion.nombre).toBe('Ana p1');
    expect(a.ruta).toBe('u0/p1/a1-rm.pdf');
  });

  it('es determinista por cuenta: reimportar actualiza, y otra cuenta obtiene otros ids', async () => {
    const { adaptarIdsAlDestino } = await import('../importacion');
    const [u2a, u2b, u3] = [
      (await adaptarIdsAlDestino(respaldo(), 'u2:')).entrada as ReturnType<typeof respaldo>,
      (await adaptarIdsAlDestino(respaldo(), 'u2:')).entrada as ReturnType<typeof respaldo>,
      (await adaptarIdsAlDestino(respaldo(), 'u3:')).entrada as ReturnType<typeof respaldo>,
    ];
    expect(u2a.pacientes[0].id).toBe(u2b.pacientes[0].id);
    expect(u2a.pacientes[0].id).not.toBe(u3.pacientes[0].id);
  });

  it('en modo local conserva los ids', async () => {
    const { adaptarIdsAlDestino } = await import('../importacion');
    const entrada = respaldo();
    expect((await adaptarIdsAlDestino(entrada, '')).entrada).toBe(entrada);
  });
});
