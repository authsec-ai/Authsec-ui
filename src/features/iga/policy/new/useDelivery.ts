/**
 * Which deliveries (SPEC-iga-phase3-policy.md §1.1) can run for the roles of a
 * draft, and why not. The backend refuses `direct` and `iac_pr` only when a
 * rollout starts (409 `enforcement_not_enabled`, `binding_not_verified`,
 * `iac_source_missing`, iga_gov_rollout_service.go deliveryAllowed and
 * cloud_enforcement_deploy_gate.go), so the author is told here, before
 * submitting, with the Setup step that fixes it. `unknown` means the check
 * itself could not be made: the option stays selectable and says so, the
 * server decides.
 *
 * Inputs: the capability block (`usePolicyCapabilities`), the workspace's
 * enforcement mode (`GET /settings`), and per AWS connection the enforcement
 * binding and the IaC sources (`/authsec/discovery/aws/connectors/:id/...`).
 */

import { useGetGovSettingsQuery } from "@/app/api/igaPolicyReadsApi";
import { useAppDispatch } from "@/app/hooks";
import { igaPolicySetupApi } from "@/app/api/igaPolicySetupApi";
import type { GovDelivery } from "@/app/api/igaPolicyAuthoringApi";

import { relTime, usePolicyCapabilities } from "../shared";
import type { RoleInfo } from "./flow";
import { useFetchMany } from "./useFetchMany";

export interface DeliveryOption {
  delivery: GovDelivery;
  /** true: usable; false: refused, `reason` says why; null: not known yet or not checkable. */
  available: boolean | null;
  reason?: string;
  /** The §7.12 code the server would answer. */
  code?: string;
  fix?: { label: string; to: string };
  /** One line about what is in place, when it is usable. */
  detail?: string;
}

export function useDelivery(ws: string, roles: readonly RoleInfo[]): Record<GovDelivery, DeliveryOption> {
  const dispatch = useAppDispatch();
  const caps = usePolicyCapabilities(ws);
  const settings = useGetGovSettingsQuery({ ws });
  const connectors = roles.map((r) => r.connectorId).filter((c): c is string => !!c);

  const bindings = useFetchMany(connectors, async (id) => {
    const sub = dispatch(igaPolicySetupApi.endpoints.getEnforcementBinding.initiate(id));
    try {
      return await sub.unwrap();
    } finally {
      sub.unsubscribe();
    }
  });
  const sources = useFetchMany(connectors, async (id) => {
    const sub = dispatch(igaPolicySetupApi.endpoints.listIacSources.initiate(id));
    try {
      return await sub.unwrap();
    } finally {
      sub.unsubscribe();
    }
  });

  const modeOff = settings.data ? settings.data.enforcement_mode !== "enforce" : null;
  const modeFix = { label: "Open Setup", to: "/iga/policy/setup/settings" };
  const unknownConnector = roles.some((r) => !r.connectorId);

  const modeRefusal = (): DeliveryOption | null =>
    modeOff === true
      ? {
          delivery: "direct",
          available: false,
          code: "enforcement_not_enabled",
          reason: "Enforcement is off for this workspace: it only reviews, approves and exports.",
          fix: modeFix,
        }
      : null;

  // direct
  let direct: DeliveryOption = { delivery: "direct", available: null };
  if (!caps.feature("enforcement")) {
    direct = { delivery: "direct", available: false, code: "enforcement_not_enabled", reason: caps.featureReason("enforcement") ?? "AuthSec applying changes is not available on this server.", fix: { label: "Open Setup", to: "/iga/policy/setup/enforcement" } };
  } else if (modeRefusal()) {
    direct = modeRefusal()!;
  } else {
    const states = connectors.map((c) => ({ c, b: bindings[c] }));
    const loading = states.some((s) => !s.b || s.b.status === "loading") || settings.isLoading;
    const bad = states.find((s) => s.b?.status === "ok" && s.b.data.setup_state !== "verified");
    const errored = states.some((s) => s.b?.status === "error");
    if (bad && bad.b?.status === "ok") {
      const acct = roles.find((r) => r.connectorId === bad.c)?.subject.account_id;
      direct = {
        delivery: "direct",
        available: false,
        code: bad.b.data.setup_state === "partial" ? "binding_partial" : bad.b.data.setup_state === "off" ? "enforcement_not_enabled" : "binding_not_verified",
        reason: `Enforcement access is ${bad.b.data.setup_state === "off" ? "not set up" : bad.b.data.setup_state === "partial" ? "only partly working" : "not verified"} in account ${acct ?? "this account"}.`,
        fix: { label: "Open Enforcement setup", to: "/iga/policy/setup/enforcement" },
      };
    } else if (loading && connectors.length > 0) {
      direct = { delivery: "direct", available: null, detail: "Checking enforcement access…" };
    } else if (errored || unknownConnector || connectors.length === 0) {
      direct = { delivery: "direct", available: null, detail: "AuthSec could not check enforcement access from here; it is checked again when the rollout starts." };
    } else {
      const first = bindings[connectors[0]];
      const when = first?.status === "ok" ? relTime(first.data.verified_at) : "";
      direct = { delivery: "direct", available: true, detail: `Enforcement on · verified${when ? ` ${when}` : ""}` };
    }
  }

  // iac_pr
  let iac: DeliveryOption = { delivery: "iac_pr", available: null };
  if (!caps.feature("iac")) {
    iac = { delivery: "iac_pr", available: false, code: "iac_source_missing", reason: caps.featureReason("iac") ?? "Pull requests are not available on this server.", fix: { label: "Open IaC sources", to: "/iga/policy/setup/iac" } };
  } else if (modeOff === true) {
    iac = { ...modeRefusal()!, delivery: "iac_pr" };
  } else {
    const states = connectors.map((c) => ({ c, s: sources[c] }));
    const loading = states.some((s) => !s.s || s.s.status === "loading");
    const missing = states.find((s) => s.s?.status === "ok" && s.s.data.length === 0);
    if (missing) {
      const acct = roles.find((r) => r.connectorId === missing.c)?.subject.account_id;
      iac = {
        delivery: "iac_pr",
        available: false,
        code: "iac_source_missing",
        reason: `No infrastructure-as-code source is mapped for account ${acct ?? "this account"}.`,
        fix: { label: "Open IaC sources", to: "/iga/policy/setup/iac" },
      };
    } else if (loading && connectors.length > 0) {
      iac = { delivery: "iac_pr", available: null, detail: "Checking IaC sources…" };
    } else if (states.some((s) => s.s?.status === "error") || unknownConnector || connectors.length === 0) {
      iac = { delivery: "iac_pr", available: null, detail: "AuthSec could not check the IaC sources from here; the server checks them when the pull request is opened." };
    } else {
      const first = sources[connectors[0]];
      const src = first?.status === "ok" ? first.data[0] : undefined;
      iac = { delivery: "iac_pr", available: true, detail: src ? `${src.repository} (${src.format === "terraform" ? "Terraform" : "CloudFormation"})` : undefined };
    }
  }

  const exp: DeliveryOption = !caps.feature("export")
    ? { delivery: "export", available: false, reason: caps.featureReason("export") ?? "Export is not available on this server." }
    : { delivery: "export", available: true, detail: "You apply it; AuthSec verifies it" };

  return { direct, iac_pr: iac, export: exp };
}
