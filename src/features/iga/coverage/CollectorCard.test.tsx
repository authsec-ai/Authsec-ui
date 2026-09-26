import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { collectorNotFound, collectorView } from "../__fixtures__/v2/readers";
import { CollectorCardView } from "./CollectorCard";

describe("collector card", () => {
  it("says ingest is off or the collector is missing on 404", () => {
    expect(collectorNotFound.error).toBe("not_found");
    const view = render(<CollectorCardView phase="not_found" />);
    expect(view.getByText(/Collector ingest is not enabled/)).toBeTruthy();
  });

  it("shows unknown and stale coverage and does not call the collector protected", () => {
    const view = render(<CollectorCardView phase="ready" collector={collectorView} />);
    expect(view.getByText("Unknown")).toBeTruthy();
    expect(view.getByText("Stale")).toBeTruthy();
    expect(view.getByTestId("protection-badge")).toHaveAttribute("data-protection", "not-protected");
    expect(view.container.textContent).not.toContain("Protected");
    expect(view.getAllByText("Not configured").length).toBeGreaterThan(0);
  });
});
