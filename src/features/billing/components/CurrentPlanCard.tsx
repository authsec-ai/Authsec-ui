import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Subscription, SubscriptionStatus } from "../types";

interface CurrentPlanCardProps {
  subscription: Subscription;
  onUpgrade: () => void;
  onManage: () => void;
  onReactivate: () => void;
  isMutating: boolean;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  business: "Business",
};

const PLAN_DESCRIPTION: Record<string, string> = {
  free: "Up to 5 MAU · No cost",
  business: "Up to 200,000 MAU",
};

function statusLabel(status: SubscriptionStatus, cancelAtEnd: boolean): string {
  if (cancelAtEnd) return "Canceling";
  if (status === "past_due") return "Past Due";
  if (status === "trialing") return "Trial";
  if (status === "canceled") return "Canceled";
  return "Active";
}

function statusVariant(
  status: SubscriptionStatus,
  cancelAtEnd: boolean
): "default" | "secondary" | "destructive" | "outline" {
  if (cancelAtEnd) return "secondary";
  if (status === "past_due") return "destructive";
  if (status === "trialing") return "outline";
  if (status === "canceled") return "secondary";
  return "default";
}

function statusBadgeClasses(
  status: SubscriptionStatus,
  cancelAtEnd: boolean
): string {
  if (cancelAtEnd || status === "canceled") {
    return "border border-[color:var(--color-border)] bg-[var(--color-surface-subtle)] text-[color:var(--color-text-secondary)] rounded-full px-2.5 py-0.5";
  }
  if (status === "past_due") {
    return "border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)] rounded-full px-2.5 py-0.5";
  }
  if (status === "trialing") {
    return "border border-[color:var(--color-border)] bg-transparent text-[color:var(--color-text-primary)] rounded-full px-2.5 py-0.5";
  }
  return "border border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/10 text-[color:var(--color-success)] rounded-full px-2.5 py-0.5";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("default", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CurrentPlanCard({
  subscription,
  onUpgrade,
  onManage,
  onReactivate,
  isMutating,
}: CurrentPlanCardProps) {
  const { plan_id, status, current_period_end, cancel_at_period_end } =
    subscription;
  const label = statusLabel(status, cancel_at_period_end);
  const variant = statusVariant(status, cancel_at_period_end);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm uppercase tracking-wide text-[color:var(--color-text-secondary)]">
          Current Plan
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold text-[color:var(--color-text-primary)]">
            {PLAN_LABEL[plan_id] ?? plan_id}
          </span>
          <Badge
            variant={variant}
            className={statusBadgeClasses(status, cancel_at_period_end)}
          >
            {label}
          </Badge>
        </div>

        <p className="text-sm text-[color:var(--color-text-secondary)]">
          {PLAN_DESCRIPTION[plan_id] ?? ""}
          {plan_id === "business" && current_period_end && (
            <>
              {" · "}
              {cancel_at_period_end
                ? `Access until ${formatDate(current_period_end)}`
                : `Renews ${formatDate(current_period_end)}`}
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          {plan_id === "free" && (
            <Button onClick={onUpgrade} disabled={isMutating}>
              Upgrade to Business
            </Button>
          )}

          {plan_id === "business" && cancel_at_period_end && (
            <Button onClick={onReactivate} disabled={isMutating}>
              Reactivate
            </Button>
          )}

          {plan_id === "business" && (
            <Button
              variant="outline"
              onClick={onManage}
              disabled={isMutating}
            >
              Manage Billing
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
