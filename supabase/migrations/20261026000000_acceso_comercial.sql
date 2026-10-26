-- Suscripciones y acceso comercial del servicio alojado.
-- La interfaz orienta al usuario; estas políticas son el límite de seguridad real.

create table public.documentos_legales (
  tipo text not null check (tipo in ('terminos', 'privacidad')),
  version text not null,
  vigente_desde timestamptz not null,
  vigente boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (tipo, version)
);

create unique index documentos_legales_un_vigente_idx
  on public.documentos_legales (tipo) where vigente;

insert into public.documentos_legales (tipo, version, vigente_desde) values
  ('terminos', '2026-10-26', '2026-10-26T00:00:00Z'),
  ('privacidad', '2026-10-26', '2026-10-26T00:00:00Z');

create table public.accesos_comerciales (
  user_id uuid primary key references auth.users (id) on delete cascade,
  modalidad text not null default 'general' check (modalidad in ('general', 'preferencial', 'exenta')),
  precio_ars integer not null default 50000 check (
    (modalidad = 'exenta' and precio_ars = 0)
    or (modalidad <> 'exenta' and precio_ars > 0)
  ),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'transicion', 'activa', 'gracia', 'cancelada', 'reintegrada')),
  mercado_pago_preapproval_id text,
  mercado_pago_init_point text,
  ultimo_pago_id text,
  ultimo_pago_en timestamptz,
  acceso_hasta timestamptz,
  gracia_hasta timestamptz,
  eliminar_despues_de timestamptz,
  terminos_aceptados_version text,
  privacidad_aceptada_version text,
  aceptado_en timestamptz,
  creado_en timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index accesos_comerciales_preapproval_idx
  on public.accesos_comerciales (mercado_pago_preapproval_id)
  where mercado_pago_preapproval_id is not null;

drop trigger if exists tocar_updated_at on public.accesos_comerciales;
create trigger tocar_updated_at before update on public.accesos_comerciales
  for each row execute function public.tocar_updated_at();

create table public.eventos_mercado_pago (
  id bigint generated always as identity primary key,
  topic text not null,
  resource_id text not null,
  accion text not null,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz,
  intentos integer not null default 1 check (intentos > 0),
  ultimo_error text,
  unique (topic, resource_id, accion)
);

alter table public.documentos_legales enable row level security;
alter table public.accesos_comerciales enable row level security;
alter table public.eventos_mercado_pago enable row level security;

create policy "leer acceso propio" on public.accesos_comerciales
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.accesos_comerciales to authenticated;
grant all on public.documentos_legales, public.accesos_comerciales, public.eventos_mercado_pago to service_role;

create or replace function public.crear_acceso_comercial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accesos_comerciales (user_id, modalidad, precio_ars, estado)
  values (new.id, 'general', 50000, 'pendiente')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists crear_acceso_comercial on auth.users;
create trigger crear_acceso_comercial
  after insert on auth.users
  for each row execute function public.crear_acceso_comercial();

-- Las cuentas anteriores al despliegue no se bloquean. Las excepciones de precio
-- y la cuenta exenta se asignan luego mediante el procedimiento operativo.
insert into public.accesos_comerciales (user_id, modalidad, precio_ars, estado)
select id, 'general', 50000, 'transicion'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.puede_escribir(p_user uuid) returns boolean
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

revoke all on function public.puede_escribir(uuid) from public, anon;
grant execute on function public.puede_escribir(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'centros', 'pacientes', 'ingresos', 'evaluaciones', 'sesiones',
    'adjuntos', 'ejercicios', 'plantillas', 'programas'
  ] loop
    execute format('drop policy if exists "propietario" on public.%I', t);
    execute format('drop policy if exists "leer propios" on public.%I', t);
    execute format('drop policy if exists "escribir con acceso" on public.%I', t);
    execute format('drop policy if exists "actualizar con acceso" on public.%I', t);
    execute format('drop policy if exists "borrar con acceso" on public.%I', t);
    execute format(
      'create policy "leer propios" on public.%I for select to authenticated
         using (user_id = (select auth.uid()))',
      t
    );
    execute format(
      'create policy "escribir con acceso" on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()) and (select public.puede_escribir(auth.uid())))',
      t
    );
    execute format(
      'create policy "actualizar con acceso" on public.%I for update to authenticated
         using (user_id = (select auth.uid()) and (select public.puede_escribir(auth.uid())))
         with check (user_id = (select auth.uid()) and (select public.puede_escribir(auth.uid())))',
      t
    );
    execute format(
      'create policy "borrar con acceso" on public.%I for delete to authenticated
         using (user_id = (select auth.uid()) and (select public.puede_escribir(auth.uid())))',
      t
    );
  end loop;
end $$;

drop policy if exists "adjuntos: subir propios" on storage.objects;
create policy "adjuntos: subir propios" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.puede_escribir(auth.uid()))
  );

drop policy if exists "adjuntos: modificar propios" on storage.objects;
create policy "adjuntos: modificar propios" on storage.objects for update to authenticated
  using (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.puede_escribir(auth.uid()))
  )
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.puede_escribir(auth.uid()))
  );

drop policy if exists "adjuntos: borrar propios" on storage.objects;
create policy "adjuntos: borrar propios" on storage.objects for delete to authenticated
  using (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.puede_escribir(auth.uid()))
  );

create or replace function public.mi_acceso_comercial()
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
  estado_efectivo text
)
language sql stable security invoker set search_path = '' as $$
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
    case
      when a.modalidad = 'exenta' then 'exenta'
      when a.estado = 'pendiente' then 'pendiente'
      when a.estado = 'transicion' then 'transicion'
      when a.estado = 'activa' then 'activa'
      when a.estado = 'gracia' and a.gracia_hasta is not null and now() < a.gracia_hasta then 'gracia'
      when a.estado = 'cancelada' and a.acceso_hasta is not null and now() < a.acceso_hasta then 'cancelada_vigente'
      else 'bloqueada'
    end
  from public.accesos_comerciales a
  where a.user_id = auth.uid()
$$;

revoke all on function public.mi_acceso_comercial() from public, anon;
grant execute on function public.mi_acceso_comercial() to authenticated, service_role;

create or replace function public.registrar_evento_mercado_pago(
  p_topic text,
  p_resource_id text,
  p_accion text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare debe_procesar boolean;
begin
  insert into public.eventos_mercado_pago (topic, resource_id, accion)
  values (p_topic, p_resource_id, p_accion)
  on conflict (topic, resource_id, accion) do update
    set intentos = public.eventos_mercado_pago.intentos + 1
  returning procesado_en is null into debe_procesar;
  return debe_procesar;
end $$;

create or replace function public.marcar_evento_mercado_pago(
  p_topic text,
  p_resource_id text,
  p_accion text,
  p_error text default null
) returns boolean
language sql security definer set search_path = '' as $$
  update public.eventos_mercado_pago
  set procesado_en = case when p_error is null then now() else null end,
      ultimo_error = left(p_error, 300)
  where topic = p_topic and resource_id = p_resource_id and accion = p_accion
  returning true
$$;

revoke all on function public.registrar_evento_mercado_pago(text, text, text) from public, anon, authenticated;
revoke all on function public.marcar_evento_mercado_pago(text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_evento_mercado_pago(text, text, text) to service_role;
grant execute on function public.marcar_evento_mercado_pago(text, text, text, text) to service_role;
