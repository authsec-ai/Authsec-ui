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
import { AzureTerm } from "@/features/discovery/cloud/azure/AzureTerm";
import { azureExplain } from "@/features/discovery/cloud/azure/azureGlossary";
import { HoverExplain } from "@/features/iga/shared/components/HoverExplain";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { azureAgentSignIn } from "./model";

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

/** `explain`: a short explanation above the badge on hover (Azure), instead of the browser's title tip. */
export function SightingStatus({ status, explain = false }: { status: DiscoveredAgentStatus; explain?: boolean }) {
  return (
    <HoverExplain title={STATUS_LABELS[status]} text={explain ? azureExplain(STATUS_LABELS[status]) : undefined}>
      <span title={explain ? undefined : "What a person has decided about this sighting"}>
        <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusBadge>
      </span>
    </HoverExplain>
  );
}

export function SightingRuntime({ runtime, explain = false }: { runtime: RuntimeStatus; explain?: boolean }) {
  return (
    <HoverExplain title={RUNTIME_STATUS_LABELS[runtime]} text={explain ? azureExplain(RUNTIME_STATUS_LABELS[runtime]) : undefined}>
      <span title={explain ? undefined : "What was last observed"}>
        <StatusBadge tone={RUNTIME_TONE[runtime]}>{RUNTIME_STATUS_LABELS[runtime]}</StatusBadge>
      </span>
    </HoverExplain>
  );
}

const EVIDENCE_TITLE = {
  observed: "Seen running in a live environment.",
  declared: "Found written down in code — a CI/CD workflow, manifest or infrastructure file. It may or may not have ever run.",
  inferred: "Deduced from indirect signal; the weakest form of evidence.",
} as const;

// Azure: what "declared" and "inferred" mean there.
const AZURE_EVIDENCE_TITLE = {
  observed: EVIDENCE_TITLE.observed,
  declared: "Listed by Microsoft as an agent: in Microsoft Entra Agent ID or the Microsoft 365 agent registry.",
  inferred: "Inferred by AuthSec from the identity's sign-ins, permissions and federation. Microsoft does not list it as an agent.",
} as const;

export function SightingEvidence({ agent }: { agent: DiscoveredAgent }) {
  const mode = evidenceModeOf(agent);
  return (
    <span title={(agent.source === "azure" ? AZURE_EVIDENCE_TITLE : EVIDENCE_TITLE)[mode]}>
      <StatusBadge tone={mode === "observed" ? "success" : mode === "declared" ? "info" : "neutral"}>
        {agent.source === "azure" && mode === "declared" ? "Listed by Microsoft" : EVIDENCE_LABELS[mode]}
      </StatusBadge>
    </span>
  );
}

/**
 * Azure: the agent's sign-in in Microsoft's terms, in place of the running /
 * stopped badge (Azure has no "running" state for an agent).
 */
export function AzureLastSignIn({ agent }: { agent: DiscoveredAgent }) {
  const s = azureAgentSignIn(agent);
  if (s.kind === "deleted") {
    return (
      <AzureTerm term="Deleted from Azure">
        <StatusBadge tone="neutral">Deleted from Azure</StatusBadge>
      </AzureTerm>
    );
  }
  if (s.kind === "signed_in") return <Timestamp iso={s.at} />;
  const label = s.kind === "active" ? "Active in the last 7 days" : "No sign-in recorded";
  return <AzureTerm term={label} className="text-(--color-text-muted)" />;
}

/** Azure: the team's review, shown only once someone has reviewed the agent. */
export function AzureReview({ status }: { status: DiscoveredAgentStatus }) {
  return status === "unregistered" ? null : <SightingStatus status={status} explain />;
}
