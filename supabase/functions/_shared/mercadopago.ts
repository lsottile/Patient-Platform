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
