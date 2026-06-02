import { baseApi } from "./baseApi";
import type {
  Subscription,
  UsageData,
  Plan,
  CheckoutSessionRequest,
  PortalSessionRequest,
  SessionResponse,
} from "../../features/billing/types";

function unwrap<T>(response: unknown, key: string): T | undefined {
  if (!response || typeof response !== "object") return undefined;
  const r = response as Record<string, unknown>;
  if (key in r && r[key] && typeof r[key] === "object") {
    return r[key] as T;
  }
  if (r.data && typeof r.data === "object") {
    const data = r.data as Record<string, unknown>;
    if (key in data && data[key] && typeof data[key] === "object") {
      return data[key] as T;
    }
  }
  return undefined;
}

function looksLikeSubscription(r: Record<string, unknown>): boolean {
  return "plan_id" in r || "status" in r;
}

function looksLikeUsage(r: Record<string, unknown>): boolean {
  return "month" in r || "mau_count" in r;
}

export const billingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSubscription: builder.query<Subscription, void>({
      query: () => ({
        url: "/api/v1/billing/subscription",
        method: "GET",
      }),
      transformResponse: (response: unknown): Subscription => {
        if (response && typeof response === "object") {
          const r = response as Record<string, unknown>;
          if (looksLikeSubscription(r)) return r as unknown as Subscription;
          const nested = unwrap<Subscription>(response, "subscription");
          if (nested) return nested;
          if (r.data && typeof r.data === "object" && looksLikeSubscription(r.data as Record<string, unknown>)) {
            return r.data as unknown as Subscription;
          }
        }
        return response as Subscription;
      },
      providesTags: [{ type: "BillingSubscription", id: "CURRENT" }],
    }),
    getUsage: builder.query<UsageData, void>({
      query: () => ({
        url: "/api/v1/billing/usage",
        method: "GET",
      }),
      transformResponse: (response: unknown): UsageData => {
        if (response && typeof response === "object") {
          const r = response as Record<string, unknown>;
          if (looksLikeUsage(r)) return r as unknown as UsageData;
          const nested = unwrap<UsageData>(response, "usage");
          if (nested) return nested;
          if (r.data && typeof r.data === "object" && looksLikeUsage(r.data as Record<string, unknown>)) {
            return r.data as unknown as UsageData;
          }
        }
        return response as UsageData;
      },
      providesTags: [{ type: "BillingUsage", id: "CURRENT" }],
    }),
    getPlans: builder.query<Plan[], void>({
      query: () => ({
        url: "/api/v1/billing/plans",
        method: "GET",
      }),
      transformResponse: (response: unknown): Plan[] => {
        if (Array.isArray(response)) return response as Plan[];
        if (response && typeof response === "object") {
          const r = response as Record<string, unknown>;
          if (Array.isArray(r.plans)) return r.plans as Plan[];
          if (Array.isArray(r.data)) return r.data as Plan[];
          const data = r.data;
          if (
            data &&
            typeof data === "object" &&
            Array.isArray((data as Record<string, unknown>).plans)
          ) {
            return (data as Record<string, unknown>).plans as Plan[];
          }
        }
        return [];
      },
      providesTags: [{ type: "BillingPlan", id: "LIST" }],
    }),
    createCheckoutSession: builder.mutation<
      SessionResponse,
      CheckoutSessionRequest
    >({
      query: (body) => ({
        url: "/api/v1/billing/checkout-session",
        method: "POST",
        body,
      }),
    }),
    createPortalSession: builder.mutation<SessionResponse, PortalSessionRequest>(
      {
        query: (body) => ({
          url: "/api/v1/billing/portal-session",
          method: "POST",
          body,
        }),
      }
    ),
    cancelSubscription: builder.mutation<void, void>({
      query: () => ({
        url: "/api/v1/billing/cancel",
        method: "POST",
      }),
      invalidatesTags: [{ type: "BillingSubscription", id: "CURRENT" }],
    }),
    uncancelSubscription: builder.mutation<void, void>({
      query: () => ({
        url: "/api/v1/billing/uncancel",
        method: "POST",
      }),
      invalidatesTags: [{ type: "BillingSubscription", id: "CURRENT" }],
    }),
  }),
});

export const {
  useGetSubscriptionQuery,
  useGetUsageQuery,
  useGetPlansQuery,
  useCreateCheckoutSessionMutation,
  useCreatePortalSessionMutation,
  useCancelSubscriptionMutation,
  useUncancelSubscriptionMutation,
} = billingApi;
