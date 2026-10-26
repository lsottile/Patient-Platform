import type { AccesoComercial, EstadoEfectivo } from './tipos';

function instante(valor: string | null): number | null {
  if (!valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

export function estadoEfectivo(acceso: AccesoComercial, ahora: Date): EstadoEfectivo {
  if (acceso.modalidad === 'exenta') return 'exenta';

  switch (acceso.estado) {
    case 'pendiente':
      return 'pendiente';
    case 'transicion':
      return 'transicion';
    case 'activa':
      return 'activa';
    case 'gracia': {
      const limite = instante(acceso.graciaHasta);
      return limite !== null && ahora.getTime() < limite ? 'gracia' : 'bloqueada';
    }
    case 'cancelada': {
      const limite = instante(acceso.accesoHasta);
      return limite !== null && ahora.getTime() < limite ? 'cancelada_vigente' : 'bloqueada';
    }
    case 'reintegrada':
      return 'bloqueada';
  }
}

export function puedeUsarKine(acceso: AccesoComercial, ahora: Date): boolean {
  const estado = estadoEfectivo(acceso, ahora);
  return estado !== 'pendiente' && estado !== 'bloqueada';
}

export function puedeExportar(_acceso: AccesoComercial): boolean {
  return true;
}
