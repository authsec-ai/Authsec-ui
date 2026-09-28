/**
 * Typed readers for `CloudObservation.sanitized_facts`.
 *
 * The column is jsonb and its shape varies by `source_api`, so it arrives here
 * as `Record<string, unknown>`. Two ways to handle that: render it as a generic
 * key-value dump, or give each surface a narrow accessor. This file takes the
 * second — a dump would show `access_key_1_rotated_at` to an operator and call
 * it a product, and it would silently survive a backend field rename.
 *
 * Every accessor is total and defensive: a missing or wrong-typed field comes
 * back `undefined`, never a thrown error and never a coerced zero. Absence and
 * false are different facts on every one of these surfaces — "no MFA recorded"
 * is not "MFA is off", and "no policy observation" is not "no deny".
 *
 * The `source_api` constants are the exact strings the collectors write; they
 * are also what `/aws/observations` filters on.
 */

import type { CloudObservation } from "@/app/api/cloudDiscoveryApi";

/* ─────────────────────────── source_api keys ─────────────────────────────── */

export const SOURCE_CLOUDTRAIL_EVENTS = "cloudtrail:LookupEvents";
export const SOURCE_CREDENTIAL_REPORT = "iam:GetCredentialReport";
export const SOURCE_S3_BUCKET_POLICY = "s3:GetBucketPolicy";
export const SOURCE_KMS_KEY_POLICY = "kms:GetKeyPolicy";
export const SOURCE_AGENTCORE_WORKLOAD_IDENTITIES =
  "bedrock-agentcore:ListWorkloadIdentities";
/** Trail configuration, one observation per trail. Subject-less, like the
 * workload identities above, so it is queried by source_api alone. */
export const SOURCE_CLOUDTRAIL_TRAILS = "cloudtrail:DescribeTrails";
/** Whether a trail is actually delivering. The collector writes this ONLY
 * when AWS answered: a trail whose GetTrailStatus failed is skipped rather
 * than recorded as not logging, so an absent row here is unknown. */
export const SOURCE_CLOUDTRAIL_TRAIL_STATUS = "cloudtrail:GetTrailStatus";

/* ───────────────────────────── safe readers ──────────────────────────────── */

