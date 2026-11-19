import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { OhmeDevice } from '../lib/OhmeDevice';
import {
  installFetchMock, FetchMock, LOGIN_ROUTE, REFRESH_ROUTE,
} from './helpers/fetchMock';
import { createFakeHomey, FakeHomey, flushPromises } from './helpers/homey';
import {
  SERIAL, accountInfo, chargeDevice, chargeSession, loginResponse, nextSessionInfo, refreshResponse,
  userSettings, vehicle,
} from './fixtures/ohme';

const EMAIL = 'user@example.test';
const SESSIONS = '/v1/chargeSessions';
const NEXT_SESSION = '/v1/chargeSessions/nextSessionInfo';
const ACCOUNT = '/v1/users/me/account';
const SETTINGS = '/v1/users/me/settings';
const APPLIED_RULE = '/v2/users/me/charge-rules/rule-applied?persist=true&recalculateSession=true';

const ALL_CAPABILITIES = [
  'charger_status', 'measure_power', 'measure_current', 'measure_voltage', 'measure_battery', 'meter_power',
  'evcharger_charging', 'charge_mode', 'target_percentage', 'target_time', 'preconditioning_duration',
  'lock_buttons', 'price_cap_enabled', 'require_approval', 'sleep_when_inactive',
];

let fm: FetchMock;

beforeEach(() => {
  fm = installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface DeviceOptions {
  store?: Record<string, unknown>;
  capabilities?: string[];
}

function createDevice({ store, capabilities = ALL_CAPABILITIES }: DeviceOptions = {}) {
  const device = new OhmeDevice() as any;
  device.homey = createFakeHomey();
  device.__store = { email: EMAIL, refreshToken: 'stored-refresh-token', ...store };
  device.__data = { serial: SERIAL };
  device.__capabilities = [...capabilities];
  device.log = vi.fn();
  device.error = vi.fn();
  return device as OhmeDevice & Record<string, any> & { homey: FakeHomey };
}

function mockHealthyAccount(session = chargeSession()) {
  fm.on('POST', REFRESH_ROUTE, { json: refreshResponse() });
  fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
  fm.on('GET', ACCOUNT, { json: accountInfo() });
  fm.on('GET', SESSIONS, { json: [session] });
  fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });
}

async function initialisedDevice(options?: DeviceOptions, session = chargeSession()) {
  mockHealthyAccount(session);
  const device = createDevice(options);
  await device.onInit();
  return device;
}

// ── onInit ───────────────────────────────────────────────────────────

