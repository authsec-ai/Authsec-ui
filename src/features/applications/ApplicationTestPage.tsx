import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Play, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/tooltip";
import {
  useValidateResourceServerMutation,
  type ResourceServerValidationCheck,
  type ResourceServerValidationResult,
} from "@/app/api/resourceServersApi";
import { cn } from "@/lib/utils";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateRandomString,
  getOAuthBaseUrl,
} from "@/utils/oauthUtils";

import { useApplicationContext } from "./useApplicationContext";
import { Surface } from "./components/ApplicationConsole";

type RegistrationMode = "dcr" | "prereg" | "cimd";

type CheckStatus = "passed" | "next" | "failed" | "unknown";

type ReadinessCheck = {
  key: "metadata" | "bearer" | "client" | "browser";
  label: string;
  body: string;
  tooltip: string;
  status: CheckStatus;
};

type PendingBrowserTest = {
  state: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resourceUri: string;
  requestedScopes: string[];
  registrationMode: RegistrationMode;
  createdAt: string;
};

type BrowserTestResult = {
  status: "success" | "blocked" | "error";
  title: string;
  detail: string;
  happenedAt: string;
  errorCode?: string;
  scope?: string;
  tokenType?: string;
};

type TokenExchangeResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

const STATUS_PILL: Record<CheckStatus, { label: string; cls: string }> = {
  passed: {
    label: "Passed",
    cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  next: { label: "Next", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  failed: { label: "Failed", cls: "border-red-200 bg-red-50 text-red-700" },
  unknown: {
    label: "Not yet checked",
    cls: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const REGISTRATION_OPTIONS: {
  key: RegistrationMode;
  label: string;
  description: string;
  tooltip: string;
}[] = [
  {
    key: "dcr",
    label: "Dynamic registration",
    description:
      "No client has to be registered before first use. AuthSec creates it during OAuth.",
    tooltip:
      "RFC 7591 DCR. AuthSec can create a temporary browser-test client on demand and start the OAuth flow immediately.",
  },
  {
    key: "prereg",
    label: "Pre-registered clients",
    description:
      "Require an approved client before browser login can continue.",
    tooltip:
      "An admin-approved client must already exist with a redirect URI that can receive the code callback.",
  },
  {
    key: "cimd",
    label: "CIMD / external client",
    description:
      "Accept HTTPS client identifiers when policy allows them.",
    tooltip:
      "Client identity comes from a hosted metadata document. Browser testing needs a real external client document and redirect URI.",
  },
];

const VALIDATION_CHECKS_TO_SURFACE: Record<
  ReadinessCheck["key"],
  { backendKey: string; tooltip: string }
> = {
  metadata: {
    backendKey: "metadata",
    tooltip:
      "Whether `/.well-known/oauth-protected-resource/<path>` returns 200 with valid RFC 9728 metadata.",
  },
  bearer: {
    backendKey: "challenge",
    tooltip:
      "Whether unauthenticated MCP requests return 401 with a proper `WWW-Authenticate` challenge.",
  },
  client: {
    backendKey: "client_registration",
    tooltip:
      "Whether the selected registration mode can supply a usable OAuth client for the browser flow.",
  },
  browser: {
    backendKey: "browser_login",
    tooltip:
      "A real browser authorization request against the live MCP-protected resource.",
  },
};

const pendingKey = (applicationId: string) =>
  `authsec:browser-test:pending:${applicationId}`;
const resultKey = (applicationId: string) =>
  `authsec:browser-test:result:${applicationId}`;

function readSessionJSON<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionJSON(key: string, value: unknown) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function statusFromValidation(
  check: ResourceServerValidationCheck | undefined,
): CheckStatus {
  if (!check) return "unknown";
  return check.status === "passing" ? "passed" : "failed";
}

export default function ApplicationTestPage() {
  const { application } = useApplicationContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthBaseUrl = getOAuthBaseUrl();
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(
    application.registration_modes?.includes("dcr")
      ? "dcr"
      : application.registration_modes?.includes("prereg")
        ? "prereg"
        : "cimd",
  );
  const [browserResult, setBrowserResult] = useState<BrowserTestResult | null>(
    () => {
      if (typeof window === "undefined") return null;
      return readSessionJSON<BrowserTestResult>(resultKey(application.id));
    },
  );
  const [callbackBusy, setCallbackBusy] = useState(false);
  const [validate, { data: validation, isLoading, error }] =
    useValidateResourceServerMutation();
  useEffect(() => {
    void validate(application.id);
  }, [application.id, validate]);

  useEffect(() => {
    if (!browserResult) return;
    writeSessionJSON(resultKey(application.id), browserResult);
  }, [application.id, browserResult]);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const oauthErrorDescription = searchParams.get("error_description");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (oauthError && !callbackBusy) {
      const pending = readSessionJSON<PendingBrowserTest>(
        pendingKey(application.id),
      );
      const detail =
        oauthErrorDescription ??
        "The OAuth server returned an error before AuthSec received a code to exchange for tokens.";
      const isForbidden = oauthError === "request_forbidden";

      setBrowserResult({
        status: isForbidden ? "blocked" : "error",
        title: isForbidden
          ? "Sign-in worked, authorization was blocked"
          : "Browser login returned an OAuth error",
        detail: pending
          ? detail
          : `${detail} Start a fresh browser test if this callback came from an old tab.`,
        errorCode: oauthError,
        happenedAt: new Date().toISOString(),
      });
      sessionStorage.removeItem(pendingKey(application.id));
      void validate(application.id);
      toast.error(
        isForbidden
          ? "Sign-in completed, but authorization was blocked."
          : detail,
      );
      navigate(`/applications/${application.id}/test`, { replace: true });
      return;
    }

    if (!code || !state || callbackBusy) return;

    const pending = readSessionJSON<PendingBrowserTest>(pendingKey(application.id));
    if (!pending) {
      setBrowserResult({
        status: "error",
        title: "Browser test callback missing state",
        detail: "The PKCE state for this browser test is gone. Start the test login again.",
        happenedAt: new Date().toISOString(),
      });
      navigate(`/applications/${application.id}/test`, { replace: true });
      return;
    }

    if (pending.state !== state) {
      setBrowserResult({
        status: "error",
        title: "Browser test state mismatch",
        detail: "The callback state does not match the browser test that was started from this page.",
        happenedAt: new Date().toISOString(),
      });
      sessionStorage.removeItem(pendingKey(application.id));
      navigate(`/applications/${application.id}/test`, { replace: true });
      return;
    }

    setCallbackBusy(true);

    void (async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: pending.clientId,
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.codeVerifier,
          resource: pending.resourceUri,
        });

        const response = await fetch(
          `${oauthBaseUrl}/oauth/token`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
            credentials: "include",
          },
        );

        const payload =
          ((await response.json().catch(() => ({}))) as TokenExchangeResponse);

        if (!response.ok || !payload.access_token) {
          throw new Error(
            payload.error_description ??
              payload.error ??
              `Token exchange failed with ${response.status}`,
          );
        }

        setBrowserResult({
          status: "success",
          title: "Browser login completed",
          detail:
            "Authorization redirect and token exchange both succeeded against the live MCP OAuth surface.",
          happenedAt: new Date().toISOString(),
          scope: payload.scope,
          tokenType: payload.token_type,
        });
        toast.success("Browser login completed.");
      } catch (exchangeError) {
        const message =
          exchangeError instanceof Error
            ? exchangeError.message
            : "Token exchange failed.";
        setBrowserResult({
          status: "error",
          title: "Browser login failed",
          detail: message,
          happenedAt: new Date().toISOString(),
        });
        toast.error(message);
      } finally {
        sessionStorage.removeItem(pendingKey(application.id));
        setCallbackBusy(false);
        void validate(application.id);
        navigate(`/applications/${application.id}/test`, { replace: true });
      }
    })();
  }, [
    application.id,
    callbackBusy,
    navigate,
    oauthBaseUrl,
    searchParams,
    validate,
  ]);

  const validationChecksByKey = useMemo(() => {
    const map = new Map<string, ResourceServerValidationCheck>();
    for (const check of validation?.checks ?? []) {
      map.set(check.key, check);
    }
    return map;
  }, [validation]);

  const checks = useMemo(
    () => buildReadinessChecks(validation, validationChecksByKey, browserResult),
    [browserResult, validation, validationChecksByKey],
  );

  const allReady = checks
    .filter((c) => c.key !== "browser")
    .every((c) => c.status === "passed");
  const browserSucceeded = browserResult?.status === "success";
  const browserBlocked = browserResult?.status === "blocked";
  const hasBrowserResult = Boolean(browserResult);
  const headlineState = browserSucceeded
    ? "success"
    : browserBlocked
      ? "blocked"
      : allReady
        ? "ready"
        : "failing";

  const apiError = error as { data?: { error?: string } } | undefined;

  const handleRunTestLogin = async () => {
    if (registrationMode !== "dcr") {
      toast.error(
        "Real browser test login is wired only for Dynamic registration right now.",
      );
      return;
    }

    try {
      const latestValidation = await validate(application.id).unwrap();
      const metadataCheck = latestValidation.checks.find((c) => c.key === "metadata");
      const challengeCheck = latestValidation.checks.find((c) => c.key === "challenge");
      const browserCheck = latestValidation.checks.find((c) => c.key === "browser_login");

      if (metadataCheck?.status !== "passing") {
        throw new Error(metadataCheck?.message ?? "Metadata validation failed.");
      }
      if (challengeCheck?.status !== "passing") {
        throw new Error(challengeCheck?.message ?? "Bearer challenge validation failed.");
      }
      if (browserCheck?.status !== "passing") {
        throw new Error(browserCheck?.message ?? "Browser login is not ready.");
      }

      const redirectUri = `${window.location.origin}/applications/${application.id}/test`;
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomString(32);

      const requestedScopes = ["openid", "profile", "email"];

      const registerResponse = await fetch(
        `${oauthBaseUrl}/oauth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            client_name: `AuthSec Browser Test ${application.name}`,
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            resource: application.resource_uri,
            scope: requestedScopes.join(" "),
          }),
        },
      );

      const registerPayload =
        ((await registerResponse.json().catch(() => ({}))) as {
          client_id?: string;
          error?: string;
          detail?: string;
        });

      if (!registerResponse.ok || !registerPayload.client_id) {
        throw new Error(
          registerPayload.detail ??
            registerPayload.error ??
            `Client registration failed with ${registerResponse.status}`,
        );
      }

      writeSessionJSON(pendingKey(application.id), {
        state,
        clientId: registerPayload.client_id,
        redirectUri,
        codeVerifier,
        resourceUri: application.resource_uri,
        requestedScopes,
        registrationMode,
        createdAt: new Date().toISOString(),
      } satisfies PendingBrowserTest);

      const authUrl = new URL(`${oauthBaseUrl}/oauth/authorize`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", registerPayload.client_id);
      authUrl.searchParams.set("resource", application.resource_uri);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", requestedScopes.join(" "));
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      window.location.assign(authUrl.toString());
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : "Failed to start browser login.";
      setBrowserResult({
        status: "error",
        title: "Browser login did not start",
        detail: message,
        happenedAt: new Date().toISOString(),
      });
      toast.error(message);
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Test the flow
        </h2>
        <p className="text-sm text-muted-foreground">
          This page now validates the live MCP endpoint and starts a real browser
          OAuth flow. If the server is down, the test fails here instead of
          pretending readiness from stored setup state.
        </p>
      </header>

      <Surface
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-l-4 p-4",
          headlineState === "success"
            ? "border-l-emerald-500 bg-emerald-50/60"
            : headlineState === "blocked"
              ? "border-l-red-500 bg-red-50/60"
              : headlineState === "ready"
                ? "border-l-emerald-500 bg-emerald-50/60"
                : "border-l-amber-400 bg-amber-50/40",
        )}
      >
        <div className="flex items-start gap-3">
          {headlineState === "success" || headlineState === "ready" ? (
            <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" />
          ) : headlineState === "blocked" ? (
            <ShieldAlert className="mt-1 size-5 shrink-0 text-red-600" />
          ) : (
            <ShieldAlert className="mt-1 size-5 shrink-0 text-amber-600" />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-semibold",
                headlineState === "success" || headlineState === "ready"
                  ? "text-emerald-800"
                  : headlineState === "blocked"
                    ? "text-red-800"
                    : "text-amber-800",
              )}
            >
              {headlineState === "success"
                ? "Browser login test completed"
                : headlineState === "blocked"
                  ? "Sign-in completed, authorization blocked"
                  : headlineState === "ready"
                    ? "Ready to test"
                    : "Live checks are failing"}
            </p>
            <p className="text-xs leading-5 text-slate-600">
              {headlineState === "success"
                ? "AuthSec received the callback code and exchanged it for tokens. The browser flow works."
                : headlineState === "blocked"
                  ? "The end-user sign-in step completed, but OAuth returned an error before a token could be issued. Review the latest browser test result below."
                  : headlineState === "ready"
                    ? "Metadata, challenge, and client readiness passed against the live endpoint. Run test login to open the real browser flow."
                    : "One or more live checks failed. Fix the MCP origin before trying a browser login."}
            </p>
          </div>
        </div>
        <Button
          onClick={handleRunTestLogin}
          disabled={isLoading || callbackBusy}
          className="shrink-0"
        >
          {isLoading || callbackBusy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Play className="mr-2 size-4" />
          )}
          {callbackBusy
            ? "Finishing…"
            : isLoading
              ? "Running…"
              : hasBrowserResult
                ? "Run again"
                : "Run test login"}
        </Button>
      </Surface>

      {apiError && (
        <Surface className="border-l-4 border-l-red-500 bg-red-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            Validation failed
          </p>
          <p className="mt-1 text-sm text-slate-800">
            {apiError.data?.error ??
              "Live validation failed. Check the MCP endpoint and backend logs."}
          </p>
        </Surface>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-950">
              How AI clients register
            </h3>
            <HelpTooltip content="The browser test uses the selected registration mode. Dynamic registration is the only fully wired path on this page right now." />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pick the registration mode to test. Dynamic registration can start a
            real browser flow immediately because AuthSec can mint a temporary
            test client with this page as the callback.
          </p>
          <div className="mt-4 space-y-2">
            {REGISTRATION_OPTIONS.map((opt) => {
              const selected = registrationMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRegistrationMode(opt.key)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors",
                    selected
                      ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                      selected
                        ? "border-blue-500 bg-blue-500"
                        : "border-slate-300 bg-white",
                    )}
                    aria-hidden
                  >
                    {selected && (
                      <span className="size-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-950">
                        {opt.label}
                      </p>
                      <HelpTooltip content={opt.tooltip} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-950">
              Readiness checks
            </h3>
            <HelpTooltip content="These checks are live. They hit the current MCP metadata and unauthenticated challenge paths instead of reusing saved setup state." />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            These are the latest live validation results for the MCP endpoint.
          </p>
          <ul className="mt-4 space-y-2">
            {checks.map((check) => (
              <li
                key={check.key}
                className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-950">
                      {check.label}
                    </p>
                    <HelpTooltip content={check.tooltip} />
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {check.body}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                    STATUS_PILL[check.status].cls,
                  )}
                >
                  {STATUS_PILL[check.status].label}
                </span>
              </li>
            ))}
          </ul>
        </Surface>
      </div>

      {browserResult && <BrowserResultCard result={browserResult} />}

      <section>
        <h3 className="text-sm font-semibold text-slate-950">
          Operator decisions remaining
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          What's left before this application is production-ready.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <DecisionCard
            title="Run browser login"
            body="Start the live OAuth redirect and exchange the callback code for tokens."
            status={
              browserSucceeded
                ? "Completed"
                : browserBlocked
                  ? "Authorization blocked"
                : allReady
                  ? "Pending operator action"
                  : "Blocked by live validation"
            }
            done={browserSucceeded}
          />
          <DecisionCard
            title="Approve high-risk tool mappings"
            body="Confirm admin/delete tools before launch."
            status="On the Tools tab"
            done={false}
          />
          <DecisionCard
            title="Launch application"
            body="Flip access on once all checks have passed."
            status="On the Launch tab"
            done={false}
          />
        </div>
      </section>
    </div>
  );
}

function buildReadinessChecks(
  validation: ResourceServerValidationResult | undefined,
  validationChecksByKey: Map<string, ResourceServerValidationCheck>,
  browserResult: BrowserTestResult | null,
): ReadinessCheck[] {
  const metadataCheck = validationChecksByKey.get(
    VALIDATION_CHECKS_TO_SURFACE.metadata.backendKey,
  );
  const bearerCheck = validationChecksByKey.get(
    VALIDATION_CHECKS_TO_SURFACE.bearer.backendKey,
  );
  const clientCheck = validationChecksByKey.get(
    VALIDATION_CHECKS_TO_SURFACE.client.backendKey,
  );
  const browserCheck = validationChecksByKey.get(
    VALIDATION_CHECKS_TO_SURFACE.browser.backendKey,
  );

  const browserStatus: CheckStatus =
    browserResult?.status === "success"
      ? "passed"
      : browserResult
        ? "failed"
      : !validation
        ? "unknown"
        : browserCheck?.status === "passing"
          ? "next"
          : "failed";

  return [
    {
      key: "metadata",
      label: metadataCheck?.label ?? "Endpoint metadata",
      body: metadataCheck?.message ?? "Metadata check has not run yet.",
      tooltip: VALIDATION_CHECKS_TO_SURFACE.metadata.tooltip,
      status: statusFromValidation(metadataCheck),
    },
    {
      key: "bearer",
      label: bearerCheck?.label ?? "Bearer challenge",
      body: bearerCheck?.message ?? "Challenge check has not run yet.",
      tooltip: VALIDATION_CHECKS_TO_SURFACE.bearer.tooltip,
      status: statusFromValidation(bearerCheck),
    },
    {
      key: "client",
      label: clientCheck?.label ?? "Client readiness",
      body: clientCheck?.message ?? "Client readiness has not run yet.",
      tooltip: VALIDATION_CHECKS_TO_SURFACE.client.tooltip,
      status: statusFromValidation(clientCheck),
    },
    {
      key: "browser",
      label: browserCheck?.label ?? "Browser login",
      body:
        browserResult
          ? browserResult.detail
          : browserCheck?.message ?? "Browser login has not run yet.",
      tooltip: VALIDATION_CHECKS_TO_SURFACE.browser.tooltip,
      status: browserStatus,
    },
  ];
}

function DecisionCard({
  title,
  body,
  status,
  done,
}: {
  title: string;
  body: string;
  status: string;
  done: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        done
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center gap-1.5">
        {done ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="size-4 text-slate-400" aria-hidden />
        )}
        <p className="text-sm font-semibold text-slate-950">{title}</p>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {status}
      </p>
    </div>
  );
}

function BrowserResultCard({ result }: { result: BrowserTestResult }) {
  const ok = result.status === "success";
  const blocked = result.status === "blocked";

  return (
    <Surface
      className={cn(
        "border-l-4 p-5",
        ok
          ? "border-l-emerald-500 bg-emerald-50/40"
          : blocked
            ? "border-l-red-500 bg-red-50/40"
          : "border-l-red-500 bg-red-50/40",
      )}
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle2 className="mt-1 size-5 text-emerald-600" aria-hidden />
        ) : (
          <ShieldAlert className="mt-1 size-5 text-red-600" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              ok ? "text-emerald-700" : "text-red-700",
            )}
          >
            Latest browser test
          </p>
          <h3
            className={cn(
              "text-lg font-semibold tracking-tight",
              ok ? "text-emerald-800" : "text-red-800",
            )}
          >
            {result.title}
          </h3>
          <p className="mt-1 text-sm text-slate-700">{result.detail}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <ResultRow
          label={ok ? "Completed at" : "Returned at"}
          value={new Date(result.happenedAt).toLocaleString()}
        />
        {result.errorCode && (
          <ResultRow label="OAuth error" value={result.errorCode} mono />
        )}
        {result.tokenType && (
          <ResultRow label="Token type" value={result.tokenType} mono />
        )}
        {result.scope && <ResultRow label="Granted scope" value={result.scope} mono />}
      </dl>
    </Surface>
  );
}

function ResultRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm font-medium text-slate-900",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
