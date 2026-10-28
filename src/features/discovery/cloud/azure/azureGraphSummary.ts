/**
 * The Azure graph summary (`/authsec/discovery/azure/graph/summary`) shaped for
 * reading: one section per table, its kinds most numerous first, each with its
 * count per state. Counts only, as the backend reports them.
 */

import type { AzureGraphCount } from "@/app/api/cloudDiscoveryApi";

import { graphKindLabel } from "./azureDiscoveryLabels";

/** The tables, in the order a reader meets them, and what each one is. */
export const SUMMARY_TABLES: { table: string; label: string; noun: [string, string] }[] = [
  { table: "identity", label: "Identities", noun: ["identity", "identities"] },
  { table: "resource", label: "Resources", noun: ["resource", "resources"] },
  { table: "workload", label: "Workloads", noun: ["workload", "workloads"] },
  { table: "entitlement", label: "Roles and permissions", noun: ["role or permission", "roles and permissions"] },
  { table: "access_edge", label: "Access assignments", noun: ["access assignment", "access assignments"] },
  { table: "credential", label: "Credentials", noun: ["credential", "credentials"] },
  { table: "relationship", label: "Relationships", noun: ["relationship", "relationships"] },
];

/** States of a row that is no longer in Azure: retired, ended, revoked or
 * replaced. Every other state (active, current, expired, …) is still there. */
const GONE_STATES = new Set(["retired", "tombstoned", "ended", "revoked", "rotated"]);

export function isPresentState(state: string): boolean {
  return !GONE_STATES.has(state);
}

export interface SummaryKind {
  kind: string;
  label: string;
  /** Rows still in Azure. */
  present: number;
  /** Every row of the kind, in any state. */
  total: number;
  byState: { state: string; count: number }[];
}

export interface SummarySection {
  table: string;
  label: string;
  noun: [string, string];
  present: number;
  total: number;
  kinds: SummaryKind[];
}

export function summarizeGraph(rows: AzureGraphCount[]): SummarySection[] {
  const byTable = new Map<string, Map<string, SummaryKind>>();
  for (const r of rows) {
    const count = Number(r.count) || 0;
    if (count <= 0) continue;
    const kinds = byTable.get(r.table) ?? new Map<string, SummaryKind>();
    byTable.set(r.table, kinds);
    const k = kinds.get(r.kind) ?? { kind: r.kind, label: graphKindLabel(r.table, r.kind), present: 0, total: 0, byState: [] };
    kinds.set(r.kind, k);
    k.total += count;
    if (isPresentState(r.state)) k.present += count;
    const s = k.byState.find((x) => x.state === r.state);
    if (s) s.count += count;
    else k.byState.push({ state: r.state, count });
  }
  const known = SUMMARY_TABLES.map((t) => t.table);
  const extra = [...byTable.keys()].filter((t) => !known.includes(t)).sort();
  const tables = [...SUMMARY_TABLES, ...extra.map((t) => ({ table: t, label: t.replace(/_/g, " "), noun: [t, t] as [string, string] }))];
  return tables
    .filter((t) => byTable.has(t.table))
    .map((t) => {
      const kinds = [...byTable.get(t.table)!.values()].sort((a, b) => b.present - a.present || b.total - a.total || a.label.localeCompare(b.label));
      for (const k of kinds) k.byState.sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
      return {
        ...t,
        present: kinds.reduce((n, k) => n + k.present, 0),
        total: kinds.reduce((n, k) => n + k.total, 0),
        kinds,
      };
    });
}

/** The states the graph writes, in Azure's terms. */
const STATE_LABEL: Record<string, string> = {
  active: "In Azure",
  current: "In Azure",
  stale: "Not in latest scan",
  retired: "Deleted from Azure",
  tombstoned: "Deleted from Azure",
  ended: "Removed",
  revoked: "Revoked",
  rotated: "Replaced by a newer one",
  expired: "Expired",
  not_in_inventory: "Outside the scanned subscriptions",
};

/** A state as words: "tombstoned" → "Deleted from Azure"; an unknown state as written ("some_state" → "Some state"). */
export function stateLabel(state: string): string {
  if (STATE_LABEL[state]) return STATE_LABEL[state];
  const s = state.replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Not stated";
}
