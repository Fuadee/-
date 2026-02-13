# Procurement Workflow (Next.js + Supabase)

ระบบงานจัดซื้อจัดจ้างไม่เกิน 5 หมื่นบาท ด้วย Next.js App Router + Supabase (DB/Auth/Storage)

## Environment Variables (Vercel)

ตั้งค่าใน Project Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (ใช้เฉพาะ server route handlers)
- `TEMPLATE_PATH` (ตัวอย่าง: `server/templates/procurement_basic_v1.docx`)

## Run Local

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000/procure`

## Database Setup

รัน SQL migration ใน `supabase/migrations/202602130001_procure_cases.sql`

สิ่งที่ migration สร้าง:
- ตาราง `procure_cases`, `procure_case_events`
- trigger `updated_at`
- RLS เฉพาะเจ้าของ record (`created_by = auth.uid()`)
- bucket `docs` (private) + storage policies สำหรับไฟล์ของเจ้าของ case

## Core Pages

- `/procure` รายการงาน + ปุ่มสถานะ/แก้ไข
- `/procure/new` สร้างงาน
- `/procure/[id]/edit` แก้ไขงาน + Generate DOCX
