/**
 * `ApplicationLayout` — the chrome that wraps every Application detail
 * tab (the MCP page). Renders ApplicationHeader (breadcrumb, name, chips,
 * primary action) → DetailTabs (Overview · Access · Activity) → Outlet.
 * No "What is this page?" strip here: the list page explains what an MCP is.
 *
 * The chrome mounts ONCE per application; tab navigation only swaps the
 * `<Outlet>` so we never re-fetch the application or refit the header.
 *
 * The fetched `application` and computed `readiness` are forwarded to
 * the active tab through React Router's outlet context, so each tab
 * page can read them with `useApplicationContext()`.
 */

import { Outlet, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useGetApplicationQuery } from "@/app/api/applicationsApi";
import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";
import { Card } from "@/components/ui/card";
import { NotFoundState } from "@/components/shared/NotFoundState";
import { isNotFoundError } from "@/lib/error-utils";

import { ApplicationDetailTabs } from "./components/ApplicationDetailTabs";
import { ApplicationHeader } from "./components/ApplicationHeader";
import { consolePage } from "./components/ApplicationConsole";
import { computeReadiness } from "./lib/computeReadiness";
import type { ApplicationOutletContext } from "./useApplicationContext";

export default function ApplicationLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: application, isLoading, error } = useGetApplicationQuery(id ?? "", {
    skip: !id,
  });
  const { data: clientsData } = useListWorkspaceClientsQuery(
    application?.id ? { resourceServerId: application.id } : undefined,
    { skip: !application?.id },
  );
  const pendingClientCount = (clientsData ?? []).filter(
    (c) => c.status === "pending_approval",
  ).length;

  if (!id) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          Missing MCP ID.
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading MCP…
      </div>
    );
  }

  if (isNotFoundError(error)) {
    return (
      <div className="p-6">
        <Card>
          <NotFoundState subject="MCP" backTo="/applications" backLabel="Back to MCP" />
        </Card>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-[var(--color-danger)]">
          Couldn't load this MCP. Try again in a moment.
        </Card>
      </div>
    );
  }

  const readiness = computeReadiness(application);

  return (
    <div className="min-h-screen bg-background">
      <div className={consolePage}>
        <div data-cr>
          <ApplicationHeader application={application} readiness={readiness} />
          <div className="tabbar-wrap">
            <ApplicationDetailTabs
              applicationId={application.id}
              pendingClientCount={pendingClientCount}
            />
          </div>
        </div>
        <div>
          <Outlet
            context={{ application, readiness } satisfies ApplicationOutletContext}
          />
        </div>
      </div>
    </div>
  );
}
