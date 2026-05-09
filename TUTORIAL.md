# Neon Fingerprint Wall — Tutorial

> เรียนรู้หลักการทำงานของ `display-v3.js` ทีละ concept  
> แต่ละ step เพิ่มแค่ **1 แนวคิดใหม่** — เปิด HTML ใหม่แล้วลองทีละ step

---

## Step 1 — Canvas เปล่า + วาด arc เส้นเดียว

**แนวคิด:** p5.js canvas basics + quadratic bezier คืออะไร

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  p.setup = () => p.createCanvas(400, 400);

  p.draw = () => {
    p.background(5, 4, 8);

    // arc = เส้นโค้ง bezier 1 เส้น
    // vertex → quadraticVertex → endShape
    p.noFill();
    p.stroke(255);
    p.strokeWeight(2);
    p.beginShape();
      p.vertex(100, 200);                          // จุดเริ่ม
      p.quadraticVertex(200, 100, 300, 200);       // control point, จุดสิ้นสุด
    p.endShape();
  };
});
</script>
</body>
</html>
```

> **ลองเปลี่ยน:** control point จาก `(200, 100)` เป็น `(200, 300)` — เส้นโค้งจะกลับทิศ

---

## Step 2 — วาง arc หลายเส้นบน circle

**แนวคิด:** วาง arc ตามขอบวงกลม โดยให้แต่ละเส้นหัน**ตาม tangent angle** ของวงกลม ณ จุดนั้น

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  p.setup = () => p.createCanvas(400, 400);

  p.draw = () => {
    p.background(5, 4, 8);
    p.noFill();
    p.stroke(255);
    p.strokeWeight(2);

    const cx = 200, cy = 200, r = 150;
    const count = 40;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px    = cx + Math.cos(angle) * r;
      const py    = cy + Math.sin(angle) * r;

      // tangent = เส้นสัมผัสวงกลม (ตั้งฉากกับ radius)
      const tang = angle + Math.PI / 2;
      const half = 20;

      const x1 = px - Math.cos(tang) * half;
      const y1 = py - Math.sin(tang) * half;
      const x2 = px + Math.cos(tang) * half;
      const y2 = py + Math.sin(tang) * half;

      // control point โค้งออกจากศูนย์กลาง
      const ctrlX = px - Math.cos(angle) * half * 0.5;
      const ctrlY = py - Math.sin(angle) * half * 0.5;

      p.beginShape();
        p.vertex(x1, y1);
        p.quadraticVertex(ctrlX, ctrlY, x2, y2);
      p.endShape();
    }
  };
});
</script>
</body>
</html>
```

> **ลองเปลี่ยน:** `half` จาก `20` → `40`, และ control offset จาก `0.5` → `2.0` — เส้นโค้งมากขึ้น

---

## Step 3 — แยก dark กับ lit — State แรก

