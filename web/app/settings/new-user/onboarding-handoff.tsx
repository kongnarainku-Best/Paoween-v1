"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

type Summary = { kind: "summary"; fileKind: "image" | "pdf" | null };
type Slip = { kind: "slip"; file: File };
type Handoff = Summary | Slip;
type PendingHandoff = { scope: string; payload: Handoff; expires: ReturnType<typeof setTimeout> };
type HandoffStore = {
  offer: (scope: string, payload: Handoff) => void;
  take: (scope: string, kind: Handoff["kind"]) => Handoff | null;
  discard: (scope: string) => void;
};

const handoffLifetimeMs = 5 * 60 * 1000;
const HandoffContext = createContext<HandoffStore | null>(null);

export function OnboardingHandoffProvider({ children }: { children: ReactNode }) {
  const pending = useRef<PendingHandoff | null>(null);
  const store = useMemo<HandoffStore>(() => {
    function clear() {
      if (pending.current) clearTimeout(pending.current.expires);
      pending.current = null;
    }
    return {
      offer(scope, payload) {
        clear();
        pending.current = { scope, payload, expires: setTimeout(clear, handoffLifetimeMs) };
      },
      take(scope, kind) {
        const current = pending.current;
        if (!current) return null;
        if (current.scope !== scope) {
          clear();
          return null;
        }
        if (current.payload.kind !== kind) return null;
        clear();
        return current.payload;
      },
      discard(scope) {
        if (pending.current?.scope === scope) clear();
      },
    };
  }, []);

  return <HandoffContext.Provider value={store}>{children}</HandoffContext.Provider>;
}

export function useOnboardingHandoff() {
  const store = useContext(HandoffContext);
  if (!store) throw new Error("Onboarding handoff provider is missing");
  return store;
}
