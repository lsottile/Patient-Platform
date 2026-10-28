begin;

create extension if not exists pgtap with schema extensions;
select plan(42);

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
  (select modalidad || ':' || precio_ars::text || ':' || estado from public.accesos_comerciales where user_id = '00000000-0000-0000-0000-000000000001'),
  'general:50000:activa',
  'una cuenta nueva nace activa con la referencia general'
);

select is(public.estado_cobro_manual('general', null, date '2026-10-31'), 'al_dia', 'antes del inicio no hay deuda');
select is(public.estado_cobro_manual('exenta', null, date '2026-11-20'), 'exenta', 'la propietaria exenta nunca se bloquea');
select is(public.estado_cobro_manual('general', date '2026-11-01', date '2026-11-20'), 'al_dia', 'el pago del mes habilita todo el período');
select is(public.estado_cobro_manual('general', null, date '2026-11-01'), 'aviso_verde', 'el día 1 muestra aviso verde');
select is(public.estado_cobro_manual('general', null, date '2026-11-03'), 'aviso_verde', 'el día 3 todavía muestra aviso verde');
select is(public.estado_cobro_manual('general', null, date '2026-11-04'), 'aviso_amarillo', 'el día 4 cambia a amarillo');
select is(public.estado_cobro_manual('general', null, date '2026-11-06'), 'aviso_amarillo', 'el día 6 todavía muestra aviso amarillo');
select is(public.estado_cobro_manual('general', null, date '2026-11-07'), 'aviso_rojo', 'el día 7 cambia a rojo');
select is(public.estado_cobro_manual('general', null, date '2026-11-10'), 'aviso_rojo', 'el día 10 todavía conserva acceso');
select is(public.estado_cobro_manual('general', null, date '2026-11-11'), 'bloqueada', 'el bloqueo comienza el día 11');
select is(public.estado_cobro_manual('general', date '2026-11-01', date '2026-12-01'), 'aviso_verde', 'el pago anterior no se arrastra al mes nuevo');

select ok(
  not has_function_privilege('authenticated', 'public.registrar_pago_manual(uuid,date)', 'execute'),
  'authenticated no puede registrar pagos manuales'
);
select ok(
  has_function_privilege('service_role', 'public.registrar_pago_manual(uuid,date)', 'execute'),
  'service_role puede registrar pagos manuales'
);
select throws_ok(
  $$select public.registrar_pago_manual('00000000-0000-0000-0000-000000000009', date '2026-11-02')$$,
  '22023',
  'el período debe ser el primer día del mes',
  'un período inválido se rechaza'
);
select public.registrar_pago_manual('00000000-0000-0000-0000-000000000009', date '2026-11-01');
select public.registrar_pago_manual('00000000-0000-0000-0000-000000000009', date '2026-11-01');
select is(
  (select count(*) from public.pagos_manuales where user_id = '00000000-0000-0000-0000-000000000009' and periodo = date '2026-11-01'),
  1::bigint,
  'registrar dos veces el mismo período es idempotente'
);

update public.accesos_comerciales set modalidad = 'exenta', precio_ars = 0, estado = 'activa'
where user_id = '00000000-0000-0000-0000-000000000008';

create or replace function public.fecha_comercial_argentina() returns date
language sql stable set search_path = '' as $$ select date '2026-11-11' $$;

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
  'una cuenta impaga no puede insertar desde el día 11'
);
select is_empty(
  $$update public.centros set data = '{"nombre":"No"}' where id = '10000000-0000-0000-0000-000000000001' returning id$$,
  'una cuenta impaga no puede modificar desde el día 11'
);
select is_empty(
  $$delete from public.centros where id = '10000000-0000-0000-0000-000000000001' returning id$$,
  'una cuenta impaga no puede borrar desde el día 11'
);
select results_eq(
  $$select count(*) from storage.objects$$,
  array[1::bigint],
  'una cuenta impaga puede leer sus adjuntos'
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
  'una cuenta impaga no puede subir adjuntos desde el día 11'
);
select is_empty(
  $$update public.accesos_comerciales set estado = 'activa' where user_id = auth.uid() returning user_id$$,
  'el titular no puede modificar su estado comercial'
);
select results_eq(
  $$select estado_efectivo from public.mi_acceso_comercial()$$,
  array['bloqueada'::text],
  'el titular consulta el bloqueo manual calculado por el servidor'
);
select is(
  public.puede_escribir('00000000-0000-0000-0000-000000000003'),
  false,
  'un usuario autenticado no puede consultar el acceso comercial ajeno'
);

reset role;
select public.registrar_pago_manual('00000000-0000-0000-0000-000000000001', date '2026-11-01');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select lives_ok(
  $$insert into public.centros (id, data) values ('20000000-0000-0000-0000-000000000001', '{"nombre":"Pago tardío"}')$$,
  'registrar el mes corriente restaura escritura de inmediato'
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
  has_function_privilege('service_role', 'public.aplicar_evento_mercado_pago(text,text,text,uuid,jsonb,timestamptz,text,timestamptz,text,text,boolean)', 'execute'),
  'service_role puede aplicar un evento y su cambio de acceso en una transacción'
);
select throws_ok(
  $$select public.aplicar_evento_mercado_pago(
    'subscription_authorized_payment', 'atomic-fail', 'payment:v1',
    '00000000-0000-0000-0000-000000000001', '{"estado":"invalido"}'::jsonb, now()
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
update public.accesos_comerciales
set estado = 'reintegrada', eliminar_despues_de = now() - interval '1 day'
where user_id = '00000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.cuentas_vencidas_para_eliminar()),
  0::bigint,
  'la primera fase solo reclama una cuenta y todavía no la entrega para borrar'
);
update public.accesos_comerciales set estado = 'activa'
where user_id = '00000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from public.cuentas_vencidas_para_eliminar()),
  0::bigint,
  'la cuenta reactivada no se entrega a la limpieza'
);
select is(
  (select eliminacion_reclamada_en from public.accesos_comerciales where user_id = '00000000-0000-0000-0000-000000000001'),
  null::timestamptz,
  'una reactivación cancela el reclamo de eliminación antes de borrar'
);
update public.accesos_comerciales
set eliminacion_reclamada_en = now() - interval '20 minutes', eliminacion_confirmada_en = now()
where user_id = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.preparar_checkout_comercial(
    '00000000-0000-0000-0000-000000000001', '2026-10-26', '2026-10-26'
  )$$,
  'P0001',
  'eliminación de cuenta ya confirmada',
  'el checkout rechaza atómicamente una eliminación ya confirmada'
);
select is(
  (select terminos_aceptados_version from public.accesos_comerciales where user_id = '00000000-0000-0000-0000-000000000001'),
  null::text,
  'el checkout rechazado no registra una aceptación inexistente'
);
select ok(
  not has_function_privilege('authenticated', 'public.preparar_checkout_comercial(uuid,text,text)', 'execute'),
  'solo service_role puede preparar el checkout comercial'
);

select * from finish();
rollback;
