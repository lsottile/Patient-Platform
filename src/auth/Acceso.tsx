import type { Session } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../data/supabase';
import { recurso, urlApp } from '../rutaBase';
import { PieLegal } from '../components/PieLegal';

/** Exige sesión iniciada cuando Supabase está configurado. */
export function Acceso({ children }: { children: (sesion: Session) => ReactNode }) {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (sesion === undefined) return <div className="cargando">Cargando…</div>;
  if (!sesion) return <PantallaIngreso />;
  return <>{children(sesion)}</>;
}

function PantallaIngreso() {
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const conGoogle = async () => {
    setError('');
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: urlApp() },
    });
    if (error) setError(error.message);
  };

  const conEnlace = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: urlApp(), shouldCreateUser: true },
    });
    if (error) setError(error.message);
    else setMensaje(`Te enviamos un enlace de acceso a ${email}. Revisa tu correo.`);
  };

  return (
    <main className="ingreso-app">
      <div className="tarjeta ingreso-app__caja">
        <img src={recurso('favicon.svg')} alt="" width={48} height={48} />
        <h1>Ficha kinesiológica</h1>
        <p className="tenue">Ingresa para acceder a tus pacientes.</p>
        <button className="boton boton--primario boton--ancho" onClick={conGoogle}>
          Continuar con Google
        </button>
        <div className="separador">o</div>
        <form onSubmit={conEnlace} className="pila">
          <input
            type="email"
            required
            placeholder="tu@correo.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Correo electrónico"
          />
          <button className="boton boton--ancho" type="submit">
            Recibir enlace por correo
          </button>
        </form>
        {mensaje && <p className="aviso aviso--ok">{mensaje}</p>}
        {error && <p className="aviso aviso--error">{error}</p>}
      </div>
      <PieLegal compacto />
    </main>
  );
}
