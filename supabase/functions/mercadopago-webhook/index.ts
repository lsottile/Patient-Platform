import { validarFirmaMercadoPago } from '../_shared/firmaMercadoPago.ts';
import {
  obtenerPagoAutorizado,
  obtenerPreapproval,
  type PagoAutorizadoMercadoPago,
  type PreapprovalMercadoPago,
} from '../_shared/mercadopago.ts';
import {
  leerAccesoComercial,
  leerAccesoPorPreapproval,
  respuesta,
  rpc,
  type AccesoComercialServidor,
} from '../_shared/servicio.ts';

const TOPICS = new Set(['subscription_preapproval', 'subscription_authorized_payment']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PeticionInvalida extends Error {}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const resultado = new Date(valor);
  return Number.isFinite(resultado.getTime()) ? resultado : null;
}

function sumarDias(base: string, dias: number): string {
  const resultado = fecha(base);
  if (!resultado) throw new PeticionInvalida('Mercado Pago devolvió una fecha inválida');
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado.toISOString();
}

function sumarMes(base: string): string {
  const resultado = fecha(base);
  if (!resultado) throw new PeticionInvalida('Mercado Pago devolvió una fecha inválida');
  resultado.setUTCMonth(resultado.getUTCMonth() + 1);
  return resultado.toISOString();
}

function sumarAnio(base: string): string {
  const resultado = fecha(base);
  if (!resultado) throw new PeticionInvalida('Mercado Pago devolvió una fecha inválida');
  resultado.setUTCFullYear(resultado.getUTCFullYear() + 1);
  return resultado.toISOString();
}

function validarSuscripcion(preapproval: PreapprovalMercadoPago, acceso: AccesoComercialServidor, exigirActual = true): void {
  if (
    (exigirActual && preapproval.id !== acceso.mercado_pago_preapproval_id) ||
    preapproval.external_reference !== acceso.user_id ||
    preapproval.auto_recurring.transaction_amount !== acceso.precio_ars ||
    preapproval.auto_recurring.currency_id !== 'ARS'
  ) {
    throw new PeticionInvalida('La suscripción no coincide con la cuenta');
  }
}

async function procesarPreapproval(preapproval: PreapprovalMercadoPago): Promise<{
  acceso: AccesoComercialServidor;
  accion: string;
  cambios: Record<string, unknown>;
}> {
  if (!UUID.test(preapproval.external_reference)) throw new PeticionInvalida('La referencia de la suscripción es inválida');
  const acceso = await leerAccesoComercial(preapproval.external_reference);
  if (!acceso) throw new PeticionInvalida('Cuenta desconocida');
  validarSuscripcion(preapproval, acceso);
  const cambios: Record<string, unknown> = {};
  if (preapproval.status === 'cancelled' || preapproval.status === 'canceled') {
    const accesoHasta = acceso.acceso_hasta ?? preapproval.next_payment_date ?? new Date().toISOString();
    cambios.estado = 'cancelada';
    cambios.acceso_hasta = accesoHasta;
    cambios.gracia_hasta = null;
    cambios.eliminar_despues_de = sumarAnio(accesoHasta);
  } else if (!['pending', 'authorized', 'paused'].includes(preapproval.status)) {
    throw new PeticionInvalida('Estado de suscripción desconocido');
  }
  return { acceso, accion: `preapproval:${preapproval.last_modified ?? preapproval.status}`, cambios };
}

