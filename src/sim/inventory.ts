import type { StockItem } from '../api/inventoryApi.ts';

export type SupplyId = string;
export type StockLevel = 'OK' | 'LOW' | 'OUT';

export const DELIVERY_S = 8;
export const DELIVERY_TIMEOUT_S = 20;

export type RealStockItem = StockItem;

export interface InboundDeliveryOrder {
  id: string; // requestId
  requestId: string;
  requestNumber: string;
  zoneId: string;
  supplyId: string;
  supplyCode: string;
  supplyName: string;
  category: string;
  unit: string;
  approvedQuantity: number;
  dispatchedAt: number; // ms timestamp
  animationEndsAt: number; // ms timestamp (dispatchedAt + 8000)
  fallbackAt: number; // ms timestamp (dispatchedAt + 20000)
  arriveAt: number; // wall-clock seconds for truck animation (performance.now() / 1000)
  ackCapability?: string;
  acked?: boolean;
  status: 'DELIVERING';
}

export type SupplyOrder = InboundDeliveryOrder;

export interface Inventory {
  stocks: RealStockItem[];
  orders: InboundDeliveryOrder[];
  /** Backwards-compatible map: supplyId or supplyCode -> quantity */
  stock: Record<string, number>;
}

export function initialInventory(): Inventory {
  return {
    stocks: [],
    orders: [],
    stock: {
      HAY: 0,
      FEED: 0,
      BEDDING: 0,
      MEDS: 0,
      SHOES: 0,
    },
  };
}

export function buildInventory(
  stocks: RealStockItem[],
  orders: InboundDeliveryOrder[] = [],
): Inventory {
  const stock: Record<string, number> = {
    HAY: 0,
    FEED: 0,
    BEDDING: 0,
    MEDS: 0,
    SHOES: 0,
  };

  for (const s of stocks) {
    stock[s.id] = s.quantity;
    stock[s.supplyId] = s.quantity;
    stock[s.supplyCode] = s.quantity;

    // Provide icon-key aliases for sprite animation in FarmMapCanvas
    const iconKey = mapSupplyToIconKey(s.supplyCode, s.category);
    stock[iconKey] = Math.max(stock[iconKey] ?? 0, s.quantity);
  }

  return {
    stocks,
    orders,
    stock,
  };
}

export function stockLevel(item: RealStockItem): StockLevel {
  if (item.quantity <= 0) return 'OUT';
  if (item.capacity !== null && item.capacity > 0) {
    return item.quantity < item.capacity * 0.25 ? 'LOW' : 'OK';
  }
  if (item.minThreshold > 0) {
    return item.quantity <= item.minThreshold ? 'LOW' : 'OK';
  }
  return 'OK';
}

/**
 * Định dạng số lượng tồn kho hiển thị với tối đa 2 chữ số thập phân, bảo toàn số thực tế (vd: 25.25 -> "25.25", không làm tròn thành 26).
 */
export function formatStockQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return String(rounded);
}

export function stockLevelById(inv: Inventory, id: string): StockLevel {
  const item = inv.stocks.find(
    (s) => s.supplyId === id || s.supplyCode === id || s.id === id,
  );
  if (item) return stockLevel(item);
  const qty = inv.stock[id] ?? 0;
  if (qty <= 0) return 'OUT';
  return 'OK';
}

/**
 * Maps any backend supply code or category to one of the 5 canonical sprite icons in supplyIcons.ts
 */
export function mapSupplyToIconKey(
  code: string,
  category?: string,
): 'HAY' | 'FEED' | 'BEDDING' | 'MEDS' | 'SHOES' {
  const c = (code || '').toUpperCase();
  const cat = (category || '').toUpperCase();

  if (cat === 'FORAGE' || c.includes('HAY') || c.includes('GRASS') || c.includes('CO')) {
    return 'HAY';
  }
  if (cat === 'BEDDING' || c.includes('BED') || c.includes('STRAW') || c.includes('ROM')) {
    return 'BEDDING';
  }
  if (
    cat === 'MEDICATION' ||
    cat === 'MEDICAL' ||
    c.includes('MED') ||
    c.includes('DRUG') ||
    c.includes('THUOC') ||
    c.includes('BAND')
  ) {
    return 'MEDS';
  }
  if (
    cat === 'EQUIPMENT' ||
    cat === 'TACK' ||
    c.includes('SHOE') ||
    c.includes('HOOF') ||
    c.includes('MONG')
  ) {
    return 'SHOES';
  }
  return 'FEED';
}

