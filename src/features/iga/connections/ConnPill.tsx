/**
 * The status badge on the Connections screens: the same badge the policy list
 * uses under Effect (outlined, a coloured dot, the label never cut off), so
 * "Connected" and "Block" look like one product.
 */

import type { ReactNode } from "react";

import type { StatusTone } from "@/components/ui/status-badge";
import type { ConsoleTone } from "@/components/console/status";

import { IgaBadge } from "../shared/components/IgaBadge";

const TONE: Record<StatusTone, ConsoleTone> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  accent: "info",
  muted: "neutral",
};

export function ConnPill({ tone = "muted", title, children }: { tone?: StatusTone; /** Kept so existing call sites compile; the badge always shows its dot. */ dot?: boolean; title?: string; children: ReactNode }) {
  return (
    <IgaBadge tone={TONE[tone]} title={title}>
      {children}
    </IgaBadge>
  );
}
