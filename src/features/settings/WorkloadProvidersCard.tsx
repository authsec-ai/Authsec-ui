/**
 * `WorkloadProvidersCard` — register the external token issuers workloads
 * authenticate with (replaces the single global SPIFFE_OIDC_ISSUER env):
 *   - kind 'spiffe': a SPIRE trust domain (multi-cluster / "already have SPIRE")
 *   - kind 'oidc'  : a generic OIDC issuer (GitHub Actions / CI federation)
 * The token validator resolves issuers from this list. Lives under Trusted Issuers.
 */

import { useState } from "react";
import { Plus, Server, Trash2 } from "lucide-react";
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
  useListWorkloadProvidersQuery,
  useCreateWorkloadProviderMutation,
  useDeleteWorkloadProviderMutation,
} from "@/app/api/workloadProvidersApi";

export default function WorkloadProvidersCard() {
  const { data, isLoading, refetch } = useListWorkloadProvidersQuery();
  const [create, { isLoading: creating }] = useCreateWorkloadProviderMutation();
  const [remove] = useDeleteWorkloadProviderMutation();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"spiffe" | "oidc">("spiffe");
  const [issuer, setIssuer] = useState("");
  const [trustDomain, setTrustDomain] = useState("");
  const [audiences, setAudiences] = useState("");
  const [subjectClaim, setSubjectClaim] = useState("");

  const items = data?.items ?? [];

  const reset = () => {
    setName(""); setIssuer(""); setTrustDomain(""); setAudiences(""); setSubjectClaim("");
  };

  const add = async () => {
    if (!name.trim() || !issuer.trim()) {
      toast.error("Name and issuer URL are required.");
      return;
    }
    try {
      await create({
        name: name.trim(),
        kind,
        issuer: issuer.trim(),
        trust_domain: kind === "spiffe" ? trustDomain.trim() || undefined : undefined,
        allowed_audiences: audiences.trim()
          ? audiences.split(/[\s,]+/).filter(Boolean)
          : undefined,
        subject_claim: kind === "oidc" ? subjectClaim.trim() || undefined : undefined,
      }).unwrap();
      toast.success("Provider added.");
      setAdding(false);
      reset();
      void refetch();
    } catch (err) {
      const apiErr = err as { data?: { message?: string; error?: string } };
      toast.error(apiErr?.data?.message ?? apiErr?.data?.error ?? "Couldn't add provider.");
    }
  };

  const del = async (id: string) => {
    try {
      await remove(id).unwrap();
      toast.success("Provider removed.");
      void refetch();
    } catch {
      toast.error("Couldn't remove provider.");
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Workload identity providers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Issuers your workloads authenticate with — SPIRE trust domains (any
            cluster) and OIDC federation (e.g. GitHub Actions). No secrets.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1.5 size-3.5" />
          Add provider
        </Button>
      </div>

      {adding && (
        <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="wip-name">Name</Label>
              <Input id="wip-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="prod cluster / github actions" autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="spiffe">SPIRE (SPIFFE)</SelectItem>
                  <SelectItem value="oidc">OIDC federation (CI)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wip-iss">Issuer URL</Label>
              <Input id="wip-iss" value={issuer} onChange={(e) => setIssuer(e.target.value)}
                placeholder={kind === "oidc" ? "https://token.actions.githubusercontent.com" : "https://spire.app.authsec.ai"}
                autoComplete="off" className="h-9 font-mono text-xs" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {kind === "spiffe" ? (
              <div className="space-y-1.5">
                <Label htmlFor="wip-td">Trust domain</Label>
                <Input id="wip-td" value={trustDomain} onChange={(e) => setTrustDomain(e.target.value)}
                  placeholder="spire.app.authsec.ai" autoComplete="off" className="h-9 font-mono text-xs" />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="wip-sub">Subject claim</Label>
                <Input id="wip-sub" value={subjectClaim} onChange={(e) => setSubjectClaim(e.target.value)}
                  placeholder="sub (default)" autoComplete="off" className="h-9 font-mono text-xs" />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wip-aud">Allowed audiences (optional, space/comma separated)</Label>
              <Input id="wip-aud" value={audiences} onChange={(e) => setAudiences(e.target.value)}
                placeholder="defaults to this token endpoint" autoComplete="off" className="h-9 font-mono text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setAdding(false); reset(); }}>Cancel</Button>
            <Button onClick={() => void add()} disabled={creating} className="text-white">
              {creating ? "Adding…" : "Add provider"}
            </Button>
          </div>
        </div>
      )}

      <div className="p-4">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading providers…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No providers yet — workloads can't authenticate via SPIFFE/OIDC until one is added.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="size-3.5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-950">{p.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{p.kind}</Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{p.issuer}</p>
                </div>
                <button type="button" onClick={() => void del(p.id)} aria-label="Remove provider"
                  className="text-slate-400 hover:text-red-600">
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
