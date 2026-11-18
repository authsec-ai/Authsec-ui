import { describe, expect, it } from "vitest";

import type { Connection, ConnectionProvider } from "@/app/api/connectionsApi";

import {
  actionsOf,
  connectionCrumb,
  graphSentence,
  isConnectionProvider,
  lastScanText,
  primaryOf,
  providerWord,
  revokeWord,
  statusOf,
  typeWord,
} from "./connectionModel";

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

/** A machine (authsec-cli daemon) as the connections read reports it. */
function machine(over: Partial<Connection> = {}): Connection {
  const recent = new Date(Date.now() - 30_000).toISOString();
  return {
    id: "m1",
    provider: "machine",
    scope_kind: "machine",
    name: "victus-lin",
    native_id: "victus-lin",
    scope_id: "",
    created_at: recent,
    connection: { state: "connected", reason_code: null, verified_at: recent },
    scan: { state: "finished", at: recent, run_id: null, heartbeat_at: recent, reports_every_seconds: 60 },
    coverage: { state: "unknown", gaps: [] },
    graph: { state: "not_applicable", rev: null, published_at: null },
    scope_summary: "3 agents",
    discovery: { ready: true, as_of: recent },
    capabilities: { scan: false, verify: false, edit_scope: false, revoke: true, rules: false },
    ...over,
  } as Connection;
}

describe("machines are connections", () => {
  it("is named a machine, never another provider", () => {
    expect(isConnectionProvider("machine")).toBe(true);
    expect(providerWord("machine")).toBe("Machine");
    expect(typeWord(machine())).toBe("Machine");
  });

  it("says when it last reported, not that it was scanned", () => {
    const c = machine();
    expect(primaryOf(c).key).toBe("connected");
    expect(statusOf(c).support).toMatch(/^Reporting, last report/);
    expect(lastScanText(c)).toMatch(/^Last report/);
    expect(lastScanText(machine({ scan: { state: "never_run", at: null, run_id: null } }))).toBe("No report yet");
  });

  it("waits for, or misses, the machine, and says how to fix it", () => {
    const waiting = machine({ connection: { state: "not_verified", reason_code: "no_heartbeat", verified_at: null } });
    expect(primaryOf(waiting).label).toBe("Waiting for machine");
    expect(statusOf(waiting).support).toMatch(/Add machine/);
    const lost = machine({ connection: { state: "not_verified", reason_code: "heartbeat_lost", verified_at: null } });
    expect(primaryOf(lost).label).toBe("Machine not reporting");
    expect(statusOf(lost).support).toMatch(/authsec-cli daemon status/);
  });

  it("can only be removed, even once disabled", () => {
    expect(actionsOf(machine(), true)).toEqual({ scan: false, verify: false, editScope: false, rules: false, revoke: true });
    expect(actionsOf(machine({ connection: { state: "revoked", reason_code: "disabled", verified_at: null } }), true).revoke).toBe(true);
    expect(actionsOf(machine(), false).revoke).toBe(false);
    expect(revokeWord(machine()).verb).toBe("Remove connection");
  });
});
