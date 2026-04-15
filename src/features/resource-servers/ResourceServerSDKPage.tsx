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
        )}
      </div>
    </div>
  );
}

export default ResourceServerSDKPage;
