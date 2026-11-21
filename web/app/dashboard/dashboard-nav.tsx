"use client";

import { CalendarDays, ChartNoAxesColumnIncreasing, ChartPie, Ellipsis, ListChecks, ListTodo, MessageCircle, ReceiptText, Settings2, ShoppingBag, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const items = [
  { href: "/dashboard", label: "ภาพรวม", icon: ChartNoAxesColumnIncreasing, exact: true },
  { href: "/dashboard/transactions", label: "รายการ", icon: ListChecks },
  { href: "/dashboard/spending", label: "รายจ่าย", icon: ChartPie },
  { href: "/dashboard/investment", label: "ลงทุน", icon: TrendingUp },
  { href: "/dashboard/tax", label: "ภาษี", icon: ReceiptText },
];

const moreItems = [
  { href: "/dashboard/review", label: "งานตรวจ", icon: ListTodo },
  { href: "/dashboard/local-tools", label: "ฟีเจอร์ที่อยู่ในเครื่อง", icon: CalendarDays },
  { href: "/dashboard/settings", label: "ตั้งค่า", icon: Settings2 },
];

export function DashboardNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [intentPrefetch, setIntentPrefetch] = useState<Record<string, boolean>>({});
  const moreRef = useRef<HTMLDivElement>(null);

  function prefetchOnIntent(href: string) {
    setIntentPrefetch((current) => current[href] ? current : { ...current, [href]: true });
  }

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreRef.current?.contains(event.target)) setMoreOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [moreOpen]);

  return (
    <nav aria-label="มุมมอง">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return <Link className={`rail-item${active ? " active" : ""}`} href={href} key={href} prefetch={intentPrefetch[href] ? true : null} onMouseEnter={() => prefetchOnIntent(href)} onFocus={() => prefetchOnIntent(href)} aria-current={active ? "page" : undefined} onClick={() => setMoreOpen(false)}>
          <Icon size={17} aria-hidden="true" /><span>{label}</span>
        </Link>;
      })}
      <button className="rail-item" type="button" aria-controls="assistant-dock-panel" onClick={() => window.dispatchEvent(new Event("paoween:open-chat"))}>
        <MessageCircle size={17} aria-hidden="true" /><span>คุยกับเป๋าวีน</span>
      </button>
      <div className={`rail-more${moreOpen ? " is-open" : ""}`} ref={moreRef}>
        <button className="rail-more-toggle" type="button" aria-expanded={moreOpen} aria-controls="rail-more-menu" onClick={() => setMoreOpen((open) => !open)}>
          <Ellipsis size={17} aria-hidden="true" /><span>เพิ่มเติม</span>
        </button>
        {moreOpen && <div className="rail-more-menu" id="rail-more-menu">
          {moreItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link className={`rail-item${active ? " active" : ""}`} href={href} key={href} prefetch={intentPrefetch[href] ? true : null} onMouseEnter={() => prefetchOnIntent(href)} onFocus={() => prefetchOnIntent(href)} aria-current={active ? "page" : undefined} onClick={() => setMoreOpen(false)}>
              <Icon size={16} aria-hidden="true" /><span>{label}</span>
            </Link>;
          })}
          <Link className="rail-item" href="/dashboard/local-tools#shopping" onClick={() => setMoreOpen(false)}><ShoppingBag size={16} aria-hidden="true" /><span>ช้อปอย่างคิด <small>ในเครื่อง</small></span></Link>
        </div>}
      </div>
    </nav>
  );
}
