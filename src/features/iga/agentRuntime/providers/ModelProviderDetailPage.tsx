/**
 * One connected model provider organisation. Route
 * /iga/agent-runtime/model-providers/:id. Keys (accounted or not, and why),
 * usage totals per key, model or project over a window (the API returns totals,
 * not a time series), and this connection's unaccounted_model_usage findings,
 * which are weak evidence: matched by NAME only, no key value is ever read.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useGetModelProviderQuery,
  useGetModelProviderUsageQuery,
  useListModelProviderFindingsQuery,
  useListModelProviderKeysQuery,
  useSyncModelProviderMutation,
  type ModelProviderKey,
  type UsageGroupBy,
} from "@/app/api/igaAgentModelProvidersApi";
import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { ConsolePage } from "@/components/console/ConsolePage";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";
import { getWorkspaceId } from "@/utils/workspace";

import { chipButtonClass, classifyAr, shortTime } from "../model";
import { ActionError, Mono, ReadFailure } from "../parts";
import { usePolicyPermission } from "../../policy/shared";
import { useGwAction } from "../gateway/useGwAction";
import { fmtInt, providerText } from "./providerModel";
import { RevokeDialog, RotateDialog, StatusChip } from "./providerParts";

const WINDOWS = [7, 30, 90] as const;
const GROUPS: { id: UsageGroupBy; label: string }[] = [
  { id: "key", label: "By key" },
  { id: "model", label: "By model" },
  { id: "project", label: "By project" },
];

const th = "px-3 py-2 text-left text-xs font-semibold text-(--color-text-muted)";
const td = "px-3 py-2 align-top text-[13px]";

function keyWhy(k: ModelProviderKey): string {
  const links = k.links ?? [];
  if (k.unaccounted) return "Used in the last 7 days, but no Secrets Manager secret or Lambda environment variable name in your AWS accounts contains this key's name or project name.";
  if (links.length) return `Name matched (weak): ${links.map((l) => `${l.via === "secret_name" ? "secret" : "env var"} "${l.name}" contains the ${l.matched === "project_name" ? "project" : "key"} name`).join("; ")}.`;
  return "No use in the last 7 days, so there is nothing to account for.";
}

function KeysPanel({ ws, id }: { ws: string; id: string }) {
  const q = useListModelProviderKeysQuery({ ws, id });
  const failure = classifyAr(q.error);
  const keys = q.data?.data ?? [];
  return (
    <Panel title="Keys" count={q.data ? `${keys.length}` : undefined} description="Provider API keys in the organisation. Only names and hints are collected, never a key value." flush>
      {failure && !q.data ? <div className="p-4"><ReadFailure failure={failure} subject="keys" onRetry={() => void q.refetch()} /></div> : null}
      {q.isLoading ? <p role="status" className="p-4 text-sm text-(--color-text-muted)">Loading keys…</p> : null}
      {q.data && keys.length === 0 ? <p className="p-4 text-[13px] text-(--color-text-muted)">No keys collected yet. They appear after the first sync.</p> : null}
      {keys.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--color-border-subtle)">
                <th className={th}>Key</th>
                <th className={th}>Project</th>
                <th className={th}>Last used</th>
                <th className={th}>7-day tokens (in / out)</th>
                <th className={th}>Accounting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border-subtle)">
              {keys.map((k) => (
                <tr key={k.provider_key_id}>
                  <td className={td}>
                    <div className="font-medium">{k.name || k.provider_key_id}</div>
                    <div className="text-xs text-(--color-text-muted)">
                      {k.key_hint ? <Mono>{k.key_hint}</Mono> : null} {k.status}
                      {k.owner_name ? ` · owner ${k.owner_name}` : ""}
                    </div>
                  </td>
                  <td className={td}>{k.project_name || k.project_id || "none"}</td>
                  <td className={td}>{k.last_used_at ? shortTime(k.last_used_at) : "never seen in use"}</td>
                  <td className={`${td} tabular-nums`}>
                    {fmtInt(k.input_tokens_7d)} / {fmtInt(k.output_tokens_7d)}
                    <div className="text-xs text-(--color-text-muted)">{k.requests_7d === null ? "requests not reported" : `${fmtInt(k.requests_7d)} requests`}</div>
                  </td>
                  <td className={td}>
                    <StatusBadge tone={k.unaccounted ? "warning" : (k.links ?? []).length ? "info" : "neutral"}>{k.unaccounted ? "Unaccounted" : (k.links ?? []).length ? "Accounted (weak)" : "Idle"}</StatusBadge>
                    <p className="mt-1 max-w-md text-xs text-(--color-text-muted)">{keyWhy(k)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function UsagePanel({ ws, id }: { ws: string; id: string }) {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7);
  const [group, setGroup] = useState<UsageGroupBy>("key");
  // Rounded UP to the hour so the cache key is stable between renders and the
  // window never exceeds the backend's 90-day limit (model_provider.go:55).
  const from = useMemo(() => new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 - days * 86_400_000).toISOString(), [days]);
  const q = useGetModelProviderUsageQuery({ ws, id, from, group_by: group });
  const failure = classifyAr(q.error);
  const rows = q.data?.data ?? [];
  return (
    <Panel
      title="Usage"
      description="Totals per group over the window. The provider's buckets are summed; the API does not return a per-day series."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Window" className="flex gap-1.5">
            {WINDOWS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={chipButtonClass(days === d)}>
                {d} days
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Group by" className="flex gap-1.5">
            {GROUPS.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={group === g.id} onClick={() => setGroup(g.id)} className={chipButtonClass(group === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {failure && !q.data ? <ReadFailure failure={failure} subject="usage" onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <p role="status" className="text-sm text-(--color-text-muted)">Loading usage…</p> : null}
      {q.data && rows.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">No usage recorded in this window.</p> : null}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--color-border-subtle)">
                <th className={th}>{group === "key" ? "Key" : group === "model" ? "Model" : "Project"}</th>
                <th className={th}>Requests</th>
                <th className={th}>Input tokens</th>
                <th className={th}>Cached input</th>
                <th className={th}>Output tokens</th>
                <th className={th}>First / last bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border-subtle)">
              {rows.map((r) => (
                <tr key={r.group}>
                  <td className={td}>
                    <div className="font-medium">{r.name || r.group || "unattributed"}</div>
                    {r.name && r.group ? <Mono>{r.group}</Mono> : null}
                  </td>
                  <td className={`${td} tabular-nums`}>{fmtInt(r.requests)}</td>
                  <td className={`${td} tabular-nums`}>{fmtInt(r.input_tokens)}</td>
                  <td className={`${td} tabular-nums`}>{fmtInt(r.cached_input_tokens)}</td>
                  <td className={`${td} tabular-nums`}>{fmtInt(r.output_tokens)}</td>
                  <td className={`${td} text-xs`}>
                    {shortTime(r.first_bucket)}
                    <div className="text-(--color-text-muted)">{shortTime(r.last_bucket)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function FindingsPanel({ ws, id }: { ws: string; id: string }) {
  const q = useListModelProviderFindingsQuery({ ws, limit: 200 });
  const failure = classifyAr(q.error);
  // GET /findings has no connection filter: the subject names the connection.
  const mine = (q.data?.data ?? []).filter((f) => f.subject?.connection_id === id);
  return (
    <Panel
      title="Unaccounted model usage"
      count={q.data ? `${mine.length}` : undefined}
      description="Weak evidence. A key is listed when it was used in the last 7 days and no AWS secret or Lambda environment variable NAME contains the key's or project's name. Names only: no value was read, and a miss does not prove the key is unmanaged."
    >
      {failure && !q.data ? <ReadFailure failure={failure} subject="findings" onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <p role="status" className="text-sm text-(--color-text-muted)">Loading findings…</p> : null}
      {q.data && mine.length === 0 ? <p className="text-[13px] text-(--color-text-muted)">No unaccounted usage found for this organisation.</p> : null}
      {mine.length ? (
        <ul className="divide-y divide-(--color-border-subtle)">
          {mine.map((f) => (
            <li key={f.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{f.subject.key_name || f.subject.provider_key_id}</span>
                <StatusBadge tone={f.state === "open" ? "warning" : "neutral"}>{f.state === "open" ? "Open" : "Resolved"}</StatusBadge>
                <StatusBadge tone="neutral" title="Matched by name only">Weak evidence</StatusBadge>
              </div>
              <p className="text-xs text-(--color-text-muted)">
                {f.subject.project_name ? `Project ${f.subject.project_name} · ` : ""}
                {fmtInt(f.evidence.input_tokens)} input / {fmtInt(f.evidence.output_tokens)} output tokens in {f.evidence.window_days ?? 7} days
                {f.evidence.models?.length ? ` · models ${f.evidence.models.join(", ")}` : ""}
              </p>
              <p className="text-xs text-(--color-text-muted)">
                {f.evidence.attribution ?? "No attribution detail."} {f.evidence.names_checked !== undefined ? `(${f.evidence.names_checked} names checked.)` : ""}
              </p>
              <p className="text-xs text-(--color-text-muted)">
                First seen {shortTime(f.first_seen)} · last seen {shortTime(f.last_seen)}
                {f.resolved_at ? ` · resolved ${shortTime(f.resolved_at)}${f.evidence.resolved_reason ? ` (${f.evidence.resolved_reason.replace(/_/g, " ")})` : ""}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {q.data?.meta.next_cursor ? <p className="text-xs text-(--color-text-muted)">Showing the newest {q.data.data.length} findings in the workspace; older ones may be missing.</p> : null}
    </Panel>
  );
}

export default function ModelProviderDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const q = useGetModelProviderQuery({ ws, id }, { skip: !id });
  const [sync] = useSyncModelProviderMutation();
  const act = useGwAction();
  const canWrite = usePolicyPermission("governance:enforce").offered;
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const c = q.data?.data;
  useBreadcrumbTail(id ? `/iga/agent-runtime/model-providers/${id}` : null, c?.display_name ?? "Model provider", { label: "Model providers", href: "/iga/agent-runtime/model-providers" });
  const failure = classifyAr(q.error);
  const live = !!c && c.status !== "revoked";

  const runSync = async () => {
    const res = await act.run(() => sync({ id }));
    if (res) toast.success(res.data.next_sync_at ? `Sync queued for ${shortTime(res.data.next_sync_at)}.` : "Sync queued.");
  };

  return (
    <ConsolePage
      title={c?.display_name ?? "Model provider"}
      description={c ? `${providerText(c.provider)} organisation ${c.org_name || c.org_id || "unknown"}` : undefined}
      actions={
        live && canWrite ? (
          <>
            <Button variant="outline" size="sm" onClick={() => void runSync()} disabled={act.pending}>
              {act.pending ? "Queuing…" : "Sync now"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRotating(true)}>
              Rotate key
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRevoking(true)}>
              Revoke
            </Button>
          </>
        ) : undefined
      }
    >
      <Link to="/iga/agent-runtime/model-providers" className="text-xs text-(--color-text-muted) hover:underline">
        All model providers
      </Link>
      <ActionError failure={act.failure} />
      {failure && !c ? <ReadFailure failure={failure} subject="this connection" onRetry={() => void q.refetch()} /> : null}
      {q.isLoading ? <p role="status" className="text-sm text-(--color-text-muted)">Loading connection…</p> : null}
      {c ? (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
            <StatusChip status={c.status} />
            <span>Last sync {c.last_sync_at ? shortTime(c.last_sync_at) : "never"}</span>
            <span>
              Key <Mono>{c.key_fingerprint}</Mono>
            </span>
            {c.next_sync_at && live ? <span>Next sync {shortTime(c.next_sync_at)}</span> : null}
            {c.last_error ? <span className="text-(--color-danger-text)">Last error: {c.last_error}</span> : null}
          </div>
          <KeysPanel ws={ws} id={id} />
          <UsagePanel ws={ws} id={id} />
          <FindingsPanel ws={ws} id={id} />
        </>
      ) : null}
      <RotateDialog conn={rotating ? (c ?? null) : null} onClose={() => setRotating(false)} />
      <RevokeDialog conn={revoking ? (c ?? null) : null} onClose={() => setRevoking(false)} onRevoked={() => navigate("/iga/agent-runtime/model-providers")} />
    </ConsolePage>
  );
}
