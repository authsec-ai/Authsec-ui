/**
 * What the access-policy screens say about a policy, and the create/edit form's
 * draft. Pure.
 *
 * A policy blocks or allows identities on one resource for a time window
 * (SPEC-access-policies.md). AWS: IAM roles on an S3 bucket or a folder of it;
 * AuthSec attaches its own IAM policy to each role and the window is written
 * into it, so AWS honours it even when AuthSec is down. Azure: service
 * principals, managed identities and agent identities on one resource; AuthSec
 * removes (block) or creates (allow) role assignments and undoes it at the end.
 */

import { differenceInMinutes, format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

import type { ConsoleTone } from "@/components/console/status";
import { refId, type GraphNeighbourhood } from "@/app/api/igaGraphApi";
import type { InventoryRow } from "@/app/api/igaInventoryApi";
import { armTypeLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";

import { humanize } from "../shared";
import type {
  AccessEffect,
  AccessLevel,
  AccessPolicy,
  AccessPolicyBody,
  AccessPolicyDetail,
  AccessPolicyStatus,
  AccessProvider,
} from "@/app/api/igaAccessPoliciesApi";

/* -------------------------------- providers -------------------------------- */

export const CLOUD: Record<AccessProvider, { label: string; who: string; whoPlural: string }> = {
  aws: { label: "AWS", who: "role", whoPlural: "roles" },
  azure: { label: "Azure", who: "identity", whoPlural: "identities" },
};

/** A policy's cloud: the server's word when it sends one, else read off the resource (AWS before Azure existed). */
export function providerOf(r: { provider?: AccessProvider; arn?: string; bucket?: string }): AccessProvider {
  if (r.provider) return r.provider;
  return !r.bucket && r.arn?.toLowerCase().startsWith("/subscriptions/") ? "azure" : "aws";
}

/** "role" / "roles", "identity" / "identities". */
export function whoWord(provider: AccessProvider, n = 1): string {
  return n === 1 ? CLOUD[provider].who : CLOUD[provider].whoPlural;
}

/** The Azure identity kinds a policy can name (the backend's azureEligibleKinds). */
export const AZURE_TARGET_KINDS = new Set(["entra_service_principal", "entra_managed_identity", "entra_agent_identity"]);

/** Whether an ARM id names a storage account (or something in one): its access levels are blob data. */
export function isAzureStorage(arn: string | undefined): boolean {
  return !!arn && arn.toLowerCase().includes("/providers/microsoft.storage/storageaccounts/");
}

/* --------------------------------- states --------------------------------- */

/** Statuses in words that hold for either cloud; the detail page names the cloud. */
export const STATUS: Record<AccessPolicyStatus, { label: string; tone: ConsoleTone; hint: string }> = {
  applying: { label: "Applying", tone: "info", hint: "AuthSec is applying it in the cloud and reading it back." },
  scheduled: { label: "Scheduled", tone: "info", hint: "It takes effect when its window starts." },
  active: { label: "Active", tone: "success", hint: "In place and inside its window." },
  drift: { label: "Changed outside AuthSec", tone: "warning", hint: "Someone changed it in the cloud. AuthSec is putting it back." },
  failed: { label: "Failed", tone: "danger", hint: "AuthSec could not apply it to every identity. Open it to see why." },
  paused: { label: "Paused", tone: "warning", hint: "Lifted by hand. Resume puts it back." },
  ended: { label: "Ended", tone: "info", hint: "No longer in force. The record is kept." },
};

export const STATUS_ORDER: AccessPolicyStatus[] = ["active", "applying", "scheduled", "drift", "failed", "paused", "ended"];

/**
 * One identity's part of a policy, by the backend's deployment state. An Azure
 * block takes the identity's role assignments away while it is in force and
 * gives them back at the end, so its words run the other way round.
 */
export function deploymentView(state: string, provider: AccessProvider = "aws", effect: AccessEffect = "block"): { label: string; tone: ConsoleTone } {
  const azureBlock = provider === "azure" && effect === "block";
  switch (state) {
    case "approved":
    case "deploying":
      return { label: "Applying", tone: "info" };
    case "outcome_unknown":
      return { label: `Checking ${CLOUD[provider].label}`, tone: "warning" };
    case "active":
      return { label: azureBlock ? "Access removed" : provider === "azure" ? "Assigned" : "In AWS", tone: "success" };
    case "expiring":
      return { label: azureBlock ? "Restoring" : "Removing", tone: "info" };
    case "expired":
    case "revoked":
      return { label: azureBlock ? "Restored" : "Removed", tone: "neutral" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    default:
      return { label: state || "Unknown", tone: "neutral" };
  }
}

export const EFFECT: Record<AccessEffect, { label: string; tone: ConsoleTone; verb: string }> = {
  block: { label: "Block", tone: "danger", verb: "blocked from" },
  allow: { label: "Allow", tone: "info", verb: "allowed to" },
};

export const END_REASON: Record<string, string> = {
  expired: "Its window ended.",
  ended: "Ended by hand.",
  superseded: "Replaced by a newer version.",
  paused: "Paused.",
  expired_before_deploy: "Its window had passed before it could be applied.",
};

/* --------------------------------- events --------------------------------- */

/** The history event names (GovEvent `event`) as words, from the contract. */
const EVENT_LABEL: Record<string, string> = {
  "access_policy.created": "Created",
  "access_policy.applied": "Applied",
  "access_policy.confirmed": "In place (verified)",
  "access_policy.edited": "Edited",
  "access_policy.paused": "Paused",
  "access_policy.resumed": "Resumed",
  "access_policy.ended": "Ended",
  "access_policy.expired": "Reached its end time",
  "access_policy.removed": "Taken off",
  "access_policy.drifted": "Changed outside AuthSec",
  "access_policy.reapplied": "Put back by AuthSec",
  "access_policy.failed": "Failed",
};

/**
 * The words for a history event. A version number or role, when the payload
 * carries one, is appended so "Applied" reads "Applied · v2". Unknown names are
 * humanised (`access_policy.something_new` → "Something new").
 */
export function eventLabel(
  e: { event: string; payload?: Record<string, unknown> },
  ctx: { provider: AccessProvider; effect: AccessEffect } = { provider: "aws", effect: "block" },
): string {
  // An Azure block ends by giving the identity its role assignments back.
  const base =
    e.event === "access_policy.removed" && ctx.provider === "azure" && ctx.effect === "block"
      ? "Access restored"
      : e.event === "access_policy.outcome_unknown"
        ? `Waiting for ${CLOUD[ctx.provider].label} to confirm`
        : EVENT_LABEL[e.event] ?? humanize(e.event.replace(/^access_policy\./, "").replace(/_/g, " "));
  const no = e.payload?.version_no;
  const reason = e.payload?.reason;
  const parts = [base];
  if (typeof no === "number") parts.push(`v${no}`);
  if ((e.event === "access_policy.paused" || e.event === "access_policy.resumed" || e.event === "access_policy.ended") && typeof reason === "string" && reason) {
    parts.push(reason);
  }
  if (e.event === "access_policy.removed" && typeof e.payload?.end_reason === "string" && e.payload.end_reason) {
    parts.push(END_REASON[e.payload.end_reason] ?? String(e.payload.end_reason));
  }
  if (e.event === "access_policy.failed" && typeof e.payload?.reason === "string" && e.payload.reason) {
    parts.push(String(e.payload.reason));
  }
  return parts.join(" · ");
}

/* --------------------------------- access --------------------------------- */

export const ACCESS: { key: Exclude<AccessLevel, "all">; label: string; blurb: string; verb: string; base: string }[] = [
  { key: "read", label: "Read", blurb: "List the folder and read objects.", verb: "reading", base: "read" },
  { key: "write", label: "Write", blurb: "Upload and overwrite objects.", verb: "writing", base: "write" },
  { key: "delete", label: "Delete", blurb: "Remove objects and their versions.", verb: "deleting", base: "delete" },
];

/** What each level covers on this resource: S3 objects, Azure blobs, or another Azure resource's management. */
export function accessBlurbs(provider: AccessProvider, arn?: string): Record<Exclude<AccessLevel, "all">, string> {
  if (provider === "aws") return { read: ACCESS[0].blurb, write: ACCESS[1].blurb, delete: ACCESS[2].blurb };
  if (isAzureStorage(arn)) return { read: "Read blobs.", write: "Upload and overwrite blobs.", delete: "Delete blobs." };
  return { read: "Read the resource and its settings.", write: "Change the resource.", delete: "Delete the resource." };
}

/** "Read, Write" or "All access". */
export function accessText(levels: readonly AccessLevel[]): string {
  if (levels.includes("all")) return "All access";
  return ACCESS.filter((a) => levels.includes(a.key)).map((a) => a.label).join(", ") || "None";
}

/**
 * "reading and writing" or "everything". With `base`, the plain verbs
 * ("read and write") that follow "allowed to"; "blocked from" takes the -ing form.
 */
export function accessVerb(levels: readonly AccessLevel[], base = false): string {
  if (levels.includes("all")) return "everything";
  const v = ACCESS.filter((a) => levels.includes(a.key)).map((a) => (base ? a.base : a.verb));
  return v.length <= 1 ? v.join("") : `${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}`;
}

/**
 * What a policy is on, in words: `finance-reports/invoices/` (a folder),
 * `finance-reports` (a whole bucket), or an Azure resource's name.
 */
export function resourceText(r: { bucket?: string; prefix: string; name?: string; arn?: string; provider?: AccessProvider }): string {
  if (providerOf(r) === "azure") return r.name || (r.arn ? r.arn.slice(r.arn.lastIndexOf("/") + 1) : "");
  const bucket = r.bucket || r.name || "";
  return r.prefix ? `${bucket}/${r.prefix}` : bucket;
}

/**
 * Whether a path Discovery saw a role reach inside a bucket (`""` the whole
 * bucket, `attachments/*`, `reports/q3.csv`) overlaps the folder a rule is for
 * (`""` the whole bucket, else `sandbox/`). A role that holds `attachments/*`
 * does not reach `sandbox/`; one that holds the bucket, or `sandbox/a.txt`, or
 * `sand*`, does.
 */
export function pathReachesFolder(path: string, folder: string): boolean {
  const f = folder.trim();
  const p = path.replace(/\*+$/, "");
  return f === "" || p === "" || p.startsWith(f) || f.startsWith(p);
}

/** Whether any of the paths a role holds reaches the folder. */
export function reachesFolder(paths: readonly string[], folder: string): boolean {
  return paths.some((p) => pathReachesFolder(p, folder));
}

/** The bucket name out of an S3 ARN or selector text, or "" when it is not one. */
export function bucketOf(text: string | null | undefined): { bucket: string; prefix: string } | null {
  const m = text ? /^arn:aws[a-z-]*:s3:::([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])(?:\/(.*))?$/.exec(text.trim()) : null;
  if (!m) return null;
  const rest = (m[2] ?? "").replace(/\*+$/, "");
  const slash = rest.lastIndexOf("/");
  return { bucket: m[1], prefix: slash >= 0 ? rest.slice(0, slash + 1) : "" };
}

/* --------------------------------- window --------------------------------- */

const stamp = (iso: string) => format(parseISO(iso), "d MMM HH:mm");

/** "9 Oct 09:00 → 10 Oct 09:00", "Until 10 Oct 09:00", "From 9 Oct 09:00" or "No end". */
export function windowText(p: { starts_at: string | null; ends_at: string | null }): string {
  if (p.starts_at && p.ends_at) return `${stamp(p.starts_at)} → ${stamp(p.ends_at)}`;
  if (p.ends_at) return `Until ${stamp(p.ends_at)}`;
  if (p.starts_at) return `From ${stamp(p.starts_at)}`;
  return "No end";
}

/** Where it stands in time: "Ends in 22 hours", "Starts in 2 days", "Ended 3 hours ago". */
export function whenText(p: Pick<AccessPolicy, "status" | "starts_at" | "ends_at" | "ended_at">): string {
  const rel = (iso: string, suffix: boolean) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: suffix });
  switch (p.status) {
    case "scheduled":
      return p.starts_at ? `Starts in ${rel(p.starts_at, false)}` : "";
    case "ended":
      return p.ended_at ? `Ended ${rel(p.ended_at, true)}` : p.ends_at ? `Ended ${rel(p.ends_at, true)}` : "Ended";
    case "paused":
      return "Paused by hand";
    default:
      return p.ends_at ? `Ends in ${rel(p.ends_at, false)}` : "No end";
  }
}

/** How far through its window a policy is, 0..1; null without both ends. */
export function windowProgress(p: { starts_at: string | null; ends_at: string | null; created_at: string }, now = new Date()): number | null {
  const start = p.starts_at ?? p.created_at;
  if (!start || !p.ends_at) return null;
  const a = parseISO(start).getTime();
  const b = parseISO(p.ends_at).getTime();
  if (!(b > a)) return null;
  return Math.min(1, Math.max(0, (now.getTime() - a) / (b - a)));
}

export function windowLength(p: { starts_at: string | null; ends_at: string | null; created_at: string }): string | null {
  const start = p.starts_at ?? p.created_at;
  if (!start || !p.ends_at) return null;
  const m = differenceInMinutes(parseISO(p.ends_at), parseISO(start));
  if (m < 90) return `${m} minutes`;
  if (m < 60 * 48) return `${Math.round(m / 60)} hours`;
  return `${Math.round(m / 1440)} days`;
}

/** The sentence for a policy, saved or drafted. */
export function policySentence(p: {
  effect: AccessEffect;
  access: readonly AccessLevel[];
  roles: readonly { name: string }[];
  resource: Parameters<typeof resourceText>[0];
  starts_at: string | null;
  ends_at: string | null;
}): string {
  const who = p.roles.map((r) => r.name).join(" and ") || "No one";
  const tail = p.ends_at ? ` until ${stamp(p.ends_at)}` : " until the policy is ended";
  const from = p.starts_at ? `, from ${stamp(p.starts_at)}` : "";
  return `${who} ${p.roles.length === 1 ? "is" : "are"} ${EFFECT[p.effect].verb} ${accessVerb(p.access, p.effect === "allow")} on ${resourceText(p.resource)}${from}${tail}.`;
}

/**
 * Map a backend `field` path onto the form's field id. The server speaks the
 * request shape (`roles[0].identity_account_id`, `resource.resource_id`,
 * `ends_at`); the form's inputs are `resource`, `roles`, `end`, and so on.
 * Returns the server string unchanged when nothing matches, so a new field the
 * server adds still lands somewhere rather than being swallowed.
 */
export function formFieldOf(serverField: string | undefined): string | undefined {
  if (!serverField) return undefined;
  const f = serverField.trim();
  if (f.startsWith("roles")) return "roles";
  if (f.startsWith("resource.prefix") || f === "prefix") return "prefix";
  if (f.startsWith("resource")) return "resource";
  if (f.startsWith("access")) return "access";
  if (f === "ends_at") return "end";
  if (f === "starts_at") return "start";
  if (f === "name") return "name";
  if (f === "reason") return "reason";
  return f;
}

/* ---------------------------------- draft --------------------------------- */

export type WindowPreset = "1h" | "8h" | "24h" | "7d" | "custom" | "none";

export const PRESETS: { key: WindowPreset; label: string; hours?: number }[] = [
  { key: "1h", label: "1 hour", hours: 1 },
  { key: "8h", label: "8 hours", hours: 8 },
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 168 },
  { key: "custom", label: "Pick dates" },
  { key: "none", label: "No end" },
];

