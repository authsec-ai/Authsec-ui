/**
 * What this deployment's backend serves for the policy product (SPEC-iga-phase3
 * §4.3). The UI and backend release separately: with the gate off or the block
 * absent the Policy destination keeps its reference preview and every other
 * policy route renders "not available", never an error or an empty list.
 */

import { useGetGraphCapabilitiesQuery, type PolicyCapabilities } from "@/app/api/igaGraphApi";
import { classifyGraphError } from "../../shared/graphErrors";

export type PolicyGateState = "loading" | "on" | "off" | "error";

export interface PolicyCaps {
  state: PolicyGateState;
  /** Why it is off, in the server's words. */
  reason: string | null;
  caps: PolicyCapabilities | null;
  /** A flag is true only when the gate is on AND the feature is served. */
  feature: (name: "findings" | "proposals" | "export" | "iac" | "enforcement" | "slack" | "access_policies") => boolean;
  /** Why a feature is false, when the server said. */
  featureReason: (name: string) => string | null;
  /** Provider support: AWS supported, Kubernetes not in this release. */
  providerSupported: (provider: string) => boolean;
  providerReason: (provider: string) => string | null;
  refetch: () => void;
}

/**
 * Read the access-policies capability whatever shape the backend sends. The
 * shipped backend sends `{available, reason}`; a boolean is also accepted so an
 * older build reads correctly. `on` is false when the field is absent.
 */
function accessPolicies(caps: PolicyCapabilities | null): { on: boolean; reason: string | null } {
  const v = caps?.access_policies;
  if (v === undefined || v === null) return { on: false, reason: null };
  if (typeof v === "boolean") return { on: v, reason: null };
  return { on: v.available === true, reason: v.reason ?? null };
}

export function usePolicyCapabilities(ws: string): PolicyCaps {
  const q = useGetGraphCapabilitiesQuery({ ws });
  const caps = q.data?.policy ?? null;
  const failure = classifyGraphError(q.error);
  let state: PolicyGateState;
  if (q.isLoading) state = "loading";
  else if (failure && failure.kind !== "unavailable") state = "error";
  else if (!caps || caps.state !== "on") state = "off";
  else state = "on";
  return {
    state,
    reason: caps?.reason ?? (failure?.kind === "unavailable" ? failure.reason ?? null : null),
    caps,
    feature: (name) => state === "on" && (name === "access_policies" ? accessPolicies(caps).on : caps?.[name] === true),
    featureReason: (name) =>
      name === "access_policies"
        ? accessPolicies(caps).reason ?? (caps?.access_policies !== undefined ? null : "Access policies are not available on this server yet.")
        : caps?.reasons?.[name] ?? null,
    providerSupported: (p) => state === "on" && caps?.providers?.[p] === "supported",
    providerReason: (p) => caps?.provider_reasons?.[p] ?? null,
    refetch: () => void q.refetch(),
  };
}
