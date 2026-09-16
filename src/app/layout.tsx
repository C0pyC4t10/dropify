import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeBootstrapScript } from "@/components/theme-bootstrap-script";
import { ActiveCompanyProvider } from "@/lib/active-company";
import { ChromeLayout } from "@/components/chrome-layout";

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

// Mobile-first viewport. /rider's own layout overrides this with the PWA
// viewport; the rest of the site (admin, operator, public) inherits this
// so phones render at native resolution instead of pretending to be 980px.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 2,
  userScalable: true,
  themeColor: "#0f1410",
};

// Prevent flash of wrong theme by hinting dark before paint. The localStorage
// key changed from the legacy "bazarey-theme" to "dropify-theme" — the legacy
// key is read as a one-shot fallback so existing users keep their preference.
// Injected imperatively by <ThemeBootstrapScript/> so React 19 doesn't warn
// about a <script> element in the React tree.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('dropify-theme')||localStorage.getItem('bazarey-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeBootstrapScript />
        <ThemeProvider>
          <ActiveCompanyProvider>
            <ChromeLayout>{children}</ChromeLayout>
          </ActiveCompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}