/**
 * `CrossAppDebugger` — debug why an A2A / ID-JAG caller can't reach this MCP
 * server (plan Journey 8). Runs the redemption-path checks unique to the
 * cross-app flow: distinct caller/target, connection approval, and the
 * brokering deny gate. Backed by POST /applications/:id/token-test/simulate-xaa.
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
import {
  useListConnectionsQuery,
  useSimulateXaaMutation,
  type SimulateTokenResponse,
} from "@/app/api/agentIdentityApi";
import { Surface } from "./ApplicationConsole";
import { cn } from "@/lib/utils";

const CHECK_LABEL: Record<string, string> = {
  not_self_delegation: "Agent is distinct from this Application",
  connection_approved: "Connection approved for this server",
  brokering_permitted: "Brokering permits redemption",
};

export default function CrossAppDebugger({ applicationId }: { applicationId: string }) {
  const { data } = useListConnectionsQuery(applicationId);
  const [simulate, { data: result, isLoading, reset }] = useSimulateXaaMutation();
  const [clientId, setClientId] = useState("");

  // Connections are the cross-app/M2M callers registered on this server.
  const callers = useMemo(() => data?.items ?? [], [data?.items]);

  const run = async () => {
    if (!clientId) {
      toast.error("Pick a connection to debug.");
      return;
    }
    try {
      await simulate({ rsId: applicationId, client_id: clientId }).unwrap();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't run the cross-app check.");
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

  const firstFailIndex = result ? result.checks.findIndex((c) => c.status !== "pass") : -1;

  return (
    <Surface className="space-y-4 p-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-950">Debug a cross-app caller</h3>
        <p className="text-xs text-muted-foreground">
          Why can't an agent reach this server? Same-workspace agents are valid;
          this checks caller/target separation, approval, and brokering.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1 space-y-1.5">
          <Label htmlFor="xaa-conn">Connection</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); reset(); }}>
            <SelectTrigger id="xaa-conn">
              <SelectValue placeholder="Select a connected client" />
            </SelectTrigger>
            <SelectContent>
              {callers.map((c) => (
                <SelectItem key={c.client_id} value={c.client_id}>
                  {c.client_name || c.client_id} · {c.access_method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => void run()} disabled={isLoading || !clientId} className="text-white">
          {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
          Run check
        </Button>
      </div>

      {result && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          {result.would_mint ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              This cross-app caller can redeem against this server.
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-900">Blocked — see the first failing check.</p>
              {result.failure_bundle && (
                <Button size="sm" variant="outline" onClick={() => void copyBundle(result)}>
                  <ClipboardCopy className="mr-1.5 size-3.5" />
                  Copy failure bundle
                </Button>
              )}
            </div>
          )}
          <ul className="space-y-1.5">
            {result.checks.map((c, i) => {
              const ok = c.status === "pass";
              const dim = firstFailIndex >= 0 && i > firstFailIndex;
              return (
                <li
                  key={`${c.name}-${i}`}
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
                    <p className="text-sm font-medium text-slate-950">{CHECK_LABEL[c.name] ?? c.name}</p>
                    {!ok && c.reason && <p className="mt-0.5 text-xs leading-5 text-red-700">{c.reason}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Surface>
  );
}
