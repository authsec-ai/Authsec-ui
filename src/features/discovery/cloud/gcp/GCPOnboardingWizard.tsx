/**
 * Connect Google Cloud — GCP onboarding wizard.
 *
 * Built strictly against the live GCP-01–04 contract (verified against
 * `controllers/platform/cloud_gcp_controller.go` directly): GET
 * /gcp/onboarding, POST /gcp/connectors. Nothing here calls a GCP endpoint
 * that doesn't exist — no scan trigger, no discovery step, no
 * reconnect/revoke UI yet (those belong to connector detail, a later stage).
 *
 * Redesigned for a first-time user who should not need to understand GCP
 * Workload Identity Federation internals to connect. Two things had to hold
 * for each simplification below, checked against code, not assumed:
 *
 *  - Reader SA email is auto-derived, never asked for. `setup-reader.sh`
 *    hardcodes the service account name as "authsec-reader" (not
 *    customer-chosen), so `authsec-reader@{reader_project_id}.iam.gserviceaccount.com`
 *    is fully computable client-side the moment reader_project_id is known.
 *  - The WIF provider resource CANNOT be similarly derived or eliminated —
 *    verified directly against `internal/gcp/credentials.go`'s
 *    `ResolveWIFCredential` (line ~174-227): it's a required parameter used
 *    to build the STS audience, and the only missing input (the reader
 *    project's numeric GCP project number) requires a GCP credential AuthSec
 *    doesn't have until this very value is known. So exactly one paste-back
 *    field remains — no backend/script change was made to shorten it.
 *
 * Internal status markers (e.g. GCP-01's "candidate_pending_GCP-01" role-set
 * status) are deliberately never customer-facing — that's an implementation-
 * readiness marker for the team, not something a customer needs to see. This
 * includes the backend-rendered setup script itself, which embeds that
 * status in a header comment; `stripInternalStatusLine` removes it
 * client-side before the script is ever displayed, copied, or opened in
 * Cloud Shell (no backend/template change was made for this).
 *
 * The backend renders one script covering both auth methods. Testing found
 * that running the whole thing (as a customer reasonably would, via "copy
 * setup command") executes Workload Identity Federation's commands even for
 * a customer who only wants JSON key, and `set -euo pipefail` aborts the
 * entire script on WIF's first failure — which, in any environment whose
 * AuthSec issuer isn't HTTPS-reachable (this dev deployment included),
 * always fails at the OIDC-provider-creation step. `methodSpecificScript`
 * splits the script so each method only ever sees its own commands.
 *
 * Error copy states only what the backend's {error, hint, fault} envelope
 * actually says — never an invented cause ("transient", etc.) the backend
 * doesn't assert.
 *
 * Shape follows the existing in-Dialog step-wizard pattern
 * (DeployCollectorWizard.tsx / GitHubSetupWizard.tsx): local STEPS array,
 * numbered step rail, per-step conditional blocks, Back/Continue footer.
 *
 * Never exposes: the uploaded JSON key value, Vault paths, or any raw
 * credential — the create-connector response has no field that could hold
 * one, and this component does not attempt to redisplay what was typed.
 */

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Terminal } from "lucide-react";

import { GoogleProjectPicker } from "./GoogleProjectPicker";
import { GoogleOAuthProgress } from "./GoogleOAuthProgress";
import { openGoogleOAuthPopup } from "./googleOAuthPopup";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useLazyGetGcpOnboardingPackageQuery,
  useCreateGcpConnectorMutation,
  useGetGoogleOAuthStatusQuery,
  useStartGoogleOAuthMutation,
  useLazyListGoogleProjectsQuery,
  usePreflightGoogleOAuthMutation,
  useProvisionGoogleOAuthMutation,
  type GCPScopeKind,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";

const STEPS = ["Authentication", "Scope", "Setup", "Connected"] as const;

const SCOPE_KIND_LABEL: Record<GCPScopeKind, string> = {
  project: "project",
  folder: "folder",
  org: "organization",
};

function readerSaEmailFor(readerProjectId: string): string {
  return `authsec-reader@${readerProjectId}.iam.gserviceaccount.com`;
}

/** The backend-rendered script's header comment includes a
 * `# Role set status: candidate_pending_GCP-01`-style line — an internal
 * implementation-readiness marker, not something a customer needs to see.
 * Stripped client-side; no backend/template change made for this. */
function stripInternalStatusLine(script: string): string {
  return script
    .split("\n")
    .filter((line) => !line.startsWith("# Role set status:"))
    .join("\n");
}

interface ScriptSections {
  preamble: string;
  optionA: string;
  optionB: string;
}

/**
 * The backend always renders ONE script containing both auth methods'
 * commands back to back (`setup-reader.sh`: shared SA-creation/role-grant
 * preamble, then an "Option A (recommended): Workload Identity Federation"
 * block, then an "Option B (fallback): JSON key upload" block). Split on
 * those two banner markers so each auth method gets only its own commands —
 * never both options in one script a customer might run start to finish.
 * Returns null if the markers aren't found in the expected order, so the
 * caller can fall back to the full script rather than guess at a cut point
 * and risk silently handing back a wrong/truncated one.
 */
