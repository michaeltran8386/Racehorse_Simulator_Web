import { io } from 'socket.io-client';

export type SupplyTransportState = 'OFFLINE' | 'CONNECTING' | 'ONLINE';

export interface SupplyDeliveryStartPayload {
  requestId: string;
  requestNumber: string;
  zoneId: string;
  supplyId: string;
  supplyCode: string;
  supplyName: string;
  category: string;
  unit: string;
  approvedQuantity: number;
  dispatchedAt: string;
  animationEndsAt: string;
  fallbackAt: string;
  ackCapability: string;
}

export interface SupplyDeliveryCompletedPayload {
  requestId: string;
  zoneId: string;
  supplyId: string;
  status: 'DELIVERED';
  balance: number;
}

export interface SupplyTransportOptions {
  url?: string;
  socketFactory?: (url: string, opts: any) => any;
}

export class SupplyTransport {
  private socket: any = null;
  private state: SupplyTransportState = 'OFFLINE';
  private readonly listeners = {
    deliveryStart: new Set<(payload: SupplyDeliveryStartPayload) => void>(),
    deliveryCompleted: new Set<(payload: SupplyDeliveryCompletedPayload) => void>(),
    activeDeliveries: new Set<(payload: SupplyDeliveryStartPayload[]) => void>(),
    stateChange: new Set<(state: SupplyTransportState) => void>(),
  };

  private readonly options: SupplyTransportOptions;

  constructor(options: SupplyTransportOptions = {}) {
    this.options = options;
  }

  connect() {
    if (this.socket) return;

    this.setState('CONNECTING');
    const baseUrl =
      this.options.url || (import.meta as any).env?.VITE_WS_URL || 'http://localhost:3000';
    const namespaceUrl = baseUrl.endsWith('/supplies') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/supplies`;

    const factory = this.options.socketFactory || ((url: string, opts: any) => io(url, opts));
    this.socket = factory(namespaceUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.setState('ONLINE');
    });

    this.socket.on('disconnect', () => {
      this.setState('OFFLINE');
    });

    this.socket.on('sys:active_deliveries', (deliveries: SupplyDeliveryStartPayload[]) => {
      for (const listener of this.listeners.activeDeliveries) {
        listener(deliveries);
      }
    });

    this.socket.on('sys:supply_delivery_start', (payload: SupplyDeliveryStartPayload) => {
      for (const listener of this.listeners.deliveryStart) {
        listener(payload);
      }
    });

    this.socket.on('sys:supply_delivery_completed', (payload: SupplyDeliveryCompletedPayload) => {
      for (const listener of this.listeners.deliveryCompleted) {
        listener(payload);
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setState('OFFLINE');
  }

  getState(): SupplyTransportState {
    return this.state;
  }

  sendAck(requestId: string, ackCapability: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Supply socket is not connected'));
        return;
      }
      this.socket.emit(
        'sim:supply_delivery_ack',
        { requestId, ackCapability },
        (response: any) => {
          resolve(response);
        },
      );
    });
  }

  onDeliveryStart(fn: (payload: SupplyDeliveryStartPayload) => void): () => void {
    this.listeners.deliveryStart.add(fn);
    return () => this.listeners.deliveryStart.delete(fn);
  }

  onDeliveryCompleted(fn: (payload: SupplyDeliveryCompletedPayload) => void): () => void {
    this.listeners.deliveryCompleted.add(fn);
    return () => this.listeners.deliveryCompleted.delete(fn);
  }

  onActiveDeliveries(fn: (payload: SupplyDeliveryStartPayload[]) => void): () => void {
    this.listeners.activeDeliveries.add(fn);
    return () => this.listeners.activeDeliveries.delete(fn);
  }

  onStateChange(fn: (state: SupplyTransportState) => void): () => void {
    this.listeners.stateChange.add(fn);
    return () => this.listeners.stateChange.delete(fn);
  }

  private setState(newState: SupplyTransportState) {
    this.state = newState;
    for (const listener of this.listeners.stateChange) {
      listener(newState);
    }
  }
}

let defaultSupplyTransport: SupplyTransport | null = null;

export function getSupplyTransport(): SupplyTransport {
  if (!defaultSupplyTransport) {
    defaultSupplyTransport = new SupplyTransport();
    defaultSupplyTransport.connect();
  }
  return defaultSupplyTransport;
}
