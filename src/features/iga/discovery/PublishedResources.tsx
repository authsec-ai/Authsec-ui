/**
 * AWS Published resources: the §5.3 graph list, pinned to one publication.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  igaGraphApi,
  refId,
  useListGraphResourcesQuery,
  type ListResourcesArgs,
  type ResourceKind,
  type ResourceRow,
  type ResourceSort,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import type { AdaptiveColumn } from "@/components/ui/adaptive-table";
import { copyToClipboard } from "@/lib/clipboard";

import { useLoadFirstPublication } from "../pipeline/usePipeline";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { SortSelect } from "../shared/components/FacetSelect";
import { AccountCell } from "../shared/components/InventoryCells";
import { classifyGraphError } from "../shared/graphErrors";
import { RESOURCE_KIND_LABEL, RESOURCE_KIND_NOTE, accountLabel, accountWithId } from "../shared/labels";
import { useRestartOnListingChanged } from "../shared/listView";
import { useTrackRevision } from "../shared/revision";
import { RowName } from "./DiscoveryTable";
import { fixedFacet, reportedFacet, sourceFacet } from "./facets";
import type { FacetSpec } from "./FacetBar";
import { ResourceHolders } from "./PublishedPreviewFacts";
import type { ScreenProps } from "./screenTypes";
import {
  LIFECYCLE_NOTE,
  LIFECYCLE_OPTIONS,
  sourceSpec,
  useListChrome,
  usePublishedCommon,
  valid,
} from "./publishedCommon";
import { LifecycleCell, PublishedBody, RowActions, SourceGate } from "./PublishedBody";

const MUTED = "text-(--color-text-muted)";

const RESOURCE_SORTS: { value: ResourceSort; label: string }[] = [
  { value: "kind", label: "Kind" },
  { value: "name", label: "Name" },
  { value: "service", label: "Service" },
  { value: "account", label: "Account" },
];

/** A reference's readable part: an ARN's resource segment; anything else as written. */
function referenceName(text: string): string {
  if (!text.startsWith("arn:")) return text;
  const rest = text.split(":").slice(5).join(":");
  return rest || text;
}

export default function PublishedResources(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "resources");
  const [restarted, setRestarted] = useState(false);
  const region = p.url.get("region");
  const service = p.url.get("service");
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);
  const representation = valid(p.url.get("representation"), ["exact", "selector"] as const);
  const external = p.url.get("external") ? true : false;
  const sort = valid(p.url.get("sort"), RESOURCE_SORTS.map((s) => s.value)) ?? "kind";
  // The server has one `kind` — exact, selector or external — and an external
  // reference is neither of the first two, so the two facets share it: External
  // only overrides Representation, and says so.
  const kind: ResourceKind | undefined = external ? "external" : representation;

  const args: ListResourcesArgs = { ws: p.ws, rev: c.rev, key: c.paging.cacheKey, q: p.url.q, account: c.account, region, kind, service, lifecycle, sort, cursor: c.paging.cursor };
  const list = useListGraphResourcesQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphResources", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<ResourceRow>[]>(
    () => [
      {
        id: "text",
        header: "Resource or selector",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/resources/${refId(row.original.ref)}`}
            name={referenceName(row.original.text)}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[row.original.type !== "unknown" ? row.original.type.replace(/_/g, " ") : row.original.service, row.original.region]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
          />
        ),
      },
      {
        id: "kind",
        header: "Representation",
        priority: 1,
        approxWidth: 150,
        cardSummary: true,
        cell: ({ row }) => (
          <span title={RESOURCE_KIND_NOTE[row.original.kind]}>
            <StatusBadge tone={row.original.kind === "external" ? "warning" : "neutral"}>{RESOURCE_KIND_LABEL[row.original.kind]}</StatusBadge>
          </span>
        ),
        detail: (r) => (
          <span>
            {RESOURCE_KIND_LABEL[r.kind]} <span className={MUTED}>— {RESOURCE_KIND_NOTE[r.kind]}</span>
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
      { id: "account", header: "Account", priority: 2, approxWidth: 160, cell: ({ row }) => <AccountCell account={row.original.account} /> },
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
        cell: ({ row }) => {
          const base = `/iga/resources/${refId(row.original.ref)}`;
          return (
            <RowActions
              items={[
            { label: "Preview", onSelect: () => p.url.select(refId(row.original.ref)) },
            { label: "Open details", onSelect: () => navigate(base) },
            { label: "Copy reference", onSelect: () => void copyToClipboard(row.original.text, "Reference") },
          ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.url.sel, navigate],
  );
  const chrome = useListChrome("discovery-published-resources", columns);

  const kindFacet = fixedFacet(facets, "kind", [
    { value: "exact", label: RESOURCE_KIND_LABEL.exact },
    { value: "selector", label: RESOURCE_KIND_LABEL.selector },
  ]);
  const externalFacet = fixedFacet(facets, "kind", [{ value: "external", label: "External or unresolved only" }]);
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
      key: "representation",
      label: "Representation",
      kind: "choice",
      value: external ? undefined : representation,
      anyLabel: "Exact or selector",
      note: "Whether the reference names one resource or a pattern. Separate from External.",
      disabledReason: external ? "Not applicable while External only is chosen." : undefined,
      ...kindFacet,
      onChange: (v) => p.url.patch({ representation: v, external: null }),
    },
    {
      key: "external",
      label: "External",
      kind: "choice",
      value: external ? "only" : undefined,
      anyLabel: "Any account",
      note: "The account the reference states is not connected, so nothing about it could be read. Separate from Representation.",
      options: externalFacet.options.map((o) => ({ ...o, value: "only" })),
      countsUnavailable: externalFacet.countsUnavailable,
      onChange: (v) => p.url.patch({ external: v, representation: null }),
    },
    {
      key: "service",
      label: "Service",
      kind: "choice",
      value: service,
      anyLabel: "Any service",
      ...reportedFacet(facets, "service"),
      onChange: (v) => p.url.patch({ service: v }),
    },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<ResourceRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-resources"
        subject="resources"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        sortControl={<SortSelect value={sort} options={RESOURCE_SORTS} onChange={(v) => p.url.patch({ sort: v === "kind" ? null : v })} />}
        searchPlaceholder="Search resources by ARN, pattern or account"
        clearKeys={["region", "lifecycle", "representation", "external", "service", "source"]}
        describeEmpty="resources named by declared access"
        restarted={restarted}
        chrome={chrome}
        preview={(r) => ({
          key: refId(r.ref),
          name: referenceName(r.text),
          kindLabel: `${RESOURCE_KIND_LABEL[r.kind]}${r.type !== "unknown" ? ` · ${r.type.replace(/_/g, " ")}` : ""}`,
          provider: "aws",
          context: [accountWithId(r.account) ?? "Account not stated by the reference", r.region ?? "Region not stated"],
          facts: [{ label: "Identities with declared access", value: <ResourceHolders ws={p.ws} id={refId(r.ref)} /> }],
          exception:
            r.lifecycle === "retired"
              ? "Retired: no statement names it in the latest scan."
              : r.state === "stale"
                ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                : r.kind === "external"
                  ? "Its account is not connected, so nothing about it could be read."
                  : undefined,
          detailsHref: `/iga/resources/${refId(r.ref)}`,
          graphHref: `/iga/resources/${refId(r.ref)}/graph`,
        })}
      />
    </SourceGate>
  );
}
