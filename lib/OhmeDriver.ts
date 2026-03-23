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
      return true;
    });

    session.setHandler('list_devices', async () => {
      return api.chargeDevices
        .filter((device) => this.matchesModel(device.modelTypeDisplayName))
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
    return this.modelPatterns.some((pattern) => lower.includes(pattern));
  }

}
