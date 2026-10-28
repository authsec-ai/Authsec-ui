/**
 * ActionEvidence — structured evidence component used inside ActionDetailDrawer (UG06).
 *
 * Shows:
 *  - Source sensor info (name, version)
 *  - Phase: attempt / exec / complete
 *  - Result: success / denied / error / unknown
 *  - Provenance chain: credential provenance and mapping provenance
 *  - Enforcement refs: assignment_id, rule_id, control_id (each as links)
 */

import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { Panel, Facts, Fact, Meta } from "../shared/components/Panel";

/* ─────────────────────────── Types ──────────────────────────────────────── */

export interface CredentialProvenance {
  method: string;
  source: string;
  resolved_at: string | null;
}

export interface MappingProvenance {
  resolver: string;
  source: string;
  mapped_at: string | null;
  ambiguous: boolean;
}

export interface EnforcementRefs {
  assignment_id?: string | null;
  rule_id?: string | null;
  control_id?: string | null;
}

export interface SourceSensor {
  name: string;
  version?: string | null;
}

export type EvidencePhase = "attempt" | "exec" | "complete" | "unknown";
export type EvidenceResult = "success" | "denied" | "error" | "unknown";

export interface ActionEvidenceData {
  source_sensor?: SourceSensor | null;
  phase?: EvidencePhase | null;
  result?: EvidenceResult | null;
  credential_provenance?: CredentialProvenance | null;
  mapping_provenance?: MappingProvenance | null;
  enforcement_refs?: EnforcementRefs | null;
}

/* ─────────────────────────── Result badge ────────────────────────────────── */

const RESULT_TONE: Record<string, string> = {
  success: "bg-(--color-success-soft) text-(--color-success-text)",
  denied: "bg-(--color-warning-soft) text-(--color-warning-text)",
  error: "bg-(--color-danger-soft) text-(--color-danger-text)",
  unknown: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};

function ResultBadge({ result }: { result: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
        RESULT_TONE[result] ?? RESULT_TONE.unknown,
      )}
    >
      {result}
    </span>
  );
}

/* ─────────────────────────── Phase badge ─────────────────────────────────── */

const PHASE_TONE: Record<string, string> = {
  attempt: "bg-(--color-info-soft) text-(--color-info-text)",
  exec: "bg-(--color-primary-soft) text-(--color-primary-text)",
  complete: "bg-(--color-success-soft) text-(--color-success-text)",
  unknown: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
        PHASE_TONE[phase] ?? PHASE_TONE.unknown,
      )}
    >
      {phase}
    </span>
  );
}

/* ─────────────────────────── Enforcement ref link ────────────────────────── */

function EnforcementRefLink({
  label,
  value,
  to,
}: {
  label: string;
  value: string;
  to?: string;
}) {
  if (to) {
    return (
      <Fact label={label}>
        <Link
          to={to}
          className="inline-flex items-center gap-1 font-mono text-xs text-(--color-primary-text) hover:underline"
        >
          {value}
          <ExternalLink className="size-3 shrink-0" />
        </Link>
      </Fact>
    );
  }
  return (
    <Fact label={label} mono>
      {value}
    </Fact>
  );
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function ActionEvidence({ evidence }: { evidence: ActionEvidenceData }) {
  const sensor = evidence.source_sensor;
  const cred = evidence.credential_provenance;
  const mapping = evidence.mapping_provenance;
  const refs = evidence.enforcement_refs;
  const hasSensor = sensor?.name;
  const hasProvenance = cred || mapping;
  const hasRefs = refs?.assignment_id || refs?.rule_id || refs?.control_id;

  if (!hasSensor && !evidence.phase && !evidence.result && !hasProvenance && !hasRefs) {
    return (
      <Panel title="Evidence">
        <p className="text-xs text-(--color-text-muted)">
          No structured evidence is available for this action.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source sensor + phase + result */}
      <Panel title="Source sensor">
        <Facts>
          {sensor?.name ? (
            <Fact label="Sensor">{sensor.name}</Fact>
          ) : null}
          {sensor?.version ? (
            <Fact label="Version" mono>
              {sensor.version}
            </Fact>
          ) : null}
          {evidence.phase ? (
            <Fact label="Phase">
              <PhaseBadge phase={evidence.phase} />
            </Fact>
          ) : null}
          {evidence.result ? (
            <Fact label="Result">
              <ResultBadge result={evidence.result} />
            </Fact>
          ) : null}
        </Facts>
      </Panel>

      {/* Provenance chain */}
      {hasProvenance ? (
        <Panel title="Provenance chain">
          {cred ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-(--color-text-muted)">
                Credential provenance
              </h4>
              <Facts>
                <Fact label="Method">{cred.method}</Fact>
                <Fact label="Source" mono>
                  {cred.source}
                </Fact>
                {cred.resolved_at ? (
                  <Fact label="Resolved at">
                    <time dateTime={cred.resolved_at} className="tabular-nums">
                      {new Date(cred.resolved_at).toLocaleString()}
                    </time>
                  </Fact>
                ) : null}
              </Facts>
            </div>
          ) : null}

          {mapping ? (
            <div className={cn("space-y-2", cred && "mt-4")}>
              <h4 className="text-xs font-semibold text-(--color-text-muted)">
                Mapping provenance
              </h4>
              <Facts>
                <Fact label="Resolver">{mapping.resolver}</Fact>
                <Fact label="Source" mono>
                  {mapping.source}
                </Fact>
                {mapping.mapped_at ? (
                  <Fact label="Mapped at">
                    <time dateTime={mapping.mapped_at} className="tabular-nums">
                      {new Date(mapping.mapped_at).toLocaleString()}
                    </time>
                  </Fact>
                ) : null}
                <Fact label="Ambiguous">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                      mapping.ambiguous
                        ? "bg-(--color-warning-soft) text-(--color-warning-text)"
                        : "bg-(--color-success-soft) text-(--color-success-text)",
                    )}
                  >
                    {mapping.ambiguous ? "Yes" : "No"}
                  </span>
                </Fact>
              </Facts>
              {mapping.ambiguous ? (
                <Meta>
                  This mapping is ambiguous: the resolver could not uniquely determine the
                  identity from the credential. Treat the attributed identity with caution.
                </Meta>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Enforcement references */}
      {hasRefs ? (
        <Panel title="Enforcement references">
          <Facts>
            {refs!.assignment_id ? (
              <EnforcementRefLink
                label="Assignment"
                value={refs!.assignment_id}
              />
            ) : null}
            {refs!.rule_id ? (
              <EnforcementRefLink
                label="Rule"
                value={refs!.rule_id}
              />
            ) : null}
            {refs!.control_id ? (
              <EnforcementRefLink
                label="Control"
                value={refs!.control_id}
              />
            ) : null}
          </Facts>
        </Panel>
      ) : null}
    </div>
  );
}
