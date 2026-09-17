import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Live delivery tracking for your Dropify order.",
  robots: { index: false, follow: false },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary, #f8f8f6)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated, #fff)",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", fontWeight: 700, color: "var(--color-text, #111)" }}>
          Dropify
        </div>
      </header>
      <main
        style={{
          flex: 1,
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          padding: "24px 20px 48px",
          color: "var(--color-text, #111)",
        }}
      >
        {children}
      </main>
    </div>
  );
}