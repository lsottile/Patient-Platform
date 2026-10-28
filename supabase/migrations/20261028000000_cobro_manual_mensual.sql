-- Cobro mensual registrado por operación. La hora comercial es Argentina y
-- la decisión servidor gobierna tanto la interfaz como las políticas RLS.

update public.documentos_legales set vigente = false where vigente;
insert into public.documentos_legales (tipo, version, vigente_desde) values
  ('terminos', '2026-10-28', '2026-10-28T00:00:00Z'),
  ('privacidad', '2026-10-28', '2026-10-28T00:00:00Z');

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
    when p_ultimo_periodo_pagado = date_trunc('month', p_fecha)::date then 'al_dia'
    when extract(day from p_fecha)::integer between 1 and 3 then 'aviso_verde'
    when extract(day from p_fecha)::integer between 4 and 6 then 'aviso_amarillo'
    when extract(day from p_fecha)::integer between 7 and 10 then 'aviso_rojo'
    else 'bloqueada'
  end
$$;

create or replace function public.registrar_pago_manual(p_user uuid, p_periodo date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_periodo_actual date := date_trunc('month', public.fecha_comercial_argentina())::date;
begin
  if p_periodo is null or p_periodo <> date_trunc('month', p_periodo)::date then
    raise exception using errcode = '22023', message = 'el período debe ser el primer día del mes';
  end if;
  if p_periodo < date '2026-11-01' then
    raise exception using errcode = '22023', message = 'el período debe comenzar desde noviembre de 2026';
  end if;
  if p_periodo > v_periodo_actual then
    raise exception using errcode = '22023', message = 'no se pueden registrar períodos futuros';
  end if;
  if not exists (select 1 from public.accesos_comerciales where user_id = p_user) then
    raise exception using errcode = 'P0001', message = 'acceso comercial inexistente';
  end if;

  insert into public.pagos_manuales (user_id, periodo)
  values (p_user, p_periodo)
  on conflict (user_id, periodo) do nothing;

  -- La actualización notifica al frontend por Realtime sin convertir los
  -- campos históricos de Mercado Pago en autoridad comercial.
  update public.accesos_comerciales set updated_at = now() where user_id = p_user;
end $$;

revoke all on function public.registrar_pago_manual(uuid, date) from public, anon, authenticated;
grant execute on function public.registrar_pago_manual(uuid, date) to service_role;

create or replace function public.acceso_habilitado_en(p_user uuid, p_fecha date)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.estado_cobro_manual(
      a.modalidad,
      (
        select p.periodo
        from public.pagos_manuales p
        where p.user_id = a.user_id
          and p.periodo = date_trunc('month', p_fecha)::date
        limit 1
      ),
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
  values (
    new.id,
    case
      when lower(new.email) = 'lucianodaux@gmail.com' then 'exenta'
      when lower(new.email) = 'santiagomelian11@gmail.com' then 'preferencial'
      else 'general'
    end,
    case
      when lower(new.email) = 'lucianodaux@gmail.com' then 0
      when lower(new.email) = 'santiagomelian11@gmail.com' then 15000
      else 50000
    end,
    'activa'
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

update public.accesos_comerciales a
set modalidad = case
      when lower(u.email) = 'lucianodaux@gmail.com' then 'exenta'
      when lower(u.email) = 'santiagomelian11@gmail.com' then 'preferencial'
      else 'general'
    end,
    precio_ars = case
      when lower(u.email) = 'lucianodaux@gmail.com' then 0
      when lower(u.email) = 'santiagomelian11@gmail.com' then 15000
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

-- La falta de pago nunca programa ni ejecuta eliminación de datos. Se conserva
-- la RPC por compatibilidad con la Edge Function histórica, pero no entrega filas.
select cron.unschedule(jobid) from cron.job where jobname = 'limpieza-cuentas';
create or replace function public.cuentas_vencidas_para_eliminar()
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select null::uuid where false
$$;
revoke all on function public.cuentas_vencidas_para_eliminar() from public, anon, authenticated;
grant execute on function public.cuentas_vencidas_para_eliminar() to service_role;

drop policy if exists "cambiar frecuencia" on public.respaldos_drive;
create policy "cambiar frecuencia" on public.respaldos_drive for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select public.puede_escribir(auth.uid()))
  )
  with check (
    user_id = (select auth.uid())
    and (select public.puede_escribir(auth.uid()))
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'accesos_comerciales'
  ) then
    alter publication supabase_realtime add table public.accesos_comerciales;
  end if;
end $$;

create or replace function public.proxima_revision_cobro(p_estado text, p_fecha date)
returns timestamptz
language sql immutable set search_path = '' as $$
  select case
    when p_estado = 'exenta' then null
    when p_estado = 'aviso_verde' then
      ((date_trunc('month', p_fecha)::date + 3)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    when p_estado = 'aviso_amarillo' then
      ((date_trunc('month', p_fecha)::date + 6)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    when p_estado = 'aviso_rojo' then
      ((date_trunc('month', p_fecha)::date + 10)::timestamp at time zone 'America/Argentina/Buenos_Aires')
    else
      ((date_trunc('month', p_fecha)::date + interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires')
  end
$$;

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
  proxima_revision_en timestamptz,
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
    public.proxima_revision_cobro(e.valor, f.fecha),
    case
      when e.valor = 'exenta' then 'exenta'
      when e.valor = 'bloqueada' then 'bloqueada'
      else 'activa'
    end
  from public.accesos_comerciales a
  cross join lateral (select public.fecha_comercial_argentina() as fecha) f
  left join lateral (
    select
      max(pm.periodo) as ultimo_periodo,
      max(pm.periodo) filter (
        where pm.periodo = date_trunc('month', f.fecha)::date
      ) as periodo_actual_pagado
    from public.pagos_manuales pm
    where pm.user_id = a.user_id
  ) p on true
  cross join lateral (
    select public.estado_cobro_manual(a.modalidad, p.periodo_actual_pagado, f.fecha) as valor
  ) e
  where a.user_id = auth.uid()
$$;

revoke all on function public.mi_acceso_comercial() from public, anon;
grant execute on function public.mi_acceso_comercial() to authenticated, service_role;
