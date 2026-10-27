-- Conserva el vínculo de suscripciones reemplazadas y reconcilia cada factura
-- por separado. También prepara checkout bajo el mismo lock que la limpieza.

create table public.suscripciones_mercado_pago (
  preapproval_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  creada_en timestamptz not null default now()
);
alter table public.suscripciones_mercado_pago enable row level security;
grant all on public.suscripciones_mercado_pago to service_role;

insert into public.suscripciones_mercado_pago (preapproval_id, user_id)
select mercado_pago_preapproval_id, user_id
from public.accesos_comerciales
where mercado_pago_preapproval_id is not null
on conflict (preapproval_id) do nothing;

create table public.facturas_mercado_pago (
  resource_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  preapproval_id text not null references public.suscripciones_mercado_pago (preapproval_id) on delete cascade,
  payment_id text not null,
  estado text not null check (estado in ('approved', 'rejected', 'refunded')),
  debito_en timestamptz not null,
  modificado_en timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.facturas_mercado_pago enable row level security;
grant all on public.facturas_mercado_pago to service_role;

create or replace function public.registrar_suscripcion_mercado_pago(p_user uuid, p_preapproval_id text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.suscripciones_mercado_pago (preapproval_id, user_id)
  values (p_preapproval_id, p_user)
  on conflict (preapproval_id) do update
    set user_id = excluded.user_id
    where public.suscripciones_mercado_pago.user_id = excluded.user_id
$$;

create or replace function public.preparar_checkout_comercial(
  p_user uuid,
  p_terminos text,
  p_privacidad text
) returns setof public.accesos_comerciales
language plpgsql security definer set search_path = '' as $$
declare v_acceso public.accesos_comerciales%rowtype;
begin
  select * into v_acceso
  from public.accesos_comerciales
  where user_id = p_user
  for update;
  if not found then raise exception 'acceso comercial inexistente'; end if;
  if v_acceso.eliminacion_confirmada_en is not null then
    raise exception 'eliminación de cuenta ya confirmada';
  end if;

  update public.accesos_comerciales
  set terminos_aceptados_version = p_terminos,
      privacidad_aceptada_version = p_privacidad,
      aceptado_en = now(),
      eliminacion_reclamada_en = null
  where user_id = p_user
  returning * into v_acceso;
  return next v_acceso;
end $$;

revoke all on function public.registrar_suscripcion_mercado_pago(uuid, text) from public, anon, authenticated;
revoke all on function public.preparar_checkout_comercial(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_suscripcion_mercado_pago(uuid, text) to service_role;
grant execute on function public.preparar_checkout_comercial(uuid, text, text) to service_role;

drop function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb, timestamptz);
create function public.aplicar_evento_mercado_pago(
  p_topic text,
  p_resource_id text,
  p_accion text,
  p_user_id uuid,
  p_cambios jsonb,
  p_evento_pago_en timestamptz default null,
  p_pago_id text default null,
  p_debito_en timestamptz default null,
  p_estado_pago text default null,
  p_preapproval_id text default null,
  p_suscripcion_cancelada boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_evento bigint;
  v_procesado boolean;
  v_acceso public.accesos_comerciales%rowtype;
  v_factura_actualizada boolean := true;
  v_rechazo timestamptz;
begin
  insert into public.eventos_mercado_pago (topic, resource_id, accion)
  values (p_topic, p_resource_id, p_accion)
  on conflict (topic, resource_id, accion) do nothing
  returning id into v_evento;

  if v_evento is null then
    select id, procesado_en is not null into v_evento, v_procesado
    from public.eventos_mercado_pago
    where topic = p_topic and resource_id = p_resource_id and accion = p_accion
    for update;
    if v_procesado then
      update public.eventos_mercado_pago set intentos = intentos + 1 where id = v_evento;
      return false;
    end if;
  end if;

  select * into v_acceso
  from public.accesos_comerciales
  where user_id = p_user_id
  for update;
  if not found then raise exception 'acceso comercial inexistente'; end if;

  if p_estado_pago is not null then
    if p_estado_pago not in ('approved', 'rejected', 'refunded')
      or p_pago_id is null or p_debito_en is null or p_evento_pago_en is null or p_preapproval_id is null then
      raise exception 'factura de Mercado Pago incompleta';
    end if;
    insert into public.facturas_mercado_pago (
      resource_id, user_id, preapproval_id, payment_id, estado, debito_en, modificado_en
    ) values (
      p_resource_id, p_user_id, p_preapproval_id, p_pago_id, p_estado_pago, p_debito_en, p_evento_pago_en
    )
    on conflict (resource_id) do update
      set payment_id = excluded.payment_id,
          estado = excluded.estado,
          debito_en = excluded.debito_en,
          modificado_en = excluded.modificado_en,
          updated_at = now()
      where excluded.user_id = public.facturas_mercado_pago.user_id
        and excluded.modificado_en > public.facturas_mercado_pago.modificado_en
    returning true into v_factura_actualizada;

    if not coalesce(v_factura_actualizada, false) then
      update public.eventos_mercado_pago set procesado_en = now(), ultimo_error = 'versión anterior de factura ignorada' where id = v_evento;
      return false;
    end if;
  end if;

  if p_estado_pago = 'approved' then
    if v_acceso.eliminacion_confirmada_en is not null then
      update public.eventos_mercado_pago set procesado_en = now(), ultimo_error = 'eliminación ya confirmada' where id = v_evento;
      return false;
    end if;
    if not p_suscripcion_cancelada and (v_acceso.ultimo_pago_en is null or p_debito_en > v_acceso.ultimo_pago_en) then
      update public.accesos_comerciales
      set estado = 'activa',
          acceso_hasta = (p_cambios ->> 'acceso_hasta')::timestamptz,
          gracia_hasta = null,
          eliminar_despues_de = null,
          ultimo_pago_id = p_pago_id,
          ultimo_pago_en = p_debito_en,
          ultimo_evento_pago_en = greatest(ultimo_evento_pago_en, p_evento_pago_en),
          eliminacion_reclamada_en = null,
          eliminacion_confirmada_en = null
      where user_id = p_user_id
      returning * into v_acceso;

      select min(debito_en) into v_rechazo
      from public.facturas_mercado_pago
      where user_id = p_user_id and estado = 'rejected' and debito_en > v_acceso.ultimo_pago_en;
      if v_rechazo is not null then
        update public.accesos_comerciales
        set estado = 'gracia', gracia_hasta = v_rechazo + interval '4 days'
        where user_id = p_user_id;
      end if;
    end if;
  elsif p_estado_pago = 'rejected' then
    if v_acceso.ultimo_pago_en is not null
      and p_debito_en > v_acceso.ultimo_pago_en
      and v_acceso.estado not in ('cancelada', 'reintegrada') then
      update public.accesos_comerciales
      set estado = 'gracia',
          gracia_hasta = least(coalesce(gracia_hasta, p_debito_en + interval '4 days'), p_debito_en + interval '4 days'),
          ultimo_evento_pago_en = greatest(ultimo_evento_pago_en, p_evento_pago_en)
      where user_id = p_user_id;
    end if;
  elsif p_estado_pago = 'refunded' then
    if v_acceso.ultimo_pago_id = p_pago_id then
      update public.accesos_comerciales
      set estado = 'reintegrada',
          acceso_hasta = (p_cambios ->> 'acceso_hasta')::timestamptz,
          gracia_hasta = null,
          eliminar_despues_de = (p_cambios ->> 'eliminar_despues_de')::timestamptz,
          ultimo_evento_pago_en = greatest(ultimo_evento_pago_en, p_evento_pago_en)
      where user_id = p_user_id;
    end if;
  else
    update public.accesos_comerciales
    set estado = case when p_cambios ? 'estado' then p_cambios ->> 'estado' else estado end,
        acceso_hasta = case when p_cambios ? 'acceso_hasta' then (p_cambios ->> 'acceso_hasta')::timestamptz else acceso_hasta end,
        gracia_hasta = case when p_cambios ? 'gracia_hasta' then (p_cambios ->> 'gracia_hasta')::timestamptz else gracia_hasta end,
        eliminar_despues_de = case when p_cambios ? 'eliminar_despues_de' then (p_cambios ->> 'eliminar_despues_de')::timestamptz else eliminar_despues_de end
    where user_id = p_user_id;
  end if;

  update public.eventos_mercado_pago set procesado_en = now(), ultimo_error = null where id = v_evento;
  return true;
end $$;

revoke all on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb, timestamptz, text, timestamptz, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb, timestamptz, text, timestamptz, text, text, boolean)
  to service_role;
