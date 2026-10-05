/**
 * Overview — "what is this, and how much do we know?" (§2.14.6). Plain words
 * first; the ARN and the raw evidence are one click away, not the headline.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  igaGraphApi,
  objectPath,
  refId,
  useGetGraphWorkloadIdentitiesQuery,
  useListGraphWorkloadResourcesQuery,
  type GraphCoverageGap,
  type WorkloadDetail,
  type WorkloadIdentities,
  type WorkloadResourceRow,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { DecisionBanner, StatusBadge } from "@/components/console/status";

import {
  RESOURCE_KIND_LABEL,
  RUNTIME_LABEL,
  accountLabel,
  dayText,
} from "../shared/labels";
import { classifyGraphError } from "../shared/graphErrors";
import { accountCoverageNote } from "../shared/lifecycle";
import { viaLink } from "../shared/links";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { ClassificationHistory } from "../classification/ClassificationHistory";
import { CopyValue, Fact, Facts, Meta, Panel } from "../shared/components/Panel";
import { DeclaredExamples, type ExampleLine } from "../shared/components/DeclaredExamples";
import { InlineState } from "../shared/components/InlineState";
import { NeighbourhoodSketch, type SketchEdge, type SketchNode } from "../shared/components/NeighbourhoodSketch";
import { Timestamp } from "../shared/components/Timestamp";
import { shortResourceName } from "../shared/sketch";
import { discoveryHref } from "../discovery/urlState";


function ClassificationText({ w }: { w: WorkloadDetail }) {
  const d = w.decision;
  if (w.classification === "provider_native_agent") {
    return <>AWS runs this as an agent service, so it is an agent by what it is.</>;
  }
  if (d) {
    return (
      <>
        {d.purpose ? <span className="block">{d.purpose}</span> : null}
        <span className="block text-(--color-text-muted)">
          {d.decision === "classified_agent" ? "Classified as agent" : "Recorded as unclassified"} by{" "}
          {d.decided_by.display} · {dayText(d.decided_at)} · "{d.reason}"
        </span>
      </>
    );
  }
  return <>No purpose has been recorded for this workload.</>;
}

function RunsAs({ w }: { w: WorkloadDetail }) {
  const r = w.execution_role;
  switch (r.state) {
    case "resolved":
      if (!r.identity) return <>{r.name ?? "an identity not live at this revision"}</>;
      return (
        <Link
          {...viaLink(objectPath(r.identity) ?? "", { ref: w.ref, name: w.name })}
          className="font-medium text-(--color-primary-text) hover:underline"
        >
          {r.name ?? "an identity not live at this revision"}
        </Link>
      );
    case "not_in_scan":
      return (
        <>
          <span className="break-all font-mono text-xs">{r.execution_role_arn}</span>
          <span className="block text-(--color-text-muted)">Not read in the latest scan.</span>
        </>
      );
    case "not_in_inventory":
      return (
        <>
          <span className="break-all font-mono text-xs">{r.execution_role_arn}</span>
          <span className="block text-(--color-text-muted)">Matches no identity in any connected account.</span>
        </>
      );
    case "none":
      return <>No execution role configured</>;
  }
}

/**
 * Which identities the workload uses, and for what. ECS has two and they are
 * not equivalent: the TASK role is what the application runs as; the task
 * EXECUTION role is used by the ECS agent to pull images and write logs, and
 * its credentials are not available to the containers. Two labels, never one.
 */
