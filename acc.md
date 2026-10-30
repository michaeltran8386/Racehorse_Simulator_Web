# EquiFlow — Cẩm Nang Dữ Liệu & Danh Sách Tài Khoản Trình Diễn (Cheat Sheet)

> **Mật khẩu dùng chung:**
> - **Backend / DB Thật (PostgreSQL):** `EquiFlow@2026`
> - **Frontend Mock (`VITE_USE_MOCK=true`):** `equiflow123` (OTP test: `123456`)

---

## 1. Danh Sách Tài Khoản Chính Trình Diễn (Standard Demo Accounts)
*Mật khẩu: `EquiFlow@2026` | Trạng thái: `ACTIVE`*

| Vai trò (Role) | Email | Họ và tên (Dễ nhớ) | Mã nhân viên | Dashboard | Trọng trách chuyên môn |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CLUB_MANAGER** | `manager@gmail.com` | **Trần Quang Minh (Quản Lý)** | `EMP-MGR-001` | `/dashboard` | Toàn quyền điều hành, phê duyệt tài khoản, giải đấu, tài chính |
| **HEAD_TRAINER** | `trainer@gmail.com` | **Nguyễn Văn Hùng (HLV Trưởng)** | `EMP-TRN-001` | `/dashboard` | Soạn giáo án huấn luyện, xếp lịch tập, chạy máy giả lập |
| **VETERINARIAN** | `vet@gmail.com` | **BS. Phạm Minh Trí (Thú Y Trưởng)** | `EMP-VET-001` | `/dashboard` | Hồ sơ bệnh án, tiêm chủng, đặt/gỡ Khóa Y Tế (Medical Lock) |
| **GROOM** | `groom@gmail.com` | **Lê Văn Thắng (Giám Sát Chuồng)** | `EMP-GRM-001` | `/dashboard` | Nhật ký chăm sóc ngày, dắt dạo, chải chuốt, quản lý chuồng A |
| **HORSE_OWNER** | `owner@gmail.com` | **Vũ Hoàng Nam (Chủ Ngựa VIP)** | `CLI-OWN-001` | `/dashboard` | Chủ ngựa của Bạch Long Mã, Xích Thố, Hắc Báo, Hỏa Phụng |
| **GROOM 2** | `groom2@gmail.com` | **Lê Văn Phúc (Nhân Viên Chuồng)** | `EMP-GRM-002` | `/dashboard` | Phụ trách chăm sóc ô chuồng khu B và khu C |
| **HORSE_OWNER 2** | `owner2@gmail.com` | **Phan Đức Long (Chủ Ngựa VIP)** | `CLI-OWN-002` | `/dashboard` | Chủ ngựa của Thần Phong, Kim Quy, Phi Long, Băng Thiên Mã |

---

## 2. Vòng Đời Trạng Thái Tài Khoản Người Dùng (7/7 UserStatus)

| Trạng thái (`UserStatus`) | Email | Vai trò | Tên hiển thị | Tình huống kiểm thử / Vòng đời |
| :--- | :--- | :--- | :--- | :--- |
| `ACTIVE` | `manager@gmail.com` | CLUB_MANAGER | Trần Quang Minh | Hoạt động bình thường, đầy đủ đặc quyền |
| `PENDING_APPROVAL` | `pending.groom@gmail.com` | GROOM | Hoàng Văn Nam | Đăng ký mới, có yêu cầu phê duyệt `REQ-2026-001` |
| `INVITED` | `invited.vet@gmail.com` | VETERINARIAN | BS. Đỗ Kim Phượng | Đã gửi thư mời kèm token `INV-VET-TOKEN-2026-XYZ` |
| `LOCKED` | `locked.user@gmail.com` | GROOM | Trần Đình Trọng | Bị khóa kỷ luật do vi phạm an toàn chuồng (HTTP 423) |
| `INACTIVE` | `inactive.user@gmail.com` | GROOM | Nguyễn Thị Cúc | Tài khoản tạm dừng / nhân viên nghỉ thai sản |
| `REJECTED` | `rejected.user@gmail.com` | HORSE_OWNER | Đặng Quốc Huy | Hồ sơ đăng ký bị từ chối phê duyệt |
| `PENDING_EMAIL` | `pending.email@gmail.com` | HORSE_OWNER | Mai Thu Trang | Đã đăng ký, đang chờ xác thực email |

