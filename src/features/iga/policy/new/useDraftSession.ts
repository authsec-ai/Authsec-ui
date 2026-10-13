/**
 * Boots the new-policy flow: resolve the starting point, create the draft, or
 * find the draft this browser tab already made.
 *
 * How the backend models a draft (traced, iga_gov_authoring_service.go
 * CreateProposal): `POST /proposals` is not a preview. In one transaction it
 * creates the policy, its planned role controls, version 1 (`draft`) and its
 * targets, and marks the findings it addresses `under_review`. Nothing is sent
 * to anyone and nothing changes in AWS until the version is submitted. So the
 * flow
 *   1. resolves the starting point first (`POST /targets/resolve`, no side
 *      effects) and shows a key that is not supported, not found, ambiguous,
 *      ineligible or already controlled instead of creating anything;
 *   2. creates the draft exactly once per start (an in-flight map survives a
 *      double effect run), and remembers its id in the URL (`?policy=`) and in
 *      `sessionStorage`, so a reload loads that draft instead of creating another;
 *   3. edits create new versions (`POST /policies/:id/versions`), never
 *      new policies.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import {
  igaPolicyAuthoringApi,
  type GovProposalMeta,
  type GovProposalRequest,
  type GovProposalResult,
  type GovRightSizeIntent,
  type GovTargetView,
  type GovVersionView,
} from "@/app/api/igaPolicyAuthoringApi";
import { govTargetKeyForObject, govTargetKeyForRoleId, igaPolicyReadsApi, type GovResolvedTarget, type GovTargetKey } from "@/app/api/igaPolicyReadsApi";

import { classifyPolicyError, type PolicyFailure } from "../shared";
import { draftForEntry, forgetDraft, rememberDraft, snapshotOf, type ProposalSnapshot } from "./draftStore";
import { keysFor, proposalFor, type Entry } from "./entry";

export interface DraftSession {
  policyId: string;
  name: string;
  versionNo: number;
  intentHash: string;
  /** What the server has for the current version. */
  saved: GovRightSizeIntent;
  targets: GovTargetView[];
  /** The proposal's recommendation and evidence; null when this tab did not create the draft. */
  snapshot: ProposalSnapshot | null;
  /** The delivery the server suggested at creation. */
  initialDelivery: string;
}

export type Boot =
  | { phase: "none" }
  | { phase: "working"; what: string }
  | { phase: "blocked"; targets: GovResolvedTarget[]; canContinue: boolean }
  | { phase: "failed"; failure: PolicyFailure; during: "resolve" | "create" | "load" }
  | { phase: "submitted"; policyId: string; name: string; status: string }
  | { phase: "not_a_draft"; policyId: string; name: string }
  | { phase: "ready"; session: DraftSession };

type Dispatch = ReturnType<typeof useAppDispatch>;

type Created = { ok: true; result: GovProposalResult; meta: GovProposalMeta } | { ok: false; failure: PolicyFailure };
const inflight = new Map<string, Promise<Created>>();

function createOnce(dispatch: Dispatch, key: string, body: GovProposalRequest): Promise<Created> {
  const running = inflight.get(key);
  if (running) return running;
  const p = (async (): Promise<Created> => {
    try {
      const res = await dispatch(igaPolicyAuthoringApi.endpoints.createGovProposal.initiate(body)).unwrap();
      // Keep a success a moment so a second effect run of the same start reads it.
      window.setTimeout(() => inflight.delete(key), 3000);
      return { ok: true, result: res.data, meta: res.meta };
    } catch (e) {
      // A failure is never replayed: "Try again" must send a new request.
      inflight.delete(key);
      return { ok: false, failure: classifyPolicyError(e) ?? { kind: "failed", code: "", message: "", detail: {} } };
    }
  })();
  inflight.set(key, p);
  return p;
}

async function resolveKeys(dispatch: Dispatch, ws: string, keys: GovTargetKey[]): Promise<GovResolvedTarget[]> {
  const sub = dispatch(igaPolicyReadsApi.endpoints.resolveGovTargets.initiate({ ws, keys }, { forceRefetch: true }));
  try {
    return await sub.unwrap();
  } finally {
    sub.unsubscribe();
  }
}

