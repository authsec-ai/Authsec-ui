import { describe, expect, it } from "vitest";

import type { Connection, ConnectionProvider } from "@/app/api/connectionsApi";

import { connectionCrumb, graphSentence } from "./connectionModel";

function unrevisioned(provider: ConnectionProvider): Connection {
  return { provider, graph: { state: "unrevisioned", rev: null, published_at: null } } as Connection;
}

describe("graphSentence", () => {
  it("speaks of the connection's own provider when its graph has no publication", () => {
    expect(graphSentence(unrevisioned("azure"))).toMatch(/^Azure inventory/);
    expect(graphSentence(unrevisioned("azure"))).not.toMatch(/Kubernetes|sweep/);
    expect(graphSentence(unrevisioned("k8s"))).toMatch(/^Kubernetes inventory .* sweep/);
    expect(graphSentence(unrevisioned("github"))).toMatch(/^GitHub inventory/);
  });

  it("names no provider it does not know", () => {
    expect(graphSentence(unrevisioned("gcp"))).not.toMatch(/Kubernetes|Azure|GitHub/);
  });
});

describe("connectionCrumb", () => {
  it("never falls back to the URL's id", () => {
    expect(connectionCrumb({ name: "k3s-master" } as Connection, false)).toBe("k3s-master");
    expect(connectionCrumb(undefined, true)).toBe("Not found");
    expect(connectionCrumb(undefined, false)).toBe("Connection");
  });
});
