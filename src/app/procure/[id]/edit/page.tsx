import { notFound } from "next/navigation";

import { ProcureForm } from "@/components/procure/ProcureForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProcureEditPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("procure_cases")
    .select("id, form_data")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  return (
    <section>
      <h1>แก้ไขเอกสารงานจัดซื้อจัดจ้าง</h1>
      <ProcureForm mode="edit" caseId={id} initialData={(data.form_data ?? {}) as Record<string, unknown>} />
    </section>
  );
}
