import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type AiReadiness = {
  apiKeyConfigured: boolean;
  modelConfigured: boolean;
  serviceKeyConfigured: boolean;
  policyConfigured: boolean;
  policyEnabled: boolean;
  modelRateConfigured: boolean;
  ready: boolean;
  model: string | null;
  inputRateUsdPerMillionTokens: number | null;
  cachedInputRateUsdPerMillionTokens: number | null;
  outputRateUsdPerMillionTokens: number | null;
  dailyRequestsPerUser: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  globalDailySpendLimitUsd: number | null;
};

export async function getAiReadiness(): Promise<AiReadiness> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
  const readiness: AiReadiness = {
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    modelConfigured: Boolean(model),
    serviceKeyConfigured: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
    policyConfigured: false,
    policyEnabled: false,
    modelRateConfigured: false,
    ready: false,
    model,
    inputRateUsdPerMillionTokens: null,
    cachedInputRateUsdPerMillionTokens: null,
    outputRateUsdPerMillionTokens: null,
    dailyRequestsPerUser: null,
    maxInputTokens: null,
    maxOutputTokens: null,
    globalDailySpendLimitUsd: null,
  };

  if (!readiness.serviceKeyConfigured || !readiness.modelConfigured) return readiness;
  try {
    const supabase = createServiceClient();
    const [policyResult, rateResult] = await Promise.all([
      supabase.from("ai_policy")
        .select("enabled,max_daily_requests_per_user,max_input_tokens,max_output_tokens,global_daily_spend_limit_usd")
        .eq("singleton", true).maybeSingle(),
      supabase.from("ai_model_rates")
        .select("active,input_usd_per_million_tokens,cached_input_usd_per_million_tokens,output_usd_per_million_tokens")
        .eq("model", model).maybeSingle(),
    ]);
    if (!policyResult.error && policyResult.data) {
      readiness.policyConfigured = true;
      readiness.policyEnabled = policyResult.data.enabled;
      readiness.dailyRequestsPerUser = policyResult.data.max_daily_requests_per_user;
      readiness.maxInputTokens = policyResult.data.max_input_tokens;
      readiness.maxOutputTokens = policyResult.data.max_output_tokens;
      readiness.globalDailySpendLimitUsd = Number(policyResult.data.global_daily_spend_limit_usd);
    }
    readiness.modelRateConfigured = !rateResult.error && rateResult.data?.active === true;
    if (!rateResult.error && rateResult.data) {
      readiness.inputRateUsdPerMillionTokens = Number(rateResult.data.input_usd_per_million_tokens);
      readiness.cachedInputRateUsdPerMillionTokens = Number(rateResult.data.cached_input_usd_per_million_tokens);
      readiness.outputRateUsdPerMillionTokens = Number(rateResult.data.output_usd_per_million_tokens);
    }
  } catch {
    // Settings must not expose server errors or secret environment values.
  }

  readiness.ready = readiness.apiKeyConfigured && readiness.modelConfigured && readiness.serviceKeyConfigured &&
    readiness.policyConfigured && readiness.policyEnabled && readiness.modelRateConfigured;
  return readiness;
}
