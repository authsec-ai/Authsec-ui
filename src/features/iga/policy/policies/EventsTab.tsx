/**
 * Policy › detail › Events (SPEC-iga-phase3-policy.md §9.3 S5, §9.6): this
 * policy's own trail from `GET /events?object_kind=policy&object_id=…`, newest
 * first, filterable by category, cursor-paged. The payload is what the server
 * already redacted; it stays behind a disclosure. The full Logs view with the
 * same filter is one link away.
 */

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useGetGovEventKindsQuery, useListGovEventsQuery, type GovEventView } from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { PolicyLoadFailure, classifyPolicyError, humanize } from "../shared";
import { policyHref } from "./policyModel";

const PAGE = 50;
const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EventsTab({ ws, policyId, nameOf }: { ws: string; policyId: string; nameOf: (id: string) => string }) {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? "";
  const setCategory = (v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set("category", v);
    else n.delete("category");
    setParams(n, { replace: true });
  };

  // A cursor belongs to one filter set.
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: category, stack: [] });
  useEffect(() => setPaging({ key: category, stack: [] }), [category]);
  const stack = paging.key === category ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const kinds = useGetGovEventKindsQuery({ ws });
  const q = useListGovEventsQuery({ ws, object_kind: "policy", object_id: policyId, category: category || undefined, limit: PAGE, cursor });
  const page = q.currentData;
  const failure = classifyPolicyError(q.error);
  const describe = useMemo(() => new Map((kinds.data?.events ?? []).map((e) => [e.name, e.description])), [kinds.data]);
  const categories = (kinds.data?.categories ?? []).filter((c) => c.recorded);

  return (
    <Panel
      title="Events"
      description="What happened to this policy, its versions, reviews and deployments, newest first."
      actions={
        <Link to={`/iga/logs?policy=${encodeURIComponent(policyId)}`} className="inline-flex items-center gap-1 font-medium text-(--color-primary-text) hover:underline">
          Open in Logs
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      }
      flush
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-(--color-border-subtle) px-4 py-3">
        <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
          Kind
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} disabled={kinds.isLoading}>
            <option value="">All events</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>
                {humanize(c.category)}
              </option>
            ))}
          </select>
        </label>
        {category ? (
          <Button variant="ghost" size="sm" onClick={() => setCategory("")}>
            Clear filter
          </Button>
        ) : null}
        {kinds.isError ? <span className="text-xs text-(--color-text-muted)">The list of kinds could not be loaded; the filter is unavailable.</span> : null}
      </div>

      {failure && !page ? (
        <div className="p-4">
          <PolicyLoadFailure failure={failure} subject="events" onRetry={() => void q.refetch()} />
        </div>
      ) : q.isFetching && !page ? (
        <p role="status" className="px-4 py-6 text-[13px] text-(--color-text-muted)">
          Loading events…
        </p>
      ) : page && page.data.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-(--color-text-muted)">
          {category ? "No events of this kind for this policy." : "Nothing has been recorded for this policy yet."}
        </p>
      ) : page ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {page.data.map((e) => (
            <EventRow key={e.id} e={e} policyId={policyId} description={describe.get(e.event)} nameOf={nameOf} />
          ))}
        </ul>
      ) : null}

      {page ? (
        <CursorPager
          meta={{ next_cursor: page.meta.next_cursor, limit: PAGE }}
          pageIndex={stack.length}
          rowsOnPage={page.data.length}
          onPrev={() => setPaging({ key: category, stack: stack.slice(0, -1) })}
          onNext={(c) => setPaging({ key: category, stack: [...stack, c] })}
          failure={failure ? { kind: "failed" } : null}
          onRetry={() => void q.refetch()}
        />
      ) : null}
    </Panel>
  );
}

function actorWords(e: GovEventView, nameOf: (id: string) => string): string {
  if (e.actor_kind === "user" || UUID.test(e.actor_id)) return nameOf(e.actor_id);
  if (e.actor_kind === "slack_user") return "A Slack user";
  return e.actor_id ? `${humanize(e.actor_kind)} (${e.actor_id})` : humanize(e.actor_kind);
}

function EventRow({ e, policyId, description, nameOf }: { e: GovEventView; policyId: string; description: string | undefined; nameOf: (id: string) => string }) {
  const version = typeof e.payload.version_no === "number" ? e.payload.version_no : null;
  const hasPayload = Object.keys(e.payload).length > 0;
  return (
    <li className="space-y-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-medium text-(--color-text)">{humanize(e.event.replace(/\./g, " "))}</span>
        {version !== null ? (
          <Link to={policyHref(policyId, "versions", `version=${version}`)} className="text-xs font-medium text-(--color-primary-text) hover:underline">
            Version {version}
          </Link>
        ) : null}
        {e.deployment_id ? (
          <Link to={`/iga/policy/deployments/${encodeURIComponent(e.deployment_id)}`} className="text-xs font-medium text-(--color-primary-text) hover:underline">
            Deployment
          </Link>
        ) : null}
        <span className="ml-auto text-xs text-(--color-text-muted)">
          <Timestamp iso={e.occurred_at} />
        </span>
      </div>
      {description ? <Meta>{description}</Meta> : null}
      <Meta>By {actorWords(e, nameOf)}</Meta>
      {hasPayload ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-(--color-text-muted) hover:text-(--color-text)">Details</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-(--color-surface-subtle) p-2 font-mono text-[11px] leading-4 text-(--color-text)">{JSON.stringify(e.payload, null, 2)}</pre>
        </details>
      ) : null}
    </li>
  );
}
