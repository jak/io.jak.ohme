import {
  describe, it, expect, vi, beforeAll,
} from 'vitest';
import fs from 'fs';
import path from 'path';
import { createFakeHomey, FakeHomey } from './helpers/homey';

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));

let homey: FakeHomey;

beforeAll(async () => {
  const OhmeApp = (await import('../app')).default;
  const app = new OhmeApp();
  homey = createFakeHomey();
  app.homey = homey;
  app.log = vi.fn();
  await app.onInit();
});

function card(kind: 'trigger' | 'condition' | 'action', id: string) {
  const found = homey.cards[kind].get(id);
  if (!found) throw new Error(`${kind} card ${id} was never requested`);
  return found;
}

function fakeDevice(api: Record<string, unknown> = {}) {
  return {
    getApi: () => api,
    setVehicleSoc: vi.fn().mockResolvedValue(undefined),
  };
}

describe('flow card registration', () => {
  it.each([
    ['trigger', 'triggers'],
    ['condition', 'conditions'],
    ['action', 'actions'],
  ] as const)('every %s card in app.json has a run listener', (kind, section) => {
    const ids: string[] = (manifest.flow?.[section] ?? []).map((c: { id: string }) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(card(kind, id).runListener, `${kind} ${id}`).toBeTypeOf('function');
    }
  });
});

describe('charger_status_changed trigger', () => {
  it('runs only when the status matches the one picked in the flow', async () => {
    const run = card('trigger', 'charger_status_changed').runListener!;
    await expect(run({ status: 'charging' }, { status: 'charging' })).resolves.toBe(true);
    await expect(run({ status: 'charging' }, { status: 'paused' })).resolves.toBe(false);
  });
});

describe('charger_status_is condition', () => {
  it('compares the current status', async () => {
    const run = card('condition', 'charger_status_is').runListener!;
    const device = fakeDevice({ status: 'plugged_in' });
    await expect(run({ device, status: 'plugged_in' })).resolves.toBe(true);
    await expect(run({ device, status: 'charging' })).resolves.toBe(false);
  });
});

describe('action cards', () => {
  it('set_target_time passes hour and minute', async () => {
    const api = { setTarget: vi.fn().mockResolvedValue(true) };
    await card('action', 'set_target_time').runListener!({ device: fakeDevice(api), hour: 6, minute: 45 });
    expect(api.setTarget).toHaveBeenCalledWith({ targetTime: [6, 45] });
  });

  it('approve_charge approves the session', async () => {
    const api = { approveCharge: vi.fn().mockResolvedValue(true) };
    await card('action', 'approve_charge').runListener!({ device: fakeDevice(api) });
    expect(api.approveCharge).toHaveBeenCalledTimes(1);
  });

  it('set_price_cap_value passes the price', async () => {
    const api = { setPriceCapValue: vi.fn().mockResolvedValue(true) };
    await card('action', 'set_price_cap_value').runListener!({ device: fakeDevice(api), price: 14.2 });
    expect(api.setPriceCapValue).toHaveBeenCalledWith(14.2);
  });

  it('set_vehicle_soc goes through the device so capabilities refresh', async () => {
    const device = fakeDevice();
    await card('action', 'set_vehicle_soc').runListener!({ device, percent: 37 });
    expect(device.setVehicleSoc).toHaveBeenCalledWith(37);
  });

  it('select_vehicle selects the picked car', async () => {
    const api = { selectVehicle: vi.fn().mockResolvedValue(true) };
    await card('action', 'select_vehicle').runListener!({ device: fakeDevice(api), vehicle: { id: 'car-2', name: 'x' } });
    expect(api.selectVehicle).toHaveBeenCalledWith('car-2');
  });

  it('propagates API errors so the flow shows them', async () => {
    const api = { approveCharge: vi.fn().mockRejectedValue(new Error('Ohme API response error')) };
    await expect(card('action', 'approve_charge').runListener!({ device: fakeDevice(api) }))
      .rejects.toThrow('Ohme API response error');
  });
});

describe('select_vehicle autocomplete', () => {
  const autocomplete = () => card('action', 'select_vehicle').autocompleteListeners.vehicle;

  it('lists the cars on the account, naming them by name, then brand and model', async () => {
    const vehicles = [
      { id: 'car-1', name: 'Family car' },
      { id: 'car-2', model: { brand: { name: 'Acme' }, modelName: 'Volt One' } },
      { id: 'car-3', model: { make: 'Zap', modelName: 'Mini' } },
      { id: 'car-4', model: { modelName: 'Unbranded' } },
      { id: 'car-5' },
    ];

    const result = await autocomplete()('', { device: fakeDevice({ vehicles }) });

    expect(result).toEqual([
      { id: 'car-1', name: 'Family car' },
      { id: 'car-2', name: 'Acme Volt One' },
      { id: 'car-3', name: 'Zap Mini' },
      { id: 'car-4', name: 'Unbranded' },
      { id: 'car-5', name: '' },
    ]);
  });

  it('returns an empty list when there are no cars', async () => {
    await expect(autocomplete()('', { device: fakeDevice({ vehicles: [] }) })).resolves.toEqual([]);
  });
});
