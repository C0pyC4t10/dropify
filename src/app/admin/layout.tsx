import { AdminGate, AdminLockButton } from "@/components/admin-gate";

/**
 * Admin layout. Every page under /admin/** is gated by an in-browser
 * unlock prompt (see AdminGate). The lock persists as a session cookie
 * so once the operator unlocks for this browser, they don't have to
 * re-confirm on every page.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGate>
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 10,
          }}
        >
          <AdminLockButton />
        </div>
        {children}
      </div>
    </AdminGate>
  );
}
