/**
 * Containments: what AuthSec stopped, whether it worked, and Release.
 * State runs previewed -> containing -> contained | partially_contained |
 * failed -> releasing -> released. Verification is by behaviour: a successful
 * call by the identity after the grace period marks it "not effective".
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useGetContainmentQuery,
  useListContainmentsQuery,
  useReleaseContainmentMutation,
  type Containment,
} from "@/app/api/igaAgentRuntimeApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DetailGrid, DetailRow, DrawerBody, DrawerFooter, DrawerHeader, DrawerSection } from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getWorkspaceId } from "@/utils/workspace";

import { CONTAIN_LEVEL_TEXT, CONTAIN_STATE_TEXT, classifyAr, shortTime, chipButtonClass } from "./model";
import { ActionError, Mono, NotAvailable, ReadFailure } from "./parts";
import { useAgentRuntimeCaps } from "./useAgentRuntimeCaps";
import { useArAction } from "./useArAction";

/** The states a release may start from (arv-be internal/agentcontain/contain.go ReleasableStates). */
const RELEASABLE = new Set(["previewed", "containing", "contained", "partially_contained"]);
const IN_PROGRESS = new Set(["previewed", "containing", "releasing"]);

function StateChip({ state }: { state: Containment["state"] }) {
  const s = CONTAIN_STATE_TEXT[state];
  return <StatusBadge tone={s?.tone ?? "neutral"}>{s?.label ?? state}</StatusBadge>;
}

/** What the behavioural check found. `effective` null is "not verified", said with its reason. */
function verificationOf(c: Containment): { label: string; tone: "success" | "danger" | "neutral" | "warning"; note: string } {
  if (c.state === "released") return { label: "Released", tone: "neutral", note: "Verification no longer applies." };
  if (c.effective === true) return { label: "Verified", tone: "success", note: `No successful call by the identity after containment${c.verified_at ? ` (checked ${shortTime(c.verified_at)})` : ""}. CloudTrail delivery can be late, so a later event can still change this.` };
  if (c.effective === false) return { label: "Not effective", tone: "danger", note: "The identity made successful calls after the containment took effect." };
  if (c.state === "contained" || c.state === "partially_contained") {
    const unverifiable = c.verification?.unverifiable;
    return unverifiable
      ? { label: "Unverifiable", tone: "warning", note: unverifiable.reason }
      : { label: "Not verified yet", tone: "neutral", note: "Waiting for CloudTrail events from after the containment. Not verified is not the same as effective." };
  }
  return { label: "Not verified", tone: "neutral", note: c.state_reason || "Verification starts once the containment is applied." };
}