function str(facts: Record<string, unknown>, key: string): string | undefined {
  const v = facts?.[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

function bool(facts: Record<string, unknown>, key: string): boolean | undefined {
  const v = facts?.[key];
  return typeof v === "boolean" ? v : undefined;
}

/** Dates arrive as ISO strings. Returned as-is rather than parsed: every caller
 * here feeds `formatDistanceToNow`, which does its own parsing, and a Date
 * built at read time would make two renders of the same row unequal. */
function iso(facts: Record<string, unknown>, key: string): string | undefined {
  return str(facts, key);
}

/* ──────────────────────────── CloudTrail event ───────────────────────────── */

export interface CloudTrailEventFacts {
  eventId?: string;
  eventName?: string;
  eventSource?: string;
  username?: string;
  /** The reason this surface exists: Access Advisor cannot report a denial at
   * all. `undefined` means the collector recorded no verdict — not "allowed". */
  denied?: boolean;
  errorCode?: string;
}

export function cloudTrailFacts(o: CloudObservation): CloudTrailEventFacts {
  const f = o.sanitized_facts ?? {};
  return {
    eventId: str(f, "event_id"),
    eventName: str(f, "event_name"),
    eventSource: str(f, "event_source"),
    username: str(f, "username"),
    denied: bool(f, "denied"),
    errorCode: str(f, "error_code"),
  };
}

/* ────────────────────────── IAM credential report ────────────────────────── */

/** One access key as the credential report describes it.
 *
 * Keyed by ORDINAL, not by key id, because AWS's credential report format has
 * no key id in it — only `access_key_1_*` and `access_key_2_*` columns. That is
 * why these cannot be joined onto the discovered `cloud_secret` rows: there is
 * nothing to join on, and matching by position would be a guess. */
export interface CredentialReportKey {
  ordinal: 1 | 2;
  active?: boolean;
  /** When the key was last rotated. A different finding from `lastUsed`: a key
   * used yesterday and rotated four years ago is the interesting case. */
  rotatedAt?: string;
  lastUsed?: string;
}

export interface CredentialReportFacts {
  passwordEnabled?: boolean;
  passwordLastUsed?: string;
  mfaActive?: boolean;
  keys: CredentialReportKey[];
}

export function credentialReportFacts(o: CloudObservation): CredentialReportFacts {
  const f = o.sanitized_facts ?? {};
  const keys: CredentialReportKey[] = [];

  for (const ordinal of [1, 2] as const) {
    const active = bool(f, `access_key_${ordinal}_active`);
    const rotatedAt = iso(f, `access_key_${ordinal}_rotated_at`);
    const lastUsed = iso(f, `access_key_${ordinal}_last_used`);
    // Omit an ordinal that describes no real key.
    //
    // A user with one key still gets `access_key_2_*` columns: AWS writes
    // `access_key_2_active=false` with `N/A` dates. So `active` is DEFINED and
    // false, and testing only for `undefined` would render a phantom
    // "Access key 2 · Inactive · rotated Unknown" for every single-key user.
    //
    // A key that exists always has a rotation date — AWS stamps one at
    // creation — so the rotation date is the reliable existence signal, with
    // `active === true` kept as a belt-and-braces second one.
    if (!rotatedAt && active !== true) continue;
    keys.push({ ordinal, active, rotatedAt, lastUsed });
  }

  return {
    passwordEnabled: bool(f, "password_enabled"),
    passwordLastUsed: iso(f, "password_last_used"),
    mfaActive: bool(f, "mfa_active"),
    keys,
  };
}

/* ──────────────────────────── resource policy ────────────────────────────── */

export interface ResourcePolicyFacts {
  /** The policy's own kind as the collector named it, e.g. a bucket or key
   * policy. */
  kind?: string;
  /** Whether any statement in the resource's OWN policy is an explicit Deny.
   *
   * `undefined` means no policy observation loaded for this resource, which is
   * not the same as `false`. A caller must render that as unknown — claiming
   * "no deny" from a missing read is exactly the overstatement this surface was
   * added to remove. */
  hasDeny?: boolean;
}

export function resourcePolicyFacts(o: CloudObservation): ResourcePolicyFacts {
  const f = o.sanitized_facts ?? {};
  return { kind: str(f, "kind"), hasDeny: bool(f, "has_deny") };
}

/** True when this observation came from a resource-policy read, either service.
 * Used where one query returns every observation for a resource and the caller
 * wants just the policy ones. */
export function isResourcePolicy(o: CloudObservation): boolean {
  return o.source_api === SOURCE_S3_BUCKET_POLICY || o.source_api === SOURCE_KMS_KEY_POLICY;
}

/* ─────────────────── AgentCore workload identity ─────────────────────────── */

export interface WorkloadIdentityFacts {
  name?: string;
  arn?: string;
}

export function workloadIdentityFacts(o: CloudObservation): WorkloadIdentityFacts {
  const f = o.sanitized_facts ?? {};
  // Falls back to subject_native_id, which the writer always sets even when the
  // row has no subject FK at all — the case every workload identity is in.
  return { name: str(f, "name"), arn: str(f, "arn") ?? o.subject_native_id };
}

/* ───────────────────────── CloudTrail trail health ───────────────────────── */

export interface TrailStatusFacts {
  arn?: string;
  /** undefined means AWS did not answer, which is NOT "not logging". The
   * collector skips the observation entirely in that case, so undefined here
   * only arises from a malformed row. */
  isLogging?: boolean;
}

export function trailStatusFacts(o: CloudObservation): TrailStatusFacts {
  const f = o.sanitized_facts ?? {};
  return { arn: str(f, "arn") ?? o.subject_native_id, isLogging: bool(f, "is_logging") };
}

/** What the console can say about whether this account is being logged at all.
 *
 * The distinction this exists to draw: an Events tab showing nothing means one
 * of two very different things — the identity was quiet, or the account
 * records nothing and the tab could never show anything. Only trail status can
 * tell them apart, and until now it was collected and never read.
 *
 * Three answers, and the third is not a failure state. A stack that predates
 * the CloudTrail grants, or a scan from before this surface existed, reports
 * nothing here; "unknown" then keeps the empty tab honest rather than letting
 * it assert either story. */
export type TrailCoverage = "logging" | "not_logging" | "unknown";

export function trailCoverageOf(observations: CloudObservation[]): TrailCoverage {
  const rows = observations.filter((o) => o.source_api === SOURCE_CLOUDTRAIL_TRAIL_STATUS);
  if (!rows.length) return "unknown";
  // One trail delivering is enough for events to be possible, which is the
  // question the Events tab is asking. Reporting "not logging" needs EVERY
  // known trail to say so.
  const anyLogging = rows.some((o) => trailStatusFacts(o).isLogging === true);
  if (anyLogging) return "logging";
  const allSaidNo = rows.every((o) => trailStatusFacts(o).isLogging === false);
  return allSaidNo ? "not_logging" : "unknown";
}
