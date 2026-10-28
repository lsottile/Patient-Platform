import { crearPreapproval, obtenerPreapproval } from '../_shared/mercadopago.ts';
import {
  actualizarAccesoComercial,
  CORS,
  prepararCheckoutComercial,
  registrarSuscripcionMercadoPago,
  respuesta,
  usuarioDeLaPeticion,
  versionesLegalesVigentes,
} from '../_shared/servicio.ts';

function backUrlPermitida(valor: unknown): valor is string {
  const configurada = Deno.env.get('KINE_APP_URL');
  if (typeof valor !== 'string' || !configurada) return false;
  try {
    const recibida = new URL(valor);
    const base = new URL(configurada);
    const rutaBase = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    return recibida.origin === base.origin && (recibida.pathname === base.pathname || recibida.pathname.startsWith(rutaBase));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);

  const usuario = await usuarioDeLaPeticion(req);
  if (!usuario?.email) return respuesta({ error: 'No autenticado' }, 401);
  if (Deno.env.get('COBROS_HABILITADOS') !== 'true') {
    return respuesta({ error: 'Los cobros están deshabilitados; informa el pago mensual por soporte.' }, 503);
  }

  try {
    const cuerpo = await req.json();
    if (cuerpo?.aceptaTerminos !== true || cuerpo?.aceptaPrivacidad !== true || !backUrlPermitida(cuerpo?.backUrl)) {
      return respuesta({ error: 'Debes aceptar los documentos vigentes y usar una URL de retorno válida' }, 400);
    }

    const versiones = await versionesLegalesVigentes();
    const acceso = await prepararCheckoutComercial(usuario.id, versiones);
    if (acceso.modalidad === 'exenta') return respuesta({ error: 'La cuenta está exenta de suscripción' }, 400);

    let generacion = acceso.checkout_generacion;
    if (acceso.mercado_pago_preapproval_id && acceso.mercado_pago_init_point) {
      const existente = await obtenerPreapproval(acceso.mercado_pago_preapproval_id);
      const coincide =
        existente.id === acceso.mercado_pago_preapproval_id &&
        existente.external_reference === usuario.id &&
        existente.auto_recurring.transaction_amount === acceso.precio_ars &&
        existente.auto_recurring.currency_id === 'ARS';
      if (!coincide) return respuesta({ error: 'La suscripción guardada no coincide con la cuenta' }, 409);
      if (existente.status === 'pending' || existente.status === 'authorized') {
        return respuesta({ initPoint: acceso.mercado_pago_init_point });
      }
      generacion += 1;
      await actualizarAccesoComercial(usuario.id, {
        checkout_generacion: generacion,
        mercado_pago_preapproval_id: null,
        mercado_pago_init_point: null,
      });
    }

    const preapproval = await crearPreapproval({
      userId: usuario.id,
      email: usuario.email,
      amount: acceso.precio_ars,
      backUrl: cuerpo.backUrl,
      idempotencyKey: `${usuario.id}:${generacion}`,
    });
    await registrarSuscripcionMercadoPago(usuario.id, preapproval.id);
    await actualizarAccesoComercial(usuario.id, {
      mercado_pago_preapproval_id: preapproval.id,
      mercado_pago_init_point: preapproval.initPoint,
    });
    return respuesta({ initPoint: preapproval.initPoint });
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Error desconocido al crear la suscripción');
    return respuesta({ error: 'No se pudo iniciar el pago. Intenta nuevamente.' }, 502);
  }
});
