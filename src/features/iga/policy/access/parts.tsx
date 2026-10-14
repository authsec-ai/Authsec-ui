/** Small pieces every access-policy screen shares: chips, the AWS document, and the readiness banner. */

import { Copy, Info } from "lucide-react";
import { Link } from "react-router-dom";

import { useGetAccessReadinessQuery, type AccessEffect, type AccessPolicyStatus } from "@/app/api/igaAccessPoliciesApi";
import { DecisionBanner } from "@/components/console/status";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { IgaBadge } from "../../shared/components/IgaBadge";
import { classifyPolicyError } from "../shared";
import { EFFECT, STATUS } from "./model";
import { readinessWords } from "./readiness";

export function PolicyStatusChip({ status, className }: { status: AccessPolicyStatus; className?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const, hint: "" };
  return (
    <IgaBadge tone={s.tone} title={s.hint} className={className}>
      {s.label}
    </IgaBadge>
  );
}

export function EffectChip({ effect }: { effect: AccessEffect }) {
  const e = EFFECT[effect];
  return <IgaBadge tone={e.tone}>{e.label}</IgaBadge>;
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

/** A quiet note above a list: one line of what, one of why, and the way forward on the right. */
function SetupNotice({ title, body, actionLabel, actionHref }: { title: string; body: string; actionLabel?: string; actionHref?: string }) {
  return (
    <section className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-info-text)" />
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="text-[13px] font-semibold leading-5 text-(--color-text)">{title}</h2>
        <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-(--color-text-muted)">{body}</p>
      </div>
      {actionLabel && actionHref ? (
        <Link
          to={actionHref}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
        >
          {actionLabel}
        </Link>
      ) : null}
    </section>
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
      : `${notReady.length === 1 ? `Account ${notReady[0].account_id} needs` : `Accounts ${notReady.map((a) => a.account_id).join(", ")} need`} AWS access set up before AuthSec can apply policies there. Until then AuthSec can read ${notReady.length === 1 ? "it" : "them"} but not change ${notReady.length === 1 ? "it" : "them"}. ${[...new Set(notReady.map((a) => readinessWords(a.reason)))].map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(". ")}.`;
  return (
    <SetupNotice
      title="AWS access is not set up yet"
      body={body}
      actionLabel={r.available && accounts.length > 0 ? "Set up AWS access" : undefined}
      actionHref={r.available && accounts.length > 0 ? "/iga/policy/setup" : undefined}
    />
  );
}
