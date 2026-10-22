/**
 * Access policies on the graph. The graph is declared access from the last
 * scan, and a Deny is never drawn as a line (it is a restriction, not access),
 * so a block an admin applied would otherwise be invisible here. AuthSec's own
 * record of the policies in force is authoritative for what it applied, and
 * needs no rescan: this reads it and says, per card and per line, what is
 * blocked.
 *
 *   role / identity card  "Blocked" while a Block policy names it
 *   resource card         "Blocked for N roles" while one covers the bucket or
 *                         path, or names the Azure resource
 *   declares / grant line blocked (the policy covers all access to that path or
 *                         resource) or partly blocked (some actions, or part of
 *                         the path)
 *
 * An Azure block removes the identity's role assignments on the resource, so
 * once a rescan has run the line it blocked is no longer drawn; the cards keep
 * saying so from AuthSec's record.
 *
 * Only policies in force count: applying, active, scheduled (in AWS, waiting
 * for its window) and changed-in-AWS (AuthSec is putting it back). Allow
 * policies add access the graph does not draw yet, so they mark nothing.
 */

import { useMemo } from "react";

import { useListAccessPoliciesQuery, type AccessPolicy } from "@/app/api/igaAccessPoliciesApi";
import { refId, type GraphNode } from "@/app/api/igaGraphApi";
import { getWorkspaceId } from "@/utils/workspace";

import { AZURE_TARGET_KINDS, bucketOf, pathInBucket, providerOf } from "../policy/access/model";
import { usePolicyCapabilities } from "../policy/shared/usePolicyCapabilities";

const IN_FORCE = new Set(["applying", "active", "scheduled", "drift"]);

export interface BlockMark {
  /** Every action on the path is blocked; false when only some actions or part of the path are. */
  full: boolean;
  policies: { id: string; name: string }[];
}

export interface GraphBlocks {
  /** Role (identity_account_id) → the Block policies naming it. */
  roleBlocks: (identityId: string) => BlockMark | null;
  /** Resource node → the Block policies covering it, and how many roles they name. */
  resourceBlocks: (node: GraphNode) => (BlockMark & { roles: number }) | null;
  /** A line from a role to a resource → whether a Block policy covers it. */
  lineBlock: (from: GraphNode | undefined, to: GraphNode | undefined) => BlockMark | null;
  /** Policies in force naming a role, for the selection card. */
  forRole: (identityId: string) => AccessPolicy[];
  forResource: (node: GraphNode) => AccessPolicy[];
}

const NONE: GraphBlocks = {
  roleBlocks: () => null,
  resourceBlocks: () => null,
  lineBlock: () => null,
  forRole: () => [],
  forResource: () => [],
};

/** Whether a graph node is an identity an access policy can name: an IAM role, or an Azure service principal, managed identity or agent identity. */
export function isPolicyHolder(n: GraphNode | undefined): boolean {
  if (!n) return false;
  return n.provider === "azure" ? AZURE_TARGET_KINDS.has(String(n.kind)) : n.kind === "iam_role";
}

/** How a policy covers a resource node: not at all, fully, or partly. AWS by the node's S3 ARN; Azure by the resource itself. */
function coverage(p: AccessPolicy, n: GraphNode | undefined): "none" | "full" | "partial" {
  if (providerOf(p.resource) === "azure") {
    if (n?.provider !== "azure" || n.kind !== "azure_resource" || refId(n.ref) !== p.resource.resource_id) return "none";
    return p.access.includes("all") ? "full" : "partial";
  }
  const text = textOf(n);
  const b = bucketOf(text ?? "");
  if (!b || b.bucket !== p.resource.bucket) return "none";
  const path = pathInBucket(text ?? "");
  const prefix = p.resource.prefix;
  const inside = !prefix || path.startsWith(prefix);
  // The bucket itself (or all of it) under a folder-only policy: only that folder is blocked.
  if (!inside) return path === "" || prefix.startsWith(path.replace(/\*$/, "")) ? "partial" : "none";
  return p.access.includes("all") ? "full" : "partial";
}

function textOf(n: GraphNode | undefined): string | undefined {
  return n?.text ?? n?.arn ?? n?.label;
}

function mark(list: { p: AccessPolicy; c: "full" | "partial" }[]): BlockMark | null {
  if (!list.length) return null;
  return { full: list.some((x) => x.c === "full"), policies: list.map((x) => ({ id: x.p.id, name: x.p.name })) };
}

/** The Block policies in force in this workspace, as graph marks. Nothing while access policies are off. */
export function useGraphBlocks(): GraphBlocks {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const on = caps.feature("access_policies");
  const q = useListAccessPoliciesQuery({ ws, effect: "block", limit: 200 }, { skip: !on, pollingInterval: 60_000, skipPollingIfUnfocused: true });

  return useMemo(() => {
    const live = (q.data?.data ?? []).filter((p) => p.effect === "block" && IN_FORCE.has(p.status));
    if (!on || !live.length) return NONE;
    const naming = (id: string) => live.filter((p) => p.roles.some((r) => r.identity_account_id === id));
    const covering = (n: GraphNode) =>
      live.map((p) => ({ p, c: coverage(p, n) })).filter((x): x is { p: AccessPolicy; c: "full" | "partial" } => x.c !== "none");
    return {
      roleBlocks: (id) => mark(naming(id).map((p) => ({ p, c: p.access.includes("all") ? "full" : "partial" }))),
      resourceBlocks: (n) => {
        const m = mark(covering(n));
        if (!m) return null;
        const roles = new Set(covering(n).flatMap((x) => x.p.roles.map((r) => r.identity_account_id)));
        return { ...m, roles: roles.size };
      },
      lineBlock: (from, to) => {
        if (!from || !to || !isPolicyHolder(from)) return null;
        const id = refId(from.ref);
        return mark(covering(to).filter((x) => x.p.roles.some((r) => r.identity_account_id === id)));
      },
      forRole: naming,
      forResource: (n) => covering(n).map((x) => x.p),
    };
  }, [q.data, on]);
}
