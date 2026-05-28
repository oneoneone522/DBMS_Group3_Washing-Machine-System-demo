# 🧺 宿舍洗衣機管理系統

> DBMS Group 3 - 政治大學宿舍洗衣機預約與管理平台

---

## 📋 專案簡介

本系統提供宿舍學生一個便利的洗衣機管理平台，支援機台狀態查詢、QR Code 掃碼使用、排隊預約、設備報修及違規紀錄查詢等功能。

---

## ✨ 系統功能

| 功能 | 說明 |
|------|------|
| 🔐 會員系統 | 註冊、登入、登出、忘記密碼、重設密碼 |
| 🏠 機台總覽 | 依宿舍顯示各樓層洗衣機即時狀態 |
| 📱 QR Code 使用 | 掃描機台 QR Code 啟動使用 |
| 🔢 排隊系統 | 機台使用中可加入排隊，系統自動排序 |
| ⚠️ 違規紀錄 | 查看個人違規紀錄與累積扣點 |
| 🔧 設備報修 | 填寫報修單並上傳故障照片 |
| 🔔 通知系統 | 接收輪到使用等系統通知 |

---

## 🔄 使用者操作流程

### 1️⃣ 註冊 / 登入

```
首次使用 → /signup
  填寫：宿舍、姓名、學號、房號、Email、密碼
  → 註冊成功後跳轉至登入頁

忘記密碼 → /forgot-password
  輸入 Email → 收到重設連結信 → /reset-password/:token
  → 設定新密碼 → 返回登入
```

### 2️⃣ 查看機台狀態

```
登入後 → /machine
  系統自動依宿舍篩選機台
  → 選擇樓層 → /machine/floor/:floor
  → 查看該樓層所有機台（空閒 / 使用中 / 排隊人數）
```

### 3️⃣ 使用洗衣機

```
方式 A：QR Code 掃碼
  掃描機台上的 QR Code → /scan_qr?machine_id=X
  → 確認機台 → 開始使用 → /use_machine/:machine_id
  → 使用完成後按「完成」→ /api/finished/:usage_id

方式 B：排隊等待
  機台使用中 → 點「加入排隊」→ /api/queue/:machine_id
  → 等待通知輪到 → 掃碼使用
  → 取消排隊 → /api/cancel_queue/:machine_id
```

### 4️⃣ 設備報修

```
發現機台異常 → /maintenance
  選擇宿舍 / 樓層 / 機台
  → 填寫問題類型與描述
  → 上傳故障照片（選填）
  → 送出報修單
```

### 5️⃣ 查詢違規紀錄

```
/penalty
  → 顯示個人累積扣點與違規明細
```

---

## 🛠️ 技術架構

### 後端
- **Runtime**：Node.js (ESM)
- **Framework**：Express.js 5
- **Template Engine**：EJS
- **Session**：express-session
- **DB Driver**：mysql2（連接池）

### 前端
- Bootstrap 5（響應式介面）
- 原生 JavaScript（fetch API）

### 資料庫
- MySQL

### 套件一覽
| 套件 | 用途 |
|------|------|
| `bcryptjs` | 密碼雜湊加密 |
| `nodemailer` | 寄送重設密碼信件 |
| `multer` | 報修照片上傳 |
| `qrcode` | 產生機台 QR Code |
| `dotenv` | 環境變數管理 |

---

## 🗄️ 資料庫設定

需要在 MySQL 中額外執行以下 SQL：

### password_reset_tokens（忘記密碼功能）
```sql
CREATE TABLE password_reset_tokens (
  token_id    INT AUTO_INCREMENT PRIMARY KEY,
  User_ID     INT NOT NULL,
  token       VARCHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  DATETIME DEFAULT NOW(),
  FOREIGN KEY (User_ID) REFERENCES User(User_ID) ON DELETE CASCADE
);
```

### DORM（宿舍選單）
```sql
CREATE TABLE IF NOT EXISTS DORM (
  DORM_ID   INT AUTO_INCREMENT PRIMARY KEY,
  DORM_NAME VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO DORM (DORM_NAME) VALUES
  ('自強一舍'), ('自強二舍'), ('自強三舍'),
  ('自強五舍'), ('自強六舍'), ('自強七舍'), ('自強八舍'),
  ('自強九舍A區'), ('自強九舍B區'), ('自強九舍C區'), ('自強九舍D區'),
  ('自強十舍'),
  ('莊敬一舍'), ('莊敬二舍'), ('莊敬三舍'), ('莊敬四舍');
```

---

## ⚙️ 環境設定

在專案根目錄建立 `.env` 檔案：

```env
DB_HOST=你的資料庫主機
DB_USER=你的資料庫帳號
DB_PASSWORD=你的資料庫密碼
DB_NAME=dbms_example

SESSION_SECRET=任意自訂的隨機字串

MAIL_USER=你的gmail@gmail.com
MAIL_PASS=Gmail的16碼應用程式密碼
```

> **Gmail App 密碼設定**：Google 帳號 → 安全性 → 兩步驟驗證 → 應用程式密碼

---

## 🚀 安裝與啟動

```bash
# 1. Clone 專案
git clone https://github.com/oneoneone522/DBMS_Group3_Washing-Machine-System-demo.git
cd DBMS_Group3_Washing-Machine-System-demo

# 2. 安裝套件
pnpm install

# 3. 設定 .env（參考上方）

# 4. 在 MySQL 執行建表 SQL（參考上方）

# 5. 啟動伺服器
node app.js
```

開啟瀏覽器：`http://localhost:3000`

---

## 📡 API 路由總覽

### 認證
| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/login` | 登入頁面 |
| POST | `/login` | 登入驗證 |
| GET | `/signup` | 註冊頁面 |
| POST | `/signup` | 新增帳號 |
| GET | `/logout` | 登出 |
| GET | `/forgot-password` | 忘記密碼頁面 |
| POST | `/forgot-password` | 寄出重設信件 |
| GET | `/reset-password/:token` | 重設密碼頁面 |
| POST | `/reset-password/:token` | 更新密碼 |

### 機台
| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/machine` | 機台總覽 |
| GET | `/machine/floor/:floor` | 樓層機台頁面 |
| GET | `/api/machine/my-dorm` | 取得本宿舍機台資料 |
| GET | `/api/machine/floor/:floor` | 取得樓層機台資料 |

### 使用 / 排隊
| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/scan_qr` | QR Code 掃碼頁面 |
| GET | `/use_machine/:machine_id` | 開始使用機台 |
| POST | `/api/finished/:usage_id` | 完成使用 |
| POST | `/api/queue/:machine_id` | 加入排隊 |
| POST | `/api/cancel_queue/:machine_id` | 取消排隊 |
| GET | `/api/my_queue` | 查詢排隊狀態 |

### 其他
| 方法 | 路由 | 說明 |
|------|------|------|
| GET | `/penalty` | 違規紀錄頁面 |
| GET | `/maintenance` | 設備報修頁面 |
| POST | `/maintenance` | 送出報修單 |

---

## 👥 開發團隊

> DBMS Group 3