**แนวคิด:** แต่ละ arc มี state — `null` = ยังไม่ติดแสง, `[r,g,b]` = ติดแสงแล้ว  
คลิก canvas เพื่อติดแสง arc สุ่ม

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  const COUNT = 40;
  let litColor = new Array(COUNT).fill(null);

  p.setup = () => {
    p.createCanvas(400, 400);
    p.mousePressed = () => {
      const i = Math.floor(Math.random() * COUNT);
      litColor[i] = [100, 180, 255]; // สีฟ้า
    };
  };

  p.draw = () => {
    p.background(5, 4, 8);
    const cx = 200, cy = 200, r = 150;

    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const px    = cx + Math.cos(angle) * r;
      const py    = cy + Math.sin(angle) * r;
      const tang  = angle + Math.PI / 2;
      const half  = 20;

      const x1    = px - Math.cos(tang) * half;
      const y1    = py - Math.sin(tang) * half;
      const x2    = px + Math.cos(tang) * half;
      const y2    = py + Math.sin(tang) * half;
      const ctrlX = px - Math.cos(angle) * half * 0.5;
      const ctrlY = py - Math.sin(angle) * half * 0.5;

      p.noFill();
      p.strokeWeight(2);

      if (litColor[i]) {
        const [r, g, b] = litColor[i];
        p.stroke(r, g, b, 220);   // สว่าง
      } else {
        p.stroke(30, 35, 60, 60); // มืด
      }

      p.beginShape();
        p.vertex(x1, y1);
        p.quadraticVertex(ctrlX, ctrlY, x2, y2);
      p.endShape();
    }
  };
});
</script>
</body>
</html>
```

> **คลิกหลายๆ ครั้ง** — เห็น arc ค่อยๆ ติดแสงทีละอัน

---

## Step 4 — Additive Blend Mode คืออะไร

**แนวคิด:** `p.ADD` blend ทำให้แสงซ้อนกัน = สว่างขึ้น (เหมือน neon จริงๆ)  
ต่างจาก `p.BLEND` ปกติที่สีหลังทับสีหน้า

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  p.setup = () => p.createCanvas(400, 200);

  p.draw = () => {
    p.background(0);

    // ซ้าย: BLEND ปกติ — สีหลังทับสีหน้า
    p.blendMode(p.BLEND);
    p.noStroke();
    p.fill(255, 0, 0, 180); p.ellipse(80, 100, 80);
    p.fill(0, 0, 255, 180); p.ellipse(120, 100, 80);

    // ขวา: ADD — แสงบวกกัน, จุดที่ซ้อนกัน = ขาว/สว่างมาก
    p.blendMode(p.ADD);
    p.fill(255, 0, 0, 180); p.ellipse(280, 100, 80);
    p.fill(0, 0, 255, 180); p.ellipse(320, 100, 80);

    // reset กลับ BLEND เสมอก่อนวาด text/UI
    p.blendMode(p.BLEND);
    p.fill(150); p.noStroke(); p.textAlign(p.CENTER);
    p.text('BLEND', 100, 175);
    p.text('ADD (neon)', 300, 175);
  };
});
</script>
</body>
</html>
```

> **สังเกต:** จุดที่วงกลมซ้อนกัน ฝั่ง ADD จะสว่างขึ้น/ขาว — นั่นคือหัวใจของ neon glow

---

## Step 5 — Glow Layer: วาด arc 4 ชั้น

**แนวคิด:** neon glow ที่ดูสวย ไม่ได้มาจากเส้นหนาๆ เส้นเดียว  
แต่มาจากการวาด**เส้นเดิมซ้ำ 4 ครั้ง** ด้วยขนาดและ alpha ต่างกัน บน ADD blend

