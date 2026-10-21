/**
 * Home (route /dashboard).
 *
 * Welcome — until the workspace has at least one MCP, agent or identity
 * provider: three ways to start and the developer details.
 * Home — counts, requests checked by AuthSec, what needs attention, recent
 * activity and the developer details.
 *
 * Every figure comes from `useHomeData`, which reads only real backend data.
 */

import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConsolePage } from "@/components/console/ConsolePage";
import { PageAbout } from "@/components/console/PageAbout";

import { useHomeData } from "./hooks/useHomeData";
import { Welcome } from "./home/Welcome";
import { CountCards } from "./home/CountCards";
import { RequestsCard } from "./home/RequestsCard";
import { AttentionList } from "./home/AttentionList";
import { RecentActivity } from "./home/RecentActivity";
import { DeveloperDetails } from "./home/parts";

function Loading() {
  return (
    <ConsolePage title="Home">
      <div className="space-y-4" aria-busy="true" aria-label="Loading Home">
        <Skeleton className="h-11 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </ConsolePage>
  );
}

function HomeActions() {
  const navigate = useNavigate();
  return (
    <>
      <Button variant="outline" onClick={() => navigate("/agents/new")}>
        <Plus className="size-4" aria-hidden />
        Register agent
      </Button>
      <Button className="text-white" onClick={() => navigate("/applications/new")}>
        <Plus className="size-4" aria-hidden />
        Add MCP
      </Button>
    </>
  );
}

export function DashboardPage() {
  const data = useHomeData();

  if (data.setupLoading) return <Loading />;

  if (data.showWelcome) {
    return <Welcome issuerUrl={data.issuerUrl} workspaceId={data.workspaceId} />;
  }

  return (
    <ConsolePage
      title="Home"
      description={`${data.workspaceName ? `${data.workspaceName} · ` : ""}last 7 days`}
      actions={<HomeActions />}
    >
      <PageAbout>Status of your MCPs, agents and sign-ins, and anything that needs action.</PageAbout>
      <CountCards data={data} />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <RequestsCard data={data} />
        <AttentionList
          items={data.attention.items}
          isLoading={data.attention.isLoading}
          failed={data.attention.failed}
        />
      </div>
      <RecentActivity recent={data.recent} />
      <DeveloperDetails issuerUrl={data.issuerUrl} workspaceId={data.workspaceId} />
    </ConsolePage>
  );
}
