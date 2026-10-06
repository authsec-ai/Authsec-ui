/** A kind of event as an icon AND its name in words — never colour alone. */

import { CheckCircle2, Clock, Eye, Loader2, LogIn, PackageCheck, PlugZap, Tag, Unplug, XCircle, type LucideIcon } from "lucide-react";

import { toneClasses, type ConsoleTone } from "@/components/console/status";
import { cn } from "@/lib/utils";

import { KIND_LABEL, type LogKind } from "./fixtures";

const GLYPH: Record<LogKind, { icon: LucideIcon; tone: ConsoleTone }> = {
  scan_queued: { icon: Clock, tone: "neutral" },
  scan_running: { icon: Loader2, tone: "info" },
  scan_finished: { icon: CheckCircle2, tone: "success" },
  scan_failed: { icon: XCircle, tone: "danger" },
  publication_published: { icon: PackageCheck, tone: "success" },
  classification_decided: { icon: Tag, tone: "neutral" },
  connection_added: { icon: PlugZap, tone: "neutral" },
  connection_revoked: { icon: Unplug, tone: "warning" },
  sighting_seen: { icon: Eye, tone: "neutral" },
  sign_in: { icon: LogIn, tone: "neutral" },
};

export function KindGlyph({ kind, className, tone: toneOverride }: { kind: LogKind; className?: string; tone?: ConsoleTone }) {
  const { icon: Icon, tone: kindTone } = GLYPH[kind];
  const tone = toneOverride ?? kindTone;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-(--color-text)", className)}>
      <Icon className={cn("size-4 shrink-0", toneClasses[tone].icon)} aria-hidden="true" />
      {KIND_LABEL[kind]}
    </span>
  );
}
