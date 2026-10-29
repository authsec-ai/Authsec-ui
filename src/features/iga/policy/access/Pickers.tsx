/**
 * The form's two AWS pickers (the Azure ones are in AzurePickers.tsx). Both
 * read Discovery, so what you pick is what the last scan found: an S3 bucket,
 * and the IAM roles to block or allow on it.
 *
 * Discovery records what policies name: a bucket, a file, or a folder pattern
 * (`bucket/folder/*`). Most buckets appear only through such paths, so the
 * bucket list groups every S3 record by bucket, and the roles that can reach a
 * bucket are those that reach the bucket itself or any path in it. Any other
 * role can be searched for, which is what Allow needs. Users and groups are not
 * targets in this release.
 */

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAppDispatch } from "@/app/hooks";
import {
  igaGraphApi,
  refId,
  useListGraphIdentitiesQuery,
  useListGraphResourcesQuery,
  useListGraphWorkloadsQuery,
  type AccessRow,
  type ResourceRow,
} from "@/app/api/igaGraphApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { AccessEffect } from "@/app/api/igaAccessPoliciesApi";

import { bucketOf, groupModels, groupParameters, groupSimple, groupSecrets, groupTables, pathInBucket, reachesFolder, type DraftResource, type DraftRole } from "./model";
import { RESOURCE_TYPES, type AwsResourceType } from "./resourceTypes";
import { useDebounced } from "./useDebounced";