function splitScriptSections(script: string): ScriptSections | null {
  const optionAMarker = "Option A (recommended)";
  const optionBMarker = "Option B (fallback)";
  const optionAIdx = script.indexOf(optionAMarker);
  const optionBIdx = script.indexOf(optionBMarker);
  if (optionAIdx === -1 || optionBIdx === -1 || optionBIdx < optionAIdx) return null;

  const bannerStart = (markerIndex: number) => {
    const border = 'echo "####';
    const idx = script.slice(0, markerIndex).lastIndexOf(border);
    return idx === -1 ? markerIndex : idx;
  };

  const aStart = bannerStart(optionAIdx);
  const bStart = bannerStart(optionBIdx);

  return {
    preamble: script.slice(0, aStart).trimEnd(),
    optionA: script.slice(aStart, bStart).trimEnd(),
    optionB: script.slice(bStart).trimEnd(),
  };
}

/**
 * The setup script actually shown/copied/opened in Cloud Shell for a given
 * auth method — shared preamble plus ONLY that method's commands. This is
 * what fixes the real failure mode found in testing: a customer running the
 * full combined script hits Workload Identity Federation's commands even
 * when they only wanted JSON key (or vice versa), and `set -euo pipefail`
 * aborts the whole thing on the first failure. Splitting by method means a
 * JSON-key run never touches WIF's commands at all, and a WIF run never
 * shows irrelevant JSON-key steps.
 */
function methodSpecificScript(fullScript: string, method: "wif" | "json_key"): string {
  const cleaned = stripInternalStatusLine(fullScript);
  const sections = splitScriptSections(cleaned);
  if (!sections) return cleaned;
  const chosen = method === "wif" ? sections.optionA : sections.optionB;
  return `${sections.preamble}\n\n${chosen}\n`;
}

// Google's "Open in Cloud Shell" custom-URL feature (cloudshell_git_repo,
// cloudshell_print, etc. — docs.cloud.google.com/shell/docs/open-in-cloud-shell)
// requires cloning a git repo; there is no documented way to pass inline
// script text or a target project via that URL, and nothing pre-fills or
// auto-runs a command in the terminal. Hosting a public repo just to carry a
// per-workspace, per-scope dynamically-derived script would be a backend/infra
// change made purely for this UX, which was explicitly ruled out. So this
// links to plain Cloud Shell instead (docs.cloud.google.com/shell/docs/launching-cloud-shell)
// — no repo needed, auto-authenticates as whichever Google account is signed
// in, zero local setup. The setup script itself already scopes every gcloud
// call with an explicit --project=, so there's no "wrong project" risk even
// without a pre-selected one.
const CLOUD_SHELL_URL = "https://shell.cloud.google.com/?show=terminal";

// Keyed on the exact sentinel-error text the backend returns (`err.Error()`
// in mapGCPOnboardingError, controllers/platform/cloud_gcp_controller.go) —
// not an invented code. Data, not inline conditionals, so a future added
// fault is a table edit. Falls back to the server's own `hint`, then the raw
// error string, if a code isn't in this table yet. No entry here ever claims
// a cause ("transient", etc.) the backend doesn't itself assert.
const GCP_ERROR_COPY: Record<string, string> = {
  "gcp: scope_kind, scope_id or reader_project_id is invalid":
    "AuthSec couldn't validate the scope details. Check the project/folder/organization ID and reader project for typos.",
  "gcp: the claimed scope could not be read with this credential":
    "The reader identity can't read this scope yet. Confirm the setup command finished, and that the granted roles match this exact scope.",
  "gcp: the workload identity pool, provider or binding does not match what was derived":
    "AuthSec couldn't match the value you pasted to what it expects for this scope. Re-run the setup command and paste the value it prints again, exactly as shown.",
  "gcp: the service account key is malformed or unusable":
    "That file doesn't look like a valid Google Cloud service account key. Download it again from Google Cloud and upload it unmodified.",
  "gcp: permission denied":
    "Google Cloud denied the read request. Confirm the roles from the setup command were granted at this exact scope.",
  // Distinct from "does not match what was derived" above — AuthSec already
  // re-checked the pasted value and it was correct; this means Google Cloud
  // itself couldn't reach the issuer the WIF provider trusts (e.g. a local
  // development tunnel that's gone offline since the provider was created).
  // Re-pasting the same value again will not fix this.
  "gcp: google cloud could not reach the configured wif issuer to complete the credential exchange":
    "AuthSec confirmed the pasted value is correct, but Google Cloud couldn't reach the Workload Identity Federation issuer to finish verifying it. If this deployment uses a local development tunnel, confirm it's still running and matches what the WIF provider was created with.",
};

