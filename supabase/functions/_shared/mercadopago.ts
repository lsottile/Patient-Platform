const API_MERCADO_PAGO = Deno.env.get('MP_API_URL') ?? 'https://api.mercadopago.com';

interface PreapprovalApi {
  id?: unknown;
  init_point?: unknown;
  status?: unknown;
}

export interface PreapprovalCreada {
  id: string;
  initPoint: string;
  status: string;
}

export interface PreapprovalMercadoPago {
  id: string;
  status: string;
  external_reference: string;
  auto_recurring: { transaction_amount: number; currency_id: string };
  next_payment_date?: string | null;
  last_modified?: string | null;
}

export interface PagoAutorizadoMercadoPago {
  id: string;
  status: string;
  preapproval_id: string;
  debit_date: string;
  last_modified?: string | null;
  payment: {
    id: string | number;
    status: string;
    transaction_amount: number;
    currency_id: string;
    date_approved?: string | null;
  };
}

async function obtener<T>(ruta: string, validar: (valor: unknown) => valor is T): Promise<T> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago no está configurado');
  const r = await fetch(`${API_MERCADO_PAGO}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Mercado Pago no permitió consultar el recurso (${r.status})`);
  const cuerpo: unknown = await r.json();
  if (!validar(cuerpo)) throw new Error('Mercado Pago devolvió un recurso inválido');
  return cuerpo;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null;

function esPreapproval(valor: unknown): valor is PreapprovalMercadoPago {
  if (!esObjeto(valor) || !esObjeto(valor.auto_recurring)) return false;
  return (
    typeof valor.id === 'string' &&
    typeof valor.status === 'string' &&
    typeof valor.external_reference === 'string' &&
    typeof valor.auto_recurring.transaction_amount === 'number' &&
    typeof valor.auto_recurring.currency_id === 'string'
  );
}

function esPagoAutorizado(valor: unknown): valor is PagoAutorizadoMercadoPago {
  if (!esObjeto(valor) || !esObjeto(valor.payment)) return false;
  return (
    typeof valor.id === 'string' &&
    typeof valor.status === 'string' &&
    typeof valor.preapproval_id === 'string' &&
    typeof valor.debit_date === 'string' &&
    (typeof valor.payment.id === 'string' || typeof valor.payment.id === 'number') &&
    typeof valor.payment.status === 'string' &&
    typeof valor.payment.transaction_amount === 'number' &&
    typeof valor.payment.currency_id === 'string'
  );
}

export const obtenerPreapproval = (id: string) =>
  obtener(`/preapproval/${encodeURIComponent(id)}`, esPreapproval);

export const obtenerPagoAutorizado = (id: string) =>
  obtener(`/authorized_payments/${encodeURIComponent(id)}`, esPagoAutorizado);

export async function crearPreapproval(input: {
  userId: string;
  email: string;
  amount: number;
  backUrl: string;
}): Promise<PreapprovalCreada> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago no está configurado');

  const r = await fetch(`${API_MERCADO_PAGO}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.userId,
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      reason: 'Kine — suscripción mensual',
      external_reference: input.userId,
      payer_email: input.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: input.amount,
        currency_id: 'ARS',
      },
      back_url: input.backUrl,
      status: 'pending',
    }),
  });
  if (!r.ok) throw new Error(`Mercado Pago rechazó la suscripción (${r.status})`);

  const cuerpo = (await r.json()) as PreapprovalApi;
  if (typeof cuerpo.id !== 'string' || typeof cuerpo.init_point !== 'string' || cuerpo.status !== 'pending') {
    throw new Error('Mercado Pago devolvió una suscripción inválida');
  }
  return { id: cuerpo.id, initPoint: cuerpo.init_point, status: cuerpo.status };
}
