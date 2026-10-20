/**
 * What the graph's selection card offers about policy. With the one access-policy
 * feature, a policy blocks or allows an IAM role's access to an S3 bucket for a
 * set window. The card is the way in: its main button carries the thing selected
 * into the create form (`/iga/policy/new`), which resolves it server-side.
 *
 *   IAM role        main button: a policy for this role; policies in force listed
 *   S3 resource     main button: a policy on this bucket; the roles drawn as
 *                   reaching it are shortcuts that fill in the role as well
 *   workload        no policy of its own: points at the role it runs as
 *   other resource  one line: only S3 buckets are supported
 *   grant line      main button: a policy for the role that holds the grant
 *   IAM user/group  one line: policies change roles, not users or groups
 *   Kubernetes      the shared "not yet supported" note
 *   statement       nothing: a statement is evidence, not something to govern
 *
 * Nothing renders, and no button is offered, while the policy product is off.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { refId, type GraphNode, type GraphRef } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { getWorkspaceId } from "@/utils/workspace";

import type { AccessPolicy } from "@/app/api/igaAccessPoliciesApi";

import { bucketOf, whenText } from "../policy/access/model";
import { KubernetesPolicyNote, usePolicyCapabilities } from "../policy/shared";
import { useGraphBlocks } from "./policyBlocks";
import type { SelectionSubject } from "./SelectionCard";
import type { VisualEdge } from "./types";

const ROLES_SHOWN = 5;

/** The card's main policy button: where it goes and what it says. */
export interface PolicyAction {
  label: string;
  to: string;
}

function newPolicyHref(query: { identity_account_id?: string; resource_id?: string }) {
  const qs = new URLSearchParams(Object.entries(query).filter((kv): kv is [string, string] => !!kv[1])).toString();
  return `/iga/policy/new?${qs}`;
}

function Section({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Access policy" className="space-y-2.5 border-t border-(--color-border-subtle) pt-3">
      <h3 className="text-[13px] font-semibold text-(--color-text)">Access policy</h3>
      {children}
    </section>
  );
}

const note = "text-xs leading-relaxed text-(--color-text-muted)";

