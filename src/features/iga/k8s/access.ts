/**
 * What `/authsec/discovery/k8s/identities/:id/access` returns, made readable:
 * one row per rule (the API's own unit), and the same rows grouped by role for
 * the Overview, worst first.
 */

import type { K8sGrant } from "@/app/api/k8sGraphApi";

import {
  parseBindingKey,
  roleKindWord,
  ruleFlags,
  scopeOfBinding,
  type BindingRef,
  type RuleFlags,
  type Scope,
} from "./rules";

export interface AccessRow {
  key: string;
  grant: K8sGrant;
  binding: BindingRef | null;
  /** Where the binding applies the rule. Null only when the binding could not be read. */
  scope: Scope | null;
  roleKind: "Role" | "ClusterRole" | null;
  roleName: string;
  flags: RuleFlags;
  /** binding → role → rule all resolved. false: the role was not in the sweep — unresolved, not none. */
  resolved: boolean;
  /** The latest sweep could not reconfirm it; still believed. */
  stale: boolean;
  /** 0 wildcard · 1 escalation · 2 unresolved · 3 the rest. */
  rank: number;
}

function scopeOf(g: K8sGrant, binding: BindingRef | null): Scope | null {
  const s = scopeOfBinding(binding);
  if (s) return s;
  if (g.binding_kind === "k8s_cluster_role_binding") return { kind: "cluster" };
  // A RoleBinding's key could not be read: a Role's own namespace is the one place it can apply.
  return g.role_kind === "k8s_role" && g.namespace ? { kind: "namespace", namespace: g.namespace } : null;
}

/** Rows worst first (wildcard, escalation, unresolved, the rest), stable within a rank. */
export function accessRows(grants: K8sGrant[]): AccessRow[] {
  const rows = grants.map<AccessRow>((g, i) => {
    const binding = parseBindingKey(g.binding);
    const resolved = g.calculation_state === "complete";
    const flags = ruleFlags(g);
    const wildcard = flags.wildcard || g.wildcard;
    return {
      key: `${g.binding}:${g.role_name}:${i}`,
      grant: g,
      binding,
      scope: scopeOf(g, binding),
      roleKind: roleKindWord(g.role_kind),
      roleName: g.role_name,
      flags: { ...flags, wildcard, named: flags.named || g.constrained },
      resolved,
      stale: g.state === "stale",
      rank: wildcard ? 0 : flags.escalation ? 1 : !resolved ? 2 : 3,
    };
  });
  return rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => a.rank - b.rank || i - j).map(([r]) => r);
}

/** The rules one binding applies from one role: a card of the Overview. */
export interface AccessGroup {
  key: string;
  roleKind: AccessRow["roleKind"];
  roleName: string;
  binding: BindingRef | null;
  scope: Scope | null;
  rank: number;
  rows: AccessRow[];
}

export function accessGroups(rows: AccessRow[]): AccessGroup[] {
  const groups = new Map<string, AccessGroup>();
  for (const r of rows) {
    const key = `${r.roleKind ?? ""}|${r.roleName}|${r.grant.binding}`;
    const g = groups.get(key);
    if (g) {
      g.rows.push(r);
      g.rank = Math.min(g.rank, r.rank);
    } else groups.set(key, { key, roleKind: r.roleKind, roleName: r.roleName, binding: r.binding, scope: r.scope, rank: r.rank, rows: [r] });
  }
  return [...groups.values()].map((g, i) => [g, i] as const).sort(([a, i], [b, j]) => a.rank - b.rank || i - j).map(([g]) => g);
}
