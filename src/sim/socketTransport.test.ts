import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  connectSimulatorTransport,
  disconnectSimulatorTransport,
  getTransportState,
  subscribeTransportState,
  getLastError,
  getPendingRetries,
  getInflightMessages,
  isEventAcknowledged,
  clearPendingRetries,
  handleBusPublish,
  type SocketLike,
  type SocketFactory,
} from './socketTransport.ts';
import { publish, getLog, clearLog } from './bus.ts';

class FakeSocket implements SocketLike {
  connected = false;
  auth: { token?: string } = {};
  emitted: { event: string; payload: any; ack?: (res: any) => void; volatile?: boolean }[] = [];
  listeners: Record<string, ((...args: any[]) => void)[]> = {};

  volatile = {
    emit: (event: string, payload: any) => {
      this.emitted.push({ event, payload, volatile: true });
    },
  };

  on(event: string, fn: (...args: any[]) => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
    return this;
  }

  off(event: string, fn?: (...args: any[]) => void) {
    if (!fn) {
      delete this.listeners[event];
    } else if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
    }
    return this;
  }

  emit(event: string, payload: any, ack?: (res: any) => void) {
    this.emitted.push({ event, payload, ack, volatile: false });
    return this;
  }

  disconnect() {
    this.connected = false;
    this.trigger('disconnect');
    return this;
  }

  trigger(event: string, ...args: any[]) {
    this.listeners[event]?.slice().forEach((fn) => fn(...args));
  }
}

test('socketTransport: connection status lifecycle is observable', () => {
  let fakeSocket: FakeSocket | null = null;
  const states: string[] = [];

  const factory: SocketFactory = (_url, opts) => {
    fakeSocket = new FakeSocket();
    fakeSocket.auth = opts.auth;
    return fakeSocket;
  };

  const unsub = subscribeTransportState(() => {
    states.push(getTransportState());
  });

  disconnectSimulatorTransport();
  states.length = 0;

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  assert.equal(getTransportState(), 'CONNECTING');

  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  assert.equal(getTransportState(), 'ONLINE');

  fakeSocket!.connected = false;
  fakeSocket!.trigger('disconnect');
  assert.equal(getTransportState(), 'OFFLINE');

  unsub();
  disconnectSimulatorTransport();
});

test('socketTransport: OUT packets emit to socket once, IN packets never echo', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  // Publish OUT packet via bus
  publish('sim:workout_command', 'OUT', { command: 'START' });
  assert.equal(fakeSocket!.emitted.length, 1);
  assert.equal(fakeSocket!.emitted[0].event, 'sim:workout_command');

  // Publish IN packet via bus (e.g. from local simulation or incoming socket)
  publish('sim:workout_command', 'IN', { command: 'START' });
  // Should NOT echo out to socket
  assert.equal(fakeSocket!.emitted.length, 1);

  disconnectSimulatorTransport();
});

test('socketTransport: inbound sys:medical_lock_sync from socket reaches local bus as IN', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  clearLog();
  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');

  // Simulate socket receiving sys:medical_lock_sync from BE
  fakeSocket!.trigger('sys:medical_lock_sync', {
    event: 'sys:medical_lock_sync',
    horse_id: 'test-horse-123',
    medical_lock: true,
    issued_by_role: 'VETERINARIAN',
  });

  const entries = getLog();
  const lockEntry = entries.find((e) => e.event === 'sys:medical_lock_sync');
  assert.ok(lockEntry, 'entry must be found in bus log');
  assert.equal(lockEntry.direction, 'IN');
  assert.equal((lockEntry.payload as any).horse_id, 'test-horse-123');
  assert.equal((lockEntry.payload as any).medical_lock, true);

  disconnectSimulatorTransport();
});

