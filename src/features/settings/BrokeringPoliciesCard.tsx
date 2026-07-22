/**
 * `BrokeringPoliciesCard` — manage cross-app (XAA) brokering permit/deny rules
 * (plan Journey 7 governance). The token endpoint enforces these as
 * explicit-deny-wins: a `deny` row blocks ID-JAG issuance/redemption for the
 * matching client; no rows = permit. Lives under Trusted Issuers.
 */

import { useState } from "react";
import { Plus, ShieldX, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListBrokeringPoliciesQuery,
  useCreateBrokeringPolicyMutation,
  useDeleteBrokeringPolicyMutation,
} from "@/app/api/brokeringPoliciesApi";
import { cn } from "@/lib/utils";

export default function BrokeringPoliciesCard() {
  const { data, isLoading, refetch } = useListBrokeringPoliciesQuery();
  const [createPolicy, { isLoading: creating }] = useCreateBrokeringPolicyMutation();
  const [deletePolicy] = useDeleteBrokeringPolicyMutation();

  const [adding, setAdding] = useState(false);
  const [side, setSide] = useState<"issuance" | "redemption">("issuance");
  const [effect, setEffect] = useState<"permit" | "deny">("deny");
  const [clientId, setClientId] = useState("");

  const items = data?.items ?? [];

  const add = async () => {
    try {
      await createPolicy({
        side,
        effect,
        client_id: clientId.trim() || undefined,
      }).unwrap();
      toast.success("Brokering rule added.");
      setAdding(false);
      setClientId("");
      void refetch();
    } catch (err) {
      const apiErr = err as { data?: { message?: string; error?: string } };
      toast.error(apiErr?.data?.message ?? apiErr?.data?.error ?? "Couldn't add rule.");
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePolicy(id).unwrap();
      toast.success("Rule removed.");
      void refetch();
    } catch {
      toast.error("Couldn't remove rule.");
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Cross-app brokering</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permit/deny rules for cross-application ID-JAG issuance &amp; redemption.
            No rules means permit; a <span className="font-semibold">deny</span> wins.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1.5 size-3.5" />
          Add rule
        </Button>
      </div>

      {adding && (
        <div className="grid gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Side</Label>
            <Select value={side} onValueChange={(v) => setSide(v as typeof side)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="issuance">Issuance</SelectItem>
                <SelectItem value="redemption">Redemption</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Effect</Label>
            <Select value={effect} onValueChange={(v) => setEffect(v as typeof effect)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deny">Deny</SelectItem>
                <SelectItem value="permit">Permit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-client">Client ID (optional)</Label>
            <Input
              id="bp-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="all clients"
              autoComplete="off"
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => void add()} disabled={creating} className="text-white">
              {creating ? "Adding…" : "Add"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="p-4">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading rules…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No brokering rules — all cross-app issuance &amp; redemption is permitted by default.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Badge
                    className={cn(
                      "uppercase",
                      p.effect === "deny"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {p.effect === "deny" && <ShieldX className="mr-1 size-3" />}
                    {p.effect}
                  </Badge>
                  <span className="text-slate-700">{p.side}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {p.client_id ? `client ${p.client_id}` : "all clients"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(p.id)}
                  aria-label="Remove rule"
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
