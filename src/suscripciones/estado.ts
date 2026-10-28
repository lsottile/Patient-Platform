import type { AccesoComercial, EstadoEfectivo } from './tipos';

export function estadoEfectivo(acceso: AccesoComercial, _ahora?: Date): EstadoEfectivo {
  if (acceso.estadoCobroManual === 'exenta') return 'exenta';
  if (acceso.estadoCobroManual === 'bloqueada') return 'bloqueada';
  return 'activa';
}

export function puedeUsarKine(acceso: AccesoComercial, _ahora?: Date): boolean {
  return acceso.estadoCobroManual !== 'bloqueada';
}

export function puedeExportar(_acceso: AccesoComercial): boolean {
  return true;
}
