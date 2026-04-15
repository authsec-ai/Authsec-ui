import { useMemo, useState } from "react";
import { ArrowLeft, Code2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useGetResourceServerQuery } from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableCard } from "@/theme/components/cards";

import {
  INTEGRATION_LANGUAGE_LABELS,
  buildIntegrationPrompt,
  type IntegrationLanguage,
} from "./resource-server-utils";

const LANGUAGES: IntegrationLanguage[] = ["go", "typescript", "python"];

export function ResourceServerPromptPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const { data: server, isLoading } = useGetResourceServerQuery(id);
  const [language, setLanguage] = useState<IntegrationLanguage>("go");

  const prompt = useMemo(
    () => (server ? buildIntegrationPrompt(language, server) : ""),
    [language, server],
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={server ? `${server.name} Integration Prompt` : "Integration Prompt"}
          description="Generate a copy-first handoff prompt for a coding LLM that includes the exact AuthSec integration contract for this protected resource."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(server ? `/resource-servers/${server.id}` : "/resource-servers")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Details
              </Button>
              {server ? (
                <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/sdk`)}>
                  <Code2 className="mr-2 h-4 w-4" />
                  View SDK
                </Button>
              ) : null}
            </div>
          }
        />

        {isLoading || !server ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading resource server…" : "Resource server not found."}
          </div>
        ) : (
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
                <TabsContent key={item} value={item} className="space-y-4 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-foreground">
                        {INTEGRATION_LANGUAGE_LABELS[item]} prompt
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Copy this directly into a coding LLM to generate the MCP integration.
                      </p>
                    </div>
                    <CopyButton
                      text={prompt}
                      label={`${INTEGRATION_LANGUAGE_LABELS[item]} prompt`}
                      variant="outline"
                      showLabel
                    />
                  </div>

                  <pre className="max-h-[70vh] overflow-auto rounded-xl border bg-slate-950 p-5 text-xs leading-6 text-slate-100">
                    <code>{prompt}</code>
                  </pre>
                </TabsContent>
              ))}
            </Tabs>
          </TableCard>
        )}
      </div>
    </div>
  );
}

export default ResourceServerPromptPage;
