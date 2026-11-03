# 🏇 EquiFlow Simulator Web — Phiên Bản 3 (v3: TMEC Intro & Stardew Farm)

[![Tests](https://img.shields.io/badge/Tests-172%2F172%20Pass-brightgreen.svg)](https://github.com/MichaelTran1226/Racehorse_Simulator_Web)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%2B-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Style](https://img.shields.io/badge/Art-Stardew%20Valley%20Assets%20%2B%20TMEC%20Parallax-orange.svg)](https://github.com/MichaelTran1226/Racehorse_Simulator_Web)
[![Port](https://img.shields.io/badge/Port-5175-purple.svg)](http://localhost:5175)

Phân hệ **Digital Twin & Mô phỏng IoT Ảo** độc lập theo SRS & Design Handoff v2.0 của Dự án SWP391.  
Ứng dụng web đồ họa **Pixel Art trên HTML5 Canvas 2D phong cách Stardew Valley**, kết hợp bảng điều khiển tương tác **Hay Day** thân thiện với người dùng. Tích hợp màn hiệu ứng mở màn **TMEC Intro**, nông trại chuồng trại sinh thái, động cơ tính toán sinh trắc học ngựa (Telemetry Math Engine), trạm thú y, kho vật tư và trường đua 6 làn kịch tính.

---

## 🚀 1. Khởi Động Nhanh (Quick Start)

### Yêu cầu tiên quyết:
- **Node.js**: Phiên bản 22.x hoặc 24.x LTS (`node -v`)
- **Backend Server** (tùy chọn để kết nối thời gian thực): Chạy tại `http://localhost:3000`

### Các bước cài đặt:

```bash
# 1. Cài đặt các thư viện phụ thuộc
npm install

# 2. Cấu hình biến môi trường
# Trên Windows PowerShell:
Copy-Item .env.example .env
# Trên Linux / macOS:
cp .env.example .env

# 3. Khởi chạy máy chủ phát triển
npm run dev
```

Simulator Web sẽ lắng nghe tại: **`http://localhost:5175`**

> 🔒 **Mã PIN Khóa Người Xem (Spectator Lock):** Mặc định là **`2204`**. Dùng mã này để mở khóa can thiệp trực tiếp vào tham số mô phỏng hoặc điều khiển khẩn cấp.

---

## 🌟 2. Điểm Nổi Bật của Phiên Bản 3 (v3)

1. **🎬 Màn Mở Màn Thương Hiệu (TMEC Intro Parallax):**
   - 3 tầng mây Stardew Valley (`back`, `mid`, `front`) tạo độ sâu không gian 2.5D.
   - Chữ viết tắt **"TMEC"** bật nảy ở trung tâm rồi giãn nở thành: **"THIEN MA EQUESTRIAN CLUB"**.
   - Mây tách sang hai bên, camera lướt nhẹ đưa người dùng vào tâm điểm nông trại.
2. **🗺️ Quy Hoạch Bản Đồ Nông Trại Stardew Mới:**
   - **Đường xuyên tâm cho xe tải:** Xe vận chuyển hàng tự động lăn bánh vào tận cửa kho vật tư khi có lệnh tiếp tế.
   - **Trạm Y Tế đối xứng:** Sprite trạm thú y tái cấu trúc đối xứng hai bên.
   - **Sinh vật môi trường sống động (Critters):** Đàn gà gặm thóc, vịt bơi, chó giữ cổng và mèo phơi nắng.
3. **💓 Động Cơ Sinh Trắc Học & Hồi Phục Nhịp Tim (Telemetry Engine):**
   - Mô phỏng nhịp tim biến thiên theo cường độ chạy (Walk, Trot, Canter, Gallop).
   - Tích hợp **pha Cooldown 10 phút** tính toán nhịp tim hồi phục sau chạy thử (`BUG-MAN-07`).
   - Ghi nhận và đồng bộ sự cố gãy chân/tai nạn đường đua trực tiếp vào lịch sử trạng thái của Backend (`BUG-MAN-11`).
4. **♿ Thân Thiện & Trợ Năng (Accessibility & Controls):**
   - Hỗ trợ phím mũi tên bàn phím ($\leftarrow, \rightarrow, \uparrow, \downarrow$) để di chuyển góc nhìn bản đồ (`BUG-TECH-03`).
   - Loại bỏ bước zoom lẻ 1.15x giúp đồ họa pixel art luôn sắc nét, không bị xé hạt (`BUG-TECH-02`).

---

## 🎮 3. Các Phân Vùng Chức Năng Trên Bản Đồ

| Phân Vùng | Cách Tương Tác | Chức Năng Chính |
| :--- | :--- | :--- |
| **Khu Chuồng Trại (Barns)** | Bấm vào dãy chuồng lớn | Xem lưới 6×6 ô chuồng, phân bổ ngựa, tình trạng dọn dẹp, bóng ngủ "zzz" |
| **Trạm Thú Y (Vet Clinic)** | Bấm vào trạm xá Harvey | Khám tổng quát, đo thân nhiệt, nhịp tim, cách ly điều trị chấn thương |
| **Kho Vật Tư (Supply Barn)** | Bấm vào nhà kho gỗ | Theo dõi định mức tồn kho (cỏ, yến mạch, thuốc), gọi xe tải tiếp tế |
| **Đường Đua (Track Arena)** | Bấm vào nút cờ đua góc phải | Chế độ **Chạy Thử (Trial)** 1 ngựa hoặc **Đua 6 Làn (6-Lanes Race)** |
| **Thẻ Chiến Mã (Horse Card)**| Bấm vào bất kỳ chú ngựa nào | Xem ảnh pixel động, nhịp tim BPM thời gian thực, mã chip ISO 11784 |

---

## 🛠️ 4. Cấu Hình Biến Môi Trường (`.env`)

```env
# Địa chỉ Backend REST API
VITE_API_URL=http://localhost:3000/api

# Địa chỉ Socket.IO Gateway nhận/phát Telemetry trực tiếp
VITE_SOCKET_URL=http://localhost:3000/simulator

# Chế độ dữ liệu (false = kết nối Backend thật; true = dùng mock nội bộ)
VITE_USE_MOCK=false
```

---

## 🧪 5. Kiểm Thử & Kiểm Soát Chất Lượng

```bash
# Kiểm tra TypeScript typecheck (0 lỗi)
npm run typecheck

# Chạy toàn bộ 172 bài kiểm thử tự động (Node.js Test Runner)
npm test

# Đóng gói bản phát hành sản phẩm (Production Build)
npm run build
```

---

## 🏛️ 6. Cấu Trúc Thư Mục Dự Án

```
src/
├── api/              # API Client kết nối Backend REST (ngựa, chuồng, kho)
├── hub/              # Quản lý góc nhìn camera, autotile bản đồ nông trại
├── render/           # Canvas 2D render loop, hoạt ảnh mây TMEC, đổ bóng
├── sim/              # Telemetry Math Engine, nhịp tim hồi phục, Socket Transport
├── ui/               # Giao diện tương tác Hay Day (Roster, Stall, Supply, Track)
└── main.tsx          # Điểm khởi chạy ứng dụng React & Canvas Canvas Bridge
```
