import { Device } from 'homey';
import { OhmeApi } from './OhmeApi';
import { ChargerMode, ChargerStatus } from './types';

const POLL_SESSION_MS = 30 * 1000;
const POLL_DEVICE_INFO_MS = 5 * 60 * 1000;

export class OhmeDevice extends Device {
  private api!: OhmeApi;
  private sessionInterval?: ReturnType<typeof setInterval>;
  private deviceInfoInterval?: ReturnType<typeof setInterval>;

  async onInit(): Promise<void> {
    const email = this.getStoreValue('email') as string;
    const password = this.getStoreValue('password') as string;

    this.api = new OhmeApi(email, password);
    this.api.serial = this.getData().serial;

    // Restore refresh token if available
    const refreshToken = this.getStoreValue('refreshToken') as string | null;
    if (refreshToken) {
      this.api.refreshTokenValue = refreshToken;
    }

    try {
      await this.api.login();
      await this.storeRefreshToken();
      await this.api.updateDeviceInfo();
      await this.api.getChargeSession();
      this.updateCapabilities();
      this.updateConfigCapabilities();
      await this.setAvailable();
    } catch (err) {
      this.error('Failed to initialise OhmeDevice', err);
      await this.setUnavailable((err as Error).message);
    }

    this.registerCapabilityListeners();
    this.startPolling();
  }

  // ── Polling ──────────────────────────────────────────────────────────

  private startPolling(): void {
    this.sessionInterval = setInterval(async () => {
      try {
        await this.api.getChargeSession();
        this.updateCapabilities();
        await this.storeRefreshToken();

        if (this.api.available) {
          await this.setAvailable();
        } else {
          await this.setUnavailable('Charger offline');
        }
      } catch (err) {
        this.error('Session poll failed', err);
      }
    }, POLL_SESSION_MS);

    this.deviceInfoInterval = setInterval(async () => {
      try {
        await this.api.updateDeviceInfo();
        this.updateConfigCapabilities();
        await this.storeRefreshToken();
      } catch (err) {
        this.error('Device info poll failed', err);
      }
    }, POLL_DEVICE_INFO_MS);
  }

  // ── Capability Updates ─────────────────────────────────────────────

  private updateCapabilities(): void {
    this.safeSetCapability('charger_status', this.api.status);
    this.safeSetCapability('measure_power', this.api.power);
    this.safeSetCapability('measure_current', this.api.current);

    if (this.api.voltage !== null) {
      this.safeSetCapability('measure_voltage', this.api.voltage);
    }

    this.safeSetCapability('measure_battery', this.api.battery);
    this.safeSetCapability('meter_power', this.api.energy / 1000);
    this.safeSetCapability('evcharger_charging', this.api.status === ChargerStatus.CHARGING);

    if (this.api.mode !== null) {
      this.safeSetCapability('charge_mode', this.api.mode);
    }

    this.safeSetCapability('target_percentage', this.api.targetSoc);
    this.safeSetCapability('target_time', this.api.targetTimeFormatted);
    this.safeSetCapability('preconditioning_duration', this.api.preconditioning);
  }

  private updateConfigCapabilities(): void {
    this.safeSetCapability('lock_buttons', this.api.configurationValue('buttonsLocked') as boolean);
    this.safeSetCapability('price_cap_enabled', this.api.capEnabled);
    this.safeSetCapability('require_approval', this.api.configurationValue('pluginsRequireApproval') as boolean);
    this.safeSetCapability('sleep_when_inactive', this.api.configurationValue('stealthEnabled') as boolean);
  }

  // ── Safe Capability Setter ─────────────────────────────────────────

  private safeSetCapability(id: string, value: any): void {
    if (!this.hasCapability(id)) return;
    try {
      this.setCapabilityValue(id, value).catch((err) => {
        this.error(`Failed to set capability ${id}`, err);
      });
    } catch (err) {
      this.error(`Failed to set capability ${id}`, err);
    }
  }

  // ── Capability Listeners ───────────────────────────────────────────

  private registerCapabilityListeners(): void {
    this.registerCapabilityListener('charge_mode', async (value: ChargerMode) => {
      await this.api.setMode(value);
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
      await this.api.setTarget({ preconditionLength: value });
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

  // ── Public API Access ──────────────────────────────────────────────

  public getApi(): OhmeApi {
    return this.api;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async onDeleted(): Promise<void> {
    if (this.sessionInterval) {
      clearInterval(this.sessionInterval);
    }
    if (this.deviceInfoInterval) {
      clearInterval(this.deviceInfoInterval);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async storeRefreshToken(): Promise<void> {
    const token = this.api.refreshTokenValue;
    if (token) {
      await this.setStoreValue('refreshToken', token);
    }
  }
}