describe('OhmeDevice.onInit', () => {
  it('authenticates with the stored refresh token and stores the new one', async () => {
    const device = await initialisedDevice();

    expect(fm.callsTo('POST', REFRESH_ROUTE)[0].body).toMatchObject({ refresh_token: 'stored-refresh-token' });
    expect(fm.callsTo('POST', LOGIN_ROUTE)).toHaveLength(0);
    expect(device.__store.refreshToken).toBe('refresh-token-refreshed');
    expect(device.__available).toBe(true);
  });

  it('sets every capability from the account and session', async () => {
    const device = await initialisedDevice();

    expect(device.__values).toEqual({
      charger_status: 'charging',
      measure_power: 7200,
      measure_current: 31.3,
      measure_voltage: 230,
      measure_battery: 60,
      meter_power: 12,
      evcharger_charging: true,
      charge_mode: 'smart_charge',
      target_percentage: 80,
      target_time: '07:30',
      preconditioning_duration: '0',
      lock_buttons: false,
      price_cap_enabled: true,
      require_approval: true,
      sleep_when_inactive: false,
    });
  });

  it('registers a listener for every controllable capability', async () => {
    const device = await initialisedDevice();

    expect(Object.keys(device.__listeners).sort()).toEqual([
      'charge_mode', 'evcharger_charging', 'lock_buttons', 'preconditioning_duration', 'price_cap_enabled',
      'require_approval', 'sleep_when_inactive', 'target_percentage',
    ]);
  });

  it('skips capabilities the device does not have', async () => {
    const device = await initialisedDevice({
      capabilities: ALL_CAPABILITIES.filter((c) => !['require_approval', 'sleep_when_inactive'].includes(c)),
    });

    expect(device.__values).not.toHaveProperty('require_approval');
    expect(device.__values).not.toHaveProperty('sleep_when_inactive');
    expect(device.__listeners).not.toHaveProperty('require_approval');
    expect(device.__listeners).not.toHaveProperty('sleep_when_inactive');
  });

  it('starts the session poll and the device info poll', async () => {
    const device = await initialisedDevice();

    expect(device.homey.timeouts.map((t) => t.ms)).toEqual([30 * 1000]);
    expect(device.homey.intervals.map((t) => t.ms)).toEqual([5 * 60 * 1000]);
  });

  it('falls back to the stored password when the refresh token is rejected, then deletes the password', async () => {
    mockHealthyAccount();
    fm.once('POST', REFRESH_ROUTE, { status: 400, text: 'TOKEN_REVOKED' });
    const device = createDevice({ store: { password: 'legacy-secret' } });

    await device.onInit();

    expect(fm.callsTo('POST', LOGIN_ROUTE)[0].body).toMatchObject({ email: EMAIL, password: 'legacy-secret' });
    expect(device.__store).not.toHaveProperty('password');
    expect(device.__store.refreshToken).toBe('refresh-token-login');
    expect(device.__available).toBe(true);
  });

  it('migrates installs that only have a stored password', async () => {
    mockHealthyAccount();
    const device = createDevice({ store: { refreshToken: null, password: 'legacy-secret' } });

    await device.onInit();

    expect(fm.callsTo('POST', REFRESH_ROUTE)).toHaveLength(0);
    expect(fm.callsTo('POST', LOGIN_ROUTE)).toHaveLength(1);
    expect(device.__store).not.toHaveProperty('password');
    expect(device.__store.refreshToken).toBe('refresh-token-login');
  });

  it('is unavailable when the refresh token is rejected and there is no password', async () => {
    fm.on('POST', REFRESH_ROUTE, { status: 400, text: 'TOKEN_REVOKED' });
    const device = createDevice();

    await device.onInit();

    expect(device.__available).toBe(false);
    expect(device.__unavailableMessage).toBe('Ohme auth refresh error: TOKEN_REVOKED');
    expect(device.__listeners).toEqual({});
  });

  it('asks for re-pairing when there is neither a refresh token nor a password', async () => {
    const device = createDevice({ store: { refreshToken: null } });

    await device.onInit();

    expect(device.__unavailableMessage).toBe('No refresh token or password available – please re-pair the device');
    expect(fm.fetch).not.toHaveBeenCalled();
  });

  it('keeps polling after a failed start so the device can recover', async () => {
    fm.on('POST', REFRESH_ROUTE, { status: 503, text: 'unavailable' });
    const device = createDevice();

    await device.onInit();

    expect(device.homey.timeouts).toHaveLength(1);
    expect(device.homey.intervals).toHaveLength(1);
  });
});

// ── Capability updates ───────────────────────────────────────────────

