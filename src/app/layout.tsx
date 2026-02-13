import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Procurement Workflow",
  description: "Procurement <= 50,000 workflow"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body style={{ margin: 0, fontFamily: "sans-serif" }}>
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" }}>
          <aside style={{ borderRight: "1px solid #e5e7eb", padding: 16 }}>
            <h3>เมนู</h3>
            <nav>
              <Link href="/procure">งานจัดซื้อจัดจ้างไม่เกิน 5 หมื่นบาท</Link>
            </nav>
          </aside>
          <main style={{ padding: 24 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
