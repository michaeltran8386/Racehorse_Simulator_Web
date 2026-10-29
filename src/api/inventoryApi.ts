import { API_BASE_URL } from './client.ts';

export interface SupplyItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  description?: string | null;
}

export interface StockItem {
  id: string;
  zoneId: string;
  zoneName: string;
  zoneCode: string;
  supplyId: string;
  supplyName: string;
  supplyCode: string;
  unit: string;
  category: string;
  quantity: number;
  minThreshold: number;
  capacity: number | null;
  lastInventoryDate?: string | null;
}

export interface ActiveDelivery {
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
}

export interface SimulatorInventoryContext {
  catalogue: SupplyItem[];
  stocks: StockItem[];
  activeDeliveries: ActiveDelivery[];
}

export async function fetchSimulatorInventoryContext(
  baseUrl: string = API_BASE_URL,
): Promise<SimulatorInventoryContext> {
  const url = `${baseUrl}/inventory/simulator/context`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load simulator inventory context: HTTP ${res.status}`);
  }

  const json = await res.json();
  const data = json.data || json;
  return {
    catalogue: data.catalogue || [],
    stocks: data.stocks || [],
    activeDeliveries: data.activeDeliveries || [],
  };
}
