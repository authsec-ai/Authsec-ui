import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { visualEdgeId } from "../model";
import {
  attemptObservedEdge,
  deniedObservedEdge,
  directoryBackingEdge,
  k8sGrantEdge,
  observedEdge,
} from "../../__fixtures__/v2/readers";
import { EdgeClassLegend } from "./EdgeClassLegend";
import { classifyEdge, edgeClassLabel, grantHonestyText, referenceStatusLabel } from "./edgeClass";

describe("edge classification", () => {
  it("keeps declared, observed and directory backing apart", () => {
    expect(classifyEdge(observedEdge)).toBe("observed");
    expect(classifyEdge(directoryBackingEdge)).toBe("directory_backing");
    expect(classifyEdge(k8sGrantEdge)).toBe("declared");
    expect(edgeClassLabel(directoryBackingEdge)).toBe("directory backing");
    expect(grantHonestyText(k8sGrantEdge)).toBe("partial / unknown");
    expect(edgeClassLabel(observedEdge)).toBe("Observed · Success");
    expect(edgeClassLabel(deniedObservedEdge)).toContain("Denied");
    expect(edgeClassLabel(attemptObservedEdge)).toContain("Attempt");
  });

  it("labels reference status from the server value", () => {
    expect(referenceStatusLabel("referenced")).toBe("Referenced");
    expect(referenceStatusLabel("observed")).toBe("Observed");
    expect(referenceStatusLabel("inventoried")).toBe("Inventoried");
  });

  it("does not change the visual id of a default edge", () => {
    expect(visualEdgeId("a", "b", { kind: "grant" })).toBe("a=>b:grant");
    expect(visualEdgeId("a", "b", observedEdge)).not.toBe(visualEdgeId("a", "b", { kind: "observed_access" }));
  });
});

describe("v2 wording", () => {
  it("does not call a traversal effective access", () => {
    const view = render(
      <EdgeClassLegend edges={[observedEdge, deniedObservedEdge, attemptObservedEdge, directoryBackingEdge, k8sGrantEdge]} />,
    );
    const text = view.container.textContent ?? "";
    expect(text.toLowerCase()).not.toContain("effective access");
    expect(text).toContain("directory backing");
    expect(text.toLowerCase()).not.toContain("kerberos");
    expect(text).toContain("partial / unknown");
    expect(text).not.toMatch(/\buses\b/);
  });
});
