import Homey from 'homey';
import { OhmeApi } from './OhmeApi';

export class OhmeDriver extends Homey.Driver {

  protected modelPatterns: string[] = [];

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let api: OhmeApi;
    let email: string;
    let password: string;

    session.setHandler('login', async (data: { username: string; password: string }) => {
      email = data.username;
      password = data.password;
      api = new OhmeApi(email, password);
      await api.login();
      await api.updateDeviceInfo();
      this.log('Login successful, found', api.chargeDevices.length, 'charge device(s)');
      return true;
    });

    session.setHandler('list_devices', async () => {
      const all = api.chargeDevices;
      const matched = all.filter((device) => this.matchesModel(device.modelTypeDisplayName));
      this.log('Filtering devices:', all.map((d) => d.modelTypeDisplayName), '→ matched', matched.length, 'for patterns', this.modelPatterns);
      return matched
        .map((device) => ({
          name: device.modelTypeDisplayName,
          data: {
            serial: device.id,
          },
          store: {
            email,
            password,
            refreshToken: api.refreshTokenValue,
          },
        }));
    });
  }

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return this.modelPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  }

}
