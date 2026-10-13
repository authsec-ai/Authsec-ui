/**
 * The form's two pickers. Both read Discovery, so what you pick is what the
 * last scan found: an S3 bucket, and the IAM roles to block or allow on it.
 *
 * Roles that can already reach the bucket come first (the resource's Access
 * read). Any other role in the bucket's account can be searched for, which is
 * what Allow needs. Users and groups are not targets in this release.
 */

import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  refId,
  useGetGraphResourceAccessQuery,
  useListGraphIdentitiesQuery,
  useListGraphResourcesQuery,
  type ResourceRow,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { bucketOf, type DraftResource, type DraftRole } from "./model";

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
  const list = useListGraphResourcesQuery({ ws, q: dq || undefined, service: "s3", limit: 25 }, { skip: !!value });
  const buckets = useMemo(() => (list.data?.data ?? []).filter((r: ResourceRow) => r.type === "s3_bucket"), [list.data]);

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
            {buckets.map((r) => {
              const b = bucketOf(r.text);
              return (
                <li key={r.ref}>
                  <button
                    type="button"
                    className={rowButton}
                    onClick={() => onChange({ resource_id: refId(r.ref), bucket: b?.bucket ?? r.text, arn: r.text, account_id: r.account?.id ?? "" })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-(--color-text)">{b?.bucket ?? r.text}</span>
                      <span className="block truncate text-xs text-(--color-text-muted)">{r.account?.label ?? r.account?.id ?? "Account not known"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- roles --------------------------------- */

interface Candidate {
  identity_account_id: string;
  name: string;
  account: string;
  hasAccess: boolean;
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
  const access = useGetGraphResourceAccessQuery({ ws, id: resource?.resource_id ?? "", limit: 100 }, { skip: !resource });
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const search = useListGraphIdentitiesQuery(
    { ws, q: dq, kind: "iam_role", account: resource?.account_id ? [resource.account_id] : undefined, limit: 10 },
    { skip: dq.length < 2 },
  );

  const reaching = useMemo<Candidate[]>(() => {
    const seen = new Map<string, Candidate>();
    for (const row of access.data?.data.access ?? []) {
      const h = row.holder;
      if (h.kind !== "iam_role") continue;
      const id = refId(h.ref);
      if (!seen.has(id)) seen.set(id, { identity_account_id: id, name: h.name, account: h.account?.label ?? h.account?.id ?? "", hasAccess: true });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [access.data]);
  const others = useMemo(() => (access.data?.data.access ?? []).filter((r) => r.holder.kind !== "iam_role").length, [access.data]);
  const truncated = !!access.data?.meta.next_cursor;

  const chosen = new Set(value.map((r) => r.identity_account_id));
  const toggle = (c: { identity_account_id: string; name: string }) =>
    onChange(chosen.has(c.identity_account_id) ? value.filter((r) => r.identity_account_id !== c.identity_account_id) : [...value, { identity_account_id: c.identity_account_id, name: c.name }]);

  const found = (search.data?.data ?? [])
    .map((r) => ({ identity_account_id: refId(r.ref), name: r.name, account: r.account?.label ?? r.account?.id ?? "", hasAccess: reaching.some((x) => x.identity_account_id === refId(r.ref)) }))
    .filter((c) => !reaching.some((x) => x.identity_account_id === c.identity_account_id));

  if (!resource) {
    return <p className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3 text-xs text-(--color-text-muted)">Choose a bucket first; the roles that can reach it are listed here.</p>;
  }

  return (
    <div className="space-y-2">
      {value.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Chosen roles">
          {value.map((r) => (
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
        <div className="border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5 text-xs font-medium text-(--color-text-muted)">Roles that can reach {resource.bucket} now</div>
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
          {c.account ? <span className="block truncate text-xs text-(--color-text-muted)">{c.account}</span> : null}
        </span>
        <StatusBadge tone={c.hasAccess ? "success" : "neutral"}>{c.hasAccess ? "Has access" : "No access now"}</StatusBadge>
      </button>
    </li>
  );
}
