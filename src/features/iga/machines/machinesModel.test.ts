import { describe, expect, it } from "vitest";

import type { AgentKitEvent } from "@/app/api/agentkitApi";
import type { DiscoveredAgent, DiscoverySource } from "@/app/api/discoveryApi";

import {
  accessRows,
  blockSentence,
  complianceTags,
  connectedMachine,
  eventTarget,
  eventTitle,
  machineAgentId,
  machineNameProblem,
  machineSetupCommands,
  policyProblem,
  quarantineState,
  starterPolicy,
  TAG_FILTERS,
  tagLabel,
} from "./machinesModel";

const ev = (over: Partial<AgentKitEvent>): AgentKitEvent => ({
  id: "e",
  discovery_source_id: "s",
  observed_at: "2026-11-13T00:00:00Z",
  received_at: "2026-11-13T00:00:00Z",
  type: "decision",
  kind: "",
  action: "",
  rule: "",
  severity: "",
  enforced: false,
  agent_id: "claude-code",
  agent_name: "Claude Code",
  agent_pid: 1,
  record: {},
  ...over,
});

describe("machine setup", () => {
  it("checks names", () => {
    expect(machineNameProblem("")).toMatch(/Name/);
    expect(machineNameProblem("dev laptop")).toMatch(/Letters/);
    expect(machineNameProblem("dev-laptop.local")).toBeNull();
  });
  it("fills every value and never puts the token in a flag", () => {
    const c = machineSetupCommands({
      name: "dev",
      apiUrl: "https://api.example.com/",
      workspaceId: "ws-1",
      ingestToken: "aid_x",
    });
    expect(c).toHaveLength(3);
    expect(c[1]).toContain(
      "--url https://api.example.com --workspace ws-1 --name dev --token-stdin",
    );
    expect(c[1]).toMatch(/^echo 'aid_x' \| sudo authsec-cli connect/);
    expect(c[2]).toBe("sudo authsec-cli daemon install");
  });
  it("finds the machine that registered under the name after the token", () => {
    const src = (over: Partial<DiscoverySource>) =>
      ({
        kind: "vm_sensor",
        cluster_name: "dev",
        updated_at: "2026-11-13T10:00:00Z",
        ...over,
      }) as DiscoverySource;
    const sources = [
      src({ id: "old", last_heartbeat_at: "2026-11-01T00:00:00Z" }),
      src({ id: "k8s", kind: "k8s_webhook" }),
    ];
    expect(
      connectedMachine(sources, "dev", "2026-11-13T09:00:00Z"),
    ).toBeUndefined();
    sources.push(src({ id: "new", last_heartbeat_at: "2026-11-13T09:05:00Z" }));
    expect(connectedMachine(sources, "dev", "2026-11-13T09:00:00Z")?.id).toBe(
      "new",
    );
  });
});

describe("agents", () => {
  it("reads the machine metadata", () => {
    const a = {
      metadata: { machine: { agent_id: "codex" } },
    } as unknown as DiscoveredAgent;
    expect(machineAgentId(a)).toBe("codex");
    expect(machineAgentId({ metadata: {} } as DiscoveredAgent)).toBe("");
  });
  it("tells a quarantine decided from one applied", () => {
    const base = {
      status: "quarantined",
      quarantine_enforcement_error: "",
    } as DiscoveredAgent;
    expect(quarantineState(base).word).toBe("Quarantine pending");
    expect(quarantineState({ ...base, quarantine_enforced_at: "x" }).word).toBe(
      "Quarantined",
    );
    expect(
      quarantineState({ ...base, quarantine_enforcement_error: "not root" })
        .tone,
    ).toBe("warning");
    expect(quarantineState({ ...base, status: "registered" }).word).toBe("");
  });
});

