export function hasCompletedInitialSetup(claims: Record<string, unknown>) {
  const metadata = claims.user_metadata;
  return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).paoween_onboarding_completed === true);
}

export function onboardingSessionScope(userId: string, claims: Record<string, unknown>) {
  return `${userId}:${typeof claims.session_id === "string" ? claims.session_id : ""}`;
}
