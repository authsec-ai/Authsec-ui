/**
 * What the graph's selection card offers about policy. With the one access-policy
 * feature, a policy blocks or allows access to an S3 bucket for an IAM role for a
 * set window. The card is the way in: it carries the thing selected into the
 * create form (`/iga/policy/new`), which resolves it server-side.
 *
 *   IAM role        start a policy for this role (identity_account_id)
 *   workload        start a policy for the role it runs as
 *   S3 resource     start a policy on this bucket (resource_id)
 *   other resource  said plainly: only S3 buckets in v1
 *   grant line      start a policy for the role that holds the grant
 *   IAM user/group  said plainly: policies change roles, not users or groups
 *   Kubernetes      said plainly: not yet supported, with the prerequisite
 *
 * Nothing renders while the policy product is off.
 */

import { useId } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { refId, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { getWorkspaceId } from "@/utils/workspace";

import { KubernetesPolicyNote, plural, usePolicyCapabilities } from "../policy/shared";
import { independentCount } from "./graphLabels";
import type { SelectionSubject } from "./SelectionCard";
import type { VisualEdge } from "./types";

const HOLDERS_SHOWN = 5;

function Heading({ id }: { id: string }) {
  return (
    <h3 id={id} className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
      Policy
    </h3>
  );
}

const quiet = "rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-2.5 py-1.5 text-xs text-(--color-text-muted)";

/** Start an access policy with the selected role or resource already filled in. */
function NewPolicyButton({ param, id, label, size = "sm", variant }: { param: "identity_account_id" | "resource_id"; id: string; label: string; size?: "sm" | "default"; variant?: "outline" }) {
  return (
    <Button asChild size={size} variant={variant}>
      <Link to={`/iga/policy/new?${param}=${encodeURIComponent(id)}`}>{label}</Link>
    </Button>
  );
}

export function PolicyCardSection({
  subject,
  edges,
  nodes,
}: {
  subject: SelectionSubject;
  edges: VisualEdge[];
  nodes: Map<GraphRef, GraphNode>;
}) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  if (caps.state !== "on") return null;

  if (subject.kind === "edge") {
    const e = subject.edge;
    if (e.kind !== "declares") return null;
    const holder = nodes.get(e.from as GraphRef);
    return <GrantLine edge={e} holder={holder && holder.kind === "iam_role" ? holder : null} />;
  }

  const first = subject.visual.members[0];
  if (!first) return null;
  if (first.provider === "k8s") return <KubernetesPolicyNote />;

  switch (first.kind) {
    case "iam_role":
      return <RoleBlock identityId={refId(first.ref)} />;
    case "workload":
      return <WorkloadBlock />;
    case "iam_user":
    case "iam_group":
      return <p className={quiet}>An access policy changes IAM roles. It is not offered for {first.kind === "iam_user" ? "IAM users" : "IAM groups"}.</p>;
    case "exact":
    case "selector":
    case "external":
    case "statement":
      return <ResourceBlock id={subject.visual.id} kind={first.kind} what={first.kind === "statement" ? "statement" : "resource"} edges={edges} nodes={nodes} />;
    default:
      return null;
  }
}

/* ---------------------------------- role ---------------------------------- */

function RoleBlock({ identityId }: { identityId: string }) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      <p className="text-xs text-(--color-text-muted)">Block or allow this role&rsquo;s access to an S3 bucket for a set window.</p>
      <div>
        <NewPolicyButton param="identity_account_id" id={identityId} label="New access policy" />
      </div>
    </section>
  );
}

/* -------------------------------- workload -------------------------------- */

function WorkloadBlock() {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      <p className="text-xs text-(--color-text-muted)">A workload has no policy of its own. An access policy changes the IAM role it runs as, and affects everything that runs as that role. Select that role to start one.</p>
    </section>
  );
}

/* ------------------------- resource or statement -------------------------- */

/** How far back from a resource to look for a role: role → statement → resource is two hops; one spare for a summary line in between. */
const HOPS = 3;

/**
 * The roles this canvas draws as reaching `id`, found by walking the drawn lines
 * backwards. Not the roles that can reach it: only the ones loaded. A role behind
 * a "more" node that is not expanded is not drawn, so it is not here.
 */
function holdersOf(id: string, edges: VisualEdge[], nodes: Map<GraphRef, GraphNode>): GraphNode[] {
  const roles: GraphNode[] = [];
  const seenRole = new Set<string>();
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let hop = 0; hop < HOPS && frontier.length; hop++) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const e of edges) {
        if (e.to !== cur) continue;
        const n = nodes.get(e.from as GraphRef);
        if (n && n.kind === "iam_role") {
          if (!seenRole.has(n.ref)) {
            seenRole.add(n.ref);
            roles.push(n);
          }
        } else if (!seen.has(e.from)) {
          seen.add(e.from);
          next.push(e.from);
        }
      }
    }
    frontier = next;
  }
  return roles;
}

function ResourceBlock({ id, kind, what, edges, nodes }: { id: string; kind: string; what: "resource" | "statement"; edges: VisualEdge[]; nodes: Map<GraphRef, GraphNode> }) {
  const heading = useId();
  // Only an S3 bucket can be the target of an access policy in v1. The graph's
  // "exact" resource is the one place a bucket is selected directly.
  const isBucket = kind === "exact";
  const roles = holdersOf(id, edges, nodes);
  const shown = roles.slice(0, HOLDERS_SHOWN);

  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      {isBucket ? (
        <>
          <p className="text-xs text-(--color-text-muted)">Block or allow access to this bucket for a role, for a set window.</p>
          <div>
            <NewPolicyButton param="resource_id" id={id} label="New access policy on this bucket" />
          </div>
        </>
      ) : (
        <p className="text-xs text-(--color-text-muted)">Access policies target S3 buckets. This {what} is not a bucket, so there is nothing to create from it.</p>
      )}
      {roles.length > 0 ? (
        <>
          <p className="text-xs text-(--color-text)">
            {plural(roles.length, "role")} drawn here {roles.length === 1 ? "reaches" : "reach"} it. Select one to start a policy for it.
          </p>
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.ref} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-[13px] font-medium text-(--color-text)">{r.label}</span>
                <NewPolicyButton param="identity_account_id" id={refId(r.ref)} label="New policy" variant="outline" />
              </li>
            ))}
          </ul>
          {roles.length > shown.length ? <p className="text-xs text-(--color-text-muted)">+{roles.length - shown.length} more drawn here. Select one to act on it.</p> : null}
        </>
      ) : null}
    </section>
  );
}

/* ------------------------------- grant line ------------------------------- */

function GrantLine({ edge, holder }: { edge: VisualEdge; holder: GraphNode | null }) {
  const heading = useId();
  const grants = independentCount(edge);
  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      {!holder ? (
        <p className={quiet}>The role that holds this grant is not an IAM role drawn on the canvas, so there is nothing to start from here.</p>
      ) : (
        <>
          <p className="text-xs text-(--color-text-muted)">
            An access policy blocks or allows this role&rsquo;s access to an S3 bucket for a window
            {grants > 1 ? `; this line stands for ${grants} grants` : ""}.
          </p>
          <div>
            <NewPolicyButton param="identity_account_id" id={refId(holder.ref)} label="New policy for this role" />
          </div>
        </>
      )}
    </section>
  );
}
