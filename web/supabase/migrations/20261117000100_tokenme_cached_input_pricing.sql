-- Apply TokenMe's owner-provided GLM 5.3 Flash NVFP4 prices and account for
-- cached prompt tokens when the OpenAI-compatible response reports them.
-- Request reservations still use the full input price as a conservative upper bound.
begin;

alter table public.ai_model_rates
  add column cached_input_usd_per_million_tokens numeric(12, 6) not null default 0
  check (cached_input_usd_per_million_tokens >= 0);

alter table public.ai_usage_events
  add column cached_input_usd_per_million_tokens numeric(12, 6) not null default 0
  check (cached_input_usd_per_million_tokens >= 0),
  add column cached_input_tokens integer not null default 0
  check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens);

insert into public.ai_model_rates (
  model,
  input_usd_per_million_tokens,
  cached_input_usd_per_million_tokens,
  output_usd_per_million_tokens,
  active
) values (
  'nvidia/glm-5.3-flash-nvfp4',
  0.15,
  0.05,
  1.20,
  true
)
on conflict (model) do update set
  input_usd_per_million_tokens = excluded.input_usd_per_million_tokens,
  cached_input_usd_per_million_tokens = excluded.cached_input_usd_per_million_tokens,
  output_usd_per_million_tokens = excluded.output_usd_per_million_tokens,
  active = true,
  updated_at = now();

drop function if exists public.finish_ai_request(uuid, uuid, integer, integer, boolean);

create function public.finish_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_succeeded boolean,
  p_cached_input_tokens integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_actual_cost numeric(14, 8);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_user_id is null or p_request_id is null or p_input_tokens is null or p_output_tokens is null
     or p_succeeded is null or p_cached_input_tokens is null or p_input_tokens < 0 or p_output_tokens < 0
     or p_cached_input_tokens < 0 or p_cached_input_tokens > p_input_tokens then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  select * into v_event from public.ai_usage_events
  where user_id = p_user_id and request_id = p_request_id for update;
  if not found or v_event.status <> 'reserved' then
    raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not p_succeeded then
    update public.ai_usage_events
      set status = 'failed', reserved_cost_usd = 0, completed_at = now()
      where id = v_event.id;
    return;
  end if;

  if p_input_tokens > v_event.max_input_tokens or p_output_tokens > v_event.max_output_tokens then
    raise exception 'TOKEN_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  v_actual_cost := round((
    (p_input_tokens - p_cached_input_tokens) * v_event.input_usd_per_million_tokens +
    p_cached_input_tokens * v_event.cached_input_usd_per_million_tokens +
    p_output_tokens * v_event.output_usd_per_million_tokens
  ) / 1000000, 8);
  if v_actual_cost > v_event.reserved_cost_usd then
    raise exception 'RESERVATION_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.ai_usage_events
    set status = 'completed', input_tokens = p_input_tokens, output_tokens = p_output_tokens,
        cached_input_tokens = p_cached_input_tokens, estimated_cost_usd = v_actual_cost,
        reserved_cost_usd = 0, completed_at = now()
    where id = v_event.id;
end;
$$;

revoke all on function public.finish_ai_request(uuid, uuid, integer, integer, boolean, integer) from public, anon, authenticated;
grant execute on function public.finish_ai_request(uuid, uuid, integer, integer, boolean, integer) to service_role;

commit;
