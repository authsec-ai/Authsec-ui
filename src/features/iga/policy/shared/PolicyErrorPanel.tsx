/**
 * A classified policy failure, in words (§7.12). Used for a read that did not
 * arrive (a banner with Retry) and for a rejected action (inline, under the
 * button). Never rendered as an empty list.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { DecisionBanner } from "@/components/console/status";
import { cn } from "@/lib/utils";

import { describeFailure, unavailableReason, type PolicyFailure } from "./policyErrors";
import { remedyFor } from "./remedy";

/** A read that did not arrive: a banner, never an empty list. */
export function PolicyLoadFailure({
  failure,
  subject,
  onRetry,
}: {
  failure: PolicyFailure;
  /** What was being read: "findings", "this policy". */
  subject: string;
  onRetry?: () => void;
}) {
  const words = describeFailure(failure);
  const remedy = remedyFor(failure);
  const reason = failure.kind === "unavailable" ? unavailableReason(failure) : undefined;
  const tone = failure.kind === "forbidden" || failure.kind === "member_session" || failure.kind === "unavailable" || failure.kind === "not_found" ? "warning" : "danger";
  const title =
    failure.kind === "failed" || failure.kind === "timeout" ? `Could not load ${subject}` : words.title;
  const body = (
    <>
      {words.fix ?? ""}
      {reason ? <> ({reason})</> : null}
      {failure.kind === "forbidden" ? ` Needs permission to see ${subject}.` : ""}
    </>
  );
  const retryable = failure.kind === "failed" || failure.kind === "timeout";
  return (
    <DecisionBanner
      tone={tone}
      title={title}
      body={body}
      actionLabel={retryable && onRetry ? "Retry" : remedy ? remedy.label : undefined}
      onAction={retryable && onRetry ? onRetry : undefined}
      actionHref={!retryable && remedy ? remedy.to : undefined}
    />
  );
}

/** A rejected action, inline under the control that caused it. */
export function PolicyActionError({ failure, className, children }: { failure: PolicyFailure | null; className?: string; children?: ReactNode }) {
  if (!failure) return null;
  const words = describeFailure(failure);
  const remedy = remedyFor(failure);
  return (
    <div role="alert" className={cn("rounded-md border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-[13px] text-(--color-danger-text)", className)}>
      <p className="font-medium">{words.title}</p>
      {words.fix ? <p className="mt-0.5">{words.fix}</p> : null}
      {failure.message && !words.fix ? <p className="mt-0.5">{failure.message}</p> : null}
      {remedy ? (
        <p className="mt-1">
          <Link to={remedy.to} className="font-medium underline">
            {remedy.label}
          </Link>
        </p>
      ) : null}
      {children}
    </div>
  );
}
