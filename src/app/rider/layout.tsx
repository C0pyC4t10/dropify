import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/rider-auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "Dropify Rider",
  description: "Dropify rider delivery app",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Dropify" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1a7a3a",
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServiceWorkerRegister />
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}