/**
 * Contain…: the blast radius first, then a level, then confirm
 * (SPEC-agent-runtime-visibility.md §5.8). The preview stores nothing; the
 * level and reason go to POST /containments, which recomputes the preview and
 * refuses a level that is not offered (422 containment_refused).
 *
 * Identity level also needs governance:emergency: the backend answers 403 with
 * its own sentence, shown as it is. There is no approval step (spec §10 Q6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useCreateContainmentMutation,
  usePreviewContainmentMutation,
  type ContainLevel,
  type ContainLevelOption,
  type ContainPreview,
} from "@/app/api/igaAgentRuntimeApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { CONTAIN_LEVEL_TEXT, classifyAr } from "./model";
import { ActionError, Mono, ReadFailure } from "./parts";
import { useArAction } from "./useArAction";
import type { PolicyFailure } from "../policy/shared";

export interface ContainTarget {
  identityId: string;
  identityName: string;
  /** The identity's workloads (cloud workload ids): the workload level acts on these. */
  workloads: { id: string; name: string }[];
}

const LEVELS: ContainLevel[] = ["workload", "model", "identity"];

function LevelCard({ opt, chosen, onChoose }: { opt: ContainLevelOption; chosen: boolean; onChoose: () => void }) {
  const text = CONTAIN_LEVEL_TEXT[opt.level];
  return (
    <div className={cn("rounded-md border p-3", chosen ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-subtle)", !opt.offered && "opacity-90")}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="radio" name="contain-level" className="mt-1" checked={chosen} disabled={!opt.offered} onChange={onChoose} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{text?.title ?? opt.level}</span>
          <span className="block text-xs text-(--color-text-muted)">{opt.summary || text?.short}</span>
        </span>
      </label>
      {!opt.offered ? (
        <ul className="mt-2 space-y-1 pl-6 text-xs text-(--color-warning-text)">
          {(opt.refusals ?? []).length === 0 ? <li>Not offered.</li> : null}
          {(opt.refusals ?? []).map((r, i) => (
            <li key={`${r.code}-${i}`}>{r.message}</li>
          ))}
        </ul>
      ) : null}
      {opt.level === "identity" ? <p className="mt-2 pl-6 text-xs text-(--color-text-muted)">Needs the governance:emergency permission: it stops every workload on the role at once.</p> : null}
      {opt.offered || (opt.stops ?? []).length || (opt.also_stops ?? []).length ? (
        <div className="mt-2 space-y-2 pl-6 text-xs">
          {(opt.stops ?? []).length ? (
            <p>
              <span className="font-medium">Stops:</span> {(opt.stops ?? []).map((w) => w.name || w.id).join(", ")}
            </p>
          ) : null}
          {(opt.also_stops ?? []).length ? (
            <p className="text-(--color-warning-text)">
              <span className="font-medium">This also stops:</span> {(opt.also_stops ?? []).map((w) => w.name || w.id).join(", ")}
            </p>
          ) : null}
          {(opt.side_effects ?? []).length ? (
            <ul className="space-y-1">
              {(opt.side_effects ?? []).map((s, i) => (
                <li key={`${s.code}-${i}`} className="text-(--color-text-muted)">
                  Side effect: {s.message}
                </li>
              ))}
            </ul>
          ) : null}
          {(opt.steps ?? []).length ? (
            <details>
              <summary className="cursor-pointer text-(--color-text-muted)">What AuthSec would change ({(opt.steps ?? []).length})</summary>
              <ul className="mt-1 space-y-1">
                {(opt.steps ?? []).map((s, i) => (
                  <li key={i}>
                    {s.detail} <Mono>{s.target}</Mono>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ContainDialog({ target, onClose }: { target: ContainTarget | null; onClose: () => void }) {
  const open = !!target;
  const [preview, { isLoading: previewing }] = usePreviewContainmentMutation();
  const [create] = useCreateContainmentMutation();
  const act = useArAction();
  const [data, setData] = useState<ContainPreview | null>(null);
  const [loadFailure, setLoadFailure] = useState<PolicyFailure | null>(null);
  // The chosen workloads belong to one subject: a different subject starts from its own default, never the previous one's.
  const [sel, setSel] = useState<{ identityId: string; ids: string[] } | null>(null);
  const defaultIds = target && target.workloads.length === 1 ? [target.workloads[0].id] : [];
  const selected = target && sel?.identityId === target.identityId ? sel.ids : defaultIds;
  const setSelected = (f: (s: string[]) => string[]) => target && setSel({ identityId: target.identityId, ids: f(selected) });
  const latest = useRef(0);
  const [level, setLevel] = useState<ContainLevel | null>(null);
  const [reason, setReason] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);

  const key = selected.slice().sort().join(",");
  const load = useCallback(
    async (identityId: string, ids: string[]) => {
      setLoadFailure(null);
      // Only the newest request may write: an older answer arriving late is dropped.
      const mine = ++latest.current;
      try {
        const res = await preview({ identity_id: identityId, workload_ids: ids.length ? ids : undefined }).unwrap();
        if (mine === latest.current) setData(res.data);
      } catch (e) {
        if (mine !== latest.current) return;
        setData(null);
        setLoadFailure(classifyAr(e));
      }
    },
    [preview],
  );

  useEffect(() => {
    if (!target) return;
    setData(null);
    setLevel(null);
    setReason("");
    setCreatedId(null);
    act.clear();
    setSel(null);
    // Only opening resets the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.identityId]);

  // The preview follows the chosen workloads: what a workload-level containment stops depends on them.
  useEffect(() => {
    if (!target) {
      latest.current++;
      return;
    }
    void load(target.identityId, key ? key.split(",") : []);
  }, [target, key, load]);

  const options = useMemo(() => LEVELS.map((l) => (data?.levels ?? []).find((o) => o.level === l)).filter((o): o is ContainLevelOption => !!o), [data]);
  const chosen = options.find((o) => o.level === level);
  const canSubmit = !!chosen?.offered && !!reason.trim() && !act.pending && !createdId;

  async function go() {
    if (!target || !level || !canSubmit) return;
    const res = await act.run(() =>
      create({ identity_id: target.identityId, level, reason: reason.trim(), workload_ids: level === "workload" ? selected : undefined }),
    );
    if (res) {
      setCreatedId(res.data.id);
      toast.success("Containment started. AuthSec is applying it and will verify it.");
    }
  }

  if (!target) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !act.pending ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contain {target.identityName}</DialogTitle>
          <DialogDescription>See what each level stops before you choose one. Nothing changes until you confirm. Releasing restores exactly what was changed.</DialogDescription>
        </DialogHeader>

        {previewing && !data ? <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Working out the blast radius" /> : null}
        {loadFailure ? <ReadFailure failure={loadFailure} subject="the containment preview" onRetry={() => void load(target.identityId, selected)} /> : null}

        {data ? (
          <div className="space-y-4">
            <div className="rounded-md bg-(--color-surface-subtle) px-3 py-2 text-xs">
              <p>
                Identity <Mono>{data.subject.arn}</Mono>
                {data.shared_role ? <span className="ml-1 font-semibold text-(--color-warning-text)">Shared role: several workloads run as it.</span> : null}
              </p>
              {(data.recent_services ?? []).length ? <p className="mt-1 text-(--color-text-muted)">Recently used: {(data.recent_services ?? []).map((s) => s.service).join(", ")}</p> : null}
            </div>

            {(data.refusals ?? []).map((r, i) => (
              <p key={i} className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                {r.message}
              </p>
            ))}
            {(data.warnings ?? []).map((w, i) => (
              <p key={i} className="text-xs text-(--color-text-muted)">
                {w}
              </p>
            ))}
            {!data.binding && data.binding_reason ? <p className="text-xs text-(--color-warning-text)">Identity and model levels unavailable: {data.binding_reason}</p> : null}
            {!data.workload && data.workload_reason ? <p className="text-xs text-(--color-warning-text)">Workload level unavailable: {data.workload_reason}</p> : null}

            {(data.workloads ?? []).length ? (
              <fieldset className="space-y-1">
                <legend className="mb-1 text-[13px] font-semibold">Workloads that run as this identity</legend>
                <p className="text-xs text-(--color-text-muted)">The workload level stops the ones you tick.</p>
                {(data.workloads ?? []).map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={selected.includes(w.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, w.id] : s.filter((x) => x !== w.id)))}
                    />
                    <span>{w.name || w.native_id}</span>
                    <span className="text-xs text-(--color-text-muted)">
                      {w.kind} {w.region}
                      {w.event_source_mappings > 0 ? `, ${w.event_source_mappings} event source mappings` : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            <div className="space-y-2" role="radiogroup" aria-label="Containment level">
              {options.map((o) => (
                <LevelCard key={o.level} opt={o} chosen={level === o.level} onChoose={() => setLevel(o.level)} />
              ))}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="contain-reason" className="text-[13px] font-medium text-(--color-text)">
                Why
              </label>
              <Textarea id="contain-reason" rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the containment record" />
            </div>
          </div>
        ) : null}

        <ActionError failure={act.failure} />
        {createdId ? (
          <p role="status" className="text-[13px]">
            Containment recorded.{" "}
            <Link to={`/iga/agent-runtime/containments?open=${createdId}`} className="font-semibold text-(--color-primary-text) hover:underline">
              See its status
            </Link>
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={act.pending}>
            {createdId ? "Close" : "Cancel"}
          </Button>
          {!createdId ? (
            <Button className="text-white" variant="destructive" onClick={() => void go()} disabled={!canSubmit}>
              {act.pending ? "Working…" : "Contain"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
