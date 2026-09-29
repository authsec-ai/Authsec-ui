/**
 * Governance → Scheduled actions (the policy lookahead)
 *
 * "What will this system do to my cluster this week?"
 *
 * This page is the SYSTEM OF RECORD for anything destructive. It is a pull, so
 * there is no delivery to fail and no channel to configure — it is correct the
 * moment it is read. Email and webhook warnings are escalation layered on top,
 * and they are allowed to fail; this is not.
 *
 * Three fields decide whether a row means what it appears to mean, and all
 * three are rendered rather than hidden:
 *
 *   confirmed: false      the action will be REFUSED, not carried out. The
 *                         policy was authorised against a different set of
 *                         agents, so this one is not covered.
 *   gitops_managed: true  deleting the workload will not stick — a reconciler
 *                         recreates it within minutes.
 *   author_active: false  the person who wrote the policy has left. The policy
 *                         still fires.
 *
 * Hiding any of those would show a confident countdown to something that will
 * not happen, or will not last.
 */

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, GitBranch, UserX } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { tableFailure } from "@/components/console/load-failure";
import { useListUpcomingActionsQuery, type UpcomingAction } from "@/app/api/governanceApi";

type Horizon = "7" | "30" | "90";

const HORIZONS: ConsoleFilterOption[] = [
  { key: "7", label: "Next 7 days" },
  { key: "30", label: "Next 30 days" },
  { key: "90", label: "Next 90 days" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

/**
 * Revoke lapses an entitlement and is reversible by re-provisioning. Quarantine
 * contains. Evict DESTROYS. They are not the same weight and must not read the
 * same.
 */
const ACTION_STYLE: Record<UpcomingAction["action"], string> = {
  revoke: "bg-muted text-muted-foreground",
  quarantine: "bg-(--color-warning-soft) text-(--color-warning-text)",
  evict: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

const ACTION_LABEL: Record<UpcomingAction["action"], string> = {
  revoke: "Revoke access",
  quarantine: "Quarantine",
  evict: "Delete workload",
};

export default function UpcomingActionsPage() {
  const [horizon, setHorizon] = useState<Horizon>("7");
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = useListUpcomingActionsQuery({
    days: Number(horizon),
  });

  const rows = useMemo(() => data?.items ?? [], [data]);
  const destructive = data?.destructive ?? 0;

  /** Scheduled but will be refused — the most misleading state on the page. */
  const unconfirmed = useMemo(
    () => rows.filter((r) => r.destructive && !r.confirmed).length,
    [rows],
  );

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.agent_label, r.policy_name, r.action, r.reason].join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<AdaptiveColumn<UpcomingAction>[]>(
    () => [
      {
        id: "at",
        header: "When",
        alwaysVisible: true,
        approxWidth: 150,
        cell: ({ row }) => {
          const at = new Date(row.original.at);
          return (
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">
                {formatDistanceToNow(at, { addSuffix: true })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {at.toLocaleString()}
              </span>
            </div>
          );
        },
      },
      {
        id: "action",
        header: "Action",
        priority: 1,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className={`${PILL} ${ACTION_STYLE[row.original.action]}`}>
            {ACTION_LABEL[row.original.action]}
          </span>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        primary: true,
        priority: 1,
        approxWidth: 240,
        cell: ({ row }) => (
          <span className="block max-w-[230px] truncate text-xs text-foreground">
            {row.original.agent_label || row.original.discovered_agent_id}
          </span>
        ),
      },
      {
        id: "policy",
        header: "Policy",
        priority: 3,
        approxWidth: 180,
        cell: ({ row }) => (
          <span className="block max-w-[170px] truncate text-xs text-muted-foreground">
            {row.original.policy_name}
          </span>
        ),
      },
      {
        id: "caveats",
        header: "Will it happen?",
        priority: 2,
        approxWidth: 260,
        cell: ({ row }) => {
          const r = row.original;
          // Order matters: "will be refused" outranks every other caveat,
          // because the action does not happen at all.
          if (r.destructive && !r.confirmed) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs text-(--color-danger-text)">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Will be refused — not covered by the confirmation
              </span>
            );
          }
          if (r.action === "evict" && r.gitops_managed) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs text-(--color-warning-text)">
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                GitOps-managed — deletion will not stick
              </span>
            );
          }
          if (!r.author_active) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserX className="h-3.5 w-3.5 shrink-0" />
                Author has left; the policy still fires
              </span>
            );
          }
          return <span className="text-xs text-muted-foreground">Yes</span>;
        },
      },
      {
        id: "reason",
        header: "Reason",
        priority: 5,
        approxWidth: 220,
        defaultHidden: true,
        cell: ({ row }) => (
          <span
            className="block max-w-[210px] truncate text-xs text-muted-foreground"
            title={row.original.reason}
          >
            {row.original.reason || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Scheduled actions"
      description="What policy will do to your clusters, before it happens. This is the record; email and webhook warnings are escalation on top of it."
    >
      {destructive > 0 ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs text-(--color-danger-text)">
          <strong className="font-medium">
            {destructive} destructive {destructive === 1 ? "action is" : "actions are"} scheduled.
          </strong>{" "}
          <span className="text-foreground/80">
            These delete workloads. Editing or disabling the policy before the deadline is the
            only way to stop them.
            {unconfirmed > 0 ? (
              <>
                {" "}
                {unconfirmed} of them{" "}
                <strong className="font-medium">will be refused</strong> because the policy&apos;s
                confirmation does not name that agent — confirm the policy again if you intend it
                to run.
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by agent, policy, or reason…"
        filters={HORIZONS}
        activeFilter={horizon}
        onFilterChange={(v) => setHorizon(v as Horizon)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(
              error,
              "scheduled policy actions",
              () => refetch(),
              "governance:read",
            )}
            tableId="policy-lookahead"
            columns={columns}
            data={items}
            getRowId={(r) => `${r.policy_id}:${r.discovered_agent_id}`}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
