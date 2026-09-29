/**
 * Governance → Agent policies
 *
 * A policy states an END STATE for an agent — contained, or capped at these
 * scopes, or gone by this date — and a reconciler closes the gap every five
 * minutes. Nothing on this page fires an action directly.
 *
 * The two axes a reader has to keep apart:
 *
 *   desired_state   what should be true in the CLUSTER (active | quarantined)
 *   scope ceiling   what the agent may hold in AuthSec — a ceiling, never a
 *                   grant, so a policy can only ever narrow
 *
 * "Preview" runs the reconciler in dry-run and reports what it WOULD do, which
 * is the safe way to find out that a selector matches more than you thought.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { Plus, Trash2, PlayCircle } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { ConsoleFilterBar } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { tableFailure } from "@/components/console/load-failure";
import { Button } from "@/components/ui/button";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerBody,
  DrawerSection,
  DetailGrid,
  DetailRow,
} from "@/components/console/detail";
import {
  governanceError,
  useListAgentPoliciesQuery,
  useDeleteAgentPolicyMutation,
  useReconcileAgentPoliciesMutation,
  type AgentPolicy,
} from "@/app/api/governanceApi";
import { CreateAgentPolicyDialog } from "./AgentPolicyDialogs";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const EXPIRY_LABEL: Record<AgentPolicy["on_expiry"], string> = {
  revoke: "Revoke access",
  quarantine: "Quarantine",
  evict: "Delete workload",
};

export default function AgentPoliciesPage() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AgentPolicy | null>(null);

  const { data, isLoading, error, refetch } = useListAgentPoliciesQuery();
  const [remove] = useDeleteAgentPolicyMutation();
  const [reconcile, { isLoading: previewing }] = useReconcileAgentPoliciesMutation();

  const rows = useMemo(() => data?.items ?? [], [data]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.description, r.on_expiry, r.desired_state].join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const preview = async () => {
    try {
      const res = await reconcile({ dryRun: true }).unwrap();
      const parts = [
        res.would_quarantine ? `${res.would_quarantine} to quarantine` : null,
        res.would_narrow ? `${res.would_narrow} to narrow` : null,
        res.would_revoke ? `${res.would_revoke} to revoke` : null,
        res.would_evict ? `${res.would_evict} to delete` : null,
        res.refused ? `${res.refused} refused` : null,
      ].filter(Boolean);
      toast.success(
        parts.length > 0
          ? `Across ${res.agents_covered} agent(s): ${parts.join(", ")}.`
          : `Nothing to do across ${res.agents_covered} agent(s) — everything already matches policy.`,
      );
    } catch (err) {
      toast.error(governanceError(err, "Could not run the preview."));
    }
  };

  const onDelete = async (p: AgentPolicy) => {
    try {
      await remove(p.id).unwrap();
      // Worth stating: deleting a policy stops future sweeps, it does not undo
      // what already happened. Silently implying otherwise would be worse.
      toast.success("Policy deleted. Effects it already applied are not undone.");
      setSelected(null);
    } catch (err) {
      toast.error(governanceError(err, "Could not delete the policy."));
    }
  };

  const columns = useMemo<AdaptiveColumn<AgentPolicy>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        primary: true,
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">{row.original.name}</span>
            {row.original.description ? (
              <span className="max-w-[210px] truncate text-[11px] text-muted-foreground">
                {row.original.description}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "target",
        header: "Applies to",
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => {
          const p = row.original;
          if (p.discovered_agent_id) {
            return <span className="text-xs text-muted-foreground">One named agent</span>;
          }
          const s = p.selector ?? {};
          const parts = [s.cluster, s.namespace, s.framework].filter(Boolean);
          return (
            <span className="text-xs text-muted-foreground">
              {parts.length > 0 ? parts.join(" · ") : "Selector"}
              {typeof p.matched_agents === "number" ? ` (${p.matched_agents})` : ""}
            </span>
          );
        },
      },
      {
        id: "state",
        header: "Asks for",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {p.desired_state === "quarantined" ? (
                <span className={`${PILL} bg-(--color-warning-soft) text-(--color-warning-text)`}>
                  quarantined
                </span>
              ) : (
                <span className={`${PILL} bg-muted text-muted-foreground`}>active</span>
              )}
              {p.scope_ceiling?.length ? (
                <span className={`${PILL} bg-muted text-muted-foreground`}>
                  ≤ {p.scope_ceiling.join(",")}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "expiry",
        header: "Expiry",
        priority: 2,
        approxWidth: 200,
        cell: ({ row }) => {
          const p = row.original;
          if (!p.effective_expiry) {
            return <span className="text-xs text-muted-foreground">Never expires</span>;
          }
          return (
            <div className="flex flex-col">
              <span
                className={`text-xs ${
                  p.destructive ? "text-(--color-danger-text)" : "text-foreground"
                }`}
              >
                {EXPIRY_LABEL[p.on_expiry]}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(p.effective_expiry), { addSuffix: true })}
              </span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Delete policy",
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onSelect: () => void onDelete(row.original),
              },
            ]}
          />
        ),
      },
    ],
    // onDelete is stable enough for this list; it only closes over RTK hooks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ConsolePage
      title="Agent policies"
      description="Standing instructions for discovered agents. A reconciler compares each policy against reality every five minutes and closes the gap."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={preview} disabled={previewing}>
            <PlayCircle className="mr-1.5 h-4 w-4" />
            {previewing ? "Previewing…" : "Preview"}
          </Button>
          <Button className="text-white" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New policy
          </Button>
        </div>
      }
    >
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search policies…"
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            sizing="fit"
            cardsBelow={640}
            loading={isLoading}
            failure={tableFailure(error, "agent policies", () => refetch(), "governance:read")}
            tableId="agent-policies"
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            onRowClick={(r) => setSelected(r)}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <CreateAgentPolicyDialog open={creating} onOpenChange={setCreating} />

      <RightDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        ariaTitle="Policy details"
        ariaDescription="Inspect what this agent policy asks for and when it expires."
      >
        {selected ? (
          <DrawerBody>
            <DrawerSection label={selected.name}>
              <DetailGrid>
                <DetailRow label="Desired state" value={selected.desired_state} />
                <DetailRow
                  label="Scope ceiling"
                  value={selected.scope_ceiling?.join(", ") || "—"}
                />
                <DetailRow
                  label="Applies to"
                  value={selected.discovered_agent_id ? "One named agent" : "Selector"}
                />
                <DetailRow
                  label="On expiry"
                  value={selected.effective_expiry ? EXPIRY_LABEL[selected.on_expiry] : "Never expires"}
                />
                <DetailRow
                  label="Expires"
                  value={
                    selected.effective_expiry
                      ? new Date(selected.effective_expiry).toLocaleString()
                      : "—"
                  }
                />
                <DetailRow label="Reason" value={selected.reason || "—"} />
                <DetailRow label="Created by" value={selected.created_by || "—"} />
              </DetailGrid>
            </DrawerSection>

            {selected.destructive ? (
              <DrawerSection label="Destructive expiry">
                <p className="text-xs text-(--color-danger-text)">
                  This policy deletes workloads when it expires. It executes unattended, so it
                  carries a recorded reason and a confirmation bound to the agents that were
                  named when it was authorised — an agent that starts matching later is refused
                  rather than deleted.
                </p>
              </DrawerSection>
            ) : null}
          </DrawerBody>
        ) : null}
      </RightDrawer>
    </ConsolePage>
  );
}
