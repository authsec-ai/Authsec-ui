/**
 * AWS Published identities: the §5.3 graph list, pinned to one publication.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  igaGraphApi,
  refId,
  useListGraphIdentitiesQuery,
  type IdentityKind,
  type IdentityRow,
  type ListIdentitiesArgs,
} from "@/app/api/igaGraphApi";
import type { AdaptiveColumn } from "@/components/ui/adaptive-table";
import { copyToClipboard } from "@/lib/clipboard";

import { useLoadFirstPublication } from "../pipeline/usePipeline";
import { ConfirmedCell } from "../shared/components/ConfirmedCell";
import { ConfirmedValue } from "../shared/components/ObjectPreview";
import { CountText } from "../shared/components/CountText";
import { AccountCell } from "../shared/components/InventoryCells";
import { classifyGraphError } from "../shared/graphErrors";
import {
  DIRECT_BINDINGS_LABEL,
  DIRECT_BINDINGS_MEANING,
  IDENTITY_KIND_LABEL,
  accountLabel,
  accountWithId,
} from "../shared/labels";
import { useRestartOnListingChanged } from "../shared/listView";
import { useTrackRevision } from "../shared/revision";
import { countOfExact, countWithNoun } from "../shared/components/countValue";
import { RowName } from "./DiscoveryTable";
import { fixedFacet, sourceFacet } from "./facets";
import type { FacetSpec } from "./FacetBar";
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

const IDENTITY_KINDS: IdentityKind[] = ["iam_role", "iam_user", "iam_group"];

function usedByText(r: IdentityRow): string {
  if (r.kind === "iam_group") return "Groups are not run as";
  const c = countOfExact(r.used_by_count);
  if (c.kind === "exact" && c.value === 0) return "None";
  return countWithNoun(c, "workload", "workloads");
}

export default function PublishedIdentities(p: ScreenProps) {
  const navigate = useNavigate();
  const c = usePublishedCommon(p, "identities");
  const [restarted, setRestarted] = useState(false);
  const kind = valid(p.url.get("kind"), IDENTITY_KINDS);
  const bound = p.url.get("bound") ? ("workloads" as const) : undefined;
  const lifecycle = valid(p.url.get("lifecycle"), ["retired", "all"] as const);

  const args: ListIdentitiesArgs = { ws: p.ws, rev: c.rev, key: c.paging.cacheKey, q: p.url.q, account: c.account, kind, used_by: bound, lifecycle, cursor: c.paging.cursor };
  const list = useListGraphIdentitiesQuery(args, { skip: c.gate.off || c.blocked });
  useTrackRevision(p.ws, list.currentData, classifyGraphError(list.error), (r, d) =>
    c.dispatch(igaGraphApi.util.upsertQueryData("listGraphIdentities", { ...args, rev: r }, d)),
  );
  useLoadFirstPublication(p.ws, c.pipeline?.current_rev, list.currentData?.meta.graph_state === "not_published", list.refetch);
  useRestartOnListingChanged(list.error, c.paging.restart, () => setRestarted(true));
  const facets = list.currentData?.meta.facets;

  const columns = useMemo<AdaptiveColumn<IdentityRow>[]>(
    () => [
      {
        id: "name",
        header: "Identity",
        label: "Identity",
        primary: true,
        minWidth: 240,
        cell: ({ row }) => (
          <RowName
            to={`/iga/identities/${refId(row.original.ref)}`}
            name={row.original.name}
            rowKey={refId(row.original.ref)}
            selected={p.url.sel === refId(row.original.ref)}
            context={[IDENTITY_KIND_LABEL[row.original.kind]]}
            account={row.original.account ? accountLabel(row.original.account) : "Unknown account"}
            lifecycle={row.original.lifecycle === "retired" ? "Retired" : row.original.state === "stale" ? "Stale" : null}
          />
        ),
      },
      {
        id: "used_by",
        header: "Bound to",
        label: DIRECT_BINDINGS_LABEL,
        priority: 1,
        approxWidth: 150,
        cardSummary: true,
        cell: ({ row }) => (
          <span className="text-sm tabular-nums" title={DIRECT_BINDINGS_MEANING}>
            {usedByText(row.original)}
          </span>
        ),
        detail: (r) => (r.kind === "iam_group" ? "Groups are not run as" : `${usedByText(r)} — ${DIRECT_BINDINGS_MEANING}`),
      },
      {
        id: "type",
        header: "Type",
        label: "Type",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => <span className="text-sm">{IDENTITY_KIND_LABEL[row.original.kind]}</span>,
      },
      {
        id: "lifecycle",
        defaultHidden: true,
        // Shown whenever retired rows can be in the list, so they never look current.
        alwaysVisible: lifecycle !== undefined,
        header: "Lifecycle",
        priority: 1,
        approxWidth: 100,
        cardSummary: true,
        cell: ({ row }) => <LifecycleCell lifecycle={row.original.lifecycle} state={row.original.state} />,
      },
      { id: "account", header: "Account", defaultHidden: true, priority: 2, approxWidth: 170, cell: ({ row }) => <AccountCell account={row.original.account} /> },
      {
        id: "confirmed",
        defaultHidden: true,
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
          const base = `/iga/identities/${refId(row.original.ref)}`;
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
    [p.url.sel, navigate, lifecycle],
  );
  const chrome = useListChrome("discovery-published-identities-v2", columns);

  const specs: FacetSpec[] = [
    sourceSpec(p, sourceFacet(p.sources, facets?.account)),
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
      key: "kind",
      label: "Kind",
      kind: "choice",
      value: kind,
      anyLabel: "Any kind",
      ...fixedFacet(facets, "kind", IDENTITY_KINDS.map((v) => ({ value: v, label: IDENTITY_KIND_LABEL[v] }))),
      onChange: (v) => p.url.patch({ kind: v }),
    },
    { key: "bound", label: "Bound to a workload", kind: "toggle", value: bound ? "1" : undefined, onChange: (v) => p.url.patch({ bound: v }) },
  ];

  return (
    <SourceGate p={p}>
      <PublishedBody<IdentityRow>
        p={p}
        c={c}
        list={list}
        tableId="discovery-published-identities-v2"
        subject="identities"
        columns={columns}
        getRowId={(r) => refId(r.ref)}
        facets={specs}
        searchPlaceholder="Search identities by name, ARN or account"
        clearKeys={["lifecycle", "kind", "bound", "source"]}
        describeEmpty="IAM roles, users or groups"
        restarted={restarted}
        chrome={chrome}
        preview={(r, meta) => {
          const acctGap = accountHasGap(meta, r.account);
          return {
            key: refId(r.ref),
            name: r.name,
            kindLabel: IDENTITY_KIND_LABEL[r.kind],
            provider: "aws",
            context: [],
            facts: [
              { label: "Account", value: accountWithId(r.account) ?? "Account not stated", copy: r.account?.id },
              { label: "Region", value: "Global (IAM has no region)" },
              { label: "ARN", value: r.arn, mono: true, copy: r.arn },
              {
                label: "Workloads bound",
                value: r.kind === "iam_group" ? <span className={MUTED}>Groups are not run as</span> : <CountText count={countOfExact(r.used_by_count)} />,
              },
              { label: "Last confirmed", value: <ConfirmedValue iso={r.last_confirmed_at} /> },
            ],
            exception:
              r.lifecycle === "retired"
                ? `Retired${r.retired_reason ? ` — ${r.retired_reason}` : ""}.`
                : r.state === "stale"
                  ? `Stale since ${r.stale_reason?.[0]?.since ? new Date(r.stale_reason[0].since).toLocaleDateString() : "an unknown date"}: not reconfirmed by the latest scan.`
                  : acctGap
                    ? "Account coverage partial."
                    : undefined,
            detailsHref: `/iga/identities/${refId(r.ref)}`,
            graphHref: `/iga/identities/${refId(r.ref)}/graph`,
          };
        }}
      />
    </SourceGate>
  );
}
