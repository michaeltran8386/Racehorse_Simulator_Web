import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addInboundDelivery,
  applyDeliveryCompleted,
  buildInventory,
  consume,
  formatStockQuantity,
  initialInventory,
  mapSupplyToIconKey,
  reconcileAuthoritativeDeliveries,
  stockLevel,
  tickDeliveries,
  type InboundDeliveryOrder,
  type RealStockItem,
} from './inventory.ts';

const mockStockHay: RealStockItem = {
  id: 'stock-hay-1',
  zoneId: 'zone-1',
  zoneName: 'Khu chuồng A',
  zoneCode: 'ZONE_A',
  supplyId: 'sup-hay',
  supplyCode: 'SUP_FORAGE_HAY',
  supplyName: 'Cỏ khô Timothy',
  category: 'FORAGE',
  unit: 'KG',
  quantity: 500,
  minThreshold: 100,
  capacity: 1000,
};

const mockStockOats: RealStockItem = {
  id: 'stock-oats-1',
  zoneId: 'zone-1',
  zoneName: 'Khu chuồng A',
  zoneCode: 'ZONE_A',
  supplyId: 'sup-oats',
  supplyCode: 'SUP_GRAIN_OATS',
  supplyName: 'Yến mạch cán vỡ',
  category: 'GRAIN',
  unit: 'KG',
  quantity: 200,
  minThreshold: 50,
  capacity: null, // Unconfigured capacity
};

test('initialInventory starts empty with zeroed fallback stocks', () => {
  const inv = initialInventory();
  assert.equal(inv.stocks.length, 0);
  assert.equal(inv.orders.length, 0);
  assert.equal(inv.stock.HAY, 0);
});

test('buildInventory maps PostgreSQL stocks and populates sprite aliases', () => {
  const inv = buildInventory([mockStockHay, mockStockOats]);
  assert.equal(inv.stocks.length, 2);
  assert.equal(inv.stock['sup-hay'], 500);
  assert.equal(inv.stock['SUP_FORAGE_HAY'], 500);
  assert.equal(inv.stock.HAY, 500);
  assert.equal(inv.stock.FEED, 200);
});

test('consume is a no-op under CR-024 (mock local consumption eliminated)', () => {
  const inv = buildInventory([mockStockHay]);
  const after = consume(inv, 10, 100);
  assert.equal(after.stocks[0].quantity, 500);
  assert.equal(after.stock.HAY, 500);
});

test('stockLevel respects configured capacity or fallback minThreshold', () => {
  // With capacity 1000: LOW below 250 (25%), OUT at 0
  assert.equal(stockLevel({ ...mockStockHay, quantity: 500 }), 'OK');
  assert.equal(stockLevel({ ...mockStockHay, quantity: 200 }), 'LOW');
  assert.equal(stockLevel({ ...mockStockHay, quantity: 0 }), 'OUT');

  // With unconfigured capacity (null) and minThreshold 50
  assert.equal(stockLevel({ ...mockStockOats, quantity: 100 }), 'OK');
  assert.equal(stockLevel({ ...mockStockOats, quantity: 50 }), 'LOW');
  assert.equal(stockLevel({ ...mockStockOats, quantity: 0 }), 'OUT');
});

// ---------------------------------------------------------------------------
// R-4 merged coverage: addInboundDelivery contract tests
// ---------------------------------------------------------------------------
test('addInboundDelivery adds a new order when requestId is not yet present', () => {
  const inv = buildInventory([mockStockOats]);
  const order: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    ackCapability: 'cap-abc',
    status: 'DELIVERING',
  };
  const next = addInboundDelivery(inv, order);
  assert.equal(next.orders.length, 1);
  assert.equal(next.orders[0].requestId, 'req-1');
  assert.equal(next.orders[0].ackCapability, 'cap-abc');
});

