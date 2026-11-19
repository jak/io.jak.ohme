import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';
import { setTimeout as sleep } from 'timers/promises';
import { OhmeApi, ApiException, AuthException } from '../lib/OhmeApi';
import { ChargerMode, ChargerStatus } from '../lib/types';
import {
  installFetchMock, FetchMock, LOGIN_ROUTE, REFRESH_ROUTE,
} from './helpers/fetchMock';
import {
  SERIAL, OTHER_SERIAL, loginResponse, refreshResponse, accountInfo, chargeDevice, chargeSession,
  chargeRule, nextSessionInfo, userSettings, vehicle,
} from './fixtures/ohme';

vi.mock('timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));

const EMAIL = 'user@example.test';
const SESSIONS = '/v1/chargeSessions';
const NEXT_SESSION = '/v1/chargeSessions/nextSessionInfo';
const ACCOUNT = '/v1/users/me/account';
const SETTINGS = '/v1/users/me/settings';
const TOKEN_MAX_AGE_MS = 45 * 60 * 1000;

let fm: FetchMock;

beforeEach(() => {
  fm = installFetchMock();
  vi.mocked(sleep).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function loggedInApi(): Promise<OhmeApi> {
  fm.once('POST', LOGIN_ROUTE, { json: loginResponse() });
  const api = new OhmeApi(EMAIL, 'secret');
  await api.login();
  api.serial = SERIAL;
  fm.calls.length = 0;
  fm.fetch.mockClear();
  return api;
}

function mockSession(session = chargeSession(), next = nextSessionInfo()) {
  fm.on('GET', SESSIONS, { json: [session] });
  fm.on('GET', NEXT_SESSION, { json: next });
}

// ── Errors ───────────────────────────────────────────────────────────

describe('exceptions', () => {
  it('AuthException is an ApiException with its own name', () => {
    const err = new AuthException('nope');
    expect(err).toBeInstanceOf(ApiException);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AuthException');
    expect(new ApiException('x').name).toBe('ApiException');
  });
});

// ── Auth ─────────────────────────────────────────────────────────────

describe('OhmeApi.login', () => {
  it('posts the credentials and stores both tokens', async () => {
    fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
    const api = new OhmeApi(EMAIL, 'secret');

    await expect(api.login()).resolves.toBe(true);

    const [call] = fm.calls;
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.body).toEqual({ email: EMAIL, password: 'secret', returnSecureToken: true });
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect(api.refreshTokenValue).toBe('refresh-token-login');
  });

  it('uses the login id token for API requests', async () => {
    const api = await loggedInApi();
    mockSession();

    await api.getChargeSession();

    expect(fm.callsTo('GET', SESSIONS)[0].headers.Authorization).toBe('Firebase id-token-login');
  });

  it('throws AuthException on a non-200 response', async () => {
    fm.on('POST', LOGIN_ROUTE, { status: 400, json: { error: 'INVALID_PASSWORD' } });
    const api = new OhmeApi(EMAIL, 'wrong');

    await expect(api.login()).rejects.toThrow(new AuthException('Incorrect credentials'));
  });

  it('throws AuthException without calling the network when there is no password', async () => {
    const api = new OhmeApi(EMAIL);

    await expect(api.login()).rejects.toBeInstanceOf(AuthException);
    expect(fm.fetch).not.toHaveBeenCalled();
  });
});

describe('OhmeApi.refreshSession', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('does not refresh while the token is younger than 45 minutes', async () => {
    const api = await loggedInApi();
    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS - 1);

    await expect(api.refreshSession()).resolves.toBe(true);
    expect(fm.fetch).not.toHaveBeenCalled();
  });

  it('exchanges the refresh token once the token is 45 minutes old', async () => {
    const api = await loggedInApi();
    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS);
    fm.once('POST', REFRESH_ROUTE, { json: refreshResponse() });

    await expect(api.refreshSession()).resolves.toBe(true);

    const [call] = fm.callsTo('POST', REFRESH_ROUTE);
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(call.body).toEqual({ grant_type: 'refresh_token', refresh_token: 'refresh-token-login' });
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect(api.refreshTokenValue).toBe('refresh-token-refreshed');
  });

  it('uses the refreshed id token for the request that triggered the refresh', async () => {
    const api = await loggedInApi();
    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS);
    fm.once('POST', REFRESH_ROUTE, { json: refreshResponse() });
    mockSession();

    await api.getChargeSession();

    expect(fm.calls[0].route).toBe(REFRESH_ROUTE);
    expect(fm.callsTo('GET', SESSIONS)[0].headers.Authorization).toBe('Firebase id-token-refreshed');
  });

  it('resets the 45 minute window after a refresh', async () => {
    const api = await loggedInApi();
    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS);
    fm.once('POST', REFRESH_ROUTE, { json: refreshResponse() });
    await api.refreshSession();

    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS - 1);
    await api.refreshSession();

    expect(fm.callsTo('POST', REFRESH_ROUTE)).toHaveLength(1);
  });

  it('throws AuthException with the response text when the refresh fails', async () => {
    const api = await loggedInApi();
    vi.setSystemTime(Date.now() + TOKEN_MAX_AGE_MS);
    fm.on('POST', REFRESH_ROUTE, { status: 400, text: 'TOKEN_EXPIRED' });

    await expect(api.refreshSession()).rejects.toThrow(new AuthException('Ohme auth refresh error: TOKEN_EXPIRED'));
  });

  it('logs in when there is no token yet but a password is available', async () => {
    fm.on('POST', LOGIN_ROUTE, { json: loginResponse() });
    const api = new OhmeApi(EMAIL, 'secret');

    await expect(api.refreshSession()).resolves.toBe(true);
    expect(fm.callsTo('POST', LOGIN_ROUTE)).toHaveLength(1);
  });

  it('throws AuthException when there is neither a token nor a password', async () => {
    const api = new OhmeApi(EMAIL);

    await expect(api.refreshSession()).rejects.toThrow(/re-pair/);
    expect(fm.fetch).not.toHaveBeenCalled();
  });
});

