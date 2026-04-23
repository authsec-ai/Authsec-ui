import { useMemo, useState } from "react";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useGetResourceServerQuery } from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableCard } from "@/theme/components/cards";

import {
  INTEGRATION_LANGUAGE_LABELS,
  buildSDKContent,
  computeAuthorizeURL,
  computeIntrospectionURL,
  computeJwksURL,
  computeMcpEndpointURL,
  computeMetadataPath,
  computeMetadataURL,
  computeOAuthIssuerURL,
  computeTokenURL,
  type IntegrationLanguage,
} from "./resource-server-utils";

const LANGUAGES: IntegrationLanguage[] = ["go", "typescript", "python"];

export function ResourceServerSDKPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const { data: server, isLoading } = useGetResourceServerQuery(id);
  const [language, setLanguage] = useState<IntegrationLanguage>("go");

  const content = useMemo(
    () => (server ? buildSDKContent(language, server) : null),
    [language, server],
  );
  const derivedValues = useMemo(() => {
    if (!server) return null;
    return {
      mcpEndpointURL: computeMcpEndpointURL(server),
      metadataPath: computeMetadataPath(server.resource_uri),
      metadataURL: computeMetadataURL(server.resource_uri),
      issuerURL: computeOAuthIssuerURL(),
      authorizeURL: computeAuthorizeURL(),
      tokenURL: computeTokenURL(),
      jwksURL: computeJwksURL(),
      introspectionURL: computeIntrospectionURL(),
    };
  }, [server]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={server ? `${server.name} SDK Guide` : "SDK Guide"}
          description="Use the resource-server-aware guide as the integration reference for the selected protected MCP resource."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(server ? `/resource-servers/${server.id}` : "/resource-servers")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Details
              </Button>
              {server ? (
                <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/prompt`)}>
                  <MessageSquareText className="mr-2 h-4 w-4" />
                  Generate Prompt
                </Button>
              ) : null}
            </div>
          }
        />

        {isLoading || !server || !content ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading resource server…" : "Resource server not found."}
          </div>
        ) : (
          <div className="space-y-4">
            <TableCard className="space-y-4 p-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">Validation Surface</h3>
                <p className="text-sm text-muted-foreground">
                  Use these exact values when wiring the local MCP server, testing discovery, and validating the browser login flow.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { label: "MCP endpoint URL", value: derivedValues?.mcpEndpointURL },
                  { label: "Metadata path", value: derivedValues?.metadataPath },
                  { label: "Metadata URL", value: derivedValues?.metadataURL },
                  { label: "OAuth issuer", value: derivedValues?.issuerURL },
                  { label: "Authorize URL", value: derivedValues?.authorizeURL },
                  { label: "Token URL", value: derivedValues?.tokenURL },
                  { label: "JWKS URL", value: derivedValues?.jwksURL },
                  { label: "Introspection URL", value: derivedValues?.introspectionURL },
                ].map((item) => (
                  <div key={item.label} className="space-y-2 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-medium text-foreground">{item.label}</h4>
                      {item.value ? (
                        <CopyButton text={item.value} label={item.label} variant="outline" showLabel />
                      ) : null}
                    </div>
                    <p className="break-all font-mono text-xs text-muted-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="space-y-2 rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-foreground">Smoke Test Commands</h4>
                    <CopyButton
                      text={`curl -i ${derivedValues?.metadataURL}\n\ncurl -i -X POST ${derivedValues?.mcpEndpointURL} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}
                      label="Smoke Test Commands"
                      variant="outline"
                      showLabel
                    />
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                    <code>{`curl -i ${derivedValues?.metadataURL}

curl -i -X POST ${derivedValues?.mcpEndpointURL} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`}</code>
                  </pre>
                </div>

                <div className="space-y-3 rounded-xl border p-4">
                  <h4 className="text-sm font-medium text-foreground">Acceptance Checklist</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Metadata route returns HTTP 200 at the derived metadata URL.</li>
                    <li>Unauthenticated MCP POST returns HTTP 401 with a `resource_metadata` Bearer challenge.</li>
                    <li>`tools/list` hides tools outside the granted AuthSec scopes.</li>
                    <li>`tools/call` returns `403 insufficient_scope` for blocked tools.</li>
                    <li>Policy unavailability returns HTTP 503 instead of silently allowing access.</li>
                    <li>Browser login reaches AuthSec and returns to the MCP host with a usable token.</li>
                  </ul>
                </div>
              </div>

              {server.name.toLowerCase().includes("github") ? (
                <div className="space-y-2 rounded-xl border p-4">
                  <h4 className="text-sm font-medium text-foreground">GitHub MCP Server Notes</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Keep the GitHub PAT or installation token server-side; never forward the AuthSec access token to GitHub.</li>
                    <li>
                      Set the MCP path to <code className="font-mono text-xs text-foreground">{server.protected_base_path}</code> and register the same path in AuthSec.
                    </li>
                    <li>Use the Go SDK as the protection layer, then adapt the validated AuthSec principal into the server&apos;s existing GitHub token path.</li>
                  </ul>
                </div>
              ) : null}
            </TableCard>

            <TableCard className="space-y-6 p-6">
              <Tabs value={language} onValueChange={(value) => setLanguage(value as IntegrationLanguage)}>
                <TabsList>
                  {LANGUAGES.map((item) => (
                    <TabsTrigger key={item} value={item}>
                      {INTEGRATION_LANGUAGE_LABELS[item]}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {LANGUAGES.map((item) => (
                  <TabsContent key={item} value={item} className="space-y-6 pt-4">
                    <div className="space-y-3">
                      {content.intro.map((line) => (
                        <p key={line} className="text-sm text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </div>

                    {content.snippets.map((snippet) => (
                      <div key={snippet.title} className="space-y-2 rounded-xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-medium text-foreground">{snippet.title}</h3>
                          <CopyButton
                            text={snippet.code}
                            label={snippet.title}
                            variant="outline"
                            showLabel
                          />
                        </div>
                        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                          <code>{snippet.code}</code>
                        </pre>
                      </div>
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            </TableCard>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResourceServerSDKPage;
