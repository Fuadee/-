# Workflow Audit: "การแก้ไขงาน" (frontend + backend + database)

วันที่ตรวจ: 2026-03-18
ขอบเขต: โค้ดปัจจุบันในโปรเจกต์ (ยังไม่ refactor)

## 1) ภาพรวม flow ที่พบจริง

ระบบปัจจุบันมี 2 ทางเข้าหลักของงาน:

1. **Precheck flow**
   - กดปุ่ม `ตรวจสอบก่อนส่ง` ในฟอร์ม -> `POST /api/gen-docx` ด้วย `submissionMode: "precheck"` -> เขียนสถานะเป็น `precheck_pending`.

2. **Main flow**
   - กดปุ่ม `บันทึกและส่งอนุมัติ` ในฟอร์ม -> `POST /api/gen-docx` ด้วย `submissionMode: "main"` -> เขียนสถานะเป็น `pending_approval`.

จาก dashboard/status dialog จะ PATCH สถานะไปมาในชุดสถานะหลัก (`document_pending`, `pending_approval`, `pending_review`, `needs_fix`, `awaiting_payment`, `completed`).

> จุดสำคัญ: API update สถานะ (PATCH `/api/jobs/[id]`) **ไม่ได้ enforce transition ตาม previous status** อย่างเคร่งครัด (ยกเว้นบางเงื่อนไขส่ง LINE) จึงมีโอกาสเกิด loop หรือข้ามขั้นได้.

---

## 2) สถานะ (status) ที่มีอยู่จริงในระบบ

### 2.1 Canonical statuses ที่ UI/logic ใช้เป็นหลัก
- `precheck_pending`
- `document_pending`
- `pending_approval`
- `pending_review`
- `needs_fix`
- `awaiting_payment`
- `completed`
- `ดำเนินการแล้วเสร็จ` (map เป็น completed)

### 2.2 Additional statuses ที่ระบบยังรองรับในบางที่ (legacy/alias)
- `pending`
- `approved`
- `rejected`
- `รอตรวจ`
- `รออนุมัติ`
- `รอเบิกจ่าย`
- `ไม่อนุมัติ`
- `รอการแก้ไข`
- `paid`
- `main_process`
- `generated` (frontend map เป็น `pending_approval`)

> หมายเหตุ: status เหล่านี้มีหลายภาษาและหลายยุคอยู่ร่วมกันใน logic dashboard summary/counting และ allowed updates.

---

## 3) ตาราง transition ที่พบจากโค้ดปัจจุบัน

| current status | action/event | next status | หมายเหตุ |
|---|---|---|---|
| (new or any via edit form) | กด “ตรวจสอบก่อนส่ง” (`submissionMode=precheck`) | `precheck_pending` | `gen-docx` จะ set status ตรง ๆ |
| (new or any via edit form) | กด “บันทึกและส่งอนุมัติ” (`submissionMode=main`) | `pending_approval` | `gen-docx` จะ set status ตรง ๆ |
| `precheck_pending` | ส่งเข้ากระบวนการหลัก (dialog) | `document_pending` | จาก StatusActionDialog |
| `precheck_pending` | ส่งกลับให้แก้ไข | `needs_fix` + set `revision_note`/`revision_requested_*` | ไม่แยกว่าเป็นรอบ precheck หรือรอบสอง |
| `document_pending` | ผู้ใช้ไปหน้าแก้ไขแล้วกดบันทึกส่งอนุมัติ | `pending_approval` | เกิดผ่าน `gen-docx main` |
| `pending_approval` | กด “ลงแล้ว” | `pending_review` | จาก StatusActionDialog |
| `pending_review` | กด “ตรวจผ่าน” | `awaiting_payment` | จาก StatusActionDialog |
| `pending_review` | กด “กลับไปแก้ไข” | `needs_fix` + revision fields | ใช้ endpoint เดิมกับ precheck |
| `needs_fix` | กด “ใช่ (แก้เสร็จแล้ว)” | `pending_review` | ไม่มีเช็ค previous stage |
| `awaiting_payment` | กด “ดำเนินการเบิกจ่ายแล้ว” | `ดำเนินการแล้วเสร็จ` | ผ่าน action `mark_payment_done` |
| `*` | PATCH status ด้วยค่าใน ALLOWED_STATUS_UPDATES | ค่าใหม่ตามที่ส่ง | API อนุญาตกว้าง ไม่ enforce state machine |

