/**
 * Governance → Enforcement queue
 *
 * The operator's view of pending and failed in-cluster enforcement. A
 * `failed` instruction with an `error` means a governance decision did NOT take
 * effect — that gets a loud row. `superseded` is history, not a failure: a newer
 * contradicting decision overtook it before it applied (a quarantine released
 * before the cluster agent polled). Nothing went wrong there.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  useListInstructionsQuery,
  type ProvisioningInstruction,
} from "@/app/api/governanceApi";

type Filter = "open" | "all";

const FILTERS: ConsoleFilterOption[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATUS_STYLE: Record<ProvisioningInstruction["status"], string> = {
  pending: "bg-(--color-warning-soft) text-(--color-warning-text)",
  leased: "bg-(--color-warning-soft) text-(--color-warning-text)",
  applied: "bg-(--color-success-soft) text-(--color-success-text)",
  failed: "bg-(--color-danger-soft) text-(--color-danger-text)",
  superseded: "bg-muted text-muted-foreground",
};

const KIND_LABEL: Record<ProvisioningInstruction["kind"], string> = {
  quarantine: "Quarantine",
  unquarantine: "Release",
  verify_uptake: "Verify identity",
};

export default function InstructionsPage() {
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const { data, isError, error, refetch } = useListInstructionsQuery(
    filter === "open" ? { open: true } : undefined,
  );
  const rows = useMemo(() => data?.items ?? [], [data]);

  const failedCount = useMemo(() => rows.filter((r) => r.status === "failed").length, [rows]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fingerprint, r.kind, r.error].join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<AdaptiveColumn<ProvisioningInstruction>[]>(
    () => [
      {
        id: "kind",
        header: "Decision",
        alwaysVisible: true,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-foreground">{KIND_LABEL[row.original.kind]}</span>
        ),
      },
      {
        id: "target",
        header: "Target",
        priority: 2,
        approxWidth: 240,
        cell: ({ row }) => (
          <span className="block max-w-[230px] truncate font-mono text-[11px] text-muted-foreground">
            {row.original.fingerprint || row.original.discovered_agent_id || "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className={`${PILL} ${STATUS_STYLE[row.original.status]}`}>
            {row.original.status}
          </span>
        ),
      },
      {
        id: "attempts",
        header: "Attempts",
        priority: 4,
        approxWidth: 90,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.attempts}</span>
        ),
      },
      {
        id: "detail",
        header: "Detail",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === "failed" && r.error) {
            return (
              <span className="block max-w-[280px] truncate text-xs text-(--color-danger-text)" title={r.error}>
                {r.error}
              </span>
            );
          }
          if (r.status === "superseded") {
            return (
              <span className="text-xs text-muted-foreground">
                Overtaken by a newer decision — nothing went wrong.
              </span>
            );
          }
          if (r.applied_at) {
            return (
              <span className="text-xs text-muted-foreground">
                Applied {formatDistanceToNow(new Date(r.applied_at), { addSuffix: true })}
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground">
              Created {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Enforcement queue"
      description="Pending and failed in-cluster enforcement of governance decisions. A failed instruction means a decision did not take effect."
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load the queue.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the governance:read permission."
            : "The governance API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {failedCount > 0 ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs text-(--color-danger-text)">
          <strong className="font-medium">
            {failedCount} enforcement {failedCount === 1 ? "decision" : "decisions"} did not take
            effect.
          </strong>{" "}
          <span className="text-foreground/80">
            The agent decided, but the cluster did not apply it — usually because no actuation
            agent is installed there. Until resolved, those agents are governed on paper only.
          </span>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by fingerprint, kind, or error…"
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="enforcement-queue"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
