/**
 * ActionDetailDrawer — right-side drawer showing full detail of a single action (UG06).
 *
 * Opens on row click in ActionsTab. Shows:
 *  - Immutable evidence: normalized operation, actual outcome, policy decision
 *  - Identity-at-time with current mapping shown separately (never merged)
 *  - Native hook/broker info
 *  - Timestamps (observed_at, received_at, indexed_at), count/aggregation
 *  - Correlation IDs, evidence refs
 *  - Actions toolbar: "View in graph", "View policy revision", "Block/Deny this access"
 *
 * CRITICAL: Unknown outcome is NEVER colored as allow (green). Uses neutral grey.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ban,
  FileText,
  Loader2,
  Network,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { Panel, Facts, Fact, CopyValue, Meta } from "../shared/components/Panel";
import { announce } from "../shared/announce";
import { usePrepareContextMutation, type PolicyContextRef } from "../policy/policyApi";

import { useGetActionQuery, type ActionDetail, type ActionOutcome } from "./ActionsApi";
import { ActionEvidence, type ActionEvidenceData } from "./ActionEvidence";

/* ─────────────────────────── Outcome display ────────────────────────────── */

/**
 * CRITICAL: Unknown outcome must NEVER be colored as allow (green).
 * Uses neutral grey for unknown. Completed is intentionally not "success green"
 * for actions — it is informational only.
 */
const OUTCOME_TONE: Record<string, string> = {
  completed: "bg-(--color-success-soft) text-(--color-success-text)",
  attempted: "bg-(--color-info-soft) text-(--color-info-text)",
  failed: "bg-(--color-danger-soft) text-(--color-danger-text)",
  denied: "bg-(--color-warning-soft) text-(--color-warning-text)",
  contained: "bg-(--color-warning-soft) text-(--color-warning-text)",
  unknown: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};

function OutcomeBadge({ outcome }: { outcome: ActionOutcome }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize",
        OUTCOME_TONE[outcome] ?? OUTCOME_TONE.unknown,
      )}
    >
      {outcome}
    </span>
  );
}

/* ─────────────────────────── Timestamp row ───────────────────────────────── */

function Timestamp({ label, iso }: { label: string; iso: string | null | undefined }) {
  if (!iso) return null;
  return (
    <Fact label={label}>
      <time dateTime={iso} className="tabular-nums text-xs">
        {new Date(iso).toLocaleString()}
      </time>
    </Fact>
  );
}

/* ─────────────────────────── Evidence extraction ─────────────────────────── */

/** Extract structured evidence from the raw_event and enrichment fields. */
function extractEvidence(action: ActionDetail): ActionEvidenceData {
  const raw = action.raw_event ?? {};
  const enrichment = action.enrichment ?? {};

  return {
    source_sensor: action.source_sensor
      ? {
          name: action.source_sensor,
          version: (raw.sensor_version as string) ?? null,
        }
      : null,
    phase: (raw.phase as ActionEvidenceData["phase"]) ?? null,
    result: (raw.result as ActionEvidenceData["result"]) ?? null,
    credential_provenance: enrichment.credential_provenance
      ? (enrichment.credential_provenance as ActionEvidenceData["credential_provenance"])
      : null,
    mapping_provenance: enrichment.mapping_provenance
      ? (enrichment.mapping_provenance as ActionEvidenceData["mapping_provenance"])
      : null,
    enforcement_refs: enrichment.enforcement_refs
      ? (enrichment.enforcement_refs as ActionEvidenceData["enforcement_refs"])
      : null,
  };
}

/* ─────────────────────────── Props ──────────────────────────────────────── */

