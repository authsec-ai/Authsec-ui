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
import { refId, type GraphNeighbourhood, type ResourceRow } from "@/app/api/igaGraphApi";
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
  AccessResourceType,
} from "@/app/api/igaAccessPoliciesApi";

import type { K8sGrant } from "@/app/api/k8sGraphApi";

import { RESOURCE_TYPES, resourceTypeCopy, type AwsResourceType, type ResourceTypeCopy } from "./resourceTypes";

/* -------------------------------- providers -------------------------------- */

export const CLOUD: Record<AccessProvider, { label: string; who: string; whoPlural: string }> = {
  aws: { label: "AWS", who: "role", whoPlural: "roles" },
  azure: { label: "Azure", who: "identity", whoPlural: "identities" },
  k8s: { label: "Kubernetes", who: "ServiceAccount", whoPlural: "ServiceAccounts" },
};

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

/** The Azure data planes the backend maps beyond storage (services/iga_gov_access_azure_planes.go), by ARM type. */
const AZURE_DATA_BLURBS: { type: string; blurbs: Record<Exclude<AccessLevel, "all">, string> }[] = [
  {
    type: "/providers/microsoft.keyvault/vaults/",
    blurbs: { read: "Read secret values.", write: "Set and update secrets.", delete: "Delete and purge secrets." },
  },
  {
    type: "/providers/microsoft.search/searchservices/",
    blurbs: { read: "Query index documents.", write: "Upload and update documents.", delete: "Delete documents." },
  },
  {
    type: "/providers/microsoft.cognitiveservices/accounts/",
    blurbs: {
      read: "Call the models (chat, completions, embeddings, images, audio) and read stored files and completions.",
      write: "Upload files, fine-tune, change deployments and create assistants, responses and batches.",
      delete: "Delete files, fine-tunes, deployments, assistants and stored data.",
    },
  },
  {
    type: "/queueservices/",
    blurbs: { read: "Peek at and receive queue messages.", write: "Add and update messages.", delete: "Delete and receive messages." },
  },
  {
    type: "/tableservices/",
    blurbs: { read: "Read table entities.", write: "Insert and update entities.", delete: "Delete entities." },
  },
  {
    type: "/fileservices/",
    blurbs: { read: "Read files in the share.", write: "Write files and change their permissions.", delete: "Delete files." },
  },
  {
    type: "/providers/microsoft.servicebus/namespaces/",
    blurbs: { read: "Receive messages.", write: "Send messages.", delete: "Receiving removes messages; there is nothing else to delete." },
  },
  {
    type: "/providers/microsoft.eventhub/namespaces/",
    blurbs: { read: "Receive events.", write: "Send events.", delete: "Events expire on their own; there is nothing to delete." },
  },
];

/** Whether an Azure resource has nothing to delete (Service Bus, Event Hubs): Delete is off in the form. */
export function azureNoDelete(arn: string | undefined): boolean {
  const a = arn?.toLowerCase() ?? "";
  return a.includes("/providers/microsoft.servicebus/namespaces/") || a.includes("/providers/microsoft.eventhub/namespaces/");
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
  ending: { label: "Ending", tone: "info", hint: "Ended; AuthSec is still undoing it in the cloud." },
  ended: { label: "Ended", tone: "info", hint: "No longer in force. The record is kept." },
};

export const STATUS_ORDER: AccessPolicyStatus[] = ["active", "applying", "scheduled", "drift", "failed", "paused", "ending", "ended"];

/** Whether a policy is over: ended, or ending while AuthSec undoes it. Nothing more can be done to it. */
export const isOver = (status: AccessPolicyStatus) => status === "ended" || status === "ending";

/**
 * One identity's part of a policy, by the backend's deployment state. An Azure
 * block takes the identity's role assignments away while it is in force and
 * gives them back at the end, so its words run the other way round.
 */
