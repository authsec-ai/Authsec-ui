/**
 * Governance → Provenance
 *
 * Every grant explains itself: who granted it, why, under which approval, when it
 * expires. This is NOT an audit log — it is the standing record of authority
 * behind each entitlement, and the evidence a certification reviewer decides on.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  EntityCell,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerBody, DrawerHeader, DrawerSection } from "@/components/console/detail";
import {
  useListProvenanceQuery,
  type EntitlementProvenance,
} from "@/app/api/governanceApi";
import { ProvenanceEvidence, ProvenanceFlags } from "./ProvenanceEvidence";

type Filter = "all" | "standing" | "lapsed" | "active";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "standing", label: "Standing" },
  { key: "lapsed", label: "Lapsed" },
];

export default function ProvenancePage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<EntitlementProvenance | null>(null);

  const queryArgs = useMemo(() => {
    if (filter === "standing") return { standing: true };
    if (filter === "lapsed") return { lapsed: true };
    return undefined;
  }, [filter]);

  const { data, isError, error, refetch } = useListProvenanceQuery(queryArgs);
  const rows = useMemo(() => data?.items ?? [], [data]);

  const items = useMemo(() => {
    let list = rows;
    if (filter === "active") list = list.filter((p) => !p.lapsed && !p.revoked_at);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.entitlement_label, p.subject_label, p.subject_id, p.origin]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [rows, filter, search]);

  const columns = useMemo<AdaptiveColumn<EntitlementProvenance>[]>(
    () => [
      {
        id: "entitlement",
        header: "Entitlement",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="max-w-[250px]">
            <EntityCell
              label={row.original.entitlement_label || row.original.entitlement_type}
              detail={row.original.entitlement_type}
            />
          </div>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => (
          <div className="max-w-[190px]">
            <div className="truncate text-xs text-foreground" title={row.original.subject_label}>
              {row.original.subject_label || row.original.subject_id}
            </div>
            <div className="text-[11px] text-muted-foreground">{row.original.subject_type}</div>
          </div>
        ),
      },
      {
        id: "origin",
        header: "Origin",
        priority: 3,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.origin || "—"}</span>
        ),
      },
      {
        id: "flags",
        header: "",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => <ProvenanceFlags p={row.original} />,
      },
      {
        id: "expires",
        header: "Expires",
        priority: 4,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.is_standing
              ? "Never"
              : row.original.expires_at
                ? formatDistanceToNow(new Date(row.original.expires_at), { addSuffix: true })
                : "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Provenance"
      description="The standing record of why every entitlement exists — its grantor, justification, approval, and expiry. The evidence behind every access review."
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load provenance.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the governance:read permission."
            : "The governance API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by entitlement, subject, or origin…"
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="provenance"
            columns={columns}
            data={items}
            getRowId={(p) => p.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(p) => setSelected(p)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <RightDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaTitle="Entitlement provenance"
      >
        {selected ? (
          <>
            <DrawerHeader
              title={selected.entitlement_label || selected.entitlement_type}
              subtitle={selected.subject_label || selected.subject_id}
              badge={<ProvenanceFlags p={selected} />}
            />
            <DrawerBody>
              <DrawerSection label="Provenance">
                <ProvenanceEvidence provenance={selected} />
              </DrawerSection>
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>
    </ConsolePage>
  );
}
