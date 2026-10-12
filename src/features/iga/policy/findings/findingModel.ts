/**
 * What the Findings list, its drawer and the object panels say about a finding
 * (SPEC-iga-phase3-policy.md §9.3 S1/S2). Pure. Every sentence is built from
 * the finding's own `condition.detail` or from the activity evidence the
 * evaluator stored; nothing is inferred from the rows a page happened to load.
 */

import { format, isValid, parseISO } from "date-fns";

import {
  FINDING_CONFIDENCES,
  FINDING_KINDS,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  govFindingDetail,
  type GovActivityEvidence,
  type GovFinding,
  type GovFindingKind,
  type GovFindingStatus,
  type GovUnusedServiceDetail,
} from "@/app/api/igaPolicyReadsApi";

import { humanize, plural, relTime, serviceList } from "../shared";

export const FINDINGS_PATH = "/iga/policy/findings";

/** Statuses a person can still act on from the list. */
export const ACTIONABLE_STATUSES: readonly GovFindingStatus[] = ["open", "reopened"];

/** A value from the URL, kept only when it is one the API accepts. */
export function oneOf<T extends string>(allowed: readonly T[], v: string | null): T | undefined {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}
export const parseKind = (v: string | null) => oneOf(FINDING_KINDS, v);
export const parseStatus = (v: string | null) => oneOf(FINDING_STATUSES, v);
export const parseSeverity = (v: string | null) => oneOf(FINDING_SEVERITIES, v);
export const parseConfidence = (v: string | null) => oneOf(FINDING_CONFIDENCES, v);

