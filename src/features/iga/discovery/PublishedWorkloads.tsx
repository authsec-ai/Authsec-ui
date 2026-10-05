/**
 * AWS Published workloads: the §5.3 graph list, pinned to one publication.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  igaGraphApi,
  refId,
  useListGraphWorkloadsQuery,
  type ClassificationFilter,
  type ListWorkloadsArgs,
  type RuntimeKind,
  type WorkloadRow,
  type WorkloadSort,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn } from "@/components/ui/adaptive-table";
import { HelpTooltip } from "@/components/ui/tooltip";
import { copyToClipboard } from "@/lib/clipboard";

import { useLoadFirstPublication } from "../pipeline/usePipeline";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { SortSelect } from "../shared/components/FacetSelect";
import { AccountCell } from "../shared/components/InventoryCells";
import { classifyGraphError } from "../shared/graphErrors";
import {
  CLASSIFICATION_MEANING,
  CLASSIFICATION_SHORT,
  CLASSIFICATION_TONE,
  RUNTIME_LABEL,
  RUNTIME_SHORT,
  accountLabel,
  accountWithId,
} from "../shared/labels";
import { useRestartOnListingChanged } from "../shared/listView";
import { useTrackRevision } from "../shared/revision";
import { RowName } from "./DiscoveryTable";
import { fixedFacet, reportedFacet, sourceFacet } from "./facets";
import type { FacetSpec } from "./FacetBar";
import { WorkloadFact } from "./PublishedPreviewFacts";
import type { ScreenProps } from "./screenTypes";
import {
  LIFECYCLE_NOTE,
  LIFECYCLE_OPTIONS,
  accountHasGap,
  sourceSpec,
  useListChrome,
  usePublishedCommon,
  valid,
} from "./publishedCommon";
import { LifecycleCell, PublishedBody, RowActions, SourceGate } from "./PublishedBody";

const MUTED = "text-(--color-text-muted)";

const RUNTIMES = Object.keys(RUNTIME_LABEL) as RuntimeKind[];
const WORKLOAD_SORTS: { value: WorkloadSort; label: string }[] = [
  { value: "name", label: "Name A–Z" },
  { value: "-name", label: "Name Z–A" },
  { value: "account", label: "Account" },
  { value: "classification", label: "Classification" },
  { value: "last_confirmed", label: "Last confirmed" },
];
const CLASSIFICATION_VALUES: { value: string; label: string }[] = [
  { value: "classified_agent", label: "Agent — classified by a person" },
  { value: "provider_native_agent", label: "Agent — provider-native" },
  { value: "unclassified", label: "Unclassified" },
];

export default function PublishedWorkloads(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "workloads");
  const [restarted, setRestarted] = useState(false);
  const region = p.url.get("region");
  const runtime = valid(p.url.get("runtime"), RUNTIMES);
  const classification = valid(p.url.get("classification"), ["classified_agent", "provider_native_agent", "unclassified"] as const);
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  const sort = valid(p.url.get("sort"), WORKLOAD_SORTS.map((s) => s.value)) ?? "name";

  const args: ListWorkloadsArgs = {
    ws: p.ws,
    rev: c.rev,
    key: c.paging.cacheKey,
    q: p.url.q,
    account: c.account,
    region,
    runtime_kind: runtime,
    classification: classification as ClassificationFilter | undefined,
    lifecycle,
    sort,
    cursor: c.paging.cursor,
  };
  const list = useListGraphWorkloadsQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloads", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<WorkloadRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/estate/${refId(row.original.ref)}`}
            name={row.original.name}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[RUNTIME_SHORT[row.original.runtime_kind], row.original.region]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
          />
        ),
      },
      {
        id: "classification",
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            Classification
            <HelpTooltip content="Whether this workload is recorded as an agent. Provider-native agents are agents by what they are; anything else stays unclassified until someone records a decision. Unclassified is not a problem." />
          </span>
        ),
        label: "Classification",
        priority: 1,
        approxWidth: 128,
        cardSummary: true,
        cell: ({ row }) => (
          <span title={CLASSIFICATION_MEANING[row.original.classification]}>
            <StatusBadge tone={CLASSIFICATION_TONE[row.original.classification]}>{CLASSIFICATION_SHORT[row.original.classification]}</StatusBadge>
          </span>
        ),
        detail: (r) => (
          <span>
            {CLASSIFICATION_SHORT[r.classification]} <span className={MUTED}>— {CLASSIFICATION_MEANING[r.classification]}</span>
          </span>
        ),
      },
      {
        id: "lifecycle",
        header: "Lifecycle",
        priority: 1,
        approxWidth: 100,
        cardSummary: true,
        cell: ({ row }) => <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />,
      },
      { id: "account", header: "Account", priority: 2, approxWidth: 170, cell: ({ row }) => <AccountCell account={row.original.account} /> },
      {
        id: "region",
        header: "Region",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => <span className={`text-xs ${MUTED}`}>{row.original.region ?? "Not stated"}</span>,
      },
      {
        id: "confirmed",
        header: "Last confirmed",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <ConfirmedCell state={row.original.state} lastConfirmedAt={row.original.last_confirmed_at} staleReason={row.original.stale_reason} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 64,
        cellClassName: "pr-3",
        cell: ({ row }) => {
          const base = `/iga/estate/${refId(row.original.ref)}`;
          return (
            <RowActions
              items={[
            { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
            { label: "Open details", onSelect: () => navigate(base) },
            { label: "Copy ARN", onSelect: () => void copyToClipboard(row.original.arn, "ARN") },
          ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.url.sel, navigate],
  );
  const chrome = useListChrome("discovery-published-workloads", columns);

  const specs: FacetSpec[] = [
    sourceSpec(p, sourceFacet(p.sources, facets?.account)),
    { key: "region", label: "Region", kind: "choice", value: region, anyLabel: "Any region", ...reportedFacet(facets, "region", (v, l) => (v === "not_stated" ? "Region not stated" : l)), onChange: (v) => p.url.patch({ region: v }) },
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      value: lifecycle,
      anyLabel: "Active (default)",
      options: [...LIFECYCLE_OPTIONS],
      note: LIFECYCLE_NOTE,
      onChange: (v) => p.url.patch({ lifecycle: v }),
    },
    {
      key: "classification",
      label: "Classification",
      kind: "choice",
      value: classification,
      anyLabel: "Any classification",
      note: "Each workload is in exactly one of these; they never overlap.",
      ...fixedFacet(facets, "classification", CLASSIFICATION_VALUES),
      onChange: (v) => p.url.patch({ classification: v }),
    },
    {
      key: "runtime",
      label: "Runtime",
      kind: "choice",
      value: runtime,
      anyLabel: "Any runtime",
      ...fixedFacet(facets, "runtime_kind", RUNTIMES.map((v) => ({ value: v, label: RUNTIME_LABEL[v] }))),
      onChange: (v) => p.url.patch({ runtime: v }),
    },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<WorkloadRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-workloads"
        subject="workloads"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        sortControl={<SortSelect value={sort} options={WORKLOAD_SORTS} onChange={(v) => p.url.patch({ sort: v === "name" ? null : v })} />}
        searchPlaceholder="Search workloads by name, ARN or account"
        clearKeys={["region", "lifecycle", "classification", "runtime", "source"]}
        describeEmpty="compute or agent runtimes"
        restarted={restarted}
        chrome={chrome}
        preview={(r, meta) => {
          const acctGap = accountHasGap(meta, r.account);
          const facts = [{ label: "Runs as", value: <WorkloadFact ws={p.ws} row={r} which="runs_as" /> }];
          if (r.runtime_kind === "ecs_task_definition") facts.push({ label: "ECS agent uses as task execution role", value: <WorkloadFact ws={p.ws} row={r} which="task_role" /> });
          return {
            key: refId(r.ref),
            name: r.name,
            kindLabel: RUNTIME_LABEL[r.runtime_kind],
            provider: "aws",
            context: [accountWithId(r.account) ?? "Account not stated", r.region ?? "Region not stated"],
            facts,
            exception:
              r.lifecycle === "retired"
                ? `Retired${r.retired_reason ? ` — ${r.retired_reason}` : ""}. Last confirmed ${r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : "at a time not known"}.`
                : r.state === "stale"
                  ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                  : acctGap
                    ? "Account coverage partial."
                    : undefined,
            detailsHref: `/iga/estate/${refId(r.ref)}`,
            graphHref: `/iga/estate/${refId(r.ref)}/graph`,
          };
        }}
      />
    </SourceGate>
  );
}
