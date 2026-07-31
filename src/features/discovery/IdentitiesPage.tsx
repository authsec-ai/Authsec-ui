/**
 * Discovery → Identities
 *
 * PROTOTYPE. The team's discovery doc has no identity table, so this uses the
 * provisional generic schema in `discoveryApi.ts`: the account an agent
 * authenticates as, plus the credential posture that determines what revoking
 * it would affect.
 */

import { useCallback, useMemo, useState } from "react";
import { formatDistanceToNow, isBefore } from "date-fns";

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
import {
  DrawerBody,
  DrawerHeader,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
} from "@/components/console/detail";
import {
  CREDENTIAL_LABELS,
  IDENTITY_KIND_LABELS,
  SOURCE_LABELS,
  useListDiscoveredAgentsQuery,
  useIdentitiesWithFallback,
  type Identity,
  type IdentityStatus,
} from "@/app/api/discoveryApi";

type Filter = "all" | "active" | "orphaned" | "expiring";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "orphaned", label: "Orphaned" },
  { key: "expiring", label: "Credential expiring" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<IdentityStatus, string> = {
  active: "bg-(--color-success-soft) text-(--color-success-text)",
  disabled: "bg-muted text-muted-foreground",
  orphaned: "bg-(--color-danger-soft) text-(--color-danger-text)",
  unknown: "bg-(--color-warning-soft) text-(--color-warning-text)",
};

function StatusPill({ status }: { status: IdentityStatus }) {
  return (
    <span className={`${PILL} ${STATUS_STYLE[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

/** Expired, or expiring inside 30 days. */
function credentialAlert(identity: Identity): "expired" | "expiring" | null {
  if (!identity.credential_expires_at) return null;
  const expiry = new Date(identity.credential_expires_at);
  if (isBefore(expiry, new Date())) return "expired";
  if (isBefore(expiry, new Date(Date.now() + 30 * 86_400_000))) return "expiring";
  return null;
}

export default function IdentitiesPage() {
  const { data, usingMock } = useIdentitiesWithFallback();
  // Identities are still fixtures — the backend has no identity endpoint. The
  // agent list is real, so "Used by" resolves against live inventory.
  const { data: agentsData } = useListDiscoveredAgentsQuery();
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Identity | null>(null);

  const agentName = useCallback(
    (id: string | null) => (id ? (agents.find((a) => a.id === id)?.display_name ?? id) : null),
    [agents],
  );

  const items = useMemo(() => {
    let list = data;
    if (filter === "active") list = list.filter((i) => i.status === "active");
    if (filter === "orphaned") list = list.filter((i) => i.status === "orphaned");
    if (filter === "expiring") list = list.filter((i) => credentialAlert(i) !== null);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [i.display_name, i.external_id, i.provider, IDENTITY_KIND_LABELS[i.kind]]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [data, search, filter]);

  const orphanCount = useMemo(
    () => data.filter((i) => i.status === "orphaned").length,
    [data],
  );

  const columns = useMemo<AdaptiveColumn<Identity>[]>(
    () => [
      {
        id: "identity",
        header: "Identity",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => (
          <div className="max-w-[260px]">
            <EntityCell
              label={row.original.display_name}
              detail={row.original.external_id}
              monoDetail
            />
          </div>
        ),
      },
      {
        id: "kind",
        header: "Kind",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => (
          <div>
            <div className="text-xs text-foreground">
              {IDENTITY_KIND_LABELS[row.original.kind]}
            </div>
            <div className="text-[11px] text-muted-foreground">{row.original.provider}</div>
          </div>
        ),
      },
      {
        id: "used_by",
        header: "Used by",
        priority: 2,
        approxWidth: 170,
        cell: ({ row }) => {
          const name = agentName(row.original.linked_agent_id);
          return name ? (
            <span className="block max-w-[160px] truncate text-xs text-foreground" title={name}>
              {name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No agent linked</span>
          );
        },
      },
      {
        id: "credential",
        header: "Credential",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => {
          const alert = credentialAlert(row.original);
          return (
            <div>
              <div className="text-xs text-foreground">
                {CREDENTIAL_LABELS[row.original.credential_type]}
              </div>
              {alert ? (
                <div
                  className={
                    alert === "expired"
                      ? "text-[11px] text-(--color-danger-text)"
                      : "text-[11px] text-(--color-warning-text)"
                  }
                >
                  {alert === "expired" ? "Expired" : "Expires soon"}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 4,
        approxWidth: 120,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
      {
        id: "last_used_at",
        header: "Last used",
        priority: 5,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.last_used_at
              ? formatDistanceToNow(new Date(row.original.last_used_at), { addSuffix: true })
              : "Never"}
          </span>
        ),
      },
    ],
    [agentName],
  );

  return (
    <ConsolePage
      title="Identities"
      description="Accounts that discovered agents authenticate as, with the credential posture behind each one."
    >
      {usingMock ? (
        <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Prototype data.</strong>{" "}
          <code>/authsec/discovery/identities</code> does not exist — the backend has no
          identity endpoint and the doc defines no identity table, so this whole page is
          fixtures and the schema is provisional. Everything else in Discovery is live.
        </div>
      ) : null}

      {orphanCount > 0 ? (
        <div className="rounded-md border px-4 py-3 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">
            {orphanCount} orphaned {orphanCount === 1 ? "identity" : "identities"}.
          </strong>{" "}
          Credentials that still exist but no discovered agent uses.
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, identifier or provider…"
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="discovery-identities"
            columns={columns}
            data={items}
            getRowId={(i) => i.id}
            enableSelection={false}
            enableExpansion={false}
            onRowClick={(i) => setSelected(i)}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <RightDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaTitle="Identity details"
      >
        {selected ? (
          <>
            <DrawerHeader
              title={selected.display_name}
              subtitle={`${IDENTITY_KIND_LABELS[selected.kind]} · ${selected.provider}`}
              badge={<StatusPill status={selected.status} />}
            />
            <DrawerBody>
              <DrawerSection label="Identity">
                <DetailGrid>
                  <DetailRow
                    label="Identifier"
                    value={<CopyField value={selected.external_id} />}
                    full
                  />
                  <DetailRow label="Kind" value={IDENTITY_KIND_LABELS[selected.kind]} />
                  <DetailRow label="Provider" value={selected.provider} />
                  <DetailRow
                    label="Discovered via"
                    value={SOURCE_LABELS[selected.source]}
                  />
                  <DetailRow
                    label="Used by"
                    value={agentName(selected.linked_agent_id) ?? "No agent linked"}
                  />
                </DetailGrid>
              </DrawerSection>

              <DrawerSection label="Credential">
                <DetailGrid>
                  <DetailRow
                    label="Type"
                    value={CREDENTIAL_LABELS[selected.credential_type]}
                  />
                  <DetailRow
                    label="Expires"
                    value={
                      selected.credential_expires_at
                        ? formatDistanceToNow(new Date(selected.credential_expires_at), {
                            addSuffix: true,
                          })
                        : "No expiry"
                    }
                  />
                  <DetailRow
                    label="Last used"
                    value={
                      selected.last_used_at
                        ? formatDistanceToNow(new Date(selected.last_used_at), {
                            addSuffix: true,
                          })
                        : "Never"
                    }
                  />
                </DetailGrid>
              </DrawerSection>

              <DrawerSection label="Lifecycle">
                <DetailGrid>
                  <DetailRow
                    label="First seen"
                    value={formatDistanceToNow(new Date(selected.first_seen_at), {
                      addSuffix: true,
                    })}
                  />
                  <DetailRow
                    label="Last seen"
                    value={formatDistanceToNow(new Date(selected.last_seen_at), {
                      addSuffix: true,
                    })}
                  />
                </DetailGrid>
              </DrawerSection>
            </DrawerBody>
          </>
        ) : null}
      </RightDrawer>
    </ConsolePage>
  );
}
