/**
 * Small building blocks shared by Home's Welcome and Home views.
 * Colors come only from the theme tokens, so both light and dark themes work.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

export const SDK_DOCS_URL = "https://docs.authsec.dev/getting-started";

/* ─── card shell ─────────────────────────────────────────────────────────── */

export function HomeCard({
  title,
  aside,
  className,
  bodyClassName,
  children,
  id,
}: {
  title: ReactNode;
  /** Right side of the header: a count, a period or a link. */
  aside?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised)",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="sec-title min-w-0 truncate">{title}</h2>
        {aside ? (
          <div className="flex shrink-0 items-center text-[length:var(--font-size-sm)] text-(--color-text-muted)">
            {aside}
          </div>
        ) : null}
      </header>
      <div className={cn("flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="font-medium text-(--color-primary-text) underline underline-offset-2 hover:no-underline"
    >
      {children}
    </Link>
  );
}

/** "Couldn't load …" line with a retry, used inside cards. */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="m-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
      Couldn't load {what}.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="font-medium text-(--color-primary-text) underline underline-offset-2"
      >
        Try again
      </button>
    </p>
  );
}

/** Monospace chip for URLs, IDs, tool and scope names. */
export function MonoChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "inline-block max-w-full truncate rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-1.5 py-0.5 align-middle font-mono text-[length:13px] text-(--color-text)",
        className,
      )}
    >
      {children}
    </code>
  );
}

/** Result pill in the activity table: green for allowed, red for denied. */
export function ResultPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[length:13px] font-medium",
        ok
          ? "bg-(--color-success-soft) text-(--color-success-text)"
          : "bg-(--color-danger-soft) text-(--color-danger-text)",
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", ok ? "bg-(--color-success)" : "bg-(--color-danger)")} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ─── developer details ──────────────────────────────────────────────────── */

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">{label}</span>
      <MonoChip className="px-2.5 py-1">{value || "Not available"}</MonoChip>
      {value ? (
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            if (await copyToClipboard(value, label, { toastSuccess: false })) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
          className="shrink-0 text-[length:var(--font-size-sm)] font-medium text-(--color-primary-text) underline underline-offset-2 hover:no-underline"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </div>
  );
}

/** Issuer URL, workspace ID and the SDK docs: what a developer needs to wire
 *  an MCP or agent to this workspace. */
export function DeveloperDetails({ issuerUrl, workspaceId }: { issuerUrl: string; workspaceId: string }) {
  return (
    <section
      aria-label="Developer details"
      className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) px-5 py-4"
    >
      <h2 className="m-0 text-[length:var(--font-size-sm)] font-semibold text-(--color-text)">Developer details</h2>
      <CopyValue label="Issuer URL" value={issuerUrl} />
      <CopyValue label="Workspace ID" value={workspaceId} />
      <a
        href={SDK_DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="ml-auto text-[length:var(--font-size-sm)] font-medium text-(--color-primary-text) underline underline-offset-2 hover:no-underline"
      >
        SDK docs
      </a>
    </section>
  );
}
