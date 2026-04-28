import { useGetDriftEventsQuery, useDismissDriftEventMutation } from "../../app/api/setupWizardApi";
import type { DriftEvent } from "../../app/api/setupWizardApi";

interface Props {
  rsId: string;
}

const EVENT_LABELS: Record<string, string> = {
  scope_deleted: "scope deleted",
  tool_unmapped: "tool unmapped",
  default_role_disabled: "default role disabled",
  secret_rotated: "introspection secret rotated",
};

const EVENT_LINKS: Record<string, string> = {
  scope_deleted: "#scopes",
  tool_unmapped: "#tools",
  default_role_disabled: "#roles",
  secret_rotated: "#clients",
};

export function DriftBanner({ rsId }: Props) {
  const { data, isLoading } = useGetDriftEventsQuery(rsId, {
    pollingInterval: 30_000,
  });
  const [dismiss] = useDismissDriftEventMutation();

  if (isLoading || !data?.events?.length) return null;

  const events = data.events;
  const setupDate = events[0]?.occurred_at; // rough approximation for display

  return (
    <div className="rounded-md border border-yellow-400 bg-yellow-50 p-4 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-yellow-900">
            Heads up: since activation
            {setupDate && (
              <>
                {" "}
                on{" "}
                {new Date(setupDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </>
            )}
            , you have {events.length} change
            {events.length !== 1 ? "s" : ""}. End-user logins may be affected.
          </p>
          <ul className="mt-2 space-y-1">
            {events.map((event) => (
              <DriftEventRow
                key={event.id}
                event={event}
                rsId={rsId}
                onDismiss={() => dismiss({ rsId, eventId: event.id })}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DriftEventRow({
  event,
  rsId,
  onDismiss,
}: {
  event: DriftEvent;
  rsId: string;
  onDismiss: () => void;
}) {
  const label = EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, " ");
  const link = EVENT_LINKS[event.event_type] ?? "#";
  const when = new Date(event.occurred_at).toLocaleTimeString();

  return (
    <li className="flex items-center justify-between text-sm text-yellow-800">
      <a
        href={`/resource-servers/${rsId}${link}`}
        className="underline hover:text-yellow-900"
      >
        {label} at {when}
      </a>
      <button
        onClick={onDismiss}
        className="ml-4 text-xs text-yellow-600 hover:text-yellow-800 underline"
      >
        Dismiss
      </button>
    </li>
  );
}