| Layer | strokeWeight | alpha | หน้าที่ |
|-------|-------------|-------|---------|
| Outer glow | ใหญ่มาก | ต่ำมาก | halo รอบนอก |
| Mid glow | กลาง | ปานกลาง | ขยายแสง |
| Inner glow | เล็ก | สูงขึ้น | ความเข้มใกล้ core |
| Core | บาง | ทึบสุด | เส้นหลัก, ความคมชัด |

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  p.setup = () => p.createCanvas(400, 400);

  p.draw = () => {
    p.background(5, 4, 8);

    const x1 = 100, y1 = 200;
    const x2 = 300, y2 = 200;
    const ctrlX = 200, ctrlY = 100;
    const r = 100, g = 180, b = 255;

    p.blendMode(p.ADD);
    p.noFill();
    p.strokeCap(p.ROUND);

    // Layer 1: Outer glow — กว้างมาก, โปร่งมาก
    p.strokeWeight(40); p.stroke(r, g, b, 12);
    p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

    // Layer 2: Mid glow
    p.strokeWeight(18); p.stroke(r, g, b, 35);
    p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

    // Layer 3: Inner glow
    p.strokeWeight(8);  p.stroke(r, g, b, 90);
    p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

    // Layer 4: Core — บาง, ทึบสุด
    p.strokeWeight(2);  p.stroke(r, g, b, 220);
    p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

    p.blendMode(p.BLEND);
  };
});
</script>
</body>
</html>
```

> **ลองปิดทีละ layer** (comment out) เพื่อดูว่าแต่ละชั้นให้อะไร

---

## Step 6 — Flare: white-hot แล้ว settle

**แนวคิด:** เมื่อ arc ติดใหม่ `flareT` เริ่มที่ `0` แล้วค่อยๆ เพิ่มถึง `1`  
ระหว่างนั้น lerp สีจาก **ขาว → สีจริง**

```
flareT: 0 ──────────────────── 1
สี:   [255,255,255] ──→ [100,180,255]   (สีของ participant)
```

คลิก canvas เพื่อ trigger flare บน arc สุ่ม

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  const COUNT   = 40;
  const FLARE_MS = 1200;
  let states;

  p.setup = () => {
    p.createCanvas(400, 400);
    states = Array.from({length: COUNT}, () => ({
      lit:    false,
      color:  [100, 200, 255],
      flareT: 1,   // 0 = just activated (white), 1 = fully settled
    }));

    p.mousePressed = () => {
      const i = Math.floor(Math.random() * COUNT);
      states[i].lit    = true;
      states[i].flareT = 0; // ← trigger flare!
    };
  };

  p.draw = () => {
    p.background(5, 4, 8);
    p.noFill();
    p.strokeCap(p.ROUND);

    const cx = 200, cy = 200, r = 150;

    for (let i = 0; i < COUNT; i++) {
      const st = states[i];

      // advance flare timer
      if (st.flareT < 1) st.flareT = Math.min(1, st.flareT + p.deltaTime / FLARE_MS);

      const angle = (i / COUNT) * Math.PI * 2;
      const px    = cx + Math.cos(angle) * r;
      const py    = cy + Math.sin(angle) * r;
      const tang  = angle + Math.PI / 2;
      const half  = 20;

      const x1    = px - Math.cos(tang) * half;
      const y1    = py - Math.sin(tang) * half;
      const x2    = px + Math.cos(tang) * half;
      const y2    = py + Math.sin(tang) * half;
      const ctrlX = px - Math.cos(angle) * half * 0.5;
      const ctrlY = py - Math.sin(angle) * half * 0.5;

      if (!st.lit) {
        p.blendMode(p.BLEND);
        p.strokeWeight(2);
        p.stroke(30, 35, 60, 60);
        p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();
        continue;
      }

      // flare = 1 - flareT  →  1 ตอนเพิ่งติด, 0 ตอน settle แล้ว
      const flare = 1 - st.flareT;
      let [r2, g2, b2] = st.color;

      // lerp: สีจริง → ขาว ตาม flare
      r2 = r2 + (255 - r2) * flare;
      g2 = g2 + (255 - g2) * flare;
      b2 = b2 + (255 - b2) * flare;

      p.blendMode(p.ADD);

      // Outer glow
      p.strokeWeight(20); p.stroke(r2, g2, b2, 15 + flare * 30);
      p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

      // Core
      p.strokeWeight(2);  p.stroke(r2, g2, b2, 200 + flare * 55);
      p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

      p.blendMode(p.BLEND);
    }
  };
});
</script>
</body>
</html>
```

> **คลิกหลายๆ ครั้ง** — เห็น arc แฟลร์ขาวแล้ว fade เป็นสีฟ้า

---

## Step 7 — Breathing: sine pulse พร้อมกัน

**แนวคิด:** `globalBreathe` คือ sine wave ค่าเดียว ที่ใช้กับ**ทุก arc พร้อมกัน**  
ทำให้ทั้ง fingerprint "หายใจ" เป็นจังหวะเดียวกัน

