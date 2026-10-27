import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AvisoSuscripcion } from '../AvisoSuscripcion';
import { estadoEfectivo } from '../estado';
import { PantallaSuscripcion } from '../PantallaSuscripcion';
import { demoraHastaLimite } from '../AccesoComercial';
import type { AccesoComercial, EstadoComercial, ModalidadComercial } from '../tipos';

const acceso = (
  estado: EstadoComercial,
  cambios: Partial<AccesoComercial> = {},
  modalidad: ModalidadComercial = 'general',
): AccesoComercial => ({
  modalidad,
  precioArs: modalidad === 'preferencial' ? 15_000 : modalidad === 'exenta' ? 0 : 50_000,
  estado,
  accesoHasta: null,
  graciaHasta: null,
  eliminarDespuesDe: null,
  terminosAceptadosVersion: null,
  privacidadAceptadaVersion: null,
  aceptadoEn: null,
  ...cambios,
});

const render = (contenido: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{contenido}</MemoryRouter>);
const nada = () => undefined;

describe('presentación del acceso comercial', () => {
  it('una cuenta pendiente muestra ARS 50.000 y exige ambas aceptaciones sin navegación clínica', () => {
    const html = render(
      <PantallaSuscripcion acceso={acceso('pendiente')} estado="pendiente" onPagar={nada} onSalir={nada} />,
    );

    expect(html).toContain('ARS 50.000');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Términos de Servicio');
    expect(html).toContain('Política de Privacidad');
    expect(html).not.toContain('Pacientes');
    expect(html).not.toContain('Agenda');
  });

  it('la transición conserva la aplicación y ofrece el precio preferencial', () => {
    const html = render(<AvisoSuscripcion acceso={acceso('transicion', {}, 'preferencial')} ahora={new Date()} onPagar={nada} />);

    expect(html).toContain('ARS 15.000');
    expect(html).toContain('Activar suscripción');
    expect((html.match(/type="checkbox"/g) ?? [])).toHaveLength(2);
    expect(html).toContain('disabled=""');
  });

  it('la gracia informa la fecha y hora argentina exactas de bloqueo', () => {
    const html = render(
      <AvisoSuscripcion
        acceso={acceso('gracia', { graciaHasta: '2026-11-10T15:00:00.000Z' })}
        ahora={new Date('2026-11-10T14:00:00.000Z')}
        onPagar={nada}
      />,
    );

    expect(html).toContain('10 de noviembre de 2026, 12:00');
    expect(html).toContain('Regularizar pago');
  });

  it('la cancelación vigente informa cuándo termina el acceso', () => {
    const html = render(
      <AvisoSuscripcion
        acceso={acceso('cancelada', { accesoHasta: '2026-12-01T03:00:00.000Z' })}
        ahora={new Date('2026-11-01T00:00:00.000Z')}
        onPagar={nada}
      />,
    );

    expect(html).toContain('1 de diciembre de 2026, 00:00');
    expect(html).toMatch(/acceso.*hasta/i);
  });

  it('una cuenta bloqueada solo ofrece pago, respaldo y salida', () => {
    const cuenta = acceso('gracia', { graciaHasta: '2026-11-10T15:00:00.000Z' });
    const html = render(
      <PantallaSuscripcion acceso={cuenta} estado="bloqueada" onPagar={nada} onExportar={nada} onSalir={nada} />,
    );

    expect(html).toContain('Regularizar pago');
    expect(html).toContain('Descargar respaldo completo');
    expect(html).toContain('Salir');
    expect(html).not.toContain('Pacientes');
  });

  it('una cuenta exenta no muestra avisos de cobro', () => {
    const html = render(<AvisoSuscripcion acceso={acceso('pendiente', {}, 'exenta')} ahora={new Date()} onPagar={nada} />);
    expect(html).toBe('');
  });

  it('los parámetros de retorno no pueden convertir una cuenta pendiente en activa', () => {
    const retornoManipulado = new URL('https://kine.example/?status=approved&payment_id=falso');
    expect(retornoManipulado.searchParams.get('status')).toBe('approved');
    expect(estadoEfectivo(acceso('pendiente'), new Date())).toBe('pendiente');
  });

  it('programa una actualización exactamente al vencer la gracia o el período cancelado', () => {
    const ahora = new Date('2026-11-10T12:00:00.000Z');
    expect(demoraHastaLimite(acceso('gracia', { graciaHasta: '2026-11-10T13:00:00.000Z' }), ahora)).toBe(3_600_025);
    expect(demoraHastaLimite(acceso('cancelada', { accesoHasta: '2026-11-10T12:00:01.000Z' }), ahora)).toBe(1_025);
    expect(demoraHastaLimite(acceso('activa'), ahora)).toBeNull();
  });
});
