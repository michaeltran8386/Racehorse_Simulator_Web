# EquiFlow — Cẩm Nang Dữ Liệu & Danh Sách Tài Khoản Trình Diễn (Cheat Sheet)

> **Mật khẩu dùng chung cho tất cả tài khoản:**
> - **Backend / DB Thật (PostgreSQL):** `EquiFlow@2026`
> - **Frontend Mock (`VITE_USE_MOCK=true`):** `equiflow123` (OTP test: `123456`)

---

## 1. Danh Sách Tài Khoản Chính Trình Diễn (Standard Demo Accounts)
*Mật khẩu: `EquiFlow@2026` | Trạng thái: `ACTIVE`*

| Vai trò (Role) | Email | Họ và tên (Dễ nhớ) | Mã tài khoản / NV | Dashboard | Trọng trách chuyên môn & Ngựa phụ trách |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CLUB_MANAGER** | `manager@gmail.com` | **Trần Quang Minh** | `EMP-MGR-001` | `/dashboard` | Toàn quyền điều hành, phê duyệt tài khoản, giải đấu, tài chính 6 tháng, kiểm soát công nợ & Audit Log |
| **HEAD_TRAINER (1)** | `trainer@gmail.com` | **Nguyễn Văn Tuấn** | `EMP-TRN-001` | `/dashboard` | HLV Trưởng Barn 1; lập giáo án, xếp lịch tập tuần cho: Bạch Long Mã, Xích Thố, Kim Long, Vân Tiêu, Hắc Báo, Hồng Kỳ |
| **HEAD_TRAINER (2)** | `trainer2@gmail.com` | **Lê Hoàng Nam** | `EMP-TRN-002` | `/dashboard` | HLV Trưởng Barn 2; lập giáo án, xếp lịch tập tuần cho: Thần Phong, Lão Tướng, Tuyết Ảnh, Dạ Nguyệt, Lôi Chấn, Thanh Loan |
| **VETERINARIAN** | `vet@gmail.com` | **BS. Phạm Minh Trí** | `EMP-VET-001` | `/dashboard` | Bác sĩ Thú y Trưởng; hồ sơ bệnh án, tiêm chủng, quản lý **Khóa Y Tế (Medical Lock)**, phác đồ hồi phục lâm sàng |
| **GROOM (1)** | `groom@gmail.com` | **Lê Văn Bình** | `EMP-GRM-001` | `/dashboard` | Giám sát chuồng Barn 1 (Zone A: STALL-A01 đến A08); Checklist ca trực hàng ngày, dắt dạo, chải lông |
| **GROOM (2)** | `groom2@gmail.com` | **Hoàng Văn Phúc** | `EMP-GRM-002` | `/dashboard` | Giám sát chuồng Barn 2 (Zone B: STALL-B01 đến B08); phụ trách chăm sóc Kim Long, Vân Tiêu, Lão Tướng |
| **GROOM (3)** | `groom3@gmail.com` | **Đỗ Thị Mai** | `EMP-GRM-003` | `/dashboard` | Giám sát Khu Cách Ly (Zone C) & Khu Lưu Giữ Nợ Phí (Zone H); phụ trách chăm sóc Tuyết Ảnh và Dạ Nguyệt |
| **HORSE_OWNER (1)** | `owner@gmail.com` | **Phạm Gia Bảo** | `CLI-OWN-001` | `/dashboard` | Chủ ngựa VIP 1; sở hữu 4 chiến mã: **Bạch Long Mã**, **Xích Thố**, **Kim Long**, **Vân Tiêu**; trải nghiệm AI Concierge riêng |
| **HORSE_OWNER (2)** | `owner2@gmail.com` | **Đặng Hoàng Yến** | `CLI-OWN-002` | `/dashboard` | Chủ ngựa VIP 2; sở hữu 4 chiến mã: **Thần Phong**, **Lão Tướng**, **Tuyết Ảnh**, **Lôi Chấn**; trải nghiệm AI Concierge riêng |
| **HORSE_OWNER (3)** | `owner3@gmail.com` | **Vũ Quốc Hưng** | `CLI-OWN-003` | `/dashboard` | Chủ ngựa VIP 3; sở hữu 2 chiến mã: **Hắc Báo**, **Hồng Kỳ**; kịch bản tài chính và giải đấu cự ly trung bình |
| **HORSE_OWNER (4)** | `owner4@gmail.com` | **Trịnh Bích Ngọc** | `CLI-OWN-004` | `/dashboard` | Chủ ngựa VIP 4; sở hữu 2 chiến mã: **Dạ Nguyệt**, **Thanh Loan**; kịch bản cảnh báo nợ quá hạn và giải tỏa lưu giữ |

