import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy } from "lucide-react";

import { useGetResourceServerQuery } from "@/app/api/resourceServersApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/theme/components/cards";

import { ResourceServerSecretBanner } from "./components/ResourceServerSecretBanner";
import { SetupWizard } from "@/features/setup-and-access/SetupWizard";
import type { ResourceServerSecretState } from "./resource-server-utils";

type ResourceServerLocationState = {
  latestSecret?: ResourceServerSecretState;
};

export default function ResourceServerOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const [latestSecret, setLatestSecret] = useState<ResourceServerSecretState | null>(null);

  const { data: server, isLoading, refetch } = useGetResourceServerQuery(id);

  const locationState = (location.state as ResourceServerLocationState | null) ?? null;

  useEffect(() => {
    if (locationState?.latestSecret) {
      setLatestSecret(locationState.latestSecret);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, locationState, navigate]);

  if (isLoading || !server) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-10xl space-y-4 p-6">
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading resource server…" : "Resource server not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={`${server.name} Setup`}
          description="Complete all six steps to activate this resource server for end-user OAuth flows."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Details
              </Button>
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/sdk`)}>
                <Copy className="mr-2 h-4 w-4" />
                SDK
              </Button>
            </div>
          }
        />

        {latestSecret && (
          <ResourceServerSecretBanner
            secret={latestSecret}
            onDismiss={() => setLatestSecret(null)}
          />
        )}

        <TableCard className="p-6">
          <SetupWizard
            rsId={server.id}
            rsName={server.name}
            rsState={server.state ?? "pending_scan"}
            onActivated={refetch}
          />
        </TableCard>
      </div>
    </div>
  );
}
