// Bảng Kho vật tư: đồng bộ dữ liệu thật từ Backend PostgreSQL (danh mục, số lượng, đơn vị tính, sức chứa).
// Theo CR-024: Đặt hàng thuộc quyền hạn độc quyền của Club Manager trên Main Web; Simulator chỉ hiển thị trạng thái và hoạt cảnh xe giao.
import { useEffect, type CSSProperties } from 'react';
import {
  formatStockQuantity,
  mapSupplyToIconKey,
  stockLevel,
  type Inventory,
  type StockLevel,
} from '../sim/inventory';
import { Popup } from './Popup';
import c from './SupplyPanel.module.css';
import { SUPPLY_ICON } from './supplyIcons';
import { useCountUp } from './useCountUp';

const LEVEL_TEXT: Record<StockLevel, string> = {
  OK: 'Đủ dùng',
  LOW: 'Sắp hết',
  OUT: 'Hết hàng',
};

interface Props {
  inventory: Inventory;
  onClose: () => void;
  onOrder?: (item: any) => void;
  onRefresh?: () => Promise<void> | void;
}

/** Số tồn kho chạy lên/xuống mượt khi đổi (nhận hàng thì đếm lên), chốt đúng giá trị đích khi hoạt cảnh dừng. */
export function CountUp({ value }: { value: number }) {
  const current = useCountUp(value);
  // Khi hoạt cảnh hoàn tất (hoặc rất gần giá trị đích), chốt chính xác giá trị value thực tế
  const val = Math.abs(current - value) < 0.005 ? value : current;
  return <>{formatStockQuantity(val)}</>;
}

export function SupplyPanel({ inventory, onClose, onRefresh }: Props) {
  const stocks = inventory.stocks;

  // Tự động refresh tồn kho định kỳ 2s khi bảng kho đang mở
  useEffect(() => {
    if (!onRefresh) return;
    const timer = setInterval(() => {
      onRefresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [onRefresh]);

  return (
    <Popup title="Kho vật tư" onClose={onClose}>
      {stocks.length === 0 ? (
        <p style={{ padding: '16px', textAlign: 'center', color: 'var(--text-2)' }}>
          Đang nạp dữ liệu kho từ máy chủ Backend…
        </p>
      ) : (
        <ul className={c.list}>
          {stocks.map((item) => {
            const level = stockLevel(item);
            // Trạng thái giao hàng phải khớp CHÍNH XÁC cả zoneId và supplyId
            const pending = inventory.orders.some(
              (o) =>
                o.zoneId === item.zoneId &&
                (o.supplyId === item.supplyId || o.supplyCode === item.supplyCode),
            );
            const iconKey = mapSupplyToIconKey(item.supplyCode, item.category);
            const icon = SUPPLY_ICON[iconKey] || SUPPLY_ICON.FEED;
            const hasCapacity = item.capacity !== null && item.capacity > 0;

            return (
              <li
                key={item.id}
                className={c.row}
                data-level={level}
                data-testid={`supply-row-${item.supplyCode}`}
                data-zone-code={item.zoneCode}
                data-zone-id={item.zoneId}
              >
                <span
                  className={c.icon}
                  aria-hidden
                  style={
                    {
                      '--sheet': `url(${icon.url})`,
                      '--c': icon.c,
                      '--r': icon.r,
                    } as CSSProperties
                  }
                />
                <div className={c.info}>
                  <div className={c.top}>
                    <span className={c.name}>
                      {item.supplyName}
                      {item.zoneName ? ` (${item.zoneName})` : ''}
                    </span>
                    <span className={c.amount}>
                      {hasCapacity ? (
                        <>
                          <CountUp value={item.quantity} /> / {item.capacity}{' '}
                          {item.unit}
                        </>
                      ) : (
                        <>
                          <CountUp value={item.quantity} /> {item.unit}
                        </>
                      )}
                    </span>
                  </div>

                  {hasCapacity && (
                    <div
                      className={c.track}
                      role="meter"
                      aria-label={item.supplyName}
                      aria-valuemin={0}
                      aria-valuemax={item.capacity as number}
                      aria-valuenow={Math.round(item.quantity * 100) / 100}
                      aria-valuetext={LEVEL_TEXT[level]}
                    >
                      <span
                        className={c.fill}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, (item.quantity / (item.capacity as number)) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                  )}

                  <span className={c.level}>
                    {pending ? 'Xe tải đang giao hàng…' : LEVEL_TEXT[level]}
                  </span>
                </div>

                {pending && (
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: 'var(--hud-pill-radius)',
                      background: 'var(--gold)',
                      color: 'var(--ink)',
                      fontWeight: 700,
                      fontSize: 'var(--fs-xs)',
                      border: '2px solid var(--ink)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Đang giao
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Popup>
  );
}
