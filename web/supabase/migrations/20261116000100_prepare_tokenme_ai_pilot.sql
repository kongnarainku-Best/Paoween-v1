-- Prepare conservative app-side limits for TokenMe. AI stays disabled until the
-- owner adds the exact TokenMe model rates to ai_model_rates and enables policy.
-- The $3/day app cap leaves $2/day under the provider's displayed $5/day limit
-- for other API keys and playground use. The provider's weekly/monthly caps also apply.
insert into public.ai_policy (
  singleton,
  enabled,
  max_daily_requests_per_user,
  max_input_tokens,
  max_output_tokens,
  global_daily_spend_limit_usd
) values (
  true,
  false,
  20,
  20000,
  600,
  3.00
)
on conflict (singleton) do update set
  enabled = false,
  max_daily_requests_per_user = excluded.max_daily_requests_per_user,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  global_daily_spend_limit_usd = excluded.global_daily_spend_limit_usd,
  updated_at = now();
