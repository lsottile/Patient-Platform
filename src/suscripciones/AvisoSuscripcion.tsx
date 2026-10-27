import { estadoEfectivo } from './estado';
import type { AccesoComercial } from './tipos';

export const precioArs = (monto: number) => `ARS ${Math.round(monto).toLocaleString('es-AR')}`;

export function fechaArgentina(iso: string): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('day')} de ${valor('month')} de ${valor('year')}, ${valor('hour')}:${valor('minute')}`;
}

export function AvisoSuscripcion({ acceso, ahora, onPagar }: { acceso: AccesoComercial; ahora: Date; onPagar: () => void }) {
  const estado = estadoEfectivo(acceso, ahora);
  if (estado === 'transicion') {
    return (
      <aside className="aviso-suscripcion aviso aviso--aviso">
        <span>Activá tu suscripción preferencial por {precioArs(acceso.precioArs)} al mes.</span>
        <button className="boton boton--chico" onClick={onPagar}>Activar suscripción</button>
      </aside>
    );
  }
  if (estado === 'gracia' && acceso.graciaHasta) {
    return (
      <aside className="aviso-suscripcion aviso aviso--aviso">
        <span>El cobro fue rechazado. Podés usar Kine hasta el {fechaArgentina(acceso.graciaHasta)}.</span>
        <button className="boton boton--chico" onClick={onPagar}>Regularizar pago</button>
      </aside>
    );
  }
  if (estado === 'cancelada_vigente' && acceso.accesoHasta) {
    return (
      <aside className="aviso-suscripcion aviso aviso--aviso">
        <span>La suscripción está cancelada; conservás el acceso hasta el {fechaArgentina(acceso.accesoHasta)}.</span>
        <button className="boton boton--chico" onClick={onPagar}>Reactivar</button>
      </aside>
    );
  }
  return null;
}
