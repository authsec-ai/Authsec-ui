/**
 * `ApplicationSetupPage` — Protect endpoint, a four-step wizard.
 *
 * Steps:
 *   1. Pick your stack (language + shell — drives every snippet below)
 *   2. Wire the AuthSec SDK (coding-agent prompt OR manual snippet)
 *   3. Configure environment (.env or OS-aware shell exports, with secret)
 *   4. Verify protection (bearer challenge + manifest)
 *
 * The lang + shell selections persist in the URL (?lang=&os=) so the page is
 * shareable and survives reload. All snippet generation goes through
 * `resource-server-utils` so the SDK guide page and the docs share a single
 * source of truth.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useRotateResourceServerSecretMutation,
  useValidateResourceServerMutation,
} from "@/app/api/resourceServersApi";
import { useGetSDKManifestStatusQuery } from "@/app/api/setupWizardApi";

import { useApplicationContext } from "./useApplicationContext";
import { SetupStep, type SetupStepState } from "./components/SetupStep";
import {
  buildEnvSnippet,
  buildIntegrationPrompt,
  buildSDKContent,
  ENV_SHELL_LABELS,
  getOSDefaultShell,
  INTEGRATION_LANGUAGE_LABELS,
  type EnvShell,
  type IntegrationLanguage,
} from "../resource-servers/resource-server-utils";

const LANG_VALUES: readonly IntegrationLanguage[] = ["go", "python", "typescript"];
const SHELL_VALUES: readonly EnvShell[] = ["dotenv", "bash", "pwsh", "cmd"];

/** Short labels for the shell tab triggers — kept local so ENV_SHELL_LABELS stays unchanged. */
const SHELL_TAB_LABELS: Record<EnvShell, string> = {
  dotenv: ".env file",
  bash: "macOS / Linux",
  pwsh: "PowerShell",
  cmd: "CMD",
};

function isLang(value: string | null): value is IntegrationLanguage {
  return value !== null && (LANG_VALUES as readonly string[]).includes(value);
}

function isShell(value: string | null): value is EnvShell {
  return value !== null && (SHELL_VALUES as readonly string[]).includes(value);
}

