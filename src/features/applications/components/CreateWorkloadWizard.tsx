/**
 * CreateWorkloadWizard
 *
 * 4-step Sheet wizard for the Kubernetes workload identity
 * (SPIFFE/SVID, no client secret, K8s-only v1) path.
 * Step 1: Workload name
 * Step 2: Role
 * Step 3: Selectors (K8s namespace + service-account)
 * Step 4: Generated SPIFFE ID + install snippet (attestation status shown inline)
 */

import { useState } from "react";
import { CheckCircle2, Copy, Cpu, Loader2, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import { useListRSRolesQuery } from "@/app/api/setupWizardApi";
import {
  useCreateAppWorkloadMutation,
  useCreateFederatedWorkloadMutation,
  useListAppWorkloadsQuery,
  type CreateWorkloadResponse,
} from "@/app/api/appWorkloadsApi";
import {
  useListWorkloadProvidersQuery,
  useCreateWorkloadProviderMutation,
} from "@/app/api/workloadProvidersApi";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import KubernetesDeploymentChecklist from "./KubernetesDeploymentChecklist";

// ── step bar ───────────────────────────────────────────────────────────────────

const MANAGED_STEPS = ["Workload", "Access", "Kubernetes", "Install"];
const FEDERATED_STEPS = ["Workload", "Access", "Trust", "Install"];

function StepBar({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-1.5 pb-4">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5">
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
              i < step
                ? "bg-emerald-500 text-white"
                : i === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < step ? <CheckCircle2 className="size-3" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-xs",
              i === step ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {i < steps.length - 1 && (
            <div className="h-px w-4 bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── attestation status badge ───────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  attestation_pending: "bg-amber-100 text-amber-800 border-amber-200",
  attested: "bg-blue-100 text-blue-800 border-blue-200",
  token_issued: "bg-emerald-100 text-emerald-800 border-emerald-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  revoked: "bg-slate-100 text-slate-600 border-slate-200",
};

function AttestationBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const label =
    status === "attestation_pending"
      ? "Waiting to attest"
      : status === "token_issued"
        ? "Token issued"
        : status.replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", color)}>
      {label}
    </span>
  );
}

// ── main wizard ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}

type WorkloadMode = "managed" | "federated";

interface WizardState {
  saName: string;
  roleId: string;
  namespace: string;
  serviceAccount: string;
  providerId: string;
  externalSpiffeId: string;
}

const EMPTY: WizardState = {
  saName: "",
  roleId: "",
  namespace: "",
  serviceAccount: "",
  providerId: "",
  externalSpiffeId: "",
};

export default function CreateWorkloadWizard({ open, onOpenChange, rsId }: Props) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<WorkloadMode>("managed");
  const [state, setState] = useState<WizardState>(EMPTY);
  const [result, setResult] = useState<CreateWorkloadResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !open });
  const [createWorkload, { isLoading: creating }] = useCreateAppWorkloadMutation();
  const [createFederated, { isLoading: creatingFederated }] = useCreateFederatedWorkloadMutation();
  const { data: providersData, refetch: refetchProviders } = useListWorkloadProvidersQuery(undefined, { skip: !open });
  const [createProvider, { isLoading: creatingProvider }] = useCreateWorkloadProviderMutation();
  const { data: workloadsData, refetch } = useListAppWorkloadsQuery(rsId, { skip: !result });

  // Inline "add SPIRE provider" so the user never has to leave the wizard to
  // register a trust domain (the previous "go to Trusted Issuers" round-trip was
  // a trap — that page also has the unrelated ID-JAG issuers table).
  const [newProvider, setNewProvider] = useState({ name: "", issuer: "", trustDomain: "" });

  const roles = rolesData?.roles ?? [];
  const spiffeProviders = (providersData?.items ?? []).filter(
    (p) => p.kind === "spiffe" && p.status === "active",
  );
  const steps = mode === "federated" ? FEDERATED_STEPS : MANAGED_STEPS;
  const busy = creating || creatingFederated;

  const liveStatus = result
    ? workloadsData?.items?.find((w) => w.workload_id === result.workload_id)?.status
    : undefined;

  const handleClose = () => {
    setStep(0);
    setMode("managed");
    setState(EMPTY);
    setNewProvider({ name: "", issuer: "", trustDomain: "" });
    setResult(null);
    setCopied(false);
    onOpenChange(false);
  };

  const handleAddProvider = async () => {
    if (!newProvider.name.trim() || !newProvider.issuer.trim() || !newProvider.trustDomain.trim()) {
      toast.error("Name, issuer URL, and trust domain are required.");
      return;
    }
    try {
      const created = await createProvider({
        name: newProvider.name.trim(),
        kind: "spiffe",
        issuer: newProvider.issuer.trim(),
        trust_domain: newProvider.trustDomain.trim(),
      }).unwrap();
      await refetchProviders();
      setState((s) => ({ ...s, providerId: created.id }));
      setNewProvider({ name: "", issuer: "", trustDomain: "" });
      toast.success("Trust domain registered.");
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast.error(e?.data?.error ?? "Failed to register provider.");
    }
  };

  const handleCreate = async () => {
    if (!state.roleId) return;
    try {
      let res: CreateWorkloadResponse;
      if (mode === "federated") {
        if (!state.providerId || !state.externalSpiffeId.trim() || !state.saName.trim()) return;
        res = await createFederated({
          rsId,
          provider_id: state.providerId,
          external_spiffe_id: state.externalSpiffeId.trim(),
          role_id: state.roleId,
          service_account_name: state.saName.trim(),
        }).unwrap();
      } else {
        if (!state.saName.trim()) return;
        const selectors: Record<string, string> = {};
        if (state.namespace.trim()) selectors["k8s:ns"] = state.namespace.trim();
        if (state.serviceAccount.trim()) selectors["k8s:sa"] = state.serviceAccount.trim();
        res = await createWorkload({
          rsId,
          service_account_name: state.saName.trim(),
          role_id: state.roleId,
          platform: "kubernetes",
          selectors,
        }).unwrap();
      }
      setResult(res);
      setStep(3);
    } catch (err) {
      const e = err as { data?: { error?: string } };
      toast.error(e?.data?.error ?? "Failed to register workload.");
    }
  };

  const copySnippet = () => {
    if (!result?.install_snippet) return;
    navigator.clipboard.writeText(result.install_snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const roleLabel = (name: string) => {
    const raw = name.includes(":") ? name.split(":").pop() || name : name;
    return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg overflow-y-auto">
        <SheetHeader className="border-b px-6 pt-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            Connect Kubernetes workload
          </SheetTitle>
          <SheetDescription>
            Use SPIFFE/SPIRE so this pod can mint short-lived access tokens without a client secret.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <StepBar step={step} steps={steps} />

          {/* ── Step 0: Workload ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>SPIRE setup</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("managed")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs transition",
                      mode === "managed"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="block font-medium text-foreground">AuthSec-managed</span>
                    <span className="block text-muted-foreground">We mint the SPIFFE ID.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("federated")}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-xs transition",
                      mode === "federated"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="block font-medium text-foreground">Bring your own SPIRE</span>
                    <span className="block text-muted-foreground">Federate an external trust domain.</span>
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {mode === "federated"
                  ? "Register a workload whose SPIFFE ID is issued by your own SPIRE. You'll pick the federated trust domain and paste the exact SPIFFE ID next."
                  : "Name the workload that will run in Kubernetes. AuthSec creates the internal machine identity for you, but the pod authenticates with SPIFFE/SPIRE, not a long-lived secret."}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="wl-sa-name">Workload name</Label>
                <Input
                  id="wl-sa-name"
                  autoComplete="off"
                  placeholder="e.g. payments-processor"
                  value={state.saName}
                  onChange={(e) => setState((s) => ({ ...s, saName: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* ── Step 1: Role ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick what this Kubernetes workload can do on this MCP server.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="wl-role">Role</Label>
                <Select
                  value={state.roleId}
                  onValueChange={(v) => setState((s) => ({ ...s, roleId: v }))}
                >
                  <SelectTrigger id="wl-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {roleLabel(r.name)}
                        {r.scopes && r.scopes.length > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({r.scopes.slice(0, 3).join(", ")}{r.scopes.length > 3 ? "…" : ""})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── Step 2 (managed): K8s selectors ── */}
          {step === 2 && mode === "managed" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These selectors identify the pod allowed to receive this SPIFFE identity. Use the
                namespace and Kubernetes service account your deployment actually runs with.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="wl-ns">Kubernetes namespace</Label>
                <Input
                  id="wl-ns"
                  autoComplete="off"
                  placeholder="e.g. production"
                  value={state.namespace}
                  onChange={(e) => setState((s) => ({ ...s, namespace: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-sa-k8s">Kubernetes service account</Label>
                <Input
                  id="wl-sa-k8s"
                  autoComplete="off"
                  placeholder="e.g. payments-processor-sa"
                  value={state.serviceAccount}
                  onChange={(e) => setState((s) => ({ ...s, serviceAccount: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* ── Step 2 (federated): trust domain + external SPIFFE ID ── */}
          {step === 2 && mode === "federated" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Pick the federated trust domain (a registered workload identity provider) and paste
                the exact SPIFFE ID your SPIRE issues to this workload.
              </p>
              {spiffeProviders.length === 0 ? (
                <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">
                    No federated trust domain registered yet. Add the SPIRE trust domain that
                    issues this workload's SVID — its OIDC discovery endpoint must be reachable.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-name">Name</Label>
                    <Input
                      id="np-name"
                      autoComplete="off"
                      placeholder="e.g. prod-spire"
                      value={newProvider.name}
                      onChange={(e) => setNewProvider((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-issuer">Issuer URL</Label>
                    <Input
                      id="np-issuer"
                      autoComplete="off"
                      className="font-mono text-xs"
                      placeholder="http://20.41.237.163"
                      value={newProvider.issuer}
                      onChange={(e) => setNewProvider((p) => ({ ...p, issuer: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Must equal the SVID's <code className="font-mono">iss</code> exactly.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="np-td">Trust domain</Label>
                    <Input
                      id="np-td"
                      autoComplete="off"
                      className="font-mono text-xs"
                      placeholder="your-trust-domain"
                      value={newProvider.trustDomain}
                      onChange={(e) => setNewProvider((p) => ({ ...p, trustDomain: e.target.value }))}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddProvider}
                    disabled={creatingProvider}
                  >
                    {creatingProvider ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        Registering…
                      </>
                    ) : (
                      "Register trust domain"
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-provider">Trust domain (provider)</Label>
                    <Select
                      value={state.providerId}
                      onValueChange={(v) => setState((s) => ({ ...s, providerId: v }))}
                    >
                      <SelectTrigger id="wl-provider">
                        <SelectValue placeholder="Select a registered SPIRE provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {spiffeProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            {p.trust_domain && (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {p.trust_domain}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-ext-spiffe">External SPIFFE ID</Label>
                    <Input
                      id="wl-ext-spiffe"
                      autoComplete="off"
                      className="font-mono text-xs"
                      placeholder="spiffe://your-trust-domain/ns/prod/sa/api"
                      value={state.externalSpiffeId}
                      onChange={(e) => setState((s) => ({ ...s, externalSpiffeId: e.target.value }))}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Must match the SVID's <code className="font-mono">sub</code> exactly, and its
                      trust domain must match the selected provider.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 3: Install ── */}
          {step === 3 && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Workload registered</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No client secret was created. Configure SPIRE to issue this pod a JWT-SVID.
                  </p>
                </div>
                <AttestationBadge status={liveStatus ?? result.status} />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  SPIFFE ID
                </p>
                <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                  {result.spiffe_id}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  This is the workload's identity. The pod presents a short-lived JWT-SVID for this
                  SPIFFE ID instead of storing a client secret.
                </p>
              </div>

              {result.token_endpoint && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    SVID audience (token endpoint)
                  </p>
                  <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                    {result.token_endpoint}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Fetch the SVID with{" "}
                    <code className="font-mono">-audience {result.token_endpoint}</code> — it
                    must match exactly or the exchange is rejected.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Install snippet
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={copySnippet}
                  >
                    <Copy className="size-3" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="rounded-md bg-muted p-3 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {result.install_snippet}
                </pre>
              </div>

              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <RefreshCw className="size-3.5 shrink-0" />
                <span>
                  Status updates automatically once your SPIRE agent attests this workload.
                </span>
                <button
                  onClick={() => refetch()}
                  className="ml-auto text-blue-600 underline underline-offset-2 hover:text-blue-800"
                >
                  Refresh
                </button>
              </div>

              <KubernetesDeploymentChecklist status={liveStatus ?? result.status} />
            </div>
          )}
        </div>

        {/* ── footer ── */}
        <div className="border-t px-6 py-4 flex justify-between">
          {step === 3 ? (
            <>
              <span />
              <Button onClick={handleClose} className="text-white">
                Done
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={step === 0 ? handleClose : () => setStep((s) => s - 1)}
              >
                {step === 0 ? "Cancel" : "Back"}
              </Button>

              {step < 2 ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={
                    (step === 0 && !state.saName.trim()) ||
                    (step === 1 && !state.roleId)
                  }
                  className="text-white"
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleCreate}
                  disabled={
                    busy ||
                    (mode === "federated" &&
                      (!state.providerId || !state.externalSpiffeId.trim()))
                  }
                  className="text-white"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    "Register workload"
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