// "gcp: the credential exchange was rejected" is handled separately, not in
// the flat table above: it's a SHARED error code between WIF and JSON key
// (classifyIAMError's own comment — an "invalid_grant" response can come
// from either path's underlying OAuth2 token acquisition, meaning different
// things on each). The table's single WIF-worded entry was live-tested and
// found wrong for JSON key — it told a JSON-key user to check a "Workload
// Identity Provider," which doesn't apply to them at all. The JSON-key
// wording below states a real, personally-verified GCP behavior (a freshly
// minted key rejected once, then accepted ~15s later on an identical retry,
// no other change) as a possibility to check, not an assertion the backend
// itself made — kept conditional ("if you just created this key"), never
// stated as certain.
function credentialExchangeRejectedCopy(authMethod: "wif" | "json_key"): string {
  return authMethod === "wif"
    ? "AuthSec couldn't exchange the credential with Google Cloud. Confirm the Workload Identity Provider is configured with the AuthSec issuer shown in the setup command, then try again."
    : "Google Cloud rejected this key. If you just created it, it can take a few seconds to become usable — wait a moment and try again. Otherwise, confirm you uploaded the correct, unmodified key file.";
}

/** Google Authentication's own errors don't have a per-code copy table like
 * GCP_ERROR_COPY above (WIF/JSON-key's backend error set is small and
 * stable; this option's isn't yet) — this just turns the backend's
 * `{error, hint}` into one readable sentence: the sanitized error text
 * (its "gcp: " prefix stripped, capitalized) plus the hint, when present. */
/**
 * Turns whatever RTK Query threw into something worth showing.
 *
 * The previous version was `apiErr ?? { error: "Could not connect to Google
 * Cloud." }`, which quietly collapsed three very different failures into one
 * unhelpful sentence — because only an HTTP error response carries `data`.
 * A timeout, a dropped connection and a CORS rejection all arrive with `data`
 * undefined, so the operator saw "Could not connect to Google Cloud" whether
 * the backend had rejected the request, never answered, or was never reached.
 *
 * Each case now says what actually happened and what to do next.
 */
function describeSubmitFailure(err: unknown): CloudOnboardingApiError {
  const e = err as { status?: number | string; data?: CloudOnboardingApiError; error?: string } | undefined;

  // An error response from the backend: it already carries {error, hint, fault}.
  if (e?.data && typeof e.data === "object" && "error" in e.data) {
    return e.data;
  }

  switch (e?.status) {
    case "TIMEOUT_ERROR":
      return {
        error: "Setting up the connection took longer than expected.",
        hint:
          "AuthSec may still have finished configuring your Google Cloud project. " +
          "Close this and check your connectors before trying again — if the connector " +
          "is not there, click Connect once more.",
        fault: "gcp",
      };
    case "FETCH_ERROR":
      return {
        error: "Could not reach AuthSec.",
        hint: "Check that the AuthSec backend is running and reachable from this browser, then try again.",
        fault: "authsec",
      };
    case "PARSING_ERROR":
      return {
        error: "AuthSec returned a response this page could not read.",
        hint: "This is an AuthSec-side problem — check the server logs.",
        fault: "authsec",
      };
    default:
      return {
        error: "Could not connect to Google Cloud.",
        hint: typeof e?.error === "string" ? e.error : undefined,
      };
  }
}
function googleOAuthErrorCopy(apiErr: CloudOnboardingApiError | undefined, fallback: string): string {
  if (!apiErr) return fallback;
  const raw = apiErr.error?.replace(/^gcp:\s*/, "").trim();
  const sentence = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  if (sentence && apiErr.hint) return `${sentence} — ${apiErr.hint}`;
  return sentence || apiErr.hint || fallback;
}

function errorCopy(
  apiErr: CloudOnboardingApiError | undefined,
  fallback: string,
  authMethod: "wif" | "json_key",
): string {
  if (!apiErr) return fallback;
  if (apiErr.error.startsWith("gcp: the credential exchange was rejected")) {
    return credentialExchangeRejectedCopy(authMethod);
  }
  // Prefix match, not exact — live testing against the running backend
  // confirmed every mapped error appends extra detail after the base
  // sentinel text (e.g. "...does not match what was derived: the pasted
  // provider_resource does not match..."), so an exact-equality lookup
  // silently misses every real response and falls through to the raw hint.
  const matchedKey = Object.keys(GCP_ERROR_COPY).find((key) => apiErr.error.startsWith(key));
  if (matchedKey) return GCP_ERROR_COPY[matchedKey];
  return apiErr.hint ?? apiErr.error ?? fallback;
}

/**
 * Run setup — Cloud Shell is the recommended path (no local gcloud install,
 * no choosing between CMD/PowerShell/WSL/etc.), with copy-to-your-own-terminal
 * as an explicit fallback. Neither path executes anything automatically:
 * Cloud Shell requires the customer to paste and press Enter themselves —
 * AuthSec never runs a privileged command in the customer's GCP account from
 * the browser. See CLOUD_SHELL_URL's comment for why this links to plain
 * Cloud Shell rather than the git-repo-based "Open in Cloud Shell" button.
 */
