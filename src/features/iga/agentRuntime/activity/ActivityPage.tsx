/**
 * Agent activity timeline. Route /iga/agent-runtime/activity (optional ?identity_id= & workload_id=).
 * Reads need discovery:read; the settings and OTLP token controls are offered only when the server says the
 * reader can administer (discovery:admin). No prompt or completion text exists in this data.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { useCanAdminister } from "@/features/iga/connections/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWorkspaceId } from "@/utils/workspace";

import { chipButtonClass } from "../model";
import { ReadFailure } from "../parts";
import { ActivityRow } from "./ActivityRow";
import { ActivitySettings } from "./ActivitySettings";
import { CoveragePanel } from "./CoveragePanel";
import { OtlpTokens } from "./OtlpTokens";
import { isUuid, KIND_TEXT, OUTCOME, SOURCE_TEXT, useActivityFeed } from "./activityModel";

const RANGES: { id: string; label: string; ms: number }[] = [
  { id: "1h", label: "Last hour", ms: 3_600_000 },
  { id: "24h", label: "24 hours", ms: 86_400_000 },
  { id: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { id: "30d", label: "30 days", ms: 30 * 86_400_000 },
  { id: "", label: "All retained", ms: 0 },
];

function SelectFilter({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: Record<string, string> }) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-(--color-text-muted)">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2 text-xs">
        <option value="">Any</option>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ActivityPage() {
  const ws = getWorkspaceId() ?? "";
  const canAdmin = useCanAdminister();
  const [params, setParams] = useSearchParams();
  const identityId = params.get("identity_id") ?? "";
  const workloadId = params.get("workload_id") ?? "";
  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [source, setSource] = useState("");
  const [range, setRange] = useState("24h");
  // The window is fixed when the filter changes, so a re-render never moves `from` and refetches.
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.id === range);
    return r && r.ms ? new Date(anchor - r.ms).toISOString() : undefined;
  }, [range, anchor]);

  const idBad = identityId !== "" && !isUuid(identityId);
  const wlBad = workloadId !== "" && !isUuid(workloadId);
  const feed = useActivityFeed(
    {
      ws,
      identity_id: identityId || undefined,
      workload_id: workloadId || undefined,
      kind: kind || undefined,
      outcome: outcome || undefined,
      source: source || undefined,
      from,
      limit: 50,
    },
    idBad || wlBad,
  );

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v.trim()) next.set(k, v.trim());
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const filtered = !!(identityId || workloadId || kind || outcome || source);

  return (
    <ConsolePage
      title="Agent activity"
      description="What AI workloads and agents did: model and tool calls, agent steps and cloud actions, from the sources below. Prompts and responses are never stored."
      actions={
        <Button variant="outline" size="sm" onClick={() => { setAnchor(Date.now()); feed.refetch(); }}>
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Time range" className="flex flex-wrap items-center gap-1.5">
              {RANGES.map((r) => (
                <button key={r.id || "all"} type="button" role="radio" aria-checked={range === r.id} onClick={() => { setRange(r.id); setAnchor(Date.now()); }} className={chipButtonClass(range === r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SelectFilter id="act-source" label="Source" value={source} onChange={setSource} options={SOURCE_TEXT} />
              <SelectFilter id="act-kind" label="Kind" value={kind} onChange={setKind} options={KIND_TEXT} />
              <SelectFilter id="act-outcome" label="Outcome" value={outcome} onChange={setOutcome} options={Object.fromEntries(Object.entries(OUTCOME).map(([k, v]) => [k, v.label]))} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="act-workload" className="text-xs text-(--color-text-muted)">
                  Workload id
                </label>
                <Input id="act-workload" className="h-8 w-72 font-mono text-xs" value={workloadId} aria-invalid={wlBad} onChange={(e) => setParam("workload_id", e.target.value)} placeholder="UUID" autoComplete="off" />
              </div>
              <div className="flex items-center gap-1.5">
                <label htmlFor="act-identity" className="text-xs text-(--color-text-muted)">
                  Identity id
                </label>
                <Input id="act-identity" className="h-8 w-72 font-mono text-xs" value={identityId} aria-invalid={idBad} onChange={(e) => setParam("identity_id", e.target.value)} placeholder="UUID" autoComplete="off" />
              </div>
              {filtered ? (
                <Button variant="outline" size="sm" onClick={() => { setKind(""); setOutcome(""); setSource(""); setParams(new URLSearchParams(), { replace: true }); }}>
                  Clear filters
                </Button>
              ) : null}
            </div>
            {idBad || wlBad ? <p role="alert" className="text-xs text-(--color-danger-text)">An id must be a UUID.</p> : null}
          </div>

          {feed.loading ? <p role="status" className="text-sm text-(--color-text-muted)">Loading activity…</p> : null}
          {feed.failure && !feed.hasData ? <ReadFailure failure={feed.failure} subject="activity" onRetry={feed.refetch} /> : null}
          {feed.hasData && feed.rows.length === 0 ? (
            <p className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-6 text-center text-sm text-(--color-text-muted)">
              {filtered || range ? "No activity matches these filters in this window. That is not proof nothing happened: see which sources are reading." : "No activity recorded yet. Create an OTLP token or scan an AWS connection with AI workloads."}
            </p>
          ) : null}
          {feed.rows.length ? (
            <ul className="divide-y divide-(--color-border-subtle) rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4">
              {feed.rows.map((a) => (
                <ActivityRow key={a.id} a={a} />
              ))}
            </ul>
          ) : null}
          {feed.loadMoreFailed ? <p role="alert" className="text-xs text-(--color-danger-text)">Could not load more. Try again.</p> : null}
          {feed.hasMore ? (
            <Button variant="outline" size="sm" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>
              {feed.loadingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          <CoveragePanel />
          <OtlpTokens canAdmin={canAdmin} />
          {canAdmin ? <ActivitySettings /> : null}
        </div>
      </div>
    </ConsolePage>
  );
}