---

## 3. Danh Mục 9 Chiến Mã — Phủ 100% Vòng Đời Trạng Thái (7/7 HorseStatus)

Toàn bộ ngựa đều được đặt tên thuần Việt hào sảng, uy phong, dễ nhớ và phủ đủ mọi trạng thái vòng đời dự án:

| Mã ngựa | Tên chiến mã | Trạng thái (`HorseStatus`) | Ô chuồng | Chip RFID | Chủ sở hữu | Giám sát chuồng | Ghi chú vòng đời y tế / huấn luyện |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`HR-000001`** | **Bạch Long Mã** | `ACTIVE` | `STALL-A01` | `985141002341001` | Vũ Hoàng Nam | Lê Văn Thắng | Ngựa chủ lực thi đấu, phong độ xuất sắc, lịch sử từng bình phục chấn thương |
| **`HR-000002`** | **Xích Thố** | `INJURED` | `STALL-A02` | `985141002342002` | Vũ Hoàng Nam | Lê Văn Thắng | Đang có **Lệnh Khóa Y Tế (Medical Lock)** do căng gân, cấm tập nặng |
| **`HR-000003`** | **Hắc Báo** | `IN_TRAINING` | `STALL-A03` | `985141002343003` | Vũ Hoàng Nam | Lê Văn Thắng | Đang theo giáo án huấn luyện tăng tốc cự ly 1600m |
| **`HR-000004`** | **Thần Phong** | `UNDER_OBSERVATION` | `STALL-A04` | `985141002344004` | Phan Đức Long | Lê Văn Phúc | Đang theo dõi sức khỏe đặc biệt sau đợt sốt nhẹ, kích hoạt giáo án cần ý kiến Vet |
| **`HR-000005`** | **Kim Quy** | `RESTING` | `STALL-B01` | `985141002345005` | Phan Đức Long | Lê Văn Phúc | Nghỉ ngơi hồi phục định kỳ sau giải đấu |
| **`HR-000006`** | **Phi Long** | `ISOLATED` | `STALL-C01` | `985141002346006` | Phan Đức Long | Lê Văn Phúc | Cách ly kiểm dịch tại khu chuồng riêng C-01 |
| **`HR-000007`** | **Chiến Mã Hoàng Gia** | `RETIRED` | *(Không gán)* | `985141002347007` | Vũ Hoàng Nam | *(Không gán)* | Ngựa huyền thoại vinh danh sau chức vô địch Derby, đã nghỉ hưu |
| **`HR-000008`** | **Hỏa Phụng** | `ACTIVE` | `STALL-B02` | `985141002348008` | Vũ Hoàng Nam | Lê Văn Thắng | Ngựa thi đấu nước rút tốc độ cao cự ly ngắn |
| **`HR-000009`** | **Băng Thiên Mã** | `ACTIVE` | `STALL-B03` | `985141002349009` | Phan Đức Long | Lê Văn Phúc | Ngựa thi đấu vượt rào và thể lực đường dài |

---

## 4. Vòng Đời Giải Đấu & Trạng Thái Đăng Ký (5/5 TournamentStatus, 4/4 RegistrationStatus)