export function deploymentView(state: string, provider: AccessProvider = "aws", effect: AccessEffect = "block"): { label: string; tone: ConsoleTone } {
  // An Azure block and a Kubernetes block take something away and put it back.
  const azureBlock = (provider === "azure" || provider === "k8s") && effect === "block";
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
/** `{who}` is "role" on AWS, "identity" on Azure. */
const EVENT_LABEL: Record<string, string> = {
  "access_policy.created": "Created",
  "access_policy.applied": "Applied",
  "access_policy.confirmed": "In place on {who} (verified)",
  "access_policy.edited": "Edited",
  "access_policy.paused": "Paused",
  "access_policy.resumed": "Resumed",
  "access_policy.ended": "Ended",
  "access_policy.expired": "Reached its end time; removed from {who}",
  "access_policy.removed": "Removed from {who}",
  "access_policy.drifted": "Changed outside AuthSec",
  "access_policy.reapplied": "Put back by AuthSec",
  "access_policy.failed": "Failed on {who}",
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
  const restores = ctx.provider === "azure" && ctx.effect === "block";
  const base =
    restores && (e.event === "access_policy.removed" || e.event === "access_policy.expired")
      ? e.event === "access_policy.expired"
        ? "Reached its end time; access restored"
        : "Access restored"
      : e.event === "access_policy.outcome_unknown"
        ? `Waiting for ${CLOUD[ctx.provider].label} to confirm`
        : (EVENT_LABEL[e.event] ?? humanize(e.event.replace(/^access_policy\./, "").replace(/_/g, " "))).replace("{who}", whoWord(ctx.provider));
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

export const ACCESS: { key: Exclude<AccessLevel, "all">; label: string; verb: string; base: string }[] = [
  { key: "read", label: "Read", verb: "reading", base: "read" },
  { key: "write", label: "Write", verb: "writing", base: "write" },
  { key: "delete", label: "Delete", verb: "deleting", base: "delete" },
];

/**
 * What each level covers on this resource: the AWS type's own words (S3
 * objects when no type is given), Azure blobs, or another Azure resource's
 * management.
 */
export function accessBlurbs(provider: AccessProvider, arn?: string, type?: AccessResourceType): Record<Exclude<AccessLevel, "all">, string> {
  if (provider === "aws") return (resourceTypeCopy(type) ?? RESOURCE_TYPES.s3_bucket).blurbs;
  const plane = arn ? AZURE_DATA_BLURBS.find((p) => arn.toLowerCase().includes(p.type)) : undefined;
  if (plane) return plane.blurbs;
  if (isAzureStorage(arn)) {
    // The whole account covers every data service; a container its blobs.
    if (arn!.toLowerCase().includes("/blobservices/")) return { read: "Read blobs.", write: "Upload and overwrite blobs.", delete: "Delete blobs." };
    return {
      read: "Read blobs, queue messages, table entities and files.",
      write: "Write blobs, messages, entities and files.",
      delete: "Delete blobs, messages, entities and files.",
    };
  }
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
export function resourceText(r: { bucket?: string; prefix: string; name?: string; arn?: string; provider?: AccessProvider; resource_type?: string; region?: string }): string {
  if (r.provider === "k8s") return r.name ?? "";
  if (r.provider === "azure") return r.name || (r.arn ? r.arn.slice(r.arn.lastIndexOf("/") + 1) : "");
  if (r.resource_type === "bedrock_model") return r.name ?? "";
  if (r.resource_type && r.resource_type !== "s3_bucket" && r.resource_type !== "azure_resource") return r.region ? `${r.name ?? ""} (${r.region})` : r.name ?? "";
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

/**
 * The DynamoDB table an ARN names or lies under (an index, stream or backup),
 * as the backend reads it (internal/igagov/access_dynamodb.go): the name must
 * be literal; a pattern or a global-table ARN is not a table.
 */
export function tableOf(text: string | null | undefined): { partition: string; region: string; account: string; table: string; arn: string } | null {
  const m = text ? /^arn:(aws[a-z-]*):dynamodb:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):table\/([A-Za-z0-9_.-]{3,255})(?:\/.*)?$/.exec(text.trim()) : null;
  if (!m) return null;
  return { partition: m[1], region: m[2], account: m[3], table: m[4], arn: `arn:${m[1]}:dynamodb:${m[2]}:${m[3]}:table/${m[4]}` };
}

/**
 * Every table the DynamoDB records name (the table, an index, a stream...),
 * with its records, the table's own record first. A pattern or global-table
 * record is not a table and is skipped.
 */
export function groupTables(rows: readonly ResourceRow[]): DraftResource[] {
  const by = new Map<string, DraftResource & { own: boolean }>();
  for (const r of rows) {
    const t = tableOf(r.text);
    if (!t) continue;
    let e = by.get(t.arn);
    if (!e) {
      e = { provider: "aws", resource_id: "", resource_type: "dynamodb_table", name: t.table, bucket: "", arn: t.arn, account_id: t.account, region: t.region, records: [], own: false };
      by.set(t.arn, e);
    }
    const rec = { id: refId(r.ref), text: r.text };
    if (r.text.trim() === t.arn) {
      e.records!.unshift(rec);
      e.own = true;
    } else {
      e.records!.push(rec);
    }
  }
  return [...by.values()]
    .map(({ own: _own, ...e }) => ({ ...e, resource_id: e.records![0].id }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.arn.localeCompare(b.arn));
}

/**
 * The Secrets Manager secret an ARN or a `<name>-??????` selector names, as
 * the backend reads it (internal/igagov/access_secretsmanager.go): the name is
 * literal and the suffix is the random six characters (`suffix`) or six "?"
 * (`suffix` null). `key` is the secret by name in its region.
 */
export function secretOf(
  text: string | null | undefined,
): { partition: string; region: string; account: string; name: string; suffix: string | null; key: string } | null {
  const m = text ? /^arn:(aws[a-z-]*):secretsmanager:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):secret:([A-Za-z0-9/_+=.@-]{1,512})-([A-Za-z0-9]{6}|\?{6})$/.exec(text.trim()) : null;
  if (!m) return null;
  return { partition: m[1], region: m[2], account: m[3], name: m[4], suffix: m[5] === "??????" ? null : m[5], key: `arn:${m[1]}:secretsmanager:${m[2]}:${m[3]}:secret:${m[4]}` };
}

/**
 * Every secret the Secrets Manager records name, by name and region, with its
 * records: the secret's own ARN first, else the `<name>-??????` selector. A
 * pattern is not a secret and is skipped.
 */
export function groupSecrets(rows: readonly ResourceRow[]): DraftResource[] {
  const by = new Map<string, DraftResource>();
  for (const r of rows) {
    const s = secretOf(r.text);
    if (!s) continue;
    let e = by.get(s.key);
    if (!e) {
      e = { provider: "aws", resource_id: "", resource_type: "secretsmanager_secret", name: s.name, bucket: "", arn: r.text.trim(), account_id: s.account, region: s.region, records: [] };
      by.set(s.key, e);
    }
    const rec = { id: refId(r.ref), text: r.text };
    if (s.suffix && !secretOf(e.records![0]?.text)?.suffix) {
      e.records!.unshift(rec);
      e.arn = r.text.trim();
    } else {
      e.records!.push(rec);
    }
  }
  return [...by.values()]
    .map((e) => ({ ...e, resource_id: e.records![0].id }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.region ?? "").localeCompare(b.region ?? ""));
}

/**
 * The SSM parameter an ARN names, as the backend reads it
 * (internal/igagov/access_ssm.go): a literal name of at most 15 levels; a
 * hierarchical name gets its leading "/" back.
 */
export function parameterOf(text: string | null | undefined): { partition: string; region: string; account: string; name: string; arn: string } | null {
  const m = text ? /^arn:(aws[a-z-]*):ssm:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):parameter\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){0,14})$/.exec(text.trim()) : null;
  if (!m) return null;
  return { partition: m[1], region: m[2], account: m[3], name: m[4].includes("/") ? `/${m[4]}` : m[4], arn: text!.trim() };
}

