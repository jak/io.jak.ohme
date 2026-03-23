import { OhmeDriver } from '../../lib/OhmeDriver';

module.exports = class OhmeGoDriver extends OhmeDriver {
  protected modelPatterns = ['Go'];

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return lower.includes('go') && !lower.includes('pro');
  }
};
