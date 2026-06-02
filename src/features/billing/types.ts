export type PlanId = "free" | "business" | "payg";
export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

export interface Subscription {
  plan_id: PlanId;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

export interface UsageData {
  month: string;
  mau_count: number;
  tenant_id: string;
}

export interface Plan {
  id: PlanId | string;
  name: string;
  base_price?: string;
  description?: string;
  features?: string[] | null;
  purchasable?: boolean;
  mau_limit?: number;
  price_monthly?: number | null;
}

export interface CheckoutSessionRequest {
  plan_id: PlanId;
  success_url: string;
  cancel_url: string;
}

export interface PortalSessionRequest {
  return_url: string;
}

export interface SessionResponse {
  url: string;
}
