/**
 * CreateAPICredentialWizard
 *
 * 5-step Sheet wizard for the secret/key M2M path.
 * Step 1: Name the machine caller
 * Step 2: Choose role
 * Step 3: Choose credential type
 * Step 4: Simulate (dry-run token test)
 * Step 5: Finish — curl snippet
 */

import { useState } from "react";
import { CheckCircle2, Loader2, Copy, Terminal, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";

import { useListRSRolesQuery } from "@/app/api/setupWizardApi";
import {
  useCreateAPICredentialMutation,
  useSimulateTokenMutation,
  type SimulateCheck,
  type CreateAPICredentialResponse,
} from "@/app/api/agentIdentityApi";
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

// ── types ──────────────────────────────────────────────────────────────────────

type CredType = "client_secret" | "private_key_jwt";

interface WizardState {
  saName: string;
  saId: string;
  roleId: string;
  credType: CredType;
  jwksUri: string;
}

// ── step progress bar ──────────────────────────────────────────────────────────

const STEPS = [
  "Caller",
  "Role",
  "Credential",
  "Test",
  "Finish",
];

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 px-6 py-4 border-b border-slate-200">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex items-center gap-1 min-w-0">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-500",
              )}
            >
              {done ? <CheckCircle2 className="size-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "truncate text-xs font-medium",
                active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="h-px w-4 shrink-0 bg-slate-200" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── check row ──────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: SimulateCheck }) {
  const pass = check.status === "pass";
  return (
    <div className={cn(
      "flex items-start gap-2 rounded-md border p-2.5 text-sm",
      pass ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
    )}>
      {pass ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
      )}
      <div className="min-w-0">
        <p className={cn("font-medium", pass ? "text-emerald-800" : "text-red-800")}>
          {check.name.replace(/_/g, " ")}
        </p>
        {check.reason && (
          <p className="mt-0.5 text-xs text-slate-600">{check.reason}</p>
        )}
      </div>
    </div>
  );
}

// ── wizard component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}

