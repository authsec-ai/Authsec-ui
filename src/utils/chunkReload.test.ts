import { beforeEach, describe, expect, it, vi } from "vitest";

import { reloadOnceForNewVersion } from "./chunkReload";

describe("reloadOnceForNewVersion", () => {
  beforeEach(() => sessionStorage.clear());

  it("reloads once, not again within the window", () => {
    const reload = vi.fn();
    expect(reloadOnceForNewVersion(reload, () => 1_000_000)).toBe(true);
    expect(reloadOnceForNewVersion(reload, () => 1_005_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stops after two reloads in a row even when each failure is slow", () => {
    const reload = vi.fn();
    let t = 1_000_000;
    const now = () => t;
    // A chunk that fails 30s after load: past the 15s window every time.
    for (let i = 0; i < 5; i++) {
      reloadOnceForNewVersion(reload, now);
      t += 30_000;
    }
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads again for a later release once the page has worked a while", () => {
    const reload = vi.fn();
    reloadOnceForNewVersion(reload, () => 1_000_000);
    reloadOnceForNewVersion(reload, () => 1_030_000);
    expect(reloadOnceForNewVersion(reload, () => 1_030_000 + 11 * 60_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(3);
  });

  it("reads the bare timestamp earlier versions stored", () => {
    sessionStorage.setItem("authsec_chunk_reload_at", "1000000");
    expect(reloadOnceForNewVersion(vi.fn(), () => 1_005_000)).toBe(false);
  });
});
