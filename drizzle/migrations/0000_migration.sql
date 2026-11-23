create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text unique not null,
  plan text not null check (plan in ('single','family')),
  max_uses int not null default 2,
  uses int not null default 0,
  note text,
  created_at timestamptz default now(),
  created_by uuid
);
grant select, insert, update on public.activation_codes to authenticated;
grant all on public.activation_codes to service_role;
alter table public.activation_codes enable row level security;
create policy "admins select" on public.activation_codes for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins insert" on public.activation_codes for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admins update" on public.activation_codes for update to authenticated using (public.has_role(auth.uid(),'admin'));

create or replace function public.redeem_activation(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare norm text; h text; p text;
begin
  norm := upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g'));
  h := encode(extensions.digest(norm, 'sha256'), 'hex');
  update public.activation_codes set uses = uses + 1
    where code_hash = h and uses < max_uses returning plan into p;
  if p is not null then return json_build_object('ok', true, 'plan', p); end if;
  if exists (select 1 from public.activation_codes where code_hash = h) then
    return json_build_object('ok', false, 'reason', 'used');
  end if;
  return json_build_object('ok', false, 'reason', 'invalid');
end $$;
revoke all on function public.redeem_activation(text) from public;
grant execute on function public.redeem_activation(text) to anon, authenticated;

create or replace function public.admin_create_code(p_hash text, p_plan text, p_max_uses int, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'not authorized'; end if;
  insert into public.activation_codes(code_hash, plan, max_uses, note, created_by)
    values (lower(p_hash), p_plan, greatest(1, p_max_uses), nullif(p_note,''), auth.uid())
    returning id into new_id;
  return new_id;
end $$;
revoke all on function public.admin_create_code(text,text,int,text) from public;
grant execute on function public.admin_create_code(text,text,int,text) to authenticated;

create or replace function public.grant_admin_on_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'abedeer332@gmail.com' and new.email_confirmed_at is not null then
    insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed_admin
after insert or update of email_confirmed_at on auth.users
for each row execute function public.grant_admin_on_confirm();