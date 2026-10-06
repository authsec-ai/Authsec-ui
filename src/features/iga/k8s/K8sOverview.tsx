/**
 * Overview of a Kubernetes workload or ServiceAccount: three answers, in this
 * order — who it runs as, what the cluster lets it do, and what was not
 * evaluated (SPEC-console-revamp.md *Kubernetes object pages*).
 *
 * Declared RBAC only. A rule here is what a Role or ClusterRole lists and a
 * binding applies; it is not proof the API server would admit a request.
 */

import { Link } from "react-router-dom";

import type { K8sWorkload } from "@/app/api/k8sGraphApi";

import { FailurePanel } from "../discovery/ListStates";
import type { ClusterSweep } from "../discovery/k8s";
import { Fact, Facts, Meta, Panel } from "../shared/components/Panel";
import { IgaBadge } from "../shared/components/IgaBadge";
import { accessGroups, type AccessGroup, type AccessRow } from "./access";
import { k8sObjectPath } from "./links";
import { RulePills, ScopeBadge } from "./Pills";
import { ruleSentence } from "./rules";
import { emptyAccessWords } from "./sweep";
import type { LoadFailure } from "@/components/console/load-failure";

/** What the page knows of the access read: not asked yet, in flight, failed, or the rows. */
export type AccessState =
  | { kind: "unresolved" }
  | { kind: "loading" }
  | { kind: "failed"; failure: LoadFailure; retry: () => void }
  | { kind: "ready"; rows: AccessRow[] };

const RULES_SHOWN = 3;

/* --------------------------------- runs as --------------------------------- */

/**
 * Who the workload runs as. The API names one ServiceAccount per row — the one
 * the sweep OBSERVED when it saw the Pod, else the one the spec CONFIGURES —
 * and two rows for one workload are the mismatch: it is reported running as
 * one and configured as another.
 */
