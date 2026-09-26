/**
 * "Launch in AWS" — the Quick Create half of the AWS onboarding wizard.
 *
 * The customer picks the AWS Region(s) to scan, clicks Launch, and in the AWS
 * console ticks the IAM acknowledgement and clicks Create stack. The stack
 * reports its role back to AuthSec (Custom::AuthSecRegistration → SNS → SQS),
 * AuthSec assumes it with the session's ExternalId, and this screen — which
 * has been polling the session — moves on by itself. Nothing is pasted back.
 *
 * Contract: awsQuickCreateApi.ts. Behaviour the plan requires here:
 *  - AWS Region(s) means the region of the customer's resources, never their
 *    location, and is never inferred.
 *  - Exactly one browser tab is opened, from the click itself so a popup
 *    blocker allows it; if it is blocked anyway, the link is shown.
 *  - The session id survives a page refresh (sessionStorage), so a customer
 *    who comes back resumes waiting instead of launching a second stack.
 *  - After ~15 minutes without a callback, say what usually went wrong and
 *    offer both ways forward: paste the Role ARN, or start over.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { AlertTriangle, CheckCircle2, ExternalLink, Rocket, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { CloudPill } from "../CloudPill";

import {
  useCreateAwsConnectorMutation,
  useScanAwsConnectorMutation,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import {
  isTerminalSession,
  useGetAwsOnboardingSessionQuery,
  useStartAwsOnboardingSessionMutation,
  type AWSAutomaticBlock,
  type AWSOnboardingSession,
  type AWSQuickCreateApiError,
} from "./awsQuickCreateApi";
import { SessionManager } from "@/utils/sessionManager";
import { AWS_OPT_IN_REGION_LABELS, AWS_REGIONS, awsRegionLabel } from "./awsRegions";
import { previousStackHint, quickCreateErrorCopy, regionProbeCopy } from "./awsQuickCreateCopy";
import { awsErrorCopy } from "./awsErrorCopy";

const SESSION_STORAGE_KEY = "authsec.aws.quickCreate.session";
const POLL_MS = 3000;
const SLOW_AFTER_MS = 15 * 60 * 1000;
const REGION_WAIT_MS = 90 * 1000;

// The stored launch belongs to one signed-in user in one workspace. Keyed by
// both, so signing out and in as someone else in the same tab never resumes
// the previous user's launch.
function storageKey(): string {
  const s = SessionManager.getSession();
  return `${SESSION_STORAGE_KEY}:${s?.workspace_id ?? "-"}:${s?.user_id ?? "-"}`;
}
function readStoredSession(): string | null {
  try {
    return window.sessionStorage.getItem(storageKey());
  } catch {
    return null;
  }
}
function storeSession(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(storageKey(), id);
    else window.sessionStorage.removeItem(storageKey());
  } catch {
    // Storage blocked: resuming after a refresh is a convenience, not a need.
  }
}

function cloudFormationConsoleUrl(region: string): string {
  return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks`;
}

function Banner({
  tone,
  children,
}: {
  tone: "info" | "warning" | "danger" | "success";
  children: React.ReactNode;
}) {
  const cls = {
    info: "border-l-(--color-primary) bg-muted text-foreground",
    warning: "border-l-(--color-warning-text) bg-(--color-warning-soft) text-(--color-warning-text)",
    danger: "border-l-(--color-danger-text) bg-(--color-danger-soft) text-foreground",
    success: "border-l-(--color-success-text) bg-(--color-success-soft) text-(--color-success-text)",
  }[tone];
  // Announced to screen readers as it changes (Waiting → Verifying → Connected
  // or Failed); a failure interrupts, everything else waits its turn.
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={`rounded-md border-l-2 px-3 py-2.5 text-xs ${cls}`}
    >
      {children}
    </div>
  );
}

export function AWSQuickCreateFlow({
  automatic,
  review,
  onUseManual,
  onConnected,
  onDone,
}: {
  automatic: AWSAutomaticBlock;
  /** The permissions review (baseline, additional reads, hard denies). */
  review: React.ReactNode;
  onUseManual: () => void;
  onConnected: () => void;
  onDone: () => void;
}) {
  const supported = useMemo(() => automatic.supported_deployment_regions ?? [], [automatic]);
  const optIn = useMemo(() => new Set(automatic.optin_scan_regions ?? []), [automatic]);

  // ── Step 1: AWS Region(s) ──────────────────────────────────────────────────
  const [regions, setRegions] = useState<string[]>([]);
  const [deploymentOverride, setDeploymentOverride] = useState<string | undefined>();
  const [changingDeployment, setChangingDeployment] = useState(false);

  const regionOptions: SearchableSelectOption[] = useMemo(
    () => [
      ...AWS_REGIONS.map((r) => ({ value: r.value, label: `${r.value} — ${r.label}` })),
      ...Object.entries(AWS_OPT_IN_REGION_LABELS).map(([value, label]) => ({
        value,
        label: optIn.has(value) ? `${value} — ${label} (opt-in)` : `${value} — ${label} (not yet supported)`,
        disabled: !optIn.has(value),
      })),
    ],
    [optIn],
  );

  // The one stack goes in the first selected region that can host it, so the
  // stack lives where the customer already works. The IAM role it creates is
  // global either way.
  const deploymentRegion = useMemo(() => {
    if (deploymentOverride && supported.includes(deploymentOverride)) return deploymentOverride;
    return regions.find((r) => supported.includes(r)) ?? automatic.default_deployment_region ?? supported[0];
  }, [deploymentOverride, regions, supported, automatic.default_deployment_region]);

  // ── Step 2: launch, then wait ──────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(() => readStoredSession());
  const [launchedAt, setLaunchedAt] = useState<number>(() => Date.now());
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [startError, setStartError] = useState<AWSQuickCreateApiError | null>(null);
  const [startSession, { isLoading: starting }] = useStartAwsOnboardingSessionMutation();

  // Poll until there is nothing left to learn: a failed session, or a
  // connected one whose per-Region results have landed (they arrive a few
  // seconds after the connection, because they run after CloudFormation has
  // been answered). A session that no longer exists stops polling too.
  const [pollMs, setPollMs] = useState(POLL_MS);
  const sessionQuery = useGetAwsOnboardingSessionQuery(sessionId ?? skipToken, {
    pollingInterval: pollMs,
    skipPollingIfUnfocused: false,
  });
  const session: AWSOnboardingSession | undefined = sessionQuery.data;
  const terminal = isTerminalSession(session);
  const errorStatus = sessionQuery.isError ? (sessionQuery.error as { status?: unknown })?.status : undefined;
  // 404: expired or unknown. 401/403: not this user's or workspace's any more.
  // Either way the session is over for this screen.
  const sessionGone = Boolean(sessionId) && (errorStatus === 404 || errorStatus === 403 || errorStatus === 401);
  // Anything else (network, 5xx) may clear up: keep polling, but say so.
  const sessionUnreadable = Boolean(sessionId) && sessionQuery.isError && !sessionGone;

  // Fallback: paste the Role ARN, reusing this session's ExternalId.
  const [showPaste, setShowPaste] = useState(false);
  const [roleArn, setRoleArn] = useState("");
  const [pasteError, setPasteError] = useState<CloudOnboardingApiError | null>(null);
  const [manualConnected, setManualConnected] = useState<{ id: string; account: string } | null>(null);
  const [createConnector, { isLoading: connecting }] = useCreateAwsConnectorMutation();

  // Per-Region results normally land seconds after "connected". If they never
  // do (a probe failed server-side), stop waiting after REGION_WAIT_MS rather
  // than polling for as long as the dialog stays open.
  const [regionWaitOver, setRegionWaitOver] = useState(false);
  const connectedWithoutRegions = session?.status === "connected" && !session.region_status;
  useEffect(() => {
    if (!connectedWithoutRegions) return;
    const t = window.setTimeout(() => setRegionWaitOver(true), REGION_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [connectedWithoutRegions]);

  const settled =
    sessionGone ||
    Boolean(manualConnected) ||
    session?.status === "failed" ||
    (session?.status === "connected" && (Boolean(session.region_status) || regionWaitOver));
  useEffect(() => {
    setPollMs(settled ? 0 : POLL_MS);
  }, [settled]);

  // A finished launch is not resumed the next time the wizard opens: clear it
  // when this screen goes away (dialog closed by any means, not only Done).
  const finishedRef = useRef(false);
  finishedRef.current = settled || terminal;
  useEffect(
    () => () => {
      if (finishedRef.current) storeSession(null);
    },
    [],
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sessionId || terminal) return;
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, [sessionId, terminal]);
  // Measured from when the session was created, so a refresh does not restart
  // the 15-minute clock.
  const startedAt = session?.created_at ? Date.parse(session.created_at) || launchedAt : launchedAt;
  const slow = Boolean(sessionId) && !terminal && !manualConnected && now - startedAt > SLOW_AFTER_MS;

  const connectedNotified = useRef(false);
  useEffect(() => {
    if (session?.status === "connected" && !connectedNotified.current) {
      connectedNotified.current = true;
      onConnected();
    }
  }, [session?.status, onConnected]);

  const launchingRef = useRef(false);
  const launch = async () => {
    // Guards a double click between the click and the button disabling.
    if (launchingRef.current) return;
    launchingRef.current = true;
    setStartError(null);
    setPopupBlocked(false);
    // Opened synchronously inside the click so a popup blocker lets it
    // through; pointed at the link once the session exists.
    const tab = window.open("", "_blank");
    try {
      const s = await startSession({ regions, deployment_region: deploymentRegion }).unwrap();
      if (tab) {
        tab.opener = null;
        tab.location.href = s.quick_create_url;
      } else {
        setPopupBlocked(true);
      }
      connectedNotified.current = false;
      setLaunchedAt(Date.now());
      setNow(Date.now());
      setSessionId(s.id);
      storeSession(s.id);
    } catch (err) {
      tab?.close();
      const data = (err as { data?: AWSQuickCreateApiError })?.data;
      setStartError(data ?? { error: "Could not start automatic setup." });
    } finally {
      launchingRef.current = false;
    }
  };

  const startOver = () => {
    storeSession(null);
    setSessionId(null);
    setStartError(null);
    setPopupBlocked(false);
    setShowPaste(false);
    setRoleArn("");
    setPasteError(null);
    setManualConnected(null);
    setScanStarted(false);
    setScanError(null);
    connectedNotified.current = false;
  };

  const pasteConnect = async () => {
    if (!session) return;
    setPasteError(null);
    try {
      const c = await createConnector({
        role_arn: roleArn.trim(),
        external_id: session.external_id,
        regions: session.regions,
      }).unwrap();
      setManualConnected({ id: c.id, account: c.scope_id });
      // Once only: if the stack's own callback also lands later, the effect
      // above must not refresh the list a second time.
      if (!connectedNotified.current) {
        connectedNotified.current = true;
        onConnected();
      }
    } catch (err) {
      const raw = err as { data?: CloudOnboardingApiError; status?: unknown };
      setPasteError(
        raw?.status === "TIMEOUT_ERROR"
          ? { error: "The connection check timed out.", timeout: true }
          : (raw?.data ?? { error: "Could not connect to AWS." }),
      );
    }
  };

  // ── Step 3: connected ─────────────────────────────────────────────────────
  const [scanConnector, { isLoading: scanning }] = useScanAwsConnectorMutation();
  const [scanStarted, setScanStarted] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const connectorId = session?.status === "connected" ? session.connector_id : manualConnected?.id;
  const done = () => {
    storeSession(null);
    onDone();
  };

  // ────────────────────────────────────────────────────────────────────────────

  if (manualConnected || session?.status === "connected") {
    const account = manualConnected?.account ?? session?.account_id;
    const regionRows = session?.region_status
      ? Object.entries(session.region_status).sort(([a], [b]) =>
          a === session.deployment_region ? -1 : b === session.deployment_region ? 1 : a.localeCompare(b),
        )
      : [];
    return (
      <div className="space-y-3">
        <Banner tone="success">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          AWS account connected — AuthSec assumed the role and confirmed the account with AWS.
        </Banner>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Account</dt>
            <dd className="font-mono">{account}</dd>
          </div>
          {session?.role_arn ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="truncate font-mono">{session.role_arn}</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-xs text-muted-foreground">
          Not the account you meant? Revoke it from the connectors list — nothing has been scanned yet.
        </p>

        {session?.response_put_failed ? (
          <Banner tone="warning">
            AuthSec connected the account but could not report back to CloudFormation, so the stack
            may roll back and delete the role. If it does, start again.
          </Banner>
        ) : null}

        {session?.previous_role_arn ? (
          <Banner tone="info">
            This account was already connected. AuthSec now uses{" "}
            <span className="font-mono">{session.role_name}</span>; the previous role{" "}
            <span className="font-mono">{session.previous_role_arn.split("/").pop()}</span> is no longer used —{" "}
            {previousStackHint(session.previous_role_arn)} when convenient.
          </Banner>
        ) : null}

        {/* Per-Region results exist only for a connection the stack reported;
            a pasted Role ARN has none, so the section would spin forever. */}
        {session?.status === "connected" ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">AWS Region(s)</p>
            {regionRows.length === 0 && regionWaitOver ? (
              <p className="text-xs text-muted-foreground">
                The per-Region check didn't finish. The account is connected; the first scan checks each Region.
              </p>
            ) : regionRows.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Checking each Region…
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {regionRows.map(([region, probe]) => (
                  <div key={region} className="flex items-start justify-between gap-3 px-2.5 py-2 text-xs">
                    <div>
                      <div className="font-medium text-foreground">{awsRegionLabel(region)}</div>
                      {probe.status !== "connected" ? (
                        <div className="text-muted-foreground">{regionProbeCopy(probe.reason)}</div>
                      ) : region === session.deployment_region ? (
                        <div className="text-muted-foreground">Stack region</div>
                      ) : null}
                    </div>
                    <CloudPill tone={probe.status === "connected" ? "success" : "warning"}>
                      {probe.status === "connected" ? "Connected" : "Not reachable"}
                    </CloudPill>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {connectorId ? (
          scanStarted ? (
            <p className="text-xs text-(--color-success-text)">
              Scan started — it runs in the background. Track progress from this account's row in the
              connectors list.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Button
                variant="outline"
                className="w-full"
                disabled={scanning}
                onClick={() => {
                  setScanError(null);
                  void scanConnector(connectorId)
                    .unwrap()
                    .then(() => setScanStarted(true))
                    .catch((err: { data?: CloudOnboardingApiError }) =>
                      setScanError(err?.data?.error ?? "Could not start the scan. Start it from the connectors list."),
                    );
                }}
              >
                {scanning ? "Starting scan…" : "Scan now — discover IAM identities"}
              </Button>
              {scanError ? <p className="text-xs text-(--color-danger-text)">{scanError}</p> : null}
            </div>
          )
        ) : null}

        <div className="flex justify-end">
          <Button className="text-[length:var(--text-sm)] text-white" onClick={done}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (sessionId) {
    const failed = session?.status === "failed" ? quickCreateErrorCopy(session.code, session.message) : null;
    return (
      <div className="space-y-3">
        {sessionGone ? (
          <Banner tone="warning">
            This setup session has ended. Check the connectors list — if the account isn't there, start
            again.
          </Banner>
        ) : sessionUnreadable && !session ? (
          <Banner tone="danger">
            <strong className="font-medium">Couldn't reach AuthSec to check this setup.</strong> Retrying — if
            it keeps failing, start again or check the connectors list.
          </Banner>
        ) : failed ? (
          <Banner tone="danger">
            <strong className="font-medium">{failed.title}.</strong> {failed.body}
          </Banner>
        ) : session?.status === "verifying" ? (
          <Banner tone="info">
            <span className="mr-1.5 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
            Your stack reported back. Verifying access — AuthSec is assuming the role and confirming the
            account with AWS…
          </Banner>
        ) : (
          <Banner tone="info">
            <span className="mr-1.5 inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" />
            Waiting for your stack in <strong className="font-medium">{session ? awsRegionLabel(session.deployment_region) : "AWS"}</strong>.
            This page moves on by itself.
          </Banner>
        )}

        {!failed && !sessionGone ? (
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>In the AWS tab, check you are signed in to the account you want to connect.</li>
            <li>
              Tick <em>“I acknowledge that AWS CloudFormation might create IAM resources with custom names.”</em>
            </li>
            <li>
              Click <strong className="text-foreground">Create stack</strong>. Don't change the values AuthSec
              filled in, and don't switch Regions.
            </li>
          </ol>
        ) : null}

        {popupBlocked && session?.quick_create_url ? (
          <Banner tone="warning">
            Your browser blocked the new tab.{" "}
            <a className="underline" href={session.quick_create_url} target="_blank" rel="noopener noreferrer">
              Open the AWS console
            </a>
            .
          </Banner>
        ) : null}

        {slow ? (
          <Banner tone="warning">
            <strong className="font-medium">Still waiting after 15 minutes.</strong> Usually one of: the stack
            failed or rolled back (check its Events tab — if it says CloudFormation “did not receive a
            response”, AuthSec never heard from it); you were signed in to a different account; the Region
            was switched or a pre-filled value was edited; or your AWS user can't publish to AuthSec's SNS
            topic. Paste the Role ARN below, or start again.
          </Banner>
        ) : null}

        {session && !failed && !sessionGone ? (
          <div className="flex flex-wrap gap-2">
            {/* The link and ExternalId come back only to the user who started
                the launch; for anyone else they are empty, and an empty href
                would just reopen AuthSec. */}
            {session.quick_create_url ? (
              <Button variant="outline" size="sm" asChild>
                <a href={session.quick_create_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 size-3.5" />
                  Reopen the launch page
                </a>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <a href={cloudFormationConsoleUrl(session.deployment_region)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 size-3.5" />
                CloudFormation stacks
              </a>
            </Button>
            {session.external_id ? (
              <Button variant="outline" size="sm" onClick={() => setShowPaste((v) => !v)}>
                Paste Role ARN instead
              </Button>
            ) : null}
          </div>
        ) : null}

        {showPaste && session?.external_id && !failed && !sessionGone ? (
          <div className="space-y-2 rounded-md border p-2.5">
            <Label htmlFor="aws-qc-role-arn">Role ARN from the stack's Outputs tab</Label>
            <Input
              id="aws-qc-role-arn"
              value={roleArn}
              onChange={(e) => setRoleArn(e.target.value)}
              placeholder={`arn:aws:iam::123456789012:role/${session.role_name}`}
              className="font-mono text-xs"
              autoComplete="off"
            />
            {pasteError ? (
              <Banner tone="danger">
                {(() => {
                  const c = awsErrorCopy(pasteError, "Could not connect the account.");
                  return (
                    <>
                      <strong className="font-medium">{c.title}.</strong> {c.body}
                    </>
                  );
                })()}
              </Banner>
            ) : null}
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!roleArn.trim() || connecting}
              onClick={() => void pasteConnect()}
            >
              {connecting ? "Connecting…" : "Connect with this role"}
            </Button>
          </div>
        ) : null}

        {session ? (
          <p className="text-[11px] text-muted-foreground">
            Stack <span className="font-mono">{session.stack_name}</span> · AuthSec ref{" "}
            <span className="font-mono">{session.stack_name.split("-").pop()}</span>
          </p>
        ) : null}

        <div className="flex justify-between gap-2">
          {/* Manual setup mints a different ExternalId, so a stack launched
              here cannot be finished there. Leaving is therefore explicit:
              this launch is cancelled first (use "Paste Role ARN instead" to
              finish it by hand). */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              startOver();
              onUseManual();
            }}
          >
            {terminal || sessionGone ? "Use manual setup" : "Cancel this launch and use manual setup"}
          </Button>
          <Button variant="outline" size="sm" onClick={startOver}>
            <RotateCcw className="mr-1 size-3.5" />
            Start over
          </Button>
        </div>
      </div>
    );
  }

  // Step 1 — choose AWS Region(s) and launch.
  const startCopy = startError ? quickCreateErrorCopy(startError.code, startError.error) : null;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>AWS Region(s)</Label>
        <SearchableSelect
          multiple
          options={regionOptions}
          value={regions}
          onChange={setRegions}
          placeholder="Select the AWS Regions to scan"
          searchPlaceholder="Search regions…"
        />
        <p className="text-xs text-muted-foreground">
          Which AWS Regions should AuthSec scan? This is the AWS Region where your resources run, not your
          location. Scan cost grows with each Region — start with the ones you use.
        </p>
      </div>

      {regions.length > 0 && deploymentRegion ? (
        <div className="space-y-1.5 rounded-md border p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span>
              The stack will be created in <strong className="font-medium">{awsRegionLabel(deploymentRegion)}</strong>.
            </span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground underline hover:text-foreground"
              onClick={() => setChangingDeployment((v) => !v)}
            >
              {changingDeployment ? "Done" : "Change"}
            </button>
          </div>
          {changingDeployment ? (
            <SearchableSelect
              options={supported.map((r) => ({ value: r, label: awsRegionLabel(r) }))}
              value={deploymentRegion}
              onChange={(v) => setDeploymentOverride(v)}
              placeholder="Stack Region"
            />
          ) : null}
          <p className="text-muted-foreground">
            One stack creates one read-only IAM role. IAM roles are global, so it covers every Region you
            selected.
          </p>
        </div>
      ) : null}

      {review}

      <Banner tone="info">
        Sign in to the AWS account you want to connect first. The AWS console opens with everything filled
        in — you only tick the IAM acknowledgement and click Create stack.
      </Banner>

      {startCopy ? (
        <Banner tone="danger">
          <strong className="font-medium">{startCopy.title}.</strong> {startCopy.body}
        </Banner>
      ) : null}

      {!deploymentRegion ? (
        <Banner tone="warning">
          This deployment has no AWS Region set up for automatic setup yet. Use manual setup instead.
        </Banner>
      ) : null}

      <Button
        className="w-full text-[length:var(--text-sm)] text-white"
        disabled={regions.length === 0 || !deploymentRegion || starting}
        onClick={() => void launch()}
      >
        <Rocket className="mr-1.5 size-4" />
        {starting ? "Preparing launch…" : "Launch in AWS"}
      </Button>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <AlertTriangle className="size-3.5" />
          GovCloud, China, or you'd rather deploy the template yourself?
        </span>
        <button type="button" className="underline hover:text-foreground" onClick={onUseManual}>
          Use manual setup
        </button>
      </div>
    </div>
  );
}
