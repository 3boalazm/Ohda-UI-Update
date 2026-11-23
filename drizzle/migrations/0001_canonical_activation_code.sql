create or replace function public.redeem_activation(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare norm text; h text; p text;
begin
  norm := regexp_replace(upper(coalesce(p_code,'')), '[^A-Z0-9]', '', 'g');
  h := encode(extensions.digest(norm, 'sha256'), 'hex');
  update public.activation_codes set uses = uses + 1
    where code_hash = h and uses < max_uses returning plan into p;
  if p is not null then return json_build_object('ok', true, 'plan', p); end if;
  if exists (select 1 from public.activation_codes where code_hash = h) then
    return json_build_object('ok', false, 'reason', 'used');
  end if;
  return json_build_object('ok', false, 'reason', 'invalid');
end $$;