test('addInboundDelivery merges ackCapability into existing REST-snapshot order that has no capability', () => {
  const inv = buildInventory([mockStockOats]);
  const snapshotOrder: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    ackCapability: undefined, // REST snapshot without capability
    status: 'DELIVERING',
  };
  const withSnapshot = addInboundDelivery(inv, snapshotOrder);

  const socketOrder: InboundDeliveryOrder = {
    ...snapshotOrder,
    ackCapability: 'signed-cap-xyz', // Socket event provides signed capability
  };
  const merged = addInboundDelivery(withSnapshot, socketOrder);

  assert.equal(merged.orders.length, 1, 'should not duplicate the order');
  assert.equal(merged.orders[0].ackCapability, 'signed-cap-xyz', 'ackCapability must be merged in');
  assert.equal(merged.orders[0].supplyId, 'sup-oats', 'other fields preserved');
});

test('addInboundDelivery does NOT duplicate order when exact duplicate arrives', () => {
  const inv = buildInventory([mockStockOats]);
  const order: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    ackCapability: 'existing-cap',
    status: 'DELIVERING',
  };
  const added = addInboundDelivery(inv, order);
  const duplicate = addInboundDelivery(added, order);

  assert.equal(duplicate.orders.length, 1);
  assert.strictEqual(duplicate, added, 'should return same reference (no-op)');
});

test('addInboundDelivery does NOT overwrite an existing capability with a new one', () => {
  const inv = buildInventory([mockStockOats]);
  const order1: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    ackCapability: 'original-cap',
    status: 'DELIVERING',
  };
  const withOrder = addInboundDelivery(inv, order1);
  const order2: InboundDeliveryOrder = {
    ...order1,
    ackCapability: 'different-cap',
  };
  const after = addInboundDelivery(withOrder, order2);

  assert.equal(after.orders.length, 1);
  assert.equal(after.orders[0].ackCapability, 'original-cap', 'must not overwrite existing capability');
});

test('addInboundDelivery adds a second order independently when requestId differs', () => {
  const inv = buildInventory([mockStockOats]);
  const order1: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    ackCapability: 'cap-1',
    status: 'DELIVERING',
  };
  const order2: InboundDeliveryOrder = {
    ...order1,
    id: 'req-2',
    requestId: 'req-2',
    requestNumber: 'REQ-2610-0002',
    ackCapability: 'cap-2',
  };
  const withBoth = addInboundDelivery(addInboundDelivery(inv, order1), order2);
  assert.equal(withBoth.orders.length, 2);
  assert.equal(withBoth.orders[0].requestId, 'req-1');
  assert.equal(withBoth.orders[1].requestId, 'req-2');
});

test('addInboundDelivery is immutable: original inventory is not mutated', () => {
  const inv = buildInventory([mockStockOats]);
  const order: InboundDeliveryOrder = {
    id: 'req-1',
    requestId: 'req-1',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    status: 'DELIVERING',
  };
  addInboundDelivery(inv, order);
  assert.equal(inv.orders.length, 0, 'original inv.orders must remain empty');
});