describe('OhmeApi.initFromRefreshToken', () => {
  it('exchanges the stored refresh token immediately', async () => {
    fm.on('POST', REFRESH_ROUTE, { json: refreshResponse() });
    const api = new OhmeApi(EMAIL);

    await expect(api.initFromRefreshToken('stored-refresh-token')).resolves.toBe(true);

    expect(fm.callsTo('POST', REFRESH_ROUTE)[0].body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'stored-refresh-token',
    });
    expect(fm.callsTo('POST', LOGIN_ROUTE)).toHaveLength(0);
    expect(api.refreshTokenValue).toBe('refresh-token-refreshed');
  });

  it('rejects when the stored token is revoked', async () => {
    fm.on('POST', REFRESH_ROUTE, { status: 400, text: 'TOKEN_REVOKED' });
    const api = new OhmeApi(EMAIL);

    await expect(api.initFromRefreshToken('revoked')).rejects.toBeInstanceOf(AuthException);
  });
});

describe('OhmeApi.refreshTokenValue', () => {
  it('can be set directly', () => {
    const api = new OhmeApi(EMAIL);
    api.refreshTokenValue = 'manual';
    expect(api.refreshTokenValue).toBe('manual');
  });
});

// ── Requests ─────────────────────────────────────────────────────────

describe('API requests', () => {
  it('sends GET requests to api.ohme.io with auth and JSON headers but no body', async () => {
    const api = await loggedInApi();
    mockSession();

    await api.getChargeSession();

    const [call] = fm.callsTo('GET', SESSIONS);
    expect(call.url).toBe('https://api.ohme.io/v1/chargeSessions');
    expect(call.headers).toEqual({ Authorization: 'Firebase id-token-login', 'Content-Type': 'application/json' });
    expect(call.body).toBeUndefined();
    expect(call.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws ApiException with the URL, status and body on a non-200 response', async () => {
    const api = await loggedInApi();
    fm.on('GET', SESSIONS, { status: 503, text: 'maintenance' });

    await expect(api.getChargeSession()).rejects.toThrow(
      new ApiException('Ohme API response error: https://api.ohme.io/v1/chargeSessions, 503; maintenance'),
    );
  });

  it('propagates network errors such as timeouts', async () => {
    const api = await loggedInApi();
    fm.on('GET', SESSIONS, () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    await expect(api.getChargeSession()).rejects.toThrow(/timeout/);
  });

  it('does not parse the body of PUT responses', async () => {
    const api = await loggedInApi();
    fm.on('PUT', `/v1/chargeSessions/${SERIAL}/approve?approve=true`, { text: '' });

    await expect(api.approveCharge()).resolves.toBe(true);
  });
});

// ── getChargeSession ─────────────────────────────────────────────────

describe('OhmeApi.getChargeSession', () => {
  it('reads power, status, rule, battery and availability from the session', async () => {
    const api = await loggedInApi();
    mockSession();

    await api.getChargeSession();

    expect(api.status).toBe(ChargerStatus.CHARGING);
    expect(api.mode).toBe(ChargerMode.SMART_CHARGE);
    expect(api.power).toBe(7200);
    expect(api.current).toBe(31.3);
    expect(api.voltage).toBe(230);
    expect(api.available).toBe(true);
    expect(api.energy).toBe(12000);
    expect(api.battery).toBe(60);
    expect(api.targetSoc).toBe(80);
    expect(api.targetTimeFormatted).toBe('07:30');
  });

  it('treats an empty session list as unplugged and offline', async () => {
    const api = await loggedInApi();
    fm.on('GET', SESSIONS, { json: [] });

    await api.getChargeSession();

    expect(api.status).toBe(ChargerStatus.UNPLUGGED);
    expect(api.available).toBe(false);
    expect(fm.callsTo('GET', NEXT_SESSION)).toHaveLength(0);
  });

  it('treats a null session list as unplugged', async () => {
    const api = await loggedInApi();
    fm.on('GET', SESSIONS, { json: null });

    await api.getChargeSession();

    expect(api.status).toBe(ChargerStatus.UNPLUGGED);
  });

  it('is offline when the charger status is missing or offline', async () => {
    const api = await loggedInApi();
    fm.once('GET', SESSIONS, { json: [chargeSession({ chargerStatus: undefined })] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ chargerStatus: { online: false } })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();
    expect(api.available).toBe(false);

    await api.getChargeSession();
    expect(api.available).toBe(false);
  });

  it('retries while Ohme is still calculating the session', async () => {
    const api = await loggedInApi();
    fm.once('GET', SESSIONS, { json: [chargeSession({ mode: 'CALCULATING' })] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ mode: 'MAX_CHARGE' })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();

    expect(fm.callsTo('GET', SESSIONS)).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(api.mode).toBe(ChargerMode.MAX_CHARGE);
  });

  it('gives up after three attempts and keeps the last session', async () => {
    const api = await loggedInApi();
    mockSession(chargeSession({ mode: 'DELIVERING' }));

    await api.getChargeSession();

    expect(fm.callsTo('GET', SESSIONS)).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(api.status).toBe(ChargerStatus.CHARGING);
  });

  it('falls back to the session battery level, then 0', async () => {
    const api = await loggedInApi();
    fm.once('GET', SESSIONS, { json: [chargeSession({ car: undefined })] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ car: undefined, batterySoc: undefined })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();
    expect(api.battery).toBe(55);

    await api.getChargeSession();
    expect(api.battery).toBe(0);
  });

  it('never lets the energy reading go down while connected', async () => {
    const api = await loggedInApi();
    fm.once('GET', SESSIONS, { json: [chargeSession({ batterySoc: { wh: 5000, percent: 40 } })] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ batterySoc: { wh: 3000, percent: 41 } })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();
    await api.getChargeSession();

    expect(api.energy).toBe(5000);
  });

  it('treats a battery reading without energy as 0 Wh', async () => {
    const api = await loggedInApi();
    mockSession(chargeSession({ batterySoc: { percent: 50 } as never }));

    await api.getChargeSession();

    expect(api.energy).toBe(0);
  });

  it('treats preconditioning without a length as 0 minutes', async () => {
    const api = await loggedInApi();
    mockSession(chargeSession({ appliedRule: chargeRule({ preconditioningEnabled: true, preconditionLengthMins: undefined }) }));

    await api.getChargeSession();

    expect(api.preconditioning).toBe(0);
  });

  it('resets energy to 0 when the car is unplugged', async () => {
    const api = await loggedInApi();
    fm.once('GET', SESSIONS, { json: [chargeSession()] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ mode: 'DISCONNECTED' })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();
    await api.getChargeSession();

    expect(api.energy).toBe(0);
  });

  it('uses the next session rule when unplugged', async () => {
    const api = await loggedInApi();
    mockSession(
      chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined }),
      nextSessionInfo({ id: 'rule-next', targetPercent: 90, targetTime: 6 * 3600 + 15 * 60 }),
    );

    await api.getChargeSession();

    expect(api.targetSoc).toBe(90);
    expect(api.targetTimeFormatted).toBe('06:15');
  });

  it('handles a next-session response without a rule', async () => {
    const api = await loggedInApi();
    mockSession(chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined }), {});

    await api.getChargeSession();

    expect(api.targetSoc).toBe(0);
    expect(api.targetTimeFormatted).toBe('00:00');
  });

  it('remembers the last applied rule for preconditioning after it disappears', async () => {
    const api = await loggedInApi();
    const rule = chargeRule({ preconditioningEnabled: true, preconditionLengthMins: 30 });
    fm.once('GET', SESSIONS, { json: [chargeSession({ appliedRule: rule })] });
    fm.once('GET', SESSIONS, { json: [chargeSession({ appliedRule: undefined })] });
    fm.on('GET', NEXT_SESSION, { json: nextSessionInfo() });

    await api.getChargeSession();
    await api.getChargeSession();

    expect(api.preconditioning).toBe(30);
  });

  it('reads preconditioning from the next session when unplugged', async () => {
    const api = await loggedInApi();
    mockSession(
      chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined }),
      nextSessionInfo({ id: 'rule-next', preconditioningEnabled: true, preconditionLengthMins: 45 }),
    );

    await api.getChargeSession();

    expect(api.preconditioning).toBe(45);
  });
});

