import { EventEmitter } from 'events';
import {
  ChargerStatus,
  ChargerMode,
  API_MODE_TO_STATUS,
  API_MODE_TO_CHARGER_MODE,
  ChargeSession,
  ChargeSlot,
  ChargeRule,
  Vehicle,
  ChargeDevice,
  AccountInfo,
  DeviceInfo,
} from './types';

const GOOGLE_API_KEY = 'AIzaSyC8ZeZngm33tpOXLpbXeKfwtyZ1WrkbdBY';
const API_BASE = 'https://api.ohme.io';
const AUTH_URL = `https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword?key=${GOOGLE_API_KEY}`;
const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${GOOGLE_API_KEY}`;
const TOKEN_MAX_AGE_MS = 2700 * 1000; // 45 minutes

export class ApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiException';
  }
}

export class AuthException extends ApiException {
  constructor(message: string) {
    super(message);
    this.name = 'AuthException';
  }
}

export class OhmeApi extends EventEmitter {
  private email: string;
  private password: string;

  private _token: string | null = null;
  private _refreshToken: string | null = null;
  private _tokenBirth: number = 0;

  private _chargeSession: ChargeSession = { mode: 'DISCONNECTED' };
  private _nextSession: Partial<ChargeRule> = {};
  private _lastRule: Partial<ChargeRule> = {};
  private _cars: Vehicle[] = [];

  private _capabilities: Record<string, boolean | string | string[]> = {};
  private _configuration: Record<string, boolean | string> = {};

  private _serial: string = '';
  private _deviceInfo: DeviceInfo | null = null;
  private _chargeDevices: ChargeDevice[] = [];

  private _energy: number = 0;
  private _battery: number = 0;

  private _capAvailable: boolean = true;
  private _capEnabled: boolean = false;
  private _available: boolean = false;

  constructor(email: string, password: string) {
    super();
    if (!email || !password) {
      throw new AuthException('Credentials not provided');
    }
    this.email = email;
    this.password = password;
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async login(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.email,
          password: this.password,
          returnSecureToken: true,
        }),
        signal: controller.signal,
      });

      if (resp.status !== 200) {
        throw new AuthException('Incorrect credentials');
      }

      const data = await resp.json() as { idToken: string; refreshToken: string };
      this._tokenBirth = Date.now();
      this._token = data.idToken;
      this._refreshToken = data.refreshToken;
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  async refreshSession(): Promise<boolean> {
    if (this._token === null) {
      return this.login();
    }

    if (Date.now() - this._tokenBirth < TOKEN_MAX_AGE_MS) {
      return true;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantType: 'refresh_token',
          refreshToken: this._refreshToken,
        }),
        signal: controller.signal,
      });

      if (resp.status !== 200) {
        const text = await resp.text();
        throw new AuthException(`Ohme auth refresh error: ${text}`);
      }

      const data = await resp.json() as { id_token: string; refresh_token: string };
      this._tokenBirth = Date.now();
      this._token = data.id_token;
      this._refreshToken = data.refresh_token;
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  get refreshTokenValue(): string | null {
    return this._refreshToken;
  }

  set refreshTokenValue(token: string | null) {
    this._refreshToken = token;
  }

  // ── Internal request ──────────────────────────────────────────────────

  private async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
    parseJson: boolean = true,
  ): Promise<T> {
    await this.refreshSession();

    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Firebase ${this._token}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };

    if (body && ['PUT', 'POST', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });

      if (resp.status !== 200) {
        const text = await resp.text();
        throw new ApiException(`Ohme API response error: ${url}, ${resp.status}; ${text}`);
      }

      if (!parseJson && method === 'POST') {
        return (await resp.text()) as unknown as T;
      }

      if (method === 'PUT') {
        return true as unknown as T;
      }

      return (await resp.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Data Fetching ─────────────────────────────────────────────────────

  async getChargeSession(): Promise<void> {
    let resp: any;

    for (let attempt = 0; attempt < 3; attempt++) {
      const sessions = await this.request<any[]>('GET', '/v1/chargeSessions');

      if (!sessions || sessions.length === 0) {
        this._chargeSession = { mode: 'DISCONNECTED' };
        this._available = false;
        return;
      }

      resp = sessions[0];

      if (resp.mode !== 'CALCULATING' && resp.mode !== 'DELIVERING') {
        break;
      }

      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    this._chargeSession = resp;

    // Online status
    if (resp.chargerStatus && typeof resp.chargerStatus === 'object') {
      this._available = !!resp.chargerStatus.online;
    } else {
      this._available = false;
    }

    // Store last rule
    if (resp.appliedRule) {
      this._lastRule = resp.appliedRule;
    }

    // Energy accumulation
    if (this.isConnected && resp.batterySoc != null) {
      this._energy = Math.max(0, this._energy, resp.batterySoc.wh || 0);
    } else {
      this._energy = 0;
    }

    // Battery percent
    this._battery =
      resp.car?.batterySoc?.percent ??
      resp.batterySoc?.percent ??
      0;

    // Next session
    const nextResp = await this.request<any>('GET', '/v1/chargeSessions/nextSessionInfo');
    this._nextSession = nextResp.rule || {};
  }

  async updateDeviceInfo(): Promise<boolean> {
    const resp = await this.request<AccountInfo>('GET', '/v1/users/me/account');
    this._cars = resp.cars || [];
    this._chargeDevices = resp.chargeDevices || [];

    try {
      this._capEnabled = resp.userSettings.chargeSettings[0].enabled;
    } catch {
      // ignore
    }

    if (!resp.chargeDevices?.length) {
      throw new ApiException('No charge devices found on account');
    }

    const device = resp.chargeDevices.find((d: ChargeDevice) => d.id === this._serial) ?? resp.chargeDevices[0];
    if (!device) throw new ApiException('No matching charge device found');
    this._capabilities = device.modelCapabilities;
    this._configuration = device.optionalSettings;
    this._serial = device.id;

    this._deviceInfo = {
      name: device.modelTypeDisplayName,
      model: device.modelTypeDisplayName.replace('Ohme ', ''),
      swVersion: device.firmwareVersionLabel,
      serial: device.id,
    };

    if (resp.tariff && resp.tariff.dsrTariff) {
      this._capAvailable = false;
    }

    return true;
  }

  // ── Derived State (getters) ───────────────────────────────────────────

  get status(): ChargerStatus {
    const mode = this._chargeSession.mode;

    if (mode in API_MODE_TO_STATUS) {
      return API_MODE_TO_STATUS[mode];
    }

    if (this._chargeSession.power && (this._chargeSession.power.watt ?? 0) > 0) {
      return ChargerStatus.CHARGING;
    }

    return ChargerStatus.PLUGGED_IN;
  }

  get mode(): ChargerMode | null {
    const mode = this._chargeSession.mode;
    return API_MODE_TO_CHARGER_MODE[mode] ?? null;
  }

  get isConnected(): boolean {
    return (
      this.status !== ChargerStatus.UNPLUGGED &&
      this.status !== ChargerStatus.PENDING_APPROVAL
    );
  }

  get isCharging(): boolean {
    return this.status === ChargerStatus.CHARGING;
  }

  get power(): number {
    return this._chargeSession.power?.watt ?? 0;
  }

  get voltage(): number | null {
    return this._chargeSession.power?.volt ?? null;
  }

  get current(): number {
    return this._chargeSession.power?.amp ?? 0;
  }

  get battery(): number {
    return this._battery;
  }

  get energy(): number {
    return this._energy;
  }

  get targetSoc(): number {
    if (
      this.status === ChargerStatus.PAUSED &&
      this._chargeSession.suspendedRule != null
    ) {
      return this._chargeSession.suspendedRule.targetPercent ?? 0;
    }

    if (this.isConnected && this._chargeSession.appliedRule) {
      return this._chargeSession.appliedRule.targetPercent;
    }

    return this._nextSession.targetPercent ?? 0;
  }

  get targetTime(): [number, number] {
    let target: number;

    if (this.isConnected && this._chargeSession.appliedRule) {
      target = this._chargeSession.appliedRule.targetTime;
    } else {
      target = this._nextSession.targetTime ?? 0;
    }

    return [Math.floor(target / 3600), Math.floor((target % 3600) / 60)];
  }

  get targetTimeFormatted(): string {
    const [h, m] = this.targetTime;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get preconditioning(): number {
    if (this.isConnected) {
      if (this._lastRule.preconditioningEnabled) {
        return this._lastRule.preconditionLengthMins ?? 0;
      }
    } else {
      if (this._nextSession.preconditioningEnabled) {
        return this._nextSession.preconditionLengthMins ?? 0;
      }
    }
    return 0;
  }

  get deviceInfo(): DeviceInfo | null {
    return this._deviceInfo;
  }

  get chargeDevices(): ChargeDevice[] {
    return this._chargeDevices;
  }

  get serial(): string {
    return this._serial;
  }

  set serial(value: string) {
    this._serial = value;
  }

  get vehicles(): Vehicle[] {
    return this._cars;
  }

  get capAvailable(): boolean {
    return this._capAvailable;
  }

  get capEnabled(): boolean {
    return this._capEnabled;
  }

  get available(): boolean {
    return this._available;
  }

  configurationBoolean(key: string): boolean {
    const val = this._configuration[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
  }

  configurationValue(key: string): boolean | string | undefined {
    return this._configuration[key];
  }

  isCapable(capability: string): boolean {
    return !!this._capabilities[capability];
  }

  get slots(): ChargeSlot[] {
    const sessionSlots = this._chargeSession.allSessionSlots;
    if (!sessionSlots || sessionSlots.length === 0) {
      return [];
    }

    const raw: ChargeSlot[] = sessionSlots.map((slot) => {
      const start = new Date(slot.startTimeMs);
      const end = new Date(slot.endTimeMs);
      const hours = (end.getTime() - start.getTime()) / (1000 * 3600);
      const energy = Math.round(((slot.watts * hours) / 1000) * 100) / 100;
      return { start, end, energy };
    });

    // Merge adjacent slots
    const merged: ChargeSlot[] = [];
    for (const slot of raw) {
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

  // ── Control Methods ───────────────────────────────────────────────────

  async setMode(mode: ChargerMode): Promise<void> {
    if (mode === ChargerMode.MAX_CHARGE) {
      await this.request(
        'PUT',
        `/v2/charge-devices/${this._serial}/charge-sessions/active/${this._serial}/max-charge?enabled=true`,
      );
    } else if (mode === ChargerMode.SMART_CHARGE) {
      await this.request(
        'PUT',
        `/v2/charge-devices/${this._serial}/charge-sessions/active/${this._serial}/max-charge?enabled=false`,
      );
    } else if (mode === ChargerMode.PAUSED) {
      await this.request('POST', `/v1/chargeSessions/${this._serial}/stop`, undefined, false);
    }
  }

  async resumeCharge(): Promise<boolean> {
    const result = await this.request(
      'POST',
      `/v1/chargeSessions/${this._serial}/resume`,
      undefined,
      false,
    );
    return !!result;
  }

  async approveCharge(): Promise<boolean> {
    const result = await this.request(
      'PUT',
      `/v1/chargeSessions/${this._serial}/approve?approve=true`,
    );
    return !!result;
  }

  async setTarget(opts: {
    targetPercent?: number;
    targetTime?: [number, number];
    preconditionLength?: number;
  }): Promise<boolean> {
    const data: Record<string, any> = {};

    if (opts.targetPercent != null) {
      data.targetPercent = opts.targetPercent;
    }

    if (opts.targetTime != null) {
      data.targetTime = opts.targetTime[0] * 3600 + opts.targetTime[1] * 60;
    }

    if (opts.preconditionLength != null) {
      data.preconditioning = {
        enabled: opts.preconditionLength > 0,
        lengthMins: opts.preconditionLength || 15,
        temperature: null,
      };
    }

    const ruleId = this._lastRule.id ?? this._nextSession.id;
    if (!ruleId) {
      return false;
    }

    await this.request(
      'PATCH',
      `/v2/users/me/charge-rules/${ruleId}?persist=true&recalculateSession=true`,
      data,
    );
    return true;
  }

  async setConfigurationValue(values: Record<string, boolean>): Promise<boolean> {
    const result = await this.request(
      'PUT',
      `/v1/chargeDevices/${this._serial}/appSettings`,
      values,
    );
    return !!result;
  }

  async setPriceCap(enabled: boolean): Promise<boolean> {
    const settings = await this.request<any>('GET', '/v1/users/me/settings');
    settings.chargeSettings[0].enabled = enabled;
    const result = await this.request('PUT', '/v1/users/me/settings', settings);
    return !!result;
  }

  async setPriceCapValue(price: number): Promise<boolean> {
    const settings = await this.request<any>('GET', '/v1/users/me/settings');
    settings.chargeSettings[0].enabled = true;
    settings.chargeSettings[0].value = price;
    const result = await this.request('PUT', '/v1/users/me/settings', settings);
    return !!result;
  }

  async selectVehicle(vehicleId: string): Promise<boolean> {
    const result = await this.request('PUT', `/v1/car/${vehicleId}/select`);
    return !!result;
  }
}