---

## 2. Vòng Đời Trạng Thái Tài Khoản Người Dùng (7/7 UserStatus)

| Trạng thái (`UserStatus`) | Email | Vai trò | Tên hiển thị | Tình huống kiểm thử / Vòng đời |
| :--- | :--- | :--- | :--- | :--- |
| `ACTIVE` | `manager@gmail.com` | CLUB_MANAGER | Trần Quang Minh | Hoạt động bình thường, đầy đủ đặc quyền điều hành hệ thống |
| `PENDING_APPROVAL` | `pending.groom@gmail.com` | GROOM | Hoàng Văn Nam | Đăng ký tài khoản nhân viên chuồng mới, chờ Quản lý duyệt `REQ-2026-001` |
| `INVITED` | `invited.vet@gmail.com` | VETERINARIAN | BS. Đỗ Kim Phượng | Đã gửi thư mời kèm token kích hoạt `INV-VET-TOKEN-2026-XYZ` |
| `LOCKED` | `locked.user@gmail.com` | GROOM | Trần Đình Trọng | Bị khóa kỷ luật do vi phạm quy tắc an toàn chuồng trại (HTTP 423) |
| `LOCKED` (Demo Fixture) | `equiflow-expired-fixture@gmail.com` | HORSE_OWNER | Tài khoản thử nghiệm đã khóa | Tài khoản chủ ngựa hết hạn / bị khóa thử nghiệm trong seed database |
| `INACTIVE` | `inactive.user@gmail.com` | GROOM | Nguyễn Thị Cúc | Tài khoản tạm dừng / nhân viên nghỉ chế độ thai sản |
| `REJECTED` | `rejected.user@gmail.com` | HORSE_OWNER | Đặng Quốc Huy | Hồ sơ đăng ký gia nhập CLB bị từ chối phê duyệt |
| `PENDING_EMAIL` | `pending.email@gmail.com` | HORSE_OWNER | Mai Thu Trang | Đã đăng ký thành công, đang chờ người dùng bấm link xác thực email |

---

## 3. Danh Mục 12 Chiến Mã — Phủ 100% Vòng Đời Trạng Thái (7/7 HorseStatus)

Hệ thống quản lý chuẩn hóa 12 chiến mã thuần Việt, bao phủ 100% vòng đời từ ngựa trẻ nhập trại, ngựa thi đấu đỉnh cao, ngựa chấn thương, cách ly đến giải nghệ vinh danh:

