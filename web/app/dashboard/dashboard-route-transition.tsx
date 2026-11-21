"use client";

import { usePathname } from "next/navigation";

export function DashboardRouteTransition({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return <div className="workspace-route-transition" key={pathname}>{children}</div>;
}
