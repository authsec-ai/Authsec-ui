import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanId, UsageData } from "../types";

interface MauUsageCardProps {
  usage: UsageData;
  mauLimit: number;
  planId: PlanId;
}

function formatMonth(isoDate: string | undefined | null): string {
  if (!isoDate || typeof isoDate !== "string") return "";
  const [year, month] = isoDate.split("-");
  if (!year || !month) return isoDate;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
}

function barColor(pct: number): string {
  if (pct >= 100) return "var(--color-danger)";
  if (pct >= 80) return "var(--color-warning)";
  return "var(--color-success)";
}

export function MauUsageCard({ usage, mauLimit, planId }: MauUsageCardProps) {
  const safeLimit = mauLimit > 0 ? mauLimit : 1;
  const rawPct = (usage.mau_count / safeLimit) * 100;
  const pct = Math.min(Math.round(rawPct), 100);
  const showNudge = planId === "free" && rawPct >= 80;
  const fillColor = barColor(rawPct);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm uppercase tracking-wide text-[color:var(--color-text-secondary)]">
          Monthly Active Users
        </CardTitle>
        <span className="text-sm text-[color:var(--color-text-secondary)]">
          {formatMonth(usage.month)}
        </span>
      </CardHeader>
      <CardContent>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
          <div
            data-testid="mau-progress-bar"
            className={cn("h-full rounded-full transition-all")}
            style={{ width: `${pct}%`, backgroundColor: fillColor }}
          />
        </div>
        <p className="mt-3 text-sm text-[color:var(--color-text-secondary)]">
          <span className="font-semibold text-[color:var(--color-text-primary)]">
            {usage.mau_count.toLocaleString()} / {mauLimit.toLocaleString()}
          </span>{" "}
          MAU used
        </p>

        {showNudge && (
          <Alert className="mt-4 border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10">
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-warning)" }} />
            <AlertDescription className="text-[color:var(--color-text-primary)]">
              You&apos;re at {pct}% of your Free plan limit.{" "}
              <span className="font-medium">Upgrade to Business</span> for up to
              200,000 MAU.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
