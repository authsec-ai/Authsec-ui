import { cn } from "@/lib/utils";
import { toneFromScore, TONE_CLASSES } from "@/features/governance/lib/riskTone";

export function RiskPill({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.25rem] items-center justify-center rounded-[var(--component-badge-radius)] px-2 py-0.5 text-xs font-semibold tabular-nums",
        TONE_CLASSES[toneFromScore(score)],
        className,
      )}
    >
      {score}
    </span>
  );
}