/** Allow is privilege expansion: it must end, within 30 days. */
export const ALLOW_MAX_DAYS = 30;

export interface DraftRole {
  identity_account_id: string;
  name: string;
}

export interface DraftResource {
  provider: AccessProvider;
  resource_id: string;
  /** The bucket, or the Azure resource's name. */
  name: string;
  /** AWS only: the bucket ("" on Azure). */
  bucket: string;
  /** The bucket's ARN, or the Azure resource's ARM id. */
  arn: string;
  /** The AWS account, or the Azure subscription id. */
  account_id: string;
  /** Azure: its Entra tenant (identities must be in the same one). */
  tenant?: string;
  /** Azure: the resource type in words, its subscription's name and its resource group, for the chosen row. */
  kind?: string;
  subscription?: string;
  resource_group?: string;
  /**
   * Every Discovery record naming this bucket or a path in it, the bucket's own
   * record first when it has one. Most buckets are known only through paths
   * policies name (`bucket/folder/*`), and who can reach the bucket is the
   * union of who can reach each of them.
   */
  records?: { id: string; text: string }[];
  /** Folders Discovery saw named in this bucket, e.g. `attachments/`. */
  folders?: string[];
}

/** The path a record names inside its bucket: "" for the bucket or all of it, else `folder/*` or a key. */
export function pathInBucket(text: string): string {
  const i = text.indexOf(":::");
  const rest = i >= 0 ? text.slice(i + 3) : text;
  const slash = rest.indexOf("/");
  const path = slash >= 0 ? rest.slice(slash + 1) : "";
  return path === "*" ? "" : path;
}

