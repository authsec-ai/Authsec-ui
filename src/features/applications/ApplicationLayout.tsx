/**
 * `ApplicationLayout` — the chrome that wraps every Application detail
 * tab. Renders ApplicationHeader → ReadinessRibbon → DetailTabs → Outlet.
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
import { Card } from "@/components/ui/card";

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

  if (!id) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          Missing application ID.
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading application…
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-[var(--color-danger)]">
          Couldn't load this application. It may have been deleted, or your
          session may have expired.
        </Card>
      </div>
    );
  }

  const readiness = computeReadiness(application);

  return (
    <div className="min-h-screen bg-slate-50/70">
      <div className={consolePage}>
        <ApplicationHeader application={application} readiness={readiness} />
        <ApplicationDetailTabs
          applicationId={application.id}
          readiness={readiness}
        />
        <div>
          <Outlet
            context={{ application, readiness } satisfies ApplicationOutletContext}
          />
        </div>
      </div>
    </div>
  );
}
