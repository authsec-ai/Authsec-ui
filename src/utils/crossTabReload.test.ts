import { beforeEach, describe, expect, it, vi } from "vitest";

import { RELOAD_STAMP_KEY, reloadForSessionChange, resetCrossTabReloadForTest } from "./crossTabReload";

function deps(now: number) {
  const store = new Map<string, string>();
  const timers: { fn: () => void; ms: number }[] = [];
  return {
    store,
    timers,
    d: {
      reload: vi.fn(),
      now: () => now,
      defer: (fn: () => void, ms: number) => timers.push({ fn, ms }),
      storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    },
  };
}

describe("reloadForSessionChange", () => {
  beforeEach(() => resetCrossTabReloadForTest());

  it("reloads at once when no reload happened recently", () => {
    const { d } = deps(1_000_000);
    expect(reloadForSessionChange(d)).toBe("now");
    expect(d.reload).toHaveBeenCalledTimes(1);
  });

  it("defers a second change inside the window instead of dropping it", () => {
    const { d, store, timers } = deps(1_004_000);
    store.set(RELOAD_STAMP_KEY, "1000000");
    expect(reloadForSessionChange(d)).toBe("deferred");
    expect(d.reload).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(6_000);
    // A third change while one is pending adds no second timer.
    expect(reloadForSessionChange(d)).toBe("pending");
    expect(timers).toHaveLength(1);
    timers[0].fn();
    expect(d.reload).toHaveBeenCalledTimes(1);
  });
});