function IdentitiesSummary({
  w,
  read,
}: {
  w: WorkloadDetail;
  read: { data?: WorkloadIdentities; pending: boolean; failure: ReturnType<typeof classifyGraphError>; retry: () => void; refresh: () => void };
}) {
  const ecs = w.runtime_kind === "ecs_task_definition";
  const other = read.data?.other;
  const infra = (other?.items ?? []).filter((r) => r.type === "task_execution_role");
  const from = { ref: w.ref, name: w.name };
  const row = (label: string, value: ReactNode, meaning?: string) => (
    <li className="space-y-0.5 px-4 py-3">
      <p className="text-xs text-(--color-text-muted)">{label}</p>
      <div className="text-[13px] leading-5 text-(--color-text)">{value}</div>
      {meaning ? <Meta>{meaning}</Meta> : null}
    </li>
  );
  return (
    <ul className="divide-y divide-(--color-border-subtle)">
      {row(ecs ? "Runs as · task role" : "Runs as", <RunsAs w={w} />, ecs ? "What the application code in the task runs as." : undefined)}
      {ecs
        ? row(
            "ECS agent uses · task execution role",
            read.failure ? (
              <InlineState failure={read.failure} subject="the task execution role" onRetry={read.retry} onRefresh={read.refresh} />
            ) : read.pending ? (
              <span className="text-(--color-text-muted)">Loading…</span>
            ) : infra.length ? (
              <span className="flex flex-col gap-0.5">
                {infra.map((r) => {
                  const path = objectPath(r.identity.ref);
                  return path ? (
                    <Link key={r.claim} {...viaLink(path, from)} className="w-fit font-medium text-(--color-primary-text) hover:underline">
                      {r.identity.name}
                    </Link>
                  ) : (
                    <span key={r.claim} className="font-medium">{r.identity.name}</span>
                  );
                })}
                {other?.next_cursor ? <span className="text-xs text-(--color-text-muted)">More available — the Identities tab lists them.</span> : null}
              </span>
            ) : !read.data ? (
              <span className="text-(--color-text-muted)">Not read for this view.</span>
            ) : (
              <span className="text-(--color-text-muted)">None configured, or not resolved to a role in a connected account.</span>
            ),
            infra.length ? "Used by the ECS agent to pull images and write logs. The application does not run as it." : undefined,
          )
        : null}
    </ul>
  );
}

const SKETCH_RESOURCES = 4;

/** The workload, what it runs as, and the first resources that identity's declared access names — only what was read. */
function sketchOf(w: WorkloadDetail, ids: WorkloadIdentities | undefined, rows: WorkloadResourceRow[] | undefined, resourcesMore: boolean) {
  const root: SketchNode = {
    id: w.ref,
    label: w.name,
    kind: RUNTIME_LABEL[w.runtime_kind],
    category: "workload",
    icon: "workload",
  };
  const roles: SketchNode[] = [];
  const edges: SketchEdge[] = [];
  const er = w.execution_role;
  if (er.state === "resolved" && er.identity && er.name) {
    roles.push({ id: er.identity, label: er.name, kind: "IAM role", category: "identity", icon: "role", to: objectPath(er.identity) ?? undefined });
    edges.push({ from: w.ref, to: er.identity, label: "runs as" });
  }
  for (const r of (ids?.other?.items ?? []).filter((x) => x.type === "task_execution_role").slice(0, 1)) {
    if (roles.some((n) => n.id === r.identity.ref)) {
      // The same role is both what it runs as and what the ECS agent uses: one line, both words.
      const same = edges.find((e) => e.to === r.identity.ref);
      if (same) same.label = `${same.label} · ECS agent uses`;
      continue;
    }
    roles.push({ id: r.identity.ref, label: r.identity.name, kind: "IAM role", category: "identity", icon: "role", to: objectPath(r.identity.ref) ?? undefined });
    edges.push({ from: w.ref, to: r.identity.ref, label: "ECS agent uses" });
  }
  if (!roles.length) return null;

  const resources: SketchNode[] = [];
  const room = Math.min(SKETCH_RESOURCES, 7 - 1 - roles.length);
  let drawable = 0;
  for (const row of rows ?? []) {
    const holders = new Map<string, WorkloadResourceRow["grants"]>();
    for (const g of row.grants) if (roles.some((n) => n.id === g.via_identity)) holders.set(g.via_identity, [...(holders.get(g.via_identity) ?? []), g]);
    if (!holders.size) continue;
    drawable += 1;
    if (resources.length >= room) continue;
    const r = row.resource;
    resources.push({
      id: r.ref,
      label: shortResourceName(r.text),
      kind: RESOURCE_KIND_LABEL[r.kind],
      category: r.kind === "external" ? "external" : "resource",
      icon: r.kind === "selector" ? "selector" : "resource",
      to: objectPath(r.ref) ?? undefined,
    });
    for (const [via, grants] of holders) edges.push({ from: via, to: r.ref, label: grants.every((g) => g.via_group) ? "declares via group" : "declares" });
  }
  const note =
    drawable > resources.length || resourcesMore
      ? `The first ${resources.length} resources its declared access names are drawn; the Resources tab lists the rest.`
      : null;
  return { columns: [[root], roles, resources], edges, note, rootId: w.ref };
}