| Mã ngựa | Tên chiến mã | Trạng thái (`HorseStatus`) | Giới tính / Màu lông / Cân nặng | Ô chuồng | Chip RFID | Chủ sở hữu | HLV trưởng | Giám sát chuồng | Ghi chú vòng đời y tế & thi đấu |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`HR-000001`** | **Bạch Long Mã** | `ACTIVE` | Colt · Bay Dark · 495 kg | `STALL-A01` | `985141002341001` | Phạm Gia Bảo | Nguyễn Văn Tuấn | Lê Văn Bình | Vô địch Cúp Mùa Hè & Mùa Thu; phong độ xuất sắc, lịch sử hoàn toàn bình phục chấn thương (`LOCK-HR-000001-HIST`) |
| **`HR-000002`** | **Xích Thố** | `INJURED` | Stallion · Chestnut · 510 kg | `STALL-A02` | `985141002342002` | Phạm Gia Bảo | Nguyễn Văn Tuấn | Lê Văn Bình | Đang có **Lệnh Khóa Y Tế (Medical Lock `lock/xich`)** do viêm gân cấp chân trước phải; cấm tập nặng và cấm đua |
| **`HR-000003`** | **Hắc Báo** | `IN_TRAINING` | Filly · Black · 490 kg | `STALL-A03` | `985141002343003` | Vũ Quốc Hưng | Nguyễn Văn Tuấn | Lê Văn Bình | Đang theo giáo án huấn luyện tăng tốc cự ly 1600m (`CANTER`), tích lũy thể lực chuẩn bị lên bảng ACTIVE |
| **`HR-000004`** | **Thần Phong** | `ACTIVE` | Gelding · Bay · 480 kg | `STALL-A04` | `985141002344004` | Đặng Hoàng Yến | Lê Hoàng Nam | Lê Văn Bình | Vô địch Cúp Quốc Gia 2026 & Cúp Tốc Độ CLB; Á quân Mùa Thu; chỉ số bứt tốc nước rút hàng đầu CLB |
| **`HR-000005`** | **Lão Tướng** | `RETIRED` | Gelding · Grey · 520 kg | `STALL-B01` | `985141002345005` | Đặng Hoàng Yến | Lê Hoàng Nam | Hoàng Văn Phúc | Ngựa huyền thoại 18 tuổi; từng vô địch Cúp Cự Ly Kinh Điển, Derby Danh Dự & Cúp Mở Rộng; nay đã giải nghệ vinh danh |
| **`HR-000006`** | **Tuyết Ảnh** | `ISOLATED` | Mare · Grey · 475 kg | `STALL-C01` | `985141002346006` | Đặng Hoàng Yến | Lê Hoàng Nam | Đỗ Thị Mai | Đang cách ly kiểm dịch y tế tại khu chuồng riêng C01 sau đợt di chuyển liên tỉnh |
| **`HR-000007`** | **Kim Long** | `RESTING` | Stallion · Palomino · 505 kg | `STALL-B02` | `985141002347007` | Phạm Gia Bảo | Nguyễn Văn Tuấn | Hoàng Văn Phúc | Nghỉ ngơi hồi phục định kỳ sau chuỗi bài tập cường độ cao; chỉ áp dụng bài tập đi dạo nhẹ (`WALK` 500m) |
| **`HR-000008`** | **Vân Tiêu** | `IN_TRAINING` | Colt · Roan · 470 kg | `STALL-B03` | `985141002348008` | Phạm Gia Bảo | Nguyễn Văn Tuấn | Hoàng Văn Phúc | Chiến mã trẻ 3 tuổi đầy triển vọng; đang theo giáo án rèn luyện căn bản và thích nghi tốc độ (`TROT`) |
| **`HR-000009`** | **Dạ Nguyệt** | `UNDER_OBSERVATION` | Mare · Bay · 485 kg | `STALL-H01` | `985141002349009` | Trịnh Bích Ngọc | Lê Hoàng Nam | Đỗ Thị Mai | Lưu giữ tại Khu Barn H do nợ phí; theo dõi sức khỏe đặc biệt, bài tập bơi hồi phục (`SWIM` 1200s có Vet giám sát) |
| **`HR-000010`** | **Lôi Chấn** | `ACTIVE` | Stallion · Black · 515 kg | `STALL-A06` | `985141002350010` | Đặng Hoàng Yến | Lê Hoàng Nam | Lê Văn Bình | Ngựa lực lưỡng cự ly trung bình; đạt Hạng 3 Cúp Mùa Hè & Cúp Mùa Thu; bài tập nước rút `BREEZE` tốc độ cao |
| **`HR-000011`** | **Hồng Kỳ** | `ACTIVE` | Colt · Chestnut · 490 kg | `STALL-A07` | `985141002351011` | Vũ Quốc Hưng | Nguyễn Văn Tuấn | Lê Văn Bình | Đạt Hạng 3 Cúp Quốc Gia & Hạng 2 Derby Danh Dự; phong độ sung mãn sẵn sàng cho giải Cúp Mùa Đông |
| **`HR-000012`** | **Thanh Loan** | `ACTIVE` | Filly · Bay Dark · 480 kg | `STALL-A08` | `985141002352012` | Trịnh Bích Ngọc | Lê Hoàng Nam | Lê Văn Bình | Vô địch Cúp Đường Cỏ (Veteran Turf Cup); ngựa cái sở hữu khả năng bứt tốc đường cỏ cự ly ngắn xuất sắc |

