import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchSimulatorInventoryContext } from './inventoryApi.ts';

test('fetchSimulatorInventoryContext fetches and returns context successfully', async () => {
  const originalFetch = globalThis.fetch;
  const mockData = {
    data: {
      catalogue: [
        { id: 'sup-1', code: 'OAT', name: 'Oats', category: 'FEED_GRAIN', unit: 'KG' },
      ],
      stocks: [
        {
          id: 'sb-1',
          zoneId: 'z-1',
          zoneName: 'Zone A',
          zoneCode: 'ZA',
          supplyId: 'sup-1',
          supplyName: 'Oats',
          supplyCode: 'OAT',
          unit: 'KG',
          category: 'FEED_GRAIN',
          quantity: 50,
          minThreshold: 10,
          capacity: 500,
        },
      ],
      activeDeliveries: [],
    },
  };

  try {
    globalThis.fetch = (async (url: any) => {
      assert.ok(String(url).includes('/inventory/simulator/context'));
      return {
        ok: true,
        status: 200,
        json: async () => mockData,
      } as any;
    }) as any;

    const result = await fetchSimulatorInventoryContext('http://localhost:3000/api');
    assert.equal(result.catalogue.length, 1);
    assert.equal(result.stocks.length, 1);
    assert.equal(result.stocks[0].capacity, 500);
    assert.equal(result.activeDeliveries.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchSimulatorInventoryContext throws an error when backend returns HTTP error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      } as any;
    }) as any;

    await assert.rejects(
      fetchSimulatorInventoryContext('http://localhost:3000/api'),
      /Failed to load simulator inventory context: HTTP 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