export default function CreateAPICredentialWizard({ open, onOpenChange, rsId }: Props) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    saName: "",
    saId: "",
    roleId: "",
    credType: "client_secret",
    jwksUri: "",
  });
  const [result, setResult] = useState<CreateAPICredentialResponse | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !open });
  const [createCredential, { isLoading: creating }] = useCreateAPICredentialMutation();
  const [simulate, { isLoading: simulating, data: simResult }] = useSimulateTokenMutation();

  const labelRole = (name: string) => {
    const raw = name.includes(":") ? name.split(":").pop() || name : name;
    return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const selectedRole = rolesData?.roles.find((r) => r.id === state.roleId);

  const handleClose = () => {
    setStep(0);
    setState({ saName: "", saId: "", roleId: "", credType: "client_secret", jwksUri: "" });
    setResult(null);
    setSecretCopied(false);
    onOpenChange(false);
  };

  // Step 3 → create credential + step 4 simulate in sequence
  const handleCreateAndSimulate = async () => {
    try {
      const res = await createCredential({
        rsId,
        service_account_name: state.saName || undefined,
        service_account_id: state.saId || undefined,
        role_id: state.roleId,
        // Map to the backend's credential-path fields (no credential_type).
        use_client_secret: state.credType === "client_secret",
        jwks_uri:
          state.credType === "private_key_jwt" && state.jwksUri
            ? state.jwksUri
            : undefined,
      }).unwrap();
      setResult(res);

      // immediately run simulate with the new SA + role
      await simulate({
        rsId,
        service_account_id: res.service_account_id,
        role_id: res.role_id,
      });

      setStep(4);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't create credential.");
    }
  };

  const handleRunSimulate = async () => {
    if (!state.roleId) return;
    await simulate({ rsId, role_id: state.roleId });
    setStep(4);
  };

  const copyToClipboard = (text: string, label = "Copied") => {
    void navigator.clipboard.writeText(text).then(() => toast.success(label));
  };

  // The M2M token call uses HTTP Basic auth (client_secret_basic) — the backend
  // does NOT read client_id/client_secret from the form body — and requires the
  // `resource` parameter. The private_key_jwt path swaps Basic for a client_assertion.
  const curlSnippet = result
    ? result.client_secret
      ? `curl -X POST "${result.token_endpoint}" \\
  -u "${result.client_id}:${result.client_secret}" \\
  -d "grant_type=client_credentials" \\
  -d "resource=${result.resource}"`
      : `curl -X POST "${result.token_endpoint}" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials" \\
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \\
  -d "client_assertion=<signed_jwt>" \\
  -d "resource=${result.resource}"`
    : "";

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="flex h-full flex-col overflow-hidden p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5 text-left">
          <SheetTitle className="text-xl font-semibold text-slate-950">
            Create machine credential
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-600">
            Use this only when the caller cannot use Kubernetes workload identity. This creates a
            client secret or private-key JWT credential.
          </SheetDescription>
        </SheetHeader>

        <StepProgress current={step} />

        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5">

              {/* Step 0: Caller */}
              {step === 0 && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Name the machine caller</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      AuthSec creates an internal machine identity for this caller and attaches the
                      credential you choose later.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sa-name">Caller name</Label>
                <Input
                  id="sa-name"
                  autoComplete="off"
                  placeholder="e.g. github-ci, ticket-bot"
                  value={state.saName}
                  onChange={(e) => setState((s) => ({ ...s, saName: e.target.value, saId: "" }))}
                    />
                    <p className="text-[11px] text-slate-400">
                      For Kubernetes pods, prefer "Connect Kubernetes workload" so no long-lived secret
                      is created.
                    </p>
                  </div>
                </div>
          )}

          {/* Step 1: Role */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                    <h3 className="text-sm font-semibold text-slate-900">Choose a role</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      The role defines which scopes this machine credential can use on this server.
                    </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-select">Role</Label>
                <Select
                  value={state.roleId}
                  onValueChange={(v) => setState((s) => ({ ...s, roleId: v }))}
                >
                  <SelectTrigger id="role-select">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(rolesData?.roles ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {labelRole(r.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedRole && (
                <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-medium text-slate-900">{labelRole(selectedRole.name)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedRole.permissions ?? 0} scope{selectedRole.permissions !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Credential type */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                    <h3 className="text-sm font-semibold text-slate-900">Choose credential type</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      These are secret-bearing methods. Use them for servers, CI jobs, or local agents
                      that cannot use SPIFFE/SPIRE.
                    </p>
              </div>
              {(["client_secret", "private_key_jwt"] as CredType[]).map((ctype) => {
                const selected = state.credType === ctype;
                return (
                  <button
                    key={ctype}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, credType: ctype }))}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border p-3 text-left",
                      selected ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200" : "border-slate-200 bg-white",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                        selected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white",
                      )}
                      aria-hidden
                    >
                      {selected && <span className="size-1.5 rounded-full bg-white" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {ctype === "client_secret" ? "Client secret" : "Private key JWT"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ctype === "client_secret"
                          ? "Shared secret shown once. Store it securely — it cannot be retrieved later."
                          : "Your private key signs assertions. More secure; requires key management."}
                      </p>
                    </div>
                  </button>
                );
              })}
              {state.credType === "private_key_jwt" && (
                <div className="space-y-1.5">
                  <Label htmlFor="jwks-uri" className="text-xs">
                    JWKS URI
                  </Label>
                  <Input
                    id="jwks-uri"
                    autoComplete="off"
                    placeholder="https://your-service.example.com/.well-known/jwks.json"
                    value={state.jwksUri}
                    onChange={(e) => setState((s) => ({ ...s, jwksUri: e.target.value }))}
                  />
                  <p className="text-xs text-slate-500">
                    AuthSec fetches your public keys from this URL to verify signed assertions.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Simulate / create */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Test before creating</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    This dry-run checks whether a token would mint correctly for this machine caller
                    and role. No token is issued and no credential is created yet.
                  </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">Caller</span>
                  <span className="font-medium text-slate-900">{state.saName || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs">Role</span>
                  <span className="font-medium text-slate-900">
                    {selectedRole ? labelRole(selectedRole.name) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs">Credential</span>
                  <span className="font-medium text-slate-900">
                    {state.credType === "client_secret" ? "Client secret" : "Private key JWT"}
                  </span>
                </div>
              </div>
              {simResult && (
                <div className="space-y-2">
                  <div className={cn(
                    "flex items-center gap-2 rounded-md border p-3",
                    simResult.would_mint ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
                  )}>
                    {simResult.would_mint
                      ? <CheckCircle2 className="size-5 text-emerald-600" />
                      : <AlertTriangle className="size-5 text-red-600" />}
                    <div>
                      <p className={cn("text-sm font-semibold", simResult.would_mint ? "text-emerald-800" : "text-red-800")}>
                        {simResult.would_mint ? "Token would mint" : "Token would not mint"}
                      </p>
                      {simResult.would_mint && (
                        <p className="text-xs text-emerald-700">
                          Scopes: {simResult.effective_scopes.join(", ")} · expires in {simResult.expires_in}s
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {simResult.checks.map((c) => <CheckRow key={c.name} check={c} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Finish */}
          {step === 4 && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Machine credential created</p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    <strong>{result.service_account_name}</strong> can now request short-lived access
                    tokens using this credential.
                  </p>
                </div>
              </div>

              {result.client_secret && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Client secret</Label>
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      Shown once — save it now
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white">
                    <code className="flex-1 truncate px-3 py-2 text-xs font-mono text-slate-900">
                      {result.client_secret}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        copyToClipboard(result.client_secret!, "Secret copied");
                        setSecretCopied(true);
                      }}
                    >
                      {secretCopied ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Token request (curl)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => copyToClipboard(curlSnippet, "Snippet copied")}
                  >
                    <Copy className="mr-1 size-3" />
                    Copy
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-950">
                  <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                    <Terminal className="size-3 text-slate-400" />
                    <span className="text-[11px] text-slate-400">shell</span>
                  </div>
                  <pre className="overflow-x-auto px-3 py-3 text-[11px] text-emerald-400 leading-relaxed">
                    {curlSnippet}
                  </pre>
                </div>
              </div>

              {simResult && (
                <div className={cn(
                  "flex items-center gap-2 rounded-md border p-3",
                  simResult.would_mint ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
                )}>
                  {simResult.would_mint
                    ? <CheckCircle2 className="size-4 text-emerald-600" />
                    : <AlertTriangle className="size-4 text-amber-600" />}
                  <p className={cn("text-xs font-medium", simResult.would_mint ? "text-emerald-800" : "text-amber-800")}>
                    {simResult.would_mint
                      ? `Simulation passed · scopes: ${simResult.effective_scopes.join(", ")}`
                      : "Simulation flagged an issue — check the Access tab before deploying."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
          {step === 4 ? (
            <>
              <span />
              <Button onClick={handleClose} className="text-white">Done</Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  if (step === 0) handleClose();
                  else setStep((s) => s - 1);
                }}
              >
                {step === 0 ? "Cancel" : "Back"}
              </Button>

              {step === 3 ? (
                <div className="flex items-center gap-2">
                  {!simResult && (
                    <Button
                      variant="outline"
                      onClick={handleRunSimulate}
                      disabled={simulating}
                    >
                      {simulating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                      {simulating ? "Testing…" : "Run test"}
                    </Button>
                  )}
                  <Button
                    onClick={handleCreateAndSimulate}
                    disabled={creating || simulating}
                    className="text-white"
                  >
                    {creating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    {creating ? "Creating…" : "Create credential"}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={
                    (step === 0 && !state.saName.trim()) ||
                    (step === 1 && !state.roleId)
                  }
                  className="text-white"
                >
                  Continue
                </Button>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