// ── updateDeviceInfo ─────────────────────────────────────────────────

describe('OhmeApi.updateDeviceInfo', () => {
  it('loads the charger matching the serial, plus cars and settings', async () => {
    const api = await loggedInApi();
    const other = chargeDevice({ id: OTHER_SERIAL, modelTypeDisplayName: 'Ohme ePod' });
    fm.on('GET', ACCOUNT, { json: accountInfo({ chargeDevices: [other, chargeDevice()] }) });

    await expect(api.updateDeviceInfo()).resolves.toBe(true);

    expect(api.serial).toBe(SERIAL);
    expect(api.deviceInfo).toEqual({
      name: 'Ohme Home Pro', model: 'Home Pro', swVersion: 'v1.2.3', serial: SERIAL,
    });
    expect(api.isCapable('buttonsLockable')).toBe(true);
    expect(api.configurationBoolean('pluginsRequireApproval')).toBe(true);
    expect(api.vehicles).toEqual([vehicle()]);
    expect(api.chargeDevices).toHaveLength(2);
    expect(api.capEnabled).toBe(true);
    expect(api.capAvailable).toBe(true);
  });

  it('falls back to the first charger when none matches the serial', async () => {
    const api = await loggedInApi();
    api.serial = 'unknown';
    fm.on('GET', ACCOUNT, { json: accountInfo({ chargeDevices: [chargeDevice({ id: OTHER_SERIAL })] }) });

    await api.updateDeviceInfo();

    expect(api.serial).toBe(OTHER_SERIAL);
  });

  it('throws ApiException when the account has no chargers', async () => {
    const api = await loggedInApi();
    fm.on('GET', ACCOUNT, { json: accountInfo({ chargeDevices: [] }) });

    await expect(api.updateDeviceInfo()).rejects.toThrow(new ApiException('No charge devices found on account'));
  });

  it('throws ApiException when the response has no charger list', async () => {
    const api = await loggedInApi();
    const info: Record<string, unknown> = { ...accountInfo() };
    delete info.chargeDevices;
    fm.on('GET', ACCOUNT, { json: info });

    await expect(api.updateDeviceInfo()).rejects.toThrow('No charge devices found on account');
    expect(api.chargeDevices).toEqual([]);
  });

  it('tolerates missing user settings and cars', async () => {
    const api = await loggedInApi();
    const info: Record<string, unknown> = { ...accountInfo() };
    delete info.userSettings;
    delete info.cars;
    fm.on('GET', ACCOUNT, { json: info });

    await expect(api.updateDeviceInfo()).resolves.toBe(true);
    expect(api.capEnabled).toBe(false);
    expect(api.vehicles).toEqual([]);
  });

  it('marks the price cap unavailable on a DSR tariff', async () => {
    const api = await loggedInApi();
    fm.on('GET', ACCOUNT, { json: accountInfo({ tariff: { dsrTariff: true } }) });

    await api.updateDeviceInfo();

    expect(api.capAvailable).toBe(false);
  });
});

