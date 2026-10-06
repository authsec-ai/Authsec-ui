import { describe, expect, it } from "vitest";

import { columnOfKind, placeNewNodes } from "./layout";

describe("columnOfKind", () => {
  it("puts workloads, identities, statements and resources in that order, left to right", () => {
    const order = ["workload", "iam_role", "statement", "exact"].map(columnOfKind);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("keeps every identity in one column and every resource in the last", () => {
    expect(new Set(["iam_role", "iam_user", "iam_group"].map(columnOfKind))).toEqual(new Set([1]));
    expect(new Set(["exact", "selector", "external"].map(columnOfKind))).toEqual(new Set([3]));
    expect(columnOfKind("external_principal")).toBe(0);
  });
});

describe("placeNewNodes with columns", () => {
  const size = { width: 240, height: 60 };
  it("puts an expanded card in its own column, not beside the card that revealed it", () => {
    // Identity at x=300, resources already in their column at x=1000.
    const positions = new Map([
      ["role", { x: 300, y: 0 }],
      ["res-a", { x: 1000, y: 0 }],
    ]);
    const drawn = [
      { id: "role", size },
      { id: "res-a", size },
      { id: "res-b", size },
    ];
    const edges = [
      { from: "role", to: "res-a" },
      { from: "role", to: "res-b" },
    ];
    const col = (id: string) => (id === "role" ? 1 : 3);
    const added = placeNewNodes(drawn, edges, positions, col);
    expect(added.get("res-b")?.x).toBe(1000);
    // And never on top of the card already there.
    expect(added.get("res-b")?.y).not.toBe(0);
  });

  it("falls back to beside its anchor when its column has no card yet", () => {
    const positions = new Map([["role", { x: 300, y: 0 }]]);
    const added = placeNewNodes(
      [
        { id: "role", size },
        { id: "stmt", size },
      ],
      [{ from: "role", to: "stmt" }],
      positions,
      (id) => (id === "role" ? 1 : 2),
    );
    expect(added.get("stmt")!.x).toBeGreaterThan(300 + 240);
  });
});
