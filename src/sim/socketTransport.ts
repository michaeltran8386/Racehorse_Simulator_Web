import { io } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import { publish, type SimEvent } from './bus.ts';

export type TransportEvent = SimEvent | 'sim:exam_finished';

export type TransportState = 'OFFLINE' | 'CONNECTING' | 'ONLINE';

export interface SocketLike {
  connected: boolean;
  auth: { token?: string };
  volatile?: {
    emit: (event: string, payload: any) => void;
  };
  on: (event: string, fn: (...args: any[]) => void) => any;
  off: (event: string, fn?: (...args: any[]) => void) => any;
  emit: (event: string, payload: any, ack?: (res: any) => void) => any;
  disconnect: () => any;
}

export type SocketFactory = (url: string, opts: any) => SocketLike;

export interface MedicalLockSyncPacket extends Record<string, unknown> {
  event: 'sys:medical_lock_sync';
  horse_id: string;
  medical_lock: boolean;
  issued_by_role?: 'VETERINARIAN';
}

export function isMedicalLockSyncPacket(payload: unknown): payload is MedicalLockSyncPacket {
  if (!payload || typeof payload !== 'object') return false;
  const packet = payload as Record<string, unknown>;
  return (
    packet.event === 'sys:medical_lock_sync' &&
    typeof packet.horse_id === 'string' &&
    typeof packet.medical_lock === 'boolean' &&
    (packet.issued_by_role === undefined || packet.issued_by_role === 'VETERINARIAN')
  );
}

export interface TransportOptions {
  url?: string;
  socketFactory?: SocketFactory;
  ackTimeoutMs?: number;
  maxRetries?: number;
  autoRetry?: boolean;
}

export interface PendingMessage {
  eventId: string;
  event: TransportEvent;
  payload: Record<string, unknown>;
  attempts: number;
  timer: any;
  createdAt: number;
  lastAttemptAt: number;
}

let currentSocket: SocketLike | null = null;
let currentOptions: TransportOptions | null = null;
let transportState: TransportState = 'OFFLINE';
let lastError: string | null = null;
const stateListeners = new Set<() => void>();

// Queue and deduplication tracking
const pendingMessages = new Map<string, PendingMessage>();
const acknowledgedEventIds = new Set<string>();
const finishedSessions = new Set<string>();
const reportedIncidents = new Set<string>();

function notifyState(): void {
  stateListeners.forEach((l) => l());
}

export function getTransportState(): TransportState {
  return transportState;
}

export function getLastError(): string | null {
  return lastError;
}

