/**
 * Access tab: one row per rule — what it lets the ServiceAccount do, where, and
 * the binding that is the reason — and, on a ServiceAccount, the workloads that
 * run as it.
 *
 * Nothing here is "no access": an empty list says which sweep it came from and
 * what that sweep did not read, and a binding to a role the sweep never saw is
 * a row of its own — unresolved, not none.
 */

import { Link } from "react-router-dom";

import type { K8sWorkload } from "@/app/api/k8sGraphApi";

import { countWords } from "../shared/components/countValue";
import { Meta, Panel } from "../shared/components/Panel";
import { FailurePanel } from "../discovery/ListStates";
import type { ClusterSweep } from "../discovery/k8s";
import type { AccessState } from "./K8sOverview";
import type { AccessRow } from "./access";
import { k8sObjectPath } from "./links";
import { RulePills, ScopeBadge } from "./Pills";
import { groupWords, ruleTargets } from "./rules";
import { emptyAccessWords } from "./sweep";

/** The workload read returns at most this many; an answer at the cap is a lower bound. */
export const WORKLOAD_READ_LIMIT = 500;

function Row({ r }: { r: AccessRow }) {
  const g = r.grant;
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {r.resolved ? (
          <p className="min-w-0 text-[13px] text-(--color-text)">
            <span className="font-mono text-xs font-medium">{(g.verbs ?? []).join(", ") || "no verbs"}</span>
            <span className="text-(--color-text-muted)"> on </span>
            <span className="font-mono text-xs [overflow-wrap:anywhere]">{ruleTargets(g).join(", ") || "nothing named"}</span>
          </p>
        ) : (
          <p className="min-w-0 text-[13px] font-medium text-(--color-warning-text)">Role not in the sweep — unresolved, not none</p>
        )}
        <ScopeBadge scope={r.scope} />
        <RulePills flags={r.flags} stale={r.stale} />
      </div>
      <p className="text-xs text-(--color-text-muted)">
        {r.resolved ? (
          // A rule on a non-resource URL has no API group to name.
          <>{g.resources?.length || !g.non_resource_urls?.length ? `API group: ${groupWords(g.api_groups)}` : "Non-resource URL"} · </>
        ) : null}
        {r.binding ? (
          <>
            {r.binding.kind} <span className="font-mono">{r.binding.name}</span>
            {r.binding.namespace ? ` in namespace ${r.binding.namespace}` : ""}
          </>
        ) : (
          "binding could not be read"
        )}
        {r.roleName ? (
          <>
            {" → "}
            {r.roleKind ?? "Role"} <span className="font-mono">{r.roleName}</span>
          </>
        ) : r.resolved ? null : (
          " → a role the sweep did not see"
        )}
      </p>
      {r.flags.named ? <Meta>The names narrow the rule to those objects. They do not constrain list, watch or create.</Meta> : null}
    </li>
  );
}

function RulesPanel({ access, sweep }: { access: AccessState; sweep: ClusterSweep | undefined }) {
  switch (access.kind) {
    case "unresolved":
      return (
        <Panel title="Rules">
          <p className="text-sm text-(--color-text-muted)">
            No ServiceAccount could be resolved for this workload, so the rules that apply to it were not looked up. Unresolved is not “no access”.
          </p>
        </Panel>
      );
    case "loading":
      return (
        <Panel title="Rules">
          <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the rules" />
        </Panel>
      );
    case "failed":
      return (
        <Panel title="Rules">
          <FailurePanel
            failure={access.failure === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }}
            subject="the rules that apply to it"
            permission="discovery:read"
            onRetry={access.retry}
          />
        </Panel>
      );
    case "ready": {
      const rows = access.rows;
      const unresolved = rows.filter((r) => !r.resolved).length;
      const stale = rows.filter((r) => r.stale).length;
      return (
        <Panel
          title="Rules"
          count={`${rows.length} ${rows.length === 1 ? "rule" : "rules"}`}
          description="Each row is one rule of a Role or ClusterRole, applied by the binding named under it. Declared, not evaluated."
          flush
        >
          {rows.length ? (
            <ul className="divide-y divide-(--color-border-subtle)">
              {rows.map((r) => (
                <Row key={r.key} r={r} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-(--color-text-muted)">{emptyAccessWords(sweep)}</p>
          )}
          {unresolved || stale ? (
            <p className="border-t border-(--color-border-subtle) px-4 py-2.5 text-xs text-(--color-text-muted)">
              {unresolved ? (
                <>
                  <strong className="font-medium text-(--color-warning-text)">{unresolved} {unresolved === 1 ? "binding names" : "bindings name"} a role the sweep did not see.</strong>{" "}
                  What {unresolved === 1 ? "it grants" : "they grant"} is unresolved, not none.{" "}
                </>
              ) : null}
              {stale ? `${stale} ${stale === 1 ? "rule is" : "rules are"} unconfirmed by the latest sweep and still believed.` : null}
            </p>
          ) : null}
        </Panel>
      );
    }
  }
}

/** Workloads that run as this ServiceAccount: counted from the workload read, so a capped read is "At least". */
function RunnersPanel({
  workloads,
  identityId,
  cluster,
}: {
  workloads: { data: K8sWorkload[] | undefined; loading: boolean; failed: boolean; retry: () => void };
  identityId: string;
  cluster: string | undefined;
}) {
  const runners = (workloads.data ?? []).filter((w) => w.runs_as_id === identityId);
  const capped = (workloads.data?.length ?? 0) >= WORKLOAD_READ_LIMIT;
  return (
    <Panel
      title="Workloads that run as it"
      count={workloads.data ? countWords(capped ? { kind: "at_least", value: runners.length } : { kind: "exact", value: runners.length }) : undefined}
      description={
        capped
          ? `The workload read stopped at its first ${WORKLOAD_READ_LIMIT}, so there may be more that run as it.`
          : "Among the workloads the cluster inventory returns."
      }
    >
      {workloads.loading ? (
        <div className="h-12 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading workloads" />
      ) : workloads.failed ? (
        <p role="alert" className="text-sm text-(--color-danger-text)">
          Could not read the workloads, so it is not known which run as this ServiceAccount.{" "}
          <button type="button" className="font-semibold underline" onClick={workloads.retry}>
            Retry
          </button>
        </p>
      ) : runners.length ? (
        <ul className="space-y-1 text-sm">
          {runners.map((w) => (
            <li key={`${w.id}:${w.basis ?? ""}`}>
              <Link to={k8sObjectPath("workload", w.id, cluster)} className="font-medium text-(--color-primary-text) hover:underline">
                {w.display_name}
              </Link>
              <span className="text-(--color-text-muted)">
                {" "}
                · {w.namespace || "cluster-wide"} · {w.basis === "observed" ? "observed running" : "configured only"}
                {w.lifecycle === "retired" ? " · the sweep no longer sees it" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-(--color-text-muted)">No workload among those read is known to run as it.</p>
      )}
    </Panel>
  );
}

export function K8sAccessTab({
  access,
  sweep,
  runners,
}: {
  access: AccessState;
  sweep: ClusterSweep | undefined;
  /** ServiceAccount pages only. */
  runners?: { workloads: Parameters<typeof RunnersPanel>[0]["workloads"]; identityId: string; cluster: string | undefined };
}) {
  return (
    <>
      <RulesPanel access={access} sweep={sweep} />
      {runners ? <RunnersPanel {...runners} /> : null}
    </>
  );
}