| Tên giải đấu | Trạng thái giải | Ngày thi đấu | Địa điểm / Mặt sân | Ngựa đăng ký & Trạng thái đăng ký |
| :--- | :--- | :--- | :--- | :--- |
| **Grand Autumn Cup 2026 (Cúp Mùa Thu)** | `COMPLETED` | 15/10/2026 | Sân cỏ tự nhiên (Turf 2000m) | Bạch Long Mã (`CONFIRMED` - Hạng 1 🏆)<br>Hỏa Phụng (`CONFIRMED` - Hạng 2 🥈) |
| **Saigon Spring Sprint 2026 (Giải Tốc Độ Mùa Xuân)** | `OPEN_REGISTRATION` | 15/11/2026 | Sân cát tốc độ (Dirt 1200m) | Bạch Long Mã (`CONFIRMED`)<br>Băng Thiên Mã (`REGISTERED`) |
| **National Endurance Derby 2026 (Đại Hội Thể Lực Quốc Gia)** | `UPCOMING` | 20/12/2026 | Sân cỏ tổng hợp (Turf 2400m) | Bạch Long Mã (`REGISTERED`) |
| **Central Highlands Gold Cup 2026 (Cúp Vàng Cao Nguyên)** | `CLOSED_REGISTRATION` | 10/11/2026 | Đường đua đồi dốc (1800m) | Xích Thố (`SCRATCHED_MEDICAL` - Rút lui do chấn thương) |
| **Phu Tho Summer Classic 2026 (Giải Hè Phú Thọ)** | `CANCELLED` | 05/08/2026 | Trường đua Phú Thọ | Hắc Báo (`DISQUALIFIED` - Hủy do điều kiện thời tiết bão) |

---

## 5. Tổng Hợp Độ Bao Phủ Toàn Bộ Các Trạng Thái Vòng Đời Khác (100% Prisma Enums)

- **Trạng thái Ô Chuồng (4/4 `StallStatus`):**
  - `AVAILABLE`: STALL-A05, STALL-A06, STALL-B04...
  - `OCCUPIED`: STALL-A01 (Bạch Long Mã), STALL-A02 (Xích Thố), STALL-A03, STALL-A04, STALL-B01, STALL-B02, STALL-B03, STALL-C01.
  - `MAINTENANCE`: STALL-A07 (Đang sửa chữa hệ thống máng nước tự động).
  - `INACTIVE`: STALL-A08 (Tạm ngưng phục vụ).
- **Trạng thái Khóa Huấn Luyện (Medical Lock):**
  - `isLocked: true`: `LOCK-HR-000002-001` (Xích Thố - viêm gân, áp dụng trạng thái `INJURED`).
  - `isLocked: false`: `LOCK-HR-000001-HIST` (Bạch Long Mã - lịch sử đã hoàn toàn bình phục sau vật lý trị liệu).
- **Trạng thái Hồ Sơ Bệnh Án (3/3 `MedicalRecordStatus`):**
  - `OPEN`: MR-2026-001 (Bệnh án theo dõi viêm gân Xích Thố).
  - `CLOSED`: MR-2026-002 (Bệnh án kiểm tra thể lực định kỳ Bạch Long Mã).
  - `DRAFT`: MR-2026-003 (Bản nháp khám lâm sàng Thần Phong).
- **Trạng thái Nhật Ký Chấn Thương (3/3 `InjuryStatus`):**
  - `ACTIVE`: Chấn thương gân gấp ngón của Xích Thố.
  - `HEALING`: Vết xước phần mềm đang lên da non của Hắc Báo.
  - `RESOLVED`: Khỏi hoàn toàn vết đụng dập của Bạch Long Mã.
- **Trạng thái Kế Hoạch Dinh Dưỡng (5/5 `NutritionPlanStatus`):**
  - `APPROVED`: Khẩu phần dinh dưỡng thi đấu của Bạch Long Mã.
  - `PENDING_APPROVAL`: Khẩu phần tăng cường của Hắc Báo.
  - `DRAFT`: Dự thảo khẩu phần mùa đông của Thần Phong.
  - `REJECTED`: Đề xuất khẩu phần dư thừa calo của Kim Quy.
  - `ARCHIVED`: Khẩu phần cũ lưu trữ của Phi Long.
- **Trạng thái Giáo Án Huấn Luyện (4/4 `PlanStatus`):**
  - `ACTIVE`: GA-000001 (Giáo án tăng tốc đỉnh cao Bạch Long Mã).
  - `COMPLETED`: GA-000002 (Giáo án thích nghi cơ bản).
  - `DRAFT`: GA-000004 (Giáo án nháp chuẩn bị kích hoạt).
  - `CANCELLED`: GA-000003 (Giáo án bị hủy do thay đổi lịch trình).
