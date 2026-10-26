import { describe, expect, it } from 'vitest';
import { estadoEfectivo, puedeExportar, puedeUsarKine } from '../estado';
import type { AccesoComercial, EstadoComercial, ModalidadComercial } from '../tipos';

const AHORA = new Date('2026-11-10T12:00:00.000Z');

const acceso = (
  estado: EstadoComercial,
  cambios: Partial<AccesoComercial> = {},
  modalidad: ModalidadComercial = 'general',
): AccesoComercial => ({
  modalidad,
  precioArs: modalidad === 'preferencial' ? 15_000 : 50_000,
  estado,
  accesoHasta: null,
  graciaHasta: null,
  eliminarDespuesDe: null,
  terminosAceptadosVersion: null,
  privacidadAceptadaVersion: null,
  aceptadoEn: null,
  ...cambios,
});

describe('estado comercial efectivo', () => {
  it.each([
    ['pendiente', acceso('pendiente'), 'pendiente', false],
    ['transición', acceso('transicion'), 'transicion', true],
    ['activa', acceso('activa'), 'activa', true],
    ['reintegrada', acceso('reintegrada'), 'bloqueada', false],
    ['exenta', acceso('pendiente', {}, 'exenta'), 'exenta', true],
  ] as const)('%s se resuelve como %s', (_nombre, cuenta, esperado, habilitada) => {
    expect(estadoEfectivo(cuenta, AHORA)).toBe(esperado);
    expect(puedeUsarKine(cuenta, AHORA)).toBe(habilitada);
  });

  it('mantiene la gracia un milisegundo antes y bloquea exactamente al vencer', () => {
    const cuenta = acceso('gracia', { graciaHasta: AHORA.toISOString() });

    expect(estadoEfectivo(cuenta, new Date(AHORA.getTime() - 1))).toBe('gracia');
    expect(estadoEfectivo(cuenta, AHORA)).toBe('bloqueada');
  });

  it('mantiene una cancelación hasta el último milisegundo y bloquea en la frontera', () => {
    const cuenta = acceso('cancelada', { accesoHasta: AHORA.toISOString() });

    expect(estadoEfectivo(cuenta, new Date(AHORA.getTime() - 1))).toBe('cancelada_vigente');
    expect(estadoEfectivo(cuenta, AHORA)).toBe('bloqueada');
  });

  it('bloquea de forma segura si falta o es inválida una fecha necesaria', () => {
    expect(estadoEfectivo(acceso('gracia'), AHORA)).toBe('bloqueada');
    expect(estadoEfectivo(acceso('cancelada', { accesoHasta: 'sin-fecha' }), AHORA)).toBe('bloqueada');
  });

  it('una reactivación ignora plazos anteriores de gracia, cancelación y eliminación', () => {
    const reactivada = acceso('activa', {
      graciaHasta: '2026-01-01T00:00:00.000Z',
      accesoHasta: '2026-01-01T00:00:00.000Z',
      eliminarDespuesDe: '2026-01-01T00:00:00.000Z',
    });

    expect(estadoEfectivo(reactivada, AHORA)).toBe('activa');
    expect(puedeUsarKine(reactivada, AHORA)).toBe(true);
  });

  it('permite exportar en cualquier estado mientras la cuenta existe', () => {
    const estados: EstadoComercial[] = ['pendiente', 'transicion', 'activa', 'gracia', 'cancelada', 'reintegrada'];

    for (const estado of estados) expect(puedeExportar(acceso(estado))).toBe(true);
  });
});
