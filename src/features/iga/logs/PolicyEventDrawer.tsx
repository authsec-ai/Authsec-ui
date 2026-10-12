/**
 * One recorded policy event: its facts first, the raw payload collapsed
 * (SPEC-iga-phase3-policy.md §9.6). Values the server redacted
 * (services/iga_gov_event_vocabulary.go `RedactGovEventPayload`) are shown as
 * redacted, never guessed at.
 */

import { format } from "date-fns";
import { Link } from "react-router-dom";

import type { GovEventView } from "@/app/api/igaPolicyReadsApi";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { humanize } from "@/features/iga/policy/shared";
import { CopyValue, Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { PolicyKindGlyph } from "./KindGlyph";
import { ACTOR_KIND_LABEL, eventLinks, hasRedaction, isUuid, requestIdOf, scalarFacts } from "./policyEventFacts";
import { categoryLabel, eventLabel } from "./policyEventKinds";

export function PolicyEventDrawer({
  event,
  meaning,
  open,
  onOpenChange,
}: {
  event: GovEventView | null;
  /** The vocabulary's one-line description of this event name, when the kinds loaded. */
  meaning?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const links = event ? eventLinks(event) : [];
  const requestId = event ? requestIdOf(event) : null;
  const facts = event ? scalarFacts(event.payload) : [];
  const unreadable = event?.payload?.unreadable === true;
  const redacted = event ? hasRedaction(event.payload) : false;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[520px]"
        // Focus returns to the row that opened the drawer.
        onCloseAutoFocus={(e) => {
          if (!event) return;
          const row = document.querySelector<HTMLElement>(`[data-event-id="${event.id}"]`);
          if (row) {
            e.preventDefault();
            row.focus();
          }
        }}
      >
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <SheetTitle>{event ? eventLabel(event.event) : "Event"}</SheetTitle>
          <SheetDescription>{meaning ?? (event ? `Recorded event ${event.event}.` : "")}</SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Panel title="Details">
              <Facts>
                <Fact label="When">
                  <time dateTime={event.occurred_at}>{format(new Date(event.occurred_at), "d MMM yyyy, HH:mm:ss 'GMT'xxx")}</time>
                </Fact>
                <Fact label="Event">
                  <PolicyKindGlyph name={event.event} category={event.category} payload={event.payload} />
                  <Meta className="font-mono">{event.event}</Meta>
                </Fact>
                <Fact label="Category">{categoryLabel(event.category)}</Fact>
                <Fact label="Actor">
                  {ACTOR_KIND_LABEL[event.actor_kind] ?? humanize(event.actor_kind)}
                  {event.actor_id ? <CopyValue value={event.actor_id} what="Actor id" /> : null}
                </Fact>
                {links.length ? (
                  <Fact label="Open in Policy">
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      {links.map((l) => (
                        <Link key={l.key} to={l.to} className="font-medium text-(--color-primary-text) underline-offset-2 hover:underline">
                          {l.label}
                        </Link>
                      ))}
                    </span>
                  </Fact>
                ) : null}
                {requestId ? (
                  <Fact label="AWS request id">
                    <CopyValue value={requestId} what="AWS request id" />
                  </Fact>
                ) : null}
                <Fact label="Event number">{event.id}</Fact>
              </Facts>
            </Panel>

            {facts.length ? (
              <Panel title="Recorded with it">
                <Facts>
                  {facts.slice(0, 14).map((f) => (
                    <Fact key={f.key} label={humanize(f.key)} mono={typeof f.value === "string" && isUuid(f.value)}>
                      {f.redacted ? <span title="The server removed this value before sending it.">Redacted</span> : String(f.value)}
                    </Fact>
                  ))}
                </Facts>
              </Panel>
            ) : null}

            {unreadable ? <Meta>The stored payload of this event could not be read, so only the facts above are known.</Meta> : null}

            <details className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
              <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-[13px] font-semibold text-(--color-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">
                Payload
              </summary>
              <div className="border-t border-(--color-border-subtle) px-4 py-3">
                {redacted ? <Meta className="mb-2">Values shown as [redacted] were removed on the server; they are not available here.</Meta> : null}
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-(--color-text)">
                  {JSON.stringify(event.payload ?? {}, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
