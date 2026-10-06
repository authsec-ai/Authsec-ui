import { describe, expect, it } from "vitest";

import { initialModelState, modelReducer } from "./model";

describe("switch-view", () => {
  it("keeps moved cards per view and lays out again", () => {
    let s = { ...initialModelState(), laidOut: true };
    s = modelReducer(s, { type: "move", id: "a", position: { x: 10, y: 20 } });

    s = modelReducer(s, { type: "switch-view", to: "detailed", saved: new Map() });
    expect(s.layoutView).toBe("detailed");
    expect(s.laidOut).toBe(false);
    // Summary's moved card does not follow into Detailed.
    expect(s.manualPositions.size).toBe(0);

    s = modelReducer(s, { type: "move", id: "b", position: { x: 5, y: 5 } });
    s = modelReducer(s, { type: "switch-view", to: "overview", saved: new Map() });
    expect([...s.manualPositions.keys()]).toEqual(["a"]);

    s = modelReducer(s, { type: "switch-view", to: "detailed", saved: new Map([["z", { x: 0, y: 0 }]]) });
    // This session's moves win over what was saved.
    expect([...s.manualPositions.keys()]).toEqual(["b"]);
  });

  it("uses the saved layout on a view's first visit", () => {
    const s = modelReducer(initialModelState(), { type: "switch-view", to: "detailed", saved: new Map([["z", { x: 1, y: 2 }]]) });
    expect(s.manualPositions.get("z")).toEqual({ x: 1, y: 2 });
  });

  it("does nothing when the view is already shown", () => {
    const s0 = initialModelState();
    expect(modelReducer(s0, { type: "switch-view", to: "overview", saved: new Map() })).toBe(s0);
  });
});