export default function ApplicationSetupPage() {
  const { application } = useApplicationContext();
  const location = useLocation();
  const createSecret =
    (location.state as { introspectionSecret?: string } | null)?.introspectionSecret ??
    null;

  const [searchParams, setSearchParams] = useSearchParams();
  const langParam = searchParams.get("lang");
  const osParam = searchParams.get("os");
  const language: IntegrationLanguage = isLang(langParam) ? langParam : "go";
  const shell: EnvShell = isShell(osParam) ? osParam : getOSDefaultShell();

  const setLanguage = (next: IntegrationLanguage) => {
    const params = new URLSearchParams(searchParams);
    params.set("lang", next);
    setSearchParams(params, { replace: true });
  };
  const setShell = (next: EnvShell) => {
    const params = new URLSearchParams(searchParams);
    params.set("os", next);
    setSearchParams(params, { replace: true });
  };

  // Pin defaults into the URL on first mount so the URL is always shareable.
  useEffect(() => {
    if (langParam && osParam) return;
    const params = new URLSearchParams(searchParams);
    if (!langParam) params.set("lang", language);
    if (!osParam) params.set("os", shell);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: manifest, isLoading: manifestLoading } =
    useGetSDKManifestStatusQuery(application.id);
  const [rotateSecret, { isLoading: rotating }] =
    useRotateResourceServerSecretMutation();
  const [validate, { isLoading: validating }] =
    useValidateResourceServerMutation();

  const [secretValue, setSecretValue] = useState<string | null>(createSecret);
  const [secretVisible, setSecretVisible] = useState(Boolean(createSecret));
  const [installMode, setInstallMode] = useState<"agent" | "manual">("agent");
  const [validationFresh, setValidationFresh] = useState(false);

  const prompt = useMemo(
    () => buildIntegrationPrompt(language, application),
    [language, application],
  );
  const sdkContent = useMemo(
    () => buildSDKContent(language, application),
    [language, application],
  );
  const envSnippet = useMemo(
    () => buildEnvSnippet(application, secretValue, shell),
    [application, secretValue, shell],
  );

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Couldn't copy. Use the visible text instead.");
    }
  };

  const handleRotate = async () => {
    if (
      !window.confirm(
        "Rotate the introspection secret? Existing deployments will need to be updated with the new value.",
      )
    )
      return;
    try {
      const response = await rotateSecret(application.id).unwrap();
      setSecretValue(response.introspection_secret);
      setSecretVisible(true);
      toast.success(
        "Secret rotated. Copy the new value now — AuthSec won't show it again.",
      );
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't rotate secret.");
    }
  };

  const handleValidate = async () => {
    setValidationFresh(false);
    try {
      const result = await validate(application.id).unwrap();
      setValidationFresh(true);
      if (result.status === "passed") {
        toast.success("Protection check passed.");
      } else {
        toast.error("Protection check returned issues. Review below.");
      }
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Validation failed.");
    }
  };

  const manifestPassed = Boolean(manifest?.last_success);
  const protectionPassed = application.last_validation_status === "passed";
  const step4State: SetupStepState =
    manifestPassed && protectionPassed ? "done" : "active";

  return (
    <div className="space-y-0">
      <header className="mb-5 space-y-1">
        <h2 className="text-[22px] font-semibold leading-7 text-slate-950">
          Protect endpoint
        </h2>
        <p className="text-sm text-slate-600">
          Wire the AuthSec SDK, configure the environment for your shell, and
          verify that unauthenticated calls fail closed.
        </p>
      </header>

      {/* ── Step 1: Pick your stack ─────────────────────────────────── */}
      <SetupStep number={1} title="Pick your stack" state="active">
        <p className="text-sm text-slate-600">
          Choose the language and OS shell. Every snippet below adapts
          automatically — and the URL keeps your selection, so this page is
          shareable.
        </p>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <span className="w-[4.5rem] shrink-0 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-400">
            Language
          </span>
          <Tabs
            value={language}
            onValueChange={(v) => setLanguage(v as IntegrationLanguage)}
          >
            <TabsList>
              {LANG_VALUES.map((l) => (
                <TabsTrigger key={l} value={l}>
                  {INTEGRATION_LANGUAGE_LABELS[l]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <span className="w-[4.5rem] shrink-0 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-400">
            Shell
          </span>
          <Tabs value={shell} onValueChange={(v) => setShell(v as EnvShell)}>
            <TabsList>
              {SHELL_VALUES.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {SHELL_TAB_LABELS[s]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </SetupStep>

      {/* Connector */}
      <div className="ml-[33px] h-3 w-px bg-slate-200" />

      {/* ── Step 2: Wire the SDK ────────────────────────────────────── */}
      <SetupStep number={2} title="Wire the AuthSec SDK" state="active">
        <Tabs
          value={installMode}
          onValueChange={(v) => setInstallMode(v as "agent" | "manual")}
        >
          <TabsList>
            <TabsTrigger value="agent">
              <Sparkles className="mr-1.5 size-3.5" />
              Coding agent · fastest
            </TabsTrigger>
            <TabsTrigger value="manual">Manual install</TabsTrigger>
          </TabsList>
        </Tabs>

        {installMode === "agent" ? (
          <>
            <p className="text-sm text-slate-600">
              Paste this prompt into Claude Code or Cursor. The agent reads
              your repo and wires the {INTEGRATION_LANGUAGE_LABELS[language]}{" "}
              SDK with real values from this resource server.
            </p>
            <CodeBlock
              title={`Coding-agent prompt · ${INTEGRATION_LANGUAGE_LABELS[language]}`}
              subtitle="One prompt, every value pre-filled."
              value={prompt}
              onCopy={() => handleCopy(prompt, "Coding-agent prompt")}
              compact
            />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Install the SDK and wrap your existing MCP handler. Same env
              vars as Step 3 below.
            </p>
            {sdkContent.snippets.map((snippet) => (
              <CodeBlock
                key={snippet.title}
                title={snippet.title}
                subtitle=""
                value={snippet.code}
                onCopy={() => handleCopy(snippet.code, snippet.title)}
                compact
              />
            ))}
          </>
        )}
      </SetupStep>

      {/* Connector */}
      <div className="ml-[33px] h-3 w-px bg-slate-200" />

      {/* ── Step 3: Configure environment ───────────────────────────── */}
      <SetupStep number={3} title="Configure environment" state="active">
        <SecretStrip
          secret={secretValue}
          visible={secretVisible}
          onToggleVisible={() => setSecretVisible((v) => !v)}
          onCopy={() =>
            handleCopy(
              secretValue ?? "",
              "Introspection secret",
            )
          }
          onRotate={handleRotate}
          rotating={rotating}
        />
        <CodeBlock
          title={ENV_SHELL_LABELS[shell]}
          subtitle="Map these into your deployment's secret manager — or paste straight into your shell."
          value={envSnippet}
          onCopy={() =>
            handleCopy(envSnippet, `${ENV_SHELL_LABELS[shell]} block`)
          }
        />
      </SetupStep>

      {/* Connector */}
      <div className="ml-[33px] h-3 w-px bg-slate-200" />

      {/* ── Step 4: Verify protection ───────────────────────────────── */}
      <SetupStep
        number={4}
        title="Verify protection"
        state={step4State}
        summary={
          step4State === "done"
            ? `Protection check passed and AuthSec has the SDK manifest. Launch is unlocked.`
            : undefined
        }
      >
        <p className="text-sm text-slate-600">
          Unauthenticated calls should return a Bearer challenge. Once your
          SDK publishes a manifest, both checks turn green and{" "}
          <strong>Launch application</strong> unlocks.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckTile
            ok={protectionPassed && validationFresh}
            warn={!protectionPassed}
            title="Bearer challenge"
            body="GET /mcp without a token must return 401 with a WWW-Authenticate challenge pointing at AuthSec."
          />
          <CheckTile
            ok={manifestPassed}
            warn={!manifestPassed}
            loading={manifestLoading}
            title="SDK manifest published"
            body={
              manifest?.last_success
                ? `Received ${manifest.last_success.tool_count ?? "?"} tools${
                    manifest.last_success.manifest_version
                      ? ` · v${manifest.last_success.manifest_version}`
                      : ""
                  }.`
                : "AuthSec hasn't received any manifest yet. Deploy the SDK and trigger one tools/list call."
            }
          />
        </div>
        <Button onClick={handleValidate} disabled={validating}>
          {validating ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          {validating ? "Running…" : "Run protection check"}
        </Button>
      </SetupStep>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SecretStrip({
  secret,
  visible,
  onToggleVisible,
  onCopy,
  onRotate,
  rotating,
}: {
  secret: string | null;
  visible: boolean;
  onToggleVisible: () => void;
  onCopy: () => void;
  onRotate: () => void;
  rotating: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        secret ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-amber-700">
          One-time introspection secret
        </p>
        <code className="mt-0.5 block truncate font-mono text-[12px] leading-relaxed text-slate-800">
          {secret
            ? visible
              ? secret
              : "•".repeat(48)
            : "Rotate to generate a new value."}
        </code>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={onCopy} disabled={!secret} className="h-7">
          <Copy className="mr-1 size-3" /> Copy
        </Button>
        <Button size="sm" variant="outline" onClick={onToggleVisible} disabled={!secret} className="h-7">
          {visible ? <EyeOff className="mr-1 size-3" /> : <Eye className="mr-1 size-3" />}
          {visible ? "Hide" : "Show"}
        </Button>
        <Button size="sm" variant="outline" onClick={onRotate} disabled={rotating} className="h-7">
          {rotating ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCcw className="mr-1 size-3" />}
          Rotate
        </Button>
      </div>
    </div>
  );
}

function CodeBlock({
  title,
  subtitle,
  value,
  onCopy,
  compact,
}: {
  title: string;
  subtitle: string;
  value: string;
  onCopy: () => void;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-slate-400">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="border-white/10 bg-white/8 text-slate-300 hover:bg-white/15 hover:text-white"
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
      </div>
      <pre
        className={cn(
          "overflow-auto p-4 font-mono text-[12px] leading-6 text-slate-100",
          compact ? "max-h-[18rem]" : "max-h-[22rem]",
        )}
      >
        {value}
      </pre>
    </div>
  );
}

function CheckTile({
  ok,
  warn,
  loading,
  title,
  body,
}: {
  ok?: boolean;
  warn?: boolean;
  loading?: boolean;
  title: string;
  body: string;
}) {
  const tone = ok ? "success" : warn ? "warning" : "neutral";
  const t = {
    success: {
      wrap: "border-emerald-200 bg-emerald-50",
      icon: "text-emerald-600 bg-emerald-100",
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
      dot: "bg-emerald-600",
    },
    warning: {
      wrap: "border-amber-200 bg-amber-50",
      icon: "text-amber-600 bg-amber-100",
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      dot: "bg-amber-500",
    },
    neutral: {
      wrap: "border-slate-200 bg-white",
      icon: "text-slate-500 bg-slate-100",
      badge: "bg-slate-100 text-slate-600 border-slate-200",
      dot: "bg-slate-400",
    },
  }[tone];

  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-4", t.wrap)}>
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          t.icon,
        )}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : ok ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <AlertTriangle className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-[13px] font-semibold text-slate-900">{title}</h4>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              t.badge,
            )}
          >
            <span className={cn("size-1.5 rounded-full", t.dot)} />
            {loading ? "Checking" : ok ? "Passed" : "Pending"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">{body}</p>
      </div>
    </div>
  );
}
