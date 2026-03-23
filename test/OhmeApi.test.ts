import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OhmeApi, AuthException } from '../lib/OhmeApi';
import { ChargerStatus, ChargerMode } from '../lib/types';

// Mock fetch globally to prevent any real network calls
vi.stubGlobal('fetch', vi.fn());

function createApi(): OhmeApi {
  return new OhmeApi('test@example.com', 'password');
}

function setChargeSession(api: OhmeApi, session: any): void {
  (api as any)._chargeSession = session;
}

function setConfiguration(api: OhmeApi, config: Record<string, boolean | string>): void {
  (api as any)._configuration = config;
}

function setCapabilities(api: OhmeApi, caps: Record<string, boolean | string | string[]>): void {
  (api as any)._capabilities = caps;
}

function setNextSession(api: OhmeApi, rule: any): void {
  (api as any)._nextSession = rule;
}

function setLastRule(api: OhmeApi, rule: any): void {
  (api as any)._lastRule = rule;
}

// ── Constructor ──────────────────────────────────────────────────────

describe('OhmeApi constructor', () => {
  it('throws AuthException when email is empty', () => {
    expect(() => new OhmeApi('')).toThrow(AuthException);
  });

  it('accepts email without password', () => {
    const api = new OhmeApi('test@example.com');
    expect(api).toBeInstanceOf(OhmeApi);
  });
});

// ── Status getter ────────────────────────────────────────────────────

describe('OhmeApi.status', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns unplugged for DISCONNECTED', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.status).toBe(ChargerStatus.UNPLUGGED);
  });

  it('returns pending_approval for PENDING_APPROVAL', () => {
    setChargeSession(api, { mode: 'PENDING_APPROVAL' });
    expect(api.status).toBe(ChargerStatus.PENDING_APPROVAL);
  });

  it('returns paused for STOPPED', () => {
    setChargeSession(api, { mode: 'STOPPED' });
    expect(api.status).toBe(ChargerStatus.PAUSED);
  });

  it('returns finished for FINISHED_CHARGE', () => {
    setChargeSession(api, { mode: 'FINISHED_CHARGE' });
    expect(api.status).toBe(ChargerStatus.FINISHED);
  });

  it('returns charging when power > 0 and mode is not in API_MODE_TO_STATUS', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 7200, amp: 32, volt: 230 } });
    expect(api.status).toBe(ChargerStatus.CHARGING);
  });

  it('returns plugged_in when power is 0 and mode is not in API_MODE_TO_STATUS', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 0, amp: 0, volt: null } });
    expect(api.status).toBe(ChargerStatus.PLUGGED_IN);
  });

  it('returns plugged_in when no power data and mode is not in API_MODE_TO_STATUS', () => {
    setChargeSession(api, { mode: 'MAX_CHARGE' });
    expect(api.status).toBe(ChargerStatus.PLUGGED_IN);
  });
});

// ── Mode getter ──────────────────────────────────────────────────────

describe('OhmeApi.mode', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns smart_charge for SMART_CHARGE', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE' });
    expect(api.mode).toBe(ChargerMode.SMART_CHARGE);
  });

  it('returns max_charge for MAX_CHARGE', () => {
    setChargeSession(api, { mode: 'MAX_CHARGE' });
    expect(api.mode).toBe(ChargerMode.MAX_CHARGE);
  });

  it('returns paused for STOPPED', () => {
    setChargeSession(api, { mode: 'STOPPED' });
    expect(api.mode).toBe(ChargerMode.PAUSED);
  });

  it('returns null for unmapped modes', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.mode).toBeNull();
  });
});

// ── isConnected / isCharging ─────────────────────────────────────────

describe('OhmeApi.isConnected', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns false when UNPLUGGED (DISCONNECTED)', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.isConnected).toBe(false);
  });

  it('returns false when PENDING_APPROVAL', () => {
    setChargeSession(api, { mode: 'PENDING_APPROVAL' });
    expect(api.isConnected).toBe(false);
  });

  it('returns true when CHARGING', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 7200, amp: 32, volt: 230 } });
    expect(api.isConnected).toBe(true);
  });

  it('returns true when PLUGGED_IN', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 0, amp: 0, volt: null } });
    expect(api.isConnected).toBe(true);
  });

  it('returns true when PAUSED (STOPPED)', () => {
    setChargeSession(api, { mode: 'STOPPED' });
    expect(api.isConnected).toBe(true);
  });

  it('returns true when FINISHED', () => {
    setChargeSession(api, { mode: 'FINISHED_CHARGE' });
    expect(api.isConnected).toBe(true);
  });
});

