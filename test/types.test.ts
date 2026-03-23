import { describe, it, expect } from 'vitest';
import {
  ChargerStatus,
  ChargerMode,
  API_MODE_TO_STATUS,
  API_MODE_TO_CHARGER_MODE,
} from '../lib/types';

describe('API_MODE_TO_STATUS', () => {
  it('maps PENDING_APPROVAL to pending_approval', () => {
    expect(API_MODE_TO_STATUS['PENDING_APPROVAL']).toBe(ChargerStatus.PENDING_APPROVAL);
  });

  it('maps DISCONNECTED to unplugged', () => {
    expect(API_MODE_TO_STATUS['DISCONNECTED']).toBe(ChargerStatus.UNPLUGGED);
  });

  it('maps STOPPED to paused', () => {
    expect(API_MODE_TO_STATUS['STOPPED']).toBe(ChargerStatus.PAUSED);
  });

  it('maps FINISHED_CHARGE to finished', () => {
    expect(API_MODE_TO_STATUS['FINISHED_CHARGE']).toBe(ChargerStatus.FINISHED);
  });

  it('does not map unknown modes', () => {
    expect(API_MODE_TO_STATUS['SMART_CHARGE']).toBeUndefined();
    expect(API_MODE_TO_STATUS['MAX_CHARGE']).toBeUndefined();
  });
});

describe('API_MODE_TO_CHARGER_MODE', () => {
  it('maps SMART_CHARGE to smart_charge', () => {
    expect(API_MODE_TO_CHARGER_MODE['SMART_CHARGE']).toBe(ChargerMode.SMART_CHARGE);
  });

  it('maps MAX_CHARGE to max_charge', () => {
    expect(API_MODE_TO_CHARGER_MODE['MAX_CHARGE']).toBe(ChargerMode.MAX_CHARGE);
  });

  it('maps STOPPED to paused', () => {
    expect(API_MODE_TO_CHARGER_MODE['STOPPED']).toBe(ChargerMode.PAUSED);
  });

  it('does not map unknown modes', () => {
    expect(API_MODE_TO_CHARGER_MODE['DISCONNECTED']).toBeUndefined();
    expect(API_MODE_TO_CHARGER_MODE['FINISHED_CHARGE']).toBeUndefined();
  });
});
