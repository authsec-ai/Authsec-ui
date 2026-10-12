/**
 * What the new-policy flow remembers for this browser tab. Opening the flow
 * creates a draft policy (`POST /proposals`), so a reload must find that draft
 * again instead of creating a second one: the policy id is kept per entry, and
 * the proposal's recommendation and evidence (which only the creating response
 * carries) per policy. `sessionStorage` only, wrapped: private windows and
 * blocked storage fall back to "nothing remembered" (the `?policy=` URL
 * parameter still reuses the draft).
 */

import type { GovProposalEvidence, GovProposalRecommendation } from "@/app/api/igaPolicyAuthoringApi";

export interface ProposalSnapshot {
  recommendation: GovProposalRecommendation;
  evidence_targets: GovProposalEvidence[];
  evaluated_rev: number;
  /** The delivery the server suggested when it created the draft. */
  initial_delivery: string;
}

const entryKey = (ws: string, sig: string) => `authsec.policy.draft.entry:${ws}:${sig}`;
const snapKey = (ws: string, policyId: string) => `authsec.policy.draft.snapshot:${ws}:${policyId}`;

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the URL still carries the policy id */
  }
}

export const draftForEntry = (ws: string, sig: string): string | null => read(entryKey(ws, sig));

export function rememberDraft(ws: string, sig: string, policyId: string, snapshot: ProposalSnapshot | null): void {
  write(entryKey(ws, sig), policyId);
  if (snapshot) write(snapKey(ws, policyId), JSON.stringify(snapshot));
}

export function snapshotOf(ws: string, policyId: string): ProposalSnapshot | null {
  const raw = read(snapKey(ws, policyId));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ProposalSnapshot;
    return s && s.recommendation && Array.isArray(s.evidence_targets) ? s : null;
  } catch {
    return null;
  }
}

export function forgetDraft(ws: string, sig: string, policyId?: string): void {
  write(entryKey(ws, sig), null);
  if (policyId) write(snapKey(ws, policyId), null);
}