/**
 * Registers an incoming delivery order (from sys:supply_delivery_start or sys:active_deliveries)
 * Deduplicates strictly by requestId.
 * R-3: If the order already exists but lacks ackCapability (e.g. was injected by REST snapshot
 * before the socket event arrived), the capability is merged in without duplicating the order.
 */
export function addInboundDelivery(
  inv: Inventory,
  order: InboundDeliveryOrder,
): Inventory {
  const existingIndex = inv.orders.findIndex((o) => o.requestId === order.requestId);
  if (existingIndex >= 0) {
    // Merge ackCapability from the socket event into the existing REST-snapshot order
    const existing = inv.orders[existingIndex];
    if (!existing.ackCapability && order.ackCapability) {
      const merged = { ...existing, ackCapability: order.ackCapability };
      const nextOrders = [...inv.orders];
      nextOrders[existingIndex] = merged;
      return { ...inv, orders: nextOrders };
    }
    // Exact duplicate: already present with capability, no change
    return inv;
  }
  return {
    ...inv,
    orders: [...inv.orders, order],
  };
}

/**
 * Ticks active deliveries according to wall-clock time.
 * When nowSeconds >= arriveAt (8 seconds of animation reached the barn door) and not yet acked,
 * fires onArrived(order) to emit sim:supply_delivery_ack.
 */
export function tickDeliveries(
  inv: Inventory,
  nowSeconds: number,
  nowMs: number,
  onArrived?: (order: InboundDeliveryOrder) => void,
): { inventory: Inventory; arrived: InboundDeliveryOrder[] } {
  const arrived: InboundDeliveryOrder[] = [];
  let changed = false;

  const nextOrders = inv.orders.map((o) => {
    const isArrived =
      nowSeconds >= o.arriveAt || (o.dispatchedAt > 0 && nowMs >= o.dispatchedAt + 8000);

    // R-3: Do not mark ACK successful merely because local animation ended!
    // Only fire onArrived and mark acked: true if BOTH animation ended AND ackCapability is present!
    if (isArrived && o.ackCapability && !o.acked) {
      changed = true;
      const updatedOrder = { ...o, acked: true };
      arrived.push(updatedOrder);
      if (onArrived) {
        onArrived(updatedOrder);
      }
      return updatedOrder;
    }
    return o;
  });

  return {
    inventory: changed ? { ...inv, orders: nextOrders } : inv,
    arrived,
  };
}

/**
 * R-3: Reconciles local pending orders against authoritative Backend activeDeliveries.
 * Any local order whose requestId is no longer active on Backend (completed or cancelled) is removed.
 * Active orders present on Backend are preserved or added without duplicating or resetting progress.
 */
