// Danh bạ nhân sự & ca trực hôm nay (EquiFlow Simulator v3), dữ liệu thật từ BE (GET /simulator/staff).
// Danh sách mini-chips gọn; chỉ mở bảng chi tiết khi người dùng chủ động chọn.
import { useCallback, useEffect, useState } from "react";
import type { HorseProfile } from "../sim/engine";
import type { Role, StaffMember } from "../sim/stallMap";
import { fetchStaff } from "../api/farmDataApi";
import s from "./ui.module.css";
import g from "./GroomTab.module.css";
import { Popup } from "./Popup";

interface Props {
  horses?: HorseProfile[];
  onOpenHorseCard?: (horseId: string) => void;
}

type FilterKey = "ALL" | Role;

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: "ALL", label: "Tất cả" },
  { key: "GROOM", label: "Groom" },
  { key: "HEAD_TRAINER", label: "HLV" },
  { key: "VETERINARIAN", label: "Thú y" },
  { key: "CLUB_MANAGER", label: "Quản lý" },
];

const ROLE_LABEL: Record<Role, string> = {
  CLUB_MANAGER: "Trưởng ban điều hành câu lạc bộ",
  HEAD_TRAINER: "Huấn luyện viên trưởng",
  VETERINARIAN: "Bác sĩ thú y chuyên trách",
  GROOM: "Người chăm sóc ngựa (Groom)",
};

const ROLE_ICON: Record<Role, string> = {
  CLUB_MANAGER: "🏛️",
  HEAD_TRAINER: "🏇",
  VETERINARIAN: "🩺",
  GROOM: "🧹",
};

export function GroomTab({ horses, onOpenHorseCard }: Props) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStaff(await fetchStaff());
    } catch (err) {
      setLoadError((err as Error).message || "Không kết nối được máy chủ.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className={g.container}>
        <p className={s.hint}>Không tải được danh sách nhân sự: {loadError}</p>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  }
  if (!staff) return <p className={s.hint}>Đang tải danh sách nhân sự…</p>;

  const filteredUsers = filter === "ALL" ? staff : staff.filter((u) => u.role === filter);
  const onShiftCount = staff.filter((u) => u.shiftsToday.length > 0).length;
  const selectedUser = selectedUserId ? staff.find((u) => u.id === selectedUserId) ?? null : null;

  return (
    <div className={g.container}>
      {/* 1. Bộ lọc vai trò */}
      <div className={g.filterBar}>
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          const count = tab.key === "ALL" ? staff.length : staff.filter((u) => u.role === tab.key).length;
          return (
            <button
              key={tab.key}
              type="button"
              className={`${s.btn} ${isActive ? s.primary : ""}`}
              style={{ fontFamily: "var(--font-display)", fontSize: "14px", padding: "3px 10px" }}
              aria-pressed={isActive}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 2. Dòng tóm tắt */}
      <div className={g.summaryBanner}>
        <span>
          Nhân sự đang làm việc: <strong>{staff.length} người</strong>
        </span>
        <span>
          Có ca hôm nay: <strong>{onShiftCount}</strong>
        </span>
      </div>

      {/* 3. Lưới mini-chips */}
      {filteredUsers.length === 0 ? (
        <p className={s.hint}>Không có nhân sự nào thuộc nhóm này.</p>
      ) : (
        <div className={g.staffChipsGrid}>
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              className={`${g.staffChip} ${user.id === selectedUserId ? g.staffChipSelected : ""}`}
              onClick={() => setSelectedUserId(user.id)}
              title={`${user.fullName} - Bấm để xem chi tiết`}
            >
              <span className={g.chipIcon}>{ROLE_ICON[user.role]}</span>
              <div className={g.chipInfo}>
                <span className={g.chipName}>{user.fullName.split(" (")[0]}</span>
                <div className={g.chipMeta}>
                  <span className={g.chipCode}>{user.shiftsToday.length > 0 ? "Có ca hôm nay" : "Không có ca"}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 4. Chi tiết nhân viên mở thành bảng nổi đè lên danh sách */}
      {selectedUser && (
        <Popup title="Thông tin nhân viên" onClose={() => setSelectedUserId(null)}>
        <section className={g.detailPanel}>
          <div className={g.detailHead}>
            <div className={g.detailTitleGroup}>
              <div className={g.detailAvatar}>
                <span>{ROLE_ICON[selectedUser.role]}</span>
              </div>
              <div>
                <div className={g.detailNameRow}>
                  <h4 className={g.detailFullName}>{selectedUser.fullName}</h4>
                </div>
                <div className={g.detailRoleSub}>{ROLE_LABEL[selectedUser.role]}</div>
              </div>
            </div>
          </div>

          <div className={g.detailGrid}>
            <div className={g.detailItem}>
              <span className={g.detailItemLabel}>Ca trực hôm nay</span>
              <span className={g.detailItemValue}>
                {selectedUser.shiftsToday.length === 0
                  ? "Không có ca"
                  : selectedUser.shiftsToday.map((sh) => `${sh.name} (${sh.startTime} - ${sh.endTime}) · ${sh.zoneName}`).join("; ")}
              </span>
            </div>
          </div>

          {selectedUser.horses.length > 0 && (
            <div className={g.horseSection}>
              <span className={g.detailItemLabel}>Ngựa được giao phụ trách (bấm để xem thẻ):</span>
              <div className={g.horseList}>
                {selectedUser.horses.map((h) => {
                  const inSim = horses?.some((x) => x.id === h.id) ?? false;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className={g.horseChip}
                      style={{ cursor: inSim && onOpenHorseCard ? "pointer" : "default" }}
                      disabled={!inSim || !onOpenHorseCard}
                      onClick={() => onOpenHorseCard?.(h.id)}
                      title={`Xem thẻ ngựa ${h.name}`}
                    >
                      ♞ {h.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        </Popup>
      )}
      <div className={g.hintPrompt}>Nhấp vào một nhân viên để xem ca trực hôm nay và ngựa phụ trách.</div>
    </div>
  );
}
