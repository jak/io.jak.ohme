import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { OhmeDriver } from '../lib/OhmeDriver';
import { OhmeDevice } from '../lib/OhmeDevice';
import { AuthException } from '../lib/OhmeApi';
import {
  installFetchMock, FetchMock, LOGIN_ROUTE,
} from './helpers/fetchMock';
import {
  SERIAL, OTHER_SERIAL, accountInfo, chargeDevice, loginResponse,
} from './fixtures/ohme';

const DRIVER_IDS = ['ohme-epod', 'ohme-go', 'ohme-home', 'ohme-home-pro'] as const;
type DriverId = typeof DRIVER_IDS[number];

async function loadDriver(id: DriverId): Promise<any> {
  const DriverClass = (await import(`../drivers/${id}/driver.ts`)).default;
  const driver = new DriverClass();
  driver.log = vi.fn();
  return driver;
}

function createPairSession() {
  const handlers: Record<string, (...args: any[]) => Promise<unknown>> = {};
  return {
    handlers,
    setHandler: vi.fn((event: string, handler: (...args: any[]) => Promise<unknown>) => {
      handlers[event] = handler;
    }),
  };
}

// ── Model matching ───────────────────────────────────────────────────

describe('driver model matching', () => {
  const cases: Array<[string, DriverId]> = [
    ['Ohme ePod', 'ohme-epod'],
    ['Ohme Go', 'ohme-go'],
    ['Ohme Home', 'ohme-home'],
    ['Ohme Home Pro', 'ohme-home-pro'],
  ];

  it.each(cases)('"%s" is claimed by exactly one driver: %s', async (model, expected) => {
    const claims: DriverId[] = [];
    for (const id of DRIVER_IDS) {
      const driver = await loadDriver(id);
      if (driver.matchesModel(model)) claims.push(id);
    }
    expect(claims).toEqual([expected]);
  });

  it.each(DRIVER_IDS)('%s matches case-insensitively', async (id) => {
    const [model] = cases.find(([, driverId]) => driverId === id)!;
    const driver = await loadDriver(id);
    expect(driver.matchesModel(model.toUpperCase())).toBe(true);
  });

  it.each(DRIVER_IDS)('%s ignores chargers from other makers', async (id) => {
    const driver = await loadDriver(id);
    expect(driver.matchesModel('Tesla Wall Connector')).toBe(false);
  });

  it('the base driver matches nothing', () => {
    const driver = new OhmeDriver() as any;
    expect(driver.matchesModel('Ohme Home Pro')).toBe(false);
  });
});

describe('device classes', () => {
  it.each(DRIVER_IDS)('%s device extends OhmeDevice', async (id) => {
    const DeviceClass = (await import(`../drivers/${id}/device.ts`)).default;
    expect(new DeviceClass()).toBeInstanceOf(OhmeDevice);
  });
});

// ── Pairing ──────────────────────────────────────────────────────────

describe('OhmeDriver.onPair', () => {
  let fm: FetchMock;

  beforeEach(() => {
    fm = installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function pair(id: DriverId) {
    const driver = await loadDriver(id);
    const session = createPairSession();
    await driver.onPair(session);
    return session.handlers;
  }

  it('logs in and lists the chargers for this driver, storing a refresh token but not the password', async () => {
    fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
    fm.on('GET', '/v1/users/me/account', {
      json: accountInfo({
        chargeDevices: [
          chargeDevice({ id: OTHER_SERIAL, modelTypeDisplayName: 'Ohme ePod' }),
          chargeDevice({ id: SERIAL, modelTypeDisplayName: 'Ohme Home Pro' }),
        ],
      }),
    });
    const handlers = await pair('ohme-home-pro');

    await expect(handlers.login({ username: 'user@example.test', password: 'secret' })).resolves.toBe(true);
    const devices = await handlers.list_devices();

    expect(fm.callsTo('POST', LOGIN_ROUTE)[0].body).toMatchObject({ email: 'user@example.test', password: 'secret' });
    expect(devices).toEqual([{
      name: 'Ohme Home Pro',
      data: { serial: SERIAL },
      store: { email: 'user@example.test', refreshToken: 'refresh-token-login' },
    }]);
    expect(JSON.stringify(devices)).not.toContain('secret');
  });

  it('lists every matching charger on the account', async () => {
    fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
    fm.on('GET', '/v1/users/me/account', {
      json: accountInfo({
        chargeDevices: [
          chargeDevice({ id: SERIAL, modelTypeDisplayName: 'Ohme ePod' }),
          chargeDevice({ id: OTHER_SERIAL, modelTypeDisplayName: 'Ohme ePod' }),
        ],
      }),
    });
    const handlers = await pair('ohme-epod');

    await handlers.login({ username: 'user@example.test', password: 'secret' });
    const devices = await handlers.list_devices() as Array<{ data: { serial: string } }>;

    expect(devices.map((d) => d.data.serial)).toEqual([SERIAL, OTHER_SERIAL]);
  });

  it('fails the login step when the account has no charger for this driver', async () => {
    fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
    fm.on('GET', '/v1/users/me/account', { json: accountInfo() });
    const handlers = await pair('ohme-go');

    await expect(handlers.login({ username: 'user@example.test', password: 'secret' }))
      .rejects.toThrow('No Go chargers found on this account');
  });

  it('fails the login step on wrong credentials', async () => {
    fm.on('POST', LOGIN_ROUTE, { status: 400, json: { error: 'INVALID_PASSWORD' } });
    const handlers = await pair('ohme-home');

    await expect(handlers.login({ username: 'user@example.test', password: 'wrong' }))
      .rejects.toBeInstanceOf(AuthException);
  });

  it('lists nothing before a successful login', async () => {
    const handlers = await pair('ohme-home');
    await expect(handlers.list_devices()).resolves.toEqual([]);
  });
});
