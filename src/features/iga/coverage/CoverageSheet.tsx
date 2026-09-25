/**
 * Coverage for one account (SPEC-iga-phase2-graph.md §2.14.13): what could
 * not be read, and which conclusion that prevents — the second half is what
 * makes it actionable.
 *
 * Name the call, not a guess at the fix: an AccessDenied says which API call
 * failed, not which permission is missing (an SCP, a boundary on the
 * discovery role or a region opt-out can all produce it). A fix is offered
 * only when the evidence supports one: "not selected" has Change regions.
 */

import { Link } from "react-router-dom";

import { useGetGraphCoverageQuery, type CoverageSurface } from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { classifyGraphError } from "../shared/graphErrors";
import { INCOMPLETE_STATES, dayText, isLimitationCode, limitationText, surfaceStateText } from "../shared/labels";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";


function prevents(s: CoverageSurface): string | null {
  if (!s.prevents) return null;
  return isLimitationCode(s.prevents)
    ? limitationText({ code: s.prevents, surface: s.surface, state: s.state })
    : s.prevents;
}

function SurfaceRow({ s, connectorHref }: { s: CoverageSurface; connectorHref?: string }) {
  const p = prevents(s);
  return (
    <li className="space-y-1.5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">{s.surface}</span>
        <StatusBadge tone={INCOMPLETE_STATES.has(s.state) ? "warning" : "neutral"}>{surfaceStateText(s.state)}</StatusBadge>
        {s.count != null ? <span className="text-xs text-(--color-text-muted)">{s.count.toLocaleString()} read</span> : null}
      </div>
      {s.api || s.error_code ? (
        <p className="text-(--color-text-muted)">
          {s.error_code ? `AWS returned ${s.error_code}` : "The call did not complete"}
          {s.api ? ` for ${s.api}` : ""}.
        </p>
      ) : null}
      {s.error ? <p className="break-words font-mono text-xs text-(--color-text-muted)">{s.error}</p> : null}
      {s.items?.length ? (
        <ul className="list-disc pl-5 text-xs text-(--color-text-muted)">
          {s.items.map((it) => (
            <li key={`${it.policy}:${it.version}`}>
              {it.policy}
              {it.version ? ` (${it.version})` : ""}: {it.error}
            </li>
          ))}
          {s.truncated ? <li>More documents could not be read; this list is not the whole set.</li> : null}
        </ul>
      ) : null}
      {s.fix === "change_regions" ? (
        <p className="text-(--color-text-muted)">
          The region is not in this account's scan scope.{" "}
          {connectorHref ? (
            <Link to={connectorHref} className="font-semibold text-(--color-primary-text) hover:underline">
              Change regions
            </Link>
          ) : null}
        </p>
      ) : null}
      {p ? (
        <p>
          <span className="font-medium">Prevents: </span>
          {p}
        </p>
      ) : null}
      {s.since ? (
        <p className="text-xs text-(--color-text-muted)">In this state since {dayText(s.since)}</p>
      ) : null}
    </li>
  );
}

export function CoverageSheet({
  ws,
  accountId,
  accountName,
  connectorId,
  onClose,
}: {
  ws: string;
  accountId: string | null;
  accountName: string;
  connectorId?: string;
  onClose: () => void;
}) {
  // Coverage is read at the pinned revision, so it describes the same graph
  // as the rows beside it (§5.1); a newer publication answers 409.
  const { rev, epoch, refresh } = useGraphRevision(ws);
  const q = useGetGraphCoverageQuery({ ws, rev, key: String(epoch), account: accountId ?? undefined }, { skip: !accountId });
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, undefined, failure, () => undefined);
  const answer = q.currentData;
  const account = answer?.data[0];
  const surfaces = (account?.surfaces ?? []).filter((s) => s.state !== "reached");
  const href = connectorId ? `/iga/integrations?connector=${encodeURIComponent(connectorId)}` : undefined;

  return (
    <Sheet open={!!accountId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[480px]">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>
            Coverage · {accountName}
            {accountId ? <span className="ml-2 font-mono text-xs font-normal text-(--color-text-muted)">{accountId}</span> : null}
          </SheetTitle>
          <SheetDescription>What the latest scans could not read, and what that prevents us from saying.</SheetDescription>
        </SheetHeader>
        <div className="px-6 py-5">
          {answer ? (
            answer.meta.graph_state === "not_published" ? (
              <p className="text-sm">Nothing has been published yet, so there is no coverage to show.</p>
            ) : !account || account.runs.length === 0 ? (
              // Empty runs: the graph holds nothing of this account yet — never "no gaps".
              <p className="text-sm">The current graph holds nothing from this account yet.</p>
            ) : (
              <div className="space-y-3">
                {account.template?.outdated ? (
                  <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                    This account's CloudFormation stack is version {account.template.deployed ?? "unknown"}; the current
                    one is {account.template.current}. Update the stack in AWS to grant the newer reads.
                  </p>
                ) : null}
                {surfaces.length ? (
                  <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                    {surfaces.map((s) => (
                      <SurfaceRow key={s.surface} s={s} connectorHref={href} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm">Every surface of this account was read by the scans the current graph was built from.</p>
                )}
              </div>
            )
          ) : failure ? (
            <GraphStatePanel failure={failure} subject="coverage" onRetry={() => void q.refetch()} onRefresh={refresh} />
          ) : (
            <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading coverage" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
