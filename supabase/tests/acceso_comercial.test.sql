begin;

create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'pendiente@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'transicion@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'activa@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'gracia-vigente@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'gracia-vencida@example.com'),
  ('00000000-0000-0000-0000-000000000006', 'cancelada-vigente@example.com'),
  ('00000000-0000-0000-0000-000000000007', 'cancelada-vencida@example.com'),
  ('00000000-0000-0000-0000-000000000008', 'exenta@example.com'),
  ('00000000-0000-0000-0000-000000000009', 'otra@example.com');

select is(
  (select estado || ':' || precio_ars::text from public.accesos_comerciales where user_id = '00000000-0000-0000-0000-000000000001'),
  'pendiente:50000',
  'una cuenta nueva nace pendiente con el precio general'
);

update public.accesos_comerciales set estado = 'transicion', modalidad = 'preferencial', precio_ars = 15000
where user_id = '00000000-0000-0000-0000-000000000002';
update public.accesos_comerciales set estado = 'activa'
where user_id = '00000000-0000-0000-0000-000000000003';
update public.accesos_comerciales set estado = 'gracia', gracia_hasta = now() + interval '1 hour'
where user_id = '00000000-0000-0000-0000-000000000004';
update public.accesos_comerciales set estado = 'gracia', gracia_hasta = now()
where user_id = '00000000-0000-0000-0000-000000000005';
update public.accesos_comerciales set estado = 'cancelada', acceso_hasta = now() + interval '1 hour'
where user_id = '00000000-0000-0000-0000-000000000006';
update public.accesos_comerciales set estado = 'cancelada', acceso_hasta = now()
where user_id = '00000000-0000-0000-0000-000000000007';
update public.accesos_comerciales set modalidad = 'exenta', precio_ars = 0
where user_id = '00000000-0000-0000-0000-000000000008';

insert into public.centros (id, user_id, data) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '{"nombre":"Propio"}'),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', '{"nombre":"Ajeno"}');

insert into storage.objects (bucket_id, name) values
  ('adjuntos', '00000000-0000-0000-0000-000000000001/paciente/propio.pdf'),
  ('adjuntos', '00000000-0000-0000-0000-000000000009/paciente/ajeno.pdf');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

select results_eq(
  $$select count(*) from public.centros$$,
  array[1::bigint],
  'una cuenta bloqueada puede leer sus datos para exportarlos'
);
select results_eq(
  $$select count(*) from public.centros where user_id = '00000000-0000-0000-0000-000000000009'$$,
  array[0::bigint],
  'una cuenta no puede leer datos ajenos'
);
select throws_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000001', '{"nombre":"No"}')$$,
  '42501',
  'new row violates row-level security policy for table "centros"',
  'una cuenta pendiente no puede insertar'
);
select is_empty(
  $$update public.centros set data = '{"nombre":"No"}' where id = '10000000-0000-0000-0000-000000000001' returning id$$,
  'una cuenta pendiente no puede modificar'
);
select is_empty(
  $$delete from public.centros where id = '10000000-0000-0000-0000-000000000001' returning id$$,
  'una cuenta pendiente no puede borrar'
);
select results_eq(
  $$select count(*) from storage.objects$$,
  array[1::bigint],
  'una cuenta bloqueada puede leer sus adjuntos'
);
select results_eq(
  $$select count(*) from storage.objects where name like '00000000-0000-0000-0000-000000000009/%'$$,
  array[0::bigint],
  'una cuenta no puede leer adjuntos ajenos'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('adjuntos', '00000000-0000-0000-0000-000000000001/paciente/nuevo.pdf')$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'una cuenta pendiente no puede subir adjuntos'
);
select is_empty(
  $$update public.accesos_comerciales set estado = 'activa' where user_id = auth.uid() returning user_id$$,
  'el titular no puede modificar su estado comercial'
);
select results_eq(
  $$select estado_efectivo from public.mi_acceso_comercial()$$,
  array['pendiente'::text],
  'el titular puede consultar su estado efectivo'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000002', '{"nombre":"Transición"}')$$,
  'la cuenta en transición puede escribir'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000003', '{"nombre":"Activa"}')$$,
  'la cuenta activa puede escribir'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000004', '{"nombre":"Gracia"}')$$,
  'la gracia vigente puede escribir'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select throws_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000005', '{"nombre":"Vencida"}')$$,
  '42501',
  'new row violates row-level security policy for table "centros"',
  'la gracia bloquea exactamente en su vencimiento'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000006', '{"nombre":"Cancelada vigente"}')$$,
  'la cancelación conserva escritura durante el período pagado'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007';
select throws_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000007', '{"nombre":"Cancelada vencida"}')$$,
  '42501',
  'new row violates row-level security policy for table "centros"',
  'la cancelación bloquea exactamente al terminar el período'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000008';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000008', '{"nombre":"Exenta"}')$$,
  'la cuenta exenta siempre puede escribir'
);

reset role;

select is(
  (select count(distinct tablename) from pg_policies
   where schemaname = 'public'
     and tablename = any(array['centros','pacientes','ingresos','evaluaciones','sesiones','adjuntos','ejercicios','plantillas','programas'])
     and policyname = 'escribir con acceso'),
  9::bigint,
  'las nueve colecciones aplican el acceso comercial'
);
select ok(
  not has_function_privilege('authenticated', 'public.registrar_evento_mercado_pago(text,text,text)', 'execute'),
  'authenticated no puede registrar eventos comerciales'
);
select ok(
  not has_function_privilege('anon', 'public.registrar_evento_mercado_pago(text,text,text)', 'execute'),
  'anon no puede registrar eventos comerciales'
);
select ok(
  has_function_privilege('service_role', 'public.registrar_evento_mercado_pago(text,text,text)', 'execute'),
  'service_role puede registrar eventos comerciales'
);
select ok(
  has_function_privilege('service_role', 'public.aplicar_evento_mercado_pago(text,text,text,uuid,jsonb)', 'execute'),
  'service_role puede aplicar un evento y su cambio de acceso en una transacción'
);
select throws_ok(
  $$select public.aplicar_evento_mercado_pago(
    'subscription_authorized_payment', 'atomic-fail', 'payment:v1',
    '00000000-0000-0000-0000-000000000001', '{"estado":"invalido"}'::jsonb
  )$$,
  '23514',
  null,
  'un cambio comercial inválido revierte toda la RPC'
);
select is(
  (select count(*) from public.eventos_mercado_pago where resource_id = 'atomic-fail'),
  0::bigint,
  'el rollback no deja un evento marcado antes de aplicar el acceso'
);

select * from finish();
rollback;
