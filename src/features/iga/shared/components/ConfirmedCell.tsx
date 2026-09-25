import type { RelState, StaleReason } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";

import { readableSurface } from "../../coverage/surfaceNames";
import { agoText, dayText, surfaceStateText } from "../labels";

/**
 * A row's Last confirmed column: its age, and when it is stale, why — the
 * surface whose read did not reconfirm it (§2.14.6: "stale: eu-west-1 compute
 * not read since 15 Sep"). Stale is a visibility change, never a removal.
 */
export function ConfirmedCell({
  state,
  lastConfirmedAt,
  staleReason,
}: {
  state: RelState;
  lastConfirmedAt: string | null;
  staleReason?: StaleReason[];
}) {
  const age = <span className="text-(--color-text-muted)">{agoText(lastConfirmedAt)}</span>;
  if (state !== "stale") return <span className="text-sm">{age}</span>;
  const why = staleReason?.[0];
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      <span className="flex items-center gap-2">
        <StatusBadge tone="warning">Stale</StatusBadge>
        {age}
      </span>
      {why ? (
        <span className="text-xs text-(--color-text-muted)">
          {readableSurface(why.surface).service}
          {readableSurface(why.surface).region ? ` ${readableSurface(why.surface).region}` : ""} {surfaceStateText(why.state)}
          {why.since ? ` since ${dayText(why.since)}` : ""}
          {staleReason && staleReason.length > 1 ? ` (+${staleReason.length - 1} more)` : ""}
        </span>
      ) : null}
    </span>
  );
}
