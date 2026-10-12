/**
 * One read-only line on an AWS connection's page (SPEC-iga-phase3-policy.md §9.3
 * S9): "Enforcement: On · verified 3 hours ago", "Off" or "Partial", linking to
 * Policy › Setup › Enforcement. `connectionId` is the cloud connector's id.
 *
 * It is an aside on a page that belongs to Connections, so it never says
 * anything went wrong: with the policy product off, with no permission to read
 * the binding, or when the read fails or finds nothing, it renders nothing.
 */

import { Link } from "react-router-dom";

import { useGetEnforcementBindingQuery } from "@/app/api/igaPolicySetupApi";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { relTime, usePolicyCapabilities } from "../shared";
import { setupStateView } from "./enforcementModel";

const TONE_TEXT: Record<string, string> = {
  success: "text-(--color-success-text)",
  warning: "text-(--color-warning-text)",
  danger: "text-(--color-danger-text)",
};

export function EnforcementLine({ connectionId }: { connectionId: string }) {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const on = caps.state === "on";
  const binding = useGetEnforcementBindingQuery(connectionId, { skip: !on || !connectionId });
  const b = binding.data;
  if (!on || !b) return null;

  const view = setupStateView(b.setup_state);
  const when = b.setup_state === "verified" ? relTime(b.verified_at ?? b.last_self_test_at) : "";
  const words = when ? `${view.label} ${when}` : view.label;

  return (
    <p className="text-[13px] text-(--color-text-muted)">
      Enforcement:{" "}
      <Link
        to="/iga/policy/setup/enforcement"
        title={view.hint}
        className={cn("font-medium underline-offset-2 hover:underline", TONE_TEXT[view.tone] ?? "text-(--color-text)")}
      >
        {words}
      </Link>
    </p>
  );
}