/** The form's state: what the person chose, before it becomes a request. */
export interface PolicyDraft {
  provider: AccessProvider;
  effect: AccessEffect;
  resource: DraftResource | null;
  prefix: string;
  roles: DraftRole[];
  access: AccessLevel[];
  preset: WindowPreset;
  /** `datetime-local` values (local time), used by "Pick dates". `start` "" means now. */
  start: string;
  end: string;
  name: string;
  reason: string;
}

export const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

const minute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export function emptyDraft(initial?: { provider?: AccessProvider; effect?: AccessEffect; resource?: DraftResource | null; prefix?: string; roles?: DraftRole[] }): PolicyDraft {
  return {
    provider: initial?.provider ?? initial?.resource?.provider ?? "aws",
    effect: initial?.effect ?? "block",
    resource: initial?.resource ?? null,
    prefix: initial?.prefix ?? "",
    roles: initial?.roles ?? [],
    access: ["read"],
    preset: "24h",
    start: "",
    end: toLocalInput(new Date(minute(new Date()).getTime() + 24 * 3_600_000)),
    name: "",
    reason: "",
  };
}

/** An edit starts from the policy as it is now. */
export function draftOf(p: AccessPolicyDetail): PolicyDraft {
  const fallbackEnd = toLocalInput(new Date(minute(new Date()).getTime() + 24 * 3_600_000));
  const provider = providerOf(p.resource);
  return {
    provider,
    effect: p.effect,
    resource: {
      provider,
      resource_id: p.resource.resource_id,
      name: resourceText({ ...p.resource, prefix: "" }),
      bucket: p.resource.bucket,
      arn: p.resource.arn,
      account_id: p.resource.account_id,
    },
    prefix: p.resource.prefix,
    roles: p.roles.map((r) => ({ identity_account_id: r.identity_account_id, name: r.name })),
    access: p.access,
    preset: p.ends_at || p.starts_at ? "custom" : "none",
    start: p.starts_at ? toLocalInput(parseISO(p.starts_at)) : "",
    end: p.ends_at ? toLocalInput(parseISO(p.ends_at)) : fallbackEnd,
    name: p.name,
    reason: p.reason,
  };
}

