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
 *
 * "Your own app" skips 2-3: the customer's client id, secret and tenant id go
 * to POST /azure/connect-custom, which proves them and stores the secret in
 * Vault only once they work. The secret is cleared from the form and the
 * request cache as soon as it was sent.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  type AzureConnectResult,
  type AzureOAuthSession,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";

const MANAGED_STEPS = ["Consent & sign in", "Review tenant", "Connected"] as const;
// Your own app has no Microsoft sign-in and nothing to review: credentials, then done.
const CUSTOM_STEPS = ["Your app's credentials", "Connected"] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERMISSION_STATE: Record<string, string> = {
  usable: "Granted",
  not_granted: "Not granted",
  denied: "Granted, but Microsoft refused it",
  license_required: "Needs a license in your tenant",
  unknown: "Granted, not confirmed",
};

/** The backend's {error, hint} as one sentence: what went wrong, then what to do. */
function apiMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { error?: string; hint?: string } })?.data;
  const parts = [data?.error, data?.hint].filter((x): x is string => !!x && x.trim() !== "");
  if (!parts.length) return fallback;
  return parts.map((x) => (/[.!?]$/.test(x.trim()) ? x.trim() : `${x.trim()}.`)).join(" ");
}

/** Can Connect act on this subscription: it accepts a role assignment, and the administrator may assign Reader (unknown counts as maybe). */
function connectable(sub: { eligible: boolean; can_assign_reader?: boolean | null }): boolean {
  return sub.eligible && sub.can_assign_reader !== false;
}

const READER_STATUS: Record<string, string> = {
  created: "Reader assigned, not readable yet",
  already_assigned: "Not readable yet",
  inherited: "Not readable yet",
  permission_denied: "Reader not assigned",
  skipped: "Skipped",
  failed: "Reader not assigned",
};

