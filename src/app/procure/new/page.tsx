import { ProcureForm } from "@/components/procure/ProcureForm";

export default function ProcureNewPage() {
  return (
    <section>
      <h1>สร้างเอกสารงานจัดซื้อจัดจ้าง</h1>
      <ProcureForm mode="create" />
    </section>
  );
}
