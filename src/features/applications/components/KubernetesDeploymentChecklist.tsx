/**
 * `KubernetesDeploymentChecklist` — the "guided deployment receipt" step trail
 * (plan Journey 2). Renders the 7 deploy steps with a live pass/waiting signal
 * derived from the workload's attestation status:
 *   attestation_pending → attested → token_issued
 * Attestation proves the install/register/deploy/fetch steps actually happened;
 * a minted token proves the exchange + activity. Steps we genuinely can't detect
 * are inferred from those signals (never asserted blindly).
 */

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StepState = "done" | "waiting" | "pending";

function rankOf(status?: string): number {
  switch (status) {
    case "token_issued":
      return 2;
    case "attested":
      return 1;
    default:
      return 0; // attestation_pending / failed / unknown
  }
}

export default function KubernetesDeploymentChecklist({ status }: { status?: string }) {
  const rank = rankOf(status);

  // done = proven by a live signal; waiting = the next thing we're polling for;
  // pending = not reached yet.
  const steps: { label: string; detail: string; state: StepState }[] = [
    { label: "Install SPIRE components", detail: "Apply the SPIRE server + agent in your cluster.", state: rank >= 1 ? "done" : rank === 0 ? "waiting" : "pending" },
    { label: "Register the SPIRE entry", detail: "Create the entry for this workload's SPIFFE ID + selectors.", state: rank >= 1 ? "done" : "pending" },
    { label: "Deploy your workload", detail: "Run the pod with the agent socket mounted.", state: rank >= 1 ? "done" : "pending" },
    { label: "Fetch a JWT-SVID (attested)", detail: "The agent attests the pod and issues an SVID.", state: rank >= 1 ? "done" : rank === 0 ? "waiting" : "pending" },
    { label: "Exchange the SVID for a token", detail: "AuthSec validates the SVID and mints an access token.", state: rank >= 2 ? "done" : rank >= 1 ? "waiting" : "pending" },
    { label: "Call the MCP server", detail: "Use the Bearer token against the MCP endpoint.", state: rank >= 2 ? "done" : "pending" },
    { label: "Confirm activity in AuthSec", detail: "Token issuance shows on this workload.", state: rank >= 2 ? "done" : "pending" },
  ];

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Deployment checklist
      </p>
      <ol className="mt-1 space-y-1">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2 rounded-md px-2 py-1.5",
              s.state === "waiting" && "bg-blue-50/60",
            )}
          >
            {s.state === "done" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : s.state === "waiting" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-blue-600" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-xs font-medium",
                  s.state === "done" ? "text-slate-900" : s.state === "waiting" ? "text-blue-900" : "text-slate-500",
                )}
              >
                {i + 1}. {s.label}
              </p>
              <p className="text-[11px] leading-4 text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