/** One entry per parameter the SSM records name; a pattern is not a parameter and is skipped. */
export function groupParameters(rows: readonly ResourceRow[]): DraftResource[] {
  const by = new Map<string, DraftResource>();
  for (const r of rows) {
    const p = parameterOf(r.text);
    if (!p) continue;
    const rec = { id: refId(r.ref), text: r.text };
    const e = by.get(p.arn);
    if (e) e.records!.push(rec);
    else by.set(p.arn, { provider: "aws", resource_id: rec.id, resource_type: "ssm_parameter", name: p.name, bucket: "", arn: p.arn, account_id: p.account, region: p.region, records: [rec] });
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.region ?? "").localeCompare(b.region ?? ""));
}

/** The geography prefixes of Bedrock's system inference profiles ("us.anthropic…"). */
const BEDROCK_GEOS = new Set(["us", "eu", "apac", "us-gov", "jp", "au", "ca", "global"]);

/**
 * The Bedrock foundation model an ARN names, directly or through a system
 * inference profile, as the backend reads it (internal/igagov/access_bedrock.go).
 */
export function modelOf(text: string | null | undefined): { partition: string; model: string } | null {
  const t = text?.trim() ?? "";
  const fm = /^arn:(aws[a-z-]*):bedrock:(?:[a-z]{2}(?:-[a-z]+)+-\d+|\*)?::foundation-model\/([a-z0-9-]+\.[A-Za-z0-9._:-]{1,200})$/.exec(t);
  if (fm) return { partition: fm[1], model: fm[2] };
  const ip = /^arn:(aws[a-z-]*):bedrock:[a-z]{2}(?:-[a-z]+)+-\d+:\d{12}:inference-profile\/([a-z-]+)\.([a-z0-9-]+\.[A-Za-z0-9._:-]{1,200})$/.exec(t);
  return ip && BEDROCK_GEOS.has(ip[2]) ? { partition: ip[1], model: ip[3] } : null;
}

