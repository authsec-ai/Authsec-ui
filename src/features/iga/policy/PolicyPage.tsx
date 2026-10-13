/**
 * Policy — a demo of the authoring flow (not the shipped product): the list of
 * time-boxed S3 access policies for agents, Add policy, and a detail view of
 * what AWS would see. Policies are saved to the workspace; nothing is applied
 * to AWS, evaluated or enforced.
 *
 * The same Add policy form opens from an S3 bucket on the graph, with the
 * bucket filled in; `?resource=` here lists the policies on one bucket.
 */

import { Pause, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  policyDemoError,
  useDeletePolicyDemoMutation,
  useListPolicyDemoQuery,
  usePausePolicyDemoMutation,
  useSeedPolicyDemoMutation,
  type PolicyDemo,
  type PolicyDemoPhase,
} from "@/app/api/policyDemoApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { AppliedFilters, ConsoleFilterBar, ConsoleRowActions } from "@/components/console/iam-console";
import { toneClasses } from "@/components/console/status";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";

import { PolicyDetailSheet } from "./demo/PolicyDetailSheet";
import { PolicyFormDialog } from "./demo/PolicyFormDialog";
import { PhaseChip } from "./demo/PolicyStatus";
import { PHASE, actionLabel, resourceLabel, whenText, windowText } from "./demo/policyDemoModel";

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: PHASE.active.label },
  { key: "scheduled", label: PHASE.scheduled.label },
  { key: "expired", label: PHASE.expired.label },
  { key: "paused", label: PHASE.paused.label },
];

