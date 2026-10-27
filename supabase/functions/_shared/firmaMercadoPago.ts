const texto = new TextEncoder();

function bytesHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g)!.map((par) => Number.parseInt(par, 16)));
}

function igualesConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

export async function validarFirmaMercadoPago(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs?: number;
}): Promise<boolean> {
  if (!input.signature || !input.requestId || !input.dataId || !input.secret) return false;
  const partes = new Map(
    input.signature
      .split(',')
      .map((parte) => parte.trim().split('=', 2) as [string, string])
      .filter(([clave, valor]) => Boolean(clave && valor)),
  );
  const ts = partes.get('ts');
  const firma = partes.get('v1');
  if (!ts || !firma || !/^\d+$/.test(ts)) return false;

  const instante = Number(ts) * 1000;
  if (!Number.isFinite(instante) || Math.abs((input.nowMs ?? Date.now()) - instante) > 300_000) return false;
  const esperada = bytesHex(firma);
  if (!esperada) return false;

  const clave = await crypto.subtle.importKey('raw', texto.encode(input.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const manifiesto = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${ts};`;
  const calculada = new Uint8Array(await crypto.subtle.sign('HMAC', clave, texto.encode(manifiesto)));
  return igualesConstante(calculada, esperada);
}
