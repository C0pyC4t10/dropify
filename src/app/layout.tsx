import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
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
//
// Rendered as a raw <script> inside <head> (not <Script strategy="beforeInteractive"/>)
// because next/script renders a <script> element into the React tree, which
// React 19 flags in dev with "Encountered a script tag while rendering React
// component". The raw script runs synchronously when the HTML parser hits it,
// well before React hydration — same anti-flash effect, no warning.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('dropify-theme')||localStorage.getItem('bazarey-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <ActiveCompanyProvider>
            <ChromeLayout>{children}</ChromeLayout>
          </ActiveCompanyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}