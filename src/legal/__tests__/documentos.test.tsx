import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PieLegal } from '../../components/PieLegal';
import { PrivacidadPage } from '../../pages/PrivacidadPage';
import { TerminosPage } from '../../pages/TerminosPage';
import { VERSION_PRIVACIDAD, VERSION_TERMINOS } from '../versiones';

const render = (contenido: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{contenido}</MemoryRouter>);

describe('documentos legales públicos', () => {
  it('publica términos versionados con cobro manual, soporte y conservación clínica', () => {
    const html = render(<TerminosPage />);

    expect(VERSION_TERMINOS).toBe('2026-10-28');
    expect(html).toContain('Luciano Sottile');
    expect(html).toContain('20-41197971-8');
    expect(html).toContain('Corrientes 886');
    expect(html).toContain('Azul');
    expect(html).toContain('7300');
    expect(html).toContain('lucianodsottile@gmail.com');
    expect(html).toMatch(/tres días hábiles/i);
    expect(html).toMatch(/cinco días hábiles/i);
    expect(html).toMatch(/pago.*por fuera de Kine/i);
    expect(html).toMatch(/días 1 al 10/i);
    expect(html).toMatch(/día 11/i);
    expect(html).toMatch(/Kine no procesa pagos/i);
    expect(html).toMatch(/14 días corridos/i);
    expect(html).toMatch(/falta de pago no provoca la eliminación automática/i);
    expect(html).toMatch(/diez años/i);
    expect(html).toContain('Ley 26.529');
  });

  it('publica una política versionada con proveedores, transferencia y derechos argentinos', () => {
    const html = render(<PrivacidadPage />);

    expect(VERSION_PRIVACIDAD).toBe('2026-10-28');
    expect(html).toContain('Ley 25.326');
    expect(html).toContain('GitHub Pages');
    expect(html).toContain('Supabase');
    expect(html).toContain('Mercado Pago');
    expect(html).toMatch(/identificadores históricos de Mercado Pago/i);
    expect(html).toMatch(/pagos manuales/i);
    expect(html).toMatch(/falta de pago no programa.*eliminación/i);
    expect(html).toContain('Google');
    expect(html).toContain('São Paulo');
    expect(html).toContain('Agencia de Acceso a la Información Pública');
    expect(html).toMatch(/acceso, rectificación y supresión/i);
    expect(html).toMatch(/no reemplaza las obligaciones/i);
  });

  it('ofrece términos, privacidad, fuente AGPL y aviso sanitario desde el pie común', () => {
    const html = render(<PieLegal compacto />);

    expect(html).toContain('href="/terminos"');
    expect(html).toContain('href="/privacidad"');
    expect(html).toContain('https://github.com/lsottile/Patient-Platform');
    expect(html).toContain('AGPL-3.0');
    expect(html).toMatch(/no es un dispositivo médico/i);
  });
});
