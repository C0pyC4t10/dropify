import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { ActiveCompanyProvider } from "@/lib/active-company";

export const metadata: Metadata = {
  title: {
    default: "Dropify",
    template: "%s — Dropify",
  },
  description:
    "Dropify — multi-tenant operations console for any business. Manage orders, products, suppliers, riders, and customers across every company from one place.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

// Prevent flash of wrong theme by hinting dark before paint. The localStorage
// key changed from the legacy "bazarey-theme" to "dropify-theme" — the legacy
// key is read as a one-shot fallback so existing users keep their preference.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('dropify-theme')||localStorage.getItem('bazarey-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

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