---

## 4. Vòng Đời Giải Đấu & Thẩm Định Đăng Ký (6-Tier Eligibility Checklist)

Hệ thống áp dụng bộ quy chuẩn thẩm định 6 tầng (`6-tier checklist`) kiểm tra tự động trước khi xác nhận ngựa tham gia giải:
1. **Độ tuổi:** Đạt tối thiểu 2 tuổi (`ageYears >= minAgeYears`).
2. **Trạng thái hoạt động:** Ngựa phải có `HorseStatus = ACTIVE`.
3. **Khóa y tế (Medical Lock):** Không bị áp lệnh khóa y tế (`isMedicalLocked = false`).
4. **Tiêm chủng định kỳ:** Có lịch tiêm ngừa hợp lệ trong vòng 180 ngày gần nhất.
5. **Công nợ chủ sở hữu:** Chủ ngựa không có hóa đơn quá hạn chưa thanh toán $\ge 60$ ngày.
6. **Hạn ngạch sân đua:** Tổng số lượng ngựa đăng ký không vượt quá `maxFieldSize` (12 ngựa/giải).

### Bảng Danh Mục Giải Đấu Trình Diễn:

| Tên giải đấu | Trạng thái giải | Thời gian | Cự ly & Mặt sân | Kết quả / Ngựa xác nhận tham gia |
| :--- | :--- | :--- | :--- | :--- |
| **Giải Đua Mùa Hè Rực Lửa** (`summer-sprint`) | `COMPLETED` | -110 ngày | 1400m · Turf | Bạch Long Mã (`Hạng 1` 🏆 - 40Tr)<br>Thần Phong (`Hạng 2` 🥈 - 20Tr)<br>Lôi Chấn (`Hạng 3` 🥉 - 10Tr) |
| **Cúp Đua Ngựa Quốc Gia 2026** (`national-cup`) | `COMPLETED` | -85 ngày | 1600m · Turf | Thần Phong (`Hạng 1` 🏆 - 50Tr)<br>Bạch Long Mã (`Hạng 2` 🥈 - 25Tr)<br>Hồng Kỳ (`Hạng 3` 🥉 - 12Tr) |
| **Giải Vô Địch Mùa Thu EquiFlow** (`autumn`) | `COMPLETED` | -45 ngày | 1600m · Turf | Bạch Long Mã (`Hạng 1` 🏆 - 50Tr)<br>Thần Phong (`Hạng 2` 🥈 - 25Tr)<br>Lôi Chấn (`Hạng 3` 🥉 - 10Tr) |
| **Cúp Đua Nước Rút Mở Rộng** (`open`) | `COMPLETED` | -20 ngày | 1200m · Turf | Lão Tướng (`Hạng 1` 🏆 - 20Tr)<br>Bạch Long Mã (`Hạng 2` 🥈 - 10Tr) |
| **Chuỗi Cúp Cổ Điển Lão Tướng** (4 giải cự ly) | `COMPLETED` | -54 đến -26 ngày | 1200m - 1800m | Lão Tướng vô địch Cúp Cự Ly Kinh Điển & Derby Danh Dự; Thanh Loan vô địch Cúp Đường Cỏ |
| **Cúp Mùa Đông Hoàng Gia** (`winter`) | `OPEN_REGISTRATION` | +20 ngày | 1600m · Turf | Đang mở đăng ký; Xác nhận tham gia: Bạch Long Mã, Thần Phong, Lôi Chấn |
| **Cúp Tân Niên CLB** (`spring`) | `UPCOMING` | +60 ngày | 1400m · Turf | Giải đấu sắp tới chào đón mùa xuân 2027; chuẩn bị mở cổng đăng ký |

---

## 5. Quy Hoạch Chuồng Trại, Tài Chính 6 Tháng & AI Concierge

