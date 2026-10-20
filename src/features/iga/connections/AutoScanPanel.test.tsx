import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AWSScanSchedule } from "@/app/api/cloudDiscoveryApi";
import type { Connection } from "@/app/api/connectionsApi";

const h = vi.hoisted(() => ({
  schedule: { current: undefined as unknown },
  runs: { current: [] as unknown[] },
  save: vi.fn(),
  canAdminister: { current: true },
  scheduleError: { current: undefined as unknown },
}));

vi.mock("@/app/api/cloudDiscoveryApi", () => ({
  useGetAwsScanScheduleQuery: () => ({
    currentData: h.schedule.current,
    isLoading: false,
    isError: !!h.scheduleError.current && !h.schedule.current,
    error: h.scheduleError.current,
    refetch: vi.fn(),
  }),
  useListAwsScanRunsQuery: () => ({ currentData: { data: h.runs.current } }),
  useUpdateAwsScanScheduleMutation: () => [h.save, { isLoading: false }],
}));
vi.mock("./permissions", () => ({
  useCanAdminister: () => h.canAdminister.current,
  markAdminDenied: vi.fn(),
}));

import { AutoScanPanel } from "./AutoScanPanel";

const conn = { id: "c1" } as Connection;
const off: AWSScanSchedule = {
  enabled: false,
  interval_minutes: 1440,
  next_due_at: null,
  last_enqueued_at: null,
  paused_reason: "",
  scheduler_active: true,
  time_of_day: null,
  timezone: "UTC",
  day_of_week: null,
};
const on: AWSScanSchedule = {
  ...off,
  enabled: true,
  next_due_at: new Date(Date.now() + 3600_000).toISOString(),
  time_of_day: "02:00",
  timezone: "Asia/Kolkata",
};
const run = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, trigger: "scheduled", last_error: null, queued_at: "2026-10-20T02:00:00Z",
  finished_at: "2026-10-20T02:05:00Z", published_at: null, updated_at: null, coverage: null, ...extra,
});

const ui = () => <AutoScanPanel c={conn} />;

beforeEach(() => {
  vi.useFakeTimers();
  h.schedule.current = on;
  h.runs.current = [];
  h.canAdminister.current = true;
  h.scheduleError.current = undefined;
  h.save.mockReset();
  h.save.mockReturnValue({ unwrap: () => Promise.resolve(on) });
});
afterEach(() => vi.useRealTimers());

describe("AutoScanPanel", () => {
  it("shows one summary strip and no fields once set up", () => {
    render(ui());
    expect(screen.getByText(/Daily at 02:00 \(Asia\/Kolkata\)/)).toBeTruthy();
    expect(screen.queryByLabelText("Time of day")).toBeNull();
    expect(screen.queryByLabelText("Timezone")).toBeNull();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("Edit opens the fields; Cancel closes them", () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByLabelText("Time of day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Time of day")).toBeNull();
  });

  it("turning on opens the setup, and Set saves then collapses", async () => {
    h.schedule.current = off;
    render(ui());
    fireEvent.click(screen.getByRole("switch"));
    expect(h.save).not.toHaveBeenCalled(); // nothing is saved until Set
    fireEvent.click(screen.getByRole("button", { name: "Set auto-scan" }));
    await act(async () => {});
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", enabled: true, interval_minutes: 1440, time_of_day: "02:00" }));
    expect(screen.queryByLabelText("Time of day")).toBeNull();
  });

  it("keeps the choices and says why when a save fails", async () => {
    h.schedule.current = off;
    h.save.mockReturnValue({ unwrap: () => Promise.reject({ status: "FETCH_ERROR" }) });
    render(ui());
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Set auto-scan" }));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/Could not reach AuthSec/);
    expect(screen.getByLabelText("Time of day")).toBeTruthy();
  });

  it("does not replay a result that was already there on arrival", () => {
    h.runs.current = [run("r1", "published")];
    render(ui());
    expect(screen.queryByTestId("scan-result")).toBeNull();
  });

  it("shows a pass strip when a scan finishes, then it disappears", () => {
    h.runs.current = [run("r1", "running", { finished_at: null })];
    const { rerender } = render(ui());
    expect(screen.queryByTestId("scan-result")).toBeNull();
    h.runs.current = [run("r1", "published")];
    rerender(ui());
    expect(screen.getByTestId("scan-result").textContent).toMatch(/Scheduled scan passed/);
    act(() => void vi.advanceTimersByTime(10_500));
    expect(screen.queryByTestId("scan-result")).toBeNull();
  });

  it("shows a fail strip with the fix, and it can be dismissed", () => {
    h.runs.current = [run("r1", "published")];
    const { rerender } = render(ui());
    h.runs.current = [run("r2", "failed", { last_error: "AuthSec could not read the external ID for this role" }), run("r1", "published")];
    rerender(ui());
    const strip = screen.getByTestId("scan-result");
    expect(strip.textContent).toMatch(/failed/);
    expect(strip.textContent).toMatch(/Reconnect the account/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("scan-result")).toBeNull();
  });

  it("offers no Edit to a non-admin", () => {
    h.canAdminister.current = false;
    render(ui());
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
  });

  it("replaces the controls with the reason for a revoked connection", () => {
    h.schedule.current = undefined;
    h.scheduleError.current = { status: 409 };
    render(ui());
    expect(screen.getByRole("alert").textContent).toMatch(/revoked/);
  });
});
