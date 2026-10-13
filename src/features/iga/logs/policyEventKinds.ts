/**
 * How the Logs feed words and marks the recorded policy events
 * (SPEC-iga-phase3-policy.md §9.6). The event names and categories are the
 * backend's vocabulary (services/iga_gov_event_vocabulary.go, served by
 * GET /policy/events/kinds); this file only gives each a label, an icon and a
 * tone. A name or category this build does not know is humanised and shown
 * neutral, never hidden.
 */

import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Bell,
  CircleHelp,
  ClipboardCheck,
  FilePen,
  Flag,
  FileSearch,
  GitCompare,
  Layers,
  ListChecks,
  RefreshCw,
  Rocket,
  Settings,
  ShieldCheck,
  ShieldOff,
  Undo2,
  UserCheck,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { ConsoleTone } from "@/components/console/status";
import { humanize } from "@/features/iga/policy/shared";

/** The Logs category (GovEvent.category) as words. "" is a name the vocabulary does not list. */
const CATEGORY_LABEL: Record<string, string> = {
  ownership: "Ownership",
  evaluation: "Evaluation",
  evidence: "Evidence",
  enforcement_binding: "Enforcement setup",
  deployment_attempt: "Deployment attempts",
  owner_review: "Owner reviews",
  notification: "Notifications",
  settings: "Settings",
  proposal: "Proposals and policies",
  approval: "Approvals",
  acceptance: "Acceptances",
  revalidation: "Revalidation",
  rollout: "Rollout",
  verification: "Verification",
  drift: "Drift",
  undo: "Undo",
  control_removal: "Control removal",
  finding: "Finding exceptions and rules",
};

export function categoryLabel(category: string): string {
  if (!category) return "Other";
  return CATEGORY_LABEL[category] ?? humanize(category);
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  ownership: Users,
  evaluation: ListChecks,
  evidence: FileSearch,
  enforcement_binding: ShieldCheck,
  deployment_attempt: Rocket,
  owner_review: UserCheck,
  notification: Bell,
  settings: Settings,
  proposal: FilePen,
  approval: BadgeCheck,
  acceptance: ClipboardCheck,
  revalidation: RefreshCw,
  rollout: Layers,
  verification: ShieldCheck,
  drift: GitCompare,
  undo: Undo2,
  control_removal: ShieldOff,
  finding: Flag,
};

/** The kinds that are marked by what happened rather than by their category. */
export function eventIcon(name: string, category: string, tone: ConsoleTone): LucideIcon {
  if (tone === "danger") return XCircle;
  if (name === "attempt.unknown" || name === "deployment.outcome_unresolved") return AlertTriangle;
  if (!category) return CircleHelp;
  return CATEGORY_ICON[category] ?? CircleHelp;
}

/** "review.responded" → "Review responded"; "attempt.unknown" → "Attempt outcome unknown". */
export function eventLabel(name: string): string {
  if (name === "attempt.unknown") return "Attempt outcome unknown";
  return humanize(name.replace(/\./g, " "));
}

const DANGER = ["failed", "dead", "blocked", "unresolved", "rejected", "unexpected", "bind_failed"];
const WARNING = [
  "unknown",
  "drift",
  "paused",
  "withdrawn",
  "revoked",
  "refused",
  "returned_to_draft",
  "superseded",
  "role_gone",
  "late_mutation",
  "abandoned",
  "impact_changed",
  "changed_after_review",
  "closed_unmerged",
  "emergency",
  "removal_requested",
  "removed",
  "disconnected",
];
const SUCCESS = ["verified", "approved", "completed", "applied", "bound", "sent", "undone", "merged", "accepted", "reviewed"];

/**
 * The tone of an event. An AWS answer to a mutating call (`attempt.completed`)
 * is marked by its recorded outcome, not by the word "completed".
 */
export function eventTone(name: string, payload?: Record<string, unknown>): ConsoleTone {
  if (name === "attempt.completed") {
    const outcome = payload?.outcome;
    if (outcome === "terminal") return "danger";
    if (outcome === "retryable") return "warning";
    if (outcome === "ok" || outcome === "recognised_done" || outcome === "not_needed") return "success";
    return "neutral";
  }
  const has = (words: string[]) => words.some((w) => name.includes(w));
  if (has(DANGER)) return "danger";
  if (has(WARNING)) return "warning";
  if (has(SUCCESS)) return "success";
  return "neutral";
}

/**
 * Categories no writer feeds yet, which the vocabulary endpoint does not list
 * (it names only categories that have, or are planned to have, events). They
 * appear in the kind filter as "Not recorded yet", disabled, and no sample is
 * ever shown for them (§9.6).
 */
export const NOT_RECORDED_ELSEWHERE: { category: string; label: string; reason: string }[] = [
  { category: "connection", label: "Connection added or revoked", reason: "Connection changes are not recorded in Logs yet." },
  { category: "scan", label: "Scans", reason: "Scan runs are not recorded in Logs yet." },
  { category: "publication", label: "Publications", reason: "Publications are not recorded in Logs yet." },
];