### 5.1. Quy Hoạch 4 Khu Ô Chuồng Trại (Stall Zones)
- **Zone A (`Barn 1 · Đua`):** 2 hàng $\times$ 4 cột = 8 ô chuồng (`STALL-A01` đến `STALL-A08`).
  - Đang chứa 7 chiến mã thi đấu tích cực: Bạch Long Mã (A01), Xích Thố (A02), Hắc Báo (A03), Thần Phong (A04), Lôi Chấn (A06), Hồng Kỳ (A07), Thanh Loan (A08).
  - Ô A05 trạng thái `AVAILABLE`.
- **Zone B (`Barn 2 · Huấn luyện & nghỉ`):** 2 hàng $\times$ 4 cột = 8 ô chuồng (`STALL-B01` đến `STALL-B08`).
  - Đang chứa: Lão Tướng (B01 - Nghỉ hưu), Kim Long (B02 - Nghỉ ngơi), Vân Tiêu (B03 - Huấn luyện).
  - Ô `STALL-B04`: Trạng thái `MAINTENANCE` (Tạm ngừng để bảo trì chốt cửa tự động).
  - Ô B05 đến B08 trạng thái `AVAILABLE`.
- **Zone C (`Khu Cách Ly`):** 1 hàng $\times$ 4 cột = 4 ô chuồng (`STALL-C01` đến `STALL-C04`).
  - Ô `STALL-C01`: Đang cách ly y tế chiến mã Tuyết Ảnh (`ISOLATED`). Ô C02 đến C04 trạng thái `AVAILABLE`.
- **Zone H (`Khu Lưu Giữ Nợ Phí`):** 1 hàng $\times$ 4 cột = 4 ô chuồng (`STALL-H01` đến `STALL-H04`).
  - Ô `STALL-H01`: Lưu giữ chiến mã Dạ Nguyệt do chủ ngựa nợ phí dịch vụ quá hạn.

### 5.2. Bộ Dữ Liệu Tài Chính 6 Tháng & Phân Rã 2 Tầng (2-Tier Statements)
- **Tập dữ liệu vòng đời 6 tháng (Tháng 07/2026 – Tháng 12/2026):**
  - Đầy đủ 5 trạng thái hóa đơn (`InvoiceStatus`): `PAID`, `SENT`, `DRAFT`, `OVERDUE`, `CANCELLED`.
  - Kịch bản nợ quá hạn: Chủ sở hữu Trịnh Bích Ngọc (`owner4@gmail.com`) phát sinh hóa đơn quá hạn, kích hoạt luồng cảnh báo công nợ và chuyển ngựa Dạ Nguyệt vào Barn H.
- **Phân rã sao kê tài chính 2 tầng (2-Tier Breakdown):**
  - **Tầng 1 — Chi phí cơ sở chuồng trại cố định:** Tính tự động theo công thức nội trú hàng tháng (`calculateBoardingFee`), bảo đảm tính minh bạch tuyệt đối.
  - **Tầng 2 — Chi phí dịch vụ phát sinh thực tế:** Thuốc men y tế, tiêm phòng thú y, vật tư rơm cỏ bổ sung, phí tham gia giải đấu và tiền thưởng trích thưởng.

### 5.3. Trợ Lý AI Concierge Phân Quyền Theo Chủ Sở Hữu (Owner-Scoped AI)
- Dành riêng cho vai trò `HORSE_OWNER`:
  - Trợ lý ảo AI áp dụng bộ công cụ tra cứu (`ai.tools.ts`) được cô lập nghiêm ngặt theo `ownerId`.
  - Chủ ngựa chỉ có thể tra cứu thông tin chi phí, bệnh án, lịch thi đấu và đề xuất giáo án của chính những con ngựa mình sở hữu.
  - Hỗ trợ giải đáp các thắc mắc về sao kê nợ phí và hướng dẫn quy trình giải tỏa lưu giữ.

---

## 6. Tổng Hợp Độ Bao Phủ Toàn Bộ Các Trạng Thái Vòng Đời (100% Prisma Enums)

