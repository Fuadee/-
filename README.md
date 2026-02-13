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
{{assignee}}
{{assignee_position}}
```

สำหรับรายการวัสดุแบบวนซ้ำ (`items`) ให้ใส่:

```text
{#items}
- {{name}} จำนวน {{qty}} {{unit}} ราคา {{price}} รวม {{total}}
{/items}
```


ตัวอย่างการวางข้อความในเอกสาร:

```text
ผู้ได้รับมอบหมาย: {assignee}
ตำแหน่ง: {assignee_position}
```

> หมายเหตุ: ไม่ต้องสร้างไฟล์ template อัตโนมัติ ให้สร้างและจัดรูปแบบใน Word ด้วย placeholder ตามด้านบน
