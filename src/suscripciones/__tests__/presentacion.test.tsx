import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RepositorioLocal } from '../../data/repositorioLocal';
import { AvisoPagoManual } from '../AvisoPagoManual';
import { PantallaBloqueo } from '../PantallaBloqueo';
import type { AccesoComercial, EstadoCobroManual } from '../tipos';

const acceso = (estadoCobroManual: EstadoCobroManual): AccesoComercial => ({
  modalidad: estadoCobroManual === 'exenta' ? 'exenta' : 'general',
  precioArs: estadoCobroManual === 'exenta' ? 0 : 50_000,
  estado: 'activa',
  accesoHasta: null,
  graciaHasta: null,
  eliminarDespuesDe: null,
  terminosAceptadosVersion: null,
  privacidadAceptadaVersion: null,
  aceptadoEn: null,
  estadoCobroManual,
  periodoCobroActual: '2026-11-01',
  ultimoPeriodoPagado: null,
});

const render = (contenido: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{contenido}</MemoryRouter>);

describe('presentación del cobro manual', () => {
  it.each([
    ['aviso_verde', 'aviso--ok'],
    ['aviso_amarillo', 'aviso--aviso'],
    ['aviso_rojo', 'aviso--error'],
  ] as const)('%s muestra el recordatorio con su color y sin medio de pago', (estado, clase) => {
    const html = render(<AvisoPagoManual estado={estado} />);

    expect(html).toContain('Pago mensual pendiente');
    expect(html).toContain(clase);
    expect(html).not.toContain('ARS');
    expect(html).not.toContain('Mercado Pago');
    expect(html).not.toContain('button');
  });

  it.each(['exenta', 'al_dia', 'bloqueada'] as const)('%s no muestra el recordatorio superior', (estado) => {
    expect(render(<AvisoPagoManual estado={estado} />)).toBe('');
  });

  it('la pantalla bloqueada conserva soporte, respaldo y salida sin checkout', () => {
    const html = render(
      <PantallaBloqueo
        acceso={acceso('bloqueada')}
        repositorio={new RepositorioLocal()}
        email="profesional@example.com"
        onSalir={() => undefined}
      />,
    );

    expect(html).toContain('Pago mensual pendiente');
    expect(html).toContain('lucianodsottile@gmail.com');
    expect(html).toContain('Descargar respaldo completo');
    expect(html).toContain('Salir');
    expect(html).not.toContain('ARS');
    expect(html).not.toContain('Mercado Pago');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Regularizar pago');
  });
});
