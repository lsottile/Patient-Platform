import {
  borrarObjetosAdjuntos,
  borrarUsuario,
  listarObjetosAdjuntos,
  respuesta,
  rpc,
} from '../_shared/servicio.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);
  const secreto = Deno.env.get('SECRETO_CRON');
  if (!secreto || req.headers.get('x-secreto-cron') !== secreto) {
    return respuesta({ error: 'No autorizado' }, 401);
  }

  try {
    const vencidas = await rpc<{ user_id: string }[]>('cuentas_vencidas_para_eliminar');
    let eliminadas = 0;
    let errores = 0;
    for (const cuenta of vencidas) {
      try {
        const objetos = await listarObjetosAdjuntos(cuenta.user_id);
        await borrarObjetosAdjuntos(objetos);
        await borrarUsuario(cuenta.user_id);
        eliminadas += 1;
      } catch (e) {
        errores += 1;
        console.error('No se pudo eliminar una cuenta vencida:', e instanceof Error ? e.message : 'error desconocido');
      }
    }
    return respuesta({ revisadas: vencidas.length, eliminadas, errores });
  } catch (e) {
    console.error('No se pudo ejecutar la limpieza:', e instanceof Error ? e.message : 'error desconocido');
    return respuesta({ error: 'No se pudo ejecutar la limpieza' }, 500);
  }
});
