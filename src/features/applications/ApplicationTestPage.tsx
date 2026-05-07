/**
 * `ApplicationTestPage` — protection-readiness check.
 *
 * Honest copy: backend currently has only `POST /test-login`, which
 * verifies that the OAuth setup is responsive and reports SDK / scan
 * state. It does NOT simulate "user X with client Y can call tool Z."
 *
 * The previous version fabricated a scenario engine. That's been
 * replaced with the real test-login result. Real per-scenario
 * simulation requires a backend endpoint we don't have.
 */

import { Loader2, Play, ShieldCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useTestLoginMutation,
  type TestLoginResponse,
} from "@/app/api/setupWizardApi";

import { useApplicationContext } from "./useApplicationContext";

export default function ApplicationTestPage() {
  const { application } = useApplicationContext();
  const [runTest, { data, isLoading, error }] = useTestLoginMutation();

  const apiError = error as { data?: { error?: string } } | undefined;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Test access
        </h2>
        <p className="text-sm text-muted-foreground">
          The available test today is the protection / OAuth-readiness
          check (
          <code className="font-mono text-xs">
            POST /authsec/resource-servers/{application.id}/test-login
          </code>
          ). It reads AuthSec's backend readiness state and reports the
          scan state and unmapped tools count. It does not make a live call
          through your deployed application or prove a specific user can call
          a specific tool yet.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck
            className="size-4 text-[var(--color-primary)]"
            aria-hidden
          />
          <h3 className="text-base font-semibold text-foreground">
            Run protection test
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Calls the backend test-login endpoint and reports back what AuthSec
          knows right now. Safe to re-run any time; use it as a setup
          signal, not a live runtime probe.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={() => runTest(application.id)} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Play className="mr-2 size-4" />
            )}
            {isLoading ? "Running…" : "Run test"}
          </Button>
          {data && (
            <p className="text-xs text-muted-foreground">
              Last run completed for{" "}
              <span className="font-semibold text-foreground">
                {data.resource_server.name}
              </span>
              .
            </p>
          )}
        </div>
      </Card>

      {apiError && (
        <Card className="border-l-4 border-l-[var(--color-danger)] bg-[color:color-mix(in_oklch,var(--color-danger)_6%,transparent)] p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-danger)]">
            Test failed
          </p>
          <p className="mt-1 text-sm text-foreground">
            {apiError.data?.error ??
              "test-login returned an error. Verify the SDK is deployed and check the backend logs."}
          </p>
        </Card>
      )}

      {data && <TestResultCard result={data} />}
    </div>
  );
}

function TestResultCard({ result }: { result: TestLoginResponse }) {
  const oauthOk = result.oauth.state === "ready";
  const sdkOk = result.sdk_enforcement.sdk_policy_state === "ready";
  const allOk = oauthOk && sdkOk;

  return (
    <Card
      className={cn(
        "border-l-4 p-5",
        allOk
          ? "border-l-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)]"
          : "border-l-[var(--color-warning)] bg-[color:color-mix(in_oklch,var(--color-warning)_6%,transparent)]",
      )}
    >
      <div className="flex items-start gap-3">
        {allOk ? (
          <ShieldCheck
            className="mt-1 size-5 text-[var(--color-success)]"
            aria-hidden
          />
        ) : (
          <ShieldAlert
            className="mt-1 size-5 text-[var(--color-warning)]"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              allOk
                ? "text-[var(--color-success)]"
                : "text-[var(--color-warning)]",
            )}
          >
            Result
          </p>
          <h3
            className={cn(
              "text-xl font-semibold tracking-tight",
              allOk
                ? "text-[var(--color-success)]"
                : "text-[var(--color-warning)]",
            )}
          >
            {allOk ? "Ready" : "Not yet ready"}
          </h3>
          <p className="mt-1 text-sm text-foreground">
            {allOk
              ? `AuthSec reports ${result.resource_server.name} is ready from stored setup state.`
              : `AuthSec reports one or more setup areas for ${result.resource_server.name} aren't ready yet.`}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <ResultRow
          label="Resource server state"
          value={result.resource_server.state}
          mono
        />
        <ResultRow label="Resource server status" value={result.resource_server.status} />
        <ResultRow
          label="OAuth state"
          value={result.oauth.state}
          mono
          tone={oauthOk ? "ok" : "warn"}
        />
        {result.oauth.ready_since && (
          <ResultRow
            label="OAuth ready since"
            value={new Date(result.oauth.ready_since).toLocaleString()}
          />
        )}
        <ResultRow
          label="SDK policy state"
          value={result.sdk_enforcement.sdk_policy_state}
          mono
          tone={sdkOk ? "ok" : "warn"}
        />
        <ResultRow
          label="Tools known to SDK"
          value={String(result.sdk_enforcement.tool_count)}
        />
        <ResultRow
          label="Unmapped tools"
          value={String(result.sdk_enforcement.unmapped_tools)}
          tone={
            result.sdk_enforcement.unmapped_tools > 0 ? "warn" : "ok"
          }
        />
      </dl>
    </Card>
  );
}

function ResultRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ok" | "warn" | "err";
}) {
  const TONE: Record<NonNullable<typeof tone>, string> = {
    ok: "text-[var(--color-success)]",
    warn: "text-[var(--color-warning)]",
    err: "text-[var(--color-danger)]",
  };
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold",
          mono && "font-mono text-xs",
          tone ? TONE[tone] : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
