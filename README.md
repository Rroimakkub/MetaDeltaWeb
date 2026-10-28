# MetaDelta Web

เว็บแสดงคำแนะนำการคราฟใน Black Site ของ Delta Force: แต่ละแผนก (Cyber Warfare Division, Workbench, Pharmacy, Armor Bench) แสดงไอเทมที่ได้กำไรต่อชั่วโมงสูงสุด พร้อมวัตถุดิบ ราคา และ 5 อันดับแรกของแผนก คำนวณจากราคาตลาดล่าสุดของ [DeltaForceAPI](https://deltaforceapi.com) ด้วยสูตรเดียวกับบอต MetaDelta บน Discord

ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้แค่ Node.js

## เริ่มใช้งาน

1. ติดตั้ง Node.js 22.9 ขึ้นไป
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ `DELTAFORCE_API_TOKEN` (key เดียวกับที่บอตใช้ ห้าม commit ไฟล์ `.env`)
3. รัน:

```bash
npm start
```

4. เปิด http://localhost:3000

ครั้งแรกที่เปิดเว็บต้องรอดึงราคาประมาณ 30 วินาที หลังจากนั้นเว็บดึงราคาใหม่ทุก 10 นาทีโดยแสดงราคาชุดเดิมระหว่างรอ ถ้า API ล่มก็ยังแสดงราคาชุดล่าสุดพร้อมบอกว่าอัปเดตไปกี่นาทีแล้ว หน้าเว็บเช็คราคาใหม่เองทุกนาที

สูตรที่ดึงราคาไม่ได้จะถูกข้ามและบันทึกสาเหตุไว้ใน log ของเซิร์ฟเวอร์ (`Skipped ... recipes that could not be priced`)

## ค่าใน `.env`

| ค่า | ความหมาย | ค่าเริ่มต้น |
|---|---|---|
| `DELTAFORCE_API_TOKEN` | key ของ DeltaForceAPI | - |
| `SELL_TAX_PERCENT` | ภาษีที่หักจากราคาขายในตลาด (%) | 13 |
| `WEB_PORT` | พอร์ตของเว็บ | 3000 |
| `WEB_HOST` | `127.0.0.1` = เปิดได้เฉพาะเครื่องนี้, `0.0.0.0` = ให้คนอื่นเปิดได้ (บนเซิร์ฟเวอร์) | 127.0.0.1 |
| `RECIPES_PATH` | ไฟล์สูตรคราฟที่จะใช้ | `data/recipes.json` |

## สูตรคราฟ

`data/recipes.json` คัดลอกมาจากโปรเจกต์บอต ถ้าแก้สูตรในบอตแล้วอยากให้เว็บใช้ไฟล์เดียวกันโดยไม่ต้องคัดลอกซ้ำ ให้ตั้ง `RECIPES_PATH=../MetaDeltaBot/data/recipes.json`

## สถิติผู้เล่น

หน้า `/player` ค้นผู้เล่นด้วยชื่อในเกมหรือ Delta Force ID แล้วแสดงสถิติโหมด Operations จัดกลุ่มแบบหน้า My Data ของเว็บทางการ (แรงก์และคลัง, ข้อมูลเศรษฐกิจ, การต่อสู้, ทีม) เลือกดูรายซีซันหรือตลอดกาลได้ หน้า My Data ของเว็บทางการดูได้เฉพาะบัญชีที่ล็อกอิน แต่หน้านี้ค้นผู้เล่นคนไหนก็ได้

- ข้อมูลมาจาก DeltaForceAPI การค้นหาแต่ละครั้งใช้ API 4–6 ครั้ง เว็บจึงเก็บผลไว้ 5 นาที
- ชื่อและรูปแรงก์ใช้ตารางคะแนนเดียวกับเว็บทางการ (`ranks_en.js`) รูปโหลดจาก playdeltaforce.com
- ไม่มี Earnings/Failures, Task Rewards, แรงก์สูงสุด และประวัติรายแมตช์ เพราะ DeltaForceAPI ไม่มีข้อมูลเหล่านี้

## ขึ้นเซิร์ฟเวอร์

บนเครื่องเดียวกับบอต (เช่น VPS ที่รันบอตอยู่):

```bash
git clone <repo ของเว็บ> MetaDeltaWeb && cd MetaDeltaWeb
cp .env.example .env    # แล้วใส่ key และตั้ง WEB_HOST=0.0.0.0
pm2 start npm --name metadelta-web -- start && pm2 save
```

จากนั้นเปิดพอร์ต 3000 ใน firewall ของผู้ให้บริการ (Google Cloud: VPC network → Firewall → อนุญาต TCP 3000) ถ้าจะใช้โดเมนและ HTTPS ให้ตั้ง reverse proxy เช่น Caddy ไว้ด้านหน้า

## โครงสร้าง

- `src/server.js` — เว็บเซิร์ฟเวอร์ (หน้าเว็บ, `/api/crafts`, `/api/player`, `/api/seasons`)
- `src/crafting.js` — คำนวณกำไรของทุกสูตรจากราคาตลาด
- `src/player.js` — ดึงสถิติ Operations ของผู้เล่น
- `src/api.js` — เรียก DeltaForceAPI (ราคาและรายชื่อไอเทม)
- `web/` — หน้าเว็บ: หน้าคราฟ (`index.html`, `app.js`), หน้าผู้เล่น (`player.html`, `player.js`), ของที่ใช้ร่วมกัน (`style.css`, `ui.js`)

MetaDelta เป็นเครื่องมือที่ทำขึ้นเอง ไม่ใช่เว็บไซต์ทางการของ Delta Force
