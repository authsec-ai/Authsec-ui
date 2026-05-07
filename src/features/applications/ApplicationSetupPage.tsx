/**
 * `ApplicationSetupPage` — install protection (deployment task), fully wired.
 *
 * Backend sources of truth:
 *   • `useGetSDKManifestStatusQuery` → has the SDK actually started
 *      publishing yet?
 *   • `useRotateResourceServerSecretMutation` → re-issue the introspection
 *      secret if the original was lost.
 *   • `useValidateResourceServerMutation` → run a real protection check.
 *
 * The previous version handed admins a tiny env block missing every
 * field the Go SDK actually needs. The new env block is built from
 * `resource-server-utils` (the same helpers that power the existing
 * SDK page) so it matches the real `authsecsdk.Config` struct, plus a
 * dedicated slot for the upstream service credential (e.g. GitHub PAT)
 * that admins frequently forget is separate from the AuthSec token.
 */

import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useRotateResourceServerSecretMutation,
  useValidateResourceServerMutation,
} from "@/app/api/resourceServersApi";
import { useGetSDKManifestStatusQuery } from "@/app/api/setupWizardApi";

import { useApplicationContext } from "./useApplicationContext";
import {
  buildIntegrationPrompt,
  computeAuthSecAPIOrigin,
  computeIntrospectionURL,
  computeJwksURL,
  computeOAuthIssuerURL,
  getDeclaredScopes,
} from "../resource-servers/resource-server-utils";

const SECRET_PLACEHOLDER = "<paste the one-time introspection secret>";
const UPSTREAM_PLACEHOLDER = "<your upstream service credential, e.g. GitHub PAT>";

export default function ApplicationSetupPage() {
  const { application } = useApplicationContext();
  const navigate = useNavigate();
  const location = useLocation();
  const createSecret =
    (location.state as { introspectionSecret?: string } | null)?.introspectionSecret ??
    null;

  const { data: manifest, isLoading: manifestLoading } =
    useGetSDKManifestStatusQuery(application.id);
  const [rotateSecret, { isLoading: rotating }] =
    useRotateResourceServerSecretMutation();
  const [validate, { isLoading: validating }] =
    useValidateResourceServerMutation();

  const [secretValue, setSecretValue] = useState<string | null>(createSecret);
  const [secretVisible, setSecretVisible] = useState(Boolean(createSecret));
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);

  const envBlock = useMemo(
    () => buildEnvBlock(application, secretValue),
    [application, secretValue],
  );
  const goConfig = useMemo(() => buildGoConfig(application), [application]);

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Couldn't copy. Use the visible text instead.");
    }
  };

  const handleRotate = async () => {
    if (!window.confirm(
      "Rotate the introspection secret? Existing deployments will need to be updated with the new value.",
    )) return;
    try {
      const response = await rotateSecret(application.id).unwrap();
      setSecretValue(response.introspection_secret);
      setSecretVisible(true);
      toast.success("Secret rotated. Copy the new value now — AuthSec won't show it again.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't rotate secret.");
    }
  };

  const handleValidate = async () => {
    try {
      const result = await validate(application.id).unwrap();
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

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Install protection
        </h2>
        <p className="text-sm text-muted-foreground">
          Add the AuthSec SDK so this application blocks unauthenticated
          calls, publishes its tool manifest, and fetches runtime policy.
        </p>
      </header>

      <SecretBanner
        secret={secretValue}
        visible={secretVisible}
        acknowledged={secretAcknowledged}
        onToggleVisible={() => setSecretVisible((current) => !current)}
        onCopy={() =>
          handleCopy(
            secretValue ?? SECRET_PLACEHOLDER,
            "Introspection secret",
          )
        }
        onAcknowledge={() => setSecretAcknowledged(true)}
        onRotate={handleRotate}
        rotating={rotating}
      />

      <ManifestBanner
        loading={manifestLoading}
        lastSuccess={manifest?.last_success}
        lastAttempt={manifest?.last_attempt}
        neverSeen={manifest?.never_seen ?? false}
      />

      <section>
        <h3 className="text-sm font-semibold text-foreground">
          Choose your install path
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          All three result in the same protection. Coding-agent is the
          fastest if your team uses Claude or Cursor.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <InstallCard
            tag="FASTEST"
            title="Use coding agent"
            description="Generate a complete Go integration prompt with real values. Paste into Claude or Cursor and the agent wraps your existing handler."
            primary="Copy coding-agent prompt"
            onPrimary={() =>
              handleCopy(
                buildIntegrationPrompt("go", application),
                "Coding-agent prompt",
              )
            }
            secondary="Open SDK steps"
            onSecondary={() =>
              navigate(`/resource-servers/${application.id}/sdk`)
            }
            highlight
          />
          <InstallCard
            tag="MANUAL"
            title="Install SDK manually"
            description="Use the Go resource-server guide. Wrap your existing MCP HTTP handler with authsecsdk.MountMCP."
            primary="Open SDK steps"
            onPrimary={() =>
              navigate(`/resource-servers/${application.id}/sdk`)
            }
          />
          <InstallCard
            tag="DEPLOY"
            title="Environment variables"
            description="Copy the .env block (real fields, real values) for your secret manager."
            primary="Copy env block"
            onPrimary={() => handleCopy(envBlock, "Env block")}
          />
        </div>
      </section>

      {/* Real env block + Go config — both visible so admins can copy
          either, no hidden fields. */}
      <section className="grid gap-3 lg:grid-cols-2">
        <CodeBlock
          title=".env"
          subtitle="Map these into your deployment's secret manager."
          value={envBlock}
          onCopy={() => handleCopy(envBlock, ".env block")}
        />
        <CodeBlock
          title="Go SDK config"
          subtitle={
            <>
              Maps to{" "}
              <code className="font-mono">authsecsdk.Config</code>.
              <code className="ml-1 font-mono">PublishManifest: true</code>{" "}
              is required for tool discovery.
            </>
          }
          value={goConfig}
          onCopy={() => handleCopy(goConfig, "Go SDK config")}
        />
      </section>

      <ExpectedResult
        validating={validating}
        onValidate={handleValidate}
      />

      <p className="text-[11px] italic text-muted-foreground">
        Already deployed?{" "}
        <Link
          to={`/applications/${application.id}/launch`}
          className="font-semibold text-[var(--color-primary)] hover:underline"
        >
          Open Launch
        </Link>{" "}
        to see the real setup checklist.
      </p>
    </div>
  );
}

