/**
 * The chain behind a Kubernetes ServiceAccount's access: workload →
 * ServiceAccount → binding → role → rule, whole, because every link is
 * somewhere a reviewer's assumption breaks.
 *
 * THREE THINGS HERE ARE NOT DECORATION (carried over from the page this
 * replaces):
 *   - COVERAGE IS A STATE. A sweep that could not read cluster-scoped objects
 *     has not given a smaller answer, it has given a different one:
 *     ClusterRoleBindings are where cluster-admin is granted. It is shown as a
 *     state with its sentence, never averaged into a percentage.
 *   - STALE IS NOT ENDED. A grant the last sweep could not re-read is still
 *     believed; showing it as gone would turn a permissions outage into a
 *     revocation.
 *   - UNRESOLVED IS NOT NONE. "We could not tell" and "it has none" are
 *     opposite facts and never share a row style.
 */

import { AlertTriangle, Asterisk, ChevronRight, Eye } from "lucide-react";
import { Link } from "react-router-dom";

import { useGetK8sAccessQuery, type K8sGrant } from "@/app/api/k8sGraphApi";
import { loadFailureOf } from "@/components/console/load-failure";

import { Panel } from "../shared/components/Panel";
import { FailurePanel } from "./ListStates";
import { K8S_COVERAGE_LABEL, type ClusterSweep } from "./k8s";

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

function Step({ label, children, to }: { label: string; children: React.ReactNode; to?: string }) {
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="text-[10.5px] uppercase tracking-wide text-(--color-text-subtle)">{label}</span>
      {to ? (
        <Link to={to} className="truncate font-mono text-[11px] font-medium text-(--color-text) hover:underline">
          {children}
        </Link>
      ) : (
        <span className="truncate font-mono text-[11px] font-medium text-(--color-text)">{children}</span>
      )}
    </span>
  );
}

function Arrow() {
  return <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-(--color-text-subtle)" />;
}

function GrantRow({ grant, workload, account }: { grant: K8sGrant; workload?: { name: string; to?: string }; account: { anchor: string; to?: string } }) {
  return (
    <li className="space-y-2 rounded-md border border-(--color-border-subtle) px-3 py-2.5">
      {/* The chain: each link is its own step, in the order access flows. */}
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
        {workload ? (
          <>
            <Step label="Workload" to={workload.to}>
              {workload.name}
            </Step>
            <Arrow />
          </>
        ) : null}
        <Step label="ServiceAccount" to={account.to}>
          {account.anchor}
        </Step>
        <Arrow />
        <Step label={grant.binding_kind === "k8s_cluster_role_binding" ? "ClusterRoleBinding" : "Binding"}>{grant.binding || "unknown binding"}</Step>
        <Arrow />
        <Step label={grant.role_kind === "k8s_cluster_role" ? "ClusterRole" : "Role"}>
          {grant.role_name || "unknown role"}
          {grant.namespace ? ` · ${grant.namespace}` : grant.role_kind === "k8s_cluster_role" ? " · cluster-wide" : ""}
        </Step>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {grant.wildcard ? (
          <span className={`${PILL} bg-(--color-danger-soft) text-(--color-danger-text)`}>
            <Asterisk className="h-3 w-3" aria-hidden="true" />
            Wildcard
          </span>
        ) : null}
        {grant.constrained ? (
          <span className={`${PILL} bg-(--color-surface-subtle) text-(--color-text-muted)`}>
            <Eye className="h-3 w-3" aria-hidden="true" />
            Named instances only
          </span>
        ) : null}
        {grant.state === "stale" ? (
          <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Unconfirmed — still believed, not gone
          </span>
        ) : null}
      </div>
      <p className="font-mono text-[11px] leading-4 text-(--color-text-muted)">
        {(grant.verbs ?? []).join(", ") || "—"}
        {" on "}
        {(grant.resources ?? []).join(", ") || "—"}
        {grant.api_groups?.length ? ` (${grant.api_groups.map((g) => g || "core").join(", ")})` : ""}
      </p>
      {grant.resource_names?.length ? <p className="text-[11px] text-(--color-text-muted)">Limited to: {grant.resource_names.join(", ")}</p> : null}
      {grant.calculation_state !== "complete" ? (
        <p className="text-[11px] text-(--color-warning-text)">The role behind this binding was not in the sweep, so what it grants is unknown.</p>
      ) : null}
    </li>
  );
}

export function AccessChain({
  identityId,
  anchor,
  anchorHref,
  workload,
  sweep,
}: {
  identityId: string;
  anchor: string;
  anchorHref?: string;
  workload?: { name: string; to?: string };
  /** The sweep behind the answer, when known: coverage qualifies an empty chain. */
  sweep?: ClusterSweep;
}) {
  const q = useGetK8sAccessQuery(identityId);
  const grants = q.data?.grants ?? [];
  const summary = q.data?.summary;
  const failure = loadFailureOf(q.error);

  return (
    <Panel
      title="Access chain"
      count={q.data ? `${grants.length} ${grants.length === 1 ? "rule" : "rules"}` : undefined}
      description="Workload → ServiceAccount → binding → role → rule. Kubernetes RBAC only allows; a rule here is access the API server will honour."
    >
      {q.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the access chain" />
      ) : failure ? (
        <FailurePanel
          failure={failure === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }}
          subject="this access chain"
          permission="discovery:read"
          onRetry={() => void q.refetch()}
        />
      ) : (
        <div className="space-y-3">
          {!grants.length ? (
            <p className="text-sm text-(--color-text-muted)">
              No rule reaches this ServiceAccount in what has been swept.
              {sweep && sweep.state !== "complete"
                ? ` The sweep was ${K8S_COVERAGE_LABEL[sweep.state]?.toLowerCase() ?? sweep.state}, so this is not a finding that it has none.`
                : ""}
            </p>
          ) : (
            <ul className="space-y-2">
              {grants.map((g, i) => (
                <GrantRow key={`${g.binding}:${g.role_name}:${i}`} grant={g} workload={workload} account={{ anchor, to: anchorHref }} />
              ))}
            </ul>
          )}
          {summary ? (
            <p className="border-t border-(--color-border-subtle) pt-2 text-[11px] leading-4 text-(--color-text-muted)">
              {summary.note}
              {summary.partial > 0 ? (
                <>
                  {" "}
                  <strong className="font-medium">{summary.partial} could not be fully resolved</strong> — the role was not in the sweep, so what it grants is unknown.
                </>
              ) : null}
              {summary.stale > 0 ? <> {summary.stale} could not be reconfirmed by the latest sweep and are still believed.</> : null}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
