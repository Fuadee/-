import type { Metadata } from "next";
import Link from "next/link";

import { SidebarAuthActions } from "@/components/auth/SidebarAuthActions";
import { getServerUser } from "@/lib/supabase/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Procurement Workflow",
  description: "Procurement <= 50,000 workflow"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getServerUser();

  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "sans-serif" }}>
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" }}>
          <aside style={{ borderRight: "1px solid #e5e7eb", padding: 16, display: "grid", gap: 16 }}>
            <h3 style={{ margin: 0 }}>เมนู</h3>
            <nav style={{ display: "grid", gap: 8 }}>
              <Link href="/procure">งานจัดซื้อจัดจ้างไม่เกิน 5 หมื่นบาท</Link>
            </nav>

            <section style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              <SidebarAuthActions initialEmail={user?.email ?? null} />
            </section>
          </aside>
          <main style={{ padding: 24 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