// ── Builders ──────────────────────────────────────────────────────────────

function buildEnvBlock(server: {
  id: string;
  resource_uri: string;
  name: string;
}, secretValue: string | null): string {
  const issuer = computeOAuthIssuerURL();
  const apiOrigin = computeAuthSecAPIOrigin();
  const jwks = computeJwksURL();
  const introspect = computeIntrospectionURL();
  const isGitHub = server.name.toLowerCase().includes("github");
  return [
    `# AuthSec — protected resource configuration`,
    `AUTHSEC_RESOURCE_SERVER_ID=${server.id}`,
    `AUTHSEC_RESOURCE_URI=${server.resource_uri}`,
    `AUTHSEC_RESOURCE_NAME=${server.name}`,
    `AUTHSEC_ISSUER=${issuer}`,
    `AUTHSEC_AUTHORIZATION_SERVER=${apiOrigin}`,
    `AUTHSEC_JWKS_URL=${jwks}`,
    `AUTHSEC_INTROSPECTION_URL=${introspect}`,
    `AUTHSEC_INTROSPECTION_CLIENT_ID=${server.id}`,
    `AUTHSEC_INTROSPECTION_CLIENT_SECRET=${secretValue ?? SECRET_PLACEHOLDER}`,
    `AUTHSEC_INTROSPECTION_SECRET=${secretValue ?? SECRET_PLACEHOLDER}`,
    `AUTHSEC_POLICY_MODE=remote_required`,
    `AUTHSEC_PUBLISH_MANIFEST=true`,
    ``,
    `# Upstream service credential — DO NOT confuse with the AuthSec`,
    `# user token. AuthSec validates the user; the upstream credential`,
    `# stays server-side and authenticates this MCP to its provider.`,
    isGitHub
      ? `AUTHSEC_UPSTREAM_GITHUB_TOKEN=${UPSTREAM_PLACEHOLDER}`
      : `UPSTREAM_API_TOKEN=${UPSTREAM_PLACEHOLDER}`,
  ].join("\n");
}

