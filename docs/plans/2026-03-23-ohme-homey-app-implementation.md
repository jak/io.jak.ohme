# Ohme Homey App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Homey app that integrates Ohme EV chargers (ePod, Home Pro, Home, Go) with full device tile and Flow card support.

**Architecture:** 4 drivers sharing a base device class and API client. Firebase auth to Ohme cloud API, two polling intervals for state sync, capability listeners for control commands.

**Tech Stack:** TypeScript, Homey SDK v3, node-fetch (HTTP), Homey Compose (capabilities/flow cards)

**Reference:** Design doc at `docs/plans/2026-03-23-ohme-homey-app-design.md`, ohmepy source at `/Users/jak/Code/ohmepy`, HA integration at `/Users/jak/Code/home-assistant-core/homeassistant/components/ohme`

---

### Task 1: Custom Capability Definitions

Define all 9 custom capabilities in `.homeycompose/capabilities/`.

**Files:**
- Create: `.homeycompose/capabilities/charger_status.json`
- Create: `.homeycompose/capabilities/charge_mode.json`
- Create: `.homeycompose/capabilities/target_percentage.json`
- Create: `.homeycompose/capabilities/target_time.json`
- Create: `.homeycompose/capabilities/preconditioning_duration.json`
- Create: `.homeycompose/capabilities/price_cap_enabled.json`
- Create: `.homeycompose/capabilities/lock_buttons.json`
- Create: `.homeycompose/capabilities/require_approval.json`
- Create: `.homeycompose/capabilities/sleep_when_inactive.json`

**Step 1: Create charger_status capability**

```json
{
  "type": "enum",
  "title": { "en": "Charger Status" },
  "getable": true,
  "setable": false,
  "uiComponent": "picker",
  "values": [
    { "id": "unplugged", "title": { "en": "Unplugged" } },
    { "id": "plugged_in", "title": { "en": "Plugged In" } },
    { "id": "charging", "title": { "en": "Charging" } },
    { "id": "paused", "title": { "en": "Paused" } },
    { "id": "pending_approval", "title": { "en": "Pending Approval" } },
    { "id": "finished", "title": { "en": "Finished" } }
  ]
}
```

**Step 2: Create charge_mode capability**

```json
{
  "type": "enum",
  "title": { "en": "Charge Mode" },
  "getable": true,
  "setable": true,
  "uiComponent": "picker",
  "values": [
    { "id": "max_charge", "title": { "en": "Max Charge" } },
    { "id": "smart_charge", "title": { "en": "Smart Charge" } },
    { "id": "paused", "title": { "en": "Paused" } }
  ]
}
```

**Step 3: Create target_percentage capability**

```json
{
  "type": "number",
  "title": { "en": "Target %" },
  "getable": true,
  "setable": true,
  "uiComponent": "slider",
  "units": { "en": "%" },
  "min": 0,
  "max": 100,
  "step": 1
}
```

**Step 4: Create target_time capability**

```json
{
  "type": "string",
  "title": { "en": "Target Time" },
  "getable": true,
  "setable": false,
  "uiComponent": "sensor"
}
```

**Step 5: Create preconditioning_duration capability**

```json
{
  "type": "number",
  "title": { "en": "Preconditioning" },
  "getable": true,
  "setable": true,
  "uiComponent": "slider",
  "units": { "en": "min" },
  "min": 0,
  "max": 60,
  "step": 5
}
```

**Step 6: Create price_cap_enabled capability**

```json
{
  "type": "boolean",
  "title": { "en": "Price Cap" },
  "getable": true,
  "setable": true,
  "uiComponent": "toggle"
}
```

**Step 7: Create lock_buttons capability**

```json
{
  "type": "boolean",
  "title": { "en": "Lock Buttons" },
  "getable": true,
  "setable": true,
  "uiComponent": "toggle"
}
```

**Step 8: Create require_approval capability**

```json
{
  "type": "boolean",
  "title": { "en": "Require Approval" },
  "getable": true,
  "setable": true,
  "uiComponent": "toggle"
}
```

**Step 9: Create sleep_when_inactive capability**

```json
{
  "type": "boolean",
  "title": { "en": "Sleep When Inactive" },
  "getable": true,
  "setable": true,
  "uiComponent": "toggle"
}
```

**Step 10: Commit**

```bash
git add .homeycompose/capabilities/
git commit -m "feat: add custom capability definitions for Ohme charger"
```

---

### Task 2: Driver Compose Files

Create 4 driver directories with `driver.compose.json` files declaring their capabilities.

