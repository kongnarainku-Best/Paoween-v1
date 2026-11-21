-- Paoween hosted foundation. Run only in the new SaaS Supabase project.
-- No local Personal_money records are seeded by this migration.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, left(nullif(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute procedure public.touch_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'investment', 'transfer')),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  amount_thb numeric(14, 2) not null check (amount_thb > 0),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  action text,
  source text not null default 'manual_entry',
  source_reference text,
  data_quality_flag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create trigger transactions_touch_updated_at before update on public.transactions
  for each row execute procedure public.touch_updated_at();

create table public.tax_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid,
  tax_year smallint not null check (tax_year between 2400 and 2700),
  record_type text not null check (record_type in ('income', 'income_total', 'deduction', 'deduction_total', 'tax_paid', 'taxable_income', 'tax_estimate', 'tax_saving')),
  tax_category text not null check (char_length(btrim(tax_category)) between 1 and 120),
  amount_thb numeric(14, 2) check (amount_thb is null or amount_thb >= 0),
  source_reference text,
  document_status text not null default 'missing' check (document_status in ('missing', 'provided', 'verified', 'not_applicable')),
  review_status text not null default 'needs_review' check (review_status in ('needs_review', 'confirmed', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, transaction_id)
    references public.transactions (user_id, id)
    on delete set null (transaction_id)
);

create index tax_records_user_year_idx on public.tax_records (user_id, tax_year desc);
create trigger tax_records_touch_updated_at before update on public.tax_records
  for each row execute procedure public.touch_updated_at();

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  input_usd_per_million_tokens numeric(12, 6) not null check (input_usd_per_million_tokens >= 0),
  output_usd_per_million_tokens numeric(12, 6) not null check (output_usd_per_million_tokens >= 0),
  max_input_tokens integer not null check (max_input_tokens > 0),
  max_output_tokens integer not null check (max_output_tokens > 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(14, 8) not null default 0 check (estimated_cost_usd >= 0),
  reserved_cost_usd numeric(14, 8) not null default 0 check (reserved_cost_usd >= 0),
  status text not null check (status in ('reserved', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_id)
);

create index ai_usage_user_date_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_status_date_idx on public.ai_usage_events (status, created_at desc);

-- Deliberately has no row until the operator chooses and documents these limits.
create table public.ai_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  max_daily_requests_per_user integer not null default 20 check (max_daily_requests_per_user between 1 and 1000),
  max_input_tokens integer not null default 20000 check (max_input_tokens between 1 and 100000),
  max_output_tokens integer not null default 600 check (max_output_tokens between 1 and 10000),
  global_daily_spend_limit_usd numeric(12, 4) not null check (global_daily_spend_limit_usd > 0),
  updated_at timestamptz not null default now()
);

-- Pricing is intentionally operator-configured; model prices can change.
create table public.ai_model_rates (
  model text primary key check (char_length(btrim(model)) between 1 and 100),
  input_usd_per_million_tokens numeric(12, 6) not null check (input_usd_per_million_tokens >= 0),
  output_usd_per_million_tokens numeric(12, 6) not null check (output_usd_per_million_tokens >= 0),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger ai_policy_touch_updated_at before update on public.ai_policy
  for each row execute procedure public.touch_updated_at();
create trigger ai_model_rates_touch_updated_at before update on public.ai_model_rates
  for each row execute procedure public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.tax_records enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_policy enable row level security;
alter table public.ai_model_rates enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage their own transactions"
  on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can manage their own tax records"
  on public.tax_records for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read their own AI usage"
  on public.ai_usage_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.tax_records to authenticated;
grant select on public.ai_usage_events to authenticated;

revoke all on public.ai_policy, public.ai_model_rates from anon, authenticated;
grant all on public.ai_policy, public.ai_model_rates to service_role;
grant all on public.ai_usage_events to service_role;

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
  select count(*)::integer into v_user_requests
    from public.ai_usage_events
    where user_id = p_user_id
      and created_at >= v_day_start
      and status in ('reserved', 'completed');
  if v_user_requests >= v_policy.max_daily_requests_per_user then
    raise exception 'USER_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  -- Reserve worst-case cost for this policy's input and output caps before the model provider call.
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
  from public.ai_usage_events
  where created_at >= v_day_start;

  if v_global_cost + v_reserved_cost > v_policy.global_daily_spend_limit_usd then
    raise exception 'GLOBAL_DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_events (
    request_id, user_id, model, input_usd_per_million_tokens, output_usd_per_million_tokens,
    max_input_tokens, max_output_tokens, status, reserved_cost_usd
  ) values (
    p_request_id, p_user_id, p_model, v_rate.input_usd_per_million_tokens,
    v_rate.output_usd_per_million_tokens, v_policy.max_input_tokens,
    v_policy.max_output_tokens, 'reserved', v_reserved_cost
  );

  return jsonb_build_object('max_output_tokens', v_policy.max_output_tokens);
end;
$$;

create or replace function public.finish_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_succeeded boolean
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
     or p_succeeded is null or p_input_tokens < 0 or p_output_tokens < 0 then
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
    p_input_tokens * v_event.input_usd_per_million_tokens +
    p_output_tokens * v_event.output_usd_per_million_tokens
  ) / 1000000, 8);
  if v_actual_cost > v_event.reserved_cost_usd then
    raise exception 'RESERVATION_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.ai_usage_events
    set status = 'completed', input_tokens = p_input_tokens, output_tokens = p_output_tokens,
        estimated_cost_usd = v_actual_cost, reserved_cost_usd = 0, completed_at = now()
    where id = v_event.id;
end;
$$;

revoke all on function public.reserve_ai_request(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_request(uuid, uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, integer) to service_role;
grant execute on function public.finish_ai_request(uuid, uuid, integer, integer, boolean) to service_role;