/** `/iga/policy/findings?…` with only the filters that are set. */
export function findingsHref(filter: Record<string, string | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${FINDINGS_PATH}?${s}` : FINDINGS_PATH;
}

export const findingHref = (id: string) => findingsHref({ finding: id });

/** The new-policy flow for one or more findings (`?finding=<id>[,<id>]`). */
export function newPolicyHref(findingIds: string[]): string {
  return `/iga/policy/new?finding=${findingIds.map(encodeURIComponent).join(",")}`;
}

/** A console path the server gave us, kept only when it stays inside the console. */
export function consolePath(p: string | null | undefined): string | null {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
}

/** Where a finding's collection gap is fixed: the connection's Coverage tab, never a copy of the gap. */
export function coverageHref(f: Pick<GovFinding, "collection_gap">): string {
  return consolePath(f.collection_gap?.remedy) ?? "/iga/connections";
}

export function coverageHrefFor(connectorId: string | null | undefined): string {
  return connectorId ? `/iga/connections/${encodeURIComponent(connectorId)}/coverage` : "/iga/connections";
}

/** Discovery's page for the role or the workload a finding is about. */
export function discoveryHref(f: Pick<GovFinding, "identity_account_id">): string | null {
  return f.identity_account_id ? `/iga/identities/${encodeURIComponent(f.identity_account_id)}` : null;
}

export function dateWords(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return isValid(d) ? format(d, "d MMM yyyy") : "";
}

const sameDay = (a: string | null, b: string | null) => !!a && !!b && a.slice(0, 10) === b.slice(0, 10);

/* --------------------------------- unused --------------------------------- */

export interface UnusedSummary {
  /** The unused_service findings of one role, in the order given. */
  findings: GovFinding[];
  services: string[];
  /** The shortest and longest qualified window among them, in days. */
  minDays: number | null;
  maxDays: number | null;
  /** Services whose grant existed before AuthSec's first scan: the owner is asked to confirm their age. */
  ageUnverified: string[];
  /** The detail with the shortest window: the one whose limit the headline explains. */
  limiting: GovUnusedServiceDetail | null;
}

export function summarizeUnused(fs: GovFinding[]): UnusedSummary {
  const findings = fs.filter((f) => f.kind === "unused_service");
  const services: string[] = [];
  const ageUnverified: string[] = [];
  let minDays: number | null = null;
  let maxDays: number | null = null;
  let limiting: GovUnusedServiceDetail | null = null;
  for (const f of findings) {
    services.push(f.detail_key);
    const d = govFindingDetail(f, "unused_service");
    if (f.condition?.confidence === "age_unverified" || d?.grant_age_basis === "predates_observation") ageUnverified.push(f.detail_key);
    if (d && typeof d.qualified_days === "number") {
      if (minDays === null || d.qualified_days < minDays) {
        minDays = d.qualified_days;
        limiting = d;
      }
      if (maxDays === null || d.qualified_days > maxDays) maxDays = d.qualified_days;
    }
  }
  return { findings, services, minDays, maxDays, ageUnverified, limiting };
}

/** "11 services have no reported attempt in the last 112 days". */
export function unusedHeadline(u: UnusedSummary): string {
  const n = u.services.length;
  const who = n === 1 ? "service has" : "services have";
  if (u.minDays === null) return `${n} ${who} no reported attempt in the review window`;
  const longer = u.maxDays !== null && u.maxDays !== u.minDays;
  return `${n} ${who} no reported attempt in the last ${plural(u.minDays, "day")}${longer ? " or more" : ""}`;
}

/** Why the window is as long as it is, in the reader's words. */
export function windowReason(d: GovUnusedServiceDetail | null): string {
  if (!d) return "";
  const days = plural(d.qualified_days, "day");
  if (d.qualified_days >= d.requested_window_days) {
    return `The window is ${days}, the review period this workspace asked for.`;
  }
  if (sameDay(d.verified_grant_from, d.window_start)) {
    return `The window is ${days} because AuthSec has seen this grant only since ${dateWords(d.verified_grant_from)}.`;
  }
  if (sameDay(d.role_created_at, d.window_start)) {
    return `The window is ${days} because the role was created on ${dateWords(d.role_created_at)}.`;
  }
  if (sameDay(d.tracking_from, d.window_start)) {
    return `The window is ${days} because AWS reports activity for this service only since ${dateWords(d.tracking_from)}.`;
  }
  return `The window is ${days}: the longest history AuthSec can vouch for here (the review period asked for is ${plural(d.requested_window_days, "day")}).`;
}

/** Access Advisor's own lag, stated beside the report time. */
export function advisorLagWords(d: GovUnusedServiceDetail | null): string {
  const base = "AWS Access Advisor reports attempts up to about 4 hours before the report was generated";
  return d?.report_generated_at ? `${base} (generated ${relTime(d.report_generated_at)}).` : `${base}.`;
}

/* -------------------------------- evidence -------------------------------- */

export interface ActivityBuckets {
  unused: string[];
  used: { service: string; at: string }[];
  /** Granted, no attempt reported, but too little history to call it unused. */
  tooRecent: string[];
  /** Granted, and AuthSec cannot judge it (not tracked by AWS, or the grant path could not be traced). */
  kept: { service: string; why: string }[];
  /** Activity was not read for the role. */
  notRead: string[];
  total: number;
}

const KEPT_WHY: Record<string, string> = {
  grant_path_not_reconstructable: "AuthSec could not trace how it is granted",
  service_not_in_tracking_catalog: "AWS does not report activity for it",
};

export const keptWhy = (reason: string) => KEPT_WHY[reason] ?? humanize(reason).toLowerCase();

export function bucketActivity(evidence: GovActivityEvidence[], unusedServices: string[]): ActivityBuckets {
  const unusedSet = new Set(unusedServices);
  const out: ActivityBuckets = { unused: [...unusedServices].sort(), used: [], tooRecent: [], kept: [], notRead: [], total: evidence.length };
  for (const e of evidence) {
    if (e.state === "not_collected") out.notRead.push(e.service);
    else if (unusedSet.has(e.service)) continue;
    else if (e.reason) out.kept.push({ service: e.service, why: keptWhy(e.reason) });
    else if (e.last_authenticated_at) out.used.push({ service: e.service, at: e.last_authenticated_at });
    else out.tooRecent.push(e.service);
  }
  out.used.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
}

/** "3 of 14 used · 112 days" for the list's evidence column. */
export function usedOfTotal(b: ActivityBuckets): string {
  return `${b.used.length} of ${b.total} used`;
}

export function usedWords(b: ActivityBuckets, max = 4): string {
  if (b.used.length === 0) return "none reported";
  const head = b.used.slice(0, max).map((u) => `${u.service} (${relTime(u.at)})`).join(" · ");
  return b.used.length > max ? `${head} · +${b.used.length - max}` : head;
}

/** Grant age in the reader's words. */
export function grantAgeWords(u: UnusedSummary): string {
  if (u.ageUnverified.length === 0) return "";
  return `${serviceList(u.ageUnverified, 5)} existed before AuthSec's first scan. The owner is asked to confirm they were not added recently.`;
}

