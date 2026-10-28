/**
 * ProtectionOverlay — operation-specific badges showing enforcement state
 * on the workload overview tab (UG07).
 *
 * Shows:
 *  - Operation badges: e.g., "file: readable + write-denied"
 *  - Desired vs active state
 *  - Required/optional control coverage
 *  - Backend/profile info
 *  - Desired/active generation numbers
 *  - Latest verification time
 *  - Restart requirement indicator
 *  - Error display
 *  - "Partial" when rule family lacks coverage
 *  - "Unknown/Stale" when receipts are stale
 *
 * Uses the runtime-policy-status endpoint (real per Batch 6).
 */

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useGetWorkloadRuntimePolicyStatusQuery, type RuntimePolicyStatus } from "@/app/api/igaGraphApi";

import { Panel, Facts, Fact } from "../shared/components/Panel";
import { ProtectionBadge } from "../coverage/ProtectionBadge";
import { useGraphRevision } from "../shared/revision";

/* ─────────────────────────── Types ──────────────────────────────────────── */

/** An enforcement operation with its observed state. */
interface OperationEnforcementState {
  operation: string;
  family: string;
  effect: "allow" | "deny" | "observe" | "unknown";
  active: boolean;
  verified: boolean;
  stale: boolean;
  error?: string | null;
}

/** Extended runtime policy status when the backend provides full details. */
interface ExtendedRuntimePolicyStatus extends RuntimePolicyStatus {
  desired_generation?: number | null;
  active_generation?: number | null;
  enforcement_backend?: string | null;
  enforcement_profile?: string | null;
  enforcement_mode?: string | null;
  last_verification_at?: string | null;
  requires_restart?: boolean | null;
  error?: string | null;
  operations?: OperationEnforcementState[] | null;
  required_controls?: ControlCoverage[] | null;
  optional_controls?: ControlCoverage[] | null;
}

interface ControlCoverage {
  control_id: string;
  kind: string;
  state: string;
  current: boolean;
  required: boolean;
}

/* ─────────────────────────── Operation badge ─────────────────────────────── */

const EFFECT_TONE: Record<string, string> = {
  allow: "bg-(--color-success-soft) text-(--color-success-text)",
  deny: "bg-(--color-danger-soft) text-(--color-danger-text)",
  observe: "bg-(--color-info-soft) text-(--color-info-text)",
  unknown: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};

const EFFECT_ICON: Record<string, typeof CheckCircle2> = {
  allow: CheckCircle2,
  deny: XCircle,
  observe: Clock,
  unknown: ShieldAlert,
};

function OperationBadge({ op }: { op: OperationEnforcementState }) {
  const Icon = EFFECT_ICON[op.effect] ?? EFFECT_ICON.unknown;
  const tone = op.stale
    ? "bg-(--color-warning-soft) text-(--color-warning-text)"
    : EFFECT_TONE[op.effect] ?? EFFECT_TONE.unknown;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium",
        tone,
      )}
      title={
        op.stale
          ? `${op.family}: ${op.operation} (stale)`
          : `${op.family}: ${op.operation}`
      }
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">
        {op.family}: {op.operation}
      </span>
      {op.stale ? (
        <span className="ml-0.5 text-[10px] opacity-70">(stale)</span>
      ) : null}
      {op.error ? (
        <AlertTriangle className="ml-0.5 size-3 text-(--color-danger-text)" />
      ) : null}
    </div>
  );
}

/* ─────────────────────────── Control coverage row ────────────────────────── */