export function subscribeTransportState(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function useTransportState(): TransportState {
  return useSyncExternalStore(subscribeTransportState, getTransportState);
}

export function getPendingRetries(): number {
  return pendingMessages.size;
}

export function getInflightMessages(): PendingMessage[] {
  return Array.from(pendingMessages.values());
}

export function isEventAcknowledged(eventId: string): boolean {
  return acknowledgedEventIds.has(eventId);
}

export function clearPendingRetries(): void {
  for (const pending of pendingMessages.values()) {
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
  }
  pendingMessages.clear();
  acknowledgedEventIds.clear();
  finishedSessions.clear();
  reportedIncidents.clear();
}

export function resolveEventId(event: TransportEvent, payload: Record<string, unknown>): string {
  if (typeof payload.event_id === 'string' && payload.event_id.trim()) {
    return payload.event_id.trim();
  }
  if (typeof payload.packet_id === 'string' && payload.packet_id.trim()) {
    return payload.packet_id.trim();
  }
  if (typeof payload.session_id === 'string' && payload.session_id.trim()) {
    if (event === 'sim:session_finished') return `fin-${payload.session_id.trim()}`;
    if (event === 'sim:exam_finished') return `exam-${payload.session_id.trim()}`;
  }
  return `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendCriticalMessage(pending: PendingMessage): void {
  if (acknowledgedEventIds.has(pending.eventId)) {
    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    pendingMessages.delete(pending.eventId);
    return;
  }

  if (!currentSocket || !currentSocket.connected) {
    lastError = `Cannot send ${pending.event}: socket is offline`;
    notifyState();
    return;
  }

  pending.attempts++;
  pending.lastAttemptAt = Date.now();

  const wirePayload: Record<string, unknown> = { ...pending.payload };

  // Real NestJS DTO validation has `forbidNonWhitelisted: true`.
  // Ensure every real wire payload exactly matches its Backend DTO while retry identity remains stable internally:
  // 1. No backend DTO permits `event_id` on wire.
  delete wirePayload.event_id;

  // 2. ExamFinishedPacketDto permits neither event_id nor packet_id.
  if (pending.event === 'sim:exam_finished') {
    delete wirePayload.packet_id;
  } else {
    // IncidentReportPacketDto and SessionFinishedPacketDto permit packet_id?: string
    wirePayload.packet_id = (wirePayload.packet_id as string) || pending.eventId;
  }

  currentSocket.emit(pending.event, wirePayload, (ack: any) => {
    // 3. Stop retry immediately after the matching ACK.
    if (ack && ack.accepted === true) {
      acknowledgedEventIds.add(pending.eventId);
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
      pendingMessages.delete(pending.eventId);
      return;
    }

    if (ack && ack.accepted === false) {
      lastError = `Server rejected ${pending.event}: ${ack.code || 'UNKNOWN_ERROR'}`;
      notifyState();
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
      pendingMessages.delete(pending.eventId);
      return;
    }
  });

  const timeoutMs = currentOptions?.ackTimeoutMs ?? 2000;
  const maxRetries = currentOptions?.maxRetries ?? 5;
  if (pending.attempts < maxRetries && currentOptions?.autoRetry !== false) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      if (!acknowledgedEventIds.has(pending.eventId) && pendingMessages.has(pending.eventId)) {
        sendCriticalMessage(pending);
      }
    }, timeoutMs);
  } else if (pending.attempts >= maxRetries) {
    lastError = `Max retries (${maxRetries}) reached for ${pending.event} [${pending.eventId}]`;
    notifyState();
  }
}

export function flushPendingRetries(): void {
  for (const pending of pendingMessages.values()) {
    if (!acknowledgedEventIds.has(pending.eventId)) {
      sendCriticalMessage(pending);
    }
  }
}

export function connectSimulatorTransport(
  token?: string,
  options?: TransportOptions,
): void {
  if (currentSocket) {
    disconnectSimulatorTransport();
  }

  currentOptions = options ?? null;
  transportState = 'CONNECTING';
  lastError = null;
  notifyState();

  const baseUrl = options?.url || (typeof window !== 'undefined' && (import.meta as any).env?.VITE_SOCKET_URL) || 'http://localhost:3000/simulator';
  const factory = options?.socketFactory || ((url: string, opts: any) => io(url, opts) as unknown as SocketLike);

  const socket = factory(baseUrl, {
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  currentSocket = socket;

  socket.on('connect', () => {
    transportState = 'ONLINE';
    lastError = null;
    notifyState();

    // 4 & 5. Safe reconnect flush: re-emit unacknowledged pending packets reusing the same eventId
    flushPendingRetries();
  });

  socket.on('disconnect', () => {
    transportState = 'OFFLINE';
    // Clear pending timers while disconnected; pending packets remain queued and resume on connect
    for (const pending of pendingMessages.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = null;
      }
    }
    notifyState();
  });

  socket.on('connect_error', (err: any) => {
    transportState = 'OFFLINE';
    lastError = err?.message || 'Connection error';
    notifyState();
  });

  // Inbound broadcast from server: sys:medical_lock_sync
  socket.on('sys:medical_lock_sync', (payload: any) => {
    if (isMedicalLockSyncPacket(payload)) {
      publish('sys:medical_lock_sync', 'IN', payload);
    }
  });
}

export function disconnectSimulatorTransport(): void {
  if (currentSocket) {
    try {
      currentSocket.off('connect');
      currentSocket.off('disconnect');
      currentSocket.off('connect_error');
      currentSocket.off('sys:medical_lock_sync');
      currentSocket.disconnect();
    } catch {
      // ignore teardown errors
    }
    currentSocket = null;
  }
  clearPendingRetries();
  transportState = 'OFFLINE';
  notifyState();
}

/**
 * Forwards an OUT event to the active Socket.IO transport.
 * Volatile events (telemetry, progress) are dropped if disconnected.
 * Critical events (incident, finished, exam_finished) use reliable acks, retry with event_id reuse, and track error states.
 */
export function handleBusPublish(event: TransportEvent, payload: Record<string, unknown>): void {
  // Volatile events: telemetry & race progress
  if (event === 'sim:telemetry_tick' || event === 'sim:race_progress') {
    if (!currentSocket || !currentSocket.connected) {
      return; // Dropped if offline per contract
    }
    if (currentSocket.volatile?.emit) {
      currentSocket.volatile.emit(event, payload);
    } else {
      currentSocket.emit(event, payload);
    }
    return;
  }

  // Critical events requiring reliable delivery: incident, finished, exam_finished
  if (
    event === 'sim:incident_report' ||
    event === 'sim:session_finished' ||
    event === 'sim:exam_finished'
  ) {
    const eventId = resolveEventId(event, payload);

    // Deduplication (Requirement 5):
    // 1. Prevent duplicate if already acknowledged
    if (acknowledgedEventIds.has(eventId)) {
      return;
    }

    // 2. Prevent duplicate if already in flight
    if (pendingMessages.has(eventId)) {
      return;
    }

    // 3. For session_finished, prevent duplicate finished event for the same session
    if (event === 'sim:session_finished' && typeof payload.session_id === 'string' && payload.session_id) {
      if (finishedSessions.has(payload.session_id)) {
        return;
      }
      finishedSessions.add(payload.session_id);
    }

    // 4. For incident_report, prevent duplicate emission of the same logical incident
    if (event === 'sim:incident_report') {
      if (reportedIncidents.has(eventId)) {
        return;
      }
      reportedIncidents.add(eventId);
    }

    const pending: PendingMessage = {
      eventId,
      event,
      payload: { ...payload },
      attempts: 0,
      timer: null,
      createdAt: Date.now(),
      lastAttemptAt: 0,
    };

    pendingMessages.set(eventId, pending);
    sendCriticalMessage(pending);
    return;
  }

  // Any other OUT event (e.g. sim:workout_command, sim:device_status)
  if (currentSocket && currentSocket.connected) {
    currentSocket.emit(event, payload);
  }
}
