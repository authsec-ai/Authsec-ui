/**
 * One sample event: its facts, what that kind of event means, and the raw
 * record collapsed. The object is named, not linked — the objects are samples.
 */

import { format } from "date-fns";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { KindGlyph } from "./KindGlyph";
import { KIND_LABEL, KIND_MEANING, type LogEvent } from "./fixtures";

export function EventDrawer({ event, open, onOpenChange }: { event: LogEvent | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-[480px]"
        // Put focus back on the row that opened the drawer, whatever the browser
        // focused on click.
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
          <SheetTitle>{event ? KIND_LABEL[event.kind] : "Event"}</SheetTitle>
          <SheetDescription>{event?.sentence ?? ""}</SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Panel title="Details">
              <Facts>
                <Fact label="When">
                  <time dateTime={event.at}>{format(new Date(event.at), "d MMM yyyy, HH:mm:ss 'GMT'xxx")}</time>
                </Fact>
                <Fact label="Kind">
                  <KindGlyph kind={event.kind} />
                </Fact>
                <Fact label="Actor">{event.actor.label}</Fact>
                <Fact label="Source">{event.source.label}</Fact>
                <Fact label="Object">
                  {event.object.name}
                  <Meta>{event.object.what}. A sample object — there is nothing to open in this preview.</Meta>
                </Fact>
                <Fact label="Outcome">{event.outcome}</Fact>
                {event.reason ? <Fact label="Reason">{event.reason}</Fact> : null}
              </Facts>
            </Panel>
            <p className="text-sm leading-6 text-(--color-text-muted)">{KIND_MEANING[event.kind]}</p>
            <details className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
              <summary className="cursor-pointer rounded-lg px-4 py-2.5 text-[13px] font-semibold text-(--color-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)">
                Raw record
              </summary>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all border-t border-(--color-border-subtle) px-4 py-3 font-mono text-xs leading-5 text-(--color-text)">
                {JSON.stringify(event.raw, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
