import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { diasDesdeRespaldo, estadoAlmacenamiento, registrarRespaldo, solicitarPersistencia, tamanoLegible, type EstadoAlmacenamiento } from '../data/almacenamiento';
import { useDatos } from '../data/DatosContext';
import { useSincronizacionCarpeta } from '../data/SincronizacionCarpeta';
import type { EstadoCarpeta } from '../data/SincronizacionCarpeta';
import { descargar } from '../domain/archivos';
import { hoy } from '../domain/factories';
import { crearRespaldoZip, esZip, leerRespaldoZip } from '../domain/respaldoZip';
import { ExportacionSchema } from '../domain/schema';

/** Respaldo manual (.zip con adjuntos o .json), importación y estado del almacenamiento local. */
export function SeccionRespaldo({ soloExportar = false }: { soloExportar?: boolean }) {
  return soloExportar ? <ContenidoRespaldo soloExportar /> : <RespaldoConCarpeta />;
}

function RespaldoConCarpeta() {
  const { estado } = useSincronizacionCarpeta();
  return <ContenidoRespaldo carpeta={estado} />;
}

function ContenidoRespaldo({ soloExportar = false, carpeta }: { soloExportar?: boolean; carpeta?: EstadoCarpeta }) {
  const { db, modo, exportar, importar, leerArchivo, cargando } = useDatos();
  const archivo = useRef<HTMLInputElement>(null);
  const [trabajo, setTrabajo] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(null);
  const [dias, setDias] = useState(() => (soloExportar ? null : diasDesdeRespaldo()));

  const descargarZip = async () => {
    setMensaje(null);
    setTrabajo('Preparando respaldo…');
    try {
      const r = await crearRespaldoZip(
        exportar(),
        (a) => leerArchivo(a.ruta),
        (hechos, total) => total && setTrabajo(`Agregando adjuntos ${hechos}/${total}…`),
      );
      descargar(`respaldo-kine-${hoy()}.zip`, r.zip);
      registrarRespaldo();
      setDias(0);
      setMensaje(
        r.faltantes.length
          ? {
              tipo: 'aviso',
              texto: `Respaldo descargado (${tamanoLegible(r.zip.size)}) con ${r.incluidos} adjuntos. ${r.faltantes.length} no se pudieron incluir porque su archivo no está disponible: ${r.faltantes.map((a) => a.nombreArchivo).join(', ')}.`,
            }
          : { tipo: 'ok', texto: `Respaldo descargado (${tamanoLegible(r.zip.size)}) con todos los datos y ${r.incluidos} adjuntos.` },
      );
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `No se pudo crear el respaldo: ${e instanceof Error ? e.message : e}` });
    } finally {
      setTrabajo('');
    }
  };

  const alImportar = async (f: File | undefined) => {
    if (!f) return;
    setMensaje(null);
    setTrabajo('Importando…');
    try {
      const { datos, archivos } = esZip(f) ? await leerRespaldoZip(f) : { datos: JSON.parse(await f.text()), archivos: undefined };
      const r = await importar(datos, archivos);
      setMensaje({
        tipo: 'ok',
        texto: `Importados ${r.total} registros${archivos ? ` y ${r.archivos} archivos adjuntos` : ''}.`,
      });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `Error al importar: ${e instanceof Error ? e.message : e}` });
    } finally {
      setTrabajo('');
      if (archivo.current) archivo.current.value = '';
    }
  };

  return (
    <section className="tarjeta pila">
      <h3>Respaldo</h3>
      <p>
        {modo === 'local'
          ? 'Estás en modo local: los datos y los adjuntos viven solo en este navegador. Descarga un respaldo completo periódicamente y guárdalo en un lugar seguro.'
          : 'Tus datos se guardan en la nube (Supabase). Igual puedes descargar un respaldo completo cuando quieras.'}
      </p>
      {!soloExportar && modo === 'local' && carpeta?.tipo === 'activa' && !carpeta.error && (
        <p className="tenue">Respaldo continuo activo: los datos y adjuntos se copian a la carpeta “{carpeta.carpeta}” (ver abajo).</p>
      )}
      {!soloExportar && modo === 'local' && carpeta && (carpeta.tipo !== 'activa' || !!carpeta.error) && (
        <p className={dias == null || dias > 7 ? 'aviso aviso--aviso' : 'tenue'}>
          {dias == null ? 'Aún no has descargado un respaldo completo en este navegador.' : `Último respaldo completo: ${dias === 0 ? 'hoy' : `hace ${dias} día(s)`}.`}
        </p>
      )}
      <div className="acciones acciones--izq">
        <button className="boton boton--primario" onClick={descargarZip} disabled={!!trabajo || cargando}>
          Descargar respaldo completo (.zip, con adjuntos)
        </button>
        {!soloExportar && (
          <>
            <button className="boton" onClick={() => descargar(`respaldo-kine-${hoy()}.json`, JSON.stringify(exportar(), null, 2))} disabled={!!trabajo}>
              Solo datos (.json)
            </button>
            <button className="boton" onClick={() => archivo.current?.click()} disabled={!!trabajo}>
              Importar respaldo…
            </button>
            <input ref={archivo} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(e) => alImportar(e.target.files?.[0])} />
            <button
              className="boton"
              onClick={() => descargar('esquema-kine.json', JSON.stringify(z.toJSONSchema(ExportacionSchema, { io: 'input' }), null, 2))}
            >
              Descargar esquema de datos (JSON Schema)
            </button>
          </>
        )}
      </div>
      {trabajo && <p className="aviso">{trabajo}</p>}
      {mensaje && <p className={`aviso aviso--${mensaje.tipo}`}>{mensaje.texto}</p>}
      <p className="tenue">
        {soloExportar
          ? `El .zip incluye todos los datos y el archivo de cada adjunto (${db.adjuntos.length}).`
          : `El .zip incluye los datos y el archivo de cada adjunto (${db.adjuntos.length}); el .json solo los datos. Importar agrega o actualiza registros por id (no borra nada) y, desde un .zip, restaura también los archivos.`}
      </p>
      {!soloExportar && modo === 'local' && <EstadoAlmacenamientoLocal />}
    </section>
  );
}

