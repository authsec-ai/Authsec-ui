/** Small pieces every agent-runtime screen shares. */

import type { ReactNode } from "react";

import { DecisionBanner, StatusBadge } from "@/components/console/status";
import type { PolicyFailure } from "../policy/shared";
import type { AgentLabel } from "@/app/api/igaAgentRuntimeApi";
import { cn } from "@/lib/utils";

import { failureText, LABEL_HINT, LABEL_TEXT, LABEL_TONE } from "./model";
import type { AgentCaps } from "./useAgentRuntimeCaps";

export function LabelChip({ label }: { label: AgentLabel }) {
  return (
    <StatusBadge tone={LABEL_TONE[label]} title={LABEL_HINT[label]}>
      {LABEL_TEXT[label] ?? label}
    </StatusBadge>
  );
}

/** The neutral state for a feature the server does not serve (or did not report). */
export function NotAvailable({ caps, what }: { caps: AgentCaps; what: string }) {
  if (caps.state === "loading") {
    return (
      <p role="status" className="text-sm text-(--color-text-muted)">
        Checking what this server provides…
      </p>
    );
  }
  if (caps.state === "error") {
    return (
      <DecisionBanner
        tone="danger"
        title="Could not check whether this is available"
        body="The request failed. This is not the same as it being off."
        actionLabel="Retry"
        onAction={caps.refetch}
      />
    );
  }
  return (
    <DecisionBanner
      tone="neutral"
      title={`${what}: not available`}
      body={caps.reason ? `Not available: ${caps.reason}. Everything else in AuthSec is unaffected.` : "Not available on this server. Everything else in AuthSec is unaffected."}
      actionLabel="Check again"
      onAction={caps.refetch}
    />
  );
}

/** A failed read, in words: never an empty list. */
export function ReadFailure({ failure, subject, onRetry }: { failure: PolicyFailure; subject: string; onRetry?: () => void }) {
  if (failure.kind === "unavailable") {
    return <DecisionBanner tone="neutral" title={`${subject}: not available`} body={failureText(failure)} />;
  }
  const retry = failure.kind === "failed" || failure.kind === "timeout";
  return (
    <DecisionBanner
      tone={failure.kind === "forbidden" ? "warning" : "danger"}
      title={failure.kind === "forbidden" ? `Your role cannot see ${subject}` : failure.kind === "not_found" ? "Not found in this workspace" : `Could not load ${subject}`}
      body={failureText(failure)}
      actionLabel={retry && onRetry ? "Retry" : undefined}
      onAction={retry ? onRetry : undefined}
    />
  );
}

/** A rejected action, inline under the control that caused it. */
export function ActionError({ failure, className }: { failure: PolicyFailure | null; className?: string }) {
  if (!failure) return null;
  return (
    <div role="alert" className={cn("rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger-text)", className)}>
      {failureText(failure)}
    </div>
  );
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="break-all font-mono text-xs">
      {children}
    </span>
  );
}
