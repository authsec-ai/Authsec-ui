/**
 * `WorkloadAccessDebugger` — the "why can't this caller reach my MCP server?"
 * panel (plan Journey 4, the product wedge). Pick a caller that has (or should
 * have) access, run an ordered checklist, and see the exact first failure with
 * its reason — plus a one-click "Copy failure bundle" for Slack/Jira.
 *
 * Two modes:
 *   - config (default): no SVID in hand — checks only what config can prove.
 *   - paste SVID: validate a real JWT-SVID's signature / issuer / audience /
 *     subject without minting anything.
 *
 * Backed by POST /authsec/applications/:id/token-test/simulate (SimulateToken).
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCopy, Loader2, Play, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  useListAccessAssignmentsQuery,
  useSimulateTokenMutation,
  type SimulateCheck,
  type SimulateTokenResponse,
} from "@/app/api/agentIdentityApi";
import { cn } from "@/lib/utils";

import { Surface } from "./ApplicationConsole";

type Mode = "config" | "paste_svid" | "live";

// Human labels for the backend check names (fall back to the raw name).
const CHECK_LABEL: Record<string, string> = {
  service_account_active: "Workload is active",
  client_linked: "Has an authentication method",
  client_registration_approved: "Approved for this MCP server",
  role_binding_exists: "Role is bound on this server",
  requested_scopes_subset: "Requested scopes are granted",
  spiffe_issuer_configured: "SPIFFE issuer configured",
  jwks_reachable_from_backend: "SPIFFE keys reachable from AuthSec",
  svid_provided: "SVID provided",
  svid_verified: "SVID signature / issuer / audience valid",
  svid_sub_matches_registered_spiffe_id: "SVID subject matches this workload",
  token_issued: "Token issued by the live exchange",
};

function CheckRow({ check, dim }: { check: SimulateCheck; dim: boolean }) {
  const ok = check.status === "pass";
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md border p-2.5",
        ok ? "border-slate-200 bg-white" : "border-red-200 bg-red-50/60",
        dim && "opacity-50",
      )}
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-950">
          {CHECK_LABEL[check.name] ?? check.name}
        </p>
        {!ok && check.reason && (
          <p className="mt-0.5 text-xs leading-5 text-red-700">{check.reason}</p>
        )}
      </div>
    </li>
  );
}

export default function WorkloadAccessDebugger({
  applicationId,
}: {
  applicationId: string;
}) {
  const { data: assignmentsData } = useListAccessAssignmentsQuery(applicationId);
  const [simulate, { data: result, isLoading, reset }] = useSimulateTokenMutation();

  const assignments = useMemo(() => assignmentsData?.items ?? [], [assignmentsData?.items]);

  const [assignmentId, setAssignmentId] = useState("");
  const [mode, setMode] = useState<Mode>("config");
  const [svid, setSvid] = useState("");

  const selected = assignments.find((a) => a.id === assignmentId) ?? null;

  const run = async () => {
    if (!assignmentId) {
      toast.error("Pick a caller to test.");
      return;
    }
    if ((mode === "paste_svid" || mode === "live") && !svid.trim()) {
      toast.error("Paste a JWT-SVID, or switch to config mode.");
      return;
    }
    try {
      await simulate({
        rsId: applicationId,
        assignment_id: assignmentId,
        mode,
        svid: mode === "paste_svid" || mode === "live" ? svid.trim() : undefined,
      }).unwrap();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't run the access check.");
    }
  };

  const copyBundle = async (res: SimulateTokenResponse) => {
    if (!res.failure_bundle) return;
    try {
      await navigator.clipboard.writeText(res.failure_bundle);
      toast.success("Failure bundle copied.");
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  };

  // First failing check drives the headline; passing checks after it are dimmed.
  const firstFailIndex = result
    ? result.checks.findIndex((c) => c.status !== "pass")
    : -1;

  return (
    <Surface className="space-y-4 p-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-950">Debug access</h3>
        <p className="text-xs text-muted-foreground">
          Pick a caller and AuthSec tells you exactly why it can or can't reach
          this MCP server.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dbg-caller">Caller</Label>
          <Select
            value={assignmentId}
            onValueChange={(v) => {
              setAssignmentId(v);
              reset();
            }}
          >
            <SelectTrigger id="dbg-caller">
              <SelectValue placeholder="Select a workload or user with access" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.identity_name} · {a.role_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Mode</Label>
          <div className="flex gap-2">
            {(
              [
                { m: "config" as Mode, label: "Config check" },
                { m: "paste_svid" as Mode, label: "Paste SVID" },
                { m: "live" as Mode, label: "Live test" },
              ]
            ).map(({ m, label }) => (
              <Button
                key={m}
                type="button"
                variant={mode === m ? "default" : "outline"}
                className={cn("h-9 flex-1 px-2 text-xs", mode === m && "text-white")}
                onClick={() => {
                  setMode(m);
                  reset();
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {(mode === "paste_svid" || mode === "live") && (
        <div className="space-y-1.5">
          <Label htmlFor="dbg-svid">JWT-SVID</Label>
          <textarea
            id="dbg-svid"
            value={svid}
            onChange={(e) => setSvid(e.target.value)}
            placeholder={
              mode === "live"
                ? "Paste the workload's JWT-SVID — this exchanges it at the real token endpoint and mints a short-lived token."
                : "Paste the workload's JWT-SVID — validated for signature, issuer, audience, and subject. Nothing is minted."
            }
            rows={3}
            autoComplete="off"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-950 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
        </div>
      )}

      {mode === "live" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          Live test issues a <span className="font-semibold">real, short-lived token</span>{" "}
          and is recorded in audit. It stops at the mint — it does not call the MCP server.
        </p>
      )}

      <Button
        onClick={() => void run()}
        disabled={isLoading || !assignmentId}
        className="text-white"
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Play className="mr-2 size-4" />
        )}
        Run check
      </Button>

      {result && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {result.would_mint ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="text-xs leading-5 text-emerald-900">
                <p className="font-semibold">
                  {selected?.identity_name ?? "This caller"} can call this MCP server.
                </p>
                {result.effective_scopes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {result.effective_scopes.map((s) => (
                      <Badge key={s} variant="outline" className="font-mono text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-900">
                Blocked — see the first failing check below.
              </p>
              {result.failure_bundle && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyBundle(result)}
                >
                  <ClipboardCopy className="mr-1.5 size-3.5" />
                  Copy failure bundle
                </Button>
              )}
            </div>
          )}

          <ul className="space-y-1.5">
            {result.checks.map((c, i) => (
              <CheckRow
                key={`${c.name}-${i}`}
                check={c}
                dim={firstFailIndex >= 0 && i > firstFailIndex}
              />
            ))}
          </ul>
        </div>
      )}
    </Surface>
  );
}
