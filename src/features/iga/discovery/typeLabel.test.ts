import { describe, expect, it } from "vitest";

import { TYPE_LABEL, typeLabel } from "./urlState";

describe("typeLabel", () => {
  it("gives Azure's agent tabs names that say what they list", () => {
    expect(typeLabel("azure", "agents")).toBe("Entra Agent ID");
    expect(typeLabel("azure", "sightings")).toBe("All agents");
  });

  it("keeps Azure's other tabs as they are", () => {
    expect(typeLabel("azure", "identities")).toBe(TYPE_LABEL.identities);
    expect(typeLabel("azure", "resources")).toBe(TYPE_LABEL.resources);
    expect(typeLabel("azure", "workloads")).toBe(TYPE_LABEL.workloads);
  });

  it("leaves every other provider unchanged", () => {
    expect(typeLabel("k8s", "sightings")).toBe("Sightings");
    expect(typeLabel("github", "sightings")).toBe("Sightings");
    expect(typeLabel("aws", "identities")).toBe("Identities");
    expect(typeLabel(undefined, "sightings")).toBe("Sightings");
  });
});
