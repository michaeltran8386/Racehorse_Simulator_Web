import { api } from './client.ts';

export interface CreateHorseInput {
  name: string;
  breed: string;
  dob: string;
  gender: string;
  color: string;
  microchip?: string;
  stallId?: string;
}

export interface CatalogItem {
  id: string;
  type: 'BREED' | 'COLOR';
  name: string;
  code: string;
}

export async function listHorses(limit = 100): Promise<any[]> {
  const data = await api<any>('GET', `/simulator/horses?limit=${limit}`);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function createHorse(input: CreateHorseInput): Promise<any> {
  return api<any>('POST', '/horses', input);
}

export async function loadCatalogs(): Promise<{ breeds: string[]; colors: string[] }> {
  try {
    const data = await api<any>('GET', '/horse-catalogs');
    const items: CatalogItem[] = Array.isArray(data) ? data : data?.items || [];

    const breeds = items.filter((i) => i.type === 'BREED').map((i) => i.name);
    const colors = items.filter((i) => i.type === 'COLOR').map((i) => i.name);

    return {
      breeds: breeds.length > 0 ? breeds : ['Thoroughbred', 'Arabian', 'Quarter Horse'],
      colors: colors.length > 0 ? colors : ['Bay', 'Chestnut', 'Black', 'Gray', 'Roan'],
    };
  } catch {
    return {
      breeds: ['Thoroughbred', 'Arabian', 'Quarter Horse'],
      colors: ['Bay', 'Chestnut', 'Black', 'Gray', 'Roan'],
    };
  }
}
