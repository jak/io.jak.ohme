import Homey from 'homey';
import { OhmeApi } from './OhmeApi';

export class OhmeDriver extends Homey.Driver {

  protected modelPatterns: string[] = [];

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let api: OhmeApi;
    let email: string;
    let password: string;
    let matchedDevices: Array<{
      name: string;
      data: { serial: string };
      store: { email: string; password: string; refreshToken: string | null };
    }> = [];

    session.setHandler('login', async (data: { username: string; password: string }) => {
      email = data.username;
      password = data.password;
      api = new OhmeApi(email, password);
      await api.login();
      await api.updateDeviceInfo();

      const all = api.chargeDevices;
      const matched = all.filter((device) => this.matchesModel(device.modelTypeDisplayName));
      this.log('Login:', all.map((d) => d.modelTypeDisplayName), '→ matched', matched.length, 'for', this.modelPatterns);

      matchedDevices = matched.map((device) => ({
        name: device.modelTypeDisplayName,
        data: { serial: device.id },
        store: { email, password, refreshToken: api.refreshTokenValue },
      }));

      if (matchedDevices.length === 0) {
        throw new Error(`No ${this.modelPatterns.join('/')} chargers found on this account`);
      }

      return true;
    });

    session.setHandler('list_devices', async () => {
      return matchedDevices;
    });
  }

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return this.modelPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  }

}
