import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  useCreateCheckoutSessionMutation,
  useCreatePortalSessionMutation,
  useGetPlansQuery,
  useGetSubscriptionQuery,
  useGetUsageQuery,
  useUncancelSubscriptionMutation,
} from "@/app/api/billingApi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BillingPageSkeleton } from "./components/BillingPageSkeleton";
import { CurrentPlanCard } from "./components/CurrentPlanCard";
import { MauUsageCard } from "./components/MauUsageCard";
import { PlanComparisonTable } from "./components/PlanComparisonTable";

const FREE_FALLBACK_LIMIT = 5;

export function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const successToastFired = useRef(false);

  const subscriptionQuery = useGetSubscriptionQuery();
  const usageQuery = useGetUsageQuery();
  const plansQuery = useGetPlansQuery();

  const [createCheckoutSession, checkoutState] =
    useCreateCheckoutSessionMutation();
  const [createPortalSession, portalState] = useCreatePortalSessionMutation();
  const [uncancelSubscription, uncancelState] =
    useUncancelSubscriptionMutation();

  const isMutating =
    checkoutState.isLoading || portalState.isLoading || uncancelState.isLoading;

  useEffect(() => {
    if (
      searchParams.get("success") === "1" &&
      !successToastFired.current
    ) {
      successToastFired.current = true;
      toast.success("You're now on Business — welcome!");
      const next = new URLSearchParams(searchParams);
      next.delete("success");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleUpgrade = async () => {
    try {
      const result = await createCheckoutSession({
        plan_id: "business",
        success_url: `${window.location.origin}/admin/billing?success=1`,
        cancel_url: `${window.location.origin}/admin/billing`,
      }).unwrap();
      window.location.href = result.url;
    } catch {
      toast.error("Could not start checkout. Please try again.");
    }
  };

  const handleManage = async () => {
    try {
      const result = await createPortalSession({
        return_url: `${window.location.origin}/admin/billing`,
      }).unwrap();
      window.location.href = result.url;
    } catch {
      toast.error("Could not open the billing portal. Please try again.");
    }
  };

  const handleReactivate = async () => {
    try {
      await uncancelSubscription().unwrap();
      toast.success("Subscription reactivated.");
    } catch {
      toast.error("Could not reactivate subscription. Please try again.");
    }
  };

  const isLoading =
    subscriptionQuery.isLoading ||
    usageQuery.isLoading ||
    plansQuery.isLoading;

  const hasError =
    subscriptionQuery.isError || usageQuery.isError || plansQuery.isError;

  const refetchAll = () => {
    subscriptionQuery.refetch();
    usageQuery.refetch();
    plansQuery.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">
        Billing
      </h1>

      {isLoading ? (
        <BillingPageSkeleton />
      ) : hasError || !subscriptionQuery.data || !usageQuery.data ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to load billing information</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>Please retry, or refresh the page.</span>
            <div>
              <Button variant="outline" size="sm" onClick={refetchAll}>
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <CurrentPlanCard
            subscription={subscriptionQuery.data}
            onUpgrade={handleUpgrade}
            onManage={handleManage}
            onReactivate={handleReactivate}
            isMutating={isMutating}
          />

          <MauUsageCard
            usage={usageQuery.data}
            mauLimit={
              plansQuery.data?.find(
                (p) => p.id === subscriptionQuery.data!.plan_id
              )?.mau_limit ?? FREE_FALLBACK_LIMIT
            }
            planId={subscriptionQuery.data.plan_id}
          />

          {subscriptionQuery.data.plan_id === "free" && (
            <PlanComparisonTable
              plans={plansQuery.data ?? []}
              onUpgrade={handleUpgrade}
              isMutating={isMutating}
            />
          )}
        </>
      )}
    </div>
  );
}
