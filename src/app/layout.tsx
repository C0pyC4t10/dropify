import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { ActiveCompanyProvider } from "@/lib/active-company";

export const metadata: Metadata = {
  title: "Delivery Ops",
  description: "Order, invoice, rider & stock management",
};

// Prevent flash of wrong theme by hinting dark before paint
const themeBootstrap = `(function(){try{var t=localStorage.getItem('bazarey-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-bootstrap" strategy="beforeInteractive">{themeBootstrap}</Script>
        <ThemeProvider>
          <ActiveCompanyProvider>
            <Header className="no-print permanent-header" />
            <main className="main-content" style={{ maxWidth: "100%", margin: 0, padding: "16px 20px", paddingTop: 60 }}>
              {children}
            </main>
            <Footer className="no-print" />
          </ActiveCompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}