describe('OhmeApi.isCharging', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns true when actively charging', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 7200, amp: 32, volt: 230 } });
    expect(api.isCharging).toBe(true);
  });

  it('returns false when plugged in but not charging', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 0, amp: 0, volt: null } });
    expect(api.isCharging).toBe(false);
  });

  it('returns false when disconnected', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.isCharging).toBe(false);
  });
});

// ── Slot merging ─────────────────────────────────────────────────────

describe('OhmeApi.slots', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns empty array when no session slots', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.slots).toEqual([]);
  });

  it('returns empty array when allSessionSlots is empty', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', allSessionSlots: [] });
    expect(api.slots).toEqual([]);
  });

  it('returns single slot correctly', () => {
    const start = new Date('2026-03-23T01:00:00Z').getTime();
    const end = new Date('2026-03-23T02:00:00Z').getTime();
    setChargeSession(api, {
      mode: 'SMART_CHARGE',
      allSessionSlots: [{ startTimeMs: start, endTimeMs: end, watts: 7200 }],
    });

    const slots = api.slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date(start));
    expect(slots[0].end).toEqual(new Date(end));
    expect(slots[0].energy).toBe(7.2); // 7200W * 1h / 1000
  });

  it('merges adjacent slots', () => {
    const t0 = new Date('2026-03-23T01:00:00Z').getTime();
    const t1 = new Date('2026-03-23T02:00:00Z').getTime();
    const t2 = new Date('2026-03-23T03:00:00Z').getTime();

    setChargeSession(api, {
      mode: 'SMART_CHARGE',
      allSessionSlots: [
        { startTimeMs: t0, endTimeMs: t1, watts: 7200 },
        { startTimeMs: t1, endTimeMs: t2, watts: 7200 },
      ],
    });

    const slots = api.slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date(t0));
    expect(slots[0].end).toEqual(new Date(t2));
    expect(slots[0].energy).toBe(14.4); // 7.2 + 7.2
  });

  it('does not merge non-adjacent slots', () => {
    const t0 = new Date('2026-03-23T01:00:00Z').getTime();
    const t1 = new Date('2026-03-23T02:00:00Z').getTime();
    const t2 = new Date('2026-03-23T04:00:00Z').getTime();
    const t3 = new Date('2026-03-23T05:00:00Z').getTime();

    setChargeSession(api, {
      mode: 'SMART_CHARGE',
      allSessionSlots: [
        { startTimeMs: t0, endTimeMs: t1, watts: 7200 },
        { startTimeMs: t2, endTimeMs: t3, watts: 3600 },
      ],
    });

    const slots = api.slots;
    expect(slots).toHaveLength(2);
    expect(slots[0].energy).toBe(7.2);
    expect(slots[1].energy).toBe(3.6);
  });

  it('merges multiple consecutive adjacent slots', () => {
    const t0 = new Date('2026-03-23T01:00:00Z').getTime();
    const t1 = new Date('2026-03-23T01:30:00Z').getTime();
    const t2 = new Date('2026-03-23T02:00:00Z').getTime();
    const t3 = new Date('2026-03-23T02:30:00Z').getTime();

    setChargeSession(api, {
      mode: 'SMART_CHARGE',
      allSessionSlots: [
        { startTimeMs: t0, endTimeMs: t1, watts: 7200 },
        { startTimeMs: t1, endTimeMs: t2, watts: 7200 },
        { startTimeMs: t2, endTimeMs: t3, watts: 7200 },
      ],
    });

    const slots = api.slots;
    expect(slots).toHaveLength(1);
    expect(slots[0].start).toEqual(new Date(t0));
    expect(slots[0].end).toEqual(new Date(t3));
    // 3 x 0.5h x 7200W / 1000 = 10.8
    expect(slots[0].energy).toBe(10.8);
  });
});

// ── Target time formatting ───────────────────────────────────────────