---

## 4) Event / action ที่เป็น trigger ของ transition

- กดแก้ไข: ส่วนใหญ่เป็น Link ไป `/?job=<id>` (หน้า GenerateClient เดียว)
- กดตรวจสอบส่งงาน (precheck): `handleSubmit("precheck")` -> `POST /api/gen-docx`
- กดบันทึกส่งอนุมัติ (main): `handleSubmit("main")` -> `POST /api/gen-docx`
- ตรวจผ่าน precheck: `PATCH /api/jobs/[id]` เป็น `document_pending`
- ส่งกลับแก้ไข: `PATCH /api/jobs/[id]` เป็น `needs_fix` พร้อม `revisionNote`
- สร้างเอกสาร: จาก `document_pending` ผู้ใช้กลับไปหน้า generate แล้ว submit main
- รออนุมัติ/รอตรวจ/รอเบิกจ่าย: เปลี่ยนผ่าน status dialog
- อนุมัติ/จบงาน: ใน flow นี้จบด้วย `mark_payment_done` -> `ดำเนินการแล้วเสร็จ`

---

## 5) ระบบใช้ field อะไรแยก “แก้ไขรอบไหน” ตอนนี้?

### สิ่งที่มี
- `status`
- `revision_note`
- `revision_requested_at`
- `revision_requested_by`
- `created_at` / `updated_at`

### สิ่งที่ **ไม่มี** (ตามที่ผู้ใช้ถาม)
- ไม่มี `currentStep` field
- ไม่มี `workflowStage` field
- ไม่มี `reviewedAt` field สำหรับแต่ละรอบ
- ไม่มี `approvedAt` field สำหรับ state machine จริง (มีแค่ใช้ทำข้อความ LINE บางจุด)
- ไม่มี step history/revision history แบบหลายรอบ
- ไม่มี phase/revision_number แบบ explicit

> สรุปตรง ๆ: **ตอนนี้ระบบไม่มี field ที่แยก “แก้ไขเบื้องต้น” vs “แก้ไขหลังตรวจครั้งที่สอง” vs “แก้ไขจากรอบอื่น” อย่างชัดเจน**. ใช้เพียง `needs_fix` + `revision_note` ล่าสุด (overwrite) จึงแยกรอบไม่ได้.

---

## 6) ตรวจปุ่ม “แก้ไข” แต่ละหน้าว่า logic เดียวกันไหม

### พบว่า “คนละบริบท แต่ใช้ทางเข้าแก้ไขเดียวกัน”
- Dashboard row action: “แก้ไขงานนี้ →” ไป `/?job=<id>`
- Completed tab: “แก้ไข (สร้างเวอร์ชันใหม่)” ก็ไป `/?job=<id>`
- Dashboard detail (`/dashboard/[id]`) ในบางสถานะก็พาไป `/?job=<id>`

ทั้งหมดเข้า **GenerateClient เดียว** ที่โหลดข้อมูลเก่าจาก `/api/jobs/[id]` แล้ว submit ผ่าน endpoint เดิม (`/api/gen-docx`) โดยไม่แนบ context ว่าแก้ไขรอบอะไร.

ผลคือ:
- เส้นทาง precheck revision กับ second review revision ถูกบีบให้ใช้หน้ากับ payload เดียว
- backend ไม่รู้ว่าการแก้ครั้งนี้เกิดจากขั้นไหน

---

## 7) จุด mapping “แก้ไข” ที่เสี่ยงทำให้ระบบแยกบริบทไม่ออก

1. ใช้ route เดียว `/?job=id` สำหรับทุกคำว่า “แก้ไข”
2. submit ไป endpoint เดียว `/api/gen-docx` โดยตัดสินใจจากแค่ `submissionMode` (main/precheck)
3. `submissionMode=main` จะ set สถานะเป็น `pending_approval` ทันที แม้เดิมงานอยู่ `needs_fix` จากบริบทอื่น
4. `needs_fix -> pending_review` ถูก hardcode เดียว ไม่ดูว่า fix นี้มาจาก precheck หรือมาจาก reviewer รอบสอง

