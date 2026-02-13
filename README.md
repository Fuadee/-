# Procurement MVP (Frontend + DOCX Backend)

โครง MVP ระบบจัดซื้อจัดจ้างที่มี:
- Frontend (Vite + React)
- Backend สำหรับ merge template `.docx` (Node + Express + TypeScript + docxtemplater)

## โครงสร้าง
- `src/` : frontend เดิม
- `server/` : backend สำหรับ generate DOCX
- `server/templates/` : ตำแหน่ง template (ตัวอย่าง `basic_v1` จะถูกสร้างไฟล์ `procurement_basic_v1.docx` อัตโนมัติเมื่อรัน backend)

## การตั้งค่า env
คัดลอกไฟล์ตัวอย่าง:

```bash
cp .env.example .env
```

ค่าหลักที่ใช้:
- `API_BASE_URL` / `VITE_API_BASE_URL` (ค่าแนะนำ `http://localhost:4000`)

## Run พร้อมกัน (2 terminals)

### Terminal 1: Frontend
```bash
npm install
npm run dev
```

Frontend จะรันที่ `http://localhost:5173`

### Terminal 2: Backend
```bash
cd server
npm install
npm run dev
```

Backend จะรันที่ `http://localhost:4000`

## API Backend

### `GET /api/templates`
คืนค่า template list เช่น:

```json
[
  {
    "template_code": "basic_v1",
    "name": "Procurement Basic v1"
  }
]
```

### `POST /api/generate-docx`
Body:

```json
{
  "template_code": "basic_v1",
  "case": {},
  "items": [],
  "attachments_summary": "..."
}
```

รองรับ VAT เพิ่มเติม:

> ระบบนี้ใช้ราคาที่รวม VAT แล้ว และทำการถอย VAT อัตโนมัติ


```json
{
  "vat_enabled": true,
  "vat_rate": 7
}
```

Response:
- ไฟล์ `.docx` (response headers ถูกตั้งเป็น attachment ให้ดาวน์โหลด)

## หน้าจอที่มี
- `/cases` : Case List
- `/cases/new` : Create Case
- `/cases/:id/edit` : Edit Case
- `/cases/:id/preview` : Preview / Generate (โหลด template + เรียก generate docx)

## Template placeholders
ใส่ placeholder ต่อไปนี้ใน `templates/template.docx`:

```text
{{department}}
{{subject}}
{{subject_detail}}
{{purpose}}
{{budget_amount}}
{{budget_source}}
{{vendor_name}}
{{vendor_address}}
{{receipt_no}}
{{assignee}}
{{assignee_position}}
{{approved_by}}
{{subtotal_net_fmt}}
{{vat_rate}}
{{vat_amount_fmt}}
{{grand_total_fmt}}
{{grand_total_text}}
```

สำหรับรายการวัสดุแบบวนซ้ำ (`items`) ให้ใส่:

```text
{#items}
- {{name}} จำนวน {{qty}} {{unit}} ราคา {{price_fmt}} รวม {{total_fmt}}
{/items}
```

> หมายเหตุ: ในข้อมูล item จะยังมี `{{price}}` และ `{{total}}` เป็นสตริงที่ฟอร์แมตแล้วเช่นกัน

ตัวอย่างการวางข้อความในเอกสาร:

```text
บริษัท / ห้างหุ้นส่วนจำกัด / ร้าน: {vendor_name}
ที่อยู่: {vendor_address}
เลขที่ใบเสร็จ: {receipt_no}
ผู้ได้รับมอบหมาย: {assignee}
ตำแหน่ง: {assignee_position}
อนุมัติผ่าน: {approved_by}
ราคาสินค้า (ก่อน VAT): {subtotal_net_fmt}
ภาษีมูลค่าเพิ่ม ({vat_rate}%): {vat_amount_fmt}
รวมเป็นเงินทั้งสิ้น: {grand_total_fmt}
({grand_total_text})
```

## Dev-only utility check route
- `GET /api/dev-tests`
- ใช้ตรวจผลลัพธ์เบื้องต้นของ `formatMoneyTH`, `toThaiBahtText` และการคำนวณ VAT 7%

> หมายเหตุ: ไม่ต้องสร้างไฟล์ template อัตโนมัติ ให้สร้างและจัดรูปแบบใน Word ด้วย placeholder ตามด้านบน

## Supabase Auth setup (Next.js App Router)
Add these variables to `.env.local` before running the app:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Use values from your Supabase project settings (URL + anon public key).

## Route protection
- Site is protected globally by Supabase Auth middleware; only `/login` (and auth callback paths) is public.
- Unauthenticated requests to other pages are redirected to `/login`.

## SQL migration snippet (manual)

> เพิ่มคอลัมน์รองรับการแก้ไขงานเดิม โดย **ไม่ auto-run**

```sql
alter table public.generated_docs
  add column if not exists payload jsonb;

alter table public.generated_docs
  add column if not exists updated_at timestamptz default now();
```
