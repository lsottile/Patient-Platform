import { Link } from 'react-router-dom';

/** Repositorio de esta versión. Las instalaciones modificadas deben reemplazarlo con VITE_URL_CODIGO. */
const URL_CODIGO =
  (import.meta.env.VITE_URL_CODIGO as string | undefined) || 'https://github.com/lsottile/Patient-Platform';

export function PieLegal({ compacto = false }: { compacto?: boolean }) {
  return (
    <footer className={`pie no-imprimir${compacto ? ' pie--compacto' : ''}`}>
      <nav className="pie__enlaces" aria-label="Información legal">
        <Link to="/terminos">Términos</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacidad">Privacidad</Link>
        <span aria-hidden="true">·</span>
        <a href={URL_CODIGO} target="_blank" rel="noreferrer">
          Código fuente
        </a>
      </nav>
      <p>Licencia AGPL-3.0 · Kine no es un dispositivo médico: el criterio clínico es responsabilidad del profesional.</p>
    </footer>
  );
}
