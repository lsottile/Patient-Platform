import { useState } from 'react';
import { Link } from 'react-router-dom';
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
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const estado = estadoEfectivo(acceso, ahora);
  let mensaje: string | null = null;
  let accion = '';
  if (estado === 'transicion') {
    mensaje = `Activá tu suscripción preferencial por ${precioArs(acceso.precioArs)} al mes.`;
    accion = 'Activar suscripción';
  } else if (estado === 'gracia' && acceso.graciaHasta) {
    mensaje = `El cobro fue rechazado. Podés usar Kine hasta el ${fechaArgentina(acceso.graciaHasta)}.`;
    accion = 'Regularizar pago';
  } else if (estado === 'cancelada_vigente' && acceso.accesoHasta) {
    mensaje = `La suscripción está cancelada; conservás el acceso hasta el ${fechaArgentina(acceso.accesoHasta)}.`;
    accion = 'Reactivar';
  }
  if (!mensaje) return null;
  return (
    <aside className="aviso-suscripcion aviso aviso--aviso">
      <div className="aviso-suscripcion__contenido">
        <span>{mensaje}</span>
        <label className="casilla-legal casilla-legal--compacta">
          <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} />
          <span>Acepto los <Link to="/terminos">Términos</Link>.</span>
        </label>
        <label className="casilla-legal casilla-legal--compacta">
          <input type="checkbox" checked={aceptaPrivacidad} onChange={(e) => setAceptaPrivacidad(e.target.checked)} />
          <span>Acepto la <Link to="/privacidad">Política de Privacidad</Link>.</span>
        </label>
      </div>
      <button className="boton boton--chico" disabled={!aceptaTerminos || !aceptaPrivacidad} onClick={onPagar}>{accion}</button>
    </aside>
  );
}