export function RunsAs({ rows, cluster }: { rows: K8sWorkload[]; cluster: string | undefined }) {
  const named = rows.filter((r) => r.runs_as_id && r.runs_as);
  const mismatch = new Set(named.map((r) => r.runs_as_id)).size > 1;
  return (
    <Panel title="Runs as" description="The ServiceAccount whose rules apply to this workload's Pods.">
      {named.length ? (
        <div className="space-y-3">
          {mismatch ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-(--color-warning-text)">
              <IgaBadge tone="warning">Mismatch</IgaBadge>
              The sweep reports this workload running as one ServiceAccount and configured as another. Both are shown.
            </p>
          ) : null}
          <Facts>
            {named.map((r) => (
              <Fact key={`${r.runs_as_id}:${r.basis ?? ""}`} label={r.basis === "observed" ? "Observed running" : "Configured only"}>
                <Link to={k8sObjectPath("identity", r.runs_as_id!, cluster)} className="font-mono text-xs font-medium text-(--color-primary-text) hover:underline">
                  {r.runs_as}
                </Link>
                <Meta>
                  {r.basis === "observed"
                    ? "The sweep saw a Pod of this workload run as it."
                    : "Taken from the workload's own spec; no Pod was seen running as it."}
                </Meta>
              </Fact>
            ))}
          </Facts>
          {!mismatch && named[0].basis === "observed" ? (
            <Meta>Whether this differs from the ServiceAccount the spec configures is not reported.</Meta>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-(--color-text-muted)">
          No ServiceAccount could be resolved for this workload, so what it can do was not calculated. That is not the same as having none.
        </p>
      )}
    </Panel>
  );
}

/* ----------------------------- what the cluster lets it do ----------------------------- */

function GroupCard({ g }: { g: AccessGroup }) {
  const resolved = g.rows.every((r) => r.resolved);
  const wildcard = g.rows.some((r) => r.flags.wildcard);
  const escalation = g.rows.find((r) => r.flags.escalation)?.flags.escalation ?? null;
  const named = g.rows.every((r) => r.flags.named);
  return (
    <li className="space-y-1.5 rounded-md border border-(--color-border-subtle) px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 text-[13px] font-semibold text-(--color-text)">
          {g.roleName ? `${g.roleKind ?? "Role"} ${g.roleName}` : "A role the sweep did not see"}
        </p>
        <ScopeBadge scope={g.scope} />
        <RulePills flags={{ wildcard, escalation, named }} stale={g.rows.every((r) => r.stale)} />
      </div>
      <p className="text-xs text-(--color-text-muted)">
        {g.binding ? (
          <>
            Bound by {g.binding.kind} <span className="font-mono">{g.binding.name}</span>
            {g.binding.namespace ? ` in namespace ${g.binding.namespace}` : ""}
          </>
        ) : (
          "The binding could not be read"
        )}
      </p>
      {resolved ? (
        <ul className="space-y-0.5">
          {g.rows.slice(0, RULES_SHOWN).map((r, i) => (
            <li key={`${r.key}:${i}`} className="font-mono text-[11px] leading-4 text-(--color-text-muted)">
              {ruleSentence(r.grant)}
            </li>
          ))}
          {g.rows.length > RULES_SHOWN ? <li className="text-[11px] text-(--color-text-muted)">+{g.rows.length - RULES_SHOWN} more — see the Access tab</li> : null}
        </ul>
      ) : (
        <p className="text-xs text-(--color-warning-text)">Role not in the sweep — unresolved, not none.</p>
      )}
    </li>
  );
}

/** Grouped by role, worst first: wildcard, then escalation, then what could not be resolved, then the rest. */
export function WhatTheClusterLetsItDo({ access, sweep, noun }: { access: AccessState; sweep: ClusterSweep | undefined; noun: "workload" | "ServiceAccount" }) {
  let body;
  let count: string | undefined;
  switch (access.kind) {
    case "unresolved":
      body = (
        <p className="text-sm text-(--color-text-muted)">
          Not calculated: no ServiceAccount could be resolved for this {noun}, so the rules that apply to it were not looked up. Unresolved is not “no access”.
        </p>
      );
      break;
    case "loading":
      body = <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading what the cluster lets it do" />;
      break;
    case "failed":
      body = (
        <FailurePanel
          failure={access.failure === "forbidden" ? { kind: "unauthorized" } : { kind: "failed" }}
          subject="what the cluster lets it do"
          permission="discovery:read"
          onRetry={access.retry}
        />
      );
      break;
    case "ready": {
      const groups = accessGroups(access.rows);
      count = `${access.rows.length} ${access.rows.length === 1 ? "rule" : "rules"} in ${groups.length} ${groups.length === 1 ? "role" : "roles"}`;
      body = groups.length ? (
        <ul className="space-y-2">
          {groups.map((g) => (
            <GroupCard key={g.key} g={g} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-(--color-text-muted)">{emptyAccessWords(sweep)}</p>
      );
    }
  }
  return (
    <Panel
      title="What the cluster lets it do"
      count={count}
      description="Declared by Roles, ClusterRoles and their bindings, as the sweep read them. Wildcards first, then privilege escalation."
    >
      {body}
    </Panel>
  );
}

/* ------------------------------- not evaluated ------------------------------- */

const NOT_EVALUATED: { title: string; body: string }[] = [
  {
    title: "Admission policies and webhooks",
    body: "ValidatingAdmissionPolicies and validating or mutating webhooks can refuse or change a request that RBAC allows. They are not read.",
  },
  {
    title: "Token mounting",
    body: "Whether the ServiceAccount's token is mounted into the workload's Pods (automountServiceAccountToken, on the ServiceAccount or the Pod) is not read.",
  },
  {
    // The access read lists the grants made to THIS ServiceAccount by name; a binding to a group is a grant to the
    // group's own identity, which that read does not attribute to it. Said every time, because it is true every time.
    title: "Grants through groups",
    body: "Bindings to groups such as system:serviceaccounts, system:serviceaccounts:<namespace> and system:authenticated apply to a ServiceAccount too. They are not listed for this one, so what the cluster lets it do may be understated.",
  },
  {
    title: "Cloud identity links",
    body: "A link from the ServiceAccount to a cloud identity — IRSA on EKS, EKS Pod Identity, GKE Workload Identity — is not followed, so what that identity can reach in the cloud is not shown here.",
  },
];

/** A panel, not a footnote: what this page does NOT establish about access. */
export function NotEvaluated() {
  return (
    <Panel title="Not evaluated" description="Declared RBAC is not proof that a request would succeed or fail. These layers are outside what this page reads.">
      <ul className="space-y-2.5">
        {NOT_EVALUATED.map((n) => (
          <li key={n.title}>
            <p className="text-[13px] font-medium text-(--color-text)">{n.title}</p>
            <Meta>{n.body}</Meta>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
