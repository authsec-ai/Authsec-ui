import { cleanup, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProtectionBadge } from "./ProtectionBadge";
import { policyStatusBadge, protectionBadge, type RequiredControl } from "./protection";

const BAD = ["missing", "unknown", "stale", ""] as const;

function control(state: string, current = false): RequiredControl {
  return { required: true, state, current };
}

describe("no false protected badge", () => {
  it("is not green for every combination of missing, unknown and stale", () => {
    expect(protectionBadge(undefined).green).toBe(false);
    expect(protectionBadge(null).green).toBe(false);
    expect(protectionBadge([]).label).toBe("Not configured");
    expect(protectionBadge([]).green).toBe(false);

    for (const a of BAD) {
      for (const b of BAD) {
        for (const c of BAD) {
          const model = protectionBadge([control(a), control(b), control(c, a === "verified")]);
          expect(model.green).toBe(false);
          expect(model.label).not.toBe("Protected");
        }
      }
    }

    const verifiedButStale = protectionBadge([control("verified", false), control("verified", true)]);
    expect(verifiedButStale.green).toBe(false);

    const allCurrent = protectionBadge([control("verified", true), control("verified", true)]);
    expect(allCurrent).toEqual({ tone: "success", label: "Protected", green: true });
  });

  it("does not treat runtime policy status as protected", () => {
    for (const status of [undefined, null, "", "not_configured", "unknown", "stale", "verified"]) {
      const model = policyStatusBadge(status);
      expect(model.green).toBe(false);
      expect(model.label).not.toBe("Protected");
    }
  });

  it("renders those results off the green treatment", () => {
    const cases: RequiredControl[][] = [
      [],
      [control("unknown")],
      [control("stale")],
      [control("missing")],
      [control("verified", false)],
    ];
    for (const controls of cases) {
      cleanup();
      const view = render(<ProtectionBadge controls={controls} />);
      expect(view.getByTestId("protection-badge")).toHaveAttribute("data-protection", "not-protected");
      expect(view.container.textContent).not.toContain("Protected");
      expect(view.container.querySelector("[class*='success']")).toBeNull();
    }
  });
});
