import Link from "next/link";

import { StatusActionButton } from "@/components/procure/StatusActionButton";
import { type ProcureCase } from "@/lib/procure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProcureListPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <p>กรุณาเข้าสู่ระบบก่อนใช้งาน</p>;
  }

  const { data, error } = await supabase
    .from("procure_cases")
    .select("id,title,department,status,doc_version,doc_url,form_data,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return <p>โหลดข้อมูลไม่สำเร็จ: {error.message}</p>;
  }

  const cases = (data ?? []) as ProcureCase[];

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>งานจัดซื้อจัดจ้างไม่เกิน 5 หมื่นบาท</h1>
        <Link href="/procure/new">สร้างเอกสาร</Link>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {cases.map((item) => (
          <article key={item.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: 0 }}>{item.title}</h3>
            <p style={{ margin: "8px 0" }}>แผนก: {item.department}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <StatusActionButton caseId={item.id} status={item.status} />
              <Link href={`/procure/${item.id}/edit`}>แก้ไข</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
