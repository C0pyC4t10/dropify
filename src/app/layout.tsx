import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Bazarey Ltd — Meat Delivery Ops",
  description: "Order, invoice, rider & stock management for meat delivery",
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
          <Header className="no-print permanent-header" />
          <main className="main-content" style={{ maxWidth: "1200px", margin: "0 auto", padding: "16px", paddingTop: 60 }}>
            {children}
          </main>
          <Footer className="no-print" />
        </ThemeProvider>
      </body>
    </html>
  );
}