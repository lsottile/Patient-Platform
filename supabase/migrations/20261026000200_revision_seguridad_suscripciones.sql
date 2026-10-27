-- Correcciones de producción: orden total de eventos de pago, reactivación de
-- checkout por generación y reclamo en dos fases antes de eliminar una cuenta.

alter table public.accesos_comerciales
  add column checkout_generacion integer not null default 0 check (checkout_generacion >= 0),
  add column ultimo_evento_pago_en timestamptz,
  add column eliminacion_reclamada_en timestamptz,
  add column eliminacion_confirmada_en timestamptz;

create function public.acceso_habilitado(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select
      modalidad = 'exenta'
      or estado in ('transicion', 'activa')
      or (estado = 'gracia' and gracia_hasta is not null and now() < gracia_hasta)
      or (estado = 'cancelada' and acceso_hasta is not null and now() < acceso_hasta)
    from public.accesos_comerciales
    where user_id = p_user
  ), false)
$$;
revoke all on function public.acceso_habilitado(uuid) from public, anon, authenticated;
grant execute on function public.acceso_habilitado(uuid) to service_role;

create or replace function public.puede_escribir(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from p_user then
    return false;
  end if;
  return public.acceso_habilitado(p_user);
end $$;

drop function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb);
create function public.aplicar_evento_mercado_pago(
  p_topic text,
  p_resource_id text,
  p_accion text,
  p_user_id uuid,
  p_cambios jsonb,
  p_evento_pago_en timestamptz default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_evento bigint;
  v_procesado boolean;
  v_ultimo_evento timestamptz;
  v_eliminacion_confirmada timestamptz;
begin
  insert into public.eventos_mercado_pago (topic, resource_id, accion)
  values (p_topic, p_resource_id, p_accion)
  on conflict (topic, resource_id, accion) do nothing
  returning id into v_evento;

  if v_evento is null then
    select id, procesado_en is not null
      into v_evento, v_procesado
    from public.eventos_mercado_pago
    where topic = p_topic and resource_id = p_resource_id and accion = p_accion
    for update;
    if v_procesado then
      update public.eventos_mercado_pago set intentos = intentos + 1 where id = v_evento;
      return false;
    end if;
  end if;

  select ultimo_evento_pago_en, eliminacion_confirmada_en
    into v_ultimo_evento, v_eliminacion_confirmada
  from public.accesos_comerciales
  where user_id = p_user_id
  for update;
  if not found then raise exception 'acceso comercial inexistente'; end if;

  if p_evento_pago_en is not null and v_ultimo_evento is not null and p_evento_pago_en <= v_ultimo_evento then
    update public.eventos_mercado_pago set procesado_en = now(), ultimo_error = 'evento anterior ignorado' where id = v_evento;
    return false;
  end if;

  if p_cambios ->> 'estado' = 'activa' and v_eliminacion_confirmada is not null then
    update public.eventos_mercado_pago set procesado_en = now(), ultimo_error = 'eliminación ya confirmada' where id = v_evento;
    return false;
  end if;

  update public.accesos_comerciales
  set estado = case when p_cambios ? 'estado' then p_cambios ->> 'estado' else estado end,
      acceso_hasta = case when p_cambios ? 'acceso_hasta' then (p_cambios ->> 'acceso_hasta')::timestamptz else acceso_hasta end,
      gracia_hasta = case when p_cambios ? 'gracia_hasta' then (p_cambios ->> 'gracia_hasta')::timestamptz else gracia_hasta end,
      eliminar_despues_de = case when p_cambios ? 'eliminar_despues_de' then (p_cambios ->> 'eliminar_despues_de')::timestamptz else eliminar_despues_de end,
      ultimo_pago_id = case when p_cambios ? 'ultimo_pago_id' then p_cambios ->> 'ultimo_pago_id' else ultimo_pago_id end,
      ultimo_pago_en = case when p_cambios ? 'ultimo_pago_en' then (p_cambios ->> 'ultimo_pago_en')::timestamptz else ultimo_pago_en end,
      ultimo_evento_pago_en = coalesce(p_evento_pago_en, ultimo_evento_pago_en),
      eliminacion_reclamada_en = case when p_cambios ->> 'estado' = 'activa' then null else eliminacion_reclamada_en end,
      eliminacion_confirmada_en = case when p_cambios ->> 'estado' = 'activa' then null else eliminacion_confirmada_en end
  where user_id = p_user_id;

  update public.eventos_mercado_pago
  set procesado_en = now(), ultimo_error = null
  where id = v_evento;
  return true;
end $$;

revoke all on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb, timestamptz)
  to service_role;

create or replace function public.cuentas_vencidas_para_eliminar()
returns table (user_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  -- Una reactivación manual o por webhook cancela cualquier reclamo no ejecutado.
  update public.accesos_comerciales a
  set eliminacion_reclamada_en = null,
      eliminacion_confirmada_en = null
  where (a.eliminacion_reclamada_en is not null or a.eliminacion_confirmada_en is not null)
    and public.acceso_habilitado(a.user_id);

  -- Primera fase: reclamar. No se borra nada hasta una ejecución posterior.
  update public.accesos_comerciales a
  set eliminacion_reclamada_en = now()
  where a.eliminar_despues_de is not null
    and a.eliminar_despues_de <= now()
    and a.eliminacion_reclamada_en is null
    and a.eliminacion_confirmada_en is null
    and not public.acceso_habilitado(a.user_id);

  -- Segunda fase: confirmar solo si siguió vencida durante toda la ventana.
  update public.accesos_comerciales a
  set eliminacion_confirmada_en = now()
  where a.eliminacion_confirmada_en is null
    and a.eliminacion_reclamada_en <= now() - interval '10 minutes'
    and a.eliminar_despues_de <= now()
    and not public.acceso_habilitado(a.user_id);

  return query
    select a.user_id
    from public.accesos_comerciales a
    where a.eliminacion_confirmada_en is not null
      and a.eliminar_despues_de <= now()
      and not public.acceso_habilitado(a.user_id)
    order by a.eliminacion_confirmada_en, a.user_id;
end $$;
