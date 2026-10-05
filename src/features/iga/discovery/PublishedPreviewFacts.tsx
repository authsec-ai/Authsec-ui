/**
 * The facts a published workload or resource preview needs that its list row
 * does not carry, read at the PINNED publication (SPEC-console-revamp.md
 * *Facts and their contracts*). Each says how complete it is: the rows shown are
 * exact; the summary is complete only when there is no `next_cursor`.
 */

import { useGetGraphResourceAccessQuery, useGetGraphWorkloadIdentitiesQuery, type WorkloadRow } from "@/app/api/igaGraphApi";

import { classifyGraphError } from "../shared/graphErrors";
import { EXECUTION_ROLE_LABEL } from "../shared/labels";
import { useGraphRevision } from "../shared/revision";

const MUTED = "text-(--color-text-muted)";

function Names({ names, more, moreText }: { names: string[]; more: boolean; moreText?: string }) {
  return (
    <span>
      {names.join(", ")}
      {moreText ? <span className={MUTED}> {moreText}</span> : more ? <span className={MUTED}> · More available</span> : null}
    </span>
  );
}

/** Why a fact could not be read, in the reader's words — never a blank. */
function Unread({ stale, loading }: { stale?: boolean; loading?: boolean }) {
  if (loading) return <span className={MUTED}>…</span>;
  return <span className={MUTED}>{stale ? "A newer publication is current — refresh to continue" : "Not available right now"}</span>;
}

/**
 * Workload: what it runs as, and — kept apart, never merged — what an ECS agent
 * uses as its task execution role. One request serves both (RTK dedups it).
 */
export function WorkloadFact({ ws, row, which }: { ws: string; row: WorkloadRow; which: "runs_as" | "task_role" }) {
  const { rev, epoch } = useGraphRevision(ws);
  const id = row.ref.slice(row.ref.indexOf(":") + 1);
  const q = useGetGraphWorkloadIdentitiesQuery({ ws, rev, key: String(epoch), id }, { skip: rev == null });
  const failure = classifyGraphError(q.error);
  const data = q.currentData?.data;
  const loading = rev == null || (!data && !failure);
  const stale = failure?.kind === "revision_stale";
  if (!data) return <Unread loading={loading} stale={stale} />;

  if (which === "runs_as") {
    return data.execution?.items.length ? (
      <Names names={data.execution.items.map((i) => i.identity.name)} more={!!data.execution.next_cursor} />
    ) : (
      <span className={MUTED}>{EXECUTION_ROLE_LABEL[data.execution_role_state ?? "none"] ?? "No execution role"}</span>
    );
  }
  const taskRoles = data.other?.items.filter((i) => i.type === "task_execution_role") ?? [];
  return taskRoles.length ? (
    <Names names={taskRoles.map((i) => i.identity.name)} more={!!data.other?.next_cursor} />
  ) : (
    <span className={MUTED}>{data.other?.next_cursor ? "More available" : "None found"}</span>
  );
}

/** Resource: who holds declared access to it — the Access tab's first page. */
export function ResourceHolders({ ws, id }: { ws: string; id: string }) {
  const { rev, epoch } = useGraphRevision(ws);
  const q = useGetGraphResourceAccessQuery({ ws, rev, key: String(epoch), id, limit: 10 }, { skip: rev == null });
  const failure = classifyGraphError(q.error);
  const page = q.currentData;
  if (!page) return <Unread loading={rev == null || !failure} stale={failure?.kind === "revision_stale"} />;
  const holders = [...new Set(page.data.access.map((a) => a.holder.name))];
  if (!holders.length) {
    return <span className={MUTED}>{page.meta.next_cursor ? "More available" : "None found"}</span>;
  }
  const shown = holders.slice(0, 3);
  let more: string | undefined;
  if (page.meta.total_known && page.meta.total !== undefined && page.meta.total > shown.length) more = `+${page.meta.total - shown.length} more`;
  else if (!page.meta.next_cursor && holders.length > shown.length) more = `+${holders.length - shown.length} more`;
  return <Names names={shown} more={!!page.meta.next_cursor && !more} moreText={more} />;
}