/** The identity ids the findings are about, so their roles can be resolved before a draft is made. */
async function keysOfFindings(dispatch: Dispatch, ws: string, ids: string[]): Promise<GovTargetKey[]> {
  const out = new Map<string, GovTargetKey>();
  for (const id of ids) {
    const sub = dispatch(igaPolicyReadsApi.endpoints.getGovFinding.initiate({ ws, id }));
    try {
      const f = (await sub.unwrap()).data;
      if (f.identity_account_id) out.set(f.identity_account_id, govTargetKeyForObject(f.identity_account_id));
    } finally {
      sub.unsubscribe();
    }
  }
  return [...out.values()];
}

/** Whether a resolved key can become a target of a new policy. */
export function targetBlock(t: GovResolvedTarget): "ok" | "unresolved" | "ineligible" | "controlled" {
  if (t.status !== "resolved") return "unresolved";
  if (!t.eligible) return "ineligible";
  if (t.control) return "controlled";
  return "ok";
}

async function loadDraft(dispatch: Dispatch, ws: string, policyId: string, sig: string): Promise<
  { kind: "ok"; session: DraftSession } | { kind: "gone" } | { kind: "submitted"; name: string; status: string } | { kind: "other"; name: string } | { kind: "failed"; failure: PolicyFailure }
> {
  const sub = dispatch(igaPolicyAuthoringApi.endpoints.getGovPolicy.initiate({ ws, policyId }, { forceRefetch: true }));
  try {
    const p = await sub.unwrap();
    const v = p.current_version;
    if (p.lifecycle === "archived" || !v) return { kind: "gone" };
    if (v.intent.kind !== "right_size_services") return { kind: "other", name: p.name };
    if (v.status !== "draft") return { kind: "submitted", name: p.name, status: v.status };
    const snapshot = snapshotOf(ws, policyId);
    return {
      kind: "ok",
      session: {
        policyId,
        name: p.name,
        versionNo: v.no,
        intentHash: v.intent_hash,
        saved: v.intent,
        targets: v.targets,
        snapshot,
        initialDelivery: snapshot?.initial_delivery ?? v.intent.delivery,
      },
    };
  } catch (e) {
    const f = classifyPolicyError(e) ?? { kind: "failed" as const, code: "", message: "", detail: {} };
    if (f.kind === "not_found") {
      forgetDraft(ws, sig, policyId);
      return { kind: "gone" };
    }
    return { kind: "failed", failure: f };
  } finally {
    sub.unsubscribe();
  }
}

/**
 * `enabled` is false until the server says Policy and proposals are on and the
 * caller is not known to be refused: opening a link must not create a draft
 * (a POST that marks findings under review) on a server that cannot serve it.
 */
