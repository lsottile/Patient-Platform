// Acceso a Supabase con la service role key vía REST (sin dependencias externas).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase en cada Edge Function.

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CLAVE_SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_ADMIN = Deno.env.get('KINE_ADMIN_API_URL') ?? SUPABASE_URL;

const cabeceras = (extra: Record<string, string> = {}) => ({
  apikey: CLAVE_SERVICIO,
  Authorization: `Bearer ${CLAVE_SERVICIO}`,
  ...extra,
});

async function verificar(r: Response, que: string): Promise<Response> {
  if (!r.ok) throw new Error(`${que}: ${r.status} ${await r.text()}`);
  return r;
}

/** Lee todas las filas de una tabla para un usuario, paginando de a 1000. */
export async function leerTabla<T>(tabla: string, userId: string, columnas = 'data'): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?select=${columnas}&user_id=eq.${userId}&order=id`, {
      headers: cabeceras({ Range: `${desde}-${desde + 999}` }),
    });
    const pagina = (await (await verificar(r, `leer ${tabla}`)).json()) as T[];
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
  }
}

export async function rpc<T = unknown>(funcion: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
  });
  const texto = await (await verificar(r, `rpc ${funcion}`)).text();
  return (texto ? JSON.parse(texto) : null) as T;
}

export interface AccesoComercialServidor {
  user_id: string;
  modalidad: 'general' | 'preferencial' | 'exenta';
  precio_ars: number;
  estado: string;
  mercado_pago_preapproval_id: string | null;
  mercado_pago_init_point: string | null;
  ultimo_pago_id: string | null;
  ultimo_pago_en: string | null;
  acceso_hasta: string | null;
  gracia_hasta: string | null;
  eliminar_despues_de: string | null;
  updated_at: string;
  checkout_generacion: number;
  ultimo_evento_pago_en: string | null;
  eliminacion_reclamada_en: string | null;
  eliminacion_confirmada_en: string | null;
}

export async function leerAccesoPorPreapproval(preapprovalId: string): Promise<AccesoComercialServidor | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/accesos_comerciales?mercado_pago_preapproval_id=eq.${encodeURIComponent(preapprovalId)}&select=*`,
    { headers: cabeceras() },
  );
  const filas = (await (await verificar(r, 'leer acceso por suscripción')).json()) as AccesoComercialServidor[];
  return filas[0] ?? null;
}

export async function leerAccesoComercial(userId: string): Promise<AccesoComercialServidor | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/accesos_comerciales?user_id=eq.${encodeURIComponent(userId)}&select=*`,
    { headers: cabeceras() },
  );
  const filas = (await (await verificar(r, 'leer acceso comercial')).json()) as AccesoComercialServidor[];
  return filas[0] ?? null;
}

export async function actualizarAccesoComercial(userId: string, cambios: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/accesos_comerciales?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: cabeceras({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(cambios),
  });
  await verificar(r, 'actualizar acceso comercial');
}

export async function listarObjetosAdjuntos(userId: string): Promise<string[]> {
  return await rpc<string[]>('objetos_adjuntos_usuario', { p_user: userId });
}

export async function borrarObjetosAdjuntos(rutas: string[]): Promise<void> {
  for (let desde = 0; desde < rutas.length; desde += 100) {
    const r = await fetch(`${API_ADMIN}/storage/v1/object/adjuntos`, {
      method: 'DELETE',
      headers: cabeceras({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: rutas.slice(desde, desde + 100) }),
    });
    await verificar(r, 'borrar adjuntos de la cuenta');
  }
}

export async function borrarUsuario(userId: string): Promise<void> {
  const r = await fetch(`${API_ADMIN}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: cabeceras(),
  });
  await verificar(r, 'borrar usuario');
}

export async function versionesLegalesVigentes(): Promise<{ terminos: string; privacidad: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/documentos_legales?vigente=eq.true&select=tipo,version`, {
    headers: cabeceras(),
  });
  const filas = (await (await verificar(r, 'leer documentos legales')).json()) as { tipo: string; version: string }[];
  const terminos = filas.find((fila) => fila.tipo === 'terminos')?.version;
  const privacidad = filas.find((fila) => fila.tipo === 'privacidad')?.version;
  if (!terminos || !privacidad) throw new Error('No hay documentos legales vigentes');
  return { terminos, privacidad };
}

export interface EstadoDrive {
  user_id: string;
  email_google: string | null;
  carpeta_id: string | null;
  carpeta_adjuntos_id: string | null;
  frecuencia: string;
  ultimo_respaldo: string | null;
  adjuntos_subidos: Record<string, string>;
}

export async function leerEstado(userId: string): Promise<EstadoDrive | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/respaldos_drive?user_id=eq.${userId}&select=*`, { headers: cabeceras() });
  const filas = (await (await verificar(r, 'leer estado')).json()) as EstadoDrive[];
  return filas[0] ?? null;
}

export async function guardarEstado(userId: string, cambios: Partial<EstadoDrive> & Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/respaldos_drive?on_conflict=user_id`, {
    method: 'POST',
    headers: cabeceras({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
    body: JSON.stringify({ user_id: userId, ...cambios }),
  });
  await verificar(r, 'guardar estado');
}

export async function borrarEstado(userId: string) {
  await verificar(
    await fetch(`${SUPABASE_URL}/rest/v1/respaldos_drive?user_id=eq.${userId}`, { method: 'DELETE', headers: cabeceras() }),
    'borrar estado',
  );
}

export async function descargarAdjunto(ruta: string): Promise<Blob> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/adjuntos/${ruta.split('/').map(encodeURIComponent).join('/')}`, {
    headers: cabeceras(),
  });
  return await (await verificar(r, `descargar ${ruta}`)).blob();
}

/** Devuelve el id del usuario dueño del JWT de la petición, o null. */
export async function usuarioDeLaPeticion(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: CLAVE_SERVICIO, Authorization: auth },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email } : null;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