function ControlRow({ control }: { control: ControlCoverage }) {
  const stateLabel = control.state === "verified" && control.current
    ? "Verified"
    : control.state === "verified" && !control.current
      ? "Stale"
      : control.state;

  const stateTone = control.state === "verified" && control.current
    ? "text-(--color-success-text)"
    : control.state === "verified" && !control.current
      ? "text-(--color-warning-text)"
      : "text-(--color-text-muted)";

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-(--color-border-subtle) px-3 py-1.5 text-xs">
      <div className="flex items-center gap-2 truncate">
        <span className="font-mono">{control.control_id}</span>
        <span className="text-(--color-text-muted)">{control.kind}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("font-medium capitalize", stateTone)}>
          {stateLabel}
        </span>
        {control.required ? (
          <span className="rounded bg-(--color-primary-soft) px-1 py-0.5 text-[10px] font-semibold text-(--color-primary-text)">
            Required
          </span>
        ) : (
          <span className="rounded bg-(--color-surface-subtle) px-1 py-0.5 text-[10px] text-(--color-text-muted)">
            Optional
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Desired vs Active ───────────────────────────── */

function GenerationComparison({
  desired,
  active,
}: {
  desired: number | null | undefined;
  active: number | null | undefined;
}) {
  if (desired == null && active == null) return null;
  const matched = desired != null && active != null && desired === active;
  const behind = desired != null && active != null && active < desired;

  return (
    <Fact label="Generation">
      <span className="flex items-center gap-2">
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-(--color-text-muted)">Desired:</span>
          <span className="font-medium">{desired ?? "\u2014"}</span>
        </span>
        <span className="text-(--color-text-muted)">/</span>
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-(--color-text-muted)">Active:</span>
          <span
            className={cn(
              "font-medium",
              matched
                ? "text-(--color-success-text)"
                : behind
                  ? "text-(--color-warning-text)"
                  : "",
            )}
          >
            {active ?? "\u2014"}
          </span>
        </span>
        {matched ? (
          <CheckCircle2 className="size-3.5 text-(--color-success-text)" />
        ) : behind ? (
          <AlertTriangle className="size-3.5 text-(--color-warning-text)" />
        ) : null}
      </span>
    </Fact>
  );
}

/* ─────────────────────────── Props ──────────────────────────────────────── */

export interface ProtectionOverlayProps {
  ws: string;
  id: string;
}

/* ─────────────────────────── Component ──────────────────────────────────── */

export function ProtectionOverlay({ ws, id }: ProtectionOverlayProps) {
  const { rev, epoch } = useGraphRevision(ws);
  const q = useGetWorkloadRuntimePolicyStatusQuery({
    ws,
    rev,
    key: String(epoch),
    id,
    graph: "v2",
  });

  const status = q.data?.data as ExtendedRuntimePolicyStatus | undefined;

  // Group operations by family for display
  const operationsByFamily = useMemo(() => {
    if (!status?.operations?.length) return null;
    const map = new Map<string, OperationEnforcementState[]>();
    for (const op of status.operations) {
      const existing = map.get(op.family) ?? [];
      existing.push(op);
      map.set(op.family, existing);
    }
    return map;
  }, [status?.operations]);

  // Overall coverage assessment
  const hasOperations = status?.operations && status.operations.length > 0;
  const hasControls =
    (status?.required_controls && status.required_controls.length > 0) ||
    (status?.optional_controls && status.optional_controls.length > 0);

  // Detect partial and stale states
  const anyStale = status?.operations?.some((op) => op.stale) ?? false;
  const anyError = status?.operations?.some((op) => op.error) ?? false;
  const hasPartialCoverage =
    operationsByFamily &&
    [...operationsByFamily.values()].some(
      (ops) => ops.some((o) => o.effect !== "unknown") && ops.some((o) => o.effect === "unknown"),
    );

  if (q.isLoading) {
    return (
      <Panel title="Enforcement protection">
        <div
          className="h-20 animate-pulse rounded-md bg-(--color-surface-subtle)"
          aria-busy="true"
          aria-label="Loading protection overlay"
        />
      </Panel>
    );
  }

  if (q.isError || !status) {
    return (
      <Panel title="Enforcement protection">
        <p className="text-xs text-(--color-text-muted)">
          Enforcement state is not available for this workload.
        </p>
      </Panel>
    );
  }

  const isNotConfigured = status.status === "not_configured";

  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Shield className="size-4 text-(--color-text-muted)" />
            Enforcement protection
          </span>
        }
        description={
          isNotConfigured
            ? "No runtime policy has been applied to this workload yet."
            : anyStale
              ? "Some enforcement receipts are stale. Verification may be out of date."
              : undefined
        }
      >
        <div className="space-y-4">
          {/* Overall status badge */}
          <Facts>
            <Fact label="Status">
              <ProtectionBadge status={status.status} />
            </Fact>

            {status.enforcement_backend ? (
              <Fact label="Backend">{status.enforcement_backend}</Fact>
            ) : null}

            {status.enforcement_profile ? (
              <Fact label="Profile">{status.enforcement_profile}</Fact>
            ) : null}

            {status.enforcement_mode ? (
              <Fact label="Mode">
                <span className="capitalize">{status.enforcement_mode}</span>
              </Fact>
            ) : null}

            <GenerationComparison
              desired={status.desired_generation}
              active={status.active_generation}
            />

            {status.last_verification_at ? (
              <Fact label="Last verified">
                <time
                  dateTime={status.last_verification_at}
                  className="tabular-nums text-xs"
                >
                  {new Date(status.last_verification_at).toLocaleString()}
                </time>
              </Fact>
            ) : null}

            {status.requires_restart ? (
              <Fact label="Restart required">
                <span className="inline-flex items-center gap-1.5 text-(--color-warning-text)">
                  <RefreshCw className="size-3.5" />
                  <span className="text-xs font-medium">
                    Workload restart is required to apply the latest enforcement
                  </span>
                </span>
              </Fact>
            ) : null}
          </Facts>

          {/* Error display */}
          {(status.error || anyError) ? (
            <div className="rounded-md border border-(--color-danger-soft) bg-(--color-danger-soft)/30 px-3 py-2">
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0 text-(--color-danger-text)" />
                <div className="min-w-0 text-xs">
                  {status.error ? (
                    <p className="font-medium text-(--color-danger-text)">
                      {status.error}
                    </p>
                  ) : null}
                  {anyError && status.operations ? (
                    <ul className="mt-1 space-y-0.5">
                      {status.operations
                        .filter((op) => op.error)
                        .map((op) => (
                          <li
                            key={`${op.family}-${op.operation}`}
                            className="text-(--color-danger-text)"
                          >
                            {op.family}.{op.operation}: {op.error}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* Operation badges */}
      {hasOperations && operationsByFamily ? (
        <Panel
          title="Operation enforcement"
          description={
            hasPartialCoverage
              ? "Some operation families have partial coverage. Rules may not cover all operations."
              : anyStale
                ? "Some operations have stale enforcement receipts."
                : undefined
          }
        >
          <div className="space-y-3">
            {[...operationsByFamily.entries()].map(([family, ops]) => {
              const familyHasPartial =
                ops.some((o) => o.effect !== "unknown") &&
                ops.some((o) => o.effect === "unknown");

              return (
                <div key={family} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold capitalize text-(--color-text)">
                      {family.replace(/_/g, " ")}
                    </h4>
                    {familyHasPartial ? (
                      <span className="inline-flex items-center gap-1 rounded bg-(--color-warning-soft) px-1.5 py-0.5 text-[10px] font-medium text-(--color-warning-text)">
                        <ShieldAlert className="size-3" />
                        Partial
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ops.map((op) => (
                      <OperationBadge
                        key={`${op.family}-${op.operation}`}
                        op={op}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {/* Control coverage */}
      {hasControls ? (
        <Panel
          title="Control coverage"
          count={`${(status.required_controls?.length ?? 0) + (status.optional_controls?.length ?? 0)} controls`}
        >
          <div className="space-y-2">
            {status.required_controls?.map((ctrl) => (
              <ControlRow key={ctrl.control_id} control={ctrl} />
            ))}
            {status.optional_controls?.map((ctrl) => (
              <ControlRow key={ctrl.control_id} control={ctrl} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