---

## 8) จุดที่ logic อาศัย status เดียว ทั้งที่ควรดู previous status/history

- PATCH `/api/jobs/[id]` อนุญาต next status จาก allow-list โดยไม่บังคับ allowed transition matrix ตาม previous status
- การ “แก้ไขเสร็จแล้ว” จาก `needs_fix` กลับ `pending_review` เสมอ (ไม่มี branching)
- `revision_note` เก็บได้แค่ล่าสุด ไม่มีประวัติรอบ ทำให้วิเคราะห์ย้อนกลับไม่ได้
- dashboard counts รวมหลาย status alias/ภาษา ทำให้เชิงความหมายซ้อนกัน

---

## 9) สรุป flow ปัจจุบันแบบข้อความ

### เส้นหลักที่ตั้งใจ
- `draft/form` -> `precheck_pending` -> `document_pending` -> `pending_approval` -> `pending_review` -> `awaiting_payment` -> `ดำเนินการแล้วเสร็จ`

### เส้นที่มีการแก้ไข
- `precheck_pending` -> `needs_fix` -> (ผู้ใช้แก้ใน form) -> `precheck_pending` **หรือ** `pending_approval` (ขึ้นกับปุ่มที่ผู้ใช้กด)
- `pending_review` -> `needs_fix` -> `pending_review`

### จุดกำกวม
- `needs_fix` ตัวเดียวใช้แทนทุกชนิดการส่งกลับแก้ไข
- ไม่มีตัวแปรแยกว่า fix มาจาก precheck หรือ post-review
- ไม่มี step history ให้ยืนยันรอบก่อนหน้า
- จึงเกิด loop ข้ามบริบทได้ เช่น งานที่ควรกลับไป precheck อาจถูกดันเข้าระบบหลักต่อทันที

---

## 10) รายการไฟล์ที่เกี่ยวข้อง (A)

### Frontend
- `src/app/(app)/GenerateClient.tsx`
- `src/app/(app)/dashboard/DashboardSummary.tsx`
- `src/app/(app)/dashboard/DashboardJobList.tsx`
- `src/app/(app)/dashboard/StatusActionDialog.tsx`
- `src/app/(app)/dashboard/[id]/page.tsx`
- `src/app/(app)/dashboard/[id]/DashboardPrecheckActions.tsx` (มี logic แต่ยังไม่เห็นการใช้งานจากหน้า detail ปัจจุบัน)

### Backend API routes
- `src/app/api/gen-docx/route.ts`
- `src/app/api/jobs/[id]/route.ts`
- `src/app/api/dashboard/overview/route.ts`
- `src/app/api/dashboard/jobs/route.ts`
- `src/app/api/dashboard/completed/route.ts`
- `src/app/api/dashboard/summary/route.ts`

### Database / schema / type
- `src/lib/jobs.ts`
- `supabase/migrations/202602250900_add_revision_fields.sql`
- `supabase/migrations/202603180910_dashboard_overview_perf.sql`
- `supabase/migrations/202603181200_add_document_pending_to_dashboard_summary.sql`

### Notification logic
- `src/lib/lineNotifications.ts`
- (เรียกใช้ผ่าน) `src/lib/line.ts`

---

## 11) ปัญหาหลักที่พบ (C)

1. **System แยก “รอบแก้ไข” ไม่ได้จริง**
   - เพราะมีเพียง `needs_fix` + `revision_note` ล่าสุด
2. **status ซ้ำความหมาย/หลายภาษา**
   - เช่น `completed` กับ `ดำเนินการแล้วเสร็จ`, `rejected` กับ `needs_fix`
3. **action เดียว คนละบริบท**
   - ปุ่ม “แก้ไข” ทุกที่เข้า route เดียวและ endpoint เดียว
4. **เสี่ยง workflow loop**
   - เนื่องจาก API ไม่ lock transition ด้วย previous status + step history

---

## 12) แนวทางแก้ 2 ระดับ (E)

### ระดับ 1: แก้ขั้นต่ำ (ไม่เปลี่ยน DB เยอะ)

