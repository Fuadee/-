# Tech Stack Proposal (MVP)

## แนวทางที่เลือก (1 แนวทาง)
**Vite + React + TypeScript + React Router + CSS พื้นฐาน (ไม่พึ่ง UI framework หนัก)**

## เหตุผลที่เลือก
1. **ทำ MVP ได้เร็ว**: สร้างหน้า UI ได้ทันทีโดยไม่ต้องตั้งค่า backend หรือ ORM ก่อน
2. **ดูแลง่าย**: โครงสร้าง frontend มาตรฐาน ไฟล์ไม่ซับซ้อน ทีมใหม่อ่านต่อได้ง่าย
3. **รองรับการขยายภายหลัง**: เมื่อพร้อมเชื่อม backend สามารถต่อ REST API ได้ตรง ๆ ผ่าน service layer
4. **ต้นทุนปฏิบัติการต่ำ**: build เป็น static bundle ได้ และ deploy ง่ายกับหลาย platform

## โครง repo (เริ่มต้น)
- `src/layout` โครงหน้าหลัก
- `src/components` คอมโพเนนต์ใช้ซ้ำ
- `src/pages` หน้าจอหลักของ MVP
- `docs` เอกสาร PRD/สถาปัตยกรรม
- `.env.example` ตัวอย่าง environment variables