**Files:**
- Create: `.homeycompose/drivers/ohme-home-pro/driver.compose.json`
- Create: `.homeycompose/drivers/ohme-epod/driver.compose.json`
- Create: `.homeycompose/drivers/ohme-home/driver.compose.json`
- Create: `.homeycompose/drivers/ohme-go/driver.compose.json`

**Step 1: Define universal capabilities list**

All drivers share:
```json
["measure_power", "measure_voltage", "measure_current", "measure_battery", "meter_power", "evcharger_charging", "charger_status", "charge_mode", "target_percentage", "target_time", "preconditioning_duration"]
```

**Step 2: Create ohme-home-pro driver compose**

```json
{
  "name": { "en": "Ohme Home Pro" },
  "class": "evcharger",
  "platforms": ["local", "cloud"],
  "connectivity": ["cloud"],
  "capabilities": [
    "measure_power", "measure_voltage", "measure_current", "measure_battery",
    "meter_power", "evcharger_charging", "charger_status", "charge_mode",
    "target_percentage", "target_time", "preconditioning_duration",
    "lock_buttons", "price_cap_enabled", "require_approval", "sleep_when_inactive"
  ],
  "images": {
    "small": "/drivers/ohme-home-pro/assets/images/small.png",
    "large": "/drivers/ohme-home-pro/assets/images/large.png",
    "xlarge": "/drivers/ohme-home-pro/assets/images/xlarge.png"
  },
  "pair": [
    { "id": "login", "template": "login_credentials", "options": { "usernameLabel": { "en": "Email" } } },
    { "id": "list_devices", "template": "list_devices", "navigation": { "next": "add_devices" } },
    { "id": "add_devices", "template": "add_devices" }
  ]
}
```

**Step 3: Create ohme-epod driver compose**

Same as Home Pro (same capabilities), but:
```json
{
  "name": { "en": "Ohme ePod" },
  ...
}
```

**Step 4: Create ohme-home driver compose**

Universal + `lock_buttons` + `price_cap_enabled` only:
```json
{
  "name": { "en": "Ohme Home" },
  "class": "evcharger",
  "platforms": ["local", "cloud"],
  "connectivity": ["cloud"],
  "capabilities": [
    "measure_power", "measure_voltage", "measure_current", "measure_battery",
    "meter_power", "evcharger_charging", "charger_status", "charge_mode",
    "target_percentage", "target_time", "preconditioning_duration",
    "lock_buttons", "price_cap_enabled"
  ],
  ...
}
```

**Step 5: Create ohme-go driver compose**

Same as Home (same capabilities):
```json
{
  "name": { "en": "Ohme Go" },
  ...
}
```

**Step 6: Create placeholder image directories**

Each driver needs `assets/images/{small,large,xlarge}.png`. Create placeholder SVGs or PNGs for now.

**Step 7: Commit**

```bash
git add .homeycompose/drivers/ drivers/
git commit -m "feat: add driver compose files for all 4 Ohme models"
```

---

### Task 3: API Client — Types and Enums

Define TypeScript types mirroring the Ohme API responses.

**Files:**
- Create: `lib/types.ts`

**Step 1: Create types file**

```typescript
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

// Maps API mode strings to our enums
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
  targetTime: number; // seconds since midnight
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
  energy: number; // kWh
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
  id: string; // serial
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
```

**Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add TypeScript types for Ohme API"
```

---

### Task 4: API Client — Authentication and HTTP

Implement the core API client with Firebase auth and HTTP request handling.

**Files:**
- Create: `lib/OhmeApi.ts`

**Step 1: Implement OhmeApi class — auth and HTTP core**

```typescript
import { EventEmitter } from 'events';
import {
  AccountInfo, ChargeSession, ChargeRule, ChargerStatus, ChargerMode,
  API_MODE_TO_STATUS, API_MODE_TO_CHARGER_MODE, ChargeSlot, Vehicle, DeviceInfo,
} from './types';

const GOOGLE_API_KEY = 'AIzaSyC8ZeZngm33tpOXLpbXeKfwtyZ1WrkbdBY';
const API_BASE = 'https://api.ohme.io';
const TOKEN_REFRESH_SECONDS = 2700; // 45 minutes

export class OhmeApi extends EventEmitter {
  private email: string;
  private password: string;
  private token: string | null = null;
  private _refreshToken: string | null = null;
  private tokenBirth: number = 0;

  // State
  private chargeSession: ChargeSession | null = null;
  private nextSessionRule: ChargeRule | null = null;
  private account: AccountInfo | null = null;

  public serial: string = '';
  public energy: number = 0;
  public battery: number = 0;

  constructor(email: string, password: string) {
    super();
    this.email = email;
    this.password = password;
  }

  // --- Auth ---