describe('capability updates', () => {
  it('shows paused and skips voltage when unplugged', async () => {
    const device = await initialisedDevice(undefined, chargeSession({
      mode: 'DISCONNECTED', power: undefined, appliedRule: undefined,
    }));

    expect(device.__values.charge_mode).toBe('paused');
    expect(device.__values.charger_status).toBe('unplugged');
    expect(device.__values.evcharger_charging).toBe(false);
    expect(device.__values).not.toHaveProperty('measure_voltage');
  });

  it('fires the status trigger only when the status changes', async () => {
    const device = await initialisedDevice();
    const trigger = device.homey.cards.trigger.get('charger_status_changed');
    expect(trigger?.trigger ?? vi.fn()).not.toHaveBeenCalled();

    await device.pollSession();
    expect(device.homey.flow.getTriggerCard).not.toHaveBeenCalled();

    fm.once('GET', SESSIONS, { json: [chargeSession({ mode: 'STOPPED' })] });
    await device.pollSession();

    const card = device.homey.cards.trigger.get('charger_status_changed')!;
    expect(card.trigger).toHaveBeenCalledTimes(1);
    expect(card.trigger).toHaveBeenCalledWith({ status: 'paused' }, { status: 'paused' });
  });

  it('logs trigger failures instead of throwing', async () => {
    const device = await initialisedDevice();
    const card = device.homey.flow.getTriggerCard('charger_status_changed');
    card.trigger.mockRejectedValue(new Error('flow engine down'));
    device.homey.flow.getTriggerCard.mockClear();
    fm.once('GET', SESSIONS, { json: [chargeSession({ mode: 'STOPPED' })] });

    await expect(device.pollSession()).resolves.toBeUndefined();
    await flushPromises();

    expect(device.error).toHaveBeenCalledWith('Failed to trigger charger_status_changed', expect.any(Error));
  });

  it('logs capability write failures instead of throwing', async () => {
    const device = await initialisedDevice();
    device.setCapabilityValue = vi.fn().mockRejectedValue(new Error('invalid value'));

    await device.pollSession();
    await flushPromises();

    expect(device.error).toHaveBeenCalledWith('Failed to set capability charger_status', expect.any(Error));
  });

  it('logs capability writes that throw synchronously', async () => {
    const device = await initialisedDevice();
    device.setCapabilityValue = vi.fn(() => {
      throw new Error('sync failure');
    });

    await device.pollSession();

    expect(device.error).toHaveBeenCalledWith('Failed to set capability charger_status', expect.any(Error));
  });
});

// ── Polling ──────────────────────────────────────────────────────────