- **Trạng thái Ô Chuồng (4/4 `StallStatus`):**
  - `AVAILABLE`: STALL-A05, STALL-B05..B08, STALL-C02..C04, STALL-H02..H04.
  - `OCCUPIED`: STALL-A01, A02, A03, A04, A06, A07, A08, B01, B02, B03, C01, H01.
  - `MAINTENANCE`: STALL-B04 (Bảo trì chốt cửa chuồng).
  - `INACTIVE`: Các ô dự phòng mở rộng quy hoạch giai đoạn sau.
- **Trạng thái Khóa Huấn Luyện (Medical Lock):**
  - `isLocked: true`: `lock/xich` (Xích Thố - viêm gân cấp chân trước, trạng thái `INJURED`).
  - `isLocked: false`: `lock/bach` (Bạch Long Mã - hoàn toàn bình phục sau phác đồ vật lý trị liệu).
- **Trạng thái Hồ Sơ Bệnh Án (3/3 `MedicalRecordStatus`):**
  - `OPEN`: Bệnh án theo dõi viêm gân Xích Thố.
  - `CLOSED`: Bệnh án kiểm tra thể lực định kỳ sau giải Mùa Thu của Bạch Long Mã.
  - `DRAFT`: Bản nháp khám sàng lọc trước giải đấu của Thần Phong.
- **Trạng thái Kế Hoạch Dinh Dưỡng (5/5 `NutritionPlanStatus`):**
  - `APPROVED`: Khẩu phần thi đấu đỉnh cao của Bạch Long Mã.
  - `PENDING_APPROVAL`: Khẩu phần tăng cường cơ bắp của Hắc Báo.
  - `DRAFT`: Dự thảo khẩu phần mùa đông cho Thần Phong.
  - `REJECTED`: Đề xuất khẩu phần dư thừa calo của Kim Long.
  - `ARCHIVED`: Khẩu phần cũ lưu trữ của Lão Tướng.
- **Trạng thái Giáo Án Huấn Luyện (4/4 `PlanStatus`):**
  - `ACTIVE`: Giáo án tăng tốc đỉnh cao Bạch Long Mã & Giáo án xây dựng nền tảng Thần Phong.
  - `COMPLETED`: Giáo án thích nghi cơ bản của Lão Tướng.
  - `DRAFT`: Giáo án nháp chuẩn bị kích hoạt mùa giải mới.
  - `CANCELLED`: Giáo án bị hủy do thay đổi lịch trình thi đấu.
- **Trạng thái Buổi Tập (5/5 `WorkoutStatus`):**
  - `COMPLETED`: Chạy 1600m đạt thành tích cao của Bạch Long Mã.
  - `SCHEDULED`: Bài tập chạy nước rút `CANTER` / `BREEZE` sáng mai.
  - `BLOCKED`: Bài tập nặng của Xích Thố bị chặn tự động bởi Lệnh Khóa Y Tế.
  - `MISSED`: Bài tập bị lỡ do điều kiện thời tiết bão lớn.
  - `CANCELLED`: Bài tập chạy thử bị hủy do lịch trình thay đổi.
- **Trạng thái Chăm Sóc Phòng Ngừa (3/3 `PreventiveStatus` & 4/4 `PreventiveType`):**
  - `COMPLETED`: Tiêm phòng cúm ngựa định kỳ (`VACCINATION`).
  - `PENDING`: Tẩy giun sán định kỳ quý 4 (`DEWORMING`).
  - `OVERDUE`: Khám răng định kỳ quá hạn (`DENTAL`).
  - `PENDING`: Mài móng và đóng móng sắt bảo vệ (`HOOF_CARE`).
- **Nhiệm Vụ Chăm Sóc Hàng Ngày (`DailyCareTask`):**
  - `FEEDING`: Cho ăn bữa sáng yến mạch dinh dưỡng (Đã hoàn thành).
  - `CLEANING`: Dọn vệ sinh và thay rơm lót chuồng Barn 1 (Đã hoàn thành).
  - `ICE_BOOT_REST`: Chườm đá lạnh phục hồi gân chân Xích Thố (Đã hoàn thành).
  - `GROOMING`: Chải lông và massage cơ bắp buổi chiều (Đang chờ thực hiện).
  - `WALKING`: Dắt đi dạo nhẹ nhàng 15 phút quanh sân chuồng (Đang chờ thực hiện).
