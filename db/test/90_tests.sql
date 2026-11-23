\set ON_ERROR_STOP 1
-- Every negative test uses pg_temp.denied(): it FAILS if the statement succeeds, and only passes
-- when the statement errors with the expected SQLSTATE (review H2-06: a test must not be able to
-- catch its own failure assertion).

create or replace function pg_temp.expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok: %', msg;
end $$;

create or replace function pg_temp.denied(q text, expected_state text, msg text) returns void language plpgsql as $$
declare st text;
begin
  begin
    execute q;
  exception when others then
    st := sqlstate;
    if st = expected_state then
      raise notice 'ok: % (denied with %)', msg, st;
      return;
    end if;
    raise exception 'FAIL: % (unexpected error %: %)', msg, st, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', msg;
end $$;
grant execute on function pg_temp.expect(boolean, text) to public;
grant execute on function pg_temp.denied(text, text, text) to public;

-- meta-test: the helper itself must fail when a 'denied' statement actually succeeds
do $$
begin
  perform pg_temp.denied('select 1', '42501', 'meta');
  raise exception 'META-FAIL';
exception when raise_exception then
  if sqlerrm like 'FAIL: meta (statement succeeded)%' then
    raise notice 'ok: denied() fails when the statement succeeds';
  else
    raise exception 'helper is broken: %', sqlerrm;
  end if;
end $$;

-- fixtures ---------------------------------------------------------------------------------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'abedeer332@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'x@y.z', now());
insert into public.activation_codes(code_hash, plan, max_uses, ref)
  values (encode(extensions.digest('OHDAAAAABBBBCCCCDDDD', 'sha256'), 'hex'), 'single', 1, 'aaaaaaaaaaaaaaaa');

select pg_temp.expect((select count(*) from public.user_roles
  where user_id = '00000000-0000-0000-0000-00000000000a' and role = 'admin') = 1,
  'confirmed owner email is bootstrapped as the first admin');
select pg_temp.expect((select count(*) from public.user_roles
  where user_id = '00000000-0000-0000-0000-00000000000b') = 0, 'other users get no role');

-- T1 anon -----------------------------------------------------------------------------------
set role anon;
select pg_temp.denied($q$select public.redeem_activation_v2('x', 'y')$q$, '42501', 'anon cannot call redeem_v2');
select pg_temp.denied($q$select public.redeem_activation('x')$q$, '42883', 'old client-callable redeem no longer exists');
select pg_temp.denied($q$select 1 from public.activation_codes$q$, '42501', 'anon cannot read codes');
select pg_temp.denied($q$select public.rate_limit_hit('a', 1, 60)$q$, '42501', 'anon cannot touch rate limits');
select pg_temp.denied($q$select * from public.get_entitlement_signing_key()$q$, '42501', 'anon cannot read signing key');
select pg_temp.denied($q$select public.has_role('00000000-0000-0000-0000-00000000000a', 'admin')$q$, '42501', 'anon cannot probe roles');
select pg_temp.denied($q$select * from private.signing_keys$q$, '42501', 'anon cannot read private schema');
reset role;

-- T2 normal user (even with aal2) -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from public.activation_codes) = 0, 'normal user reads 0 codes');
select pg_temp.denied($q$select public.admin_create_code(repeat('a', 64), 'single', 2, '')$q$, 'P0001', 'normal user cannot create code');
select pg_temp.denied($q$insert into public.activation_codes(code_hash, plan) values ('z', 'single')$q$, '42501', 'no direct insert');
select pg_temp.denied($q$update public.activation_codes set uses = 0$q$, '42501', 'no direct update');
select pg_temp.denied($q$select public.admin_revoke_code('aaaaaaaaaaaaaaaa')$q$, 'P0001', 'normal user cannot revoke');
select pg_temp.denied($q$select public.has_role('00000000-0000-0000-0000-00000000000a', 'admin')$q$, '42501', 'authenticated cannot probe roles');
select pg_temp.denied($q$select * from public.get_entitlement_signing_key()$q$, '42501', 'authenticated cannot read signing key');
select pg_temp.expect((public.my_admin_status() ->> 'is_admin')::boolean = false, 'my_admin_status false for normal user');
reset role;
select pg_temp.expect((select count(*) from public.activation_codes where code_hash = 'z') = 0, 'state: no row was inserted');
select pg_temp.expect((select uses from public.activation_codes where ref = 'aaaaaaaaaaaaaaaa') = 0, 'state: uses unchanged');

-- T3 admin WITHOUT MFA (aal1) ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', false);
set role authenticated;
select pg_temp.expect((select count(*) from public.activation_codes) = 0, 'admin aal1 reads 0 codes');
select pg_temp.denied($q$select public.admin_create_code(repeat('a', 64), 'single', 2, '')$q$, 'P0001', 'admin aal1 cannot create code');
select pg_temp.expect((select count(*) from public.audit_log) = 0, 'admin aal1 reads 0 audit rows');
reset role;
select pg_temp.expect((select count(*) from public.activation_codes) = 1, 'state: aal1 created nothing');

