/**
 * ④ SDK Integration and ⑤ Test Integration on the Add MCP page.
 *
 * ④ builds the SDK snippet + environment block for the server
 *   (resource-server-utils), masking the introspection secret on screen.
 * ⑤ runs the live protection check (POST /authsec/applications/:id/validate):
 *   AuthSec calls the server WITHOUT a token and reports each check. There is
 *   no console endpoint that sends a signed-in request, so that check is
 *   handed off to the MCP's Test tab instead of being shown here.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "react-hot-toast";

import { useGetApplicationQuery, useRotateApplicationSecretMutation } from "@/app/api/applicationsApi";
import { useValidateResourceServerMutation } from "@/app/api/resourceServersApi";
import { Button } from "@/components/ui/button";

import {
  buildEnvSnippet,
  buildSDKContent,
  INTEGRATION_LANGUAGE_LABELS,
  type IntegrationLanguage,
} from "../../resource-servers/resource-server-utils";
import { CheckList, CheckRow, CopyCodeButton, DarkCode, Segmented, Waiting } from "./SetupForm";
import { Notice } from "./WizardParts";

const LANGUAGES: IntegrationLanguage[] = ["python", "typescript", "go"];
const LANGUAGE_LABEL: Record<IntegrationLanguage, string> = {
  ...INTEGRATION_LANGUAGE_LABELS,
  typescript: "Node.js",
};

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "•".repeat(secret.length);
  return `${secret.slice(0, 4)}${"•".repeat(8)}${secret.slice(-4)}`;
}

function isPassing(status: string | undefined) {
  return status === "passed" || status === "passing";
}

export function McpSdkSection({
  serverId,
  secret,
  onSecretChange,
}: {
  serverId: string | null;
  secret: string | null;
  onSecretChange: (secret: string) => void;
}) {
  const { data: server } = useGetApplicationQuery(serverId ?? "", { skip: !serverId });
  const [rotate, { isLoading: rotating }] = useRotateApplicationSecretMutation();
  const [language, setLanguage] = useState<IntegrationLanguage>("python");

  const code = useMemo(() => {
    if (!server) return null;
    const sdk = buildSDKContent(language, server);
    const body = sdk.snippets.map((s) => `# ${s.title}\n${s.code}`).join("\n\n");
    return {
      full: `${body}\n\n${buildEnvSnippet(server, secret, "dotenv")}`,
      shown: `${body}\n\n${buildEnvSnippet(server, secret ? maskSecret(secret) : null, "dotenv")}`,
    };
  }, [language, server, secret]);

  if (!serverId || !server || !code) {
    return <Waiting>The code for your server appears here once the server is checked.</Waiting>;
  }

  const handleRotate = async () => {
    if (!window.confirm("Create a new secret? Any copy of the old secret stops working.")) return;
    try {
      const response = await rotate(serverId).unwrap();
      onSecretChange(response.introspection_secret);
      toast.success("New secret created. Copy it now: it is shown only once.");
    } catch (err) {
      toast.error((err as { data?: { error?: string } })?.data?.error ?? "Couldn't create a new secret.");
    }
  };

  return (
    <>
      <Segmented
        label="SDK language"
        value={language}
        onChange={setLanguage}
        options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
      />
      <DarkCode code={code.full} display={code.shown} label={`${LANGUAGE_LABEL[language]} integration code`} />
      <div className="flex flex-wrap items-center gap-3">
        <CopyCodeButton code={code.full} what="Code" />
        {secret ? (
          <span className="text-[length:13px] text-(--color-text-muted)">
            The secret is shown only once. Copy code copies the full value.
          </span>
        ) : (
          <>
            <span className="text-[length:13px] text-(--color-text-muted)">
              The secret was shown only once, when the server was added.
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => void handleRotate()} disabled={rotating}>
              {rotating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="size-3.5" aria-hidden />}
              Create a new secret
            </Button>
          </>
        )}
      </div>
    </>
  );
}

export function McpTestSection({ serverId }: { serverId: string | null }) {
  const { data: server } = useGetApplicationQuery(serverId ?? "", { skip: !serverId });
  const [validate, { data: result, isLoading: testing, error: testError }] = useValidateResourceServerMutation();

  if (!serverId || !server) {
    return <Waiting>Check the server first. The test calls it at its URL.</Waiting>;
  }

  const checks = result?.checks ?? [];
  const passed = result ? isPassing(result.status) : false;
  const failing = checks.filter((c) => !isPassing(c.status));
  const testErrorMessage = (testError as { data?: { error?: string } } | undefined)?.data?.error;

  return (
    <>
      <p className="text-[length:var(--font-size-sm)] text-(--color-text)">
        Deploy your server with the code above, then run the test. AuthSec sends real requests to your MCP.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="text-white"
          disabled={testing}
          onClick={() => {
            validate(serverId)
              .unwrap()
              .catch(() => undefined); // shown inline from `testError`
          }}
        >
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {testing ? "Testing…" : "Test Integration"}
        </Button>
        {result && !testing ? (
          <span className="text-[length:13px] text-(--color-text-muted)">
            Last run: {result.last_validated_at ? format(new Date(result.last_validated_at), "HH:mm") : "just now"} ·{" "}
            {checks.length} check{checks.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {testing ? (
        <CheckList>
          <CheckRow state="running" title="Calling your server" detail={<span className="font-mono">{server.resource_uri}</span>} />
        </CheckList>
      ) : testErrorMessage || (testError && !result) ? (
        <Notice tone="danger" title="Test didn't run.">
          {testErrorMessage ?? "AuthSec couldn't run the test. Check that the server is reachable."}
        </Notice>
      ) : checks.length > 0 ? (
        <CheckList>
          {checks.map((check) => (
            <CheckRow
              key={check.key}
              state={isPassing(check.status) ? "done" : "failed"}
              title={check.label}
              detail={
                <>
                  {check.message}
                  {check.observed ? (
                    <code className="mt-1 block overflow-auto rounded bg-(--color-surface-subtle) px-2 py-1 font-mono text-[length:13px] text-(--color-text)">
                      {check.observed}
                    </code>
                  ) : null}
                </>
              }
            />
          ))}
        </CheckList>
      ) : null}

      {result && !testing ? (
        passed ? (
          <Notice tone="success" title="Integration verified.">
            {server.name} blocks requests without a token. Save to keep these settings.
          </Notice>
        ) : (
          <Notice tone="danger" title="Test failed.">
            {failing.length} check{failing.length === 1 ? "" : "s"} failed. The reason for each is above.
          </Notice>
        )
      ) : null}

      <p className="text-[length:13px] text-(--color-text-muted)">
        A request with a signed-in user's token isn't sent from this page.{" "}
        <Link
          to={`/applications/${serverId}/test`}
          className="inline-flex items-center gap-1 font-medium text-(--color-primary-text) hover:underline"
        >
          Run it from the Test tab
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>{" "}
        after you save.
      </p>
    </>
  );
}
