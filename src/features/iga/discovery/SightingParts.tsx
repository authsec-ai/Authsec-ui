/**
 * How a sighting reads: two independent axes rendered as two badges and never
 * merged, plus the evidence mode.
 *
 *   status         what a human DECIDED  (unregistered → registered → quarantined → ignored)
 *   runtime_status what was OBSERVED     (running ⇄ stopped → gone / unknown)
 *
 * A sighting can be registered and gone, or unregistered and running. And a
 * repository scan can only ever read a DECLARATION: a workflow file is a
 * statement of intent that may never have executed, so "declared" is said, not
 * left to read as "running".
 *
 * Sightings are READ-ONLY here (SPEC-console-revamp.md *Sightings actions*):
 * nothing in this file offers a decision.
 */

import {
  EVIDENCE_LABELS,
  RUNTIME_STATUS_LABELS,
  STATUS_LABELS,
  evidenceModeOf,
  type DiscoveredAgent,
  type DiscoveredAgentStatus,
  type RuntimeStatus,
} from "@/app/api/discoveryApi";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";

const STATUS_TONE: Record<DiscoveredAgentStatus, ConsoleTone> = {
  unregistered: "warning",
  registered: "success",
  quarantined: "danger",
  ignored: "neutral",
};

const RUNTIME_TONE: Record<RuntimeStatus, ConsoleTone> = {
  running: "neutral",
  stopped: "warning",
  gone: "neutral",
  unknown: "neutral",
};

export function SightingStatus({ status }: { status: DiscoveredAgentStatus }) {
  return (
    <span title="What a person has decided about this sighting">
      <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusBadge>
    </span>
  );
}

export function SightingRuntime({ runtime }: { runtime: RuntimeStatus }) {
  return (
    <span title="What was last observed">
      <StatusBadge tone={RUNTIME_TONE[runtime]}>{RUNTIME_STATUS_LABELS[runtime]}</StatusBadge>
    </span>
  );
}

const EVIDENCE_TITLE = {
  observed: "Seen running in a live environment.",
  declared: "Found written down in code — a CI/CD workflow, manifest or infrastructure file. It may or may not have ever run.",
  inferred: "Deduced from indirect signal; the weakest form of evidence.",
} as const;

export function SightingEvidence({ agent }: { agent: DiscoveredAgent }) {
  const mode = evidenceModeOf(agent);
  return (
    <span title={EVIDENCE_TITLE[mode]}>
      <StatusBadge tone={mode === "observed" ? "success" : mode === "declared" ? "info" : "neutral"}>{EVIDENCE_LABELS[mode]}</StatusBadge>
    </span>
  );
}