// ── Commands ─────────────────────────────────────────────────────────

describe('commands', () => {
  let api: OhmeApi;

  beforeEach(async () => {
    api = await loggedInApi();
  });

  describe('setMode', () => {
    it('enables max charge', async () => {
      const route = `/v2/charge-devices/${SERIAL}/charge-sessions/active/${SERIAL}/max-charge?enabled=true`;
      fm.on('PUT', route);

      await api.setMode(ChargerMode.MAX_CHARGE);

      expect(fm.callsTo('PUT', route)).toHaveLength(1);
    });

    it('switches to smart charge by disabling max charge', async () => {
      const route = `/v2/charge-devices/${SERIAL}/charge-sessions/active/${SERIAL}/max-charge?enabled=false`;
      fm.on('PUT', route);

      await api.setMode(ChargerMode.SMART_CHARGE);

      expect(fm.callsTo('PUT', route)).toHaveLength(1);
    });

    it('pauses by stopping the session', async () => {
      const route = `/v1/chargeSessions/${SERIAL}/stop`;
      fm.on('POST', route, { text: 'OK' });

      await api.setMode(ChargerMode.PAUSED);

      expect(fm.callsTo('POST', route)[0].body).toBeUndefined();
    });
  });

  it('resumeCharge posts to the resume endpoint', async () => {
    const route = `/v1/chargeSessions/${SERIAL}/resume`;
    fm.on('POST', route, { text: 'OK' });

    await expect(api.resumeCharge()).resolves.toBe(true);
    expect(fm.callsTo('POST', route)).toHaveLength(1);
  });

  it('approveCharge approves the session', async () => {
    const route = `/v1/chargeSessions/${SERIAL}/approve?approve=true`;
    fm.on('PUT', route);

    await expect(api.approveCharge()).resolves.toBe(true);
    expect(fm.callsTo('PUT', route)).toHaveLength(1);
  });

  describe('setTarget', () => {
    const appliedRoute = '/v2/users/me/charge-rules/rule-applied?persist=true&recalculateSession=true';

    beforeEach(async () => {
      mockSession();
      await api.getChargeSession();
      fm.on('PATCH', appliedRoute);
    });

    it('patches the target percentage on the applied rule', async () => {
      await expect(api.setTarget({ targetPercent: 70 })).resolves.toBe(true);
      expect(fm.callsTo('PATCH', appliedRoute)[0].body).toEqual({ targetPercent: 70 });
    });

    it('converts the target time to seconds after midnight', async () => {
      await api.setTarget({ targetTime: [7, 45] });
      expect(fm.callsTo('PATCH', appliedRoute)[0].body).toEqual({ targetTime: 7 * 3600 + 45 * 60 });
    });

    it('enables preconditioning for a positive length', async () => {
      await api.setTarget({ preconditionLength: 30 });
      expect(fm.callsTo('PATCH', appliedRoute)[0].body).toEqual({
        preconditioning: { enabled: true, lengthMins: 30, temperature: null },
      });
    });

    it('disables preconditioning for a length of 0', async () => {
      await api.setTarget({ preconditionLength: 0 });
      expect(fm.callsTo('PATCH', appliedRoute)[0].body).toEqual({
        preconditioning: { enabled: false, lengthMins: 15, temperature: null },
      });
    });

    it('sends several fields at once', async () => {
      await api.setTarget({ targetPercent: 90, targetTime: [6, 0] });
      expect(fm.callsTo('PATCH', appliedRoute)[0].body).toEqual({ targetPercent: 90, targetTime: 6 * 3600 });
    });
  });

  it('setTarget uses the next session rule when no rule has been applied', async () => {
    mockSession(chargeSession({ mode: 'DISCONNECTED', appliedRule: undefined }));
    await api.getChargeSession();
    const route = '/v2/users/me/charge-rules/rule-next?persist=true&recalculateSession=true';
    fm.on('PATCH', route);

    await expect(api.setTarget({ targetPercent: 50 })).resolves.toBe(true);
    expect(fm.callsTo('PATCH', route)).toHaveLength(1);
  });

  it('setTarget returns false without a request when there is no rule', async () => {
    await expect(api.setTarget({ targetPercent: 50 })).resolves.toBe(false);
    expect(fm.fetch).not.toHaveBeenCalled();
  });

  it('setConfigurationValue puts the settings to the charger', async () => {
    const route = `/v1/chargeDevices/${SERIAL}/appSettings`;
    fm.on('PUT', route);

    await expect(api.setConfigurationValue({ buttonsLocked: true })).resolves.toBe(true);
    expect(fm.callsTo('PUT', route)[0].body).toEqual({ buttonsLocked: true });
  });

  it('setPriceCap toggles the cap and keeps the current value', async () => {
    fm.on('GET', SETTINGS, { json: userSettings({ chargeSettings: [{ enabled: false, value: 18 }] }) });
    fm.on('PUT', SETTINGS);

    await expect(api.setPriceCap(true)).resolves.toBe(true);
    expect(fm.callsTo('PUT', SETTINGS)[0].body).toEqual({ chargeSettings: [{ enabled: true, value: 18 }] });
  });

  it('setPriceCapValue enables the cap with the new value', async () => {
    fm.on('GET', SETTINGS, { json: userSettings() });
    fm.on('PUT', SETTINGS);

    await expect(api.setPriceCapValue(12.5)).resolves.toBe(true);
    expect(fm.callsTo('PUT', SETTINGS)[0].body).toEqual({ chargeSettings: [{ enabled: true, value: 12.5 }] });
  });

  it('selectVehicle selects the car', async () => {
    const route = '/v1/car/car-2/select';
    fm.on('PUT', route);

    await expect(api.selectVehicle('car-2')).resolves.toBe(true);
    expect(fm.callsTo('PUT', route)).toHaveLength(1);
  });

  it('setStateOfCharge puts the percentage to the first car on the account', async () => {
    fm.on('GET', ACCOUNT, { json: accountInfo({ cars: [vehicle({ id: 'car-9' }), vehicle({ id: 'car-1' })] }) });
    await api.updateDeviceInfo();
    const route = '/v1/car/car-9/state-of-charge';
    fm.on('PUT', route);

    await expect(api.setStateOfCharge(64)).resolves.toBe(true);
    expect(fm.callsTo('PUT', route)[0].body).toEqual({ currentChargePercent: 64 });
  });
});