/** Switching effect keeps the choice valid: Allow has no "All access" and must end. */
export function withEffect(d: PolicyDraft, effect: AccessEffect): PolicyDraft {
  if (effect === "block") return { ...d, effect };
  const access = d.access.filter((a) => a !== "all");
  return { ...d, effect, access: access.length ? access : ["read"], preset: d.preset === "none" ? "24h" : d.preset };
}

const isoOf = (local: string): string | null => {
  if (!local) return null;
  const t = new Date(local);
  return isValid(t) ? t.toISOString() : null;
};

/** The window a draft asks for, computed now: a preset starts at the moment of Apply. */
export function windowOf(d: PolicyDraft, now = new Date()): { starts_at: string | null; ends_at: string | null } {
  if (d.preset === "none") return { starts_at: null, ends_at: null };
  if (d.preset === "custom") return { starts_at: isoOf(d.start), ends_at: isoOf(d.end) };
  const hours = PRESETS.find((p) => p.key === d.preset)?.hours ?? 24;
  return { starts_at: null, ends_at: new Date(minute(now).getTime() + hours * 3_600_000).toISOString() };
}

export function bodyOf(d: PolicyDraft): AccessPolicyBody {
  return {
    effect: d.effect,
    // A folder is S3's alone; an Azure policy is on the whole resource.
    resource: { resource_id: d.resource?.resource_id ?? "", prefix: d.provider === "aws" ? d.prefix.trim() : "" },
    roles: d.roles.map((r) => ({ identity_account_id: r.identity_account_id })),
    access: d.access,
    ...windowOf(d),
    name: d.name.trim(),
    reason: d.reason.trim(),
  };
}

