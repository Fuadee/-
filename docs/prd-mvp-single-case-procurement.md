# PRD (MVP): ระบบจัดซื้อจัดจ้างแบบเคสเดียว (Single-case Procurement)

## 1) PRD แบบสั้น

### Goals
- ให้ผู้ใช้งานสร้างเอกสารจัดซื้อจัดจ้าง “1 เคส” ได้จบใน flow เดียว: กรอกข้อมูล → แนบหลักฐาน → เลือกเทมเพลต Word (.docx) → Preview → Generate เอกสารทันที
- ลดงานคัดลอกข้อมูลซ้ำและลดความผิดพลาดจากการพิมพ์เอกสาร
- ส่งมอบ MVP ที่ใช้งานจริงได้เร็ว โดยเน้น **vertical slice** ก่อน (1 ประเภทเคส, 1–2 เทมเพลตหลัก, ภาษาไทย)

### Non-goals (MVP)
- ไม่รองรับ workflow อนุมัติหลายชั้น
- ไม่รองรับการทำงานหลายเคสพร้อมกันแบบ pipeline/scheduling
- ไม่รองรับ e-Signature, OCR อัตโนมัติ, เชื่อม ERP/บัญชีภายนอก
- ไม่รองรับ template designer แบบ drag-and-drop บนเว็บ (ใช้การอัปโหลดไฟล์ .docx ที่เตรียมไว้)

### User stories
1. ในฐานะเจ้าหน้าที่พัสดุ ฉันต้องการกรอกข้อมูลเคสเดียวได้ในหน้าเดียว เพื่อออกเอกสารเร็วที่สุด
2. ในฐานะผู้ใช้งาน ฉันต้องการแนบใบเสร็จ/รูปหลักฐานได้หลายไฟล์ เพื่อเก็บข้อมูลอ้างอิงครบถ้วน
3. ในฐานะผู้ใช้งาน ฉันต้องการเลือก Word template ที่องค์กรกำหนด เพื่อได้เอกสารตามรูปแบบมาตรฐาน
4. ในฐานะผู้ใช้งาน ฉันต้องการดู Preview ก่อน Generate เพื่อเช็กความถูกต้องก่อนดาวน์โหลด
5. ในฐานะผู้ใช้งาน ฉันต้องการดาวน์โหลดไฟล์ .docx ที่ merge แล้วได้ทันทีหลังกด Generate

### Acceptance criteria (MVP)
- ผู้ใช้สร้างเคสใหม่และบันทึกข้อมูลสำเร็จภายใน 1 flow โดยมีข้อมูลบังคับขั้นต่ำ: ชื่อเรื่อง, วันที่, หน่วยงาน, รายการจัดซื้ออย่างน้อย 1 รายการ
- ระบบรองรับแนบไฟล์อย่างน้อยชนิดภาพ (jpg/png) และ PDF, จำกัดขนาดไฟล์ต่อไฟล์ (เช่น 10MB)
- ผู้ใช้เลือก template ที่ Active ได้ 1 รายการต่อเคส
- หน้า Preview แสดงข้อมูลหัวเอกสาร + ตารางรายการ + ไฟล์แนบ (ชื่อไฟล์) ก่อน generate
- เมื่อกด Generate แล้ว ระบบสร้างเอกสาร .docx ได้สำเร็จภายใน SLA เป้าหมาย (เช่น < 5 วินาที สำหรับข้อมูลทั่วไป)
- เอกสารที่สร้างแล้วสามารถดาวน์โหลดได้ทันทีและผูกกับ revision ของเคสนั้น
- หาก placeholder ใน template ไม่ครบ ระบบแจ้งข้อผิดพลาดที่อ่านเข้าใจได้ (เช่น “ไม่พบ {{case.title}}”)

---

## 2) Data model (ตาราง/ฟิลด์หลัก + ความสัมพันธ์)

> แนวคิด MVP: เก็บโครงสร้างเรียบง่ายเพื่อให้ทำงานได้เร็ว, รองรับการขยายภายหลัง

### `users`
- `id` (PK)
- `email` (unique)
- `full_name`
- `role` (admin, officer)
- `created_at`, `updated_at`

### `cases`
- `id` (PK)
- `case_no` (unique, human-readable)
- `title`
- `department_name`
- `requester_name`
- `request_date`
- `vendor_name` (nullable)
- `currency` (default THB)
- `subtotal_amount`
- `tax_amount`
- `total_amount`
- `status` (draft, ready, generated)
- `created_by` (FK -> users.id)
- `created_at`, `updated_at`

### `case_items`
- `id` (PK)
- `case_id` (FK -> cases.id)
- `line_no`
- `description`
- `qty`
- `unit`
- `unit_price`
- `line_total`
- `remark` (nullable)

### `attachments`
- `id` (PK)
- `case_id` (FK -> cases.id)
- `original_filename`
- `mime_type`
- `file_size_bytes`
- `storage_path`
- `uploaded_by` (FK -> users.id)
- `created_at`

### `templates`
- `id` (PK)
- `template_name`
- `template_code` (unique)
- `version`
- `docx_path`
- `is_active`
- `created_by` (FK -> users.id)
- `created_at`, `updated_at`

