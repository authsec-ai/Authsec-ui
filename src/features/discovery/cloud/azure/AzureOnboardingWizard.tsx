/**
 * Connect Azure — Azure onboarding wizard.
 *
 * Built against the live Azure onboarding contract (verified against
 * `controllers/platform/cloud_azure_controller.go`,
 * `services/azure_onboarding_service.go` and
 * `docs/flows/azure-onboarding.md` directly): POST
 * /azure/oauth/start → Microsoft admin consent → sign-in →
 * GET /azure/oauth/session → POST /azure/oauth/connect.
 *
 * Shape follows the existing in-Dialog step-wizard pattern
 * (AWSOnboardingWizard.tsx / GCPOnboardingWizard.tsx): local STEPS array,
 * numbered step rail, per-step conditional blocks, Back/Continue footer.
 *
 * Azure's flow is fundamentally different from AWS and GCP: there is no
 * template to deploy and no role ARN to paste back. Instead:
 *  1. Start — check availability, get the Microsoft consent URL.
 *  2. The admin-consent redirect goes to Microsoft and comes back via the
 *     callback page (AzureOAuthCallbackPage), which lands back in this app
 *     with a session_id in the route's query string.
 *  3. Review — fetch the session to preview tenant, subscriptions and
 *     Graph permissions. The admin optionally narrows which subscriptions
 *     to connect.
 *  4. Connect — sends the session_id (and optional subscription_ids) to
 *     the backend. The backend assigns Reader and starts the first scan.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useGetAzureOAuthStatusQuery,
  useStartAzureOAuthMutation,
  useLazyGetAzureOAuthSessionQuery,
  useConnectAzureTenantMutation,
  useConnectAzureCustomAppMutation,
  type AzureOAuthSession,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";

const STEPS = ["Consent & sign in", "Review tenant", "Connected"] as const;

function StepRail({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5 py-1 text-[11px]">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            className={
              i === step
                ? "flex size-5 items-center justify-center rounded-full bg-(--color-primary) text-[11px] font-semibold text-white"
                : i < step
                  ? "flex size-5 items-center justify-center rounded-full bg-(--color-success-soft) text-[11px] font-semibold text-(--color-success-text)"
                  : "flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
            }
          >
            {i < step ? "✓" : i + 1}
          </span>
          <span className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>
            {label}
          </span>
          {i < STEPS.length - 1 ? <span className="text-muted-foreground">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function AzureOnboardingWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"managed" | "custom">("managed");

  const statusQuery = useGetAzureOAuthStatusQuery(undefined, { skip: !open });
  const available = statusQuery.data?.available ?? false;

  const [tenantHint, setTenantHint] = useState("");
  const [loginHint, setLoginHint] = useState("");

  // Custom app registration fields
  const [customClientId, setCustomClientId] = useState("");
  const [customClientSecret, setCustomClientSecret] = useState("");
  const [customTenantId, setCustomTenantId] = useState("");

  const [startOAuth, { isLoading: starting }] = useStartAzureOAuthMutation();
  const [startError, setStartError] = useState<string | null>(null);

  // Session from the callback
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<AzureOAuthSession | null>(null);
  const [fetchSession] = useLazyGetAzureOAuthSessionQuery();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Subscription selection
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set());
  const [allSubs, setAllSubs] = useState(true);

  // Connect
  const [connectCustomApp] = useConnectAzureCustomAppMutation();
  const [connectTenant, { isLoading: connecting }] = useConnectAzureTenantMutation();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<{
    tenant_id: string;
    subscriptions_connected: number;
    graph_permissions_verified: string[];
  } | null>(null);

  // Listen for the callback: when the browser comes back from Microsoft,
  // AzureOAuthCallbackPage redirects to the connections page with
  // ?azure_session_id=... which ConnectionsPage picks up and reopens this wizard.
  const callbackChecked = useRef(false);
  useEffect(() => {
    if (!open || callbackChecked.current) return;
    callbackChecked.current = true;
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("azure_session_id");
    if (sid) {
      setSessionId(sid);
      setStep(1);
      // Clean up the URL
      params.delete("azure_session_id");
      const clean = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (clean ? `?${clean}` : ""));
    }
  }, [open]);

  // When we have a session_id and move to step 1, fetch the session preview
  useEffect(() => {
    if (step !== 1 || !sessionId || session) return;
    setSessionLoading(true);
    setSessionError(null);
    fetchSession(sessionId)
      .unwrap()
      .then((data) => {
        setSession(data);
        setSelectedSubs(new Set(data.subscriptions.filter((s) => s.eligible).map((s) => s.subscription_id)));
      })
      .catch((err) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? "Could not load the session.";
        setSessionError(msg);
      })
      .finally(() => setSessionLoading(false));
  }, [step, sessionId, session, fetchSession]);

  const customReady = customClientId.trim() !== "" && customClientSecret.trim() !== "" && customTenantId.trim() !== "";

  const reset = () => {
    setStep(0);
    setMode("managed");
    setTenantHint("");
    setLoginHint("");
    setCustomClientId("");
    setCustomClientSecret("");
    setCustomTenantId("");
    setStartError(null);
    setSessionId(null);
    setSession(null);
    setSessionError(null);
    setSessionLoading(false);
    setSelectedSubs(new Set());
    setAllSubs(true);
    setConnectError(null);
    setConnectResult(null);
    callbackChecked.current = false;
  };

  const handleStart = async () => {
    setStartError(null);
    try {
      const result = await startOAuth({
        tenant: tenantHint.trim() || undefined,
        login_hint: loginHint.trim() || undefined,
      }).unwrap();
      // Navigate to Microsoft's consent page
      window.location.href = result.authorize_url;
    } catch (err) {
      const apiErr = err as { data?: CloudOnboardingApiError };
      setStartError(apiErr?.data?.error ?? "Could not start the Azure connection.");
    }
  };

  const handleConnect = async () => {
    if (!sessionId) return;
    setConnectError(null);
    try {
      const result = await connectTenant({
        session_id: sessionId,
        subscription_ids: allSubs ? undefined : Array.from(selectedSubs),
      }).unwrap();
      setConnectResult(result.data);
      onCreated();
      setStep(2);
    } catch (err) {
      const apiErr = err as { data?: { error?: string; hint?: string } };
      setConnectError(apiErr?.data?.hint ?? apiErr?.data?.error ?? "Could not connect the tenant.");
    }
  };

  const handleStartCustom = async () => {
    setStartError(null);
    try {
      const result = await connectCustomApp({
        client_id: customClientId.trim(),
        client_secret: customClientSecret.trim(),
        tenant_id: customTenantId.trim(),
      }).unwrap();
      setConnectResult(result.data);
      onCreated();
      setStep(2);
    } catch (err) {
      const apiErr = err as { data?: { error?: string; hint?: string } };
      setStartError(apiErr?.data?.hint ?? apiErr?.data?.error ?? "Could not connect with the provided credentials.");
    }
  };

  const toggleSub = (subId: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Azure</DialogTitle>
          <DialogDescription>
            AuthSec connects to your Azure tenant through Microsoft's admin consent. An
            administrator grants AuthSec read-only access to Entra identities and Azure
            subscriptions — AuthSec never receives a password or creates anything in your tenant.
          </DialogDescription>
        </DialogHeader>

        <StepRail step={step} />

        <div className="space-y-4 py-2">
          {/* 1 — Consent & sign in */}
          {step === 0 ? (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setMode("managed")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    mode === "managed"
                      ? "bg-(--color-primary) text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ShieldCheck className="size-3.5" />
                  Use AuthSec app
                </button>
                <button
                  type="button"
                  onClick={() => setMode("custom")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                    mode === "custom"
                      ? "bg-(--color-primary) text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <KeyRound className="size-3.5" />
                  Your own app registration
                </button>
              </div>

              {mode === "managed" ? (
                <>
                  {statusQuery.isLoading ? (
                    <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Checking Azure availability…
                    </p>
                  ) : !available ? (
                    <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                      <strong className="font-medium">Azure discovery isn't configured on this deployment.</strong>{" "}
                      The AuthSec app registration is not set up. This is a deployment configuration
                      problem, not something to fix in your Azure tenant.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="azure-tenant">Tenant ID or domain (optional)</Label>
                          <Input
                            id="azure-tenant"
                            value={tenantHint}
                            onChange={(e) => setTenantHint(e.target.value)}
                            placeholder="contoso.onmicrosoft.com or a tenant id"
                            autoComplete="off"
                          />
                          <p className="text-xs text-muted-foreground">
                            Leave blank to let the administrator's account decide which tenant to consent in.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="azure-hint">Login hint (optional)</Label>
                          <Input
                            id="azure-hint"
                            value={loginHint}
                            onChange={(e) => setLoginHint(e.target.value)}
                            placeholder="admin@contoso.onmicrosoft.com"
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-2">
                        <p className="font-medium text-foreground">What happens next</p>
                        <ol className="list-decimal space-y-1 pl-4">
                          <li>Microsoft opens its admin consent page. Accept the permissions AuthSec requests.</li>
                          <li>Microsoft asks you to sign in to the tenant. This proves which tenant you administer.</li>
                          <li>You return here with a preview of the tenant, its subscriptions and the Graph permissions granted.</li>
                          <li>Click Connect. AuthSec assigns itself Reader on each subscription (as the signed-in administrator) and starts the first scan.</li>
                        </ol>
                      </div>

                      {startError ? (
                        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                          <strong className="font-medium">Could not start.</strong> {startError}
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Register your own Entra app and provide its credentials. AuthSec will use them
                    to discover identities and subscriptions in your tenant.
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="azure-custom-client-id">Application (client) ID</Label>
                      <Input
                        id="azure-custom-client-id"
                        value={customClientId}
                        onChange={(e) => setCustomClientId(e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="azure-custom-secret">Client secret</Label>
                      <Input
                        id="azure-custom-secret"
                        type="password"
                        value={customClientSecret}
                        onChange={(e) => setCustomClientSecret(e.target.value)}
                        placeholder="Client secret value"
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="azure-custom-tenant">Tenant ID</Label>
                      <Input
                        id="azure-custom-tenant"
                        value={customTenantId}
                        onChange={(e) => setCustomTenantId(e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">Required API permissions</p>

                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Azure Service Management</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">user_impersonation</code> <span className="text-[10px] text-muted-foreground">(Delegated)</span></li>
                    </ul>

                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Microsoft Graph — Application</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">Application.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">Directory.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">AuditLog.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">Policy.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentity.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentityBlueprint.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentityBlueprintPrincipal.Read.All</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">CopilotPackages.Read.All</code></li>
                    </ul>

                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Microsoft Graph — Delegated</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">openid</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">profile</code></li>
                      <li><code className="rounded bg-muted px-1 py-0.5 text-[10px]">User.Read</code></li>
                    </ul>

                    <p>Grant admin consent for all permissions in the Azure portal before connecting.</p>
                  </div>

                  {startError ? (
                    <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                      <strong className="font-medium">Could not connect.</strong> {startError}
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {/* 2 — Review tenant */}
          {step === 1 ? (
            <>
              {sessionLoading ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading tenant preview…
                </p>
              ) : sessionError ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                  <strong className="font-medium">Session expired or invalid.</strong> {sessionError}{" "}
                  <button className="underline" onClick={() => { setSession(null); setSessionError(null); setStep(0); }}>
                    Start again
                  </button>
                </div>
              ) : session ? (
                <>
                  <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                    Admin consent granted. Signed in as {session.signed_in_as}.
                  </div>

                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tenant</dt>
                      <dd className="font-mono">{session.tenant_display_name || session.tenant_id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tenant ID</dt>
                      <dd className="font-mono">{session.tenant_id}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Signed in as</dt>
                      <dd>{session.signed_in_as}</dd>
                    </div>
                  </dl>

                  {/* Graph permissions */}
                  {session.graph_permissions?.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">Graph permissions</p>
                      <div className="grid gap-1">
                        {session.graph_permissions.map((p) => (
                          <div key={p.name} className="flex items-center gap-2 text-xs">
                            {p.granted ? (
                              <ShieldCheck className="size-3.5 text-(--color-success-text)" />
                            ) : (
                              <span className="size-3.5 rounded-full border border-dashed border-muted-foreground" />
                            )}
                            <span className={p.granted ? "text-foreground" : "text-muted-foreground line-through"}>
                              {p.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Subscriptions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">
                        Subscriptions ({session.subscriptions.length})
                      </p>
                      {session.subscriptions.length > 1 ? (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={allSubs}
                            onCheckedChange={(v) => {
                              setAllSubs(!!v);
                              if (v) setSelectedSubs(new Set(session.subscriptions.filter((s) => s.eligible).map((s) => s.subscription_id)));
                            }}
                          />
                          All
                        </label>
                      ) : null}
                    </div>
                    {session.subscriptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No subscriptions visible. The administrator may not have access to any, or
                        the tenant has none. Graph discovery will still work.
                      </p>
                    ) : (
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                        {session.subscriptions.map((sub) => {
                          const disabled = !sub.eligible;
                          return (
                            <label
                              key={sub.subscription_id}
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                                disabled && "cursor-not-allowed opacity-50",
                                !disabled && !allSubs && "hover:bg-(--color-surface-subtle) cursor-pointer",
                              )}
                            >
                              <Checkbox
                                checked={!disabled && (allSubs || selectedSubs.has(sub.subscription_id))}
                                disabled={allSubs || disabled}
                                onCheckedChange={() => !disabled && toggleSub(sub.subscription_id)}
                              />
                              <div className="flex-1 truncate">
                                <span className="font-medium">{sub.display_name}</span>
                                <span className="ml-2 font-mono text-muted-foreground">{sub.subscription_id}</span>
                              </div>
                              <span className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                disabled
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-(--color-success-soft) text-(--color-success-text)",
                              )}>
                                {sub.state || (disabled ? "Unavailable" : "Active")}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {!allSubs && selectedSubs.size === 0 && session.subscriptions.length > 0 ? (
                      <p className="text-xs text-(--color-warning-text)">
                        Select at least one subscription, or leave "All" checked.
                      </p>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Connect assigns AuthSec Reader on each selected subscription (as you, the
                    signed-in administrator) and starts the first discovery scan. Nothing is
                    installed in your tenant.
                  </p>

                  {connectError ? (
                    <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                      <strong className="font-medium">Connection failed.</strong> {connectError}
                    </div>
                  ) : null}

                  {connecting ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Assigning Reader and verifying — this can take a moment.
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}

          {/* 3 — Connected */}
          {step === 2 && connectResult ? (
            <div className="space-y-3">
              <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                Azure tenant connected.
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tenant</dt>
                  <dd className="font-mono">{connectResult.tenant_id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subscriptions connected</dt>
                  <dd>{connectResult.subscriptions_connected}</dd>
                </div>
                {connectResult.graph_permissions_verified?.length ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Graph permissions</dt>
                    <dd>{connectResult.graph_permissions_verified.length} granted</dd>
                  </div>
                ) : null}
              </dl>
              <p className="text-xs text-muted-foreground">
                The first scan is running in the background. Open this tenant from the Connections
                list to follow it.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 0 || step === 2) {
                reset();
                onOpenChange(false);
              } else {
                setStep(0);
                setSession(null);
                setSessionId(null);
              }
            }}
            disabled={connecting}
          >
            {step === 0 ? "Cancel" : step === 2 ? "Close" : "Back"}
          </Button>

          {step === 0 && mode === "managed" ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!available || starting || statusQuery.isLoading}
              onClick={() => void handleStart()}
            >
              {starting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Opening Microsoft…
                </>
              ) : (
                <>
                  <ExternalLink className="mr-1.5 size-4" />
                  Open Microsoft consent
                </>
              )}
            </Button>
          ) : step === 0 && mode === "custom" ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!customReady || starting}
              onClick={() => void handleStartCustom()}
            >
              {starting ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <KeyRound className="mr-1.5 size-4" />
                  Connect with credentials
                </>
              )}
            </Button>
          ) : step === 1 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!session || connecting || (!allSubs && selectedSubs.size === 0)}
              onClick={() => void handleConnect()}
            >
              {connecting ? "Connecting…" : "Connect tenant"}
            </Button>
          ) : (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              <Check className="mr-1.5 size-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