test('socketTransport: ignores malformed medical lock broadcasts', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  clearLog();
  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');

  // 1. Invalid role
  fakeSocket!.trigger('sys:medical_lock_sync', {
    event: 'sys:medical_lock_sync',
    horse_id: 'test-horse-123',
    medical_lock: true,
    issued_by_role: 'LOCAL_OPERATOR',
  });

  // 2. Non-boolean medical_lock
  fakeSocket!.trigger('sys:medical_lock_sync', {
    event: 'sys:medical_lock_sync',
    horse_id: 'test-horse-123',
    medical_lock: 'true',
  });

  // 3. Missing horse_id
  fakeSocket!.trigger('sys:medical_lock_sync', {
    event: 'sys:medical_lock_sync',
    medical_lock: true,
  });

  // 4. Non-object
  fakeSocket!.trigger('sys:medical_lock_sync', 'not-an-object');

  assert.equal(
    getLog().some((entry) => entry.event === 'sys:medical_lock_sync'),
    false,
  );

  disconnectSimulatorTransport();
});

test('socketTransport: incident and finished packets require ack while telemetry is volatile', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  // Telemetry tick uses volatile emit
  publish('sim:telemetry_tick', 'OUT', { tick: 1 });
  assert.equal(fakeSocket!.emitted.length, 1);
  assert.equal(fakeSocket!.emitted[0].volatile, true);

  // Incident report uses regular emit with ack callback
  publish('sim:incident_report', 'OUT', { packet_id: 'p-1', incident: 'COLIC' });
  assert.equal(fakeSocket!.emitted.length, 2);
  assert.equal(fakeSocket!.emitted[1].volatile, false);
  assert.ok(typeof fakeSocket!.emitted[1].ack === 'function');

  // Session finished uses regular emit with ack callback
  publish('sim:session_finished', 'OUT', { packet_id: 'p-2', status: 'COMPLETED' });
  assert.equal(fakeSocket!.emitted.length, 3);
  assert.equal(fakeSocket!.emitted[2].volatile, false);
  assert.ok(typeof fakeSocket!.emitted[2].ack === 'function');

  handleBusPublish('sim:exam_finished', { session_id: 'exam-1' });
  assert.equal(fakeSocket!.emitted.length, 4);
  assert.ok(typeof fakeSocket!.emitted[3].ack === 'function');

  fakeSocket!.emitted[2].ack!({ accepted: false, code: 'INVALID_SIMULATOR_PACKET' });
  assert.equal(
    getLastError(),
    'Server rejected sim:session_finished: INVALID_SIMULATOR_PACKET',
  );

  disconnectSimulatorTransport();
});

test('socketTransport: retry reuses identical packet_id across all retry attempts and strips event_id on wire', async () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', {
    socketFactory: factory,
    ackTimeoutMs: 25,
    maxRetries: 3,
  });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  publish('sim:incident_report', 'OUT', {
    session_id: 'sess-retry-1',
    incident_type: 'COLIC',
    severity: 'MODERATE',
  });

  assert.equal(fakeSocket!.emitted.length, 1);
  const initialPacket = fakeSocket!.emitted[0];
  assert.equal(initialPacket.payload.event_id, undefined, 'wire payload must not contain event_id');
  const expectedPacketId = initialPacket.payload.packet_id;
  assert.ok(expectedPacketId, 'packet_id must be assigned');
  assert.equal(getInflightMessages()[0].eventId, expectedPacketId);

  // Wait for retry 1 (fires at 25ms)
  await sleep(40);
  assert.equal(fakeSocket!.emitted.length, 2);
  assert.equal(fakeSocket!.emitted[1].payload.event_id, undefined);
  assert.equal(fakeSocket!.emitted[1].payload.packet_id, expectedPacketId);

  // Wait for retry 2 (fires at 50ms)
  await sleep(40);
  assert.equal(fakeSocket!.emitted.length, 3);
  assert.equal(fakeSocket!.emitted[2].payload.event_id, undefined);
  assert.equal(fakeSocket!.emitted[2].payload.packet_id, expectedPacketId);

  // Reached maxRetries (3 attempts total)
  await sleep(40);
  assert.equal(fakeSocket!.emitted.length, 3);
  assert.ok(getLastError()?.includes('Max retries (3) reached'));

  disconnectSimulatorTransport();
});

