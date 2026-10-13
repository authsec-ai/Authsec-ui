/**
 * What the graph's selection card offers about policy (SPEC-iga-phase3-policy.md
 * §9.4). One rule runs through every case: a policy changes an IAM **role**, by
 * removing whole AWS services it does not use. So a click on anything else leads
 * to the role, never to a made-up target:
 *
 *   IAM role        status, open findings, Right-size this role (or Edit <policy>)
 *   workload        Right-size the role it runs as
 *   resource /
 *   statement       the roles drawn on this graph that reach it, each one action
 *   grant line      Create policy for the role that holds the grant
 *   IAM user/group  said plainly: not offered
 *   Kubernetes      said plainly: not yet supported, with the prerequisite
 *
 * Every action sends an object id to `POST /targets/resolve` (CreatePolicyAction),
 * so the server decides what is eligible; the roles listed for a resource are
 * only the ones this canvas has loaded, and the card says so. Nothing renders
 * while the policy product is off.
 */

import { useId } from "react";
import { Link } from "react-router-dom";

import { OPEN_FINDING_STATUSES, useListGovFindingsQuery } from "@/app/api/igaPolicyReadsApi";
import { refId, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { getWorkspaceId } from "@/utils/workspace";

import { ControlChip } from "../policy/findings/ControlChip";
import { CreatePolicyAction } from "../policy/findings/CreatePolicyAction";
import { findingsHref } from "../policy/findings/findingModel";
import { useObjectPolicy } from "../policy/findings/useObjectPolicy";
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
      return <RoleBlock ws={ws} identityId={refId(first.ref)} />;
    case "workload":
      return <WorkloadBlock workloadId={refId(first.ref)} />;
    case "iam_user":
    case "iam_group":
      return <p className={quiet}>A policy changes IAM roles. It is not offered for {first.kind === "iam_user" ? "IAM users" : "IAM groups"}.</p>;
    case "exact":
    case "selector":
    case "external":
    case "statement":
      return <HoldersBlock id={subject.visual.id} what={first.kind === "statement" ? "statement" : "resource"} edges={edges} nodes={nodes} />;
    default:
      return null;
  }
}

/* ---------------------------------- role ---------------------------------- */

function RoleBlock({ ws, identityId }: { ws: string; identityId: string }) {
  const heading = useId();
  const held = useObjectPolicy(ws, identityId, false);
  const findings = useListGovFindingsQuery({ ws, identity_id: identityId, status: [...OPEN_FINDING_STATUSES], limit: 50 });
  const open = findings.data?.data.length ?? 0;
  const more = !!findings.data?.meta.next_cursor;

  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading id={heading} />
        <ControlChip ws={ws} control={held.control} />
      </div>
      {findings.isLoading ? (
        <p role="status" className="text-xs text-(--color-text-muted)">
          Looking for findings…
        </p>
      ) : findings.isError ? (
        <p className="text-xs text-(--color-text-muted)">Findings for this role could not be read.</p>
      ) : (
        <p className="text-xs text-(--color-text)">
          {open === 0 ? (
            "No open findings for this role."
          ) : (
            <>
              {open}
              {more ? "+" : ""} open {open === 1 && !more ? "finding" : "findings"}.{" "}
              <Link to={findingsHref({ identity_id: identityId })} className="font-medium text-(--color-primary-text) hover:underline">
                See them
              </Link>
            </>
          )}
        </p>
      )}
      <div>
        <CreatePolicyAction objectId={identityId} label="Right-size this role" size="sm" variant={open === 0 && !held.control ? "outline" : undefined} />
      </div>
    </section>
  );
}

/* -------------------------------- workload -------------------------------- */

function WorkloadBlock({ workloadId }: { workloadId: string }) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      <p className="text-xs text-(--color-text-muted)">A workload has no policy of its own. A policy changes the IAM role it runs as, and affects everything that runs as that role.</p>
      <div>
        <CreatePolicyAction objectId={workloadId} label="Right-size the role it runs as" size="sm" variant="outline" />
      </div>
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

function HoldersBlock({ id, what, edges, nodes }: { id: string; what: "resource" | "statement"; edges: VisualEdge[]; nodes: Map<GraphRef, GraphNode> }) {
  const heading = useId();
  const roles = holdersOf(id, edges, nodes);
  const shown = roles.slice(0, HOLDERS_SHOWN);

  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      <p className="text-xs text-(--color-text-muted)">
        AuthSec changes roles, not {what === "resource" ? "resources" : "statements"}. A policy removes whole AWS services a role does not use; it cannot restrict
        access to one {what}.
      </p>
      {roles.length === 0 ? (
        <p className={quiet}>No role that reaches this is drawn on the canvas. Expand the graph to see who can, then select a role.</p>
      ) : (
        <>
          <p className="text-xs text-(--color-text)">
            {plural(roles.length, "role")} drawn here {roles.length === 1 ? "reaches" : "reach"} it. Others may exist that the canvas has not loaded.
          </p>
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.ref} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words text-[13px] font-medium text-(--color-text)">{r.label}</span>
                <CreatePolicyAction objectId={refId(r.ref)} label="Right-size" size="sm" variant="outline" lazy />
              </li>
            ))}
          </ul>
          {roles.length > shown.length ? <p className="text-xs text-(--color-text-muted)">+{roles.length - shown.length} more drawn here. Select one to act on it.</p> : null}
        </>
      )}
    </section>
  );
}

/* ------------------------------- grant line ------------------------------- */

function GrantLine({ edge, holder }: { edge: VisualEdge; holder: GraphNode | null }) {
  const heading = useId();
  const effect = edge.summary?.effect;
  const grants = independentCount(edge);
  return (
    <section aria-labelledby={heading} className="space-y-2 border-t border-(--color-border-subtle) pt-2">
      <Heading id={heading} />
      {!holder ? (
        <p className={quiet}>The role that holds this grant is not an IAM role drawn on the canvas, so there is nothing to change from here.</p>
      ) : effect === "deny" ? (
        <p className={quiet}>This is a Deny. A policy only removes access, so there is nothing to create from it.</p>
      ) : (
        <>
          <p className="text-xs text-(--color-text-muted)">
            A policy changes the role, not one grant. It removes whole services the role does not use, so every grant to a removed service goes with it
            {grants > 1 ? `; this line stands for ${grants} grants` : ""}. Services the role still uses stay as they are.
            {effect === "mixed" ? " This line mixes Allow and Deny statements; a policy acts only on the access it removes." : ""}
          </p>
          <div>
            <CreatePolicyAction objectId={refId(holder.ref)} label="Create policy for this role" size="sm" />
          </div>
        </>
      )}
    </section>
  );
}
