import { Device } from 'homey';
import { OhmeApi } from './OhmeApi';
import { ChargerMode, ChargerStatus } from './types';

const POLL_SESSION_MS = 30 * 1000;
const POLL_DEVICE_INFO_MS = 5 * 60 * 1000;

export class OhmeDevice extends Device {
  private api!: OhmeApi;
  private sessionInterval?: ReturnType<typeof setInterval>;
  private deviceInfoInterval?: ReturnType<typeof setInterval>;
  private lastStatus: string | null = null;

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
    const newStatus = this.api.status;
    if (this.lastStatus !== null && this.lastStatus !== newStatus) {
      this.homey.flow.getTriggerCard('charger_status_changed')
        .trigger({ status: newStatus }, { status: newStatus })
        .catch((err: Error) => this.error('Failed to trigger charger_status_changed', err));
    }
    this.lastStatus = newStatus;
    this.safeSetCapability('charger_status', newStatus);
    this.safeSetCapability('measure_power', this.api.power);
    this.safeSetCapability('measure_current', this.api.current);

    if (this.api.voltage !== null) {
      this.safeSetCapability('measure_voltage', this.api.voltage);
    }

    this.safeSetCapability('measure_battery', this.api.battery);
    this.safeSetCapability('meter_power', this.api.energy / 1000);
    this.safeSetCapability('evcharger_charging', this.api.status === ChargerStatus.CHARGING);

    // When unplugged/disconnected, mode is null — show 'paused' rather than empty
    this.safeSetCapability('charge_mode', this.api.mode ?? ChargerMode.PAUSED);

    this.safeSetCapability('target_percentage', this.api.targetSoc);
    this.safeSetCapability('target_time', this.api.targetTimeFormatted);
    this.safeSetCapability('preconditioning_duration', String(this.api.preconditioning));
  }

  private updateConfigCapabilities(): void {
    this.safeSetCapability('lock_buttons', this.api.configurationBoolean('buttonsLocked'));
    this.safeSetCapability('price_cap_enabled', this.api.capEnabled);
    this.safeSetCapability('require_approval', this.api.configurationBoolean('pluginsRequireApproval'));
    this.safeSetCapability('sleep_when_inactive', this.api.configurationBoolean('stealthEnabled'));
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
      if (this.api.status === ChargerStatus.UNPLUGGED) {
        throw new Error('Cannot change charge mode while unplugged');
      }
      this.log(`Setting charge mode to ${value}`);
      await this.api.setMode(value);
    });

    this.registerCapabilityListener('evcharger_charging', async (value: boolean) => {
      if (value && this.api.status === ChargerStatus.UNPLUGGED) {
        throw new Error('Cannot start charging while unplugged');
      }
      this.log(`Setting charging to ${value}`);
      if (value) {
        await this.api.resumeCharge();
      } else {
        await this.api.setMode(ChargerMode.PAUSED);
      }
    });

    this.registerCapabilityListener('target_percentage', async (value: number) => {
      this.log(`Setting target percentage to ${value}%`);
      const result = await this.api.setTarget({ targetPercent: value });
      if (!result) {
        throw new Error('No active charge session or rule found');
      }
    });

    this.registerCapabilityListener('preconditioning_duration', async (value: string) => {
      const minutes = parseInt(value, 10);
      this.log(`Setting preconditioning to ${minutes} min`);
      const result = await this.api.setTarget({ preconditionLength: minutes });
      if (!result) {
        throw new Error('No active charge session or rule found');
      }
    });

    this.registerCapabilityListener('price_cap_enabled', async (value: boolean) => {
      this.log(`Setting price cap to ${value}`);
      await this.api.setPriceCap(value);
    });

    this.registerCapabilityListener('lock_buttons', async (value: boolean) => {
      this.log(`Setting lock buttons to ${value}`);
      await this.api.setConfigurationValue({ buttonsLocked: value });
    });

    if (this.hasCapability('require_approval')) {
      this.registerCapabilityListener('require_approval', async (value: boolean) => {
        this.log(`Setting require approval to ${value}`);
        await this.api.setConfigurationValue({ pluginsRequireApproval: value });
      });
    }

    if (this.hasCapability('sleep_when_inactive')) {
      this.registerCapabilityListener('sleep_when_inactive', async (value: boolean) => {
        this.log(`Setting sleep when inactive to ${value}`);
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
    this.clearIntervals();
  }

  async onUninit(): Promise<void> {
    this.clearIntervals();
  }

  private clearIntervals(): void {
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
