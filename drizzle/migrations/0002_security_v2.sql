-- Ohda security v2: MFA-gated admin, rate limiting, append-only audit log, orders,
-- server-only idempotent redeem, Ed25519 signing keys with ids, admin bootstrap marker.
--
-- Conventions (review M2-04): every SECURITY DEFINER function uses `set search_path = ''` and
-- fully qualified names; EXECUTE is revoked from public and granted only to the intended role.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 0) has_role: pinned search_path, not callable by clients (role probing, review L6) ---------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;

-- 1) Admin access requires an MFA session (aal2) -------------------------------------------
create or replace function public.is_admin_mfa()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;
revoke all on function public.is_admin_mfa() from public, anon;
grant execute on function public.is_admin_mfa() to authenticated;

drop policy if exists "admins select" on public.activation_codes;
drop policy if exists "admins insert" on public.activation_codes;
drop policy if exists "admins update" on public.activation_codes;
drop policy if exists "admin mfa select" on public.activation_codes;
create policy "admin mfa select" on public.activation_codes
  for select to authenticated using (public.is_admin_mfa());
-- inserts/updates only through the security-definer functions below (no direct writes)
revoke insert, update, delete, truncate on public.activation_codes from authenticated, anon;

alter table public.activation_codes add column if not exists ref text unique;
-- ref is random (not derived from the code hash) so tokens and logs reveal nothing about the code
update public.activation_codes
   set ref = substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16)
 where ref is null;

-- 2) Audit log: append-only for every application role --------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists "admin mfa read audit" on public.audit_log;
create policy "admin mfa read audit" on public.audit_log
  for select to authenticated using (public.is_admin_mfa());

create or replace function public.audit_log_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end $$;
drop trigger if exists audit_log_no_update on public.audit_log;
revoke all on function public.audit_log_immutable() from public, anon, authenticated;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

create or replace function public.audit(p_action text, p_target text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log(actor, action, target, details)
  values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- 3) Rate limiting (fixed window). Buckets are HMACs computed by the server; no raw IPs. -----
create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);
alter table public.rate_limits enable row level security;
create index if not exists rate_limits_window_start on public.rate_limits (window_start);
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare w timestamptz; n int;
begin
  if p_window_seconds < 1 or p_limit < 1 or length(p_bucket) > 128 then
    raise exception 'bad rate limit arguments';
  end if;
  w := pg_catalog.to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits(bucket, window_start, hits) values (p_bucket, w, 1)
    on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
    returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return n <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- 4) Redeem: server-only and idempotent (review H2-04) --------------------------------------
-- The browser sends a random request id with the code. A retry with the same id and code
-- returns the original result without consuming another use (lost responses, crashes).
-- the old client-callable redeem is removed entirely
drop function if exists public.redeem_activation(text);

create table if not exists private.redemptions (
  request_hash text primary key,
  code_hash text not null,
  plan text not null,
  ref text not null,
  at timestamptz not null default now()
);
revoke all on private.redemptions from public, anon, authenticated;

drop function if exists public.redeem_activation_v2(text);
create or replace function public.redeem_activation_v2(p_code text, p_request text)
returns json language plpgsql security definer set search_path = '' as $$
declare norm text; h text; rh text; prev record; r record;
begin
  norm := pg_catalog.regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  if length(norm) < 16 or length(norm) > 40 then
    return json_build_object('ok', false, 'reason', 'invalid');
  end if;
  if p_request is null or p_request !~ '^[A-Za-z0-9_-]{16,64}$' then
    return json_build_object('ok', false, 'reason', 'invalid');
  end if;
  h := encode(extensions.digest(norm, 'sha256'), 'hex');
  rh := encode(extensions.digest('ohda-redeem|' || p_request, 'sha256'), 'hex');

  -- serialise attempts for the same request id
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(rh));
  select plan, ref, code_hash into prev from private.redemptions where request_hash = rh;
  if found then
    if prev.code_hash <> h then
      return json_build_object('ok', false, 'reason', 'invalid');
    end if;
    return json_build_object('ok', true, 'plan', prev.plan, 'ref', prev.ref, 'replayed', true);
  end if;

  update public.activation_codes set uses = uses + 1
    where code_hash = h and uses < max_uses
    returning plan, ref into r;
  if r.plan is not null then
    insert into private.redemptions(request_hash, code_hash, plan, ref) values (rh, h, r.plan, r.ref);
    insert into public.audit_log(actor, action, target, details)
      values (null, 'code.redeemed', r.ref, '{}'::jsonb);
    return json_build_object('ok', true, 'plan', r.plan, 'ref', r.ref);
  end if;
  if exists (select 1 from public.activation_codes where code_hash = h) then
    return json_build_object('ok', false, 'reason', 'used');
  end if;
  return json_build_object('ok', false, 'reason', 'invalid');
end $$;
revoke all on function public.redeem_activation_v2(text, text) from public, anon, authenticated;
grant execute on function public.redeem_activation_v2(text, text) to service_role;