function ReleaseDialog({ c, onClose }: { c: Containment | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [release] = useReleaseContainmentMutation();
  const act = useArAction();
  useEffect(() => {
    if (c) {
      setReason("");
      act.clear();
    }
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);
  if (!c) return null;
  const go = async () => {
    const ok = await act.run(() => release({ id: c.id, reason: reason.trim() }));
    if (ok) {
      toast.success("Release started. AuthSec is restoring exactly what it changed.");
      onClose();
    }
  };
  return (
    <Dialog open onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Release this containment?</DialogTitle>
          <DialogDescription>AuthSec restores exactly what it changed, from the before-state it recorded. The identity can act again once that is done.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="release-reason" className="text-[13px] font-medium">
            Why
          </label>
          <Textarea id="release-reason" rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ActionError failure={act.failure} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void go()} disabled={act.pending || !reason.trim()}>
            {act.pending ? "Working…" : "Release"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContainmentDrawer({ id, row, onClose }: { id: string | null; row: Containment | null; onClose: () => void }) {
  const ws = getWorkspaceId() ?? "";
  const [releasing, setReleasing] = useState(false);
  // The detail carries the steps; it is read again while the containment is moving.
  const [poll, setPoll] = useState(0);
  const q = useGetContainmentQuery({ ws, id: id ?? "" }, { skip: !id, pollingInterval: poll });
  // Polling follows the detail's own state, not the list row's.
  const detailState = q.data?.data.state;
  useEffect(() => setPoll(detailState && IN_PROGRESS.has(detailState) ? 3000 : 0), [detailState]);
  const c = q.data?.data ?? row;
  const failure = classifyAr(q.error);
  const v = c ? verificationOf(c) : null;
  const canRelease = !!c && RELEASABLE.has(c.state);

  return (
    <RightDrawer open={!!id} onClose={onClose} width={560} ariaTitle="Containment detail" ariaDescription="State, steps and verification of one containment.">
      {c ? (
        <>
          <DrawerHeader title={c.identity_arn.split("/").pop() || c.identity_arn} subtitle={`${CONTAIN_LEVEL_TEXT[c.level]?.title ?? c.level} level`} badge={<StateChip state={c.state} />} />
          <DrawerBody>
            {failure ? <ReadFailure failure={failure} subject="this containment" onRetry={() => void q.refetch()} /> : null}
            <DrawerSection label="Containment">
              <DetailGrid>
                <DetailRow label="Identity" value={c.identity_arn} mono full />
                <DetailRow label="Reason" value={c.reason} full />
                <DetailRow label="Requested" value={shortTime(c.created_at)} />
                <DetailRow label="Contained" value={shortTime(c.contained_at)} />
                {c.state_reason ? <DetailRow label="Status note" value={c.state_reason} full /> : null}
                {c.released_at ? <DetailRow label="Released" value={`${shortTime(c.released_at)}${c.release_reason ? `: ${c.release_reason}` : ""}`} full /> : null}
              </DetailGrid>
            </DrawerSection>
            {v ? (
              <DrawerSection label="Verification">
                <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
                <p className="mt-2 text-xs text-muted-foreground">{v.note}</p>
                {c.verification?.late_events?.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {c.verification.late_events.map((e) => (
                      <li key={e.event_id}>
                        {e.event_name} <span className="text-muted-foreground">{e.event_source} {shortTime(e.event_time)}</span>
                        {e.weak ? <span className="text-muted-foreground"> (matched by session name only: weak, unverified)</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </DrawerSection>
            ) : null}
            <DrawerSection label="Steps">
              {c.steps?.length ? (
                <ul className="space-y-2 text-[13px]">
                  {c.steps.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.kind.replace(/_/g, " ")}</span> <span className="text-xs text-muted-foreground">{s.state.replace(/_/g, " ")}</span>
                      <div>
                        <Mono>{s.target}</Mono>
                      </div>
                      {s.error ? <p className="text-xs text-(--color-danger-text)">{s.error}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{q.isFetching ? "Loading steps…" : "No steps recorded yet."}</p>
              )}
            </DrawerSection>
          </DrawerBody>
          <DrawerFooter>
            {canRelease ? (
              <Button variant="outline" onClick={() => setReleasing(true)}>
                Release…
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DrawerFooter>
          <ReleaseDialog c={releasing ? c : null} onClose={() => setReleasing(false)} />
        </>
      ) : null}
    </RightDrawer>
  );
}

export default function ContainmentsPage() {
  const ws = getWorkspaceId() ?? "";
  const [params, setParams] = useSearchParams();
  const caps = useAgentRuntimeCaps(ws, "agent_containment");
  const [filter, setFilter] = useState<"" | "active" | "released">("");
  const state = filter === "active" ? "containing,contained,partially_contained,failed,releasing" : filter === "released" ? "released" : undefined;
  const list = useListContainmentsQuery({ ws, state, limit: 100 }, { skip: caps.state !== "available", pollingInterval: 10_000, skipPollingIfUnfocused: true });
  const failure = classifyAr(list.error);
  const openId = params.get("open");
  const rows = list.data?.data ?? [];

  const columns = useMemo<AdaptiveColumn<Containment>[]>(
    () => [
      {
        id: "identity",
        header: "Identity",
        label: "Identity",
        primary: true,
        alwaysVisible: true,
        minWidth: 240,
        approxWidth: 300,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium" title={row.original.identity_arn}>
              {row.original.identity_arn.split("/").pop() || row.original.identity_arn}
            </div>
            <div className="truncate text-xs text-(--color-text-secondary)">{row.original.reason}</div>
          </div>
        ),
        detail: (c) => c.identity_arn,
      },
      { id: "level", header: "Level", label: "Level", priority: 2, approxWidth: 120, cell: ({ row }) => <span className="text-[13px]">{CONTAIN_LEVEL_TEXT[row.original.level]?.title ?? row.original.level}</span>, detail: (c) => c.level },
      { id: "state", header: "State", label: "State", alwaysVisible: true, approxWidth: 170, cell: ({ row }) => <StateChip state={row.original.state} />, detail: (c) => c.state },
      {
        id: "verification",
        header: "Verification",
        label: "Verification",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => {
          const v = verificationOf(row.original);
          return <StatusBadge tone={v.tone}>{v.label}</StatusBadge>;
        },
        detail: (c) => verificationOf(c).label,
      },
      { id: "when", header: "Requested", label: "Requested", priority: 3, approxWidth: 170, cell: ({ row }) => <span className="text-xs">{shortTime(row.original.created_at)}</span>, detail: (c) => shortTime(c.created_at) },
    ],
    [],
  );

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", id);
    else next.delete("open");
    setParams(next, { replace: true });
  };

  return (
    <ConsolePage
      title="Containments"
      description="What AuthSec has stopped, whether it worked, and how to release it. Start one from an AI workload under Discovery."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/iga/discovery?provider=aws&type=ai_workloads">AI workloads</Link>
        </Button>
      }
    >
      {caps.state !== "available" ? (
        <NotAvailable caps={caps} what="Containment" />
      ) : (
        <>
          <div role="radiogroup" aria-label="Show" className="flex items-center gap-1.5">
            {([["", "All"], ["active", "Active"], ["released", "Released"]] as const).map(([k, l]) => (
              <button key={k || "all"} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={chipButtonClass(filter === k)}>
                {l}
              </button>
            ))}
          </div>
          {caps.containment?.workload_containment && !caps.containment.workload_containment.available ? (
            <p className="text-xs text-(--color-text-muted)">Workload-level containment is not available: {caps.containment.workload_containment.reason ?? "no reason given"}.</p>
          ) : null}
          {failure && !list.data ? <ReadFailure failure={failure} subject="containments" onRetry={() => void list.refetch()} /> : null}
          {!failure || list.data ? (
            <div className="overflow-clip rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
              <CardContent variant="flush">
                <AdaptiveTable
                  tableId="agent-runtime-containments"
                  data={rows}
                  columns={columns}
                  getRowId={(c) => c.id}
                  enableSelection={false}
                  sizing="fit"
                  loading={list.isLoading}
                  onRowClick={(c) => setOpen(c.id)}
                  emptyState={<p className="py-6 text-center text-sm text-(--color-text-muted)">No containments.</p>}
                />
              </CardContent>
            </div>
          ) : null}
          <ContainmentDrawer id={openId} row={rows.find((r) => r.id === openId) ?? null} onClose={() => setOpen(null)} />
        </>
      )}
    </ConsolePage>
  );
}
