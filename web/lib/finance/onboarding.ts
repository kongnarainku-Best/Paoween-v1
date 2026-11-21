export function hasCompletedInitialSetup(claims: Record<string, unknown>) {
  const metadata = claims.user_metadata;
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).paoween_onboarding_completed === true);
}