export function useDraftSession(ws: string, entry: Entry, urlPolicyId: string | null, onPolicy: (id: string) => void, enabled: boolean) {
  const dispatch = useAppDispatch();
  const [boot, setBoot] = useState<Boot>({ phase: "none" });
  const [attempt, setAttempt] = useState(0);
  /** Set by "Continue with the roles that can be added": the resolved role ids to start from. */
  const [only, setOnly] = useState<string[] | null>(null);
  const urlRef = useRef(urlPolicyId);
  urlRef.current = urlPolicyId;
  const onPolicyRef = useRef(onPolicy);
  onPolicyRef.current = onPolicy;

  useEffect(() => {
    if (!enabled) return;
    if (entry.kind === "none" && !urlRef.current) {
      setBoot({ phase: "none" });
      return;
    }
    let cancelled = false;
    const set = (b: Boot) => {
      if (!cancelled) setBoot(b);
    };
    void (async () => {
      setBoot({ phase: "working", what: "Opening the draft…" });
      // 1. A draft this start already made.
      const known = urlRef.current || draftForEntry(ws, entry.sig);
      if (known) {
        const l = await loadDraft(dispatch, ws, known, entry.sig);
        if (l.kind === "ok") return set({ phase: "ready", session: l.session });
        if (l.kind === "submitted") return set({ phase: "submitted", policyId: known, name: l.name, status: l.status });
        if (l.kind === "other") return set({ phase: "not_a_draft", policyId: known, name: l.name });
        if (l.kind === "failed") return set({ phase: "failed", failure: l.failure, during: "load" });
        if (entry.kind === "none") return set({ phase: "none" });
      }
      // 2. Resolve the starting point; nothing is created for a key that cannot be added.
      let body: GovProposalRequest | null;
      try {
        set({ phase: "working", what: "Checking the roles…" });
        let keys: GovTargetKey[] | null;
        if (only) keys = only.map(govTargetKeyForRoleId);
        else if (entry.kind === "findings") keys = await keysOfFindings(dispatch, ws, entry.ids);
        else keys = keysFor(entry);
        if (!keys || keys.length === 0) {
          return set({
            phase: "failed",
            failure: { kind: "rejected", code: "invalid_parameter", message: "The link does not name a role AuthSec can look up.", detail: {} },
            during: "resolve",
          });
        }
        const resolved = await resolveKeys(dispatch, ws, keys);
        if (cancelled) return;
        const ok = resolved.filter((t) => targetBlock(t) === "ok");
        if (ok.length !== resolved.length) {
          return set({ phase: "blocked", targets: resolved, canContinue: entry.kind === "template" && ok.length > 0 });
        }
        body = only ? { template: "right_size_services", keys: only.map(govTargetKeyForRoleId) } : proposalFor(entry);
      } catch (e) {
        return set({ phase: "failed", failure: classifyPolicyError(e) ?? { kind: "failed", code: "", message: "", detail: {} }, during: "resolve" });
      }
      if (!body) {
        return set({
          phase: "failed",
          failure: { kind: "rejected", code: "invalid_parameter", message: "The link does not describe a policy AuthSec can start.", detail: {} },
          during: "resolve",
        });
      }
      // 3. Create the draft once.
      set({ phase: "working", what: "Creating a draft and building the recommendation from the latest scan…" });
      const made = await createOnce(dispatch, `${ws}|${entry.sig}|${only?.join(",") ?? ""}`, body);
      if (!made.ok) return set({ phase: "failed", failure: made.failure, during: "create" });
      const r = made.result;
      const snapshot: ProposalSnapshot = {
        recommendation: r.recommendation,
        evidence_targets: r.evidence_targets,
        evaluated_rev: made.meta?.evaluated_rev ?? (r.version.intent.kind === "right_size_services" ? r.version.intent.evidence_rev : 0),
        initial_delivery: r.version.intent.delivery,
      };
      rememberDraft(ws, entry.sig, r.policy.id, snapshot);
      if (!cancelled) onPolicyRef.current(r.policy.id);
      // The version view carries the targets (role ARNs, canary flag) the proposal response does not.
      const again = await loadDraft(dispatch, ws, r.policy.id, entry.sig);
      if (again.kind === "ok") return set({ phase: "ready", session: { ...again.session, snapshot, initialDelivery: snapshot.initial_delivery } });
      if (again.kind === "failed") return set({ phase: "failed", failure: again.failure, during: "load" });
      return set({ phase: "failed", failure: { kind: "failed", code: "", message: "The draft was created but could not be read back.", detail: {} }, during: "load" });
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, ws, entry, attempt, only, enabled]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const continueWith = useCallback((roleIds: string[]) => setOnly(roleIds), []);

  /** A saved edit: the new version becomes the base of the next. */
  const adopt = useCallback((v: GovVersionView) => {
    setBoot((b) =>
      b.phase === "ready" && v.intent.kind === "right_size_services"
        ? { phase: "ready", session: { ...b.session, versionNo: v.no, intentHash: v.intent_hash, saved: v.intent, targets: v.targets } }
        : b,
    );
  }, []);

  return { boot, retry, continueWith, adopt };
}
