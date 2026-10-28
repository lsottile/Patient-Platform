import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccesoComercial, EstadoCobroManual, EstadoComercial, ModalidadComercial } from './tipos';

interface FilaAcceso {
  modalidad: unknown;
  precio_ars: unknown;
  estado: unknown;
  acceso_hasta: unknown;
  gracia_hasta: unknown;
  eliminar_despues_de: unknown;
  terminos_aceptados_version: unknown;
  privacidad_aceptada_version: unknown;
  aceptado_en: unknown;
  estado_cobro_manual: unknown;
  periodo_cobro_actual: unknown;
  ultimo_periodo_pagado: unknown;
  proxima_revision_en: unknown;
}

const MODALIDADES = new Set<ModalidadComercial>(['general', 'preferencial', 'exenta']);
const ESTADOS = new Set<EstadoComercial>(['pendiente', 'transicion', 'activa', 'gracia', 'cancelada', 'reintegrada']);
const ESTADOS_COBRO = new Set<EstadoCobroManual>(['exenta', 'al_dia', 'aviso_verde', 'aviso_amarillo', 'aviso_rojo', 'bloqueada']);
const textoONull = (valor: unknown) => (typeof valor === 'string' ? valor : null);

function convertir(fila: FilaAcceso): AccesoComercial {
  if (!MODALIDADES.has(fila.modalidad as ModalidadComercial) || !ESTADOS.has(fila.estado as EstadoComercial) || typeof fila.precio_ars !== 'number') {
    throw new Error('El servidor devolvió un estado de suscripción inválido');
  }
  if (!ESTADOS_COBRO.has(fila.estado_cobro_manual as EstadoCobroManual)) {
    throw new Error('El servidor devolvió un estado de cobro manual inválido');
  }
  if (typeof fila.periodo_cobro_actual !== 'string') throw new Error('El servidor devolvió un período de cobro inválido');
  return {
    modalidad: fila.modalidad as ModalidadComercial,
    precioArs: fila.precio_ars,
    estado: fila.estado as EstadoComercial,
    accesoHasta: textoONull(fila.acceso_hasta),
    graciaHasta: textoONull(fila.gracia_hasta),
    eliminarDespuesDe: textoONull(fila.eliminar_despues_de),
    terminosAceptadosVersion: textoONull(fila.terminos_aceptados_version),
    privacidadAceptadaVersion: textoONull(fila.privacidad_aceptada_version),
    aceptadoEn: textoONull(fila.aceptado_en),
    estadoCobroManual: fila.estado_cobro_manual as EstadoCobroManual,
    periodoCobroActual: fila.periodo_cobro_actual,
    ultimoPeriodoPagado: textoONull(fila.ultimo_periodo_pagado),
    proximaRevisionEn: textoONull(fila.proxima_revision_en),
  };
}

export async function cargarAcceso(sb: SupabaseClient): Promise<AccesoComercial> {
  const { data, error } = await sb.rpc('mi_acceso_comercial');
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as FilaAcceso | null;
  if (!fila) throw new Error('No se encontró el estado de suscripción de la cuenta');
  return convertir(fila);
}

export async function crearCheckout(sb: SupabaseClient, backUrl: string): Promise<string> {
  const { data, error } = await sb.functions.invoke('suscripcion-crear', {
    body: { aceptaTerminos: true, aceptaPrivacidad: true, backUrl },
  });
  if (error) throw error;
  if (!data || typeof data.initPoint !== 'string') throw new Error('No se recibió el enlace de Mercado Pago');
  return data.initPoint;
}
