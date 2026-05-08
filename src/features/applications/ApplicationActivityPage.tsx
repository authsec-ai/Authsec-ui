/**
 * `ApplicationActivityPage` — drift events, sourced from the backend.
 *
 * The previous version showed fabricated "Policy health / Policy version
 * / New tools / Denied calls" stats that the backend doesn't produce.
 * Until those endpoints exist, we only show what's real:
 *   • `useGetDriftEventsQuery`  — list of post-activation drift events.
 *   • `useDismissDriftEventMutation` — resolve / mark-handled.
 *
 * Honest empty state: if there are no events, say so.
 */

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useDismissDriftEventMutation,
  useGetDriftEventsQuery,
  type DriftEvent,
} from "@/app/api/setupWizardApi";

import { useApplicationContext } from "./useApplicationContext";
import { isLaunched } from "./lib/computeReadiness";
import { DecisionBanner, Surface } from "./components/ApplicationConsole";

const EVENT_TYPE_LABEL: Record<string, string> = {
  new_tool_discovered: "New tool discovered",
  removed_tool: "Tool removed (stale mapping)",
  new_scope_suggested: "New scope suggested",
  manifest_failure: "Manifest fetch failed",
};

const EVENT_TYPE_TONE: Record<string, "warn" | "info" | "err"> = {
  new_tool_discovered: "warn",
  removed_tool: "warn",
  new_scope_suggested: "info",
  manifest_failure: "err",
};

export default function ApplicationActivityPage() {
  const { application } = useApplicationContext();
  const launched = isLaunched(application);

  const { data, isLoading } = useGetDriftEventsQuery(application.id, {
    // Don't poll a non-launched RS — it can't have drift yet.
    skip: !launched,
  });
  const [dismiss, { isLoading: dismissing }] =
    useDismissDriftEventMutation();

  const events: DriftEvent[] = useMemo(() => data?.events ?? [], [data]);

  const handleDismiss = async (eventId: string) => {
    try {
      await dismiss({ rsId: application.id, eventId }).unwrap();
      toast.success("Drift event dismissed.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't dismiss event.");
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Activity
        </h2>
        <p className="text-sm text-muted-foreground">
          Post-launch drift events from{" "}
          <code className="font-mono text-xs">
            GET /authsec/resource-servers/{application.id}/drift-events
          </code>
          . Detailed runtime metrics (policy health, denied calls,
          insufficient_scope errors) require backend endpoints we don't
          have yet — they're not surfaced here until they do.
        </p>
      </header>

      {!launched && (
        <DecisionBanner
          tone="warning"
          title="Application not launched"
          body="Drift only accumulates after activation. Complete launch before monitoring runtime policy changes."
          actionLabel="Open launch"
          actionHref={`/applications/${application.id}/launch`}
        />
      )}

      {launched && (
        <Surface className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Drift events
              </h3>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading…"
                  : `${events.length} open event${events.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          {isLoading && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading drift events…
            </div>
          )}
          {!isLoading && events.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No drift events. Nothing has changed since launch.
            </div>
          )}
          {!isLoading && events.length > 0 && (
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <DriftRow
                  key={event.id}
                  event={event}
                  busy={dismissing}
                  onDismiss={() => handleDismiss(event.id)}
                />
              ))}
            </ul>
          )}
        </Surface>
      )}
    </div>
  );
}

function DriftRow({
  event,
  busy,
  onDismiss,
}: {
  event: DriftEvent;
  busy: boolean;
  onDismiss: () => void;
}) {
  const tone = EVENT_TYPE_TONE[event.event_type] ?? "info";
  const label =
    EVENT_TYPE_LABEL[event.event_type] ??
    event.event_type.replace(/_/g, " ");

  const TONE_DOT: Record<typeof tone, string> = {
    warn: "bg-[var(--color-warning)]",
    info: "bg-[var(--color-primary)]",
    err: "bg-[var(--color-danger)]",
  };

  let payloadSummary = "";
  if (event.event_payload && typeof event.event_payload === "object") {
    try {
      payloadSummary = JSON.stringify(event.event_payload);
      if (payloadSummary.length > 120) {
        payloadSummary = `${payloadSummary.slice(0, 117)}…`;
      }
    } catch {
      payloadSummary = "";
    }
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[tone])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">{label}</h4>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {event.event_type}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(event.occurred_at).toLocaleString()}
          {event.occurred_by ? ` · by ${event.occurred_by}` : ""}
        </p>
        {payloadSummary && (
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {payloadSummary}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={onDismiss}>
        Dismiss
      </Button>
    </li>
  );
}