function buildGoConfig(server: {
  id: string;
  resource_uri: string;
  name: string;
  scopes_supported: string[];
}): string {
  const scopes = getDeclaredScopes(server);
  const issuer = computeOAuthIssuerURL();
  const apiOrigin = computeAuthSecAPIOrigin();
  const jwks = computeJwksURL();
  const introspect = computeIntrospectionURL();
  return [
    `cfg := authsecsdk.Config{`,
    `    Issuer:                    "${issuer}",`,
    `    AuthorizationServer:       "${apiOrigin}",`,
    `    JWKSURL:                   "${jwks}",`,
    `    IntrospectionURL:          "${introspect}",`,
    `    IntrospectionClientID:     "${server.id}",`,
    `    IntrospectionClientSecret: os.Getenv("AUTHSEC_INTROSPECTION_CLIENT_SECRET"),`,
    `    ResourceServerID:          "${server.id}",`,
    `    ResourceURI:               "${server.resource_uri}",`,
    `    ResourceName:              "${server.name}",`,
    `    SupportedScopes:           []string{${scopes.map((s) => `"${s}"`).join(", ")}},`,
    `    PolicyMode:                authsecsdk.PolicyModeRemoteRequired,`,
    `    ValidationMode:            authsecsdk.ValidationModeJWTAndIntrospect,`,
    `    PublishManifest:           true,`,
    `}`,
    ``,
    `mux := http.NewServeMux()`,
    `if err := authsecsdk.MountMCP(mux, "${server.resource_uri.replace(/^https?:\/\/[^/]+/, "")}", existingMCPHandler, cfg); err != nil {`,
    `    log.Fatal(err)`,
    `}`,
  ].join("\n");
}

// ── Sub-components ────────────────────────────────────────────────────────

function SecretBanner({
  secret,
  visible,
  acknowledged,
  onToggleVisible,
  onCopy,
  onAcknowledge,
  onRotate,
  rotating,
}: {
  secret: string | null;
  visible: boolean;
  acknowledged: boolean;
  onToggleVisible: () => void;
  onCopy: () => void;
  onAcknowledge: () => void;
  onRotate: () => void;
  rotating: boolean;
}) {
  if (!secret || acknowledged) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Introspection secret
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {secret
              ? "Secret copied and collapsed. Rotate if this deployment needs a new value."
              : "AuthSec only shows the secret at creation time or immediately after rotation."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRotate} disabled={rotating}>
          {rotating ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="mr-1.5 size-3.5" />
          )}
          Rotate secret
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 border-l-4 p-3",
        "border-l-[var(--color-warning)] bg-[color:color-mix(in_oklch,var(--color-warning)_8%,transparent)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-warning)]">
          One-time introspection secret
        </p>
        <code className="flex-1 truncate rounded-sm bg-foreground/[0.06] px-3 py-1.5 font-mono text-xs text-foreground">
          {secret && visible ? secret : "•".repeat(36)}
        </code>
        <Button size="sm" variant="outline" onClick={onCopy} disabled={!secret}>
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
        <Button size="sm" variant="outline" onClick={onToggleVisible} disabled={!secret}>
          {visible ? (
            <EyeOff className="mr-1.5 size-3.5" />
          ) : (
            <Eye className="mr-1.5 size-3.5" />
          )}
          {visible ? "Hide" : "Show"}
        </Button>
        <Button size="sm" variant="outline" onClick={onRotate} disabled={rotating}>
          {rotating ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="mr-1.5 size-3.5" />
          )}
          Rotate
        </Button>
        <Button size="sm" onClick={onAcknowledge}>
          I copied this
        </Button>
      </div>
      <p className="text-[11px] italic text-muted-foreground">
        AuthSec only displays this value at creation time and immediately
        after rotation. If you've lost it, rotate to get a new one; every
        existing deployment will need updating.
      </p>
    </Card>
  );
}