### `generated_documents`
- `id` (PK)
- `case_id` (FK -> cases.id)
- `template_id` (FK -> templates.id)
- `output_filename`
- `output_path`
- `generation_status` (success, failed)
- `error_message` (nullable)
- `generated_by` (FK -> users.id)
- `generated_at`

### ความสัมพันธ์หลัก
- 1 `user` สร้างได้หลาย `cases`
- 1 `case` มีหลาย `case_items`
- 1 `case` มีหลาย `attachments`
- 1 `case` generate เอกสารได้หลายครั้ง (`generated_documents`) เพื่อเก็บประวัติ revision
- 1 `template` ถูกใช้ได้ในหลาย `generated_documents`

---

## 3) Screen flow (หน้าจอขั้นต่ำและลำดับการใช้งาน)

### หน้าจอขั้นต่ำ
1. **Case List**
   - ปุ่ม “สร้างเคสใหม่”
   - ตารางแสดงเคสล่าสุด + สถานะ
2. **Case Form (Create/Edit)**
   - ส่วนข้อมูลหัวเคส
   - ส่วนรายการจัดซื้อ (add/remove row)
   - ส่วนแนบไฟล์
   - ปุ่ม “บันทึก” และ “ไปหน้า Preview”
3. **Preview & Template Selection**
   - แสดงข้อมูลสรุปแบบอ่านอย่างเดียว
   - เลือก template จาก dropdown/list
   - ปุ่ม “Generate .docx”
4. **Generation Result**
   - สถานะสำเร็จ/ล้มเหลว
   - ปุ่มดาวน์โหลดไฟล์
   - ปุ่มย้อนกลับไปแก้ไขเคส

### ลำดับการใช้งาน (happy path)
1. ผู้ใช้เข้าหน้า Case List แล้วกด “สร้างเคสใหม่”
2. กรอกข้อมูลเคส + รายการ + แนบไฟล์ แล้วกดบันทึก
3. ระบบ validate ข้อมูลขั้นต่ำผ่าน → ไปหน้า Preview
4. ผู้ใช้เลือก template และตรวจความถูกต้อง
5. กด Generate → ระบบ merge placeholder ลง .docx
6. แสดงผลลัพธ์ พร้อมลิงก์ดาวน์โหลดไฟล์

### Slice แนะนำเพื่อส่งมอบเร็ว
- **Slice 1 (สัปดาห์ 1):** Create/Edit case + item + save draft
- **Slice 2 (สัปดาห์ 2):** Upload attachment + preview read-only
- **Slice 3 (สัปดาห์ 3):** Template selection + docx generation + download
- **Slice 4 (สัปดาห์ 4):** Error handling, revision history, hardening (validation/logging)

---

## 4) Template spec (มาตรฐาน placeholder + loop ตาราง)

### Naming convention
- ใช้รูปแบบ `{{namespace.field}}`
- คงที่และเป็นตัวพิมพ์เล็กคั่นด้วย `_` เฉพาะชื่อฟิลด์ยาว
- วันที่/ตัวเลขให้ format จาก backend ก่อน merge (template ไม่ควรมี logic ซับซ้อน)

### Placeholder พื้นฐาน (ตัวอย่าง)
- `{{case.case_no}}`
- `{{case.title}}`
- `{{case.department_name}}`
- `{{case.request_date}}`
- `{{case.requester_name}}`
- `{{case.vendor_name}}`
- `{{case.subtotal_amount}}`
- `{{case.tax_amount}}`
- `{{case.total_amount}}`

### Loop รายการในตาราง
รองรับ syntax แบบ block:

- เริ่ม loop: `{{#items}}`
- จบ loop: `{{/items}}`
- ฟิลด์ในแต่ละแถว:
  - `{{line_no}}`
  - `{{description}}`
  - `{{qty}}`
  - `{{unit}}`
  - `{{unit_price}}`
  - `{{line_total}}`
  - `{{remark}}`

> วิธีวางใน Word table: ใส่ `{{#items}}` ในเซลล์แรกของแถว template และ `{{/items}}` ในเซลล์สุดท้ายของแถวเดียวกัน เพื่อให้ engine clone แถวตามจำนวนรายการ

### Placeholder สำหรับไฟล์แนบ (MVP)
- แสดงเป็นข้อความรายชื่อไฟล์แนบเท่านั้น:
  - `{{attachments_summary}}` (เช่น “receipt1.pdf, photo_a.jpg, ...”)
- การ embed รูปลง .docx โดยตรงให้เป็นเฟสถัดไป

### Validation rules ก่อน Generate
- ต้องเลือก template ที่ active
- ต้อง resolve placeholder ได้ครบทุกตัวที่ required
- หากพบ placeholder ไม่รู้จัก ให้แจ้งรายการ placeholder ที่ผิดทั้งหมด
- บันทึก log การ generate ทุกครั้ง (success/fail + error)

### Versioning
- template แต่ละไฟล์ต้องมี `template_code` + `version`
- เอกสารที่ generate ต้องผูกกับ template version ที่ใช้จริงเสมอ (audit ได้)
