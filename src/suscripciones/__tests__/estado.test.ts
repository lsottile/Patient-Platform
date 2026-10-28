import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { cargarAcceso } from '../api';
import { estadoEfectivo, puedeExportar, puedeUsarKine } from '../estado';
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
  ultimoPeriodoPagado: estadoCobroManual === 'al_dia' ? '2026-11-01' : null,
});

describe('estado comercial efectivo', () => {
  it.each([
    ['exenta', true],
    ['al_dia', true],
    ['aviso_verde', true],
    ['aviso_amarillo', true],
    ['aviso_rojo', true],
    ['bloqueada', false],
  ] as const)('%s usa la decisión del servidor', (estado, habilitada) => {
    const cuenta = acceso(estado);
    expect(puedeUsarKine(cuenta, new Date('2030-01-01T00:00:00Z'))).toBe(habilitada);
    expect(estadoEfectivo(cuenta, new Date('2030-01-01T00:00:00Z'))).toBe(
      estado === 'exenta' ? 'exenta' : estado === 'bloqueada' ? 'bloqueada' : 'activa',
    );
  });

  it('permite exportar aun cuando el pago está bloqueado', () => {
    expect(puedeExportar(acceso('bloqueada'))).toBe(true);
  });

  it('rechaza un estado manual desconocido devuelto por el servidor', async () => {
    const sb = {
      rpc: async () => ({
        data: [{
          modalidad: 'general', precio_ars: 50000, estado: 'activa', acceso_hasta: null,
          gracia_hasta: null, eliminar_despues_de: null, terminos_aceptados_version: null,
          privacidad_aceptada_version: null, aceptado_en: null, estado_cobro_manual: 'inventado',
          periodo_cobro_actual: '2026-11-01', ultimo_periodo_pagado: null,
        }],
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(cargarAcceso(sb)).rejects.toThrow('estado de cobro manual inválido');
  });
});