function EstadoAlmacenamientoLocal() {
  const [estado, setEstado] = useState<EstadoAlmacenamiento | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const refrescar = () => estadoAlmacenamiento().then(setEstado);
  useEffect(() => {
    void refrescar();
  }, []);
  if (!estado) return null;
  if (!estado.soportado) return <p className="tenue">Este navegador no informa si el almacenamiento es persistente.</p>;
  return (
    <div className="estado-almacenamiento">
      <span>
        <strong>Almacenamiento {estado.persistente ? 'persistente ✓' : 'no persistente'}</strong>
        {estado.usadoBytes != null && (
          <span className="tenue">
            {' '}
            · usando {tamanoLegible(estado.usadoBytes)}
            {estado.cuotaBytes ? ` de ${tamanoLegible(estado.cuotaBytes)} disponibles` : ''}
          </span>
        )}
      </span>
      <small className="tenue">
        {estado.persistente
          ? 'El navegador no borrará estos datos por falta de espacio. Aun así, borrar los datos del sitio o desinstalar el navegador los elimina: mantén respaldos.'
          : 'El navegador podría borrar estos datos si le falta espacio (y Safari los borra tras 7 días sin uso si la app no está instalada en la pantalla de inicio). Instalar la app ayuda a que el navegador lo permita.'}
      </small>
      {!estado.persistente && (
        <div>
          <button
            className="boton boton--chico"
            disabled={pidiendo}
            onClick={async () => {
              setPidiendo(true);
              await solicitarPersistencia();
              await refrescar();
              setPidiendo(false);
            }}
          >
            Solicitar almacenamiento persistente
          </button>
        </div>
      )}
    </div>
  );
}
