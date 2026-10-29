import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupplyTransport } from './supplyTransport.ts';

test('SupplyTransport connects to /supplies and registers event listeners', () => {
  const registeredEvents: string[] = [];
  let factoryUrl = '';

  const mockSocket = {
    connected: true,
    on: (event: string) => {
      registeredEvents.push(event);
    },
    emit: () => {},
    disconnect: () => {},
  };

  const transport = new SupplyTransport({
    url: 'http://localhost:3000',
    socketFactory: (url: string) => {
      factoryUrl = url;
      return mockSocket;
    },
  });

  transport.connect();
  assert.equal(factoryUrl, 'http://localhost:3000/supplies');
  assert.ok(registeredEvents.includes('connect'));
  assert.ok(registeredEvents.includes('disconnect'));
  assert.ok(registeredEvents.includes('sys:active_deliveries'));
  assert.ok(registeredEvents.includes('sys:supply_delivery_start'));
  assert.ok(registeredEvents.includes('sys:supply_delivery_completed'));
});

test('SupplyTransport notifies listeners when sys:supply_delivery_start arrives', () => {
  const handlers: Record<string, Function> = {};
  const mockSocket = {
    connected: true,
    on: (event: string, handler: Function) => {
      handlers[event] = handler;
    },
    emit: () => {},
    disconnect: () => {},
  };

  const transport = new SupplyTransport({
    socketFactory: () => mockSocket,
  });
  transport.connect();

  let receivedPayload: any = null;
  let callCount = 0;
  const unsubscribe = transport.onDeliveryStart((payload) => {
    receivedPayload = payload;
    callCount++;
  });

  const payload = {
    requestId: 'req-1',
    requestNumber: 'REQ-001',
    zoneId: 'z-1',
    supplyId: 's-1',
    supplyCode: 'SUP_OATS',
    supplyName: 'Oats',
    category: 'FEED_GRAIN',
    unit: 'KG',
    approvedQuantity: 20,
    dispatchedAt: new Date().toISOString(),
    animationEndsAt: new Date(Date.now() + 8000).toISOString(),
    fallbackAt: new Date(Date.now() + 20000).toISOString(),
    ackCapability: 'token-123',
  };

  handlers['sys:supply_delivery_start'](payload);
  assert.deepEqual(receivedPayload, payload);
  assert.equal(callCount, 1);

  // Unsubscribe stops future notifications
  unsubscribe();
  handlers['sys:supply_delivery_start'](payload);
  assert.equal(callCount, 1);
});

test('SupplyTransport sends ACK packet via sim:supply_delivery_ack', async () => {
  let emittedEvent = '';
  let emittedPayload: any = null;

  const mockSocket = {
    connected: true,
    on: () => {},
    emit: (event: string, payload: any, cb: Function) => {
      emittedEvent = event;
      emittedPayload = payload;
      if (cb) cb({ success: true });
    },
    disconnect: () => {},
  };

  const transport = new SupplyTransport({
    socketFactory: () => mockSocket,
  });
  transport.connect();

  const res = await transport.sendAck('req-1', 'cap-token');
  assert.equal(emittedEvent, 'sim:supply_delivery_ack');
  assert.deepEqual(emittedPayload, { requestId: 'req-1', ackCapability: 'cap-token' });
  assert.deepEqual(res, { success: true });
});
