-- Cobro mensual registrado por operación. La hora comercial es Argentina y
-- la decisión servidor gobierna tanto la interfaz como las políticas RLS.

create table public.pagos_manuales (
  user_id uuid not null references auth.users (id) on delete cascade,
  periodo date not null check (periodo = date_trunc('month', periodo)::date),
  registrado_en timestamptz not null default now(),
  primary key (user_id, periodo)
);

alter table public.pagos_manuales enable row level security;
revoke all on public.pagos_manuales from public, anon, authenticated;
grant all on public.pagos_manuales to service_role;

create or replace function public.fecha_comercial_argentina() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.estado_cobro_manual(
  p_modalidad text,
  p_ultimo_periodo_pagado date,
  p_fecha date
) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_modalidad = 'exenta' then 'exenta'
    when p_fecha < date '2026-11-01' then 'al_dia'
    when p_ultimo_periodo_pagado >= date_trunc('month', p_fecha)::date then 'al_dia'
    when extract(day from p_fecha)::integer between 1 and 3 then 'aviso_verde'
    when extract(day from p_fecha)::integer between 4 and 6 then 'aviso_amarillo'
    when extract(day from p_fecha)::integer between 7 and 10 then 'aviso_rojo'
    else 'bloqueada'
  end
$$;

create or replace function public.registrar_pago_manual(p_user uuid, p_periodo date)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_periodo is null or p_periodo <> date_trunc('month', p_periodo)::date then
    raise exception using errcode = '22023', message = 'el período debe ser el primer día del mes';
  end if;
  if not exists (select 1 from public.accesos_comerciales where user_id = p_user) then
    raise exception using errcode = 'P0001', message = 'acceso comercial inexistente';
  end if;

  insert into public.pagos_manuales (user_id, periodo)
  values (p_user, p_periodo)
  on conflict (user_id, periodo) do nothing;
end $$;

revoke all on function public.registrar_pago_manual(uuid, date) from public, anon, authenticated;
grant execute on function public.registrar_pago_manual(uuid, date) to service_role;

create or replace function public.acceso_habilitado_en(p_user uuid, p_fecha date)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.estado_cobro_manual(
      a.modalidad,
      (select max(p.periodo) from public.pagos_manuales p where p.user_id = a.user_id),
      p_fecha
    ) <> 'bloqueada'
    from public.accesos_comerciales a
    where a.user_id = p_user
  ), false)
$$;

revoke all on function public.acceso_habilitado_en(uuid, date) from public, anon, authenticated;
grant execute on function public.acceso_habilitado_en(uuid, date) to service_role;

create or replace function public.acceso_habilitado(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.acceso_habilitado_en(p_user, public.fecha_comercial_argentina())
$$;

create or replace function public.crear_acceso_comercial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accesos_comerciales (user_id, modalidad, precio_ars, estado)
  values (new.id, 'general', 50000, 'activa')
  on conflict (user_id) do nothing;
  return new;
end $$;

update public.accesos_comerciales a
set modalidad = case
      when u.email = 'lucianodaux@gmail.com' then 'exenta'
      when u.email = 'santiagomelian11@gmail.com' then 'preferencial'
      else 'general'
    end,
    precio_ars = case
      when u.email = 'lucianodaux@gmail.com' then 0
      when u.email = 'santiagomelian11@gmail.com' then 15000
      else 50000
    end,
    estado = 'activa',
    acceso_hasta = null,
    gracia_hasta = null,
    eliminar_despues_de = null,
    eliminacion_reclamada_en = null,
    eliminacion_confirmada_en = null
from auth.users u
where u.id = a.user_id;

drop function public.mi_acceso_comercial();
create function public.mi_acceso_comercial()
returns table (
  modalidad text,
  precio_ars integer,
  estado text,
  acceso_hasta timestamptz,
  gracia_hasta timestamptz,
  eliminar_despues_de timestamptz,
  terminos_aceptados_version text,
  privacidad_aceptada_version text,
  aceptado_en timestamptz,
  estado_cobro_manual text,
  periodo_cobro_actual date,
  ultimo_periodo_pagado date,
  estado_efectivo text
)
language sql stable security definer set search_path = '' as $$
  select
    a.modalidad,
    a.precio_ars,
    a.estado,
    a.acceso_hasta,
    a.gracia_hasta,
    a.eliminar_despues_de,
    a.terminos_aceptados_version,
    a.privacidad_aceptada_version,
    a.aceptado_en,
    e.valor,
    date_trunc('month', f.fecha)::date,
    p.ultimo_periodo,
    case
      when e.valor = 'exenta' then 'exenta'
      when e.valor = 'bloqueada' then 'bloqueada'
      else 'activa'
    end
  from public.accesos_comerciales a
  cross join lateral (select public.fecha_comercial_argentina() as fecha) f
  left join lateral (
    select max(pm.periodo) as ultimo_periodo
    from public.pagos_manuales pm
    where pm.user_id = a.user_id
  ) p on true
  cross join lateral (
    select public.estado_cobro_manual(a.modalidad, p.ultimo_periodo, f.fecha) as valor
  ) e
  where a.user_id = auth.uid()
$$;

revoke all on function public.mi_acceso_comercial() from public, anon;
grant execute on function public.mi_acceso_comercial() to authenticated, service_role;
