export type RowTone = "neutral" | "primary" | "success" | "warning" | "danger";

// Full literal class strings so Tailwind's static scanner can find them —
// don't build these via template interpolation, it won't be detected.
const ROW_ACCENT_CLASS: Record<RowTone, string> = {
  neutral: "",
  primary: "border-l-[3px] border-l-(--color-primary)",
  success: "border-l-[3px] border-l-(--color-success)",
  warning: "border-l-[3px] border-l-(--color-warning)",
  danger: "border-l-[3px] border-l-(--color-danger)",
};

/** Left-edge accent bar for a table row, keyed by status tone. */
export function rowAccentClassName(tone: RowTone | undefined): string {
  return tone ? ROW_ACCENT_CLASS[tone] : "";
}
