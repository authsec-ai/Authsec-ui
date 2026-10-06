import { describe, expect, it } from "vitest";

import type { LogEvent, LogKind } from "./fixtures";
import { linkRetries } from "./retries";

const ev = (id: string, kind: LogKind, source: string, minute: number): LogEvent => ({
  id,
  at: new Date(Date.UTC(2026, 9, 6, 10, minute)).toISOString(),
  kind,
  actor: { id: "scanner", label: "Scanner", type: "system" },
  source: { id: source, label: source },
  object: { id, kind: "scan", name: id, what: "Scan" },
  sentence: id,
  outcome: "",
  raw: {},
});

describe("linkRetries", () => {
  it("links a failure to the next success of the same source", () => {
    const { recoveredBy, retryOf } = linkRetries([
      ev("ok", "scan_finished", "a", 30),
      ev("fail", "scan_failed", "a", 10),
      ev("other", "scan_finished", "b", 20),
    ]);
    expect(recoveredBy.get("fail")?.id).toBe("ok");
    expect(retryOf.get("ok")?.id).toBe("fail");
    expect(retryOf.has("other")).toBe(false);
  });

  it("leaves a failure with no later success unrecovered", () => {
    const { recoveredBy } = linkRetries([ev("ok", "scan_finished", "a", 5), ev("fail", "scan_failed", "a", 10)]);
    expect(recoveredBy.has("fail")).toBe(false);
  });

  it("recovers consecutive failures with one success, naming the latest", () => {
    const { recoveredBy, retryOf } = linkRetries([
      ev("f1", "scan_failed", "a", 1),
      ev("f2", "scan_failed", "a", 2),
      ev("ok", "scan_finished", "a", 3),
    ]);
    expect(recoveredBy.get("f1")?.id).toBe("ok");
    expect(recoveredBy.get("f2")?.id).toBe("ok");
    expect(retryOf.get("ok")?.id).toBe("f2");
  });
});