export function reconcileAuthoritativeDeliveries(
  inv: Inventory,
  backendActiveDeliveries: Array<{
    requestId: string;
    requestNumber?: string;
    zoneId: string;
    supplyId: string;
    supplyCode: string;
    supplyName: string;
    category: string;
    unit: string;
    approvedQuantity: number;
    dispatchedAt: string | number;
    animationEndsAt: string | number;
    fallbackAt: string | number;
    ackCapability?: string;
  }>,
  nowSec: number = performance.now() / 1000,
  wallClockNowMs: number = Date.now(),
): Inventory {
  const activeMap = new Map(backendActiveDeliveries.map((d) => [d.requestId, d]));

  // 1. Remove local orders that are no longer in Backend's active deliveries (completed/cancelled)
  const remainingOrders = inv.orders.filter((o) => activeMap.has(o.requestId));

  // 2. Add or update active deliveries from Backend
  let reconciledInv: Inventory = { ...inv, orders: remainingOrders };

  for (const ad of backendActiveDeliveries) {
    const existing = remainingOrders.find((o) => o.requestId === ad.requestId);
    if (!existing) {
      const dispatchedAtMs = new Date(ad.dispatchedAt).getTime();
      const endsAtMs = new Date(ad.animationEndsAt).getTime();
      const fallbackAtMs = new Date(ad.fallbackAt).getTime();
      const remainingMs = Math.max(0, endsAtMs - wallClockNowMs);
      const arriveAt = nowSec + remainingMs / 1000;

      const newOrder: InboundDeliveryOrder = {
        id: ad.requestId,
        requestId: ad.requestId,
        requestNumber: ad.requestNumber || '',
        zoneId: ad.zoneId,
        supplyId: ad.supplyId,
        supplyCode: ad.supplyCode,
        supplyName: ad.supplyName,
        category: ad.category,
        unit: ad.unit,
        approvedQuantity: ad.approvedQuantity,
        dispatchedAt: dispatchedAtMs,
        animationEndsAt: endsAtMs,
        fallbackAt: fallbackAtMs,
        arriveAt,
        ackCapability: ad.ackCapability,
        status: 'DELIVERING',
      };
      reconciledInv = addInboundDelivery(reconciledInv, newOrder);
    } else if (!existing.ackCapability && ad.ackCapability) {
      reconciledInv = addInboundDelivery(reconciledInv, {
        ...existing,
        ackCapability: ad.ackCapability,
      });
    }
  }

  return reconciledInv;
}

/**
 * Applies authoritative delivery completion broadcast (sys:supply_delivery_completed).
 * Updates PostgreSQL stock balance in state and removes completed delivery order.
 */
export function applyDeliveryCompleted(
  inv: Inventory,
  payload: {
    requestId: string;
    supplyId: string;
    zoneId: string;
    balance: number;
  },
): Inventory {
  const nextOrders = inv.orders.filter((o) => o.requestId !== payload.requestId);

  const nextStocks = inv.stocks.map((s) => {
    if (s.supplyId === payload.supplyId && s.zoneId === payload.zoneId) {
      return { ...s, quantity: payload.balance };
    }
    return s;
  });

  const nextStock = { ...inv.stock };
  nextStock[payload.supplyId] = payload.balance;
  const matched = inv.stocks.find(
    (s) => s.supplyId === payload.supplyId && s.zoneId === payload.zoneId,
  );
  if (matched) {
    nextStock[matched.supplyCode] = payload.balance;
    const iconKey = mapSupplyToIconKey(matched.supplyCode, matched.category);
    nextStock[iconKey] = payload.balance;
  }

  return {
    ...inv,
    stocks: nextStocks,
    orders: nextOrders,
    stock: nextStock,
  };
}

/**
 * Legacy compatibility stubs for UI/components if referenced
 */
export const SUPPLY_IDS = ['HAY', 'FEED', 'BEDDING', 'MEDS', 'SHOES'] as const;
export const SUPPLIES: Record<
  string,
  { label: string; unit: string; capacity: number }
> = {
  HAY: { label: 'Cỏ khô', unit: 'kg', capacity: 600 },
  FEED: { label: 'Cám', unit: 'kg', capacity: 250 },
  BEDDING: { label: 'Rơm lót chuồng', unit: 'kg', capacity: 400 },
  MEDS: { label: 'Thuốc & băng', unit: 'hộp', capacity: 30 },
  SHOES: { label: 'Móng sắt', unit: 'bộ', capacity: 12 },
};

/** Eliminated local mock consumption - returns inventory unchanged */
export function consume(inv: Inventory, _horses: number, _simSeconds: number): Inventory {
  return inv;
}

/** Backwards-compatible delivery delivery tick */
export function deliver(
  inv: Inventory,
  nowSeconds: number,
): { inventory: Inventory; arrived: InboundDeliveryOrder[] } {
  return tickDeliveries(inv, nowSeconds, Date.now());
}