describe('session polling', () => {
  it('runs pollSession when the timer fires', async () => {
    const device = await initialisedDevice();
    const poll = vi.spyOn(device as any, 'pollSession').mockResolvedValue(undefined);

    device.homey.timeouts[0].callback();

    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('reschedules at the regular interval after a successful poll', async () => {
    const device = await initialisedDevice();
    device.homey.timeouts.length = 0;

    await device.pollSession();

    expect(device.homey.timeouts.map((t) => t.ms)).toEqual([30 * 1000]);
    expect(device.__store.refreshToken).toBe('refresh-token-refreshed');
  });

  it('marks the device unavailable when the charger is offline', async () => {
    const device = await initialisedDevice();
    fm.once('GET', SESSIONS, { json: [chargeSession({ chargerStatus: { online: false } })] });

    await device.pollSession();

    expect(device.__unavailableMessage).toBe('Charger offline');
  });

  it('backs off exponentially on failures, capped at 5 minutes, and resets on success', async () => {
    const device = await initialisedDevice();
    device.homey.timeouts.length = 0;
    for (let i = 0; i < 5; i++) fm.once('GET', SESSIONS, { status: 500, text: 'error' });

    for (let i = 0; i < 5; i++) await device.pollSession();
    await device.pollSession();

    expect(device.homey.timeouts.map((t) => t.ms / 1000)).toEqual([60, 120, 240, 300, 300, 30]);
    expect(device.__unavailableMessage).toBe(null);
  });

  it('marks the device unavailable after a failed poll', async () => {
    const device = await initialisedDevice();
    fm.once('GET', SESSIONS, { status: 500, text: 'error' });

    await device.pollSession();

    expect(device.__unavailableMessage).toBe('Connection error');
  });

  it('keeps polling when marking the device unavailable also fails', async () => {
    const device = await initialisedDevice();
    device.homey.timeouts.length = 0;
    fm.once('GET', SESSIONS, { status: 500, text: 'error' });
    device.setUnavailable = vi.fn().mockRejectedValue(new Error('homey busy'));

    await expect(device.pollSession()).resolves.toBeUndefined();

    expect(device.homey.timeouts).toHaveLength(1);
    expect(device.error).toHaveBeenCalledWith('Failed to mark device unavailable', expect.any(Error));
  });

  it('logs unexpected errors from the scheduled poll', async () => {
    const device = await initialisedDevice();
    vi.spyOn(device as any, 'pollSession').mockRejectedValue(new Error('boom'));

    device.homey.timeouts[0].callback();
    await flushPromises();

    expect(device.error).toHaveBeenCalledWith('Session poll failed unexpectedly', expect.any(Error));
  });
});

describe('device info polling', () => {
  it('refreshes configuration capabilities when the interval fires', async () => {
    const device = await initialisedDevice();
    fm.once('GET', ACCOUNT, {
      json: accountInfo({ chargeDevices: [chargeDevice({ optionalSettings: { buttonsLocked: true } })] }),
    });

    device.homey.intervals[0].callback();
    await vi.waitFor(() => expect(device.__values.lock_buttons).toBe(true));
  });

  it('logs failures', async () => {
    const device = await initialisedDevice();
    fm.once('GET', ACCOUNT, { status: 500, text: 'error' });

    device.homey.intervals[0].callback();

    await vi.waitFor(() => expect(device.error).toHaveBeenCalledWith('Device info poll failed', expect.any(Error)));
  });
});

// ── Capability listeners ─────────────────────────────────────────────

describe('capability listeners', () => {
  const MAX_CHARGE_ON = `/v2/charge-devices/${SERIAL}/charge-sessions/active/${SERIAL}/max-charge?enabled=true`;

  it('charge_mode sets the mode', async () => {
    const device = await initialisedDevice();
    fm.on('PUT', MAX_CHARGE_ON);

    await device.__listeners.charge_mode('max_charge');

    expect(fm.callsTo('PUT', MAX_CHARGE_ON)).toHaveLength(1);
  });

  it('charge_mode refuses while unplugged', async () => {
    const device = await initialisedDevice(undefined, chargeSession({ mode: 'DISCONNECTED' }));

    await expect(device.__listeners.charge_mode('max_charge')).rejects.toThrow('Cannot change charge mode while unplugged');
  });

  it('evcharger_charging on resumes, off pauses', async () => {
    const device = await initialisedDevice();
    fm.on('POST', `/v1/chargeSessions/${SERIAL}/resume`, { text: 'OK' });
    fm.on('POST', `/v1/chargeSessions/${SERIAL}/stop`, { text: 'OK' });
    fm.calls.length = 0;

    await device.__listeners.evcharger_charging(true);
    await device.__listeners.evcharger_charging(false);

    expect(fm.calls.map((c) => c.route)).toEqual([
      `/v1/chargeSessions/${SERIAL}/resume`,
      `/v1/chargeSessions/${SERIAL}/stop`,
    ]);
  });

  it('evcharger_charging refuses to start while unplugged', async () => {
    const device = await initialisedDevice(undefined, chargeSession({ mode: 'DISCONNECTED' }));

    await expect(device.__listeners.evcharger_charging(true)).rejects.toThrow('Cannot start charging while unplugged');
  });

  it('target_percentage patches the charge rule', async () => {
    const device = await initialisedDevice();
    fm.on('PATCH', APPLIED_RULE);

    await device.__listeners.target_percentage(65);

    expect(fm.callsTo('PATCH', APPLIED_RULE)[0].body).toEqual({ targetPercent: 65 });
  });

  it('target_percentage fails when there is no rule', async () => {
    fm.on('POST', REFRESH_ROUTE, { json: refreshResponse() });
    fm.on('GET', ACCOUNT, { json: accountInfo() });
    fm.on('GET', SESSIONS, { json: [chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined })] });
    fm.on('GET', NEXT_SESSION, { json: {} });
    const device = createDevice();
    await device.onInit();

    await expect(device.__listeners.target_percentage(65)).rejects.toThrow('No active charge session or rule found');
  });

  it('preconditioning_duration parses the minutes', async () => {
    const device = await initialisedDevice();
    fm.on('PATCH', APPLIED_RULE);

    await device.__listeners.preconditioning_duration('30');

    expect(fm.callsTo('PATCH', APPLIED_RULE)[0].body).toEqual({
      preconditioning: { enabled: true, lengthMins: 30, temperature: null },
    });
  });

  it('preconditioning_duration fails when there is no rule', async () => {
    fm.on('POST', REFRESH_ROUTE, { json: refreshResponse() });
    fm.on('GET', ACCOUNT, { json: accountInfo() });
    fm.on('GET', SESSIONS, { json: [chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined })] });
    fm.on('GET', NEXT_SESSION, { json: {} });
    const device = createDevice();
    await device.onInit();

    await expect(device.__listeners.preconditioning_duration('30')).rejects.toThrow('No active charge session or rule found');
  });

  it('price_cap_enabled toggles the price cap', async () => {
    const device = await initialisedDevice();
    fm.on('GET', SETTINGS, { json: userSettings() });
    fm.on('PUT', SETTINGS);

    await device.__listeners.price_cap_enabled(true);

    expect(fm.callsTo('PUT', SETTINGS)[0].body).toEqual({ chargeSettings: [{ enabled: true, value: 20 }] });
  });

  it.each([
    ['lock_buttons', { buttonsLocked: true }],
    ['require_approval', { pluginsRequireApproval: true }],
    ['sleep_when_inactive', { stealthEnabled: true }],
  ])('%s writes the charger setting', async (capability, body) => {
    const device = await initialisedDevice();
    const route = `/v1/chargeDevices/${SERIAL}/appSettings`;
    fm.on('PUT', route);

    await device.__listeners[capability](true);

    expect(fm.callsTo('PUT', route)[0].body).toEqual(body);
  });
});