// ---------------------------------------------------------------------------
// R-3: Ticking, capability arrival timing, and ACK contracts
// ---------------------------------------------------------------------------
test('tickDeliveries triggers onArrived callback exactly once after 8s animation when ackCapability is present', () => {
  const inv = buildInventory([mockStockOats]);
  const dispatchedAtMs = 1000000;
  const order: InboundDeliveryOrder = {
    id: 'req-123',
    requestId: 'req-123',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: dispatchedAtMs,
    animationEndsAt: dispatchedAtMs + 8000,
    fallbackAt: dispatchedAtMs + 20000,
    arriveAt: 108,
    ackCapability: 'valid-signed-capability',
    status: 'DELIVERING',
  };

  const withOrder = addInboundDelivery(inv, order);
  let arrivedOrder: InboundDeliveryOrder | null = null;
  const onArrived = (o: InboundDeliveryOrder) => {
    arrivedOrder = o;
  };

  // Before 8s: truck is still driving
  const early = tickDeliveries(withOrder, 107, dispatchedAtMs + 7000, onArrived);
  assert.equal(early.arrived.length, 0);
  assert.equal(arrivedOrder, null);

  // At 8s: truck arrives at barn door with capability -> triggers ACK
  const done = tickDeliveries(withOrder, 108, dispatchedAtMs + 8000, onArrived);
  assert.equal(done.arrived.length, 1);
  assert.ok(arrivedOrder);
  assert.equal((arrivedOrder as InboundDeliveryOrder).requestId, 'req-123');
  assert.equal(done.inventory.orders[0].acked, true);

  // Subsequent tick does not re-trigger arrived callback
  let secondCall = false;
  const subsequent = tickDeliveries(done.inventory, 109, dispatchedAtMs + 9000, () => {
    secondCall = true;
  });
  assert.equal(subsequent.arrived.length, 0);
  assert.equal(secondCall, false);
});

test('R-3: tickDeliveries does NOT mark acked or fire onArrived if ackCapability is missing after 8s', () => {
  const inv = buildInventory([mockStockOats]);
  const dispatchedAtMs = 1000000;
  const orderWithoutCap: InboundDeliveryOrder = {
    id: 'req-no-cap',
    requestId: 'req-no-cap',
    requestNumber: 'REQ-2610-0002',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: dispatchedAtMs,
    animationEndsAt: dispatchedAtMs + 8000,
    fallbackAt: dispatchedAtMs + 20000,
    arriveAt: 108,
    ackCapability: undefined, // Missing capability (e.g. REST snapshot before socket sync)
    status: 'DELIVERING',
  };

  const withOrder = addInboundDelivery(inv, orderWithoutCap);
  let called = false;
  const res = tickDeliveries(withOrder, 109, dispatchedAtMs + 8500, () => {
    called = true;
  });

  // Must NOT trigger ACK without valid capability
  assert.equal(res.arrived.length, 0);
  assert.equal(called, false);
  // Must NOT mark acked: true merely because animation ended
  assert.equal(res.inventory.orders[0].acked, undefined);
});

test('R-3: capability arriving after 8s merges into arrived order, and next tick triggers ACK and marks acked', () => {
  const inv = buildInventory([mockStockOats]);
  const dispatchedAtMs = 1000000;
  const snapshotOrder: InboundDeliveryOrder = {
    id: 'req-late-cap',
    requestId: 'req-late-cap',
    requestNumber: 'REQ-2610-0003',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: dispatchedAtMs,
    animationEndsAt: dispatchedAtMs + 8000,
    fallbackAt: dispatchedAtMs + 20000,
    arriveAt: 108,
    ackCapability: undefined,
    status: 'DELIVERING',
  };

  let currentInv = addInboundDelivery(inv, snapshotOrder);

  // At 8.2s: animation ended, but no capability yet
  const tick1 = tickDeliveries(currentInv, 108.2, dispatchedAtMs + 8200);
  assert.equal(tick1.arrived.length, 0);
  assert.equal(tick1.inventory.orders[0].acked, undefined);
  currentInv = tick1.inventory;

  // At 9.0s: capability arrives late (socket reconnected / active_deliveries received)
  const socketOrder: InboundDeliveryOrder = {
    ...snapshotOrder,
    ackCapability: 'late-arrived-capability',
  };
  currentInv = addInboundDelivery(currentInv, socketOrder);
  assert.equal(currentInv.orders[0].ackCapability, 'late-arrived-capability');

  // Next tick at 9.2s: now capability is present and animation already ended -> triggers ACK!
  let ackedOrder: InboundDeliveryOrder | null = null;
  const tick2 = tickDeliveries(currentInv, 109.2, dispatchedAtMs + 9200, (o) => {
    ackedOrder = o;
  });

  assert.equal(tick2.arrived.length, 1);
  assert.ok(ackedOrder);
  assert.equal((ackedOrder as InboundDeliveryOrder).requestId, 'req-late-cap');
  assert.equal(tick2.inventory.orders[0].acked, true);
});

