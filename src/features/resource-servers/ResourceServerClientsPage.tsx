import { ArrowLeft, Code2, MessageSquareText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { useGetResourceServerQuery } from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

import { ResourceServerClientsPanel } from "./components/ResourceServerClientsPanel";

export function ResourceServerClientsPage() {
  const navigate = useNavigate();
  const { id = "" } = useParams<{ id: string }>();
  const { data: server, isLoading } = useGetResourceServerQuery(id);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={server ? `${server.name} OAuth Clients` : "Registered OAuth Clients"}
          description="Manage the MCP OAuth clients approved to access this protected resource."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(server ? `/resource-servers/${server.id}` : "/resource-servers")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Details
              </Button>
              {server ? (
                <>
                  <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/sdk`)}>
                    <Code2 className="mr-2 h-4 w-4" />
                    View SDK
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/prompt`)}>
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Generate Prompt
                  </Button>
                </>
              ) : null}
            </div>
          }
        />

        {isLoading || !server ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading resource server…" : "Resource server not found."}
          </div>
        ) : (
          <ResourceServerClientsPanel server={server} />
        )}
      </div>
    </div>
  );
}

export default ResourceServerClientsPage;