- เพิ่ม field เบา ๆ เช่น `revision_phase` (enum string) และ/หรือ `return_from_status` ใน row เดิม
  - ตัวอย่างค่า: `initial_precheck`, `second_review`, `other`
- ตอน PATCH -> `needs_fix` ให้บันทึก `return_from_status` = current status เดิม
- ตอนผู้ใช้กดส่งหลังแก้ไข ให้ backend ใช้ `return_from_status/revision_phase` ตัดสิน next status
  - ถ้ามาจาก precheck -> กลับ `precheck_pending` หรือ `document_pending` ตามกติกา
  - ถ้ามาจาก pending_review -> กลับ `pending_review`
- เพิ่ม validation ใน PATCH ให้ enforce transition matrix พื้นฐาน
- เพิ่ม logging (ดูข้อ 13) เพื่อพิสูจน์เส้นทางจริง

### ระดับ 2: แก้ระยะยาว (โครงสร้างถูกต้อง)

- ออกแบบ explicit state machine:
  - `workflow_stage` (เช่น `precheck`, `document`, `approval`, `review`, `payment`, `done`)
  - `workflow_state` (state ใน stage)
  - `revision_phase`/`revision_round`
- แยกตาราง history เช่น `job_workflow_events`
  - เก็บ `from_state`, `to_state`, `action`, `actor`, `note`, `at`
- แยกตาราง `job_revisions` เก็บโน้ตรายรอบ (ไม่ overwrite)
- ให้ UI render ปุ่มตาม machine (จาก allowed actions) แทน hardcode
- ค่อย ๆ deprecate statuses legacy/ไทย โดยใช้ canonical enum กลาง

---

## 13) Debug log proposal (เพื่อพิสูจน์ flow จริงก่อน refactor)

แนะนำเพิ่ม log ที่จุดสำคัญดังนี้:

1. ใน `POST /api/gen-docx`
   - `jobId`, `submissionMode`, `previousStatus`, `nextStatus`, `source=edit|new`, `trigger=which-button`

2. ใน `PATCH /api/jobs/[id]`
   - `jobId`, `currentStatus`, `requestedAction`, `requestedNextStatus`, `resolvedNextStatus`, `revisionNote`, `actorId`

3. ใน frontend (GenerateClient + Dashboard)
   - เมื่อกด “แก้ไข” ให้ log `entryPoint` (dashboard-row/detail/completed)
   - เมื่อ submit ให้ log `submissionMode` + `editingJobId`

4. ถ้ามี correlation id ต่อ request จะดีมาก
   - เพื่อ trace ข้าม FE -> API -> DB ได้ครบ

---

## 14) ข้อเสนอ rename (optional)

- `needs_fix` -> `revision_requested` (กลางกว่า)
- `pending_review` -> `review_pending_final` (ถ้าหมายถึงตรวจหลังสร้างเอกสาร)
- `document_pending` -> `document_drafting`
- ถ้าต้องมี precheck กับ review ให้ชื่อสะท้อนชัด เช่น
  - `precheck_pending`
  - `post_doc_review_pending`

---

## 15) คำตอบสั้น 3 ข้อ (ตามที่ร้องขอ)

1. **Flow จริงตอนนี้คืออะไร**
   - งานถูกขับเคลื่อนด้วย status string + ปุ่มใน dashboard/generate; มีทั้ง precheck path และ main path แต่ไม่ได้ enforce transition อย่างเข้ม จึงข้ามขั้น/วนซ้ำได้.

2. **จุดที่ทำให้กด “แก้ไข” แล้วระบบแยกไม่ออกอยู่ตรงไหน**
   - ทุกปุ่มแก้ไขพาไปหน้าเดียว `/?job=id`; backend รับ submit endpoint เดียว และไม่มี field ที่บอก revision phase/round; `needs_fix` เป็นถังรวมทุกบริบท.

3. **ถ้าจะทำให้ไม่ loop ต้องเพิ่มอะไร**
   - อย่างน้อยต้องมีข้อมูลบริบทของการส่งกลับแก้ไข (เช่น `revision_phase` หรือ `return_from_status`) + บังคับ transition matrix ตาม previous status; ระยะยาวควรมี workflow event history + explicit state machine.