// ---------------------------------------------------------------------------
// R-3: Reconnect reconciliation & lost completion event coverage
// ---------------------------------------------------------------------------
test('R-3: lost completion event: reconcileAuthoritativeDeliveries removes locally retained order missing from Backend activeDeliveries', () => {
  const inv = buildInventory([mockStockOats]);
  const req1: InboundDeliveryOrder = {
    id: 'req-lost-event',
    requestId: 'req-lost-event',
    requestNumber: 'REQ-LOST',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    status: 'DELIVERING',
  };
  const req2: InboundDeliveryOrder = {
    ...req1,
    id: 'req-active-delivering',
    requestId: 'req-active-delivering',
    requestNumber: 'REQ-ACTIVE',
  };

  const localInv = addInboundDelivery(addInboundDelivery(inv, req1), req2);
  assert.equal(localInv.orders.length, 2);

  // Backend state on reconnect: req-lost-event has completed on Backend, only req-active-delivering remains
  const backendDeliveries = [
    {
      requestId: 'req-active-delivering',
      requestNumber: 'REQ-ACTIVE',
      zoneId: 'zone-1',
      supplyId: 'sup-oats',
      supplyCode: 'SUP_GRAIN_OATS',
      supplyName: 'Yến mạch cán vỡ',
      category: 'GRAIN',
      unit: 'KG',
      approvedQuantity: 50,
      dispatchedAt: '2026-10-29T00:00:00.000Z',
      animationEndsAt: '2026-10-29T00:00:08.000Z',
      fallbackAt: '2026-10-29T00:00:20.000Z',
      ackCapability: 'cap-active',
    },
  ];

  const reconciled = reconcileAuthoritativeDeliveries(localInv, backendDeliveries);
  assert.equal(reconciled.orders.length, 1);
  assert.equal(reconciled.orders[0].requestId, 'req-active-delivering');
  // req-lost-event was pruned
  assert.equal(reconciled.orders.find((o) => o.requestId === 'req-lost-event'), undefined);
});

test('R-3: reconnect after Backend has completed delivery: clears local pending order and reflects updated stock balance', () => {
  const inv = buildInventory([mockStockOats]);
  const pendingOrder: InboundDeliveryOrder = {
    id: 'req-completed-on-backend',
    requestId: 'req-completed-on-backend',
    requestNumber: 'REQ-DONE',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    status: 'DELIVERING',
  };
  const localWithOrder = addInboundDelivery(inv, pendingOrder);
  assert.equal(localWithOrder.orders.length, 1);

  // Backend returned updated stocks (balance increased from 200 to 250) and 0 activeDeliveries
  const updatedStocks: RealStockItem[] = [{ ...mockStockOats, quantity: 250 }];
  const baseInv = buildInventory(updatedStocks, localWithOrder.orders);

  // Authoritative reconciliation with empty activeDeliveries
  const finalInv = reconcileAuthoritativeDeliveries(baseInv, []);
  assert.equal(finalInv.orders.length, 0, 'completed order must be removed');
  assert.equal(finalInv.stocks[0].quantity, 250, 'stock quantity reflects authoritative 250');
  assert.equal(finalInv.stock['sup-oats'], 250);
});

test('applyDeliveryCompleted updates PostgreSQL balance and cleans up order', () => {
  const inv = buildInventory([mockStockOats]);
  const order: InboundDeliveryOrder = {
    id: 'req-123',
    requestId: 'req-123',
    requestNumber: 'REQ-2610-0001',
    zoneId: 'zone-1',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 50,
    dispatchedAt: 1000000,
    animationEndsAt: 1008000,
    fallbackAt: 1020000,
    arriveAt: 108,
    status: 'DELIVERING',
  };

  const withOrder = addInboundDelivery(inv, order);
  assert.equal(withOrder.orders.length, 1);

  const completed = applyDeliveryCompleted(withOrder, {
    requestId: 'req-123',
    supplyId: 'sup-oats',
    zoneId: 'zone-1',
    balance: 250, // 200 + 50
  });

  assert.equal(completed.orders.length, 0);
  assert.equal(completed.stocks[0].quantity, 250);
  assert.equal(completed.stock['sup-oats'], 250);
  assert.equal(completed.stock['SUP_GRAIN_OATS'], 250);
});