function ManifestBanner({
  loading,
  lastSuccess,
  lastAttempt,
  neverSeen,
}: {
  loading: boolean;
  lastSuccess?: { attempted_at: string; tool_count?: number; manifest_version?: string } | null;
  lastAttempt?: { attempted_at: string; status: string; reason?: string } | null;
  neverSeen: boolean;
}) {
  if (loading) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Checking SDK manifest status…
      </Card>
    );
  }
  if (neverSeen) {
    return (
      <Card className="border-l-4 border-l-[var(--color-warning)] bg-[color:color-mix(in_oklch,var(--color-warning)_6%,transparent)] p-3 text-sm">
        <AlertTriangle className="mr-2 inline size-4 text-[var(--color-warning)]" />
        AuthSec hasn't received any manifest from this application yet.
        Deploy the SDK and trigger one tool call.
      </Card>
    );
  }
  if (lastSuccess) {
    return (
      <Card className="border-l-4 border-l-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)] p-3 text-sm">
        <CheckCircle2 className="mr-2 inline size-4 text-[var(--color-success)]" />
        SDK manifest received{" "}
        <span className="text-muted-foreground">
          ({lastSuccess.tool_count ?? "?"} tools
          {lastSuccess.manifest_version
            ? ` · v${lastSuccess.manifest_version}`
            : ""}{" "}
          · {new Date(lastSuccess.attempted_at).toLocaleString()})
        </span>
      </Card>
    );
  }
  if (lastAttempt) {
    return (
      <Card className="border-l-4 border-l-[var(--color-danger)] bg-[color:color-mix(in_oklch,var(--color-danger)_6%,transparent)] p-3 text-sm">
        <AlertTriangle className="mr-2 inline size-4 text-[var(--color-danger)]" />
        Last manifest attempt failed
        {lastAttempt.reason ? `: ${lastAttempt.reason}` : ""}
        <span className="ml-1 text-muted-foreground">
          ({new Date(lastAttempt.attempted_at).toLocaleString()})
        </span>
      </Card>
    );
  }
  return null;
}

function InstallCard({
  tag,
  title,
  description,
  primary,
  onPrimary,
  secondary,
  onSecondary,
  highlight,
}: {
  tag: string;
  title: string;
  description: string;
  primary: string;
  onPrimary: () => void;
  secondary?: string;
  onSecondary?: () => void;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-5",
        highlight &&
          "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_5%,transparent)]",
      )}
    >
      <span
        className={cn(
          "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          highlight
            ? "bg-[var(--color-primary)] text-white"
            : "bg-muted text-muted-foreground",
        )}
      >
        {tag}
      </span>
      <h4 className="text-base font-semibold tracking-tight text-foreground">
        {title}
      </h4>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-auto space-y-2 pt-2">
        <Button
          className="w-full justify-center"
          variant={highlight ? "default" : "outline"}
          onClick={onPrimary}
        >
          {primary} <span aria-hidden>→</span>
        </Button>
        {secondary && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="block w-full text-center text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            {secondary}
          </button>
        )}
      </div>
    </Card>
  );
}

function CodeBlock({
  title,
  subtitle,
  value,
  onCopy,
}: {
  title: string;
  subtitle: React.ReactNode;
  value: string;
  onCopy: () => void;
}) {
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onCopy}>
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md bg-foreground/[0.04] p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {value}
      </pre>
    </Card>
  );
}

const EXPECTED_CHECKS = [
  "Unauthenticated request returns 401 with Bearer challenge.",
  "Bearer challenge includes resource_metadata.",
  "SDK manifest publishes tools (≥ 1).",
  "Remote policy mode required — open mode never allowed.",
];

function ExpectedResult({
  validating,
  onValidate,
}: {
  validating: boolean;
  onValidate: () => void;
}) {
  return (
    <Card
      className={cn(
        "grid gap-4 border-l-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center",
        "border-l-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)]",
      )}
    >
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
          Expected result after you deploy
        </p>
        <ul className="space-y-1.5">
          {EXPECTED_CHECKS.map((check) => (
            <li
              key={check}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <CheckCircle2
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]"
              />
              <span>{check}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col items-stretch gap-1 sm:items-end">
        <Button onClick={onValidate} disabled={validating}>
          {validating ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}
          {validating ? "Running…" : "Run protection check"}
        </Button>
        <p className="text-[11px] italic text-muted-foreground sm:text-right">
          Calls{" "}
          <code className="font-mono">POST /resource-servers/:id/validate</code>
        </p>
      </div>
    </Card>
  );
}
