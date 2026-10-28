import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cargarAcceso } from './api';
import { AvisoPagoManual } from './AvisoPagoManual';
import { puedeUsarKine } from './estado';
import type { AccesoComercial } from './tipos';

export interface ContextoAcceso {
  acceso: AccesoComercial;
  aviso: ReactNode;
  recargar: () => Promise<void>;
}

export interface ContextoBloqueo {
  acceso: AccesoComercial;
  onSalir: () => void;
}

export function AccesoComercialGate({
  sb,
  onSalir,
  children,
  renderBloqueada,
}: {
  sb: SupabaseClient;
  onSalir: () => void;
  children: (contexto: ContextoAcceso) => ReactNode;
  renderBloqueada?: (contexto: ContextoBloqueo) => ReactNode;
}) {
  const [acceso, setAcceso] = useState<AccesoComercial | null>();
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setError(null);
      setAcceso(await cargarAcceso(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el pago mensual');
      setAcceso(null);
    }
  }, [sb]);

  useEffect(() => {
    void recargar();
    const alRecuperarFoco = () => void recargar();
    window.addEventListener('focus', alRecuperarFoco);
    return () => window.removeEventListener('focus', alRecuperarFoco);
  }, [recargar]);

  useEffect(() => {
    const intervalo = window.setInterval(() => void recargar(), 60_000);
    return () => window.clearInterval(intervalo);
  }, [recargar]);

  const aviso = useMemo(
    () => acceso && <AvisoPagoManual estado={acceso.estadoCobroManual} />,
    [acceso],
  );

  if (acceso === undefined) return <div className="cargando">Consultando acceso…</div>;
  if (!acceso) {
    return (
      <main className="pagina-suscripcion">
        <div className="tarjeta suscripcion-caja">
          <h1>No pudimos consultar tu acceso</h1>
          {error && <p className="aviso aviso--error">{error}</p>}
          <div className="acciones">
            <button className="boton boton--primario" onClick={() => void recargar()}>Reintentar</button>
            <button className="boton" onClick={onSalir}>Salir</button>
          </div>
        </div>
      </main>
    );
  }

  if (puedeUsarKine(acceso)) return <>{children({ acceso, aviso, recargar })}</>;
  if (renderBloqueada) return <>{renderBloqueada({ acceso, onSalir })}</>;
  return (
    <main className="pagina-suscripcion">
      <div className="tarjeta suscripcion-caja">
        <h1>Pago mensual pendiente</h1>
        <button className="boton" onClick={onSalir}>Salir</button>
      </div>
    </main>
  );
}
