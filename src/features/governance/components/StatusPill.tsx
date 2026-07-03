import { cn } from "@/lib/utils";
import { TONE_CLASSES, type Tone } from "@/features/governance/lib/riskTone";

export function StatusPill({ label, tone, className }: { label: string; tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--component-badge-radius)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