-- T4 admin WITH MFA ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', false);
set role authenticated;
select public.admin_create_code(encode(extensions.digest('OHDAZZZZYYYYXXXXWWWW', 'sha256'), 'hex'), 'family', 99, 'txn 123');
select pg_temp.expect((select max_uses from public.activation_codes where plan = 'family') = 5, 'max_uses capped at 5');
select pg_temp.expect((select count(*) from public.activation_codes) = 2, 'admin aal2 reads codes');
select pg_temp.expect((select count(*) from public.audit_log where action = 'code.created') = 1, 'creation audited');
select pg_temp.denied($q$select public.admin_create_code('not-a-hash', 'single', 2, '')$q$, 'P0001', 'bad hash rejected');
select pg_temp.denied($q$select public.admin_revoke_code('nope')$q$, 'P0001', 'revoking an unknown ref fails');
select pg_temp.denied($q$update public.audit_log set action = 'x'$q$, '42501', 'admin cannot update audit');
select pg_temp.expect((public.my_admin_status() ->> 'is_admin')::boolean and public.my_admin_status() ->> 'aal' = 'aal2', 'my_admin_status for admin');
reset role;
select pg_temp.expect(not exists (select 1 from public.activation_codes
  where ref = substr(code_hash, 1, 16) and created_by is not null), 'refs of admin-created codes are random');

-- T5 audit log is append-only even for the owner ---------------------------------------------
select pg_temp.denied($q$delete from public.audit_log$q$, 'P0001', 'audit delete blocked for owner');
select pg_temp.denied($q$update public.audit_log set action = 'x'$q$, 'P0001', 'audit update blocked for owner');
select pg_temp.denied($q$truncate public.audit_log$q$, 'P0001', 'audit truncate blocked for owner');

-- T6 service role: idempotent redeem ------------------------------------------------------------
set role service_role;
select pg_temp.expect((public.redeem_activation_v2('ohda-aaaa bbbb-cccc-dddd', 'req-000000000000001') ->> 'ok')::boolean, 'redeem with dashes/spaces/lowercase');
select pg_temp.expect((public.redeem_activation_v2('OHDAAAAABBBBCCCCDDDD', 'req-000000000000001') ->> 'replayed')::boolean, 'retry with the same request id returns the same result');
select pg_temp.expect((public.redeem_activation_v2('OHDAAAAABBBBCCCCDDDD', 'req-000000000000002') ->> 'reason') = 'used', 'a different request id is a new use (max 1)');
select pg_temp.expect((public.redeem_activation_v2('OHDAZZZZYYYYXXXXWWWW', 'req-000000000000001') ->> 'reason') = 'invalid', 'a request id cannot be replayed for another code');
select pg_temp.expect((public.redeem_activation_v2('OHDA0000000000000000', 'req-000000000000003') ->> 'reason') = 'invalid', 'unknown code invalid');
select pg_temp.expect((public.redeem_activation_v2('short', 'req-000000000000004') ->> 'reason') = 'invalid', 'short code invalid');
select pg_temp.expect((public.redeem_activation_v2('OHDAZZZZYYYYXXXXWWWW', 'bad id!') ->> 'reason') = 'invalid', 'malformed request id rejected');
select pg_temp.expect(public.rate_limit_hit('b1', 2, 3600) and public.rate_limit_hit('b1', 2, 3600)
  and not public.rate_limit_hit('b1', 2, 3600), 'rate limit blocks the third hit');
select pg_temp.denied($q$select public.rate_limit_hit(repeat('x', 200), 1, 60)$q$, 'P0001', 'oversized bucket rejected');
reset role;
select pg_temp.expect((select uses from public.activation_codes where ref = 'aaaaaaaaaaaaaaaa') = 1, 'state: replay did not consume a second use');

-- T7 signing keys: exactly one active -------------------------------------------------------------
insert into private.signing_keys(id, pkcs8_b64url, public_raw_b64url, active) values ('k1', 'p1', 'u1', true);
select pg_temp.denied($q$insert into private.signing_keys(id, pkcs8_b64url, public_raw_b64url, active) values ('k2', 'p2', 'u2', true)$q$, '23505', 'only one active signing key');
insert into private.signing_keys(id, pkcs8_b64url, public_raw_b64url) values ('k2', 'p2', 'u2');
set role service_role;
select pg_temp.expect((select id from public.get_entitlement_signing_key()) = 'k1', 'service role gets the active key, not the newest');
select pg_temp.expect(length((select rate_secret from public.get_entitlement_signing_key())) = 64, 'stable rate-limit secret is provisioned');
reset role;

-- T8 bootstrap is one-time, even after all admins are removed ----------------------------------
delete from public.user_roles where role = 'admin';
insert into auth.users values ('00000000-0000-0000-0000-00000000000c', 'ABEDEER332@gmail.com', now());
select pg_temp.expect((select count(*) from public.user_roles where role = 'admin') = 0, 'no re-bootstrap after admins were removed');
select pg_temp.expect((select count(*) from public.audit_log where action = 'admin.bootstrap') = 1, 'bootstrap audited exactly once');

-- T9 definer functions pin search_path ------------------------------------------------------------
select pg_temp.expect(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=""')
), 'every SECURITY DEFINER function in public sets search_path to empty');

-- T10 public keys are served, private keys never
set role service_role;
select pg_temp.expect((select count(*) from public.entitlement_public_keys()) >= 1, 'public keys listed for verification');
select pg_temp.expect((select public_raw_b64url from public.get_entitlement_signing_key()) is not null, 'active key returns its public half for the pair check');
reset role;
set role anon;
select pg_temp.denied($q$select * from public.entitlement_public_keys()$q$, '42501', 'anon calls go through the server route only');
select pg_temp.denied($q$select public.install_signing_key('kz', 'p', 'u')$q$, '42501', 'anon cannot install keys');
reset role;
set role service_role;
select pg_temp.expect(not public.install_signing_key('kz', 'p', 'u'), 'install refuses while a key is active');
reset role;

select 'ALL DB TESTS PASSED';
