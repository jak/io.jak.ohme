import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeHomeDriver extends OhmeDriver {
  protected modelPatterns = ['Home'];

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return lower.includes('home') && !lower.includes('pro');
  }
};