function examplesOf(rows: WorkloadResourceRow[]): ExampleLine[] {
  const out: ExampleLine[] = [];
  for (const row of rows) {
    for (const g of row.grants) {
      if (out.length >= 3) return out;
      out.push({
        key: g.claim,
        actions: g.statement.actions,
        notActions: g.statement.not_actions,
        target: row.resource.text,
        exclusions: g.exclusions.map((x) => x.text),
        conditional: g.statement.conditional,
        boundary: row.restrictions.permissions_boundary,
        denyStatements: row.restrictions.deny_statements,
      });
    }
  }
  return out;
}

export function WorkloadOverview({
  ws,
  workload: w,
  gaps,
  frozen = false,
}: {
  ws: string;
  workload: WorkloadDetail;
  /** The detail's `meta.coverage`: stated on the account it bears on. */
  gaps?: GraphCoverageGap[];
  /** The object is not in the current publication: what is shown was loaded earlier, and nothing is fetched for it. */
  frozen?: boolean;
}) {
  const [history, setHistory] = useState(false);
  const runtime = RUNTIME_LABEL[w.runtime_kind];
  const attrs = w.provider_attrs;
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);

  // Both reads are the Identities and Resources tabs' own first pages: the same
  // cache entries, so opening a tab afterwards asks nothing new.
  const id = refId(w.ref);
  const idArgs = { ws, rev, key: String(epoch), id };
  const idQ = useGetGraphWorkloadIdentitiesQuery(idArgs, { skip: rev == null || frozen });
  const idFailure = classifyGraphError(idQ.error);
  useTrackRevision(ws, idQ.currentData, idFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("getGraphWorkloadIdentities", { ...idArgs, rev: r }, d)),
  );
  const resArgs = { ws, rev, key: `${epoch}.0`, id, sort: "kind" as const, cursor: undefined };
  const resQ = useListGraphWorkloadResourcesQuery(resArgs, { skip: rev == null || frozen });
  const resFailure = classifyGraphError(resQ.error);
  useTrackRevision(ws, resQ.currentData, resFailure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloadResources", { ...resArgs, rev: r }, d)),
  );
  const resRows = resQ.currentData?.data;
  const sketch = frozen ? null : sketchOf(w, idQ.currentData?.data, resRows, !!resQ.currentData?.meta.next_cursor);

  return (
    <div className="space-y-4">
      {w.lifecycle === "retired" ? (
        <DecisionBanner
          tone="neutral"
          title={`${w.name} is no longer in the latest scan`}
          body={`It was last confirmed ${dayText(w.last_confirmed_at)}.${w.retired_reason ? ` Reason: ${w.retired_reason.replace(/_/g, " ")}.` : ""}`}
        />
      ) : w.state === "stale" ? (
        <DecisionBanner
          tone="warning"
          title="Not reconfirmed by the latest scan"
          body="What is shown is what was last collected. The header says since when."
        />
      ) : null}

      {sketch ? (
        <NeighbourhoodSketch label={`Neighbourhood of ${w.name}`} columns={sketch.columns} edges={sketch.edges} rootId={sketch.rootId} from={{ ref: w.ref, name: w.name }} note={sketch.note} />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Panel title="What it is">
            <Facts>
              <Fact label="Classification">
                <span className="flex flex-col items-start gap-1.5">
                  <span>
                    <ClassificationText w={w} />
                  </span>
                  {w.classification !== "provider_native_agent" ? (
                    <button
                      type="button"
                      onClick={() => setHistory((h) => !h)}
                      aria-expanded={history}
                      className="text-xs font-medium text-(--color-primary-text) hover:underline"
                    >
                      {history ? "Hide decision history" : "Decision history"}
                    </button>
                  ) : null}
                </span>
              </Fact>
              {w.instances?.state === "not_collected" ? (
                <Fact label="Instances">
                  <span className="text-(--color-text-muted)">
                    {w.runtime_kind === "bedrock_agent"
                      ? "Not collected. Aliases, which separate a live agent from a canary, are not read yet."
                      : "Not collected."}
                  </span>
                </Fact>
              ) : null}
            </Facts>
            {history ? (
              <div className="mt-3">
                <ClassificationHistory ws={ws} id={refId(w.ref)} />
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Identities"
            flush
            actions={
              <Link to={`/iga/estate/${encodeURIComponent(refId(w.ref))}/identities`} className="font-medium text-(--color-primary-text) hover:underline">
                All identities
              </Link>
            }
          >
            <IdentitiesSummary
              w={w}
              read={{
                data: idQ.currentData?.data,
                pending: !frozen && !idFailure && !idQ.currentData,
                failure: idFailure,
                retry: () => void idQ.refetch(),
                refresh,
              }}
            />
          </Panel>

          {frozen ? null : resFailure ? (
            <Panel title="Declared permissions — examples">
              <p className="text-[13px]">
                <InlineState failure={resFailure} subject="declared permissions" onRetry={() => void resQ.refetch()} onRefresh={refresh} />
              </p>
            </Panel>
          ) : !resRows ? (
            <Panel title="Declared permissions — examples">
              <p className="text-[13px] text-(--color-text-muted)">Loading…</p>
            </Panel>
          ) : (
            <DeclaredExamples
              lines={examplesOf(resRows)}
              more={resRows.reduce((n, r) => n + r.grants.length, 0) > 3 || !!resQ.currentData?.meta.next_cursor}
              all={{ to: `/iga/estate/${encodeURIComponent(refId(w.ref))}/resources`, label: "All on Resources" }}
              empty={
                w.execution_role.state === "resolved"
                  ? "No declared access names any resource in what was read."
                  : "No execution identity was resolved, so no declared access could be read."
              }
            />
          )}
        </div>

        <div className="space-y-4">
          <Panel
            title="How we know"
            actions={
              <Link to={discoveryHref({ provider: "aws", type: "workloads", view: "latest" })} className="font-medium text-(--color-primary-text) hover:underline">
                Latest collected
              </Link>
            }
          >
            <Facts>
              <Fact label="ARN"><CopyValue value={w.arn} what="ARN" /></Fact>
              <Fact label="First seen">{dayText(w.first_seen_at)}</Fact>
              <Fact label="Last confirmed"><Timestamp iso={w.last_confirmed_at} /></Fact>
              <Fact label="Found by">
                {w.sources.length ? (
                  <span className="flex flex-col gap-1">
                    {w.sources.map((s) => (
                      <span key={s.presence} className="flex flex-wrap items-center gap-2">
                        <span>
                          {accountLabel(s.account)}
                          {s.account && s.account.label !== s.account.id ? <span className="ml-1.5 font-mono text-xs text-(--color-text-muted)">{s.account.id}</span> : null}
                        </span>
                        {s.state !== "current" ? <StatusBadge tone="warning">{s.state}</StatusBadge> : null}
                        {accountCoverageNote(gaps, s.account?.id) ? <StatusBadge tone="warning">Coverage partial</StatusBadge> : null}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-(--color-text-muted)">No current source</span>
                )}
              </Fact>
              <Fact label="Continuity">
                <span className="text-(--color-text-muted)">
                  {w.continuity === "immutable"
                    ? `Tracked by the id AWS assigns at creation, so a ${runtime} deleted and recreated under the same name is a new workload.`
                    : `Same name only. AWS gives this ${runtime} no creation id we can read, so one deleted and recreated under this name looks the same to us.`}
                </span>
              </Fact>
            </Facts>
          </Panel>

          {attrs.status || attrs.foundation_model || attrs.env_var_names?.length || attrs.gateway_targets?.length ? (
            <Panel title="As AWS describes it">
              <Facts>
                {attrs.status ? <Fact label="Status">{attrs.status}</Fact> : null}
                {attrs.foundation_model ? (
                  <Fact label="Foundation model" mono>
                    {attrs.foundation_model}
                  </Fact>
                ) : null}
                {attrs.env_var_names?.length ? (
                  <Fact label="Environment">
                    <span className="flex flex-wrap gap-1">
                      {attrs.env_var_names.map((n) => (
                        <code key={n} className="rounded bg-(--color-surface-subtle) px-1.5 py-px font-mono text-xs">
                          {n}
                        </code>
                      ))}
                    </span>
                    <span className="mt-1 block text-xs text-(--color-text-muted)">Variable names only. Values are never collected.</span>
                  </Fact>
                ) : null}
                {attrs.gateway_targets?.length ? (
                  <Fact label="Gateway targets">
                    <span className="flex flex-col divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                      {attrs.gateway_targets.map((t) => (
                        <span key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-(--color-text-muted)">{t.type}</span>
                          <span className="ml-auto text-xs text-(--color-text-muted)">{t.status}</span>
                        </span>
                      ))}
                    </span>
                  </Fact>
                ) : null}
              </Facts>
            </Panel>
          ) : null}
        </div>
      </div>

    </div>
  );
}
