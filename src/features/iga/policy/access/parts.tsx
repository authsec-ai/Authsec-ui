/** Small pieces every access-policy screen shares: chips, the AWS document, and the readiness banner. */

import { Copy } from "lucide-react";

import { useGetAccessReadinessQuery, type AccessEffect, type AccessPolicyStatus } from "@/app/api/igaAccessPoliciesApi";
import { DecisionBanner, StatusBadge } from "@/components/console/status";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { classifyPolicyError } from "../shared";
import { EFFECT, STATUS } from "./model";

export function PolicyStatusChip({ status, className }: { status: AccessPolicyStatus; className?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const, hint: "" };
  return (
    <StatusBadge tone={s.tone} title={s.hint} className={className}>
      {s.label}
    </StatusBadge>
  );
}

export function EffectChip({ effect }: { effect: AccessEffect }) {
  const e = EFFECT[effect];
  return <StatusBadge tone={e.tone}>{e.label}</StatusBadge>;
}

/** One IAM policy document, as AWS will hold it. */
export function AwsDocument({ title, document, className }: { title?: string; document: Record<string, unknown>; className?: string }) {
  const text = JSON.stringify(document, null, 2);
  return (
    <figure className={cn("min-w-0 overflow-hidden rounded-md border border-(--color-border-subtle)", className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5">
        <span className="truncate font-mono text-xs text-(--color-text-muted)">{title ?? "IAM policy"}</span>
        <button
          type="button"
          aria-label="Copy the policy document"
          className="inline-flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-text)"
          onClick={() => void copyToClipboard(text, "Policy document")}
        >
          <Copy aria-hidden="true" className="size-3.5" />
          Copy
        </button>
      </figcaption>
      <pre className="max-h-80 overflow-auto bg-(--color-surface-raised) px-3 py-2 font-mono text-xs leading-relaxed text-(--color-text)">{text}</pre>
    </figure>
  );
}

/**
 * Whether AuthSec can change IAM yet. Says so once, with the way to fix it,
 * and nothing when every connected account is ready. A failed check is said
 * as a failed check, never as "not ready".
 */
export function ReadinessBanner({ ws, accountId }: { ws: string; accountId?: string }) {
  const q = useGetAccessReadinessQuery({ ws });
  if (q.isLoading) return null;
  if (q.isError) {
    const f = classifyPolicyError(q.error);
    if (f?.kind === "unavailable") return null; // the page shell already says Policy is not available
    return (
      <DecisionBanner
        tone="warning"
        title="Could not check whether AuthSec can change AWS"
        body="Applying may still be refused. Retry, or check AWS access."
        actionLabel="Retry"
        onAction={() => void q.refetch()}
        secondaryLabel="AWS access"
        secondaryHref="/iga/policy/setup"
      />
    );
  }
  const r = q.data?.data;
  if (!r) return null;
  const accounts = accountId ? r.accounts.filter((a) => a.account_id === accountId) : r.accounts;
  const notReady = accounts.filter((a) => !a.ready);
  if (r.available && notReady.length === 0 && accounts.length > 0) return null;
  const body = !r.available
    ? r.reason || "Applying policies is turned off on this server."
    : accounts.length === 0
      ? "No AWS account is connected yet. Connect one in Connections first."
      : `${notReady.map((a) => `${a.account_id}${a.reason ? ` (${a.reason})` : ""}`).join(", ")}: AuthSec can read ${notReady.length === 1 ? "this account" : "these accounts"} but cannot change IAM there yet. Set up AWS access to apply policies.`;
  return (
    <DecisionBanner
      tone="warning"
      title="AuthSec cannot change AWS yet"
      body={body}
      actionLabel={r.available && accounts.length > 0 ? "Set up AWS access" : undefined}
      actionHref={r.available && accounts.length > 0 ? "/iga/policy/setup" : undefined}
    />
  );
}
