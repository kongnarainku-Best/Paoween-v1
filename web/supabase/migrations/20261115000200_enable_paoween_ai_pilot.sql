-- Legacy OpenAI pilot seed. The TokenMe integration supersedes this configuration;
-- apply 20261116000100_prepare_tokenme_ai_pilot.sql afterwards to keep AI disabled
-- until the TokenMe model's exact rates are configured.
insert into public.ai_model_rates (
  model,
  input_usd_per_million_tokens,
  output_usd_per_million_tokens,
  active
) values (
  'gpt-6-luna',
  0.10,
  0.50,
  true
)
on conflict (model) do update set
  input_usd_per_million_tokens = excluded.input_usd_per_million_tokens,
  output_usd_per_million_tokens = excluded.output_usd_per_million_tokens,
  active = true,
  updated_at = now();

insert into public.ai_policy (
  singleton,
  enabled,
  max_daily_requests_per_user,
  max_input_tokens,
  max_output_tokens,
  global_daily_spend_limit_usd
) values (
  true,
  true,
  20,
  20000,
  600,
  0.05
)
on conflict (singleton) do update set
  enabled = true,
  max_daily_requests_per_user = excluded.max_daily_requests_per_user,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  global_daily_spend_limit_usd = excluded.global_daily_spend_limit_usd,
  updated_at = now();
