/**
 * Hand-written Ohme API responses, shaped after lib/types.ts.
 * No real account data: all ids, tokens and values are made up.
 */
import type {
  AccountInfo,
  ChargeDevice,
  ChargeRule,
  ChargeSession,
  NextSessionInfo,
  UserSettings,
  Vehicle,
} from '../../lib/types';

export const SERIAL = 'TEST-SERIAL-0001';
export const OTHER_SERIAL = 'TEST-SERIAL-0002';

export function loginResponse(overrides: Partial<{ idToken: string; refreshToken: string }> = {}) {
  return { idToken: 'id-token-login', refreshToken: 'refresh-token-login', ...overrides };
}

export function refreshResponse(overrides: Partial<{ id_token: string; refresh_token: string }> = {}) {
  return { id_token: 'id-token-refreshed', refresh_token: 'refresh-token-refreshed', ...overrides };
}

export function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'car-1',
    name: 'Test Car',
    model: { brand: { name: 'Acme' }, modelName: 'Volt One' },
    ...overrides,
  };
}

export function chargeDevice(overrides: Partial<ChargeDevice> = {}): ChargeDevice {
  return {
    id: SERIAL,
    modelTypeDisplayName: 'Ohme Home Pro',
    firmwareVersionLabel: 'v1.2.3',
    modelCapabilities: { buttonsLockable: true, pluginsRequireApprovalMode: true },
    optionalSettings: { buttonsLocked: false, pluginsRequireApproval: 'true', stealthEnabled: false },
    ...overrides,
  };
}

export function accountInfo(overrides: Partial<AccountInfo> = {}): AccountInfo {
  return {
    cars: [vehicle()],
    chargeDevices: [chargeDevice()],
    userSettings: { chargeSettings: [{ enabled: true, value: 25 }] },
    tariff: { dsrTariff: false },
    ...overrides,
  };
}

export function chargeRule(overrides: Partial<ChargeRule> = {}): ChargeRule {
  return {
    id: 'rule-applied',
    targetPercent: 80,
    targetTime: 7 * 3600 + 30 * 60,
    preconditioningEnabled: false,
    preconditionLengthMins: 0,
    ...overrides,
  };
}

export function chargeSession(overrides: Partial<ChargeSession> = {}): ChargeSession {
  return {
    mode: 'SMART_CHARGE',
    power: { watt: 7200, amp: 31.3, volt: 230 },
    appliedRule: chargeRule(),
    chargerStatus: { online: true },
    batterySoc: { wh: 12000, percent: 55 },
    car: { batterySoc: { percent: 60 } },
    ...overrides,
  };
}

export function nextSessionInfo(rule: Partial<ChargeRule> = { id: 'rule-next', targetPercent: 90, targetTime: 6 * 3600 }): NextSessionInfo {
  return { rule };
}

export function userSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return { chargeSettings: [{ enabled: false, value: 20 }], ...overrides };
}
