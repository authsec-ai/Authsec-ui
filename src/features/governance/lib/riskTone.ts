export type Tone = "critical" | "high" | "medium" | "low" | "neutral";

export function toneFromScore(score: number): Tone {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

export const TONE_CLASSES: Record<Tone, string> = {
  critical: "bg-(--color-danger-soft) text-(--color-danger-text)",
  high: "bg-(--color-warning-soft) text-(--color-warning-text)",
  medium: "bg-(--color-warning-soft) text-(--color-warning-text)",
  low: "bg-(--color-success-soft) text-(--color-success-text)",
  neutral: "bg-(--color-surface-subtle) text-(--color-text-muted)",
};