test('socketTransport: matching ACK cancels pending retries immediately', async () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', {
    socketFactory: factory,
    ackTimeoutMs: 25,
    maxRetries: 5,
  });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  publish('sim:session_finished', 'OUT', {
    session_id: 'sess-ack-test',
    status: 'COMPLETED',
  });

  assert.equal(fakeSocket!.emitted.length, 1);
  assert.equal(fakeSocket!.emitted[0].payload.event_id, undefined);
  const packetId = fakeSocket!.emitted[0].payload.packet_id;
  assert.ok(packetId, 'packet_id must be assigned for session_finished');
  const ackFn = fakeSocket!.emitted[0].ack;
  assert.ok(typeof ackFn === 'function');
  assert.equal(getPendingRetries(), 1);

  // Acknowledge immediately
  ackFn({ accepted: true, id: 'sess-ack-test-confirmed' });
  assert.equal(getPendingRetries(), 0);
  assert.equal(isEventAcknowledged(packetId), true);

  // Wait beyond ackTimeoutMs to ensure no retry fires
  await sleep(60);
  assert.equal(fakeSocket!.emitted.length, 1);

  disconnectSimulatorTransport();
});

test('socketTransport: late or duplicate ACK is safe no-op', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  publish('sim:session_finished', 'OUT', {
    session_id: 'sess-dup-ack',
    status: 'COMPLETED',
  });

  const ackFn = fakeSocket!.emitted[0].ack!;
  // First ACK
  ackFn({ accepted: true });
  assert.equal(getPendingRetries(), 0);

  // Duplicate late ACK
  assert.doesNotThrow(() => {
    ackFn({ accepted: true });
  });
  assert.equal(getPendingRetries(), 0);

  disconnectSimulatorTransport();
});

test('socketTransport: disconnect preserves pending messages and reconnect flushes them with same packet_id', async () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', {
    socketFactory: factory,
    ackTimeoutMs: 50,
    maxRetries: 5,
  });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  publish('sim:incident_report', 'OUT', {
    session_id: 'sess-reconnect-1',
    incident_type: 'LAMENESS',
    severity: 'MILD',
  });

  assert.equal(fakeSocket!.emitted.length, 1);
  assert.equal(fakeSocket!.emitted[0].payload.event_id, undefined);
  const originalPacketId = fakeSocket!.emitted[0].payload.packet_id;
  assert.ok(originalPacketId);

  // Socket drops connection before ACK
  fakeSocket!.connected = false;
  fakeSocket!.trigger('disconnect');
  assert.equal(getTransportState(), 'OFFLINE');
  assert.equal(getPendingRetries(), 1);
  assert.equal(getInflightMessages().length, 1);
  assert.equal(getInflightMessages()[0].eventId, originalPacketId);

  // Wait while offline: no retries should be emitted while offline
  await sleep(60);
  assert.equal(fakeSocket!.emitted.length, 1);

  // Socket reconnects
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  assert.equal(getTransportState(), 'ONLINE');

  // flushPendingRetries re-emits with identical packet_id and no event_id
  assert.equal(fakeSocket!.emitted.length, 2);
  const reEmitted = fakeSocket!.emitted[1];
  assert.equal(reEmitted.payload.event_id, undefined);
  assert.equal(reEmitted.payload.packet_id, originalPacketId);

  disconnectSimulatorTransport();
});

test('socketTransport: duplicate finish or incident emissions are deduplicated', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  // Duplicate session_finished for the same session_id
  publish('sim:session_finished', 'OUT', { session_id: 'sess-dedup-1', status: 'COMPLETED' });
  publish('sim:session_finished', 'OUT', { session_id: 'sess-dedup-1', status: 'COMPLETED' });
  assert.equal(fakeSocket!.emitted.length, 1);

  // Duplicate incident_report with explicit event_id
  publish('sim:incident_report', 'OUT', {
    event_id: 'inc-dedup-1',
    session_id: 'sess-dedup-1',
    incident_type: 'COLIC',
  });
  publish('sim:incident_report', 'OUT', {
    event_id: 'inc-dedup-1',
    session_id: 'sess-dedup-1',
    incident_type: 'COLIC',
  });
  assert.equal(fakeSocket!.emitted.length, 2); // 1 finish + 1 incident

  disconnectSimulatorTransport();
});

