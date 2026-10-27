-- Un webhook se registra, aplica y marca procesado dentro de la misma transacción.
-- Si cualquier validación de Postgres falla, no queda un evento que impida reintentar.

create or replace function public.aplicar_evento_mercado_pago(
  p_topic text,
  p_resource_id text,
  p_accion text,
  p_user_id uuid,
  p_cambios jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_evento bigint;
  v_procesado boolean;
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

  update public.accesos_comerciales
  set estado = case when p_cambios ? 'estado' then p_cambios ->> 'estado' else estado end,
      acceso_hasta = case when p_cambios ? 'acceso_hasta' then (p_cambios ->> 'acceso_hasta')::timestamptz else acceso_hasta end,
      gracia_hasta = case when p_cambios ? 'gracia_hasta' then (p_cambios ->> 'gracia_hasta')::timestamptz else gracia_hasta end,
      eliminar_despues_de = case when p_cambios ? 'eliminar_despues_de' then (p_cambios ->> 'eliminar_despues_de')::timestamptz else eliminar_despues_de end,
      ultimo_pago_id = case when p_cambios ? 'ultimo_pago_id' then p_cambios ->> 'ultimo_pago_id' else ultimo_pago_id end,
      ultimo_pago_en = case when p_cambios ? 'ultimo_pago_en' then (p_cambios ->> 'ultimo_pago_en')::timestamptz else ultimo_pago_en end
  where user_id = p_user_id;
  if not found then raise exception 'acceso comercial inexistente'; end if;

  update public.eventos_mercado_pago
  set procesado_en = now(), ultimo_error = null
  where id = v_evento;
  return true;
end $$;

revoke all on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_evento_mercado_pago(text, text, text, uuid, jsonb)
  to service_role;