export interface ActionDetailDrawerProps {
  /** The action ID to fetch and display. Null when closed. */
  actionId: string | null;
  /** Workspace ID for cross-navigation. */
  workspaceId: string;
  /** Workload ID for cross-navigation and policy context. */
  workloadId: string;
  /** Called when the drawer should close. */
  onClose: () => void;
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function ActionDetailDrawer({
  actionId,
  workspaceId,
  workloadId,
  onClose,
}: ActionDetailDrawerProps) {
  const open = actionId !== null;
  const navigate = useNavigate();

  // Fetch full action detail
  const { data, isLoading, isError } = useGetActionQuery(
    { actionId: actionId! },
    { skip: !actionId },
  );
  const action = data?.data;

  // Block/Deny context preparation
  const [prepareContext, { isLoading: blockDenyLoading }] = usePrepareContextMutation();
  const [blockDenyError, setBlockDenyError] = useState<string | null>(null);

  /** Navigate to Identity Graph tab with the execution identity node selected. */
  const handleViewInGraph = useCallback(() => {
    if (!action) return;
    const base = `/iga/estate/${encodeURIComponent(workloadId)}/identity-graph`;
    navigate(base);
    onClose();
  }, [action, workloadId, navigate, onClose]);

  /** Navigate to the policy revision that matched this action. */
  const handleViewPolicyRevision = useCallback(() => {
    if (!action?.policy_revision || !action?.policy_match) return;
    navigate(`/iga/policies/${encodeURIComponent(action.policy_match)}`);
    onClose();
  }, [action, navigate, onClose]);

  /** Block/Deny this access: prepare context and navigate to policy editor. */
  const handleBlockDeny = useCallback(async () => {
    if (!action) return;
    setBlockDenyError(null);

    const refs: PolicyContextRef[] = [
      {
        ref: action.workload_id ?? workloadId,
        kind: "workload",
        label: action.workload_name ?? undefined,
      },
    ];

    try {
      const ctx = await prepareContext({
        selected_refs: refs,
      }).unwrap();

      if (!ctx.publishable) {
        const reason = ctx.reason ?? "This action cannot produce a publishable policy draft.";
        setBlockDenyError(reason);
        announce(reason);
        return;
      }

      onClose();
      navigate(`/iga/policies/from-graph/${ctx.context_id}`);
    } catch (err: unknown) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Failed to prepare policy context";
      setBlockDenyError(typeof msg === "string" ? msg : "Failed to prepare policy context");
      announce("Could not prepare policy context. Try again.");
    }
  }, [action, workloadId, prepareContext, navigate, onClose]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        hideClose
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <SheetHeader className="border-b border-(--color-border-subtle) px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-sm font-semibold leading-5">
                Action detail
              </SheetTitle>
              {action ? (
                <SheetDescription className="mt-0.5 truncate font-mono text-xs text-(--color-text-muted)">
                  {action.id}
                </SheetDescription>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-7 shrink-0 place-items-center rounded-sm text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="space-y-4 px-4 py-4">
          {isLoading ? (
            <div
              className="flex items-center justify-center py-16"
              role="status"
              aria-busy="true"
              aria-label="Loading action detail"
            >
              <Loader2 className="size-6 animate-spin text-(--color-text-muted)" />
            </div>
          ) : isError || !action ? (
            <div className="py-8 text-center">
              <p className="text-sm text-(--color-danger-text)">
                Could not load action detail.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* ── Actions toolbar ─────────────────────────────────── */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleViewInGraph}
                >
                  <Network className="size-3.5" />
                  View in graph
                </Button>

                {action.policy_match ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={handleViewPolicyRevision}
                  >
                    <FileText className="size-3.5" />
                    View policy revision
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs text-(--color-destructive-text)"
                  onClick={() => void handleBlockDeny()}
                  disabled={blockDenyLoading}
                >
                  {blockDenyLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Ban className="size-3.5" />
                  )}
                  Block / Deny this access
                </Button>
              </div>

              {blockDenyError ? (
                <p className="text-xs text-(--color-destructive-text)">
                  {blockDenyError}
                </p>
              ) : null}

              {/* ── Immutable evidence ──────────────────────────────── */}
              <Panel title="Observed action">
                <Facts>
                  <Fact label="Operation">
                    <span className="font-mono text-xs">{action.operation}</span>
                  </Fact>
                  <Fact label="Resource">
                    <span
                      className="break-all font-mono text-xs"
                      title={action.resource}
                    >
                      {action.resource}
                    </span>
                  </Fact>
                  <Fact label="Event family">
                    <span className="capitalize">
                      {action.event_family.replace(/_/g, " ")}
                    </span>
                  </Fact>
                  <Fact label="Outcome">
                    <OutcomeBadge outcome={action.outcome} />
                  </Fact>
                  {action.count > 1 ? (
                    <Fact label="Count">
                      <span className="tabular-nums font-medium">
                        {action.count.toLocaleString()}
                      </span>
                      <Meta>
                        This action was aggregated from {action.count} observations.
                      </Meta>
                    </Fact>
                  ) : null}
                </Facts>
              </Panel>

              {/* ── Policy decision ─────────────────────────────────── */}
              <Panel title="Policy decision">
                <Facts>
                  <Fact label="Policy match">
                    {action.policy_match ? (
                      <span className="font-mono text-xs">{action.policy_match}</span>
                    ) : (
                      <span className="text-(--color-text-muted)">No policy matched</span>
                    )}
                  </Fact>
                  {action.policy_revision ? (
                    <Fact label="Revision" mono>
                      {action.policy_revision}
                    </Fact>
                  ) : null}
                  {action.policy_rule ? (
                    <Fact label="Rule" mono>
                      {action.policy_rule}
                    </Fact>
                  ) : null}
                  <Fact label="Control match">
                    {action.control_match ? (
                      <span className="font-mono text-xs">{action.control_match}</span>
                    ) : (
                      <span className="text-(--color-text-muted)">No control matched</span>
                    )}
                  </Fact>
                </Facts>
              </Panel>

              {/* ── Identity at time ────────────────────────────────── */}
              <Panel
                title="Identity at time"
                description="The identity that performed this action at the time it was observed. Shown separately from the current mapping."
              >
                <Facts>
                  <Fact label="Execution identity">
                    <CopyValue
                      value={action.execution_identity}
                      what="Execution identity"
                    />
                  </Fact>
                  {action.attribution_chain.length > 0 ? (
                    <Fact label="Attribution chain">
                      <ul className="space-y-1">
                        {action.attribution_chain.map((attr, i) => (
                          <li
                            key={`${attr}-${i}`}
                            className="break-all font-mono text-xs"
                          >
                            {attr}
                          </li>
                        ))}
                      </ul>
                    </Fact>
                  ) : null}
                </Facts>
              </Panel>

              {/* ── Native hook / broker info ───────────────────────── */}
              <Panel title="Native info">
                <Facts>
                  {action.enforcement_backend ? (
                    <Fact label="Enforcement backend">
                      {action.enforcement_backend}
                    </Fact>
                  ) : null}
                  {action.runtime_instance ? (
                    <Fact label="Runtime instance" mono>
                      {action.runtime_instance}
                    </Fact>
                  ) : null}
                  {action.source_sensor ? (
                    <Fact label="Source sensor">
                      {action.source_sensor}
                    </Fact>
                  ) : null}
                  {action.host ? (
                    <Fact label="Host" mono>
                      {action.host}
                    </Fact>
                  ) : null}
                  {action.collector_id ? (
                    <Fact label="Collector" mono>
                      {action.collector_id}
                    </Fact>
                  ) : null}
                  {action.account ? (
                    <Fact label="Account" mono>
                      {action.account}
                    </Fact>
                  ) : null}
                </Facts>
              </Panel>

              {/* ── Timestamps ──────────────────────────────────────── */}
              <Panel title="Timestamps">
                <Facts>
                  <Timestamp label="Observed at" iso={action.observed_at} />
                  {action.raw_event ? (
                    <>
                      <Timestamp
                        label="Received at"
                        iso={action.raw_event.received_at as string | undefined}
                      />
                      <Timestamp
                        label="Indexed at"
                        iso={action.raw_event.indexed_at as string | undefined}
                      />
                    </>
                  ) : null}
                </Facts>
              </Panel>

              {/* ── Correlation IDs ─────────────────────────────────── */}
              {action.labels &&
              Object.keys(action.labels).length > 0 ? (
                <Panel title="Correlation IDs & Labels">
                  <Facts>
                    {Object.entries(action.labels).map(([k, v]) => (
                      <Fact key={k} label={k} mono>
                        {v}
                      </Fact>
                    ))}
                  </Facts>
                </Panel>
              ) : null}

              {/* ── Structured evidence ─────────────────────────────── */}
              <ActionEvidence evidence={extractEvidence(action)} />

              {/* ── Workload ────────────────────────────────────────── */}
              {action.workload_id ? (
                <Panel title="Workload">
                  <Facts>
                    <Fact label="Name">
                      {action.workload_name ?? (
                        <span className="text-(--color-text-muted)">
                          Unnamed
                        </span>
                      )}
                    </Fact>
                    <Fact label="ID" mono>
                      {action.workload_id}
                    </Fact>
                  </Facts>
                </Panel>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
