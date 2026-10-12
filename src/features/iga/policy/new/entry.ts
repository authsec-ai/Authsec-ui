/**
 * Where the new-policy flow was opened from (SPEC-iga-phase3-policy.md §9.2):
 * `?finding=<id>[,<id>]`, `?object=<id>` or `?template=<key>&key=<provider key>`
 * (`?step=1..4`, `?policy=<id>` once a draft exists). `entryOf` reads the URL;
 * `proposalFor` is the one body `POST /proposals` takes for it. The entry's
 * `sig` identifies "the same start" so a reload reuses its draft.
 */

import type { GovProposalRequest } from "@/app/api/igaPolicyAuthoringApi";
import { govTargetKeyForArn, govTargetKeyForObject, govTargetKeyForRoleId, type GovTargetKey } from "@/app/api/igaPolicyReadsApi";

export type Entry =
  | { kind: "none"; sig: "none" }
  | { kind: "findings"; ids: string[]; sig: string }
  | { kind: "object"; id: string; sig: string }
  | { kind: "template"; template: string; keys: string[]; sig: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function entryOf(p: URLSearchParams): Entry {
  const findings = (p.get("finding") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (findings.length > 0) return { kind: "findings", ids: findings, sig: `finding:${[...findings].sort().join(",")}` };
  const object = (p.get("object") ?? "").trim();
  if (object) return { kind: "object", id: object, sig: `object:${object}` };
  const template = (p.get("template") ?? "").trim();
  const keys = p.getAll("key").map((s) => s.trim()).filter(Boolean);
  if (template && keys.length > 0) return { kind: "template", template, keys, sig: `template:${template}:${[...keys].sort().join("|")}` };
  return { kind: "none", sig: "none" };
}

/** A role ARN's account id (`arn:aws:iam::<account>:role/…`), or "". */
export function accountOfArn(arn: string): string {
  return /^arn:[^:]+:iam::(\d{12}):role\//.test(arn) ? arn.split(":")[4] : "";
}

/** A provider key typed or linked: a role ARN, an AWS RoleId, or a graph object id. */
export function keyOfText(text: string): GovTargetKey | null {
  const t = text.trim();
  if (t.startsWith("arn:")) {
    const account = accountOfArn(t);
    return account ? govTargetKeyForArn(account, t) : null;
  }
  if (/^AROA[A-Z0-9]{8,}$/.test(t)) return govTargetKeyForRoleId(t);
  if (UUID.test(t)) return govTargetKeyForObject(t);
  return null;
}

export function proposalFor(e: Entry): GovProposalRequest | null {
  switch (e.kind) {
    case "findings":
      return { from: { finding_ids: e.ids } };
    case "object":
      return { context: { object_id: e.id } };
    case "template": {
      const keys = e.keys.map(keyOfText);
      if (e.template !== "right_size_services" || keys.some((k) => !k)) return null;
      return { template: "right_size_services", keys: keys as GovTargetKey[] };
    }
    default:
      return null;
  }
}

/** The keys to resolve before anything is created; findings are resolved through their roles by the caller. */
export function keysFor(e: Entry): GovTargetKey[] | null {
  if (e.kind === "object") return [govTargetKeyForObject(e.id)];
  if (e.kind === "template") {
    const keys = e.keys.map(keyOfText);
    return keys.some((k) => !k) ? null : (keys as GovTargetKey[]);
  }
  return null;
}