/** Every bucket the S3 records name, with its records (bucket record first) and the folders seen in it. */
function groupBuckets(rows: ResourceRow[]): (DraftResource & { hasBucketRecord: boolean })[] {
  const by = new Map<string, DraftResource & { hasBucketRecord: boolean }>();
  for (const r of rows) {
    const b = bucketOf(r.text);
    if (!b) continue;
    let e = by.get(b.bucket);
    if (!e) {
      e = { provider: "aws", resource_id: "", resource_type: "s3_bucket", name: b.bucket, bucket: b.bucket, arn: `arn:aws:s3:::${b.bucket}`, account_id: r.account?.id ?? "", records: [], folders: [], hasBucketRecord: false };
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

const SERVICE: Record<AwsResourceType, string> = { s3_bucket: "s3", dynamodb_table: "dynamodb", secretsmanager_secret: "secretsmanager",
  ssm_parameter: "ssm",
  bedrock_model: "bedrock",
  bedrock_agent: "bedrock",
  agentcore_runtime: "bedrock-agentcore",
  lambda_function: "lambda",
  kms_key: "kms",
  sqs_queue: "sqs",
  sns_topic: "sns",
};

export const rowButton =
  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-(--color-surface-subtle) focus-visible:bg-(--color-surface-subtle) focus-visible:outline-none";

/* --------------------------------- bucket --------------------------------- */

export function ResourcePicker({
  ws,
  type = "s3_bucket",
  value,
  onChange,
  invalid,
}: {
  ws: string;
  /** What is picked: an S3 bucket or a DynamoDB table. */
  type?: AwsResourceType;
  value: DraftResource | null;
  onChange: (r: DraftResource | null) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const copy = RESOURCE_TYPES[type];
  const workloadKind = "workloads" in copy ? copy.workloads : undefined;
  const records = useListGraphResourcesQuery({ ws, q: dq || undefined, service: SERVICE[type], limit: 200 }, { skip: !!value || !!workloadKind });
  // Agents and agent runtimes come from Discovery's workloads: IAM policies seldom name one.
  const workloads = useListGraphWorkloadsQuery({ ws, q: dq || undefined, runtime_kind: workloadKind, limit: 200 }, { skip: !!value || !workloadKind });
  const list = workloadKind ? workloads : records;
  const buckets = useMemo(() => (type === "s3_bucket" ? groupBuckets(records.data?.data ?? []) : []), [records.data, type]);
  // Any other type: one row per resource, its records grouped under it.
  const tables = useMemo((): DraftResource[] => {
    if (workloadKind) {
      return (workloads.data?.data ?? []).map((w) => ({
        provider: "aws",
        resource_id: refId(w.ref),
        resource_type: type,
        name: w.name,
        bucket: "",
        arn: w.arn,
        account_id: w.account?.id ?? "",
        region: w.region ?? undefined,
      }));
    }
    const rows = records.data?.data ?? [];
    if (type === "dynamodb_table") return groupTables(rows);
    if (type === "secretsmanager_secret") return groupSecrets(rows);
    if (type === "ssm_parameter") return groupParameters(rows);
    if (type === "bedrock_model") return groupModels(rows);
    return groupSimple(type, rows);
  }, [records.data, workloads.data, workloadKind, type]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-(--color-text)">{value.bucket || value.name}</div>
          <div className="truncate font-mono text-xs text-(--color-text-muted)">
            {value.arn}
            {value.account_id && !value.arn.includes(value.account_id) ? ` · ${value.account_id}` : ""}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="ap-resource"
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={copy.label}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border bg-(--color-surface-raised) px-3 text-left text-[13px] shadow-xs transition-colors hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
            invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
          <span className="flex-1 truncate text-(--color-text-muted)">{copy.search}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        {/* Discovery filters server-side, so cmdk does not filter again. */}
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={copy.search} />
          <CommandList className="max-h-72">
            {list.isLoading || list.isFetching ? (
              <p role="status" className="px-3 py-6 text-center text-xs text-(--color-text-muted)">
                {copy.loading}
              </p>
            ) : list.isError ? (
              <p className="px-3 py-6 text-center text-xs text-(--color-danger-text)">
                {copy.error}{" "}
                <button type="button" className="font-medium underline" onClick={() => void list.refetch()}>
                  Retry
                </button>
              </p>
            ) : buckets.length + tables.length === 0 ? (
              <CommandEmpty>
                {dq ? `No ${copy.noun} matches “${dq}”.` : copy.empty}
              </CommandEmpty>
            ) : (
              <>
                {list.data?.meta?.next_cursor ? (
                  <p className="border-b border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
                    Showing the first 200 records. Type part of the name to find the rest.
                  </p>
                ) : null}
                <div className="p-1">
                  {tables.map((t) => (
                    <CommandItem
                      key={t.records?.[0]?.id ?? t.arn}
                      value={t.arn}
                      onSelect={() => {
                        onChange(t);
                        setOpen(false);
                      }}
                      className="gap-3 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-(--color-text)">{t.name}</span>
                        <span className="block truncate text-xs text-(--color-text-muted)">
                          {[t.region ?? "every region", t.account_id].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                  {buckets.map((b) => (
                    <CommandItem
                      key={b.bucket}
                      value={b.bucket}
                      onSelect={() => {
                        onChange({ provider: "aws", resource_id: b.resource_id, resource_type: "s3_bucket", name: b.bucket, bucket: b.bucket, arn: b.arn, account_id: b.account_id, records: b.records, folders: b.folders });
                        setOpen(false);
                      }}
                      className="gap-3 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-(--color-text)">{b.bucket}</span>
                        <span className="block truncate text-xs text-(--color-text-muted)">
                          {b.folders?.length ? `Folders seen: ${b.folders.join(", ")}` : "Named as a whole bucket"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-(--color-text-muted)">{b.records?.length === 1 ? "1 path" : `${b.records?.length ?? 0} paths`}</span>
                    </CommandItem>
                  ))}
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

export interface Candidate {
  identity_account_id: string;
  name: string;
  /** The line under the name when no paths are given: the account, or an Azure identity's kind and roles. */
  account: string;
  hasAccess: boolean;
  /** Where in the bucket it has access: "" for the whole bucket, else paths like `attachments/*`. */
  paths?: string[];
  /** Why it cannot be chosen (an Allow of access it already has, a kind no policy can name), else unset. */
  blocked?: string;
  /** The badge's words when they are not "Has access" / "No access now". */
  badge?: string;
}

export function RolePicker({
  ws,
  resource,
  effect,
  folder,
  value,
  onChange,
  invalid,
}: {
  ws: string;
  resource: DraftResource | null;
  /** Block lists the roles that reach the folder now; Allow lists the ones that do not. */
  effect: AccessEffect;
  /** The folder the rule is for (`sandbox/`), "" for the whole bucket. */
  folder: string;
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
  const isAllow = effect === "allow";
  const target = resource ? `${resource.bucket}${folder.trim() ? `/${folder.trim()}` : ""}` : "";

  // A role reaches the target when any path it holds in the bucket overlaps the folder.
  const reaches = (c: Candidate) => reachesFolder(c.paths ?? [], folder);
  // Block: roles that reach the folder (blocking anyone else changes nothing today).
  // Allow: roles that hold access elsewhere in the bucket but not here.
  const listed = useMemo(() => reaching.filter((c) => (isAllow ? !reachesFolder(c.paths ?? [], folder) : reachesFolder(c.paths ?? [], folder))), [reaching, isAllow, folder]);
  const hidden = reaching.length - listed.length;

  const chosen = new Set(value.map((r) => r.identity_account_id));
  const toggle = (c: { identity_account_id: string; name: string }) =>
    onChange(chosen.has(c.identity_account_id) ? value.filter((r) => r.identity_account_id !== c.identity_account_id) : [...value, { identity_account_id: c.identity_account_id, name: c.name }]);

  const found = (search.data?.data ?? [])
    .map((r): Candidate => {
      const id = refId(r.ref);
      const held = reaching.find((x) => x.identity_account_id === id);
      const c: Candidate = { identity_account_id: id, name: r.name, account: r.account?.label ?? r.account?.id ?? "", hasAccess: !!held && reaches(held), paths: held?.paths };
      return isAllow && c.hasAccess ? { ...c, blocked: "Already has access here" } : c;
    })
    .filter((c) => !listed.some((x) => x.identity_account_id === c.identity_account_id));

  // Roles already ticked in the list need no chip; only ones added by search (or no longer listed) do.
  const extra = value.filter((r) => !listed.some((c) => c.identity_account_id === r.identity_account_id));

  // Chosen roles the rule would not change: an Allow of what a role has, a Block of what it lacks.
  const pointless = access.isLoading || access.isError ? [] : value.filter((r) => {
    const held = reaching.find((c) => c.identity_account_id === r.identity_account_id);
    const has = !!held && reaches(held);
    return isAllow ? has : !has;
  });

  if (!resource) {
    return <p className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3 text-xs text-(--color-text-muted)">Choose a bucket first. The roles that can reach it will be listed here.</p>;
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
        <div className="border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5 text-xs font-medium text-(--color-text-muted)">
          {isAllow ? `Roles with no access to ${target} yet` : `Roles that can reach ${target} now`}
          {value.length ? ` · ${value.length} selected` : ""}
        </div>
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
          ) : listed.length === 0 ? (
            <p className="px-3 py-3 text-xs text-(--color-text-muted)">
              {isAllow
                ? reaching.length === 0
                  ? "No role can reach this bucket in the last scan. Search for a role below to allow it."
                  : `Every role that reaches this bucket already has access to ${target}. Search for another role below.`
                : reaching.length === 0
                  ? "No role can reach this bucket in the last scan. Search for a role below to block it ahead of time."
                  : `No role reaches ${target} in the last scan. Search for a role below to block it ahead of time.`}
            </p>
          ) : (
            <ul>
              {listed.map((c) => (
                <CandidateRow key={c.identity_account_id} c={c} on={chosen.has(c.identity_account_id)} onToggle={() => toggle(c)} />
              ))}
            </ul>
          )}
        </div>
        {others > 0 || truncated || hidden > 0 ? (
          <p className="border-t border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
            {hidden > 0
              ? isAllow
                ? `${hidden} ${hidden === 1 ? "role already has" : "roles already have"} access to ${target} and ${hidden === 1 ? "is" : "are"} not listed. `
                : `${hidden} ${hidden === 1 ? "role reaches" : "roles reach"} only other parts of this bucket and ${hidden === 1 ? "is" : "are"} not listed. `
              : ""}
            {others > 0 ? `${others} access ${others === 1 ? "path" : "paths"} through users or groups ${others === 1 ? "is" : "are"} not shown: only roles can be targets in this release. ` : ""}
            {truncated ? "Only the first 100 access paths were read; search for a role that is missing." : ""}
          </p>
        ) : null}
      </div>

      {pointless.length ? (
        <p role="status" className="rounded-md border border-(--color-border-strong) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-warning-text)">
          {isAllow
            ? `${pointless.map((r) => r.name).join(", ")} already ${pointless.length === 1 ? "has" : "have"} access to ${target}; allowing it changes nothing. Remove ${pointless.length === 1 ? "it" : "them"} or pick a role without access.`
            : `${pointless.map((r) => r.name).join(", ")} ${pointless.length === 1 ? "has" : "have"} no access to ${target} in the last scan; blocking ${pointless.length === 1 ? "it" : "them"} changes nothing today and only guards against access added later.`}
        </p>
      ) : null}

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

export function CandidateRow({ c, on, onToggle }: { c: Candidate; on: boolean; onToggle: () => void }) {
  // A role that cannot be added stays visible so the reason is too; one already chosen can still be removed.
  const off = !!c.blocked && !on;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-disabled={off || undefined}
        disabled={off}
        title={c.blocked}
        onClick={onToggle}
        className={cn(rowButton, off && "cursor-not-allowed opacity-60 hover:bg-transparent")}
      >
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
        <StatusBadge tone={c.hasAccess ? "success" : "neutral"}>{c.blocked ?? c.badge ?? (c.hasAccess ? "Has access" : "No access now")}</StatusBadge>
      </button>
    </li>
  );
}
