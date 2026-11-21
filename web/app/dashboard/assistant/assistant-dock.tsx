"use client";

import { MessageCircle, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PocketOption } from "@/lib/finance/pocket";
import { PaoweenStage } from "@/app/dashboard/paoween-stage";

type MonthOption = { key: string; label: string };
type AssistantOptions = { years: string[]; months: MonthOption[]; initialYear: string; ready: boolean };
type ChatProps = { years: string[]; months: MonthOption[]; initialYear: string; initialMonth: string; ready: boolean; onboardingScope: string; pockets: PocketOption[]; home?: boolean; compact?: boolean; showMascot?: boolean; onClose?: () => void };
const AssistantChat = dynamic<ChatProps>(() => import("@/app/dashboard/assistant/assistant-chat").then((module) => module.AssistantChat), {
  loading: () => <div className="assistant-chat-loading" role="status">เป๋าวีนกำลังเตรียมตัว...</div>,
  ssr: false,
});
type Props = { initialYear: string; onboardingScope: string; pockets: PocketOption[] };

export function AssistantDock({ initialYear, onboardingScope, pockets }: Props) {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard";
  const [open, setOpen] = useState(() => pathname === "/dashboard/assistant");
  const isPinned = pathname.startsWith("/dashboard");
  const [mounted, setMounted] = useState(() => pathname === "/dashboard/assistant");
  const [options, setOptions] = useState<AssistantOptions | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);

  const closeChat = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  useEffect(() => {
    const openChat = () => {
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener("paoween:open-chat", openChat);
    return () => window.removeEventListener("paoween:open-chat", openChat);
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1240px)");
    const mountVisibleAssistant = () => {
      if (desktop.matches) setMounted(true);
    };
    mountVisibleAssistant();
    desktop.addEventListener("change", mountVisibleAssistant);
    return () => desktop.removeEventListener("change", mountVisibleAssistant);
  }, []);

  useEffect(() => {
    if (pathname === "/dashboard/assistant") {
      setMounted(true);
      setOpen(true);
    } else if (previousPath.current === "/dashboard/assistant") {
      setOpen(false);
    }
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!mounted || options) return;
    const controller = new AbortController();
    setOptionsError(false);
    void fetch("/api/ai/options", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load assistant options");
        const result = await response.json() as AssistantOptions;
        if (!Array.isArray(result.years) || !Array.isArray(result.months) || typeof result.initialYear !== "string" || typeof result.ready !== "boolean") {
          throw new Error("Invalid assistant options");
        }
        setOptions(result);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setOptionsError(true);
      });
    return () => controller.abort();
  }, [mounted, options, loadAttempt]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeChat();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, closeChat]);

  useEffect(() => {
    if (!open || isHome || !options) return;
    const frame = window.requestAnimationFrame(() => document.getElementById("assistant-message")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, options, isHome]);

  function showChat() {
    setMounted(true);
    setOpen(true);
  }

  return <>
    <div className={`assistant-dock-root${open ? " is-open" : ""}${isPinned ? " is-pinned" : ""}`}>
      <section className={`assistant-dock-panel${open ? " is-open" : ""}${isPinned ? " is-pinned" : ""}`} id="assistant-dock-panel" role="complementary" aria-label="แชตกับเป๋าวีน" aria-hidden={!open && !isPinned} inert={!open && !isPinned}>
        <button className="assistant-loading-close assistant-dock-close assistant-dock-close-pinned" type="button" onClick={closeChat} aria-label="ปิดแชตกับเป๋าวีน"><X size={18} aria-hidden="true" /></button>
        {!mounted && <div className="assistant-chat-loading" role="status">เปิดแชตเพื่อคุยกับเป๋าวีน</div>}
        {mounted && options && <AssistantChat years={options.years} months={options.months} initialYear={options.initialYear || initialYear} initialMonth="all" ready={options.ready} onboardingScope={onboardingScope} pockets={pockets} home={isPinned} compact={!isPinned} showMascot onClose={closeChat} />}
        {mounted && !options && (isPinned
          ? <div className="assistant-home-loading" role={optionsError ? "alert" : "status"}><PaoweenStage /><span>{optionsError ? "โหลดข้อมูลแชตไม่สำเร็จ" : "เป๋าวีนกำลังเตรียมตัว..."}</span>{optionsError && <button className="button-secondary" type="button" onClick={() => { setOptionsError(false); setLoadAttempt((attempt) => attempt + 1); }}>ลองอีกครั้ง</button>}</div>
          : optionsError
            ? <div className="assistant-chat-loading" role="alert"><div>โหลดข้อมูลแชตไม่สำเร็จ</div><button className="button-secondary" type="button" onClick={() => { setOptionsError(false); setLoadAttempt((attempt) => attempt + 1); }}>ลองอีกครั้ง</button></div>
            : <div className="assistant-chat-loading" role="status">เป๋าวีนกำลังเตรียมตัว...</div>)}
      </section>
      {!open && <button className="assistant-dock-toggle" type="button" ref={toggleRef} aria-expanded={open} aria-controls="assistant-dock-panel" onClick={showChat}>
        <MessageCircle size={19} aria-hidden="true" /><span>คุยกับเป๋าวีน</span>
      </button>}
    </div>
  </>;
}

export function AssistantOpenButton() {
  return <button className="button-primary" type="button" onClick={() => window.dispatchEvent(new Event("paoween:open-chat"))}>
    <MessageCircle size={16} aria-hidden="true" /> เปิดแชตกับเป๋าวีน
  </button>;
}
