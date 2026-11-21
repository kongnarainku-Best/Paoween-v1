import type { Metadata } from "next";
import { OnboardingHandoffProvider } from "@/app/settings/new-user/onboarding-handoff";
import "./globals.css";

export const metadata: Metadata = {
  title: "เป๋าวีน — เพื่อนคู่คิดเรื่องเงิน",
  description: "พื้นที่ส่วนตัวเพื่อค่อย ๆ ดูแลเรื่องเงินไปด้วยกัน",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body><OnboardingHandoffProvider>{children}</OnboardingHandoffProvider></body>
    </html>
  );
}