-- 5) Admin code management: MFA required + audited ------------------------------------------
create or replace function public.admin_create_code(p_hash text, p_plan text, p_max_uses int, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
        new_ref text := substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if not public.is_admin_mfa() then raise exception 'not authorized'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad hash'; end if;
  if p_plan not in ('single', 'family') then raise exception 'bad plan'; end if;
  insert into public.activation_codes(code_hash, plan, max_uses, note, created_by, ref)
    values (lower(p_hash), p_plan, least(greatest(1, p_max_uses), 5),
            nullif(left(p_note, 120), ''), auth.uid(), new_ref)
    returning id into new_id;
  perform public.audit('code.created', new_ref,
    json_build_object('plan', p_plan, 'max_uses', least(greatest(1, p_max_uses), 5))::jsonb);
  return new_id;
end $$;
revoke all on function public.admin_create_code(text, text, int, text) from public, anon;
grant execute on function public.admin_create_code(text, text, int, text) to authenticated;

create or replace function public.admin_revoke_code(p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin_mfa() then raise exception 'not authorized'; end if;
  update public.activation_codes set max_uses = uses where ref = p_ref;
  if not found then raise exception 'unknown ref'; end if;
  perform public.audit('code.revoked', p_ref, '{}'::jsonb);
end $$;
revoke all on function public.admin_revoke_code(text) from public, anon;
grant execute on function public.admin_revoke_code(text) to authenticated;

-- 6) Orders (online payments). No personal data stored. -----------------------------------
--    Sold by the Egyptian company: EGP inside Egypt, USD outside Egypt.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('single', 'family')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null check (currency in ('EGP', 'USD')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  provider text not null default 'paymob',
  provider_order_id text unique,
  provider_txn_id text unique,
  claim_secret_hash text not null,
  entitlement_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
drop policy if exists "admin mfa read orders" on public.orders;
create policy "admin mfa read orders" on public.orders
  for select to authenticated using (public.is_admin_mfa());

-- 7) Entitlement signing keys (Ed25519, PKCS#8, base64url) with explicit ids --------------
--    Exactly one key is active (used to sign). Clients verify with a registry of public keys by
--    id, so a new key can be added to the client BEFORE it is activated here (review H2-08).
create table if not exists private.signing_keys (
  id text primary key,
  pkcs8_b64url text not null,
  public_raw_b64url text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
revoke all on private.signing_keys from public, anon, authenticated;
create unique index if not exists signing_keys_one_active on private.signing_keys (active) where active;

-- Stable secret for rate-limit bucket HMACs, independent of signing-key rotation (review M4-03).
create table if not exists private.settings (
  name text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;
insert into private.settings(name, value)
  values ('rate_limit_secret', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict do nothing;

drop function if exists public.get_entitlement_signing_key();
create or replace function public.get_entitlement_signing_key()
returns table (id text, pkcs8_b64url text, rate_secret text)
language sql stable security definer set search_path = '' as $$
  select k.id, k.pkcs8_b64url, (select s.value from private.settings s where s.name = 'rate_limit_secret')
  from private.signing_keys k where k.active
$$;
revoke all on function public.get_entitlement_signing_key() from public, anon, authenticated;
grant execute on function public.get_entitlement_signing_key() to service_role;

-- 8) Admin bootstrap: one time only, permanently (reviews H3, M2-05) -----------------------
--    The email trigger can create the FIRST admin once, for a confirmed address. A permanent
--    marker prevents any re-bootstrap even if every admin role is later removed. Later roles are
--    granted by user id in SQL by the database owner.
create table if not exists private.bootstrap (
  name text primary key,
  done_at timestamptz not null default now(),
  user_id uuid
);
revoke all on private.bootstrap from public, anon, authenticated;
insert into private.bootstrap(name, user_id)
  select 'first-admin', ur.user_id from public.user_roles ur where ur.role = 'admin' limit 1
  on conflict do nothing;

create or replace function public.grant_admin_on_confirm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) = 'abedeer332@gmail.com' and new.email_confirmed_at is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ohda-first-admin'));
    if not exists (select 1 from private.bootstrap where name = 'first-admin') then
      insert into private.bootstrap(name, user_id) values ('first-admin', new.id);
      insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
      insert into public.audit_log(actor, action, target, details)
        values (new.id, 'admin.bootstrap', new.id::text, '{}'::jsonb);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.grant_admin_on_confirm() from public, anon, authenticated;

-- 9) What the admin UI needs about the CURRENT user only -----------------------------------
create or replace function public.my_admin_status()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'is_admin', public.has_role(auth.uid(), 'admin'::public.app_role),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1')
  )
$$;
revoke all on function public.my_admin_status() from public, anon;
grant execute on function public.my_admin_status() to authenticated;

-- 10) One-time signing-key bootstrap (the private key is generated inside the server) ----------
--     The operator stores only sha256('ohda-key-bootstrap|' || token) in private.bootstrap with
--     name 'key-token:<hash>'. The token is consumed atomically on first use.
create or replace function public.consume_bootstrap_token(p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from private.bootstrap where name = 'key-token:' || p_hash;
  return found;
end $$;
revoke all on function public.consume_bootstrap_token(text) from public, anon, authenticated;
grant execute on function public.consume_bootstrap_token(text) to service_role;

create or replace function public.install_signing_key(p_id text, p_pkcs8 text, p_pub text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_id !~ '^[a-z0-9-]{1,32}$' then raise exception 'bad key id'; end if;
  if exists (select 1 from private.signing_keys where active) then return false; end if;
  insert into private.signing_keys(id, pkcs8_b64url, public_raw_b64url, active)
    values (p_id, p_pkcs8, p_pub, true);
  insert into public.audit_log(actor, action, target, details)
    values (null, 'signing_key.installed', p_id, json_build_object('public', p_pub)::jsonb);
  return true;
end $$;
revoke all on function public.install_signing_key(text, text, text) from public, anon, authenticated;
grant execute on function public.install_signing_key(text, text, text) to service_role;
