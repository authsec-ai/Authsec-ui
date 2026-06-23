import { useMemo, useState } from "react";
import { ShieldCheck, Plus, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListTrustedIssuersQuery,
  useCreateTrustedIssuerMutation,
  useRevokeTrustedIssuerMutation,
  useTestTrustedIssuerMutation,
  type TrustedIssuer,
  type CreateTrustedIssuerRequest,
} from "@/app/api/trustedIssuersApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import BrokeringPoliciesCard from "./BrokeringPoliciesCard";
import WorkloadProvidersCard from "./WorkloadProvidersCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ── Create issuer dialog ──────────────────────────────────────────────────────

function CreateIssuerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [form, setForm] = useState<CreateTrustedIssuerRequest>({
    iss: "",
    jwks_uri: "",
    provider_name: "",
    allowed_algs: ["RS256"],
    jit_provisioning: false,
  });
  const [testAssertion, setTestAssertion] = useState("");
  const [testResult, setTestResult] = useState<{ pass: boolean; reason?: string; sub?: string } | null>(null);

  const [createIssuer, { isLoading: creating }] = useCreateTrustedIssuerMutation();
  const [testIssuer, { isLoading: testing }] = useTestTrustedIssuerMutation();

  const handleCreate = async () => {
    if (!form.iss.trim() || !form.jwks_uri.trim() || !form.provider_name.trim()) return;
    try {
      await createIssuer(form).unwrap();
      toast.success("Trusted issuer registered.");
      onOpenChange(false);
      resetForm();
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message ?? "Couldn't register issuer.");
    }
  };

  const handleTest = async () => {
    if (!testAssertion.trim()) return;
    try {
      const result = await testIssuer({ assertion: testAssertion.trim() }).unwrap();
      setTestResult(result);
    } catch {
      setTestResult({ pass: false, reason: "Request failed" });
    }
  };

  const resetForm = () => {
    setForm({ iss: "", jwks_uri: "", provider_name: "", allowed_algs: ["RS256"], jit_provisioning: false });
    setTestAssertion("");
    setTestResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add trusted issuer</DialogTitle>
          <DialogDescription>
            Register an external identity provider whose assertions will be accepted for cross-app access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="ti-name">Provider name</Label>
            <Input
              id="ti-name"
              placeholder="e.g. Okta Production"
              value={form.provider_name}
              onChange={(e) => setForm((f) => ({ ...f, provider_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-iss">Issuer URL</Label>
            <Input
              id="ti-iss"
              placeholder="https://auth.example.com"
              value={form.iss}
              onChange={(e) => setForm((f) => ({ ...f, iss: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-jwks">JWKS URI</Label>
            <Input
              id="ti-jwks"
              placeholder="https://auth.example.com/.well-known/jwks.json"
              value={form.jwks_uri}
              onChange={(e) => setForm((f) => ({ ...f, jwks_uri: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-sub-mapping">Subject mapping claim (optional)</Label>
            <Input
              id="ti-sub-mapping"
              placeholder="email or sub"
              value={form.subject_mapping ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, subject_mapping: e.target.value || undefined }))}
            />
            <p className="text-[11px] text-slate-400">
              Which claim to use when mapping the assertion subject to a local user.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Test assertion (optional)</Label>
            <Textarea
              placeholder="Paste an ID-JAG JWT to validate it against this config…"
              value={testAssertion}
              onChange={(e) => setTestAssertion(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
            {testResult && (
              <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${testResult.pass ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                {testResult.pass
                  ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                }
                <span>
                  {testResult.pass
                    ? `Pass — sub: ${testResult.sub ?? "unknown"}`
                    : testResult.reason ?? "Validation failed"}
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!testAssertion.trim() || testing}
            >
              {testing ? "Testing…" : "Test assertion"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!form.iss.trim() || !form.jwks_uri.trim() || !form.provider_name.trim() || creating}
            className="text-white"
          >
            {creating ? "Registering…" : "Register issuer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Revoke confirm dialog ─────────────────────────────────────────────────────

function RevokeIssuerDialog({
  issuer,
  onOpenChange,
}: {
  issuer: TrustedIssuer | null;
  onOpenChange: (v: boolean) => void;
}) {
  const [revokeIssuer, { isLoading }] = useRevokeTrustedIssuerMutation();

  const handleRevoke = async () => {
    if (!issuer) return;
    try {
      await revokeIssuer(issuer.id).unwrap();
      toast.success("Issuer revoked — active XAA tokens from this issuer have been revoked.");
      onOpenChange(false);
    } catch (err) {
      const e = err as { data?: { message?: string } };
      toast.error(e?.data?.message ?? "Couldn't revoke issuer.");
    }
  };

  return (
    <Dialog open={!!issuer} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke trusted issuer</DialogTitle>
          <DialogDescription>
            This will block new cross-app access from{" "}
            <span className="font-medium text-foreground">{issuer?.provider_name}</span>{" "}
            and immediately revoke all active XAA tokens issued via this issuer.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          Any agent connections granted through this issuer will lose access at their next token introspection.
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={isLoading}
          >
            {isLoading ? "Revoking…" : "Revoke issuer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrustedIssuersPage() {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TrustedIssuer | null>(null);

  const { data, isLoading } = useListTrustedIssuersQuery();

  const issuers = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.provider_name, i.iss].join(" ").toLowerCase().includes(q),
    );
  }, [data?.items, query]);

  const columns = useMemo<AdaptiveColumn<TrustedIssuer>[]>(
    () => [
      {
        id: "provider",
        header: "Issuer",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.provider_name}
            detail={row.original.iss}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 90,
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "default" : "destructive"}
            className={row.original.status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : undefined}
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "algs",
        header: "Algorithms",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {(row.original.allowed_algs ?? ["RS256"]).join(", ")}
          </span>
        ),
      },
      {
        id: "jit",
        header: "JIT",
        priority: 3,
        approxWidth: 70,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.jit_provisioning ? "On" : "Off"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        priority: 0,
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) =>
          row.original.status === "active" ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-[var(--color-danger)] hover:text-[var(--color-danger)] hover:bg-red-50"
              onClick={() => setRevokeTarget(row.original)}
            >
              Revoke
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Revoked</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3 pb-1">
        <ShieldCheck className="size-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold leading-none">Trusted Issuers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            External identity providers whose assertions are accepted for cross-app agent access.
          </p>
        </div>
      </div>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search issuers"
        trailing={
          <div className="flex items-center gap-2">
            {query.trim() && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="text-white"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add issuer
            </Button>
          </div>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading issuers…
            </div>
          ) : issuers.length === 0 && !query ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">No trusted issuers yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add an external identity provider to enable cross-app agent access.
              </p>
              <Button
                size="sm"
                className="mt-4 text-white"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add issuer
              </Button>
            </div>
          ) : (
            <AdaptiveTable
              tableId="trusted-issuers"
              data={issuers}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(r) => r.id}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <WorkloadProvidersCard />

      <BrokeringPoliciesCard />

      <CreateIssuerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RevokeIssuerDialog issuer={revokeTarget} onOpenChange={(v) => { if (!v) setRevokeTarget(null); }} />
    </div>
  );
}
