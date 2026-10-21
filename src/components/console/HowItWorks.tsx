import { Fragment, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HowItWorksStep {
  /** Small caps label: "1 · Permission", "AI agent". */
  label: string;
  title: ReactNode;
  body: ReactNode;
}

/**
 * `HowItWorks` — the short explainer strip under a page's "What is this
 * page?" line: a chain of three or four boxes (`flow`, joined by arrows,
 * the last one highlighted) or a set of
 * side-by-side choices (`choices`, two to four).
 *
 * It can be hidden; the choice is remembered per viewer in localStorage, and
 * a hidden strip leaves a one-line "Show …" link so it is never lost.
 */
export function HowItWorks({
  title,
  subtitle,
  steps,
  variant = "flow",
  storageKey,
  highlight,
}: {
  title: string;
  subtitle?: string;
  steps: HowItWorksStep[];
  variant?: "flow" | "choices";
  /** Which box to outline (a flow outlines its last box by default). */
  highlight?: number;
  /** Remembers Hide/Show. Omit to always show. */
  storageKey?: string;
}) {
  const key = storageKey ? `authsec.explainer.${storageKey}` : null;
  const [hidden, setHidden] = useState(() => {
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "hidden";
    } catch {
      return false;
    }
  });

  const toggle = (next: boolean) => {
    setHidden(next);
    if (!key) return;
    try {
      if (next) localStorage.setItem(key, "hidden");
      else localStorage.removeItem(key);
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => toggle(false)}
        className="text-[length:var(--font-size-sm,13px)] font-medium text-(--color-primary-text) underline-offset-2 hover:underline"
      >
        Show “{title}”
      </button>
    );
  }

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) px-5 py-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="m-0 text-[length:15px] font-semibold text-(--color-text)">{title}</h2>
        {subtitle ? (
          <span className="text-[length:13px] text-(--color-text-muted)">{subtitle}</span>
        ) : null}
        {key ? (
          <button
            type="button"
            onClick={() => toggle(true)}
            className="ml-auto text-[length:13px] font-medium text-(--color-primary-text) underline underline-offset-2"
          >
            Hide
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "grid gap-3",
          variant === "flow"
            ? steps.length === 4
              ? "md:items-stretch xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
              : "md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch"
            : steps.length === 2
              ? "md:grid-cols-2"
              : steps.length === 3
                ? "md:grid-cols-3"
                : "sm:grid-cols-2 xl:grid-cols-4",
        )}
      >
        {steps.map((step, i) => {
          const last =
            highlight !== undefined ? i === highlight : variant === "flow" && i === steps.length - 1;
          return (
            <Fragment key={step.label}>
              {variant === "flow" && i > 0 ? (
                <ArrowRight
                  aria-hidden
                  className={cn(
                    "hidden size-4 self-center text-(--color-text-muted)",
                    steps.length === 4 ? "xl:block" : "md:block",
                  )}
                />
              ) : null}
              <div
                className={cn(
                  "min-w-0 rounded-lg border px-4 py-3",
                  last
                    ? "border-(--color-primary) bg-(--color-primary-soft)"
                    : "border-(--color-border-subtle) bg-(--color-surface-raised)",
                )}
              >
                <div className="text-[length:11.5px] font-semibold uppercase tracking-[0.05em] text-(--color-primary-text)">
                  {step.label}
                </div>
                <div className="mt-1 text-[length:14.5px] font-semibold text-(--color-text) [overflow-wrap:anywhere]">
                  {step.title}
                </div>
                <div className="mt-0.5 text-[length:13px] leading-relaxed text-(--color-text-muted)">
                  {step.body}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}
