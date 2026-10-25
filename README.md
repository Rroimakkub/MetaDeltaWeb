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

ครั้งแรกที่เปิดเว็บต้องรอดึงราคาประมาณ 30 วินาที หลังจากนั้นเว็บใช้ราคาที่เก็บไว้ 10 นาทีแล้วดึงใหม่ หน้าเว็บรีเฟรชเองทุก 10 นาที

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

## ขึ้นเซิร์ฟเวอร์

บนเครื่องเดียวกับบอต (เช่น VPS ที่รันบอตอยู่):

```bash
git clone <repo ของเว็บ> MetaDeltaWeb && cd MetaDeltaWeb
cp .env.example .env    # แล้วใส่ key และตั้ง WEB_HOST=0.0.0.0
pm2 start npm --name metadelta-web -- start && pm2 save
```

จากนั้นเปิดพอร์ต 3000 ใน firewall ของผู้ให้บริการ (Google Cloud: VPC network → Firewall → อนุญาต TCP 3000) ถ้าจะใช้โดเมนและ HTTPS ให้ตั้ง reverse proxy เช่น Caddy ไว้ด้านหน้า

## โครงสร้าง

- `src/server.js` — เว็บเซิร์ฟเวอร์ (หน้าเว็บและ `/api/crafts`)
- `src/crafting.js` — คำนวณกำไรของทุกสูตรจากราคาตลาด
- `src/api.js` — เรียก DeltaForceAPI (ราคาและรายชื่อไอเทม)
- `web/` — หน้าเว็บ (`index.html`, `style.css`, `app.js`)

MetaDelta เป็นเครื่องมือที่ทำขึ้นเอง ไม่ใช่เว็บไซต์ทางการของ Delta Force
