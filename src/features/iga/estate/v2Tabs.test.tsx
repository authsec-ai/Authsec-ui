import { cleanup, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { observedAccessAggregate, observedAccessEvents, runtimeInstancesEnded, runtimeInstancesLive } from "../__fixtures__/v2/readers";
import { ObservedAccessView } from "./WorkloadObservedAccessTab";
import { RuntimeInstancesView } from "./WorkloadRuntimeTab";
import { RuntimePolicyCard } from "./RuntimePolicyCard";

describe("workload runtime tabs", () => {
  it("shows live and ended instances with their TTL basis", () => {
    const ended = { ...runtimeInstancesEnded.data[0], ref: "runtime_instance:ended" };
    const view = render(<RuntimeInstancesView rows={[...runtimeInstancesLive.data, ended]} />);
    expect(view.getAllByText("boot-a/host/824/93401").length).toBe(2);
    expect(view.getByText("Live")).toBeTruthy();
    expect(view.getByText("Ended")).toBeTruthy();
    expect(view.getByText("TTL basis: Live")).toBeTruthy();
    expect(view.getByText("TTL basis: runtime_unobserved")).toBeTruthy();
  });

  it("lists observed outcomes and SQL only when the server returned it", () => {
    const aggregate = render(<ObservedAccessView rows={observedAccessAggregate.data} />);
    expect(aggregate.getAllByText("Success").length).toBeGreaterThan(0);
    expect(aggregate.getAllByText("Denied").length).toBeGreaterThan(0);
    expect(aggregate.getByText("Database evidence")).toBeTruthy();
    expect(aggregate.getByText("sql")).toBeTruthy();

    cleanup();
    const withoutSql = render(
      <ObservedAccessView rows={observedAccessEvents.data.filter((row) => row.action !== "sql")} />,
    );
    expect(withoutSql.queryByText("Database evidence")).toBeNull();
    expect(withoutSql.getByText(/SQL is shown only when the server returns it/)).toBeTruthy();
  });

  it("keeps runtime policy off green", () => {
    const view = render(<RuntimePolicyCard status={{ workload_id: "w", status: "not_configured" }} />);
    expect(view.getByTestId("protection-badge")).toHaveAttribute("data-protection", "not-protected");
    expect(view.getByText("Not configured")).toBeTruthy();
  });
});