function RunSetupSection({ code }: { code: string }) {
  const [cloudShellJustCopied, setCloudShellJustCopied] = useState(false);
  const [fallbackCopied, setFallbackCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copyToClipboard = () => void navigator.clipboard.writeText(code);

  return (
    <div className="space-y-2">
      <Label>Run setup</Label>

      <Button
        className="flex w-full items-center justify-center gap-2 text-[length:var(--text-sm)] text-white"
        onClick={() => {
          copyToClipboard();
          setCloudShellJustCopied(true);
          window.setTimeout(() => setCloudShellJustCopied(false), 4000);
          window.open(CLOUD_SHELL_URL, "_blank", "noopener,noreferrer");
        }}
      >
        <Terminal className="size-4" />
        {cloudShellJustCopied ? "Command copied — opening Cloud Shell…" : "Open Google Cloud Shell & Set Up"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Opens a terminal in your browser, already signed in as your Google account — nothing to
        install or configure locally. In the new tab: paste the command that was just copied
        (<span className="font-mono">Ctrl/Cmd+V</span>), review it, then press Enter to run it
        yourself. AuthSec never runs anything in your Google Cloud account directly.
      </p>

      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          onClick={() => {
            copyToClipboard();
            setFallbackCopied(true);
            window.setTimeout(() => setFallbackCopied(false), 1600);
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          {fallbackCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {fallbackCopied ? "Copied" : "Copy setup command (use your own terminal instead)"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        {expanded ? "Hide full script" : "View full script"}
      </button>
      {expanded ? (
        <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
          {code}
        </pre>
      ) : null}
    </div>
  );
}

/** The "What AuthSec will use" summary — reader identity (auto-derived,
 * never asked for) + the scope + a collapsed role list. Shown before the
 * setup command so the customer knows what the command is about to create
 * before running it. */
function WhatAuthSecWillUse({
  readerSaEmail,
  scopeKind,
  scopeId,
  roles,
}: {
  readerSaEmail: string;
  scopeKind: GCPScopeKind;
  scopeId: string;
  roles: string[];
}) {
  const [rolesOpen, setRolesOpen] = useState(false);
  return (
    <div className="space-y-2 rounded-md border p-3 text-xs">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Reader identity</span>
        <span className="font-mono">{readerSaEmail}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Read-only access to</span>
        <span className="font-mono">
          {SCOPE_KIND_LABEL[scopeKind]} / {scopeId}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setRolesOpen((v) => !v)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3 transition-transform", rolesOpen && "rotate-180")} />
        {rolesOpen ? "Hide roles granted" : "View roles granted"}
      </button>
      {rolesOpen ? (
        <ul className="space-y-0.5 pl-4 font-mono text-[11px] text-muted-foreground">
          {roles.map((r) => (
            <li key={r} className="list-disc">
              {r}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function GCPOnboardingWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);

  // Step 0 — Scope
  const [scopeKind, setScopeKind] = useState<GCPScopeKind>("project");
  const [scopeId, setScopeId] = useState("");
  const [readerProjectId, setReaderProjectId] = useState("");
  const [readerProjectOverride, setReaderProjectOverride] = useState(false);
  // Project scope defaults the reader project to the scope itself — "usually
  // the same project" per the plan. Folder/org scopes have no project to
  // default from, so the field is always shown directly for those.
  const effectiveReaderProjectId =
    scopeKind === "project" && !readerProjectOverride ? scopeId.trim() : readerProjectId.trim();

  // Step 1 — Authentication. Google Authentication is the default: it's the
  // recommended, no-script, no-key path (product decision — see the "Google
  // Authentication" card below). JSON key is no longer offered here — the
  // backend still fully supports it (existing JSON-key connectors keep
  // working unchanged), this wizard just no longer surfaces it as a way to
  // create a new one.
  const [authMethod, setAuthMethod] = useState<"wif" | "google_oauth">("google_oauth");
  const [methodDetailsOpen, setMethodDetailsOpen] = useState(false);
  const [fetchPackage, packageResult] = useLazyGetGcpOnboardingPackageQuery();

  // Step 2 — Setup
  const [providerResource, setProviderResource] = useState("");
  const [createConnector, { isLoading: connecting }] = useCreateGcpConnectorMutation();
  const [submitError, setSubmitError] = useState<CloudOnboardingApiError | null>(null);
  const [connected, setConnected] = useState<{ scope: string; method: string } | null>(null);

  // Step 2 — Setup, google_oauth only. Kept separate from the WIF/JSON-key
  // fields above rather than folded in, since this path has an extra
  // sub-sequence (sign in -> pick project -> preflight -> connect) those two
  // don't.
  const [startGoogleOAuth, { isLoading: startingGoogleOAuth }] = useStartGoogleOAuthMutation();

  // Whether this DEPLOYMENT can do Google sign-in at all — it needs an OAuth
  // client and a session store, and neither is guaranteed outside SaaS.
  //
  // Asked up front rather than discovered on click. Defaulting to the Google
  // card and only failing after the human has committed to it teaches them the
  // product is broken; the honest thing is to present the choice they actually
  // have. `skip` until the dialog opens so a closed wizard costs no request,
  // and treat an unreachable probe as available so a transient blip narrows
  // nobody's options — the start call still reports the truth if it is wrong.
  const { data: googleOAuthStatus } = useGetGoogleOAuthStatusQuery(undefined, { skip: !open });
  const googleOAuthAvailable = googleOAuthStatus?.available !== false;

  // Move off the Google card as soon as the deployment says it cannot serve it.
  // The default stays "google_oauth" so the recommended path is preselected on
  // every normal deployment; this only corrects a selection the human could not
  // have completed. Guarded on `open` so it cannot fight a later choice.
  useEffect(() => {
    if (open && !googleOAuthAvailable) setAuthMethod("wif");
  }, [open, googleOAuthAvailable]);
  const [listGoogleProjects, googleProjectsResult] = useLazyListGoogleProjectsQuery();
  const [preflightGoogleOAuth, { isLoading: preflightingGoogle }] = usePreflightGoogleOAuthMutation();
  const [provisionGoogleOAuth, { isLoading: provisioningGoogle }] = useProvisionGoogleOAuthMutation();
  const [googleSessionId, setGoogleSessionId] = useState<string | null>(null);
  const [googleOAuthError, setGoogleOAuthError] = useState<string | null>(null);
  const [selectedGoogleProject, setSelectedGoogleProject] = useState<string | null>(null);
  const [googleMissingPermissions, setGoogleMissingPermissions] = useState<string[] | null>(null);

  const resetGoogleOAuthState = () => {
    setGoogleSessionId(null);
    setGoogleOAuthError(null);
    setSelectedGoogleProject(null);
    setGoogleMissingPermissions(null);
  };

  const reset = () => {
    setStep(0);
    setScopeKind("project");
    setScopeId("");
    setReaderProjectId("");
    setReaderProjectOverride(false);
    setAuthMethod("google_oauth");
    setMethodDetailsOpen(false);
    setProviderResource("");
    setSubmitError(null);
    setConnected(null);
    resetGoogleOAuthState();
  };

  const handleContinueWithGoogle = async () => {
    setGoogleOAuthError(null);
    try {
      const { authorize_url } = await startGoogleOAuth().unwrap();
      const result = await openGoogleOAuthPopup(authorize_url);
      if (result.error || !result.sessionId) {
        setGoogleOAuthError(
          result.error === "popup_blocked"
            ? "Your browser blocked the sign-in popup. Allow popups for this site and try again."
            : "Google sign-in didn't complete. Please try again.",
        );
        return;
      }
      setGoogleSessionId(result.sessionId);
      void listGoogleProjects({ session_id: result.sessionId });
    } catch (err) {
      // Surface the backend's actual {error, hint} — e.g. "Google
      // authentication is not available in this deployment right now — use
      // the Workload Identity Federation option instead" — rather than a
      // generic message that hides why it failed.
      const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
      setGoogleOAuthError(googleOAuthErrorCopy(apiErr, "Could not start Google sign-in."));
    }
  };

  const handleSelectGoogleProject = async (projectId: string) => {
    setSelectedGoogleProject(projectId);
    setGoogleMissingPermissions(null);
    // The picked project is kept in this option's own state
    // (selectedGoogleProject) and sent explicitly on preflight/provision --
    // it deliberately does NOT overwrite the Scope step's
    // scopeKind/scopeId/readerProjectId state, which belongs to the Workload
    // Identity Federation option. Overwriting it conflated the two options:
    // going Back destroyed the WIF scope input, and the OAuth summary ended
    // up rendering WIF-package values derived for a different scope.

    if (!googleSessionId) return;
    try {
      const result = await preflightGoogleOAuth({
        session_id: googleSessionId,
        scope_kind: "project",
        scope_id: projectId,
        reader_project_id: projectId,
      }).unwrap();
      setGoogleMissingPermissions(result.sufficient ? [] : (result.missing_permissions ?? []));
    } catch (err) {
      const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
      setGoogleOAuthError(googleOAuthErrorCopy(apiErr, "Could not check Google Cloud permissions."));
    }
  };

  // Real, backend-reported data, not a guess: GCP will always refuse to
  // create a WIF OIDC provider whose issuer isn't HTTPS-reachable (verified
  // live — "Invalid OIDC issuer URI. The scheme must be https."), so a
  // non-HTTPS issuer means WIF is unconditionally unable to complete here,
  // not just harder. Gate submission on it rather than let a doomed attempt
  // round-trip to the backend.
  const issuerIsHttps = packageResult.data?.issuer_url?.startsWith("https://") ?? false;

  const stepValid = [
    // 0 -- Authentication. A method is always selected (the state defaults to
    // "google_oauth"), so there is nothing here that can be incomplete.
    true,
    // 1 -- Scope. WIF only: Google Authentication skips this step entirely and
    // takes its scope from the project picker on Setup. Deliberately does NOT
    // gate on packageResult -- that fetch is fired on LEAVING this step, so
    // requiring it here would never be satisfiable. Setup renders its own
    // loading and error states for it.
    scopeId.trim().length > 0 && effectiveReaderProjectId.length > 0,
    authMethod === "wif"
      ? providerResource.trim().length > 0 && issuerIsHttps
      : Boolean(
          googleSessionId &&
            selectedGoogleProject &&
            googleMissingPermissions &&
            googleMissingPermissions.length === 0,
        ),
    true,
  ][step];

  // Leaving the Scope step on the WIF path. The onboarding package needs the
  // scope to render the setup script and derive the pool/provider ids, which is
  // why Scope has to precede Setup -- for WIF. Google Authentication never calls
  // this: it has no script, and its scope comes from the project picker.
  const goToSetupFromScope = () => {
    setStep(2);
    void fetchPackage({
      reader_project_id: effectiveReaderProjectId,
      scope_id: scopeId.trim(),
      scope_kind: scopeKind,
    });
  };

  const submit = async () => {
    setSubmitError(null);
    try {
      if (authMethod === "google_oauth") {
        if (!googleSessionId || !selectedGoogleProject) return;
        // The picked project is the only source of scope on this path -- the
        // Scope step is skipped entirely, so nothing is being overridden here.
        // (It previously hardcoded scope_kind:"project" over whatever the
        // operator had chosen on a Scope step this flow then ignored.)
        await provisionGoogleOAuth({
          session_id: googleSessionId,
          scope_kind: "project",
          scope_id: selectedGoogleProject,
          reader_project_id: selectedGoogleProject,
        }).unwrap();
        setConnected({
          scope: `project / ${selectedGoogleProject}`,
          method: "Google Authentication",
        });
      } else {
        await createConnector({
          scope_kind: scopeKind,
          scope_id: scopeId.trim(),
          reader_project_id: effectiveReaderProjectId,
          auth: {
            method: "wif",
            reader_sa_email: readerSaEmailFor(effectiveReaderProjectId),
            provider_resource: providerResource.trim(),
          },
        }).unwrap();
        setConnected({
          scope: `${SCOPE_KIND_LABEL[scopeKind]} / ${scopeId.trim()}`,
          method: "Workload Identity Federation",
        });
      }
      onCreated();
      setStep(3);
    } catch (err) {
      setSubmitError(describeSubmitFailure(err));
    }
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
          <DialogTitle>Connect Google Cloud</DialogTitle>
          <DialogDescription>
            AuthSec connects to your GCP scope as a service account you create and control.
            AuthSec never receives your Google account, password, or — with Workload Identity
            Federation — any long-lived key at all.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1.5 py-1 text-[11px]">
          {STEPS.map((label, i) => {
            // Google Authentication skips Scope (step 1). Mark it done rather
            // than dropping it, so the rail keeps four items and does not
            // reflow when the method changes -- the pattern
            // GitHubSetupWizard uses for its skipped App step.
            const skipped = i === 1 && authMethod === "google_oauth" && step > 1;
            const done = i < step || skipped;
            return (
              <li key={label} className="flex items-center gap-1.5">
                <span
                  className={
                    i === step
                      ? "flex size-5 items-center justify-center rounded-full bg-(--color-primary) text-[10px] font-semibold text-white"
                      : done
                        ? "flex size-5 items-center justify-center rounded-full bg-(--color-success-soft) text-[10px] font-semibold text-(--color-success-text)"
                        : "flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                  }
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {label}
                </span>
                {i < STEPS.length - 1 ? <span className="text-muted-foreground">›</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="space-y-4 py-2">
          {/* 2 — Scope: "what do you want AuthSec to discover?" Reached only
          on the WIF path; Google Authentication takes its scope from the
          project picker on the Setup step instead. */}
          {step === 1 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="gcp-scope-kind">What do you want AuthSec to discover?</Label>
                <Select value={scopeKind} onValueChange={(v) => setScopeKind(v as GCPScopeKind)}>
                  <SelectTrigger id="gcp-scope-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">A project</SelectItem>
                    <SelectItem value="folder">A folder</SelectItem>
                    <SelectItem value="org">An organization</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gcp-scope-id">
                  {scopeKind === "project"
                    ? "Project ID"
                    : scopeKind === "folder"
                      ? "Folder ID"
                      : "Organization ID"}
                </Label>
                <Input
                  id="gcp-scope-id"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="my-gcp-project-id"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  AuthSec will discover identities and access within this scope, read-only.
                </p>
              </div>

              {scopeKind === "project" && !readerProjectOverride ? (
                <p className="text-xs text-muted-foreground">
                  AuthSec's reader identity will be created in this same project.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setReaderProjectId(scopeId);
                      setReaderProjectOverride(true);
                    }}
                  >
                    Use a different project for the reader identity
                  </button>
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="gcp-reader-project">Reader project</Label>
                  <Input
                    id="gcp-reader-project"
                    value={readerProjectId}
                    onChange={(e) => setReaderProjectId(e.target.value)}
                    placeholder="my-gcp-project-id"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    The project where AuthSec's reader identity is created — separate from what's
                    being discovered above.
                    {scopeKind === "project" ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setReaderProjectOverride(false)}
                        >
                          Use the same project as above instead
                        </button>
                      </>
                    ) : null}
                  </p>
                </div>
              )}
            </>
          ) : null}

          {/* 1 — Authentication: "how should AuthSec connect?" First, because
          it decides whether a scope is even asked for. */}
          {step === 0 ? (
            <>
              <Label>How should AuthSec connect?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!googleOAuthAvailable}
                  onClick={() => setAuthMethod("google_oauth")}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                    !googleOAuthAvailable
                      ? "cursor-not-allowed border-border opacity-60"
                      : authMethod === "google_oauth"
                        ? "border-[var(--component-button-primary-bg)] bg-(--color-primary-soft)"
                        : "border-border hover:border-[var(--color-border-strong)]",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    ⭐ Google Authentication
                  </span>
                  {googleOAuthAvailable ? (
                    <span className="rounded bg-(--color-success-soft) px-1.5 py-0.5 text-[10px] font-medium text-(--color-success-text)">
                      Recommended
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Not available here
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {googleOAuthAvailable
                      ? "Sign in with Google once — AuthSec configures Workload Identity Federation for you automatically. No script, no key file."
                      : "This deployment has no Google OAuth client configured, so sign-in cannot complete. Use Workload Identity Federation, or ask your administrator to configure it."}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod("wif")}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
                    authMethod === "wif"
                      ? "border-[var(--component-button-primary-bg)] bg-(--color-primary-soft)"
                      : "border-border hover:border-[var(--color-border-strong)]",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    Workload Identity Federation
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Manual / Advanced
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Run a setup command yourself and paste back one value. Keyless, no
                    long-lived service-account key — for when you'd rather not sign in with
                    Google or need org/folder scope.
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMethodDetailsOpen((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", methodDetailsOpen && "rotate-180")}
                />
                Learn how this works
              </button>
              {methodDetailsOpen ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  {authMethod === "google_oauth" ? (
                    <>
                      Your Google sign-in is used ONCE, to configure the exact same Workload
                      Identity Federation trust relationship the manual setup command creates
                      by hand — then it's discarded. AuthSec never stores your Google sign-in
                      or uses it again; ongoing access uses the same short-lived, keyless
                      Workload Identity Federation exchange as the option to the right.
                    </>
                  ) : (
                    <>
                      The setup command creates a short-lived trust relationship (a Workload
                      Identity Pool) between your Google Cloud project and AuthSec's own
                      sign-in service. AuthSec exchanges a short-lived token for temporary
                      Google Cloud access on every request — no password, key file, or secret
                      is ever stored by AuthSec or transmitted from your account.
                    </>
                  )}
                </p>
              ) : null}
            </>
          ) : null}

          {/* Setup, WIF only: the onboarding package is fetched on leaving the
          Scope step, so this is where waiting for it belongs. Google
          Authentication never fetches a package and never sees this. */}
          {step === 2 && authMethod === "wif" && !packageResult.data ? (
            packageResult.isError ? (
              <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                Could not load setup instructions.{" "}
                <button
                  className="underline"
                  onClick={() =>
                    void fetchPackage({
                      reader_project_id: effectiveReaderProjectId,
                      scope_id: scopeId.trim(),
                      scope_kind: scopeKind,
                    })
                  }
                >
                  Retry
                </button>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Preparing setup instructions…
              </p>
            )
          ) : null}

          {/* 3 — Setup. The Google Authentication branch renders without
          the WIF onboarding package: no setup script, no provider
          resource, no WIF subject/binding values -- none of those exist in
          this flow, and gating on them showed WIF-package values derived
          for the Scope step's scope while this option connects the
          Google-picked project. */}
          {step === 2 && (authMethod === "google_oauth" || packageResult.data) ? (
            <>
              {authMethod === "wif" && packageResult.data ? (
                <WhatAuthSecWillUse
                  readerSaEmail={readerSaEmailFor(effectiveReaderProjectId)}
                  scopeKind={scopeKind}
                  scopeId={scopeId.trim()}
                  roles={packageResult.data.role_set}
                />
              ) : null}
              {authMethod === "google_oauth" && selectedGoogleProject ? (
                <WhatAuthSecWillUse
                  readerSaEmail={readerSaEmailFor(selectedGoogleProject)}
                  scopeKind="project"
                  scopeId={selectedGoogleProject}
                  roles={packageResult.data?.role_set ?? []}
                />
              ) : null}

              {authMethod === "wif" ? (
                packageResult.data ? (
                <>
                  {!issuerIsHttps ? (
                    <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                      <strong className="font-medium">
                        Workload Identity Federation isn't available in this environment.
                      </strong>{" "}
                      Google Cloud requires a publicly reachable HTTPS sign-in service for
                      Workload Identity Federation, and this AuthSec deployment's issuer (
                      <span className="font-mono">{packageResult.data.issuer_url}</span>) isn't
                      reachable over HTTPS. This is a deployment configuration requirement, not
                      something wrong with your Google Cloud project or setup. Ask an
                      administrator to configure a public HTTPS issuer, or use{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setAuthMethod("google_oauth")}
                      >
                        Google Authentication
                      </button>{" "}
                      instead.
                    </div>
                  ) : null}
                  <RunSetupSection code={methodSpecificScript(packageResult.data.setup_script, "wif")} />
                  <div className="space-y-2">
                    <Label htmlFor="gcp-provider-resource">
                      Paste the value your terminal printed as "WIF provider resource"
                    </Label>
                    <Input
                      id="gcp-provider-resource"
                      value={providerResource}
                      onChange={(e) => setProviderResource(e.target.value)}
                      placeholder="projects/123.../locations/global/workloadIdentityPools/.../providers/..."
                      className="font-mono text-xs"
                      disabled={!issuerIsHttps}
                    />
                    <p className="text-xs text-muted-foreground">
                      It's safe to come back to this step later — re-opening it never invalidates
                      what you already ran.
                    </p>
                  </div>
                </>
                ) : null
              ) : (
                <>
                  {!googleSessionId ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Sign in with the Google account that has IAM and Service Usage admin
                        rights on the project you want to connect. AuthSec uses this sign-in once,
                        to configure Workload Identity Federation automatically, then discards it
                        — it is never stored.
                      </p>
                      <Button
                        className="flex w-full items-center justify-center gap-2 text-[length:var(--text-sm)] text-white"
                        disabled={startingGoogleOAuth}
                        onClick={() => void handleContinueWithGoogle()}
                      >
                        {startingGoogleOAuth ? "Opening Google sign-in…" : "Continue with Google"}
                      </Button>
                    </>
                  ) : !selectedGoogleProject ? (
                    <div className="space-y-2">
                      <Label>Select a Google Cloud project</Label>
                      <GoogleProjectPicker
                        projects={googleProjectsResult.data ?? []}
                        isLoading={googleProjectsResult.isFetching}
                        selectedProjectId={selectedGoogleProject}
                        onSelect={(projectId) => void handleSelectGoogleProject(projectId)}
                      />
                    </div>
                  ) : (
                    <GoogleOAuthProgress
                      projectId={selectedGoogleProject}
                      phase={
                        preflightingGoogle
                          ? "checking-permissions"
                          : googleMissingPermissions && googleMissingPermissions.length > 0
                            ? "insufficient-permissions"
                            : provisioningGoogle
                              ? "provisioning"
                              : "ready"
                      }
                      missingPermissions={googleMissingPermissions}
                      onUseWifInstead={() => {
                        setAuthMethod("wif");
                        resetGoogleOAuthState();
                      }}
                    />
                  )}
                  {googleOAuthError ? (
                    <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                      {googleOAuthError}
                    </div>
                  ) : null}
                </>
              )}

              {submitError ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                  <strong className="font-medium">Couldn't verify the connection.</strong>{" "}
                  {authMethod === "google_oauth"
                    ? googleOAuthErrorCopy(submitError, "Something went wrong verifying the connection.")
                    : errorCopy(submitError, "Something went wrong verifying the connection.", authMethod)}
                </div>
              ) : null}

              {connecting ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Verifying reader access — this can take a few seconds.
                </p>
              ) : null}
            </>
          ) : null}

          {/* 4 — Connected */}
          {step === 3 && connected ? (
            <div className="space-y-3">
              <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                Google Cloud connected.
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Scope</dt>
                  <dd className="font-mono">{connected.scope}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Auth method</dt>
                  <dd>{connected.method}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Discovery hasn't run for this scope yet — GCP discovery scanning isn't available
                yet. This connection is onboarded and ready.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 0) return onOpenChange(false);
              // Mirror the Scope skip: on the Google path step 1 was never
              // shown, so stepping back into it would strand the operator on a
              // form their flow does not use.
              if (step === 2 && authMethod === "google_oauth") return setStep(0);
              setStep(step - 1);
            }}
            disabled={step === 3}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 2 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!stepValid}
              onClick={() =>
                step === 0
                  ? // Google Authentication takes its scope from the project picker on
                    // Setup, so the Scope step has nothing to ask it -- skip straight
                    // there. WIF needs the scope first.
                    authMethod === "google_oauth"
                    ? setStep(2)
                    : setStep(1)
                  : goToSetupFromScope()
              }
            >
              Continue
            </Button>
          ) : step === 2 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!stepValid || connecting || provisioningGoogle}
              onClick={() => void submit()}
            >
              {authMethod === "google_oauth"
                ? provisioningGoogle
                  ? "Connecting…"
                  : "Connect"
                : connecting
                  ? "Verifying…"
                  : "I've completed setup"}
            </Button>
          ) : (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