// ── Public API ───────────────────────────────────────────────────────

describe('setVehicleSoc', () => {
  it('refreshes the account, sets the level on the selected car, then re-reads the session', async () => {
    const device = await initialisedDevice();
    fm.calls.length = 0;
    fm.once('GET', ACCOUNT, { json: accountInfo({ cars: [vehicle({ id: 'car-now-selected' })] }) });
    fm.on('PUT', '/v1/car/car-now-selected/state-of-charge');
    fm.once('GET', SESSIONS, { json: [chargeSession({ car: { batterySoc: { percent: 42 } } })] });

    await device.setVehicleSoc(42);

    expect(fm.calls.map((c) => `${c.method} ${c.route}`)).toEqual([
      `GET ${ACCOUNT}`,
      'PUT /v1/car/car-now-selected/state-of-charge',
      `GET ${SESSIONS}`,
      `GET ${NEXT_SESSION}`,
    ]);
    expect(device.__values.measure_battery).toBe(42);
  });
});

describe('getApi', () => {
  it('returns the API client', async () => {
    const device = await initialisedDevice();
    expect(device.getApi().serial).toBe(SERIAL);
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────

describe('lifecycle', () => {
  it.each(['onUninit', 'onDeleted'] as const)('%s clears both timers and stops future polls', async (hook) => {
    const device = await initialisedDevice();
    const [timeout] = device.homey.timeouts;
    const [interval] = device.homey.intervals;
    fm.calls.length = 0;

    await device[hook]();
    await device.pollSession();

    expect(device.homey.clearTimeout).toHaveBeenCalledWith(timeout);
    expect(device.homey.clearInterval).toHaveBeenCalledWith(interval);
    expect(fm.calls).toHaveLength(0);
    expect(device.homey.timeouts).toHaveLength(1);
  });
});
