import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SeccionRespaldo } from '../../components/SeccionRespaldo';
import { DatosProvider } from '../../data/DatosContext';
import { baseVacia, type Repositorio } from '../../data/repositorio';
import { PantallaBloqueo } from '../PantallaBloqueo';
import type { AccesoComercial } from '../tipos';

const repositorio: Repositorio = {
  nombre: 'supabase',
  semillaIds: 'usuario:',
  cargarTodo: async () => baseVacia(),
  guardar: async () => undefined,
  guardarVarios: async () => undefined,
  eliminar: async () => undefined,
  subirArchivo: async () => '',
  leerArchivo: async () => new Blob(),
  eliminarArchivos: async () => undefined,
};

const acceso: AccesoComercial = {
  modalidad: 'general',
  precioArs: 50_000,
  estado: 'reintegrada',
  accesoHasta: '2026-11-01T00:00:00.000Z',
  graciaHasta: null,
  eliminarDespuesDe: '2027-11-01T03:00:00.000Z',
  terminosAceptadosVersion: '2026-10-26',
  privacidadAceptadaVersion: '2026-10-26',
  aceptadoEn: '2026-10-26T00:00:00.000Z',
  estadoCobroManual: 'bloqueada',
  periodoCobroActual: '2026-11-01',
  ultimoPeriodoPagado: null,
  proximaRevisionEn: '2026-12-01T03:00:00.000Z',
};

const render = (contenido: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{contenido}</MemoryRouter>);

describe('salida de datos para cuentas bloqueadas', () => {
  it('el modo solo exportar oculta JSON, importación y esquema', () => {
    const html = render(
      <DatosProvider repositorio={repositorio} soloLectura>
        <SeccionRespaldo soloExportar />
      </DatosProvider>,
    );

    expect(html).toContain('Descargar respaldo completo');
    expect(html).not.toContain('Solo datos');
    expect(html).not.toContain('Importar respaldo');
    expect(html).not.toContain('JSON Schema');
  });

  it('el bloqueo ignora marcas históricas de eliminación y conserva las únicas acciones permitidas', () => {
    const html = render(
      <PantallaBloqueo
        acceso={acceso}
        repositorio={repositorio}
        email="profesional@example.com"
        onSalir={() => undefined}
      />,
    );

    expect(html).not.toMatch(/eliminará automáticamente/i);
    expect(html).not.toContain('1 de noviembre de 2027');
    expect(html).toMatch(/datos clínicos sensibles/i);
    expect(html).toMatch(/diez años/i);
    expect(html).toContain('lucianodsottile@gmail.com');
    expect(html).toContain('Pago mensual pendiente');
    expect(html).toContain('Descargar respaldo completo');
    expect(html).toContain('Salir');
    expect(html).not.toContain('Regularizar pago');
    expect(html).not.toContain('Mercado Pago');
    expect(html).not.toContain('Pacientes');
    expect(html).not.toContain('Importar respaldo');
  });
});
