import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PieLegal } from '../components/PieLegal';
import { precioArs } from './AvisoSuscripcion';
import type { AccesoComercial, EstadoEfectivo } from './tipos';

export function PantallaSuscripcion({
  acceso,
  estado,
  onPagar,
  onExportar,
  onSalir,
  pagando = false,
  error,
}: {
  acceso: AccesoComercial;
  estado: Extract<EstadoEfectivo, 'pendiente' | 'bloqueada'>;
  onPagar: () => void;
  onExportar?: () => void;
  onSalir: () => void;
  pagando?: boolean;
  error?: string | null;
}) {
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const bloqueada = estado === 'bloqueada';

  return (
    <div className="pagina-suscripcion">
      <main className="tarjeta suscripcion-caja">
        <p className="documento-legal__marca">Kine</p>
        <h1>{bloqueada ? 'Acceso temporalmente bloqueado' : 'Activá tu suscripción'}</h1>
        <p>
          {bloqueada
            ? 'Para volver a trabajar, regularizá el pago. Tus datos siguen disponibles para descargar un respaldo completo.'
            : 'El primer pago debe confirmarse antes de acceder a las fichas clínicas.'}
        </p>
        <p className="suscripcion-precio"><strong>{precioArs(acceso.precioArs)}</strong> por mes</p>
        <label className="casilla-legal">
          <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} />
          <span>Acepto los <Link to="/terminos">Términos de Servicio</Link>.</span>
        </label>
        <label className="casilla-legal">
          <input type="checkbox" checked={aceptaPrivacidad} onChange={(e) => setAceptaPrivacidad(e.target.checked)} />
          <span>Acepto la <Link to="/privacidad">Política de Privacidad</Link>.</span>
        </label>
        {error && <p className="aviso aviso--error">{error}</p>}
        <div className="acciones suscripcion-acciones">
          <button className="boton boton--primario" disabled={!aceptaTerminos || !aceptaPrivacidad || pagando} onClick={onPagar}>
            {pagando ? 'Abriendo Mercado Pago…' : bloqueada ? 'Regularizar pago' : 'Ir a Mercado Pago'}
          </button>
          {bloqueada && (
            <button className="boton" disabled={!onExportar} onClick={onExportar}>
              Descargar respaldo completo
            </button>
          )}
          <button className="boton boton--secundario" onClick={onSalir}>Salir</button>
        </div>
      </main>
      <PieLegal compacto />
    </div>
  );
}
