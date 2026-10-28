import type { EstadoCobroManual } from './tipos';

const CLASE: Partial<Record<EstadoCobroManual, string>> = {
  aviso_verde: 'aviso--ok',
  aviso_amarillo: 'aviso--aviso',
  aviso_rojo: 'aviso--error',
};

export function AvisoPagoManual({ estado }: { estado: EstadoCobroManual }) {
  const clase = CLASE[estado];
  if (!clase) return null;
  return <aside className={`aviso ${clase}`}><strong>Pago mensual pendiente</strong></aside>;
}
