# Procurement Workflow (Next.js + Supabase)

ระบบงานจัดซื้อจัดจ้างไม่เกิน 5 หมื่นบาท ด้วย Next.js App Router + Supabase (DB/Auth/Storage)

## Environment Variables (Vercel)

ตั้งค่าใน Project Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (ใช้เฉพาะ server route handlers)
- `TEMPLATE_PATH` (ตัวอย่าง: `server/templates/procurement_basic_v1.docx`)

## Supabase Auth Setup (Email + Password)

1. ไปที่ **Supabase Dashboard → Authentication → Providers → Email**
2. เปิดใช้งาน **Email provider**
3. สำหรับ development แนะนำให้ปิด **Confirm email** เพื่อให้สมัครสมาชิกแล้ว login ได้ทันที
4. ตั้งค่า Redirect URLs ใน **Authentication → URL Configuration** เช่น:
   - `http://localhost:3000/login`
   - `http://localhost:3000/register`
   - `https://<your-vercel-domain>/login`
   - `https://<your-vercel-domain>/register`

หน้าที่เกี่ยวข้องในแอป:
- `/login` เข้าสู่ระบบด้วย email/password
- `/register` สมัครสมาชิกด้วย email/password
- `/procure*` ถูกป้องกันด้วย middleware และจะ redirect ไป login อัตโนมัติเมื่อไม่มี session

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