  async login(): Promise<void> {
    const resp = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          returnSecureToken: true,
        }),
      },
    );

    if (!resp.ok) {
      throw new Error('Invalid credentials');
    }

    const data = await resp.json();
    this.token = data.idToken;
    this._refreshToken = data.refreshToken;
    this.tokenBirth = Date.now() / 1000;
  }

  async refreshSession(): Promise<void> {
    if (this.token && (Date.now() / 1000 - this.tokenBirth) < TOKEN_REFRESH_SECONDS) {
      return;
    }

    if (!this._refreshToken) {
      await this.login();
      return;
    }

    const resp = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: this._refreshToken,
        }),
      },
    );

    if (!resp.ok) {
      this.token = null;
      await this.login();
      return;
    }

    const data = await resp.json();
    this.token = data.id_token;
    this._refreshToken = data.refresh_token;
    this.tokenBirth = Date.now() / 1000;
  }

  private async request(method: string, path: string, body?: unknown, parseJson = true): Promise<unknown> {
    await this.refreshSession();

    const resp = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Firebase ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (resp.status === 401) {
      this.token = null;
      throw new Error('Authentication failed');
    }

    if (!resp.ok) {
      throw new Error(`API error: ${resp.status} ${resp.statusText}`);
    }

    if (!parseJson) {
      return resp.text();
    }
    return resp.json();
  }

  // --- Getters for stored refresh token (for persistence) ---

  get refreshTokenValue(): string | null {
    return this._refreshToken;
  }

  set refreshTokenValue(value: string | null) {
    this._refreshToken = value;
  }
}
```

**Step 2: Commit**

```bash
git add lib/OhmeApi.ts
git commit -m "feat: add OhmeApi client with Firebase auth"
```

---

### Task 5: API Client — Data Fetching Methods

Add charge session polling, device info fetching, and state derivation.

**Files:**
- Modify: `lib/OhmeApi.ts`

**Step 1: Add data fetching methods**

Append to OhmeApi class:

```typescript
  // --- Data Fetching ---

  async getChargeSession(): Promise<void> {
    let session: ChargeSession | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const sessions = await this.request('GET', '/v1/chargeSessions') as ChargeSession[];
      session = sessions[0];

      if (session?.mode !== 'CALCULATING' && session?.mode !== 'DELIVERING') {
        break;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.chargeSession = session ?? null;

    // Energy accumulation
    if (this.chargeInProgress && this.chargeSession?.batterySoc?.wh != null) {
      this.energy = Math.max(0, this.energy, this.chargeSession.batterySoc.wh);
    } else {
      this.energy = 0;
    }

    // Battery from multiple sources
    this.battery =
      this.chargeSession?.car?.batterySoc?.percent
      ?? this.chargeSession?.batterySoc?.percent
      ?? 0;

    // Fetch next session rule
    try {
      const nextInfo = await this.request('GET', '/v1/chargeSessions/nextSessionInfo') as { rule?: ChargeRule };
      this.nextSessionRule = nextInfo?.rule ?? null;
    } catch {
      this.nextSessionRule = null;
    }
  }

  async updateDeviceInfo(): Promise<void> {
    this.account = await this.request('GET', '/v1/users/me/account') as AccountInfo;

    if (!this.serial && this.account.chargeDevices.length > 0) {
      this.serial = this.account.chargeDevices[0].id;
    }
  }

  // --- Derived State ---

  get status(): ChargerStatus {
    if (!this.chargeSession) return ChargerStatus.UNPLUGGED;

    const mode = this.chargeSession.mode;
    const mapped = API_MODE_TO_STATUS[mode];
    if (mapped) return mapped;

    if ((this.chargeSession.power?.watt ?? 0) > 0) {
      return ChargerStatus.CHARGING;
    }

    return ChargerStatus.PLUGGED_IN;
  }

  get mode(): ChargerMode | null {
    if (!this.chargeSession) return null;
    return API_MODE_TO_CHARGER_MODE[this.chargeSession.mode] ?? null;
  }

  get chargeInProgress(): boolean {
    return this.status !== ChargerStatus.UNPLUGGED
      && this.status !== ChargerStatus.PENDING_APPROVAL;
  }

  get power(): number {
    return this.chargeSession?.power?.watt ?? 0;
  }

  get voltage(): number | null {
    return this.chargeSession?.power?.volt ?? null;
  }

  get current(): number {
    return this.chargeSession?.power?.amp ?? 0;
  }

  get available(): boolean {
    return this.chargeSession?.chargerStatus?.online ?? false;
  }

  get targetSoc(): number {
    if (this.status === ChargerStatus.PAUSED && this.chargeSession?.suspendedRule) {
      return this.chargeSession.suspendedRule.targetPercent;
    }
    if (this.chargeInProgress && this.chargeSession?.appliedRule) {
      return this.chargeSession.appliedRule.targetPercent;
    }
    return this.nextSessionRule?.targetPercent ?? 0;
  }

  get targetTime(): [number, number] {
    let seconds: number;
    if (this.chargeInProgress && this.chargeSession?.appliedRule) {
      seconds = this.chargeSession.appliedRule.targetTime;
    } else {
      seconds = this.nextSessionRule?.targetTime ?? 0;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [hours, minutes];
  }

  get targetTimeFormatted(): string {
    const [h, m] = this.targetTime;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get preconditioning(): number {
    const rule = this.chargeInProgress
      ? this.chargeSession?.appliedRule
      : this.nextSessionRule;
    if (rule?.preconditioningEnabled) {
      return rule.preconditionLengthMins ?? 0;
    }
    return 0;
  }

  get deviceInfo(): DeviceInfo | null {
    const device = this.account?.chargeDevices.find((d) => d.id === this.serial);
    if (!device) return null;
    return {
      name: device.modelTypeDisplayName,
      model: device.modelTypeDisplayName.replace('Ohme ', ''),
      swVersion: device.firmwareVersionLabel,
      serial: device.id,
    };
  }

  get vehicles(): Vehicle[] {
    return this.account?.cars ?? [];
  }

  get capAvailable(): boolean {
    return !(this.account?.tariff?.dsrTariff ?? false);
  }

  get capEnabled(): boolean {
    const settings = this.account?.userSettings?.chargeSettings;
    return settings?.[0]?.enabled ?? false;
  }

  configurationValue(key: string): boolean {
    const device = this.account?.chargeDevices.find((d) => d.id === this.serial);
    return Boolean(device?.optionalSettings?.[key]);
  }

  isCapable(capability: string): boolean {
    const device = this.account?.chargeDevices.find((d) => d.id === this.serial);
    return Boolean(device?.modelCapabilities?.[capability]);
  }

  get slots(): ChargeSlot[] {
    const sessionSlots = this.chargeSession?.allSessionSlots ?? [];
    if (!sessionSlots.length) return [];

    const slots: ChargeSlot[] = [];
    for (const slot of sessionSlots) {
      const start = new Date(slot.startTimeMs);
      const end = new Date(slot.endTimeMs);
      const hours = (end.getTime() - start.getTime()) / (3600 * 1000);
      const energy = Math.round((slot.watts * hours) / 1000 * 100) / 100;
      slots.push({ start, end, energy });
    }

    // Merge adjacent slots
    const merged: ChargeSlot[] = [];
    for (const slot of slots) {
      const last = merged[merged.length - 1];
      if (last && last.end.getTime() === slot.start.getTime()) {
        merged[merged.length - 1] = {
          start: last.start,
          end: slot.end,
          energy: last.energy + slot.energy,
        };
      } else {
        merged.push(slot);
      }
    }

    return merged;
  }
```

**Step 2: Commit**

```bash
git add lib/OhmeApi.ts
git commit -m "feat: add charge session polling and state derivation"
```

---

### Task 6: API Client — Control Methods

Add all control/command methods.

**Files:**
- Modify: `lib/OhmeApi.ts`

**Step 1: Add control methods**

Append to OhmeApi class:

```typescript
  // --- Control Methods ---

  async setMode(mode: ChargerMode): Promise<void> {
    if (mode === ChargerMode.MAX_CHARGE) {
      await this.request('PUT',
        `/v2/charge-devices/${this.serial}/charge-sessions/active/${this.serial}/max-charge?enabled=true`);
    } else if (mode === ChargerMode.SMART_CHARGE) {
      await this.request('PUT',
        `/v2/charge-devices/${this.serial}/charge-sessions/active/${this.serial}/max-charge?enabled=false`);
    } else if (mode === ChargerMode.PAUSED) {
      await this.request('POST', `/v1/chargeSessions/${this.serial}/stop`, undefined, false);
    }
  }

  async resumeCharge(): Promise<void> {
    await this.request('POST', `/v1/chargeSessions/${this.serial}/resume`, undefined, false);
  }

  async approveCharge(): Promise<void> {
    await this.request('PUT', `/v1/chargeSessions/${this.serial}/approve?approve=true`);
  }

  async setTarget(opts: {
    targetPercent?: number;
    targetTime?: [number, number]; // [hours, minutes]
    preconditioningMinutes?: number;
  }): Promise<void> {
    // Build the PATCH body for active session
    const ruleId = this.chargeSession?.appliedRule?.id;
    if (!ruleId) return;

    const body: Record<string, unknown> = {};
    if (opts.targetPercent !== undefined) {
      body.targetPercent = opts.targetPercent;
    }
    if (opts.targetTime !== undefined) {
      const [h, m] = opts.targetTime;
      body.targetTime = h * 3600 + m * 60;
    }
    if (opts.preconditioningMinutes !== undefined) {
      body.preconditioning = {
        enabled: opts.preconditioningMinutes > 0,
        lengthMins: opts.preconditioningMinutes,
        temperature: null,
      };
    }

    await this.request('PATCH',
      `/v2/users/me/charge-rules/${ruleId}?persist=true&recalculateSession=true`,
      body);
  }

  async setConfigurationValue(values: Record<string, boolean>): Promise<void> {
    await this.request('PUT', `/v1/chargeDevices/${this.serial}/appSettings`, values);
    // API needs a moment to persist
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  async setPriceCap(enabled: boolean): Promise<void> {
    const settings = await this.request('GET', '/v1/users/me/settings') as {
      chargeSettings: Array<{ enabled: boolean; value: number }>;
    };
    if (settings.chargeSettings?.length > 0) {
      settings.chargeSettings[0].enabled = enabled;
    }
    await this.request('PUT', '/v1/users/me/settings', settings);
  }

  async setPriceCapValue(price: number): Promise<void> {
    const settings = await this.request('GET', '/v1/users/me/settings') as {
      chargeSettings: Array<{ enabled: boolean; value: number }>;
    };
    if (settings.chargeSettings?.length > 0) {
      settings.chargeSettings[0].enabled = true;
      settings.chargeSettings[0].value = price;
    }
    await this.request('PUT', '/v1/users/me/settings', settings);
  }

  async selectVehicle(vehicleId: string): Promise<void> {
    await this.request('PUT', `/v1/car/${vehicleId}/select`);
  }
```

**Step 2: Commit**

```bash
git add lib/OhmeApi.ts
git commit -m "feat: add control methods to OhmeApi"
```

---

### Task 7: Base Device Class

Create a shared base device class that all 4 drivers extend.

**Files:**
- Create: `lib/OhmeDevice.ts`

**Step 1: Create OhmeDevice base class**

```typescript
import Homey from 'homey';
import { OhmeApi } from './OhmeApi';
import { ChargerMode } from './types';

const CHARGE_SESSION_INTERVAL = 30 * 1000; // 30 seconds
const DEVICE_INFO_INTERVAL = 5 * 60 * 1000; // 5 minutes

export class OhmeDevice extends Homey.Device {
  private api!: OhmeApi;
  private chargeSessionTimer?: ReturnType<typeof setInterval>;
  private deviceInfoTimer?: ReturnType<typeof setInterval>;

  async onInit(): Promise<void> {
    const { email, password } = await this.getCredentials();

    this.api = new OhmeApi(email, password);
    this.api.serial = this.getData().serial;

    // Restore refresh token if available
    const storedRefreshToken = this.getStoreValue('refreshToken');
    if (storedRefreshToken) {
      this.api.refreshTokenValue = storedRefreshToken;
    }

    try {
      await this.api.login();
      await this.persistRefreshToken();
      await this.api.updateDeviceInfo();
      await this.api.getChargeSession();
      await this.updateCapabilities();
      this.setAvailable();
    } catch (err) {
      this.error('Init failed:', err);
      this.setUnavailable(String(err));
      return;
    }

    this.registerCapabilityListeners();
    this.startPolling();
  }

  private async getCredentials(): Promise<{ email: string; password: string }> {
    const email = this.getStoreValue('email') as string;
    const password = this.getStoreValue('password') as string;
    return { email, password };
  }

  private async persistRefreshToken(): Promise<void> {
    const token = this.api.refreshTokenValue;
    if (token) {
      await this.setStoreValue('refreshToken', token);
    }
  }

  private startPolling(): void {
    this.chargeSessionTimer = setInterval(async () => {
      try {
        await this.api.getChargeSession();
        await this.persistRefreshToken();
        await this.updateCapabilities();
        if (!this.getAvailable()) this.setAvailable();
      } catch (err) {
        this.error('Charge session poll failed:', err);
        this.setUnavailable(String(err));
      }
    }, CHARGE_SESSION_INTERVAL);

    this.deviceInfoTimer = setInterval(async () => {
      try {
        await this.api.updateDeviceInfo();
        await this.updateConfigCapabilities();
      } catch (err) {
        this.error('Device info poll failed:', err);
      }
    }, DEVICE_INFO_INTERVAL);
  }

  private async updateCapabilities(): Promise<void> {
    // Charge session data
    await this.safeSetCapability('charger_status', this.api.status);
    await this.safeSetCapability('measure_power', this.api.power);
    await this.safeSetCapability('measure_current', this.api.current);
    await this.safeSetCapability('measure_battery', this.api.battery);
    await this.safeSetCapability('meter_power', this.api.energy / 1000); // Wh to kWh
    await this.safeSetCapability('evcharger_charging', this.api.status === 'charging');
    await this.safeSetCapability('target_percentage', this.api.targetSoc);
    await this.safeSetCapability('target_time', this.api.targetTimeFormatted);
    await this.safeSetCapability('preconditioning_duration', this.api.preconditioning);

    if (this.api.voltage !== null) {
      await this.safeSetCapability('measure_voltage', this.api.voltage);
    }

    const mode = this.api.mode;
    if (mode) {
      await this.safeSetCapability('charge_mode', mode);
    }
  }

  private async updateConfigCapabilities(): Promise<void> {
    await this.safeSetCapability('lock_buttons', this.api.configurationValue('buttonsLocked'));
    await this.safeSetCapability('price_cap_enabled', this.api.capEnabled);
    await this.safeSetCapability('require_approval', this.api.configurationValue('pluginsRequireApproval'));
    await this.safeSetCapability('sleep_when_inactive', this.api.configurationValue('stealthEnabled'));
  }

  private async safeSetCapability(id: string, value: unknown): Promise<void> {
    if (this.hasCapability(id) && value !== undefined && value !== null) {
      try {
        await this.setCapabilityValue(id, value);
      } catch (err) {
        this.error(`Failed to set ${id}:`, err);
      }
    }
  }

  private registerCapabilityListeners(): void {
    this.registerCapabilityListener('charge_mode', async (value: string) => {
      await this.api.setMode(value as ChargerMode);
    });

    this.registerCapabilityListener('evcharger_charging', async (value: boolean) => {
      if (value) {
        await this.api.resumeCharge();
      } else {
        await this.api.setMode(ChargerMode.PAUSED);
      }
    });

    this.registerCapabilityListener('target_percentage', async (value: number) => {
      await this.api.setTarget({ targetPercent: value });
    });

    this.registerCapabilityListener('preconditioning_duration', async (value: number) => {
      await this.api.setTarget({ preconditioningMinutes: value });
    });

    this.registerCapabilityListener('price_cap_enabled', async (value: boolean) => {
      await this.api.setPriceCap(value);
    });

    this.registerCapabilityListener('lock_buttons', async (value: boolean) => {
      await this.api.setConfigurationValue({ buttonsLocked: value });
    });

    if (this.hasCapability('require_approval')) {
      this.registerCapabilityListener('require_approval', async (value: boolean) => {
        await this.api.setConfigurationValue({ pluginsRequireApproval: value });
      });
    }

    if (this.hasCapability('sleep_when_inactive')) {
      this.registerCapabilityListener('sleep_when_inactive', async (value: boolean) => {
        await this.api.setConfigurationValue({ stealthEnabled: value });
      });
    }
  }

  getApi(): OhmeApi {
    return this.api;
  }

  async onDeleted(): Promise<void> {
    if (this.chargeSessionTimer) clearInterval(this.chargeSessionTimer);
    if (this.deviceInfoTimer) clearInterval(this.deviceInfoTimer);
  }
}
```

**Step 2: Commit**

```bash
git add lib/OhmeDevice.ts
git commit -m "feat: add shared OhmeDevice base class"
```

---

### Task 8: Base Driver Class (Pairing)

Create a shared driver class with pairing logic.

**Files:**
- Create: `lib/OhmeDriver.ts`

**Step 1: Create OhmeDriver base class**

```typescript
import Homey from 'homey';
import { OhmeApi } from './OhmeApi';

export class OhmeDriver extends Homey.Driver {
  // Subclasses override to provide model name patterns for matching
  protected modelPatterns: string[] = [];

  async onPairListDevices(): Promise<Homey.Device.DeviceData[]> {
    // Credentials are set by the login_credentials template
    // and passed via the pair session
    throw new Error('Use onPair instead');
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let api: OhmeApi;

    session.setHandler('login', async (data: { username: string; password: string }) => {
      api = new OhmeApi(data.username, data.password);
      await api.login();
      await api.updateDeviceInfo();
      return true;
    });

    session.setHandler('list_devices', async () => {
      const account = await api['account']; // Access internal state
      if (!account) throw new Error('Not logged in');

      const devices = account.chargeDevices
        .filter((device) => this.matchesModel(device.modelTypeDisplayName))
        .map((device) => ({
          name: device.modelTypeDisplayName,
          data: { serial: device.id },
          store: {
            email: api['email'],
            password: api['password'],
            refreshToken: api.refreshTokenValue,
          },
        }));

      if (devices.length === 0) {
        throw new Error(`No ${this.modelPatterns.join('/')} chargers found on this account`);
      }

      return devices;
    });
  }

  private matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return this.modelPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  }
}
```

**Step 2: Commit**

```bash
git add lib/OhmeDriver.ts
git commit -m "feat: add shared OhmeDriver base class with pairing"
```

---

### Task 9: Individual Driver & Device Files

Create the thin driver/device wrappers for each model.

**Files:**
- Create: `drivers/ohme-home-pro/driver.ts`
- Create: `drivers/ohme-home-pro/device.ts`
- Create: `drivers/ohme-epod/driver.ts`
- Create: `drivers/ohme-epod/device.ts`
- Create: `drivers/ohme-home/driver.ts`
- Create: `drivers/ohme-home/device.ts`
- Create: `drivers/ohme-go/driver.ts`
- Create: `drivers/ohme-go/device.ts`

**Step 1: ohme-home-pro driver**

`drivers/ohme-home-pro/driver.ts`:
```typescript
import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeHomeProDriver extends OhmeDriver {
  protected modelPatterns = ['Home Pro'];
};
```

`drivers/ohme-home-pro/device.ts`:
```typescript
import { OhmeDevice } from '../../lib/OhmeDevice';

module.exports = class OhmeHomeProDevice extends OhmeDevice {};
```

**Step 2: ohme-epod driver**

`drivers/ohme-epod/driver.ts`:
```typescript
import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeEpodDriver extends OhmeDriver {
  protected modelPatterns = ['ePod'];
};
```

`drivers/ohme-epod/device.ts`:
```typescript
import { OhmeDevice } from '../../lib/OhmeDevice';

module.exports = class OhmeEpodDevice extends OhmeDevice {};
```

**Step 3: ohme-home driver**

`drivers/ohme-home/driver.ts`:
```typescript
import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeHomeDriver extends OhmeDriver {
  protected modelPatterns = ['Home'];
};
```

`drivers/ohme-home/device.ts`:
```typescript
import { OhmeDevice } from '../../lib/OhmeDevice';

module.exports = class OhmeHomeDevice extends OhmeDevice {};
```

**Step 4: ohme-go driver**

`drivers/ohme-go/driver.ts`:
```typescript
import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeGoDriver extends OhmeDriver {
  protected modelPatterns = ['Go'];
};
```

`drivers/ohme-go/device.ts`:
```typescript
import { OhmeDevice } from '../../lib/OhmeDevice';

module.exports = class OhmeGoDevice extends OhmeDevice {};
```

**Step 5: Commit**

```bash
git add drivers/
git commit -m "feat: add all 4 driver and device implementations"
```

---

### Task 10: Custom Flow Action Cards

Define the 4 custom Flow action cards that don't come free from capabilities.

**Files:**
- Create: `.homeycompose/flow/actions/set_target_time.json`
- Create: `.homeycompose/flow/actions/approve_charge.json`
- Create: `.homeycompose/flow/actions/set_price_cap_value.json`
- Create: `.homeycompose/flow/actions/select_vehicle.json`

**Step 1: set_target_time action**

```json
{
  "title": { "en": "Set target time" },
  "titleFormatted": { "en": "Set target time to [[hour]]:[[minute]]" },
  "platforms": ["local", "cloud"],
  "args": [
    {
      "type": "number",
      "name": "hour",
      "title": { "en": "Hour" },
      "min": 0,
      "max": 23,
      "step": 1
    },
    {
      "type": "number",
      "name": "minute",
      "title": { "en": "Minute" },
      "min": 0,
      "max": 59,
      "step": 1
    }
  ]
}
```

**Step 2: approve_charge action**

```json
{
  "title": { "en": "Approve charge" },
  "platforms": ["local", "cloud"],
  "args": []
}
```

**Step 3: set_price_cap_value action**

```json
{
  "title": { "en": "Set price cap value" },
  "titleFormatted": { "en": "Set price cap to [[price]]" },
  "platforms": ["local", "cloud"],
  "args": [
    {
      "type": "number",
      "name": "price",
      "title": { "en": "Price (pence/cents)" },
      "min": 0,
      "step": 1
    }
  ]
}
```

**Step 4: select_vehicle action**

```json
{
  "title": { "en": "Select vehicle" },
  "titleFormatted": { "en": "Select vehicle [[vehicle]]" },
  "platforms": ["local", "cloud"],
  "args": [
    {
      "type": "autocomplete",
      "name": "vehicle",
      "title": { "en": "Vehicle" }
    }
  ]
}
```

**Step 5: Commit**

```bash
git add .homeycompose/flow/actions/
git commit -m "feat: add custom Flow action cards"
```

---

### Task 11: Flow Action Card Handlers

Register the custom Flow action card handlers in the app.

**Files:**
- Modify: `app.ts`

**Step 1: Update app.ts with Flow card handlers**

```typescript
'use strict';

import Homey from 'homey';
import { OhmeDevice } from './lib/OhmeDevice';

module.exports = class OhmeApp extends Homey.App {
  async onInit(): Promise<void> {
    this.log('Ohme app initialized');

    // Set target time
    const setTargetTimeAction = this.homey.flow.getActionCard('set_target_time');
    setTargetTimeAction.registerRunListener(async (args: { device: OhmeDevice; hour: number; minute: number }) => {
      await args.device.getApi().setTarget({ targetTime: [args.hour, args.minute] });
    });

    // Approve charge
    const approveChargeAction = this.homey.flow.getActionCard('approve_charge');
    approveChargeAction.registerRunListener(async (args: { device: OhmeDevice }) => {
      await args.device.getApi().approveCharge();
    });

    // Set price cap value
    const setPriceCapAction = this.homey.flow.getActionCard('set_price_cap_value');
    setPriceCapAction.registerRunListener(async (args: { device: OhmeDevice; price: number }) => {
      await args.device.getApi().setPriceCapValue(args.price);
    });

    // Select vehicle
    const selectVehicleAction = this.homey.flow.getActionCard('select_vehicle');
    selectVehicleAction.registerRunListener(async (args: { device: OhmeDevice; vehicle: { id: string } }) => {
      await args.device.getApi().selectVehicle(args.vehicle.id);
    });

    selectVehicleAction.registerArgumentAutocompleteListener('vehicle', async (_query: string, args: { device: OhmeDevice }) => {
      const vehicles = args.device.getApi().vehicles;
      return vehicles.map((v) => ({
        name: v.name || `${v.model?.brand?.name ?? v.model?.make ?? ''} ${v.model?.modelName ?? ''}`.trim(),
        id: v.id,
      }));
    });
  }
};
```

**Step 2: Commit**

```bash
git add app.ts
git commit -m "feat: register custom Flow action card handlers"
```

---

### Task 12: Build, Validate, and Test

Verify the app compiles and passes Homey validation.

**Files:**
- No new files

**Step 1: Install dependencies and build**

```bash
npm install
npm run build
```

Expected: No TypeScript errors.

**Step 2: Run Homey compose**

```bash
npx homey app compose
```

Expected: `app.json` is regenerated with all drivers and capabilities merged in.

**Step 3: Validate the app**

```bash
npx homey app validate
```

Expected: No validation errors (warnings about missing images are OK).

**Step 4: Review generated app.json**

Check that all 4 drivers appear with correct capabilities.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: initial build and validation pass"
```

---

### Task 13: Driver Image Assets

Create placeholder icon/images for each driver. These can be replaced with proper Ohme branding later.

**Files:**
- Create: `drivers/ohme-home-pro/assets/images/{small,large,xlarge}.png`
- Create: `drivers/ohme-epod/assets/images/{small,large,xlarge}.png`
- Create: `drivers/ohme-home/assets/images/{small,large,xlarge}.png`
- Create: `drivers/ohme-go/assets/images/{small,large,xlarge}.png`
- Create: `assets/icon.svg` (if not already present)

Generate simple placeholder PNGs at the correct sizes:
- small: 75x75
- large: 500x500
- xlarge: 1000x1000

**Step 1: Create placeholder images**

Use a simple script or copy the existing `assets/icon.svg` and convert to PNG at each size. Or create minimal SVG-based PNGs.

**Step 2: Commit**

```bash
git add drivers/*/assets/ assets/
git commit -m "chore: add placeholder driver images"
```

---

## Task Dependency Order

```
Task 1 (capabilities) ─┐
Task 2 (driver compose) ┤
Task 3 (types) ─────────┤── can run in parallel
                         │
Task 4 (API auth) ───────┤── depends on Task 3
Task 5 (API data) ───────┤── depends on Task 4
Task 6 (API control) ────┤── depends on Task 5
                         │
Task 7 (base device) ────┤── depends on Task 6
Task 8 (base driver) ────┤── depends on Task 6
                         │
Task 9 (driver files) ───┤── depends on Tasks 7 & 8
Task 10 (flow cards) ────┤── can run in parallel with 7-9
Task 11 (flow handlers) ─┤── depends on Tasks 7 & 10
                         │
Task 12 (build/validate) ┤── depends on all above
Task 13 (images) ────────┘── can run anytime
```

Plan complete and saved to `docs/plans/2026-03-23-ohme-homey-app-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach?