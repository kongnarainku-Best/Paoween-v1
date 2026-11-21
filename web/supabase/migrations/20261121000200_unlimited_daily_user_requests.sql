begin;

-- A zero per-user daily request ceiling means unlimited requests. The global
-- daily spend budget and token-size limits still apply.
alter table public.ai_policy
  drop constraint if exists ai_policy_max_daily_requests_per_user_check;
alter table public.ai_policy
  add constraint ai_policy_max_daily_requests_per_user_check
  check (max_daily_requests_per_user between 0 and 1000);

update public.ai_policy
set max_daily_requests_per_user = 0, updated_at = now()
where singleton = true;

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_model text,
  p_estimated_input_tokens integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.ai_policy%rowtype;
  v_rate public.ai_model_rates%rowtype;
  v_day_start timestamptz;
  v_user_requests integer;
  v_global_cost numeric(14, 8);
  v_reserved_cost numeric(14, 8);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_user_id is null or p_request_id is null or p_estimated_input_tokens is null or p_estimated_input_tokens < 1 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  select * into v_policy from public.ai_policy where singleton = true for update;
  if not found or not v_policy.enabled then
    raise exception 'AI_DISABLED' using errcode = 'P0001';
  end if;
  if p_estimated_input_tokens > v_policy.max_input_tokens then
    raise exception 'INPUT_LIMIT' using errcode = 'P0001';
  end if;

  select * into v_rate from public.ai_model_rates where model = p_model and active = true for share;
  if not found then
    raise exception 'MODEL_NOT_CONFIGURED' using errcode = 'P0001';
  end if;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  if v_policy.max_daily_requests_per_user > 0 then
    select count(*)::integer into v_user_requests
      from public.ai_usage_events
      where user_id = p_user_id and created_at >= v_day_start
        and status in ('reserved', 'completed');
    if v_user_requests >= v_policy.max_daily_requests_per_user then
      raise exception 'USER_DAILY_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  v_reserved_cost := round((
    v_policy.max_input_tokens * v_rate.input_usd_per_million_tokens +
    v_policy.max_output_tokens * v_rate.output_usd_per_million_tokens
  ) / 1000000, 8);

  select coalesce(sum(
    case when status = 'completed' then estimated_cost_usd
         when status = 'reserved' then reserved_cost_usd
         else 0 end
  ), 0)::numeric(14, 8)
  into v_global_cost
  from public.ai_usage_events where created_at >= v_day_start;
  if v_global_cost + v_reserved_cost > v_policy.global_daily_spend_limit_usd then
    raise exception 'GLOBAL_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_events (
    request_id, user_id, model, input_usd_per_million_tokens,
    cached_input_usd_per_million_tokens, output_usd_per_million_tokens,
    max_input_tokens, max_output_tokens, status, reserved_cost_usd
  ) values (
    p_request_id, p_user_id, p_model, v_rate.input_usd_per_million_tokens,
    v_rate.cached_input_usd_per_million_tokens, v_rate.output_usd_per_million_tokens,
    v_policy.max_input_tokens, v_policy.max_output_tokens, 'reserved', v_reserved_cost
  );

  return jsonb_build_object('max_output_tokens', v_policy.max_output_tokens);
end;
$$;


revoke all on function public.reserve_ai_request(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, integer) to service_role;

commit;