describe("logs", () => {
  it("labels OWASP tags and drops internal ones", () => {
    expect(tagLabel("owasp-agentic:ASI10-rogue-agents")).toEqual({
      id: "ASI10",
      label: "ASI10 Rogue agents",
    });
    expect(tagLabel("authsec:decision")).toBeNull();
    const e = ev({
      record: {
        tags: [
          "authsec:decision",
          "owasp-llm:LLM06-excessive-agency",
          "owasp-agentic:ASI02-tool-misuse",
          "owasp-llm:LLM06-excessive-agency",
        ],
      },
    });
    expect(complianceTags(e).map((t) => t.id)).toEqual(["LLM06", "ASI02"]);
  });
  it("words decisions by whether they were enforced", () => {
    expect(
      eventTitle(ev({ action: "deny", kind: "network", enforced: true })),
    ).toBe("Blocked network");
    expect(eventTitle(ev({ action: "deny", kind: "network" }))).toBe(
      "Would block network",
    );
    expect(eventTitle(ev({ action: "quarantine", kind: "agent" }))).toBe(
      "Quarantined",
    );
    expect(eventTitle(ev({ type: "detection", rule: "artex_present" }))).toBe(
      "Detected artex_present",
    );
  });
  it("names the target", () => {
    expect(
      eventTarget(
        ev({
          record: { dst: { ip: "1.2.3.4", host: "example.org", port: 443 } },
        }),
      ),
    ).toBe("example.org:443");
    expect(eventTarget(ev({ record: { path: "/home/a/.ssh/id_rsa" } }))).toBe(
      "/home/a/.ssh/id_rsa",
    );
  });
});

describe("access and block", () => {
  it("offers a block for each row it can deny", () => {
    const rows = accessRows({
      id: "claude-code",
      name: "Claude Code",
      files: [
        {
          path: "/home/a/.aws/credentials",
          access: "read",
          sensitive: true,
          count: 1,
          last: "",
        },
      ],
      destinations: [
        {
          host: "api.anthropic.com",
          ip: "1.1.1.1",
          port: 443,
          llm: true,
          count: 9,
          last: "",
        },
        { ip: "10.0.0.5", port: 6379, service: "redis", count: 2, last: "" },
      ],
      commands: [{ program: "git", count: 3, last: "" }],
      services: ["redis"],
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by["file:/home/a/.aws/credentials"].block).toEqual({
      type: "path",
      value: "/home/a/.aws/credentials",
    });
    expect(by["net:api.anthropic.com:443"].block).toEqual({
      type: "host",
      value: "api.anthropic.com",
      port: 443,
    });
    expect(by["net:10.0.0.5:6379"].block).toEqual({
      type: "cidr",
      value: "10.0.0.5",
      port: 6379,
    });
    expect(by["cmd:git"].block).toEqual({ type: "command", value: "git*" });
    expect(by["svc:redis"].block).toBeNull();
    expect(
      blockSentence("codex", { type: "host", value: "x.io", port: 443 }),
    ).toBe("Deny codex connections to x.io on port 443.");
  });
});

describe("policies", () => {
  it("starts agents in monitor mode with a valid head", () => {
    expect(policyProblem("codex", starterPolicy("codex"))).toBeNull();
    expect(policyProblem("*", starterPolicy("*"))).toBeNull();
  });
  it("catches a wrong head before the server does", () => {
    const doc = starterPolicy("codex");
    expect(policyProblem("aider", doc)).toMatch(/agent.id/);
    expect(
      policyProblem("codex", doc.replace("mode: monitor", "mode: on")),
    ).toMatch(/mode/);
    expect(policyProblem("codex", "")).toMatch(/empty/);
  });
});

describe("tags and addresses", () => {
  it("filters by the full tag a machine writes", () => {
    const f = TAG_FILTERS.find((t) => t.id === "ASI10");
    expect(f?.tag).toBe("owasp-agentic:ASI10-rogue-agents");
    expect(f?.label).toBe("ASI10 Rogue agents");
    expect(TAG_FILTERS).toHaveLength(6);
  });
  it("brackets IPv6 destinations", () => {
    expect(
      eventTarget(ev({ record: { dst: { ip: "2600:1901::1", port: 443 } } })),
    ).toBe("[2600:1901::1]:443");
  });
});