function StepRail({ step, steps }: { step: number; steps: readonly string[] }) {
  return (
    <ol className="flex items-center gap-1.5 py-1 text-[11px]">
      {steps.map((label, i) => (
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
          {i < steps.length - 1 ? <span className="text-muted-foreground">›</span> : null}
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
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"managed" | "custom">("managed");

  const statusQuery = useGetAzureOAuthStatusQuery(undefined, { skip: !open });
  const available = statusQuery.data?.available ?? false;
  // A failed check is not "not configured": say it failed, and offer a retry.
  const statusFailed = statusQuery.isError;

  const [tenantHint, setTenantHint] = useState("");

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
  const [connectCustomApp, { isLoading: customConnecting, reset: resetCustomMutation }] = useConnectAzureCustomAppMutation();
  const [connectTenant, { isLoading: connecting }] = useConnectAzureTenantMutation();
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<AzureConnectResult["data"] | null>(null);
  const busy = starting || connecting || customConnecting;
  const done = (mode === "managed" && step === 2) || (mode === "custom" && step === 1);
  // Each open of the dialog is a generation: an answer that arrives after the
  // dialog was closed (or reopened) belongs to an earlier one and is dropped.
  const generation = useRef(0);

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
      setMode("managed");
      setSessionId(sid);
      setStep(1);
      // Through react-router, so the page's own URL state does not put it back.
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("azure_session_id");
          return next;
        },
        { replace: true },
      );
    }
  }, [open, setSearchParams]);

  // When we have a session_id and move to step 1, fetch the session preview
  const [sessionAttempt, setSessionAttempt] = useState(0);
  useEffect(() => {
    if (step !== 1 || !sessionId || session) return;
    const gen = generation.current;
    setSessionLoading(true);
    setSessionError(null);
    fetchSession(sessionId)
      .unwrap()
      .then((data) => {
        if (gen !== generation.current) return;
        setSession(data);
        setSelectedSubs(new Set(data.subscriptions.filter(connectable).map((s) => s.subscription_id)));
      })
      .catch((err) => {
        if (gen !== generation.current) return;
        setSessionError(apiMessage(err, "Could not load the sign-in."));
      })
      .finally(() => {
        if (gen === generation.current) setSessionLoading(false);
      });
  }, [step, sessionId, session, fetchSession, sessionAttempt]);

  const clientIdValid = GUID.test(customClientId.trim());
  const tenantIdValid = GUID.test(customTenantId.trim());
  const customReady = clientIdValid && tenantIdValid && customClientSecret.trim() !== "";

  // "All" means every subscription Connect can act on; none of them is not "all".
  const connectableIds = (session?.subscriptions ?? []).filter(connectable).map((s) => s.subscription_id);
  const nothingConnectable = !!session && session.subscriptions.length > 0 && connectableIds.length === 0;

  const reset = () => {
    generation.current += 1;
    resetCustomMutation();
    setSessionAttempt(0);
    setStep(0);
    setMode("managed");
    setTenantHint("");
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
    const gen = generation.current;
    try {
      const result = await startOAuth({
        tenant: tenantHint.trim() || undefined,
      }).unwrap();
      if (gen !== generation.current) return;
      // Navigate to Microsoft's consent page
      window.location.href = result.authorize_url;
    } catch (err) {
      if (gen !== generation.current) return;
      setStartError(apiMessage(err as { data?: CloudOnboardingApiError }, "Could not start the Azure connection."));
    }
  };

  const handleConnect = async () => {
    if (!sessionId || busy || nothingConnectable) return;
    setConnectError(null);
    const gen = generation.current;
    try {
      const result = await connectTenant({
        session_id: sessionId,
        // "All" means every subscription Connect can act on. An empty list would
        // make the backend take every visible one, disabled ones included.
        subscription_ids: allSubs ? connectableIds : Array.from(selectedSubs),
      }).unwrap();
      if (gen !== generation.current) return;
      setConnectResult(result.data);
      onCreated();
      setStep(2);
    } catch (err) {
      if (gen !== generation.current) return;
      setConnectError(apiMessage(err, "Could not connect the tenant."));
    }
  };

  const handleStartCustom = async () => {
    if (busy || !customReady) return;
    setStartError(null);
    const gen = generation.current;
    try {
      const result = await connectCustomApp({
        client_id: customClientId.trim(),
        client_secret: customClientSecret.trim(),
        tenant_id: customTenantId.trim(),
      }).unwrap();
      if (gen !== generation.current) return;
      setConnectResult(result.data);
      onCreated();
      setStep(1);
    } catch (err) {
      if (gen !== generation.current) return;
      setStartError(apiMessage(err, "Could not connect with your app's credentials."));
    } finally {
      // The secret is not kept once it was sent: not in this form, not in the
      // request cache.
      if (gen === generation.current) {
        setCustomClientSecret("");
        resetCustomMutation();
      }
    }
  };

  const toggleSub = (subId: string) => {
    // Unticking one while "All" is on switches to picking subscriptions one by one.
    if (allSubs && session) {
      setAllSubs(false);
      setSelectedSubs(new Set(session.subscriptions.filter((s) => connectable(s) && s.subscription_id !== subId).map((s) => s.subscription_id)));
      return;
    }
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
        // Not while a request runs: its answer would have nowhere to go.
        if (!next && busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect Azure</DialogTitle>
          <DialogDescription>
            {mode === "custom"
              ? "AuthSec reads your Microsoft Entra ID tenant and Azure subscriptions with an app registration of your own. It only reads, and it assigns nothing: you give your app the access it needs. The client secret is stored encrypted in AuthSec's vault and removed when you disconnect."
              : "AuthSec reads your Microsoft Entra ID tenant and Azure subscriptions. An administrator grants it read-only access through Microsoft's own consent screen. AuthSec never receives a password, and the only change it makes is the Reader role assignment you approve."}
          </DialogDescription>
        </DialogHeader>

        <StepRail step={mode === "custom" && step === 2 ? 1 : step} steps={mode === "custom" ? CUSTOM_STEPS : MANAGED_STEPS} />

        <div className="space-y-4 py-2">
          {/* 1 — Consent & sign in */}
          {step === 0 ? (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2 rounded-lg border p-1">
                <button
                  type="button"
                  onClick={() => setMode("managed")}
                  disabled={busy}
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
                  disabled={busy}
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
                  ) : statusFailed ? (
                    <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                      <strong className="font-medium">Could not check whether Azure is available.</strong>{" "}
                      {apiMessage(statusQuery.error, "Try again.")}{" "}
                      <button type="button" className="underline" onClick={() => void statusQuery.refetch()}>
                        Retry
                      </button>
                    </div>
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
                      </div>

                      <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-2">
                        <p className="font-medium text-foreground">What happens next</p>
                        <ol className="list-decimal space-y-1 pl-4">
                          <li>Microsoft opens its admin consent page. Accept the permissions AuthSec requests.</li>
                          <li>Microsoft asks you to sign in to the tenant. This proves which tenant you administer.</li>
                          <li>You return here with a preview of the tenant and its subscriptions.</li>
                          <li>
                            Click Connect. AuthSec checks its Microsoft Graph permissions, assigns the Azure Reader role to its service
                            principal on each subscription you choose (using your sign-in), then starts the first scan.
                          </li>
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
                    Use an app registration in your own Microsoft Entra ID tenant. AuthSec signs in as that application
                    (client credentials, no user) and only reads.
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
                        disabled={busy}
                        aria-invalid={customClientId.trim() !== "" && !clientIdValid}
                      />
                      {customClientId.trim() !== "" && !clientIdValid ? (
                        <p className="text-xs text-(--color-danger-text)">
                          Enter the Application (client) ID from your app registration&apos;s Overview page: a GUID.
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="azure-custom-secret">Client secret</Label>
                      <Input
                        id="azure-custom-secret"
                        type="password"
                        value={customClientSecret}
                        onChange={(e) => setCustomClientSecret(e.target.value)}
                        placeholder="Client secret value"
                        autoComplete="new-password"
                        spellCheck={false}
                        disabled={busy}
                      />
                      <p className="text-xs text-muted-foreground">
                        The secret&apos;s Value, not its ID. It is stored only after AuthSec has proven it works.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="azure-custom-tenant">Tenant ID</Label>
                      <Input
                        id="azure-custom-tenant"
                        value={customTenantId}
                        onChange={(e) => setCustomTenantId(e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        autoComplete="off"
                        disabled={busy}
                        aria-invalid={customTenantId.trim() !== "" && !tenantIdValid}
                      />
                      {customTenantId.trim() !== "" && !tenantIdValid ? (
                        <p className="text-xs text-(--color-danger-text)">
                          Enter the Directory (tenant) ID from your app registration&apos;s Overview page: a GUID.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground">Set up the app registration first</p>

                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Microsoft Graph application permissions, with admin consent
                    </p>
                    <p className="text-[11px]">Required:</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {["Application.Read.All", "Directory.Read.All", "AuditLog.Read.All"].map((p) => (
                        <li key={p}>
                          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{p}</code>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px]">Optional. Without one, only what it reads is left out:</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Policy.Read.All</code>: app management and Conditional Access policies
                      </li>
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentity.Read.All</code>,{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentityBlueprint.Read.All</code>,{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">AgentIdentityBlueprintPrincipal.Read.All</code>: Microsoft Entra Agent ID
                        (agent identities, agent identity blueprints and their principals)
                      </li>
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">CopilotPackages.Read.All</code>: the Microsoft 365 agent registry. Its API
                        also needs a Microsoft Agent 365 license in your tenant.
                      </li>
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">AppCatalog.Read.All</code>: your organization&apos;s Teams app catalog
                        (Copilot Studio agents and custom bots published to Teams)
                      </li>
                    </ul>

                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Azure role assignment</p>
                    <p>
                      Assign the <strong className="font-medium text-foreground">Reader</strong> role to this application&apos;s service principal on each
                      subscription AuthSec should read. AuthSec checks this but does not assign it for you in this mode.
                    </p>
                    <p>
                      Optional: to list the agents inside your Microsoft Foundry projects, also give this application&apos;s service principal a Foundry
                      data-plane role that can read agents on those Foundry resources. Reader alone does not reach them.
                    </p>

                    <p>No delegated permissions are needed: this mode never signs in as a user.</p>
                  </div>

                  {startError ? (
                    <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                      <strong className="font-medium">Could not connect.</strong> {startError}
                    </div>
                  ) : null}

                  {customConnecting ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Checking your app&apos;s credentials, permissions and subscriptions. This can take a minute.
                    </p>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {/* 2 — Review tenant */}
          {step === 1 && mode === "managed" ? (
            <>
              {sessionLoading ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading tenant preview…
                </p>
              ) : sessionError ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                  <strong className="font-medium">Could not load the sign-in.</strong> {sessionError}{" "}
                  <button type="button" className="underline" onClick={() => { setSessionError(null); setSessionAttempt((n) => n + 1); }}>
                    Try again
                  </button>{" "}
                  or{" "}
                  <button type="button" className="underline" onClick={() => { setSession(null); setSessionError(null); setSessionId(null); setStep(0); }}>
                    start over with Microsoft
                  </button>
                </div>
              ) : session ? (
                <>
                  <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                    Signed in to Microsoft{session.username ? ` as ${session.username}` : ""}.
                  </div>

                  {session.already_connected ? (
                    <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                      This tenant is already connected to this workspace. Connecting again updates it; if it was connected with your
                      own app, it switches to the AuthSec app.
                    </div>
                  ) : null}

                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tenant ID</dt>
                      <dd className="font-mono">{session.tenant_id}</dd>
                    </div>
                    {session.username ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Signed in as</dt>
                        <dd>{session.username}</dd>
                      </div>
                    ) : null}
                    {session.expires_at ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Connect before</dt>
                        <dd>{new Date(session.expires_at).toLocaleTimeString()}</dd>
                      </div>
                    ) : null}
                  </dl>

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
                              if (v) setSelectedSubs(new Set(connectableIds));
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
                          const disabled = !connectable(sub);
                          const reason = !sub.eligible
                            ? sub.state || "Unavailable"
                            : sub.can_assign_reader === false
                              ? "You can't assign Reader here"
                              : null;
                          return (
                            <label
                              key={sub.subscription_id}
                              className={cn(
                                "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                                disabled && "cursor-not-allowed opacity-50",
                                !disabled && "hover:bg-(--color-surface-subtle) cursor-pointer",
                              )}
                            >
                              <Checkbox
                                checked={!disabled && (allSubs || selectedSubs.has(sub.subscription_id))}
                                disabled={disabled}
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
                                {reason ?? (sub.state || "Active")}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {nothingConnectable ? (
                      <p className="text-xs text-(--color-warning-text)">
                        None of these subscriptions can be connected: each is disabled, or your account can&apos;t assign Reader there.
                        Sign in with an account that holds Owner or User Access Administrator on them.
                      </p>
                    ) : !allSubs && selectedSubs.size === 0 && session.subscriptions.length > 0 ? (
                      <p className="text-xs text-(--color-warning-text)">
                        {session.subscriptions.length > 1 ? 'Select at least one subscription, or check "All".' : "Select the subscription to connect it."}
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
          {((mode === "managed" && step === 2) || (mode === "custom" && step === 1)) && connectResult ? (
            <div className="space-y-3">
              <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                {connectResult.tenant_created ? "Azure tenant connected." : "Azure tenant connection updated."}
              </div>
              {connectResult.warnings?.length ? (
                <ul className="space-y-1 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                  {connectResult.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Tenant</dt>
                  <dd className="font-mono">{connectResult.tenant?.scope_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Required Microsoft Graph permissions</dt>
                  <dd>
                    {(connectResult.graph_permissions ?? []).filter((g) => !g.optional && g.state === "usable").length} of{" "}
                    {(connectResult.graph_permissions ?? []).filter((g) => !g.optional).length} granted
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Optional Microsoft Graph permissions</dt>
                  <dd>
                    {(connectResult.graph_permissions ?? []).filter((g) => g.optional && g.state === "usable").length} of{" "}
                    {(connectResult.graph_permissions ?? []).filter((g) => g.optional).length} usable
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Discovery</dt>
                  <dd>{connectResult.discovery === "already_running" ? "Already running" : "Started in the background"}</dd>
                </div>
              </dl>
              {(connectResult.graph_permissions ?? []).some((g) => g.state !== "usable") ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Not usable yet (only what each reads is left out)</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {(connectResult.graph_permissions ?? [])
                      .filter((g) => g.state !== "usable")
                      .map((g) => (
                        <li key={g.name}>
                          <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{g.name}</code>:{" "}
                          {PERMISSION_STATE[g.state] ?? g.state}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              {connectResult.subscriptions?.length ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">Subscriptions</p>
                  <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-xs">
                    {connectResult.subscriptions.map((s) => (
                      <li key={s.subscription_id} className="space-y-0.5 px-2 py-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{s.display_name || s.subscription_id}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              s.reader?.verified ? "bg-(--color-success-soft) text-(--color-success-text)" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {s.reader?.verified ? "Readable" : READER_STATUS[s.reader?.status] ?? "Not readable yet"}
                          </span>
                        </div>
                        {!s.reader?.verified && (s.error || s.reader?.error) ? (
                          <p className="break-words text-muted-foreground">{s.error || s.reader?.error}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {mode === "custom"
                    ? "Your app can't read any Azure subscription yet: give it the Reader role on the subscriptions AuthSec should read, then use Rescan on the connection. The directory is discovered meanwhile."
                    : "No subscription was selected; the directory is discovered on its own."}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The first scan runs in the background and can take a few minutes. What it finds appears in Discovery under
                Microsoft Azure.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 0 || done) {
                reset();
                onOpenChange(false);
              } else {
                setStep(0);
                setSession(null);
                setSessionId(null);
              }
            }}
            disabled={busy}
          >
            {step === 0 ? "Cancel" : done ? "Close" : "Back"}
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
              disabled={!customReady || busy}
              onClick={() => void handleStartCustom()}
            >
              {customConnecting ? (
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
          ) : step === 1 && mode === "managed" ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!session || busy || nothingConnectable || (!allSubs && selectedSubs.size === 0)}
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
                navigate("/iga/discovery?provider=azure&type=identities");
              }}
            >
              <Check className="mr-1.5 size-4" />
              Open in Discovery
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