test('socketTransport: sim:exam_finished conforms to ExamFinishedPacketDto on wire (no event_id, no packet_id), preserves retry identity internally, and does not mutate input', async () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', {
    socketFactory: factory,
    ackTimeoutMs: 25,
    maxRetries: 3,
  });
  fakeSocket!.connected = true;
  fakeSocket!.trigger('connect');
  fakeSocket!.emitted.length = 0;

  const rawExamPayload = {
    event: 'sim:exam_finished',
    session_id: 'exam-sess-42',
    horse_id: '00000000-0000-4000-a002-000000000004',
    captured_at: new Date().toISOString(),
    model_version: 'equiflow-sim-v3',
    source: 'EQUIFLOW_SIMULATOR',
    metrics: {
      temperature: { value: 38.1, unit: 'CELSIUS' },
      resting_heart_rate: { value: 36, unit: 'BPM' },
      respiratory_rate: { value: 12, unit: 'BREATHS_PER_MINUTE' },
      weight: { value: 485, unit: 'KG' },
    },
  };

  // Publish to bus
  handleBusPublish('sim:exam_finished', rawExamPayload);

  // 1. Input payload object was NOT mutated
  assert.equal((rawExamPayload as any).event_id, undefined, 'rawExamPayload must not have event_id injected');
  assert.equal((rawExamPayload as any).packet_id, undefined, 'rawExamPayload must not have packet_id injected');

  // 2. Wire payload strictly conforms to ExamFinishedPacketDto (neither event_id nor packet_id on wire)
  assert.equal(fakeSocket!.emitted.length, 1);
  const wire1 = fakeSocket!.emitted[0];
  assert.equal(wire1.event, 'sim:exam_finished');
  assert.equal(wire1.payload.event_id, undefined, 'wire payload must not contain event_id');
  assert.equal(wire1.payload.packet_id, undefined, 'wire payload must not contain packet_id');
  assert.equal(wire1.payload.session_id, 'exam-sess-42');
  assert.equal(wire1.payload.source, 'EQUIFLOW_SIMULATOR');

  // Internal retry identity remains stable
  assert.equal(getPendingRetries(), 1);
  const internalEventId = getInflightMessages()[0].eventId;
  assert.ok(internalEventId.includes('exam-sess-42'));

  // 3. Retry attempt retains identical DTO wire shape and internal identity
  await sleep(40);
  assert.equal(fakeSocket!.emitted.length, 2);
  const wire2 = fakeSocket!.emitted[1];
  assert.equal(wire2.payload.event_id, undefined);
  assert.equal(wire2.payload.packet_id, undefined);
  assert.equal(getInflightMessages()[0].eventId, internalEventId);

  // 4. Matching ACK cancels retries immediately
  wire2.ack!({ accepted: true, id: 'exam-sess-42' });
  assert.equal(getPendingRetries(), 0);
  assert.equal(isEventAcknowledged(internalEventId), true);

  // Ensure no further retries fire after ACK
  await sleep(40);
  assert.equal(fakeSocket!.emitted.length, 2);

  // Verify clearPendingRetries cleans any remaining state
  clearPendingRetries();
  assert.equal(getPendingRetries(), 0);

  disconnectSimulatorTransport();
});

test('socketTransport: disconnect disposes socket and listeners', () => {
  let fakeSocket: FakeSocket | null = null;
  const factory: SocketFactory = () => {
    fakeSocket = new FakeSocket();
    return fakeSocket;
  };

  connectSimulatorTransport('mock-jwt-token', { socketFactory: factory });
  assert.ok(fakeSocket);
  const s = fakeSocket as FakeSocket;
  assert.ok(s.listeners['connect']?.length);

  disconnectSimulatorTransport();
  assert.equal(getTransportState(), 'OFFLINE');
  assert.equal(s.connected, false);
});
