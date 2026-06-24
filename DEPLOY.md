# Production Deployment Guide — Portainer

## Overview

ระบบประกอบด้วย 4 services ที่รันบน Docker Compose:

| Service | Image | Internal Port | หน้าที่ |
|---------|-------|---------------|---------|
| `db` | postgres:16 | 5432 | PostgreSQL database |
| `api` | build: ./apps/api | 4002 | NestJS REST API |
| `web` | build: ./apps/web | 3002 | Next.js Web App |
| `mobile` | build: ./apps/mobile | 80 | Expo Web Build (Nginx) |

**Port Exposure Policy (Production):** ไม่มี service ใดผูก host port โดยตรง — traffic ทั้งหมดเข้าผ่าน reverse proxy บน port 80/443 เท่านั้น

---

## Architecture

```
Internet
   │
   ▼ 80/443
┌──────────────────────────────────────────────────┐
│              Reverse Proxy (Caddy)               │
│  hr.example.com        mobile.hr.example.com     │
└───────┬──────────────────────┬───────────────────┘
        │  Docker network: hr_production
   ┌────┴──────────────────────┴─────────────────────────────┐
   │                │                │                        │
   ▼ web:3002       ▼ api:4002       ▼ mobile:80             │
┌──────────┐  ┌────────────┐  ┌────────────┐   ┌──────────┐ │
│ Next.js  │  │  NestJS    │  │ Expo Web   │   │ Postgres │ │
│   web    │  │    api     │◄─┤  (Nginx)   │   │  db:5432 │◄┘
└──────────┘  └────────────┘  └────────────┘   └──────────┘
```

URL routing:

| Domain | Path | → Service |
|--------|------|-----------|
| `https://hr.example.com` | `/api/*` | `api:4002` (ตัด `/api` prefix ก่อนส่ง) |
| `https://hr.example.com` | `/*` | `web:3002` (Next.js) |
| `https://mobile.hr.example.com` | `/*` | `mobile:80` (Expo Web SPA) |

---

## Prerequisites

