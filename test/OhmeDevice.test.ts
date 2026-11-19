import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { OhmeDevice } from '../lib/OhmeDevice';

function createDevice(api: Record<string, unknown>) {
  const device = new OhmeDevice() as any;
  device.homey = {
    setTimeout: vi.fn(),
    setInterval: vi.fn(),
    clearTimeout: vi.fn(),
    clearInterval: vi.fn(),
  };
  device.api = api;
  device.error = vi.fn();
  device.setAvailable = vi.fn().mockResolvedValue(undefined);
  device.setUnavailable = vi.fn().mockResolvedValue(undefined);
  device.updateCapabilities = vi.fn();
  device.storeRefreshToken = vi.fn().mockResolvedValue(undefined);
  return device;
}

describe('OhmeDevice session polling', () => {
  let failingApi: Record<string, unknown>;

  beforeEach(() => {
    failingApi = { getChargeSession: vi.fn().mockRejectedValue(new Error('network down')) };
  });

  it('schedules the next poll with backoff after a failed poll', async () => {
    const device = createDevice(failingApi);

    await device.pollSession();

    expect(device.homey.setTimeout).toHaveBeenCalledTimes(1);
    expect(device.homey.setTimeout.mock.calls[0][1]).toBe(60 * 1000);
    expect(device.setUnavailable).toHaveBeenCalledWith('Connection error');
  });

  it('keeps polling when marking the device unavailable also fails', async () => {
    const device = createDevice(failingApi);
    device.setUnavailable = vi.fn().mockRejectedValue(new Error('homey busy'));

    await expect(device.pollSession()).resolves.toBeUndefined();

    expect(device.homey.setTimeout).toHaveBeenCalledTimes(1);
  });

  it('schedules the regular interval after a successful poll', async () => {
    const device = createDevice({ getChargeSession: vi.fn().mockResolvedValue(undefined), available: true });

    await device.pollSession();

    expect(device.setAvailable).toHaveBeenCalled();
    expect(device.homey.setTimeout.mock.calls[0][1]).toBe(30 * 1000);
  });

  it('does not poll or reschedule after the device is destroyed', async () => {
    const device = createDevice(failingApi);
    device.destroyed = true;

    await device.pollSession();

    expect(failingApi.getChargeSession).not.toHaveBeenCalled();
    expect(device.homey.setTimeout).not.toHaveBeenCalled();
  });
});