/* ------------------------------ other kinds ------------------------------- */

/** One line for a finding that is not an unused service. */
export function otherHeadline(f: GovFinding): { title: string; evidence: string } {
  switch (f.kind) {
    case "broad_grant": {
      const d = govFindingDetail(f, "broad_grant");
      if (!d) return { title: "Broad grant", evidence: "" };
      const parts: string[] = [];
      if (d.reasons?.includes("full_wildcard")) parts.push("Allows every action on every resource");
      if (d.reasons?.includes("not_action_on_all_resources")) parts.push("Allows everything except a list of actions, on every resource");
      if (d.reasons?.includes("service_wildcard")) parts.push(`Wildcard on ${serviceList((d.service_wildcards ?? []).map((s) => s.replace(/:\*$/, "")), 3)}`);
      if (d.reasons?.includes("escalation")) parts.push(`Can escalate privileges (${serviceList(d.escalations ?? [], 3)})`);
      const where = d.assignment_kind === "inline" ? "inline policy" : "attached policy";
      return {
        title: parts[0] ?? "Broad grant",
        evidence: `${[...parts.slice(1), `1 statement · ${where}`].join(" · ")}${d.has_condition ? " · has a condition" : ""}`,
      };
    }
    case "shared_role": {
      const d = govFindingDetail(f, "shared_role");
      const n = d?.workload_count ?? d?.consumers?.length ?? 0;
      return { title: n > 0 ? `Shared by ${plural(n, "workload")}` : "Shared role", evidence: "A change to this role affects every workload that runs as it." };
    }
    case "missing_owner": {
      const d = govFindingDetail(f, "missing_owner");
      const n = d?.consumers?.length ?? 0;
      const tags = d?.unmatched_owner_tags?.length ?? 0;
      return {
        title: "No accountable owner",
        evidence: [n > 0 ? `${plural(n, "workload")} run as it` : "", tags > 0 ? `${plural(tags, "owner tag")} matched no rule` : ""].filter(Boolean).join(" · "),
      };
    }
    case "missing_review_date": {
      const d = govFindingDetail(f, "missing_review_date");
      const n = d?.owner_ids_without_review_date?.length ?? 0;
      return { title: "Owner review date not set", evidence: n > 0 ? `${plural(n, "owner")} without a review date` : "" };
    }
    case "activity_not_read":
      return { title: "AWS activity was not read for this role", evidence: "AuthSec cannot say whether anything is unused until it is." };
    default:
      return { title: humanize(f.kind), evidence: "" };
  }
}

/* ---------------------------------- trust --------------------------------- */

const TRUST_REASON: Record<string, string> = {
  stale: "the scan is out of date",
  unauthenticated: "the collector was not authenticated",
  unordered: "the collection order could not be confirmed",
  no_complete_evaluation: "no evaluation has completed yet",
  role_not_in_latest_evaluation: "the role is not in the latest evaluation",
  "provider_not_supported:K-1": "Kubernetes evidence is not yet trusted for policy",
  resource_policy_coverage_partial: "resource policies were only partly collected",
  resource_policy_coverage_not_collected: "resource policies were not collected",
  resource_policy_coverage_denied: "resource policies could not be read",
};

export const trustReasonWords = (code: string) => TRUST_REASON[code] ?? humanize(code).toLowerCase();

export const KIND_ORDER: GovFindingKind[] = ["unused_service", "broad_grant", "shared_role", "missing_owner", "missing_review_date", "activity_not_read"];

/** The kind tiles say what a finding is, in the plural. */
export const KIND_TILE: Record<GovFindingKind, string> = {
  unused_service: "Unused services",
  broad_grant: "Broad grants",
  shared_role: "Shared roles",
  missing_owner: "No owner",
  missing_review_date: "No review date",
  activity_not_read: "Activity not read",
};
