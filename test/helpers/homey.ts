import { vi } from 'vitest';

export interface FakeCard {
  id: string;
  runListener?: (...args: any[]) => unknown;
  autocompleteListeners: Record<string, (...args: any[]) => unknown>;
  registerRunListener: (fn: (...args: any[]) => unknown) => FakeCard;
  registerArgumentAutocompleteListener: (arg: string, fn: (...args: any[]) => unknown) => FakeCard;
  trigger: ReturnType<typeof vi.fn>;
}

function createCard(id: string): FakeCard {
  const card: FakeCard = {
    id,
    autocompleteListeners: {},
    registerRunListener(fn) {
      card.runListener = fn;
      return card;
    },
    registerArgumentAutocompleteListener(arg, fn) {
      card.autocompleteListeners[arg] = fn;
      return card;
    },
    trigger: vi.fn().mockResolvedValue(undefined),
  };
  return card;
}

export interface FakeTimer {
  callback: () => void;
  ms: number;
}

/**
 * Fake `this.homey`. Timers are recorded, never run: tests fire them
 * explicitly with `runTimer`, so nothing depends on wall-clock time.
 */
export function createFakeHomey() {
  const cards = {
    trigger: new Map<string, FakeCard>(),
    condition: new Map<string, FakeCard>(),
    action: new Map<string, FakeCard>(),
  };
  const getCard = (kind: keyof typeof cards) => (id: string) => {
    if (!cards[kind].has(id)) cards[kind].set(id, createCard(id));
    return cards[kind].get(id)!;
  };

  const timeouts: FakeTimer[] = [];
  const intervals: FakeTimer[] = [];

  return {
    flow: {
      getTriggerCard: vi.fn(getCard('trigger')),
      getConditionCard: vi.fn(getCard('condition')),
      getActionCard: vi.fn(getCard('action')),
    },
    cards,
    timeouts,
    intervals,
    setTimeout: vi.fn((callback: () => void, ms: number) => {
      const timer = { callback, ms };
      timeouts.push(timer);
      return timer;
    }),
    setInterval: vi.fn((callback: () => void, ms: number) => {
      const timer = { callback, ms };
      intervals.push(timer);
      return timer;
    }),
    clearTimeout: vi.fn(),
    clearInterval: vi.fn(),
  };
}

export type FakeHomey = ReturnType<typeof createFakeHomey>;

/** Flush pending promise callbacks (microtasks and one macrotask turn). */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}