/** One entry per model the Bedrock records name, its foundation-model record first. */
export function groupModels(rows: readonly ResourceRow[]): DraftResource[] {
  const by = new Map<string, DraftResource>();
  for (const r of rows) {
    const m = modelOf(r.text);
    if (!m) continue;
    const arn = `arn:${m.partition}:bedrock:*::foundation-model/${m.model}`;
    const rec = { id: refId(r.ref), text: r.text };
    let e = by.get(arn);
    if (!e) {
      e = { provider: "aws", resource_id: "", resource_type: "bedrock_model", name: m.model, bucket: "", arn, account_id: r.account?.id ?? "", records: [] };
      by.set(arn, e);
    }
    if (r.text.includes(":foundation-model/")) e.records!.unshift(rec);
    else e.records!.push(rec);
  }
  return [...by.values()].map((e) => ({ ...e, resource_id: e.records![0].id })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Readers of the single-ARN AWS types, as the backend reads them (internal/igagov/access_lambda.go, access_kms.go, access_sqs_sns.go). */
const SIMPLE_ARNS: Partial<Record<AccessResourceType, { re: RegExp; arn: (m: RegExpExecArray) => string }>> = {
  lambda_function: {
    re: /^arn:(aws[a-z-]*):lambda:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):function:([A-Za-z0-9_-]{1,64})(?::(?:\$LATEST|[A-Za-z0-9_-]{1,128}|\*))?$/,
    arn: (m) => `arn:${m[1]}:lambda:${m[2]}:${m[3]}:function:${m[4]}`,
  },
  kms_key: {
    re: /^arn:(aws[a-z-]*):kms:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):key\/(mrk-[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    arn: (m) => m[0],
  },
  sqs_queue: { re: /^arn:(aws[a-z-]*):sqs:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):([A-Za-z0-9_-]{1,75}(?:\.fifo)?)$/, arn: (m) => m[0] },
  sns_topic: { re: /^arn:(aws[a-z-]*):sns:([a-z]{2}(?:-[a-z]+)+-\d+):(\d{12}):([A-Za-z0-9_-]{1,251}(?:\.fifo)?)$/, arn: (m) => m[0] },
};

/** The function, key, queue or topic an ARN names, or null. */
export function simpleTargetOf(type: AccessResourceType, text: string | null | undefined): { arn: string; name: string; account: string; region: string } | null {
  const r = SIMPLE_ARNS[type];
  const m = r && text ? r.re.exec(text.trim()) : null;
  return m ? { arn: r!.arn(m), name: m[4], account: m[3], region: m[2] } : null;
}

/** One entry per function, key, queue or topic the records name, its own ARN first. */
export function groupSimple(type: AccessResourceType, rows: readonly ResourceRow[]): DraftResource[] {
  const by = new Map<string, DraftResource>();
  for (const r of rows) {
    const s = simpleTargetOf(type, r.text);
    if (!s) continue;
    const rec = { id: refId(r.ref), text: r.text };
    let e = by.get(s.arn);
    if (!e) {
      e = { provider: "aws", resource_id: "", resource_type: type, name: s.name, bucket: "", arn: s.arn, account_id: s.account, region: s.region, records: [] };
      by.set(s.arn, e);
    }
    if (r.text.trim() === s.arn) e.records!.unshift(rec);
    else e.records!.push(rec);
  }
  return [...by.values()].map((e) => ({ ...e, resource_id: e.records![0].id })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The form's resource for an AWS record opened from Discovery or the graph
 * (UI-052): every type the policy form takes, read from the record's text as
 * the pickers read it. `type` is the record's own type, `account` its account.
 * Null for a record no access policy can name.
 */
export function awsResourceOf(
  id: string,
  text: string,
  type?: string,
  account = "",
): { awsType: AwsResourceType; resource: DraftResource; prefix: string } | null {
  const aws = (resource_type: AwsResourceType, name: string, arn: string, acct: string, region?: string, bucket = "") => ({
    awsType: resource_type,
    resource: { provider: "aws" as const, resource_id: id, resource_type, name, bucket, arn, account_id: acct, ...(region ? { region } : {}) },
    prefix: "",
  });
  const param = parameterOf(text);
  if (param) return aws("ssm_parameter", param.name, param.arn, param.account, param.region);
  const sec = secretOf(text);
  if (sec) return aws("secretsmanager_secret", sec.name, text.trim(), sec.account, sec.region);
  const tbl = tableOf(text);
  if (tbl) return aws("dynamodb_table", tbl.table, tbl.arn, tbl.account, tbl.region);
  const m = modelOf(text);
  if (m) return aws("bedrock_model", m.model, `arn:${m.partition}:bedrock:*::foundation-model/${m.model}`, account);
  for (const t of ["lambda_function", "kms_key", "sqs_queue", "sns_topic"] as const) {
    const st = simpleTargetOf(t, text);
    if (st) return aws(t, st.name, st.arn, st.account, st.region);
  }
  const b = bucketOf(text);
  if (type === "s3_bucket" || b) {
    const bucket = b?.bucket ?? text;
    return { ...aws("s3_bucket", bucket, text, account, undefined, bucket), prefix: b?.prefix ?? "" };
  }
  return null;
}

/** "Create policy" from a resource page: the form, with this resource chosen; null when no access policy the server takes can name it. */
export function resourcePolicyHref(id: string, text: string, type: string | undefined, types: readonly string[]): string | null {
  const got = awsResourceOf(id, text, type);
  if (!got || !types.includes(got.awsType)) return null;
  return `/iga/policy/new?${new URLSearchParams({ resource_id: id, type: got.awsType }).toString()}`;
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
    case "ending":
      return "Ending";
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
  { key: "none", label: "Until I remove it" },
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
  /** What it is: `s3_bucket` on AWS today, `azure_resource` on Azure. */
  resource_type: AccessResourceType;
  /** The bucket, or the Azure resource's name. */
  name: string;
  /** AWS only: the bucket ("" on Azure). */
  bucket: string;
  /** The bucket's ARN, or the Azure resource's ARM id. */
  arn: string;
  /** The AWS account, or the Azure subscription id. */
  account_id: string;
  /** AWS: the region, for a type whose ARN names one. */
  region?: string;
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
  /** On AWS, what kind of resource is being picked (before one is). */
  awsType: AwsResourceType;
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

export function emptyDraft(initial?: { provider?: AccessProvider; awsType?: AwsResourceType; effect?: AccessEffect; resource?: DraftResource | null; prefix?: string; roles?: DraftRole[] }): PolicyDraft {
  return {
    provider: initial?.provider ?? initial?.resource?.provider ?? "aws",
    awsType: initial?.awsType ?? awsTypeOf(initial?.resource?.resource_type),
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
  const provider = p.resource.provider;
  return {
    provider,
    awsType: awsTypeOf(p.resource.resource_type),
    effect: p.effect,
    resource: {
      provider,
      resource_id: p.resource.resource_id,
      // A backend that predates the field, or an ARN it cannot read, says nothing: that was S3.
      resource_type: p.resource.resource_type || (provider === "azure" ? "azure_resource" : provider === "k8s" ? "k8s_role" : "s3_bucket"),
      name: resourceText({ ...p.resource, prefix: "" }),
      bucket: p.resource.bucket,
      arn: p.resource.arn,
      account_id: p.resource.account_id,
      region: p.resource.region,
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

/**
 * What the draft is on: Azure's one resource, else the chosen AWS resource's
 * type, else S3 (the AWS type before anything is chosen).
 */
export function draftType(d: Pick<PolicyDraft, "provider" | "resource"> & { awsType?: AwsResourceType }): AccessResourceType {
  if (d.provider === "azure") return "azure_resource";
  if (d.provider === "k8s") return "k8s_role";
  return d.resource?.resource_type || d.awsType || "s3_bucket";
}

/** The AWS type a resource type is, S3 for anything else (Azure, unknown, ""). */
export function awsTypeOf(type: string | undefined): AwsResourceType {
  return resourceTypeCopy(type) ? (type as AwsResourceType) : "s3_bucket";
}

/** The words for the draft's AWS resource type; undefined on Azure. */
export function draftCopy(d: Pick<PolicyDraft, "provider" | "resource"> & { awsType?: AwsResourceType }): ResourceTypeCopy | undefined {
  return resourceTypeCopy(draftType(d));
}

/** The draft's narrowing inside its resource (S3's folder), trimmed; "" when its type has none. */
export function draftSubScope(d: Pick<PolicyDraft, "provider" | "resource" | "prefix"> & { awsType?: AwsResourceType }): string {
  return draftCopy(d)?.subScope ? d.prefix.trim() : "";
}

/** Switching effect keeps the choice valid: Allow has no "All access" and must end; Kubernetes blocks all access only. */
export function withEffect(d: PolicyDraft, effect: AccessEffect): PolicyDraft {
  if (d.provider === "k8s") return { ...d, effect: "block", access: ["all"] };
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
    // A folder is S3's alone; any other type, and an Azure policy, is on the whole resource.
    resource: { resource_id: d.resource?.resource_id ?? "", prefix: draftSubScope(d) },
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
  const where = d.resource ? resourceText({ ...d.resource, prefix: draftSubScope(d) }) : "";
  if (!who || !where) return "";
  return `${EFFECT[d.effect].label} ${who} on ${where}`;
}

/** What is still missing before Apply, in the order the form asks for it; "" when nothing is. */
export function draftProblem(d: PolicyDraft, now = new Date()): { field: string; message: string } | null {
  const copy = draftCopy(d);
  if (!d.resource) return { field: "resource", message: `Choose a ${copy?.noun ?? "resource"}.` };
  if (copy?.subScope === "folder" && d.prefix.trim() && !d.prefix.trim().endsWith("/")) return { field: "prefix", message: "A folder ends with /, for example invoices/." };
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

/* -------------------------------- kubernetes -------------------------------- */

/** The roles a ServiceAccount's grants come through, one per role, with the bindings that carry it. */
export function k8sRolesOf(grants: readonly K8sGrant[]): { role_id: string; label: string; kind: string; bindings: string[] }[] {
  const by = new Map<string, { role_id: string; label: string; kind: string; bindings: string[] }>();
  for (const g of grants) {
    if (!g.role_id) continue;
    let e = by.get(g.role_id);
    if (!e) {
      const cluster = g.role_kind === "k8s_cluster_role";
      e = { role_id: g.role_id, label: !cluster && g.namespace ? `${g.namespace}/${g.role_name}` : g.role_name, kind: cluster ? "ClusterRole" : "Role", bindings: [] };
      by.set(g.role_id, e);
    }
    const b = g.binding_name || g.binding;
    if (b && !e.bindings.includes(b)) e.bindings.push(b);
  }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
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
    resource_type: "azure_resource",
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
  /** Whether any of its grants here is an Azure role assignment: the only kind a policy changes. */
  hasRoleAssignment: boolean;
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
    const h = by.get(id) ?? { id, name: who.label, kind: String(who.kind), roles: [], hasRoleAssignment: false };
    const assignment = node.get(e.to);
    const role = assignment?.label;
    if (role && !h.roles.includes(role)) h.roles.push(role);
    if ((assignment?.azure_role?.grant_kind ?? "azure_rbac") === "azure_rbac") h.hasRoleAssignment = true;
    by.set(id, h);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