- **Trạng thái Buổi Tập (5/5 `WorkoutStatus`):**
  - `COMPLETED`: Chạy 1200m đạt 8.9 điểm của Bạch Long Mã.
  - `SCHEDULED`: Bài tập chạy nước rút sáng mai.
  - `BLOCKED`: Bài tập nặng của Xích Thố bị chặn tự động bởi Lệnh Khóa Y Tế.
  - `MISSED`: Bài tập bị lỡ do trời mưa to.
  - `CANCELLED`: Bài tập chạy thử bị hủy.
- **Trạng thái Chăm Sóc Phòng Ngừa (3/3 `PreventiveStatus` & 4/4 `PreventiveType`):**
  - `COMPLETED`: Tiêm phòng cúm ngựa định kỳ (`VACCINATION`).
  - `PENDING`: Tẩy giun sán định kỳ quý 4 (`DEWORMING`).
  - `OVERDUE`: Khám răng định kỳ quá hạn (`DENTAL`).
  - `PENDING`: Mài móng và đóng móng sắt (`HOOF_CARE`).
- **Trạng thái Báo Cáo Sự Cố (4/4 `IncidentStatus`):**
  - `REPORTED`: Ngựa có dấu hiệu đau chân sau bài tập cát.
  - `UNDER_REVIEW`: Vết trầy xước hàng rào đang được Bác sĩ kiểm tra.
  - `RESOLVED`: Va quẹt cửa chuồng nhẹ đã xử lý sát trùng hoàn tất.
  - `DISMISSED`: Báo cáo nhầm lẫn âm thanh chuông báo động.
- **Trạng thái Gợi Ý AI (4/4 `InsightStatus`):**
  - `GENERATED`: Cảnh báo rủi ro quá tải cơ bắp dựa trên dữ liệu cảm biến nhịp tim.
  - `ACKNOWLEDGED`: Huấn luyện viên trưởng đã ghi nhận cảnh báo.
  - `APPLIED`: Đã điều chỉnh giảm tải buổi tập 20% theo đề xuất của AI.
  - `DISMISSED`: Huấn luyện viên bác bỏ do ngựa đã được cho nghỉ bù.
- **Trạng thái Hóa Đơn Tài Chính (5/5 `InvoiceStatus`):**
  - `PAID`: INV-2026-001 (Phí huấn luyện & chăm sóc tháng 9 - Đã thanh toán).
  - `SENT`: INV-2026-002 (Phí chuồng trại & dinh dưỡng tháng 10 - Đã gửi).
  - `DRAFT`: INV-2026-003 (Bản nháp chi phí y tế phát sinh).
  - `OVERDUE`: INV-2026-004 (Phí dịch vụ quá hạn thanh toán).
  - `CANCELLED`: INV-2026-005 (Hóa đơn bị hủy do xuất nhầm mã khách hàng).
- **Trạng thái Yêu Cầu Nhập Kho (5/5 `RestockStatus`):**
  - `PENDING`: Yêu cầu nhập 20 bao cỏ khô Timothy thượng hạng.
  - `APPROVED`: Yêu cầu nhập cám yến mạch dinh dưỡng đã được duyệt.
  - `DELIVERING`: Thuốc xịt sát trùng chuồng trại đang trên đường vận chuyển.
  - `DELIVERED`: Dầu móng ngựa và băng cuốn đã nhập kho thành công.
  - `REJECTED`: Yêu cầu nhập dụng cụ không đạt tiêu chuẩn kỹ thuật.
- **Nhiệm Vụ Chăm Sóc Hàng Ngày (`DailyCareTask`):**
  - `FEEDING`: Cho ăn bữa sáng yến mạch (Đã hoàn thành).
  - `CLEANING`: Dọn vệ sinh và thay rơm lót chuồng A-01 (Đã hoàn thành).
  - `ICE_BOOT_REST`: Chườm đá lạnh phục hồi gân chân Xích Thố (Đã hoàn thành).
  - `GROOMING`: Chải lông và massage chiều (Đang chờ thực hiện).
  - `WALKING`: Dắt đi dạo nhẹ nhàng 15 phút quanh sân chuồng (Đang chờ thực hiện).