### Server
- Docker Engine 24+ และ Docker Compose v2 ติดตั้งแล้ว
- Portainer CE หรือ Portainer Business ติดตั้งแล้ว (ดู [ข้อ 1](#1-ติดตั้ง-portainer-บน-server))
- Domain ชี้ A record มาที่ IP ของ server แล้ว
- Firewall เปิดเฉพาะ port 80 และ 443 สู่ public internet — Portainer (9443) ต้องเข้าถึงผ่าน VPN หรือ IP allowlist เท่านั้น **อย่าเปิด 9000 หรือ 9443 สู่ public internet**

### ข้อมูลที่ต้องเตรียม
- Domain name หลัก เช่น `hr.example.com`
- Subdomain สำหรับ mobile เช่น `mobile.hr.example.com` (A record ชี้ server เดียวกัน)
- Password สำหรับ PostgreSQL (strong, random)
- JWT Secret (อย่างน้อย 32 ตัวอักษร)
- URL ของ API สำหรับ browser เช่น `https://hr.example.com/api`

---

## 1. ติดตั้ง Portainer บน Server

> ข้ามหัวข้อนี้ถ้า Portainer ติดตั้งอยู่แล้ว

```bash
# สร้าง volume สำหรับ Portainer data
docker volume create portainer_data

# รัน Portainer CE — เปิดเฉพาะ HTTPS (9443) บน localhost เท่านั้น
# เข้าถึงผ่าน SSH tunnel หรือ VPN เท่านั้น อย่า expose 9000 หรือ 9443 สู่ public internet
docker run -d \
  -p 127.0.0.1:9443:9443 \
  --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

> **Security:** Portainer ถูก bind ที่ `127.0.0.1:9443` เท่านั้น ห้ามเปิด port 9000 (HTTP ไม่เข้ารหัส) หรือ 9443 สู่ public internet
> เข้าใช้งานผ่าน SSH tunnel: `ssh -L 9443:localhost:9443 user@server-ip` แล้วเปิด `https://localhost:9443`

เข้า Portainer UI: `https://localhost:9443` (ผ่าน SSH tunnel เท่านั้น)

---

## 2. เตรียม Source Code บน Server

Portainer deploy ได้ 2 วิธี:

### วิธี A — Deploy จาก Git Repository (แนะนำ)

Portainer จะ clone repo และ build images ให้โดยอัตโนมัติ ไม่ต้อง SSH เข้า server

> ต้องการ: repo เป็น private → ต้องสร้าง Deploy Key ใน Portainer ก่อน

### วิธี B — Clone ด้วยตนเองบน Server

```bash
# SSH เข้า server
ssh user@server-ip

# Clone project
cd /opt
git clone https://github.com/your-org/hr-management.git
cd hr-management
```

---

## 3. สร้าง Environment File

> ทำบน server ที่ path ของ project (วิธี B) หรือกรอกใน Portainer UI (วิธี A)

```bash
cp .env.example .env
```

แก้ไข `.env` ให้ครบทุก field ที่มี `CHANGE_THIS`:

```env
# ── PostgreSQL ────────────────────────────────────────────────────────────────
POSTGRES_USER=hr_user
POSTGRES_PASSWORD=<strong-random-password>       # เปลี่ยนเสมอ
POSTGRES_DB=hr_management

# ── API — Database URL ────────────────────────────────────────────────────────
DATABASE_URL=postgresql://hr_user:<strong-random-password>@db:5432/hr_management

# ── API — JWT ─────────────────────────────────────────────────────────────────
JWT_SECRET=<run: openssl rand -hex 32>           # เปลี่ยนเสมอ
JWT_EXPIRES_IN=8h

# ── API — CORS ────────────────────────────────────────────────────────────────
CORS_ORIGIN=https://hr.example.com               # domain จริงของคุณ

# ── Frontend (baked at BUILD TIME) ───────────────────────────────────────────
# ⚠ เปลี่ยนค่านี้แล้วต้อง rebuild image ใหม่ทุกครั้ง
NEXT_PUBLIC_API_URL=https://hr.example.com/api

# ── Production Settings ───────────────────────────────────────────────────────
TRUST_PROXY=true

# ── Rate Limiting ─────────────────────────────────────────────────────────────
THROTTLE_TTL=60
THROTTLE_LIMIT=100
LOGIN_THROTTLE_TTL=60
LOGIN_THROTTLE_LIMIT=5

# ── Attendance Geofence (ตั้งค่าตาม location จริงของบริษัท) ──────────────────
ATTENDANCE_GEOFENCE_ENABLED=false
COMPANY_LATITUDE=13.7563
COMPANY_LONGITUDE=100.5018
COMPANY_GEOFENCE_RADIUS_METERS=100
ATTENDANCE_GPS_MAX_ACCURACY_METERS=100

# ── Mobile Web App (baked at BUILD TIME) ─────────────────────────────────────
# ⚠ เปลี่ยนค่านี้แล้วต้อง rebuild image mobile ใหม่ทุกครั้ง
EXPO_PUBLIC_API_BASE_URL=https://hr.example.com/api

# ── Swagger (ปิดใน production) ────────────────────────────────────────────────
SWAGGER_ENABLED=false
```

สร้าง JWT Secret:
```bash
openssl rand -hex 32
```

---

## 4. Deploy Stack ผ่าน Portainer

### วิธี A — Deploy จาก Git Repository

1. เข้า Portainer → **Stacks** → **+ Add stack**
2. ตั้งชื่อ Stack: `hr-management`
3. เลือก **Repository**
4. กรอก:
   - **Repository URL:** `https://github.com/your-org/hr-management.git`
   - **Repository reference:** `refs/heads/main`
   - **Compose path:** `docker-compose.production.yml`
5. (Optional) เปิด **Authentication** ถ้า repo เป็น private และใส่ credentials
6. เลื่อนลงไปที่ **Environment variables** → คลิก **Advanced mode**
7. วาง `.env` ทั้งหมดลงในกล่อง (copy จากไฟล์ `.env` ที่เตรียมไว้)
8. คลิก **Deploy the stack**

> Portainer จะ clone repo → build images → start containers โดยอัตโนมัติ

### วิธี B — Deploy จาก Compose File บน Server

1. เข้า Portainer → **Stacks** → **+ Add stack**
2. ตั้งชื่อ Stack: `hr-management`
3. เลือก **Upload**
4. Upload ไฟล์ `docker-compose.production.yml`
5. กรอก Environment variables เหมือนวิธี A ข้อ 6-7
6. คลิก **Deploy the stack**

---

## 5. Setup Reverse Proxy (Caddy) ใน Portainer

สร้าง Stack แยกสำหรับ Caddy หรือ Nginx:

### Caddy (แนะนำ — จัดการ TLS อัตโนมัติ)

สร้างไฟล์ `docker-compose.caddy.yml` บน server:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - hr_production
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:

networks:
  hr_production:
    external: true    # เชื่อมกับ network ที่ hr-management stack สร้างไว้
```

สร้างไฟล์ `Caddyfile` (ดูตัวอย่างจาก `deploy/caddy/Caddyfile.example`):

```caddyfile
hr.example.com {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy api:4002
    }

    handle {
        reverse_proxy web:3002
    }

    log {
        output file /var/log/caddy/hr-management.log
        format json
    }
}

# Mobile Web App — subdomain แยกต่างหาก
mobile.hr.example.com {
    reverse_proxy mobile:80

    log {
        output file /var/log/caddy/hr-mobile.log
        format json
    }
}
```

> **DNS:** ต้องสร้าง A record (หรือ CNAME → `hr.example.com`) สำหรับ `mobile.hr.example.com` ด้วย

Deploy ใน Portainer:
1. **Stacks** → **+ Add stack** → ชื่อ `caddy-proxy`
2. Upload `docker-compose.caddy.yml`
3. Deploy

> Caddy จะขอ TLS certificate จาก Let's Encrypt โดยอัตโนมัติ

### Nginx (ทางเลือก)

ดูตัวอย่าง config ที่ `deploy/nginx/hr-management.conf.example`

---

## 6. Database Migration (First Deploy เท่านั้น)

หลัง stack ขึ้น ต้อง run Prisma migration ครั้งแรก:

### ผ่าน Portainer UI

1. ไปที่ **Stacks** → `hr-management` → คลิก container `hr-api-prod`
2. คลิก **Console** → **Connect**
3. รันคำสั่ง:

```bash
npx prisma migrate deploy
```

### ผ่าน SSH บน Server

```bash
docker exec -it hr-api-prod npx prisma migrate deploy
```

> `prisma migrate deploy` ใช้สำหรับ production เท่านั้น (ไม่ใช่ `migrate dev`)

---

## 7. Verify การ Deploy

รอให้ containers ขึ้น healthy ทั้งหมด จากนั้นตรวจสอบ:

```bash
# ดู status ใน Portainer หรือ SSH แล้วรัน:
docker compose -f docker-compose.production.yml ps

# ทดสอบ health endpoint ของ API
curl https://hr.example.com/api/health

# ทดสอบ login — ใช้ credentials ของ production admin ที่ตั้งไว้จริง
# ⚠ อย่าใช้ sandbox credentials (admin@hr.local / admin1234) ใน production เด็ดขาด
curl -X POST https://hr.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<temporary-password>"}'
```

> **คำเตือน:** `admin@hr.local` และ `admin1234` เป็น sandbox credentials สำหรับ local development เท่านั้น
> ใน production ต้องเปลี่ยน password ของ admin account ทันทีหลัง first login และห้ามใช้ค่า default เหล่านี้

ผลลัพธ์ที่คาดหวัง:
- `docker ps` → ทุก container สถานะ `healthy` หรือ `Up`
- `/api/health` → `{"status":"ok"}`
- `/api/auth/login` → JSON ที่มี `accessToken`
- `https://mobile.hr.example.com` → เปิดหน้า Mobile App ใน browser ได้

---

## 8. Update / Redeploy

### วิธี A (Git-based Stack)

1. Portainer → **Stacks** → `hr-management`
2. คลิก **Pull and redeploy**
3. ✅ เปิด **Re-pull image and redeploy**
4. คลิก **Update the stack**

> Portainer จะ pull code ใหม่, rebuild images, restart containers

### วิธี B (Manual)

```bash
# SSH เข้า server
cd /opt/hr-management
git pull origin main

# Rebuild และ restart stack ผ่าน Portainer UI
# หรือรันตรงๆ:
docker compose -f docker-compose.production.yml up -d --build
```

**⚠ Build-time variables — ถ้า URL เปลี่ยน ต้อง rebuild image:**

| ตัวแปร | Image ที่ต้อง rebuild |
|--------|----------------------|
| `NEXT_PUBLIC_API_URL` | `web` |
| `EXPO_PUBLIC_API_BASE_URL` | `mobile` |

---

## 9. ดู Logs ใน Portainer

| ต้องการดู | วิธี |
|-----------|------|
| API logs | Stacks → hr-management → `hr-api-prod` → Logs |
| Web logs | Stacks → hr-management → `hr-web-prod` → Logs |
| Mobile logs | Stacks → hr-management → `hr-mobile-prod` → Logs |
| DB logs | Stacks → hr-management → `hr-db-prod` → Logs |
| Caddy logs | Stacks → caddy-proxy → `caddy` → Logs |

หรือผ่าน terminal:

```bash
docker compose -f docker-compose.production.yml logs -f api
docker compose -f docker-compose.production.yml logs -f web
docker compose -f docker-compose.production.yml logs -f mobile
```

---

## 10. Database Backup

```bash
# Backup
docker exec hr-db-prod pg_dump -U hr_user hr_management > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore (ระวัง: จะ overwrite ข้อมูลทั้งหมด)
docker exec -i hr-db-prod psql -U hr_user hr_management < backup_YYYYMMDD_HHMMSS.sql
```

---

## 11. Troubleshooting

### Container ไม่ขึ้น / restart loop

```bash
# ดู logs ของ container ที่มีปัญหา
docker logs hr-api-prod --tail 100
docker logs hr-web-prod --tail 100
```

### API ตอบ 502 Bad Gateway

1. ตรวจว่า `hr-api-prod` สถานะ `healthy` ใน `docker ps`
2. ตรวจว่า Caddy/Nginx อยู่ใน network `hr_production`:
   ```bash
   docker network inspect hr_production
   ```

### NEXT_PUBLIC_API_URL หรือ EXPO_PUBLIC_API_BASE_URL ผิด

ตัวแปรเหล่านี้ bake ตอน build — ต้อง rebuild image ที่ผิด:
```bash
# แก้ web
docker compose -f docker-compose.production.yml build web
docker compose -f docker-compose.production.yml up -d web

# แก้ mobile
docker compose -f docker-compose.production.yml build mobile
docker compose -f docker-compose.production.yml up -d mobile
```

### Mobile เปิดได้แต่ login ไม่ผ่าน (CORS หรือ API URL ผิด)

1. เปิด browser DevTools → Network tab → ดู request ที่ fail
2. ถ้า URL ที่ mobile ยิงไปผิด → rebuild mobile image ด้วย `EXPO_PUBLIC_API_BASE_URL` ที่ถูก
3. ถ้า CORS error → เพิ่ม `https://mobile.hr.example.com` ใน `CORS_ORIGIN` ใน `.env`:
   ```
   CORS_ORIGIN=https://hr.example.com,https://mobile.hr.example.com
   ```
   แล้ว redeploy stack (api ไม่ต้อง rebuild — เป็น runtime env)

### `mobile.hr.example.com` เปิดแล้วได้ 404

1. ตรวจ A record ของ `mobile.hr.example.com` ว่าชี้มาที่ server IP ถูกต้อง
2. ตรวจว่า Caddyfile มี block `mobile.hr.example.com { ... }` แล้ว
3. Reload Caddy: `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`

### Database migration failed

```bash
# ดู migration status
docker exec hr-api-prod npx prisma migrate status

# ถ้า migration ค้าง ให้ resolve ด้วยตนเอง
docker exec hr-api-prod npx prisma migrate resolve --applied <migration-name>
```

### TLS Certificate ไม่ออก (Caddy)

1. ตรวจว่า A record ของ domain ชี้มาที่ server IP ถูกต้อง
2. ตรวจว่า port 80 และ 443 เปิดอยู่ใน firewall
3. ดู Caddy logs: `docker logs caddy`

### Stack ขึ้นช้า (Portainer timeout)

containers ที่ต้อง build จาก source อาจใช้เวลานาน 5-10 นาที Portainer deploy timeout ปกติที่ 10 นาที ถ้าหมดเวลาให้ดู stack status ใหม่ — process อาจยังรันอยู่ใน background

---

## 12. Security Checklist ก่อน Go-Live

- [ ] `POSTGRES_PASSWORD` เป็น random string ที่แข็งแกร่ง ไม่ใช่ค่า default
- [ ] `JWT_SECRET` ยาวอย่างน้อย 32 ตัวอักษร สุ่มด้วย `openssl rand -hex 32`
- [ ] `CORS_ORIGIN` ตั้งเป็น domain จริง ไม่มี wildcard `*`
- [ ] `SWAGGER_ENABLED=false` ใน production
- [ ] ไม่มี host port binding สำหรับ db (5432), api (4002), web (3002), mobile (80)
- [ ] Firewall เปิด port 80 และ 443 สู่ public เท่านั้น — Portainer (9443) ต้องเข้าถึงผ่าน SSH tunnel หรือ VPN เท่านั้น ห้ามเปิด 9000 หรือ 9443 สู่ public internet
- [ ] ไฟล์ `.env` ไม่ถูก commit ลง Git repository
- [ ] Portainer UI ป้องกันด้วย password ที่แข็งแกร่งและ HTTPS เท่านั้น (bind ที่ `127.0.0.1` ไม่ใช่ `0.0.0.0`)
- [ ] เปลี่ยน password ของ admin account จาก sandbox default ก่อน go-live

---

## สรุป Files ที่เกี่ยวข้อง

| ไฟล์ | ใช้สำหรับ |
|------|-----------|
| `docker-compose.production.yml` | Production stack (ใช้ไฟล์นี้ใน Portainer) |
| `.env.example` | Template สำหรับสร้าง `.env` |
| `deploy/caddy/Caddyfile.example` | ตัวอย่าง Caddy config |
| `deploy/nginx/hr-management.conf.example` | ตัวอย่าง Nginx config |
| `apps/api/Dockerfile` | API image (NestJS + Prisma) |
| `apps/web/Dockerfile` | Web image (Next.js standalone) |
| `apps/mobile/Dockerfile` | Mobile web image (Expo + Nginx) |