/** A name to start from, until the person types their own. */
export function suggestedName(d: PolicyDraft): string {
  const who = d.roles.length === 0 ? "" : d.roles.length === 1 ? d.roles[0].name : `${d.roles[0].name} and ${d.roles.length - 1} more`;
  const where = d.resource ? resourceText({ ...d.resource, prefix: d.provider === "aws" ? d.prefix.trim() : "" }) : "";
  if (!who || !where) return "";
  return `${EFFECT[d.effect].label} ${who} on ${where}`;
}

/** What is still missing before Apply, in the order the form asks for it; "" when nothing is. */
export function draftProblem(d: PolicyDraft, now = new Date()): { field: string; message: string } | null {
  if (!d.resource) return { field: "resource", message: d.provider === "aws" ? "Choose a bucket." : "Choose a resource." };
  if (d.provider === "aws" && d.prefix.trim() && !d.prefix.trim().endsWith("/")) return { field: "prefix", message: "A folder ends with /, for example invoices/." };
  if (d.roles.length === 0) return { field: "roles", message: `Choose at least one ${whoWord(d.provider)}.` };
  if (d.access.length === 0) return { field: "access", message: `Choose what to ${d.effect === "block" ? "block." : "allow."}` };
  const w = windowOf(d, now);
  if (d.preset === "custom") {
    if (d.start && !w.starts_at) return { field: "start", message: "The start time cannot be read." };
    if (d.end && !w.ends_at) return { field: "end", message: "The end time cannot be read." };
    if (w.starts_at && w.ends_at && parseISO(w.ends_at) <= parseISO(w.starts_at)) return { field: "end", message: "The end must be after the start." };
    if (w.ends_at && parseISO(w.ends_at).getTime() < now.getTime() + 15 * 60_000) return { field: "end", message: "The end must be at least 15 minutes from now." };
  }
  if (d.effect === "allow") {
    if (!w.ends_at) return { field: "end", message: "Allowed access must end. Pick an end time." };
    if (parseISO(w.ends_at).getTime() > now.getTime() + ALLOW_MAX_DAYS * 86_400_000) {
      return { field: "end", message: `Allowed access can last at most ${ALLOW_MAX_DAYS} days.` };
    }
  }
  if (!d.reason.trim()) return { field: "reason", message: "Say why. It is kept in the history." };
  return null;
}

