import { describe, it, expect } from 'vitest';
import { OhmeDriver } from '../lib/OhmeDriver';

// Create a test harness that exposes matchesModel as public
class TestableDriver extends OhmeDriver {
  constructor(patterns: string[]) {
    super();
    this.modelPatterns = patterns;
  }

  public testMatchesModel(displayName: string): boolean {
    return this.matchesModel(displayName);
  }
}

// Replicate the custom matchesModel from OhmeHomeDriver
class TestableHomeDriver extends OhmeDriver {
  constructor() {
    super();
    this.modelPatterns = ['Home'];
  }

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return lower.includes('home') && !lower.includes('pro');
  }

  public testMatchesModel(displayName: string): boolean {
    return this.matchesModel(displayName);
  }
}

// Replicate the custom matchesModel from OhmeGoDriver
class TestableGoDriver extends OhmeDriver {
  constructor() {
    super();
    this.modelPatterns = ['Go'];
  }

  protected matchesModel(displayName: string): boolean {
    const lower = displayName.toLowerCase();
    return lower.includes('go') && !lower.includes('pro');
  }

  public testMatchesModel(displayName: string): boolean {
    return this.matchesModel(displayName);
  }
}

describe('ePod driver matching', () => {
  const driver = new TestableDriver(['ePod']);

  it('matches "Ohme ePod"', () => {
    expect(driver.testMatchesModel('Ohme ePod')).toBe(true);
  });

  it('matches case-insensitively "ohme epod"', () => {
    expect(driver.testMatchesModel('ohme epod')).toBe(true);
  });

  it('does not match unrelated model', () => {
    expect(driver.testMatchesModel('Tesla Wall Connector')).toBe(false);
  });

  it('does not match "Ohme Home Pro"', () => {
    expect(driver.testMatchesModel('Ohme Home Pro')).toBe(false);
  });
});

describe('Home Pro driver matching', () => {
  const driver = new TestableDriver(['Home Pro']);

  it('matches "Ohme Home Pro"', () => {
    expect(driver.testMatchesModel('Ohme Home Pro')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(driver.testMatchesModel('ohme home pro')).toBe(true);
  });

  it('does not match "Ohme Home" (without Pro)', () => {
    expect(driver.testMatchesModel('Ohme Home')).toBe(false);
  });
});

describe('Home driver matching (excludes Pro)', () => {
  const driver = new TestableHomeDriver();

  it('matches "Ohme Home"', () => {
    expect(driver.testMatchesModel('Ohme Home')).toBe(true);
  });

  it('does not match "Ohme Home Pro"', () => {
    expect(driver.testMatchesModel('Ohme Home Pro')).toBe(false);
  });

  it('does not match unrelated model', () => {
    expect(driver.testMatchesModel('Tesla Wall Connector')).toBe(false);
  });
});

describe('Go driver matching (excludes Pro)', () => {
  const driver = new TestableGoDriver();

  it('matches "Ohme Go"', () => {
    expect(driver.testMatchesModel('Ohme Go')).toBe(true);
  });

  it('does not match unrelated model', () => {
    expect(driver.testMatchesModel('Tesla Wall Connector')).toBe(false);
  });
});
