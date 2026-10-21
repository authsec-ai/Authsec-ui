import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * `PageAbout` — the one-line "What is this page?" strip every console page
 * opens with (UX proposal: "Every page opens with a one-line What is this
 * page? explanation"). Plain words, one sentence, no actions.
 */
export function PageAbout({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-primary)_22%,transparent)] bg-(--color-primary-soft) px-4 py-2.5 text-[length:var(--font-size-sm,13.5px)] leading-relaxed text-(--color-primary-text)"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="m-0">
        <span className="font-semibold">What is this page?</span> {children}
      </p>
    </div>
  );
}