/** The access policies in force on what is selected, from AuthSec's own record (a rescan is not needed). */
function InForce({ policies }: { policies: AccessPolicy[] }) {
  if (!policies.length) return null;
  return (
    <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
      {policies.map((p) => (
        <li key={p.id}>
          <Link to={`/iga/policy/${p.id}`} className="flex items-center gap-2 px-2.5 py-2 text-xs hover:bg-(--color-surface-subtle)">
            <StatusBadge tone={p.effect === "block" ? "danger" : "success"}>{p.effect === "block" ? "Blocked" : "Allowed"}</StatusBadge>
            <span className="min-w-0 flex-1 truncate font-medium text-(--color-text)" title={p.name}>{p.name}</span>
            <span className="shrink-0 text-(--color-text-muted)">{whenText(p)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The policy part of the selection card: its section, and the main button the
 * card puts in its footer. A hook, because the button and the section come from
 * the same decision and must never disagree.
 */
export function usePolicyCard({
  subject,
  edges,
  nodes,
  onSelectNode,
}: {
  subject: SelectionSubject;
  edges: VisualEdge[];
  nodes: Map<GraphRef, GraphNode>;
  onSelectNode: (id: string) => void;
}): { section: ReactNode; action: PolicyAction | null } {
  const caps = usePolicyCapabilities(getWorkspaceId() ?? "");
  const none = { section: null, action: null };
  if (caps.state !== "on") return none;

  if (subject.kind === "edge") {
    const e = subject.edge;
    if (e.kind !== "declares") return none;
    const holder = nodes.get(e.from as GraphRef);
    if (holder?.kind !== "iam_role") return none;
    const target = nodes.get(e.to as GraphRef);
    const s3 = target ? bucketOf(target.text ?? target.arn ?? target.label) : null;
    return {
      section: null,
      action: {
        label: "New access policy",
        to: newPolicyHref({ identity_account_id: refId(holder.ref), resource_id: s3 && target ? refId(target.ref) : undefined }),
      },
    };
  }

  const v = subject.visual;
  const first = v.members[0];
  if (!first || v.overflow || v.members.length > 1) return none;
  if (first.provider === "k8s") return { section: <KubernetesPolicyNote />, action: null };

  switch (first.kind) {
    case "iam_role": {
      const id = refId(first.ref);
      return {
        section: <RoleSection identityId={id} />,
        action: { label: "New access policy", to: newPolicyHref({ identity_account_id: id }) },
      };
    }
    case "workload": {
      const runs = edges.find((e) => e.kind === "executes_as" && e.members.some((m) => m.from === first.ref));
      const role = runs ? nodes.get(runs.members[0].to) : undefined;
      return {
        section: (
          <Section>
            <p className={note}>
              A workload has no policy of its own. A policy on the role it runs as applies to it, and to everything else that runs as that role.
            </p>
            {role?.kind === "iam_role" && runs ? (
              <button
                type="button"
                onClick={() => onSelectNode(runs.to)}
                className="flex w-full items-center gap-2 rounded-md border border-(--color-border-subtle) px-2.5 py-2 text-left text-[13px] hover:border-(--color-primary) hover:bg-(--color-primary-soft)"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-(--color-text)">{role.label}</span>
                <span className="shrink-0 text-xs text-(--color-primary-text)">Select role</span>
              </button>
            ) : null}
          </Section>
        ),
        action: null,
      };
    }
    case "iam_user":
    case "iam_group":
      return {
        section: (
          <Section>
            <p className={note}>Access policies change IAM roles, not {first.kind === "iam_user" ? "users" : "groups"}.</p>
          </Section>
        ),
        action: null,
      };
    case "exact":
    case "selector":
    case "external": {
      const s3 = bucketOf(first.text ?? first.arn ?? first.label);
      if (!s3) {
        return {
          section: (
            <Section>
              <p className={note}>Access policies cover S3 buckets for now, so none can be set on this resource.</p>
            </Section>
          ),
          action: null,
        };
      }
      const resourceId = refId(first.ref);
      return {
        section: <BucketSection id={v.id} node={first} bucket={s3.prefix ? `${s3.bucket}/${s3.prefix}` : s3.bucket} resourceId={resourceId} edges={edges} nodes={nodes} />,
        action: { label: "New access policy", to: newPolicyHref({ resource_id: resourceId }) },
      };
    }
    default:
      return none;
  }
}

/* ---------------------------------- role ---------------------------------- */

function RoleSection({ identityId }: { identityId: string }) {
  const blocks = useGraphBlocks();
  const inForce = blocks.forRole(identityId);
  return (
    <Section>
      <InForce policies={inForce} />
      <p className={note}>
        {inForce.length ? "Add another to block or allow this role on an S3 bucket for a set window." : "Block or allow this role on an S3 bucket for a set window."}
      </p>
    </Section>
  );
}

/* --------------------------------- bucket --------------------------------- */

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

function BucketSection({
  id,
  node,
  bucket,
  resourceId,
  edges,
  nodes,
}: {
  id: string;
  node: GraphNode;
  bucket: string;
  resourceId: string;
  edges: VisualEdge[];
  nodes: Map<GraphRef, GraphNode>;
}) {
  const blocks = useGraphBlocks();
  const roles = holdersOf(id, edges, nodes);
  const shown = roles.slice(0, ROLES_SHOWN);
  return (
    <Section>
      <InForce policies={blocks.forResource(node)} />
      <p className={note}>Block or allow a role&rsquo;s access to {bucket} for a set window.</p>
      {shown.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-(--color-text)">Start from a role that reaches it</p>
          <ul className="divide-y divide-(--color-border-subtle) overflow-hidden rounded-md border border-(--color-border-subtle)">
            {shown.map((r) => (
              <li key={r.ref}>
                <Link
                  to={newPolicyHref({ identity_account_id: refId(r.ref), resource_id: resourceId })}
                  aria-label={`New access policy for ${r.label} on ${bucket}`}
                  className="group flex items-center gap-2 px-2.5 py-2 text-[13px] hover:bg-(--color-primary-soft)"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-(--color-text) group-hover:text-(--color-primary-text)" title={r.label}>
                    {r.label}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-(--color-text-muted) group-hover:text-(--color-primary-text)" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {roles.length > shown.length ? <p className={note}>{roles.length - shown.length} more drawn on the canvas.</p> : null}
        </div>
      ) : null}
    </Section>
  );
}
