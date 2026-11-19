/**
 * Minimal in-memory stand-in for the Homey Apps SDK, aliased to 'homey' in
 * vitest.config.ts. Only the members this app uses are implemented.
 * Instances get a `homey` object from test/helpers/homey.ts.
 */
type Listener = (value: any) => Promise<unknown> | unknown;

class SimpleClass {
  homey: any;

  log(..._args: any[]) {}

  error(..._args: any[]) {}
}

class Driver extends SimpleClass {}

class App extends SimpleClass {}

class Device extends SimpleClass {
  driver: any;

  __store: Record<string, unknown> = {};

  __data: Record<string, unknown> = {};

  __capabilities: string[] = [];

  __values: Record<string, unknown> = {};

  __listeners: Record<string, Listener> = {};

  __available = true;

  __unavailableMessage: string | null = null;

  getStoreValue(key: string) {
    return this.__store[key];
  }

  async setStoreValue(key: string, value: unknown) {
    this.__store[key] = value;
  }

  async unsetStoreValue(key: string) {
    delete this.__store[key];
  }

  getData() {
    return this.__data;
  }

  hasCapability(id: string) {
    return this.__capabilities.includes(id);
  }

  getCapabilityValue(id: string) {
    return this.__values[id];
  }

  async setCapabilityValue(id: string, value: unknown) {
    this.__values[id] = value;
  }

  registerCapabilityListener(id: string, listener: Listener) {
    this.__listeners[id] = listener;
  }

  async setAvailable() {
    this.__available = true;
    this.__unavailableMessage = null;
  }

  async setUnavailable(message?: string) {
    this.__available = false;
    this.__unavailableMessage = message ?? null;
  }
}

export default { Driver, App, Device };

export { Driver, App, Device };