describe('OhmeApi.targetTimeFormatted', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('formats 0 seconds as 00:00', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 100, amp: 1, volt: 230 }, appliedRule: { targetTime: 0, targetPercent: 80 } });
    expect(api.targetTimeFormatted).toBe('00:00');
  });

  it('formats 3600 seconds as 01:00', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 100, amp: 1, volt: 230 }, appliedRule: { targetTime: 3600, targetPercent: 80 } });
    expect(api.targetTimeFormatted).toBe('01:00');
  });

  it('formats 5400 seconds as 01:30', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 100, amp: 1, volt: 230 }, appliedRule: { targetTime: 5400, targetPercent: 80 } });
    expect(api.targetTimeFormatted).toBe('01:30');
  });

  it('formats 86340 seconds as 23:59', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 100, amp: 1, volt: 230 }, appliedRule: { targetTime: 86340, targetPercent: 80 } });
    expect(api.targetTimeFormatted).toBe('23:59');
  });

  it('uses nextSession when disconnected', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    setNextSession(api, { targetTime: 25200, targetPercent: 80 });
    expect(api.targetTimeFormatted).toBe('07:00');
  });
});

// ── configurationValue / configurationBoolean / isCapable ────────────

describe('OhmeApi.configurationValue', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns boolean value as-is', () => {
    setConfiguration(api, { lockEnabled: true });
    expect(api.configurationValue('lockEnabled')).toBe(true);
  });

  it('returns string value as-is', () => {
    setConfiguration(api, { ledBrightness: 'high' });
    expect(api.configurationValue('ledBrightness')).toBe('high');
  });

  it('returns undefined for missing key', () => {
    setConfiguration(api, {});
    expect(api.configurationValue('nonexistent')).toBeUndefined();
  });
});

describe('OhmeApi.configurationBoolean', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns true for boolean true', () => {
    setConfiguration(api, { lockEnabled: true });
    expect(api.configurationBoolean('lockEnabled')).toBe(true);
  });

  it('returns false for boolean false', () => {
    setConfiguration(api, { lockEnabled: false });
    expect(api.configurationBoolean('lockEnabled')).toBe(false);
  });

  it('parses string "true" as true', () => {
    setConfiguration(api, { lockEnabled: 'true' });
    expect(api.configurationBoolean('lockEnabled')).toBe(true);
  });

  it('parses string "TRUE" as true (case insensitive)', () => {
    setConfiguration(api, { lockEnabled: 'TRUE' });
    expect(api.configurationBoolean('lockEnabled')).toBe(true);
  });

  it('parses string "false" as false', () => {
    setConfiguration(api, { lockEnabled: 'false' });
    expect(api.configurationBoolean('lockEnabled')).toBe(false);
  });

  it('returns false for missing key', () => {
    setConfiguration(api, {});
    expect(api.configurationBoolean('nonexistent')).toBe(false);
  });
});

describe('OhmeApi.isCapable', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns true for truthy capability', () => {
    setCapabilities(api, { solarBoost: true });
    expect(api.isCapable('solarBoost')).toBe(true);
  });

  it('returns false for falsy capability', () => {
    setCapabilities(api, { solarBoost: false });
    expect(api.isCapable('solarBoost')).toBe(false);
  });

  it('returns false for missing capability', () => {
    setCapabilities(api, {});
    expect(api.isCapable('nonexistent')).toBe(false);
  });
});

// ── Power / voltage / current getters ────────────────────────────────

describe('OhmeApi power getters', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns power from session', () => {
    setChargeSession(api, { mode: 'SMART_CHARGE', power: { watt: 7200, amp: 32, volt: 230 } });
    expect(api.power).toBe(7200);
    expect(api.current).toBe(32);
    expect(api.voltage).toBe(230);
  });

  it('returns 0/null when no power data', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    expect(api.power).toBe(0);
    expect(api.current).toBe(0);
    expect(api.voltage).toBeNull();
  });
});

// ── targetSoc ────────────────────────────────────────────────────────

describe('OhmeApi.targetSoc', () => {
  let api: OhmeApi;

  beforeEach(() => {
    api = createApi();
  });

  it('returns appliedRule targetPercent when connected', () => {
    setChargeSession(api, {
      mode: 'SMART_CHARGE',
      power: { watt: 100, amp: 1, volt: 230 },
      appliedRule: { targetPercent: 80, targetTime: 3600 },
    });
    expect(api.targetSoc).toBe(80);
  });

  it('returns suspendedRule targetPercent when paused', () => {
    setChargeSession(api, {
      mode: 'STOPPED',
      suspendedRule: { targetPercent: 90 },
    });
    expect(api.targetSoc).toBe(90);
  });

  it('returns nextSession targetPercent when disconnected', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    setNextSession(api, { targetPercent: 75 });
    expect(api.targetSoc).toBe(75);
  });

  it('returns 0 when no rule info available', () => {
    setChargeSession(api, { mode: 'DISCONNECTED' });
    setNextSession(api, {});
    expect(api.targetSoc).toBe(0);
  });
});
