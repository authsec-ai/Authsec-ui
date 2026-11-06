import type { AlertState } from "@/app/api/igaAgentRuntimeApi";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";


export function SeverityChip({ severity }: { severity: string }) {
  const tone: ConsoleTone = severity === "high" ? "danger" : severity === "medium" ? "warning" : "neutral";
  return <StatusBadge tone={tone}>{severity === "high" ? "High" : severity === "medium" ? "Medium" : severity}</StatusBadge>;
}

const STATE: Record<AlertState, { label: string; tone: ConsoleTone }> = {
  open: { label: "Open", tone: "danger" },
  acknowledged: { label: "Acknowledged", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

export function AlertStateChip({ state }: { state: string }) {
  const s = STATE[state as AlertState];
  return <StatusBadge tone={s?.tone ?? "neutral"}>{s?.label ?? state}</StatusBadge>;
}
