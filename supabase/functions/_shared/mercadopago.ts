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
  last_modified: string;
  transaction_amount: number;
  currency_id: string;
  payment: {
    id: string;
    status: string;
  };
}

async function obtener<T>(ruta: string, convertir: (valor: unknown) => T | null): Promise<T> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago no está configurado');
  const r = await fetch(`${API_MERCADO_PAGO}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Mercado Pago no permitió consultar el recurso (${r.status})`);
  const cuerpo: unknown = await r.json();
  const convertido = convertir(cuerpo);
  if (!convertido) throw new Error('Mercado Pago devolvió un recurso inválido');
  return convertido;
}

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null;
const idTexto = (valor: unknown) => (typeof valor === 'string' || typeof valor === 'number' ? String(valor) : null);
const numero = (valor: unknown) => {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
};

function convertirPreapproval(valor: unknown): PreapprovalMercadoPago | null {
  if (!esObjeto(valor) || !esObjeto(valor.auto_recurring)) return null;
  const id = idTexto(valor.id);
  const monto = numero(valor.auto_recurring.transaction_amount);
  if (!id || monto === null || typeof valor.status !== 'string' || typeof valor.external_reference !== 'string' || typeof valor.auto_recurring.currency_id !== 'string') return null;
  return {
    id,
    status: valor.status,
    external_reference: valor.external_reference,
    auto_recurring: { transaction_amount: monto, currency_id: valor.auto_recurring.currency_id },
    next_payment_date: typeof valor.next_payment_date === 'string' ? valor.next_payment_date : null,
    last_modified: typeof valor.last_modified === 'string' ? valor.last_modified : null,
  };
}

function convertirPagoAutorizado(valor: unknown): PagoAutorizadoMercadoPago | null {
  if (!esObjeto(valor) || !esObjeto(valor.payment)) return null;
  const id = idTexto(valor.id);
  const pagoId = idTexto(valor.payment.id);
  const monto = numero(valor.transaction_amount);
  if (!id || !pagoId || monto === null || typeof valor.status !== 'string' || typeof valor.preapproval_id !== 'string' || typeof valor.debit_date !== 'string' || typeof valor.last_modified !== 'string' || typeof valor.currency_id !== 'string' || typeof valor.payment.status !== 'string') return null;
  return {
    id,
    status: valor.status,
    preapproval_id: valor.preapproval_id,
    debit_date: valor.debit_date,
    last_modified: valor.last_modified,
    transaction_amount: monto,
    currency_id: valor.currency_id,
    payment: { id: pagoId, status: valor.payment.status },
  };
}

export const obtenerPreapproval = (id: string) =>
  obtener(`/preapproval/${encodeURIComponent(id)}`, convertirPreapproval);

export const obtenerPagoAutorizado = (id: string) =>
  obtener(`/authorized_payments/${encodeURIComponent(id)}`, convertirPagoAutorizado);

export async function crearPreapproval(input: {
  userId: string;
  email: string;
  amount: number;
  backUrl: string;
  idempotencyKey: string;
}): Promise<PreapprovalCreada> {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago no está configurado');

  const r = await fetch(`${API_MERCADO_PAGO}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': input.idempotencyKey,
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