test('mapSupplyToIconKey maps codes and categories to canonical sprite icons', () => {
  assert.equal(mapSupplyToIconKey('SUP_FORAGE_HAY', 'FORAGE'), 'HAY');
  assert.equal(mapSupplyToIconKey('SUP_BEDDING_STRAW', 'BEDDING'), 'BEDDING');
  assert.equal(mapSupplyToIconKey('SUP_MED_BANDAGE', 'MEDICATION'), 'MEDS');
  assert.equal(mapSupplyToIconKey('SUP_SHOE_STEEL', 'EQUIPMENT'), 'SHOES');
  assert.equal(mapSupplyToIconKey('SUP_GRAIN_OATS', 'GRAIN'), 'FEED');
});

test('formatStockQuantity formats decimal stock accurately with up to two fractional digits', () => {
  assert.equal(formatStockQuantity(25.25), '25.25', '25.25 must be preserved exactly, not rounded to 26 or 25');
  assert.equal(formatStockQuantity(0.5), '0.5', '0.5 must be preserved');
  assert.equal(formatStockQuantity(0.50), '0.5', '0.50 must be preserved');
  assert.equal(formatStockQuantity(0), '0', 'zero stock rendered as 0');
  assert.equal(formatStockQuantity(20), '20', 'integer rendered as 20');
  assert.equal(formatStockQuantity(12.34), '12.34', '12.34 rendered as 12.34');
});

test('delivery pending indication matches BOTH zoneId and supplyId without leaking across zones', () => {
  const zoneAStock: RealStockItem = {
    id: 'sb-zone-a',
    zoneId: 'zone-A',
    zoneName: 'Zone A - Barn 1',
    zoneCode: 'ZONE_A',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    quantity: 25.25,
    minThreshold: 10,
    capacity: 100,
  };

  const zoneBStock: RealStockItem = {
    id: 'sb-zone-b',
    zoneId: 'zone-B',
    zoneName: 'Zone B - Barn 2',
    zoneCode: 'ZONE_B',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    quantity: 0.5,
    minThreshold: 10,
    capacity: 100,
  };

  const inv = buildInventory([zoneAStock, zoneBStock]);

  const deliveryZoneA: InboundDeliveryOrder = {
    id: 'req-zone-a',
    requestId: 'req-zone-a',
    requestNumber: 'REQ-001',
    zoneId: 'zone-A',
    supplyId: 'sup-oats',
    supplyCode: 'SUP_GRAIN_OATS',
    supplyName: 'Yến mạch cán vỡ',
    category: 'GRAIN',
    unit: 'KG',
    approvedQuantity: 20,
    dispatchedAt: 1000,
    animationEndsAt: 9000,
    fallbackAt: 21000,
    arriveAt: 8,
    status: 'DELIVERING',
  };

  const invWithDelivery = addInboundDelivery(inv, deliveryZoneA);

  // Helper matching logic as in SupplyPanel
  const isPending = (item: RealStockItem) =>
    invWithDelivery.orders.some(
      (o) =>
        o.zoneId === item.zoneId &&
        (o.supplyId === item.supplyId || o.supplyCode === item.supplyCode),
    );

  assert.equal(isPending(zoneAStock), true, 'Zone A Oats must be marked as pending delivery');
  assert.equal(isPending(zoneBStock), false, 'Zone B Oats must NOT be marked as pending delivery');
});
