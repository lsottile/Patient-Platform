import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { urlApp } from '../rutaBase';
import { cargarAcceso, crearCheckout } from './api';
import { AvisoSuscripcion } from './AvisoSuscripcion';
import { estadoEfectivo, puedeUsarKine } from './estado';
import { PantallaSuscripcion } from './PantallaSuscripcion';
import type { AccesoComercial } from './tipos';

export interface ContextoAcceso {
  acceso: AccesoComercial;
  aviso: ReactNode;
  recargar: () => Promise<void>;
}

export interface ContextoBloqueo {
  acceso: AccesoComercial;
  onPagar: () => void;
  pagando: boolean;
  error: string | null;
  onSalir: () => void;
}

const MAX_TIMEOUT = 2_147_000_000;

export function demoraHastaLimite(acceso: AccesoComercial, ahora: Date): number | null {
  const valor = acceso.estado === 'gracia' ? acceso.graciaHasta : acceso.estado === 'cancelada' ? acceso.accesoHasta : null;
  if (!valor) return null;
  const limite = Date.parse(valor);
  if (!Number.isFinite(limite)) return null;
  return Math.min(Math.max(0, limite - ahora.getTime()) + 25, MAX_TIMEOUT);
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
  const [pagando, setPagando] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  const recargar = useCallback(async () => {
    try {
      setError(null);
      setAcceso(await cargarAcceso(sb));
      setAhora(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar la suscripción');
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
    if (!acceso) return;
    const demora = demoraHastaLimite(acceso, ahora);
    if (demora === null) return;
    const temporizador = window.setTimeout(() => void recargar(), demora);
    return () => window.clearTimeout(temporizador);
  }, [acceso, ahora, recargar]);

  useEffect(() => {
    const intervalo = window.setInterval(() => void recargar(), 60_000);
    return () => window.clearInterval(intervalo);
  }, [recargar]);

  const pagar = useCallback(async () => {
    try {
      setPagando(true);
      setError(null);
      window.location.assign(await crearCheckout(sb, urlApp()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir Mercado Pago');
      setPagando(false);
    }
  }, [sb]);

  const aviso = useMemo(() => acceso && <AvisoSuscripcion acceso={acceso} ahora={ahora} onPagar={() => void pagar()} />, [acceso, ahora, pagar]);

  if (acceso === undefined) return <div className="cargando">Consultando suscripción…</div>;
  if (!acceso) {
    return (
      <main className="pagina-suscripcion">
        <div className="tarjeta suscripcion-caja">
          <h1>No pudimos consultar tu suscripción</h1>
          {error && <p className="aviso aviso--error">{error}</p>}
          <div className="acciones">
            <button className="boton boton--primario" onClick={() => void recargar()}>Reintentar</button>
            <button className="boton" onClick={onSalir}>Salir</button>
          </div>
        </div>
      </main>
    );
  }

  const estado = estadoEfectivo(acceso, ahora);
  if (puedeUsarKine(acceso, ahora)) return <>{children({ acceso, aviso, recargar })}</>;
  if (estado === 'bloqueada' && renderBloqueada) {
    return <>{renderBloqueada({ acceso, onPagar: () => void pagar(), pagando, error, onSalir })}</>;
  }
  return (
    <PantallaSuscripcion
      acceso={acceso}
      estado={estado === 'pendiente' ? 'pendiente' : 'bloqueada'}
      onPagar={() => void pagar()}
      onSalir={onSalir}
      pagando={pagando}
      error={error}
    />
  );
}
