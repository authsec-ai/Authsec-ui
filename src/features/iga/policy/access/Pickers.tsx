/**
 * The form's two pickers. Both read Discovery, so what you pick is what the
 * last scan found: an S3 bucket, and the IAM roles to block or allow on it.
 *
 * Discovery records what policies name: a bucket, a file, or a folder pattern
 * (`bucket/folder/*`). Most buckets appear only through such paths, so the
 * bucket list groups every S3 record by bucket, and the roles that can reach a
 * bucket are those that reach the bucket itself or any path in it. Any other
 * role can be searched for, which is what Allow needs. Users and groups are not
 * targets in this release.
 */

import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import {
  igaGraphApi,
  refId,
  useListGraphIdentitiesQuery,
  useListGraphResourcesQuery,
  type AccessRow,
  type ResourceRow,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { bucketOf, pathInBucket, type DraftResource, type DraftRole } from "./model";

/** Every bucket the S3 records name, with its records (bucket record first) and the folders seen in it. */
function groupBuckets(rows: ResourceRow[]): (DraftResource & { hasBucketRecord: boolean })[] {
  const by = new Map<string, DraftResource & { hasBucketRecord: boolean }>();
  for (const r of rows) {
    const b = bucketOf(r.text);
    if (!b) continue;
    let e = by.get(b.bucket);
    if (!e) {
      e = { resource_id: "", bucket: b.bucket, arn: `arn:aws:s3:::${b.bucket}`, account_id: r.account?.id ?? "", records: [], folders: [], hasBucketRecord: false };
      by.set(b.bucket, e);
    }
    const rec = { id: refId(r.ref), text: r.text };
    if (r.type === "s3_bucket") {
      e.records!.unshift(rec);
      e.hasBucketRecord = true;
    } else {
      e.records!.push(rec);
    }
    if (b.prefix && !e.folders!.includes(b.prefix)) e.folders!.push(b.prefix);
    if (!e.account_id && r.account?.id) e.account_id = r.account.id;
  }
  for (const e of by.values()) {
    // The record the policy names: the bucket's own, else one for the whole bucket (`bucket/*`), else any.
    const whole = e.records!.find((x) => pathInBucket(x.text) === "");
    e.resource_id = (e.hasBucketRecord ? e.records![0] : whole ?? e.records![0]).id;
    e.folders!.sort();
  }
  return [...by.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** `useDebounced(value)`: the value once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const rowButton =
  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-(--color-surface-subtle) focus-visible:bg-(--color-surface-subtle) focus-visible:outline-none";

/* --------------------------------- bucket --------------------------------- */

export function ResourcePicker({
  ws,
  value,
  onChange,
  invalid,
}: {
  ws: string;
  value: DraftResource | null;
  onChange: (r: DraftResource | null) => void;
  invalid?: boolean;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const list = useListGraphResourcesQuery({ ws, q: dq || undefined, service: "s3", limit: 200 }, { skip: !!value });
  const buckets = useMemo(() => groupBuckets(list.data?.data ?? []), [list.data]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-(--color-text)">{value.bucket}</div>
          <div className="truncate font-mono text-xs text-(--color-text-muted)">
            {value.arn}
            {value.account_id ? ` · ${value.account_id}` : ""}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border", invalid ? "border-(--color-danger)" : "border-(--color-border-strong)")}>
      <div className="relative border-b border-(--color-border-subtle)">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)" />
        <Input
          id="ap-resource"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search S3 buckets found by Discovery"
          aria-label="Search S3 buckets"
          className="border-0 pl-9 shadow-none focus-visible:ring-0"
          autoComplete="off"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {list.isLoading || list.isFetching ? (
          <p role="status" className="px-3 py-3 text-xs text-(--color-text-muted)">
            Looking for buckets…
          </p>
        ) : list.isError ? (
          <p className="px-3 py-3 text-xs text-(--color-danger-text)">
            Buckets could not be read.{" "}
            <button type="button" className="underline" onClick={() => void list.refetch()}>
              Retry
            </button>
          </p>
        ) : buckets.length === 0 ? (
          <p className="px-3 py-3 text-xs text-(--color-text-muted)">
            {dq ? `No bucket matches “${dq}”.` : "Discovery has not found an S3 bucket yet. Buckets appear once a scan reads the policies that name them."}
          </p>
        ) : (
          <ul>
            {buckets.map((b) => (
              <li key={b.bucket}>
                <button type="button" className={rowButton} onClick={() => onChange({ resource_id: b.resource_id, bucket: b.bucket, arn: b.arn, account_id: b.account_id, records: b.records, folders: b.folders })}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-(--color-text)">{b.bucket}</span>
                    <span className="block truncate text-xs text-(--color-text-muted)">
                      {b.folders?.length ? `Folders seen: ${b.folders.join(", ")}` : "Named as a whole bucket"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-(--color-text-muted)">{b.records?.length === 1 ? "1 path" : `${b.records?.length ?? 0} paths`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Who can reach a bucket: the access of its own record and of every path in it, read together. */
function useBucketAccess(ws: string, resource: DraftResource | null) {
  const dispatch = useAppDispatch();
  const ids = (resource?.records?.length ? resource.records : resource ? [{ id: resource.resource_id, text: resource.arn }] : []).slice(0, 15);
  const key = ids.map((r) => r.id).join(",");
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ isLoading: boolean; isError: boolean; rows: (AccessRow & { path: string })[]; truncated: boolean }>({
    isLoading: false,
    isError: false,
    rows: [],
    truncated: false,
  });
  useEffect(() => {
    if (!key) {
      setState({ isLoading: false, isError: false, rows: [], truncated: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, isLoading: true, isError: false }));
    const subs = ids.map((r) => dispatch(igaGraphApi.endpoints.getGraphResourceAccess.initiate({ ws, id: r.id, limit: 100 })));
    Promise.all(subs.map((s) => s.unwrap()))
      .then((res) => {
        if (!live) return;
        setState({
          isLoading: false,
          isError: false,
          rows: res.flatMap((r, i) => r.data.access.map((a) => ({ ...a, path: pathInBucket(ids[i].text) }))),
          truncated: res.some((r) => !!r.meta.next_cursor) || (resource?.records?.length ?? 0) > ids.length,
        });
      })
      .catch(() => {
        if (live) setState({ isLoading: false, isError: true, rows: [], truncated: false });
      });
    return () => {
      live = false;
      subs.forEach((s) => s.unsubscribe());
    };
    // `key` stands for the records read; `tick` re-reads them on Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, ws, key, tick]);
  return { ...state, refetch: () => setTick((t) => t + 1) };
}

/* ---------------------------------- roles --------------------------------- */

interface Candidate {
  identity_account_id: string;
  name: string;
  account: string;
  hasAccess: boolean;
  /** Where in the bucket it has access: "" for the whole bucket, else paths like `attachments/*`. */
  paths?: string[];
}

export function RolePicker({
  ws,
  resource,
  value,
  onChange,
  invalid,
}: {
  ws: string;
  resource: DraftResource | null;
  value: DraftRole[];
  onChange: (roles: DraftRole[]) => void;
  invalid?: boolean;
}) {
  const access = useBucketAccess(ws, resource);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const search = useListGraphIdentitiesQuery(
    { ws, q: dq, kind: "iam_role", account: resource?.account_id ? [resource.account_id] : undefined, limit: 10 },
    { skip: dq.length < 2 },
  );

  const reaching = useMemo<Candidate[]>(() => {
    const seen = new Map<string, Candidate>();
    for (const row of access.rows) {
      const h = row.holder;
      if (h.kind !== "iam_role") continue;
      const id = refId(h.ref);
      const c = seen.get(id) ?? { identity_account_id: id, name: h.name, account: h.account?.label ?? h.account?.id ?? "", hasAccess: true, paths: [] };
      if (!c.paths!.includes(row.path)) c.paths!.push(row.path);
      seen.set(id, c);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [access.rows]);
  const others = useMemo(() => access.rows.filter((r) => r.holder.kind !== "iam_role").length, [access.rows]);
  const truncated = access.truncated;

  const chosen = new Set(value.map((r) => r.identity_account_id));
  const toggle = (c: { identity_account_id: string; name: string }) =>
    onChange(chosen.has(c.identity_account_id) ? value.filter((r) => r.identity_account_id !== c.identity_account_id) : [...value, { identity_account_id: c.identity_account_id, name: c.name }]);

  const found = (search.data?.data ?? [])
    .map((r) => ({ identity_account_id: refId(r.ref), name: r.name, account: r.account?.label ?? r.account?.id ?? "", hasAccess: reaching.some((x) => x.identity_account_id === refId(r.ref)) }))
    .filter((c) => !reaching.some((x) => x.identity_account_id === c.identity_account_id));

  // Roles already ticked in the list need no chip; only ones added by search do.
  const extra = value.filter((r) => !reaching.some((c) => c.identity_account_id === r.identity_account_id));

  if (!resource) {
    return <p className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3 text-xs text-(--color-text-muted)">Choose a bucket first; the roles that can reach it are listed here.</p>;
  }

  return (
    <div className="space-y-2">
      {extra.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Other chosen roles">
          {extra.map((r) => (
            <span key={r.identity_account_id} className="inline-flex h-7 items-center gap-1 rounded-md border border-(--color-primary) bg-(--color-primary-soft) pl-2 pr-1 text-xs font-medium text-(--color-primary-text)">
              {r.name}
              <button type="button" aria-label={`Remove ${r.name}`} onClick={() => toggle(r)} className="grid size-5 place-items-center rounded hover:bg-(--color-surface-raised)">
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={cn("overflow-hidden rounded-md border", invalid ? "border-(--color-danger)" : "border-(--color-border-strong)")}>
        <div className="border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5 text-xs font-medium text-(--color-text-muted)">Roles that can reach {resource.bucket} now{value.length ? ` · ${value.length} selected` : ""}</div>
        <div className="max-h-56 overflow-y-auto">
          {access.isLoading ? (
            <p role="status" className="px-3 py-3 text-xs text-(--color-text-muted)">
              Reading who can reach this bucket…
            </p>
          ) : access.isError ? (
            <p className="px-3 py-3 text-xs text-(--color-danger-text)">
              Who can reach this bucket could not be read.{" "}
              <button type="button" className="underline" onClick={() => void access.refetch()}>
                Retry
              </button>
            </p>
          ) : reaching.length === 0 ? (
            <p className="px-3 py-3 text-xs text-(--color-text-muted)">No role can reach this bucket in the last scan. Search for a role below to allow it.</p>
          ) : (
            <ul>
              {reaching.map((c) => (
                <CandidateRow key={c.identity_account_id} c={c} on={chosen.has(c.identity_account_id)} onToggle={() => toggle(c)} />
              ))}
            </ul>
          )}
        </div>
        {others > 0 || truncated ? (
          <p className="border-t border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
            {others > 0 ? `${others} access ${others === 1 ? "path" : "paths"} through users or groups ${others === 1 ? "is" : "are"} not shown: only roles can be targets in this release. ` : ""}
            {truncated ? "Only the first 100 access paths were read; search for a role that is missing." : ""}
          </p>
        ) : null}
      </div>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Find another role${resource.account_id ? ` in ${resource.account_id}` : ""}`}
          aria-label="Find another role"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {dq.length >= 2 ? (
        <div className="overflow-hidden rounded-md border border-(--color-border-subtle)">
          {search.isFetching ? (
            <p role="status" className="px-3 py-2 text-xs text-(--color-text-muted)">
              Searching…
            </p>
          ) : search.isError ? (
            <p className="px-3 py-2 text-xs text-(--color-danger-text)">Roles could not be searched.</p>
          ) : found.length === 0 ? (
            <p className="px-3 py-2 text-xs text-(--color-text-muted)">No other role matches “{dq}”.</p>
          ) : (
            <ul>
              {found.map((c) => (
                <CandidateRow key={c.identity_account_id} c={c} on={chosen.has(c.identity_account_id)} onToggle={() => toggle(c)} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CandidateRow({ c, on, onToggle }: { c: Candidate; on: boolean; onToggle: () => void }) {
  return (
    <li>
      <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className={rowButton}>
        <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-(--color-primary) bg-(--color-primary) text-white" : "border-(--color-border-strong)")}>
          {on ? <Check aria-hidden="true" className="size-3" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-(--color-text)">{c.name}</span>
          {c.paths?.length ? (
            <span className="block truncate text-xs text-(--color-text-muted)">
              {c.paths.includes("") ? "Whole bucket" : `Only ${c.paths.join(", ")}`}
              {c.account ? ` · ${c.account}` : ""}
            </span>
          ) : c.account ? (
            <span className="block truncate text-xs text-(--color-text-muted)">{c.account}</span>
          ) : null}
        </span>
        <StatusBadge tone={c.hasAccess ? "success" : "neutral"}>{c.hasAccess ? "Has access" : "No access now"}</StatusBadge>
      </button>
    </li>
  );
}