export default function PolicyPage() {
  const [params, setParams] = useSearchParams();
  const phase = (params.get("phase") ?? "") as "" | PolicyDemoPhase;
  const resource = params.get("resource") ?? "";
  const q = params.get("q") ?? "";
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // Phases move with the clock, so the list is read again now and then.
  const list = useListPolicyDemoQuery(undefined, { pollingInterval: 30_000, skipPollingIfUnfocused: true });
  const [seed, seeding] = useSeedPolicyDemoMutation();
  const [pause] = usePausePolicyDemoMutation();
  const [remove, removing] = useDeletePolicyDemoMutation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; policy?: PolicyDemo }>({ open: false });
  const [deleting, setDeleting] = useState<PolicyDemo | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => {
    const c: Record<PolicyDemoPhase, number> = { active: 0, scheduled: 0, expired: 0, paused: 0 };
    for (const p of all) c[p.phase] += 1;
    return c;
  }, [all]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (p) =>
        (!phase || p.phase === phase) &&
        (!resource || p.resource === resource) &&
        (!needle || [p.name, p.agent, p.identity, p.resource, p.prefix].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [all, phase, resource, q]);
  const selected = all.find((p) => p.id === selectedId) ?? null;
  
  async function togglePause(p: PolicyDemo) {
    try {
      await pause({ id: p.id, paused: !p.paused }).unwrap();
      toast.success(p.paused ? "Policy resumed" : "Policy paused");
    } catch (e) {
      toast.error(policyDemoError(e).message);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove(deleting.id).unwrap();
      toast.success("Policy deleted");
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
    } catch (e) {
      toast.error(policyDemoError(e).message);
    }
  }

  async function loadSamples() {
    try {
      await seed().unwrap();
    } catch (e) {
      toast.error(policyDemoError(e).message);
    }
  }

  const columns = useMemo<AdaptiveColumn<PolicyDemo>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        label: "Policy",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => (
          <div className="min-w-0">
            <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(row.original.id); }} className="block max-w-full truncate text-left text-[13px] font-medium text-(--color-primary-text) hover:underline">
              {row.original.name}
            </button>
            {row.original.description ? <div className="truncate text-xs text-(--color-text-muted)">{row.original.description}</div> : null}
          </div>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        label: "Agent",
        priority: 4,
        approxWidth: 170,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-[13px]">{row.original.agent}</div>
            <div className="truncate text-xs text-(--color-text-muted)">as {row.original.identity}</div>
          </div>
        ),
        detail: (p) => `${p.agent} as ${p.identity}`,
      },
      {
        id: "resource",
        header: "Resource",
        label: "Resource",
        priority: 2,
        approxWidth: 170,
        cell: ({ row }) => <span className="block truncate font-mono text-xs" title={`s3://${resourceLabel(row.original)}`}>{resourceLabel(row.original)}</span>,
        detail: (p) => `s3://${resourceLabel(p)}`,
      },
      {
        id: "access",
        header: "Access",
        label: "Access",
        priority: 5,
        approxWidth: 90,
        cell: ({ row }) => <span className="text-[13px]">{row.original.actions.map(actionLabel).join(", ")}</span>,
        detail: (p) => p.actions.map(actionLabel).join(", "),
      },
      {
        id: "window",
        header: "Window",
        label: "Window",
        priority: 3,
        approxWidth: 190,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-[13px]">{windowText(row.original)}</div>
            <div className="truncate text-xs text-(--color-text-muted)">{whenText(row.original)}</div>
          </div>
        ),
        detail: (p) => `${windowText(p)} · ${whenText(p)}`,
      },
      {
        id: "status",
        header: "Status",
        label: "Status",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => (
          <div className="min-w-[96px]">
            <PhaseChip phase={row.original.phase} />
          </div>
        ),
        detail: (p) => PHASE[p.phase].label,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 64,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                label={`Actions for ${p.name}`}
                items={[
                  { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => setForm({ open: true, policy: p }) },
                  { label: p.paused ? "Resume" : "Pause", icon: p.paused ? <Play className="size-4" /> : <Pause className="size-4" />, onSelect: () => void togglePause(p) },
                  { label: "Delete", icon: <Trash2 className="size-4" />, destructive: true, onSelect: () => setDeleting(p) },
                ]}
              />
            </div>
          );
        },
      },
    ],
    // togglePause only closes over mutation triggers, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const emptyState =
    all.length === 0 ? (
      <div className="mx-auto max-w-md space-y-3 py-6 text-center">
        <p className="text-sm font-semibold text-(--color-text)">No policies yet</p>
        <p className="text-[13px] text-(--color-text-muted)">
          A policy says which agent may read, write or delete in a bucket, and for how long. Create one, or start from three examples.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button className="text-white" onClick={() => setForm({ open: true })}>
            <Plus aria-hidden="true" className="size-4" />
            Add policy
          </Button>
          <Button variant="outline" onClick={() => void loadSamples()} disabled={seeding.isLoading}>
            <Sparkles aria-hidden="true" className="size-4" />
            {seeding.isLoading ? "Loading…" : "Load sample policies"}
          </Button>
        </div>
      </div>
    ) : (
      <div className="space-y-2 py-4 text-center text-sm text-(--color-text-muted)">
        <p>No policies match these filters.</p>
        <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
          Clear filters
        </Button>
      </div>
    );

  return (
    <ConsolePage
      title="Policy"
      description="Decide which agents may reach which data, and for how long."
      actions={
        <Button className="text-white" onClick={() => setForm({ open: true })}>
          <Plus aria-hidden="true" className="size-4" />
          Add policy
        </Button>
      }
    >
      <div role="note" className={cn("rounded-lg border px-4 py-2.5", toneClasses.neutral.banner)}>
        <p className="text-[13px] text-(--color-text)">
          <strong className="font-semibold">Demo.</strong> Policies are saved to this workspace and show the AWS documents they would produce. Nothing is applied to AWS.
        </p>
      </div>

      <div data-graph-search>
        <ConsoleFilterBar
          search={q}
          onSearchChange={(v) => setParam("q", v || null)}
          searchPlaceholder="Search policy, agent or bucket"
          filters={STATUS_FILTERS.map((f) => ({ ...f, count: f.key ? counts[f.key as PolicyDemoPhase] : all.length }))}
          activeFilter={phase}
          onFilterChange={(k) => setParam("phase", k || null)}
          below={
            resource ? (
              <AppliedFilters filters={[{ key: "resource", label: `Bucket ${resource}`, onRemove: () => setParam("resource", null) }]} onClearAll={() => setParams({}, { replace: true })} />
            ) : undefined
          }
        />
      </div>

      <TableCard>
        <CardContent variant="flush">
          {list.isError && !list.data ? (
            <div role="alert" className="px-4 py-6 text-sm">
              <strong className="font-medium">Could not load policies.</strong> {policyDemoError(list.error).message}{" "}
              <button className="underline" onClick={() => void list.refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <AdaptiveTable
              tableId="policy-demo-policies"
              sizing="fit"
              rowDetails={false}
              cardsBelow={640}
              loading={list.isLoading}
              emptyState={emptyState}
              columns={columns}
              data={rows}
              getRowId={(p) => p.id}
              onRowClick={(p) => setSelectedId(p.id)}
              enableSelection={false}
              enableExpansion={false}
              enableSorting={false}
              enablePagination={false}
            />
          )}
        </CardContent>
      </TableCard>

      <PolicyDetailSheet
        policy={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(p) => setForm({ open: true, policy: p })}
        onTogglePause={(p) => void togglePause(p)}
        onDelete={(p) => setDeleting(p)}
      />

      <PolicyFormDialog
        open={form.open}
        onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))}
        policy={form.policy}
        onSaved={(p) => setSelectedId(p.id)}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && !removing.isLoading && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this policy?</DialogTitle>
            <DialogDescription>
              {deleting ? `“${deleting.name}” will be removed. The agent loses the access it described.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={removing.isLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={removing.isLoading}>
              {removing.isLoading ? "Deleting…" : "Delete policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
