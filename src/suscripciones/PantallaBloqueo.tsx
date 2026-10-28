import { PieLegal } from '../components/PieLegal';
import { SeccionRespaldo } from '../components/SeccionRespaldo';
import { DatosProvider } from '../data/DatosContext';
import type { Repositorio } from '../data/repositorio';
import type { AccesoComercial } from './tipos';

export function PantallaBloqueo({
  repositorio,
  email,
  onSalir,
}: {
  acceso: AccesoComercial;
  repositorio: Repositorio;
  email?: string;
  onSalir: () => void;
}) {
  return (
    <DatosProvider repositorio={repositorio} soloLectura>
      <div className="pagina-bloqueo">
        <main className="bloqueo-contenido">
          <section className="tarjeta pila">
            <p className="documento-legal__marca">Kine</p>
            <h1>Pago mensual pendiente</h1>
            {email && <p className="tenue">Cuenta: {email}</p>}
            <p>
              Para informar el pago y recuperar el acceso, escribí a{' '}
              <a href="mailto:lucianodsottile@gmail.com">lucianodsottile@gmail.com</a>.
            </p>
            <div className="acciones acciones--izq">
              <button className="boton" onClick={onSalir}>Salir</button>
            </div>
          </section>

          <div className="aviso aviso--aviso">
            <strong>Este respaldo contiene datos clínicos sensibles.</strong> La Ley 26.529 exige conservar la historia clínica
            durante al menos diez años desde la última actuación. Descargá la copia y custodiala de forma segura.
          </div>
          <SeccionRespaldo soloExportar />
        </main>
        <PieLegal />
      </div>
    </DatosProvider>
  );
}
