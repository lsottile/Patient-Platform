export type ModalidadComercial = 'general' | 'preferencial' | 'exenta';

export type EstadoComercial = 'pendiente' | 'transicion' | 'activa' | 'gracia' | 'cancelada' | 'reintegrada';

export type EstadoEfectivo = 'pendiente' | 'transicion' | 'activa' | 'gracia' | 'cancelada_vigente' | 'bloqueada' | 'exenta';

/** Vista pública del acceso propio; excluye identificadores internos de Mercado Pago. */
export interface AccesoComercial {
  modalidad: ModalidadComercial;
  precioArs: number;
  estado: EstadoComercial;
  accesoHasta: string | null;
  graciaHasta: string | null;
  eliminarDespuesDe: string | null;
  terminosAceptadosVersion: string | null;
  privacidadAceptadaVersion: string | null;
  aceptadoEn: string | null;
}
