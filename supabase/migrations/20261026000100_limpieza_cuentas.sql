-- Selección y programación de cuentas vencidas. La Edge Function borra primero
-- Storage mediante su API y recién después Auth, que elimina en cascada las filas.

create or replace function public.cuentas_vencidas_para_eliminar()
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.user_id
  from public.accesos_comerciales a
  where a.eliminar_despues_de is not null
    and a.eliminar_despues_de <= now()
    and not public.puede_escribir(a.user_id)
  order by a.eliminar_despues_de, a.user_id
$$;

create or replace function public.objetos_adjuntos_usuario(p_user uuid)
returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(o.name order by o.name), '{}'::text[])
  from storage.objects o
  where o.bucket_id = 'adjuntos'
    and (storage.foldername(o.name))[1] = p_user::text
$$;

revoke all on function public.cuentas_vencidas_para_eliminar() from public, anon, authenticated;
revoke all on function public.objetos_adjuntos_usuario(uuid) from public, anon, authenticated;
grant execute on function public.cuentas_vencidas_para_eliminar() to service_role;
grant execute on function public.objetos_adjuntos_usuario(uuid) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'limpieza-cuentas';
select cron.schedule(
  'limpieza-cuentas',
  '42 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'url_proyecto') || '/functions/v1/cuentas-limpiar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secreto-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'secreto_cron')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'url_proyecto');
  $$
);