```
globalBreathe = sin(t × 0.28) × 0.5 + 0.5
                 │              └── map 0..1 (ไม่ติดลบ)
                 └── ความถี่ต่ำ = รอบยาว ~22 วินาที
```

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></script>
</head>
<body style="margin:0;background:#000">
<script>
new p5(p => {
  const COUNT = 40;
  const COLOR = [100, 200, 255];

  p.setup = () => {
    p.createCanvas(400, 400);
    p.frameRate(40);
  };

  p.draw = () => {
    p.background(5, 4, 8);
    const t = p.millis() / 1000;

    // หัวใจของ breath: sine เดียว ใช้ร่วมกันทุก arc
    const breathe = Math.sin(t * 0.28) * 0.5 + 0.5; // 0..1, ~22s cycle

    const cx = 200, cy = 200, r = 150;
    const [r2, g2, b2] = COLOR;

    p.blendMode(p.ADD);
    p.noFill();
    p.strokeCap(p.ROUND);

    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2;
      const px    = cx + Math.cos(angle) * r;
      const py    = cy + Math.sin(angle) * r;
      const tang  = angle + Math.PI / 2;

      // arc ยาวขึ้นเล็กน้อยตอนหายใจเข้า (+8%)
      const half  = 20 * (1 + breathe * 0.08);

      const x1    = px - Math.cos(tang) * half;
      const y1    = py - Math.sin(tang) * half;
      const x2    = px + Math.cos(tang) * half;
      const y2    = py + Math.sin(tang) * half;
      const ctrlX = px - Math.cos(angle) * half * 0.5;
      const ctrlY = py - Math.sin(angle) * half * 0.5;

      // breathe → alpha ของแต่ละ layer
      p.strokeWeight(30); p.stroke(r2, g2, b2, breathe * 10);
      p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

      p.strokeWeight(8);  p.stroke(r2, g2, b2, breathe * 70);
      p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();

      p.strokeWeight(2);  p.stroke(r2, g2, b2, breathe * 200);
      p.beginShape(); p.vertex(x1,y1); p.quadraticVertex(ctrlX,ctrlY,x2,y2); p.endShape();
    }

    p.blendMode(p.BLEND);
  };
});
</script>
</body>
</html>
```

> **ลองเปลี่ยน `0.28`:**  
> → `1.5` = หายใจเร็ว  
> → `0.05` = หายใจช้ามาก  
> → `3.0` = กระพริบ

---

## Step 8 — ดู display-v3.js ด้วยตาใหม่

ตอนนี้เปิด `display-v3.js` อ่านอีกครั้ง — แต่ละส่วนจะ map กับ step ที่เรียนมา:

| บรรทัด | Step | หน้าที่ |
|--------|------|---------|
| `52–73` | 1–2 | `drawArc()` — วาด bezier arc ตาม tangent |
| `76–87` | — | `drawBackgroundGlow()` — ambient warmth เพิ่มตามจำนวนคน |
| `162–165` | 7 | `globalBreathe` + `intensityCap` (จำกัด 50% หลัง 10s) |
| `171–197` | 3 | **PASS 1**: dark arcs, BLEND mode |
| `199–258` | 4–6 | **PASS 2**: lit arcs, ADD mode |
| `226–231` | 6 | flare lerp — lerp สี → ขาว ตาม `flarePeak` |
| `233` | 7 | `breatheAmt = pt.opacity × globalBreathe` |
| `241–258` | 5 | outer / mid / inner / core — 4 layer glow |

### สิ่งที่ display-v3 เพิ่มเติมจาก tutorial นี้

- **`fingerprint.js`** — generate particle positions ให้เป็นรูปไอคอน camp จริงๆ แทนที่จะเป็นวงกลมเรียบๆ
- **Transition lerp** — `transitionFrom` → `litColor` over `TRANSITION_MS` พร้อม ease-out cubic (`1 - (1-t)³`)
- **Stagger queue** — `pendingActivations` + `STAGGER_MS` ทำให้ arc ติดทีละเส้นไม่พร้อมกันหมด
- **WebSocket** — `connectWebSocket()` รับ participant ใหม่ real-time
- **`intensityCap`** — หลัง 10s cap breathe ที่ 50% ป้องกันจ้าเกินไป

---

*Built for Authentic Camp — สะท้อนพระคริสต์ด้วยชีวิตจริง*
