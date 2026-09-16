/**
 * The status pill for the cloud discovery screens.
 *
 * ── Why this exists rather than `StatusBadge` ───────────────────────────────
 *
 * The discovery section renders two pill styles side by side. The GitHub and
 * Kubernetes screens — Discovered Agents, Integrations, Integration detail —
 * use an 11px medium-weight pill; the cloud screens used `StatusBadge`, which
 * is 12.5px semibold on a fixed 24px height. Adjacent pages in one sidebar
 * group reading at two different sizes and weights looks like two products
 * stitched together, which is the whole problem this component closes.
 *
 * The cloud screens converge on the GitHub styling, so the visible difference
 * disappears without editing the GitHub/Kubernetes files — those belong to
 * another track, and a cross-track diff to fix our own consistency is a worse
 * trade than a component that lives here.
 *
 * ── What it deliberately keeps ─────────────────────────────────────────────
 *
 * The `tone` prop and `StatusTone` union are `StatusBadge`'s, unchanged. Six
 * tone maps in awsInventoryLabels.ts and the two connector drawers are typed
 * against it, and they encode real product judgement about which states are a
 * warning and which are not — that is not styling, and re-deriving it here
 * would be a way to get it subtly wrong.
 *
 * Same tokens, too: `--color-*-soft` / `--color-*-text` are exactly what both
 * `StatusBadge` and the GitHub pills already use, so this changes size, weight
 * and padding — not the palette.
 *
 * `muted` is the one tone whose classes differ from `StatusBadge`: the GitHub
 * pills use `bg-muted text-muted-foreground` with no border, and matching them
 * is the point.
 */

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import type { StatusTone } from "@/components/ui/status-badge";

/** Byte-for-byte the class string the GitHub/Kubernetes screens use. Kept as
 * one constant so a future tweak cannot drift half the cloud pills. */
const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-(--color-success-soft) text-(--color-success-text)",
  warning: "bg-(--color-warning-soft) text-(--color-warning-text)",
  danger: "bg-(--color-danger-soft) text-(--color-danger-text)",
  info: "bg-(--color-info-soft) text-(--color-info-text)",
  accent: "bg-(--color-primary-soft) text-(--color-primary-text)",
  muted: "bg-muted text-muted-foreground",
};

interface CloudPillProps extends ComponentProps<"span"> {
  tone?: StatusTone;
  /** Show the leading dot. Defaults to true, as `StatusBadge` did, so every
   * existing call site keeps the dot it already had. */
  dot?: boolean;
}

export function CloudPill({
  tone = "muted",
  dot = true,
  className,
  children,
  ...props
}: CloudPillProps) {
  return (
    <span
      data-slot="cloud-pill"
      data-tone={tone}
      className={cn(PILL, TONE_CLASS[tone], className)}
      {...props}
    >
      {/* `bg-current` rather than a separate dot token — the GitHub pills tint
          the dot from the text colour, and a dedicated token here would read
          as a slightly different hue beside them. */}
      {dot ? <span className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
