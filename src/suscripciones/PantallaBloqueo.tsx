import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PieLegal } from '../components/PieLegal';
import { SeccionRespaldo } from '../components/SeccionRespaldo';
import { DatosProvider } from '../data/DatosContext';
import type { Repositorio } from '../data/repositorio';
import { fechaArgentina, precioArs } from './AvisoSuscripcion';
import type { AccesoComercial } from './tipos';

export function PantallaBloqueo({
  acceso,
  repositorio,
  email,
  onPagar,
  onSalir,
  pagando = false,
  error,
}: {
  acceso: AccesoComercial;
  repositorio: Repositorio;
  email?: string;
  onPagar: () => void;
  onSalir: () => void;
  pagando?: boolean;
  error?: string | null;
}) {
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  return (
    <DatosProvider repositorio={repositorio} soloLectura>
      <div className="pagina-bloqueo">
        <main className="bloqueo-contenido">
          <section className="tarjeta pila">
            <p className="documento-legal__marca">Kine</p>
            <h1>Acceso temporalmente bloqueado</h1>
            {email && <p className="tenue">Cuenta: {email}</p>}
            <p>Regularizá la suscripción por {precioArs(acceso.precioArs)} al mes para volver a trabajar.</p>
            <label className="casilla-legal">
              <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} />
              <span>Acepto los <Link to="/terminos">Términos de Servicio</Link>.</span>
            </label>
            <label className="casilla-legal">
              <input type="checkbox" checked={aceptaPrivacidad} onChange={(e) => setAceptaPrivacidad(e.target.checked)} />
              <span>Acepto la <Link to="/privacidad">Política de Privacidad</Link>.</span>
            </label>
            {error && <p className="aviso aviso--error">{error}</p>}
            <div className="acciones acciones--izq">
              <button className="boton boton--primario" disabled={!aceptaTerminos || !aceptaPrivacidad || pagando} onClick={onPagar}>
                {pagando ? 'Abriendo Mercado Pago…' : 'Regularizar pago'}
              </button>
              <button className="boton" onClick={onSalir}>Salir</button>
            </div>
          </section>

          <div className="aviso aviso--aviso">
            <strong>Este respaldo contiene datos clínicos sensibles.</strong> La Ley 26.529 exige conservar la historia clínica
            durante al menos diez años desde la última actuación. Descargá la copia y custodiala de forma segura.
          </div>
          {acceso.eliminarDespuesDe && (
            <p>
              La copia alojada en Kine se eliminará automáticamente el <strong>{fechaArgentina(acceso.eliminarDespuesDe)}</strong>.
              Para solicitar eliminación anticipada, escribí a{' '}
              <a href="mailto:lucianodsottile@gmail.com">lucianodsottile@gmail.com</a>.
            </p>
          )}
          <SeccionRespaldo soloExportar />
        </main>
        <PieLegal />
      </div>
    </DatosProvider>
  );
}