async function procesarPago(pago: PagoAutorizadoMercadoPago): Promise<{
  acceso: AccesoComercialServidor;
  accion: string;
  cambios: Record<string, unknown>;
  eventoPagoEn: string;
  pago: { id: string; debitoEn: string; estado: string; preapprovalId: string; suscripcionCancelada: boolean };
}> {
  const acceso = await leerAccesoPorPreapproval(pago.preapproval_id);
  if (!acceso) throw new PeticionInvalida('Suscripción desconocida');
  const preapproval = await obtenerPreapproval(pago.preapproval_id);
  validarSuscripcion(preapproval, acceso, false);
  if (pago.transaction_amount !== acceso.precio_ars || pago.currency_id !== 'ARS') {
    throw new PeticionInvalida('El pago no coincide con el precio de la cuenta');
  }

  const cambios: Record<string, unknown> = {};
  const pagoId = pago.payment.id;
  const pagoEn = pago.debit_date;
  switch (pago.payment.status) {
    case 'approved': {
      const preapprovalCancelada = ['cancelled', 'canceled'].includes(preapproval.status);
      if (!preapprovalCancelada) {
        cambios.estado = 'activa';
        cambios.acceso_hasta = fecha(preapproval.next_payment_date)?.toISOString() ?? sumarMes(pago.debit_date);
        cambios.gracia_hasta = null;
        cambios.eliminar_despues_de = null;
        cambios.ultimo_pago_id = pagoId;
        cambios.ultimo_pago_en = pagoEn;
      }
      break;
    }
    case 'rejected':
      cambios.estado = 'gracia';
      cambios.gracia_hasta = sumarDias(pago.debit_date, 4);
      break;
    case 'refunded': {
      const fin = new Date().toISOString();
      cambios.estado = 'reintegrada';
      cambios.acceso_hasta = fin;
      cambios.gracia_hasta = null;
      cambios.eliminar_despues_de = sumarAnio(fin);
      cambios.ultimo_pago_id = pagoId;
      cambios.ultimo_pago_en = pagoEn;
      break;
    }
    default:
      throw new PeticionInvalida('Estado de pago desconocido');
  }
  return {
    acceso,
    accion: `payment:${pago.last_modified}`,
    cambios,
    eventoPagoEn: pago.last_modified,
    pago: {
      id: pagoId,
      debitoEn: pago.debit_date,
      estado: pago.payment.status,
      preapprovalId: pago.preapproval_id,
      suscripcionCancelada: ['cancelled', 'canceled'].includes(preapproval.status),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido' }, 405);
  let cuerpo: { type?: unknown; action?: unknown; data?: { id?: unknown } };
  try {
    cuerpo = await req.json();
  } catch {
    return respuesta({ error: 'Petición inválida' }, 400);
  }

  const url = new URL(req.url);
  const topic = url.searchParams.get('type') ?? (typeof cuerpo.type === 'string' ? cuerpo.type : null);
  const dataId = url.searchParams.get('data.id') ?? (typeof cuerpo.data?.id === 'string' ? cuerpo.data.id : null);
  if (!topic || !dataId || !TOPICS.has(topic)) return respuesta({ error: 'Tópico o recurso inválido' }, 400);

  const secreto = Deno.env.get('MP_WEBHOOK_SECRET') ?? '';
  const firmaValida = await validarFirmaMercadoPago({
    signature: req.headers.get('x-signature'),
    requestId: req.headers.get('x-request-id'),
    dataId,
    secret: secreto,
  });
  if (!firmaValida) return respuesta({ error: 'Firma inválida' }, 401);

  try {
    const resultado = topic === 'subscription_preapproval'
      ? await procesarPreapproval(await obtenerPreapproval(dataId))
      : await procesarPago(await obtenerPagoAutorizado(dataId));
    const aplicado = await rpc<boolean>('aplicar_evento_mercado_pago', {
      p_topic: topic,
      p_resource_id: dataId.toLowerCase(),
      p_accion: resultado.accion,
      p_user_id: resultado.acceso.user_id,
      p_cambios: resultado.cambios,
      p_evento_pago_en: 'eventoPagoEn' in resultado ? resultado.eventoPagoEn : null,
      p_pago_id: 'pago' in resultado ? resultado.pago.id : null,
      p_debito_en: 'pago' in resultado ? resultado.pago.debitoEn : null,
      p_estado_pago: 'pago' in resultado ? resultado.pago.estado : null,
      p_preapproval_id: 'pago' in resultado ? resultado.pago.preapprovalId : null,
      p_suscripcion_cancelada: 'pago' in resultado ? resultado.pago.suscripcionCancelada : false,
    });
    if (!aplicado) return respuesta({ ok: true, duplicado: true });
    return respuesta({ ok: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    console.error(mensaje);
    return respuesta({ error: e instanceof PeticionInvalida ? mensaje : 'No se pudo procesar la notificación' }, e instanceof PeticionInvalida ? 400 : 500);
  }
});
