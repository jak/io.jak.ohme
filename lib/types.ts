export enum ChargerStatus {
  UNPLUGGED = 'unplugged',
  PENDING_APPROVAL = 'pending_approval',
  CHARGING = 'charging',
  PLUGGED_IN = 'plugged_in',
  PAUSED = 'paused',
  FINISHED = 'finished',
}

export enum ChargerMode {
  SMART_CHARGE = 'smart_charge',
  MAX_CHARGE = 'max_charge',
  PAUSED = 'paused',
}

export const API_MODE_TO_STATUS: Record<string, ChargerStatus> = {
  PENDING_APPROVAL: ChargerStatus.PENDING_APPROVAL,
  DISCONNECTED: ChargerStatus.UNPLUGGED,
  STOPPED: ChargerStatus.PAUSED,
  FINISHED_CHARGE: ChargerStatus.FINISHED,
};

export const API_MODE_TO_CHARGER_MODE: Record<string, ChargerMode> = {
  SMART_CHARGE: ChargerMode.SMART_CHARGE,
  MAX_CHARGE: ChargerMode.MAX_CHARGE,
  STOPPED: ChargerMode.PAUSED,
};

export interface ChargeSessionPower {
  watt: number;
  amp: number;
  volt: number | null;
}

export interface ChargeRule {
  id: string;
  targetPercent: number;
  targetTime: number;
  preconditioningEnabled?: boolean;
  preconditionLengthMins?: number;
}

export interface ChargeSession {
  mode: string;
  power?: ChargeSessionPower;
  appliedRule?: ChargeRule;
  suspendedRule?: { targetPercent: number };
  allSessionSlots?: Array<{
    startTimeMs: number;
    endTimeMs: number;
    watts: number;
  }>;
  chargerStatus?: { online: boolean };
  batterySoc?: { wh: number; percent: number };
  car?: { batterySoc?: { percent: number } };
}

export interface ChargeSlot {
  start: Date;
  end: Date;
  energy: number;
}

export interface Vehicle {
  id: string;
  name?: string;
  model?: {
    brand?: { name: string };
    make?: string;
    modelName?: string;
    availableFromYear?: number;
    availableToYear?: number;
  };
}

export interface ChargeDevice {
  id: string;
  modelTypeDisplayName: string;
  firmwareVersionLabel: string;
  modelCapabilities: Record<string, boolean | string | string[]>;
  optionalSettings: Record<string, boolean | string>;
}

export interface AccountInfo {
  cars: Vehicle[];
  chargeDevices: ChargeDevice[];
  userSettings: {
    chargeSettings: Array<{ enabled: boolean; value: number }>;
  };
  tariff?: { dsrTariff: boolean };
}

export interface DeviceInfo {
  name: string;
  model: string;
  swVersion: string;
  serial: string;
}
