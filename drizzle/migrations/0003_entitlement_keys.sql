-- Signing keys are generated inside the server on first need (no person ever handles a private
-- key), and the public halves are published by the server so browsers can verify tokens.
drop function if exists public.consume_bootstrap_token(text);
delete from private.bootstrap where name like 'key-token:%';

drop function if exists public.get_entitlement_signing_key();
create or replace function public.get_entitlement_signing_key()
returns table (id text, pkcs8_b64url text, public_raw_b64url text, rate_secret text)
language sql stable security definer set search_path = '' as $$
  select k.id, k.pkcs8_b64url, k.public_raw_b64url,
         (select s.value from private.settings s where s.name = 'rate_limit_secret')
  from private.signing_keys k where k.active
$$;
revoke all on function public.get_entitlement_signing_key() from public, anon, authenticated;
grant execute on function public.get_entitlement_signing_key() to service_role;

-- public halves only (active and retired), for client-side verification
create or replace function public.entitlement_public_keys()
returns table (id text, public_raw_b64url text)
language sql stable security definer set search_path = '' as $$
  select k.id, k.public_raw_b64url from private.signing_keys k order by k.created_at
$$;
revoke all on function public.entitlement_public_keys() from public, anon, authenticated;
grant execute on function public.entitlement_public_keys() to service_role;