/* ---------------------------------- azure ---------------------------------- */

/** The subscription id and resource group an ARM id names. */
export function armParts(arn: string): { subscription: string; resourceGroup: string } {
  const m = /^\/subscriptions\/([^/]+)(?:\/resourcegroups\/([^/]+))?/i.exec(arn);
  return { subscription: m?.[1]?.toLowerCase() ?? "", resourceGroup: m?.[2] ?? "" };
}

/** The draft resource for one Azure inventory row. */
export function azureResourceOf(row: InventoryRow): DraftResource {
  const { subscription, resourceGroup } = armParts(row.native_id);
  return {
    provider: "azure",
    resource_id: refId(row.ref),
    name: row.name,
    bucket: "",
    arn: row.native_id,
    account_id: subscription,
    tenant: row.scope?.id,
    kind: armTypeLabel(row.kind),
    subscription: row.sub_scope ?? undefined,
    resource_group: resourceGroup || undefined,
  };
}

/** One identity holding a role assignment on a resource, with the roles. */
interface Holder {
  id: string;
  name: string;
  kind: string;
  roles: string[];
}

/** Who holds a role assignment on the root resource: grant edges into the assignments whose target is the root. */
export function holdersOf(g: GraphNeighbourhood | undefined): Holder[] {
  if (!g) return [];
  const node = new Map(g.nodes.map((n) => [n.ref, n]));
  const onRoot = new Set(g.edges.filter((e) => e.kind === "target" && e.to === g.root).map((e) => e.from));
  const by = new Map<string, Holder>();
  for (const e of g.edges) {
    if (e.kind !== "grant" || !onRoot.has(e.to)) continue;
    const who = node.get(e.from);
    if (!who) continue;
    const id = refId(who.ref);
    const h = by.get(id) ?? { id, name: who.label, kind: String(who.kind), roles: [] };
    const role = node.get(e.to)?.label;
    if (role && !h.roles.includes(role)) h.roles.push(role);
    by.set(id, h);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
