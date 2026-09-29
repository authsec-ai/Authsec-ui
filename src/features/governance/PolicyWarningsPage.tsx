/**
 * Governance → Policy warnings
 *
 * The delivery record behind the lookahead.
 *
 * A warning that never arrived does NOT stop the action it warned about, and
 * that is deliberate: blocking would let an SMTP outage quietly turn every
 * destructive policy into a no-op, and the operator would believe it was
 * handled. So the failure is recorded instead — and a destructive action that
 * ran with nobody warned is a GOVERNANCE EXCEPTION, not a swallowed error.
 *
 * Which is why this page leads with the undelivered count rather than burying
 * it in a status column: the undelivered ones are the only rows that represent
 * a risk nobody has seen.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { Send } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { tableFailure } from "@/components/console/load-failure";
import { Button } from "@/components/ui/button";
import {
  governanceError,
  useListPolicyWarningsQuery,
  useRunPolicyWarningsMutation,
  type PolicyWarning,
} from "@/app/api/governanceApi";

type Filter = "all" | "undelivered";

const FILTERS: ConsoleFilterOption[] = [
  { key: "undelivered", label: "Undelivered" },
  { key: "all", label: "All" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const STATE_STYLE: Record<PolicyWarning["state"], string> = {
  sent: "bg-(--color-success-soft) text-(--color-success-text)",
  pending: "bg-(--color-warning-soft) text-(--color-warning-text)",
  failed: "bg-(--color-warning-soft) text-(--color-warning-text)",
  // dead is not "worse than failed" in kind — it is terminal. The deadline it
  // warned about still fires, unannounced.
  dead: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Accountable owner",
  author: "Policy author",
  confirmer: "Confirmed the expiry",
  workspace_admin: "Workspace admin",
  webhook: "Webhook",
};

export default function PolicyWarningsPage() {
  const [filter, setFilter] = useState<Filter>("undelivered");
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = useListPolicyWarningsQuery();
  const [runNow, { isLoading: running }] = useRunPolicyWarningsMutation();

  const rows = useMemo(() => data?.items ?? [], [data]);
  const undelivered = data?.undelivered ?? 0;

  const items = useMemo(() => {
    const base = filter === "undelivered" ? rows.filter((r) => r.state !== "sent") : rows;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.recipient, r.recipient_role, r.on_expiry, r.last_error].join(" ").toLowerCase().includes(q),
    );
  }, [rows, filter, search]);

  const send = async () => {
    try {
      const res = await runNow().unwrap();
      const extra = [
        res.failed ? `${res.failed} failed` : null,
        res.dead ? `${res.dead} gave up` : null,
      ].filter(Boolean);
      toast.success(
        `Scheduled ${res.scheduled}, sent ${res.sent}${extra.length > 0 ? `, ${extra.join(", ")}` : ""}.`,
      );
    } catch (err) {
      toast.error(governanceError(err, "Could not run the warning sweep."));
    }
  };

  const columns = useMemo<AdaptiveColumn<PolicyWarning>[]>(
    () => [
      {
        id: "state",
        header: "Delivery",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => (
          <span className={`${PILL} ${STATE_STYLE[row.original.state]}`}>
            {row.original.state}
          </span>
        ),
      },
      {
        id: "recipient",
        header: "Told",
        primary: true,
        priority: 1,
        approxWidth: 230,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="max-w-[220px] truncate text-xs text-foreground">
              {row.original.recipient}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {ROLE_LABEL[row.original.recipient_role] ?? row.original.recipient_role}
            </span>
          </div>
        ),
      },
      {
        id: "deadline",
        header: "About",
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-xs text-foreground">{row.original.on_expiry}</span>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(row.original.deadline), { addSuffix: true })}
            </span>
          </div>
        ),
      },
      {
        id: "detail",
        header: "Detail",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) => {
          const w = row.original;
          if (w.state === "sent" && w.sent_at) {
            return (
              <span className="text-xs text-muted-foreground">
                Delivered {formatDistanceToNow(new Date(w.sent_at), { addSuffix: true })}
              </span>
            );
          }
          if (w.state === "dead") {
            return (
              <span
                className="block max-w-[280px] truncate text-xs text-(--color-danger-text)"
                title={w.last_error}
              >
                Gave up after {w.attempt_count} attempts — the deadline still fires
              </span>
            );
          }
          if (w.last_error) {
            return (
              <span
                className="block max-w-[280px] truncate text-xs text-(--color-warning-text)"
                title={w.last_error}
              >
                {w.last_error}
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground">
              Due {formatDistanceToNow(new Date(w.available_at), { addSuffix: true })}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Policy warnings"
      description="Who was told, before a policy did something destructive. A warning that fails does not stop the action — it is recorded as a governance exception instead."
      actions={
        <Button variant="outline" onClick={send} disabled={running}>
          <Send className="mr-1.5 h-4 w-4" />
          {running ? "Sending…" : "Schedule & send now"}
        </Button>
      }
    >
      {undelivered > 0 ? (
        <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-4 py-3 text-xs text-(--color-warning-text)">
          <strong className="font-medium">
            {undelivered} warning{undelivered === 1 ? " has" : "s have"} not been delivered.
          </strong>{" "}
          <span className="text-foreground/80">
            The actions they warn about still execute on schedule. Each one that runs undelivered
            is recorded as a governance exception — somebody&apos;s workload disappears with no
            notice given.
          </span>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by recipient, role, or error…"
        filters={FILTERS}
        activeFilter={filter}
        onFilterChange={(v) => setFilter(v as Filter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "policy warnings", () => refetch(), "governance:read")}
            tableId="policy-warnings"
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
