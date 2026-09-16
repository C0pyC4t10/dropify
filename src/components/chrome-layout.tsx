"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export function ChromeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isRider = pathname?.startsWith("/rider") ?? false;
  if (isRider) return <>{children}</>;
  return (
    <>
      <Header className="no-print permanent-header" />
      <main className="main-content" style={{ maxWidth: "100%", margin: 0, padding: "16px 20px", paddingTop: 60 }}>
        {children}
      </main>
      <Footer className="no-print" />
    </>
  );
}