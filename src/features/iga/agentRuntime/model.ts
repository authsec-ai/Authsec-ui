/**
 * Words and small helpers shared by the agent-runtime screens
 * (SPEC-agent-runtime-visibility.md §1, §5.7, §5.8).
 *
 * The three labels are exact and mean different things:
 *   AI workload      calls a model. Evidence only; NOT an agent.
 *   Suggested agent  an AI workload that also acted on other resources. A suggestion.
 *   Agent            declared by a platform, or classified by a person.
 */

import { classifyPolicyError, describeFailure, type PolicyFailure } from "../policy/shared";
import type { AICoverage, AgentLabel, ContainState, DetectionId } from "@/app/api/igaAgentRuntimeApi";
import type { ConsoleTone } from "@/components/console/status";

export const LABEL_TEXT: Record<AgentLabel, string> = {
  ai_workload: "AI workload",
  suggested_agent: "Suggested agent",
  agent: "Agent",
};

export const LABEL_TONE: Record<AgentLabel, ConsoleTone> = {
  ai_workload: "neutral",
  suggested_agent: "warning",
  agent: "info",
};

export const LABEL_HINT: Record<AgentLabel, string> = {
  ai_workload: "Seen calling a model. This is evidence only; it is not classified as an agent.",
  suggested_agent: "Also acted on other resources under its own identity. A suggestion until a person classifies it.",
  agent: "Declared by its platform, or classified as an agent by a person.",
};

/** services detect.Name (internal/agentruntime/detect/detect.go). */
export const DETECTION_NAME: Record<DetectionId, string> = {
  D1: "Read a secret",
  D2: "Created credentials",
  D3: "Changed IAM",
  D4: "Weakened logging",
  D5: "Acted outside its grant",
  D6: "New model or volume spike",
  D7: "New role assumption",
  D8: "Model call from an unexpected place",
};

export const DETECTION_IDS = Object.keys(DETECTION_NAME) as DetectionId[];

export function detectionText(id: string): string {
  return DETECTION_NAME[id as DetectionId] ?? id;
}

export const FINDING_TEXT: Record<string, string> = {
  shared_role: "Shared role",
  human_credentials: "Human credentials",
  long_lived_key: "IAM user with long-lived key",
  model_key_secret: "Model-key secret",
};

export const CONTAIN_LEVEL_TEXT: Record<string, { title: string; short: string }> = {
  workload: { title: "Workload", short: "Stops only this workload" },
  model: { title: "Model access", short: "Denies Bedrock on the role" },
  identity: { title: "Identity", short: "Denies everything on the role and revokes its sessions" },
};

export const CONTAIN_STATE_TEXT: Record<ContainState, { label: string; tone: ConsoleTone }> = {
  previewed: { label: "Previewed", tone: "neutral" },
  containing: { label: "Containing", tone: "info" },
  contained: { label: "Contained", tone: "success" },
  partially_contained: { label: "Partially contained", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  releasing: { label: "Releasing", tone: "info" },
  released: { label: "Released", tone: "neutral" },
};

/** The request failed in a way that means "this server does not serve it". */
export function classifyAr(error: unknown): PolicyFailure | null {
  const f = classifyPolicyError(error);
  // A 503 with any code (agent_containment_unavailable, ...) is the gate, not a failure.
  if (f && f.status === 503 && f.kind === "failed") return { ...f, kind: "unavailable" };
  return f;
}

/** The backend's own words first: they name the permission or the refusal. */
export function failureText(f: PolicyFailure): string {
  if (f.kind === "unavailable") {
    const reason = typeof f.detail?.reason === "string" ? f.detail.reason : "";
    return `Not available on this server${reason ? `: ${reason}` : f.message ? `: ${f.message}` : "."}`;
  }
  if (f.message && f.kind !== "member_session") return f.message;
  const d = describeFailure(f);
  return [d.title, d.fix].filter(Boolean).join(". ");
}

/** "3 Jan 2026, 14:02": the coverage ends of a window. */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** What the evidence covers, said honestly: never "no calls" past it. */
export function coverageText(c: AICoverage): string {
  if (!c.from && !c.to) return "No window recorded";
  return `${shortTime(c.from)} to ${shortTime(c.to)}${c.partial ? " (partial)" : ""}`;
}

export function topEntries(m: Record<string, number> | null | undefined): [string, number][] {
  return Object.entries(m ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function newOperationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
}

/** `subject_label` is the label the identity had when the alert opened. */
export function subjectLabelText(l: string): string {
  return LABEL_TEXT[l as AgentLabel] ?? l.replace(/_/g, " ");
}

export function chipButtonClass(on: boolean): string {
  return `inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors ${
    on
      ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
      : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
  }`;
}
