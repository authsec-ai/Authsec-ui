/**
 * Policy › Policies: every access policy in the workspace, AWS and Azure. A
 * policy blocks or allows identities on one resource for a time window
 * (SPEC-access-policies.md §2.2).
 *
 * `?resource_id=` and `?identity_account_id=` (from Discovery) narrow the list
 * to one resource or one identity; `?cloud=` to one cloud. A row opens the
 * policy's page.
 */

import { Pause, Pencil, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  useListAccessPoliciesQuery,
  type AccessEffect,
  type AccessPolicy,
  type AccessPolicyStatus,
  type AccessProvider,
} from "@/app/api/igaAccessPoliciesApi";
import { AppliedFilters, ConsoleFilterBar, ConsoleRowActions } from "@/components/console/iam-console";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { ProviderGlyph } from "../../shared/components/ProviderGlyph";
import { PolicyLoadFailure, PolicyShell, classifyPolicyError, usePolicyPermission } from "../shared";
import { DeletePolicyDialog } from "./DeletePolicyDialog";
import { LifecycleDialog, type LifecycleAction } from "./LifecycleDialog";
import { CLOUD, STATUS, STATUS_ORDER, accessText, resourceText, whenText, windowText } from "./model";
import { EffectChip, PolicyStatusChip, ReadinessBanner } from "./parts";

const PAGE = 200;

export default function PoliciesListPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "") as "" | AccessPolicyStatus;
  const effect = (params.get("effect") ?? "") as "" | AccessEffect;
  const cloudParam = params.get("cloud");
  const cloud: "" | AccessProvider = cloudParam === "aws" || cloudParam === "azure" || cloudParam === "k8s" ? cloudParam : "";
  const resourceId = params.get("resource_id") ?? "";
  const resourceName = params.get("resource_name") ?? "";
  const identityId = params.get("identity_account_id") ?? "";
  const identityName = params.get("identity_name") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);
  const enforce = usePolicyPermission("governance:enforce");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // The search box is the server's `q`, sent once typing pauses.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => setParam("q", search.trim() || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // The status chips count the unfiltered list; status and cloud then filter
  // on the server, so a filter finds policies past the first page too.
  const base = { ws, q: q || undefined, effect: effect || undefined, resource_id: resourceId || undefined, identity_account_id: identityId || undefined, limit: PAGE };
  // Windows start and end with the clock, so the list is read again now and then.
  const poll = { pollingInterval: 30_000, skipPollingIfUnfocused: true };
  const list = useListAccessPoliciesQuery(base, poll);
  const narrowed = !!status || !!cloud;
  const filteredList = useListAccessPoliciesQuery({ ...base, status: status || undefined, provider: cloud || undefined }, { ...poll, skip: !narrowed });
  const shown = narrowed ? filteredList : list;
  const failure = classifyPolicyError(list.error ?? (narrowed ? filteredList.error : undefined));
  const all = useMemo(() => list.data?.data ?? [], [list.data]);
  const more = !!shown.data?.meta.next_cursor;
  // The server read only the newest policies (meta.truncated): searching narrows it.
  const truncated = shown.data?.meta.truncated === true;
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<AccessPolicyStatus, number>;
    for (const p of all) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [all]);
  const rows = useMemo(() => (narrowed ? filteredList.data?.data ?? [] : all), [narrowed, filteredList.data, all]);
  // The cloud filter is offered once policies of both clouds exist.
  const clouds = useMemo(() => new Set(all.map((p) => p.resource.provider)), [all]);

  const [lifecycle, setLifecycle] = useState<{ policy: AccessPolicy; action: LifecycleAction } | null>(null);
  const [deleting, setDeleting] = useState<AccessPolicy | null>(null);

  const columns = useMemo<AdaptiveColumn<AccessPolicy>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        label: "Policy",
        primary: true,
        alwaysVisible: true,
        minWidth: 260,
        approxWidth: 320,
        cellClassName: "py-3.5",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            {/* Policies of every cloud share this list; the mark says which one this is. */}
            <ProviderGlyph provider={row.original.resource.provider} className="shrink-0" />
            <div className="min-w-0">
              <Link
                to={`/iga/policy/${row.original.id}`}
                onClick={(e) => e.stopPropagation()}
                title={row.original.name}
                className="block max-w-full truncate text-[13px] font-medium text-(--color-text) hover:text-(--color-primary-text) hover:underline"
              >
                {row.original.name}
              </Link>
              {row.original.reason ? <div className="truncate text-xs text-(--color-text-secondary)" title={row.original.reason}>{row.original.reason}</div> : null}
            </div>
          </div>
        ),
      },
      {
        id: "effect",
        header: "Effect",
        label: "Effect",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => <EffectChip effect={row.original.effect} />,
        detail: (p) => (p.effect === "block" ? "Block" : "Allow"),
      },
      {
        id: "roles",
        header: "Who",
        label: "Who",
        priority: 2,
        approxWidth: 230,
        cell: ({ row }) => {
          const r = row.original.roles;
          const used = [...new Set(r.flatMap((x) => x.used_by.map((w) => w.name)))];
          return (
            <div className="min-w-0">
              <div className="truncate text-[13px]" title={r.map((x) => x.name).join(", ")}>{r.length === 1 ? r[0].name : `${r[0]?.name ?? ""} and ${r.length - 1} more`}</div>
              {used.length ? <div className="truncate text-xs text-(--color-text-secondary)" title={`Used by ${used.join(", ")}`}>Used by {used.slice(0, 2).join(", ")}{used.length > 2 ? ` +${used.length - 2}` : ""}</div> : null}
            </div>
          );
        },
        detail: (p) => p.roles.map((r) => r.name).join(", "),
      },
      {
        id: "resource",
        header: "Resource",
        label: "Resource",
        priority: 3,
        approxWidth: 280,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13px]" title={row.original.resource.arn}>
              {resourceText(row.original.resource)}
            </span>
            {/* Access is said under the resource it applies to, so the row has one column fewer to fit. */}
            <span className="block truncate text-xs text-(--color-text-secondary)">{accessText(row.original.access)} access</span>
          </div>
        ),
        detail: (p) => resourceText(p.resource),
      },
      {
        id: "access",
        header: "Access",
        label: "Access",
        defaultHidden: true,
        priority: 5,
        approxWidth: 110,
        cell: ({ row }) => <span className="text-[13px]">{accessText(row.original.access)}</span>,
        detail: (p) => accessText(p.access),
      },
      {
        id: "window",
        header: "Window",
        label: "Window",
        priority: 4,
        approxWidth: 200,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="text-[13px]">{windowText(row.original)}</div>
            <div className="truncate text-xs text-(--color-text-secondary)">{whenText(row.original)}</div>
          </div>
        ),
        detail: (p) => `${windowText(p)} · ${whenText(p)}`,
      },
      {
        id: "status",
        header: "Status",
        label: "Status",
        priority: 1,
        approxWidth: 150,
        cell: ({ row }) => <PolicyStatusChip status={row.original.status} />,
        detail: (p) => STATUS[p.status]?.label ?? p.status,
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
          if (!enforce.offered) return null;
          // An ending policy has nothing left to do until AuthSec is done; an ended one only Delete.
          if (p.status === "ending") return null;
          const items = p.status === "ended" ? [
            { label: "Delete", icon: <Trash2 className="size-4" />, destructive: true, onSelect: () => setDeleting(p) },
          ] : [
            { label: "Edit", icon: <Pencil className="size-4" />, onSelect: () => navigate(`/iga/policy/${p.id}/edit`) },
            p.status === "paused"
              ? { label: "Resume", icon: <Play className="size-4" />, onSelect: () => setLifecycle({ policy: p, action: "resume" }) }
              : { label: "Pause", icon: <Pause className="size-4" />, onSelect: () => setLifecycle({ policy: p, action: "pause" }) },
            { label: "End now", icon: <Square className="size-4" />, destructive: true, onSelect: () => setLifecycle({ policy: p, action: "end" }) },
          ];
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions label={`Actions for ${p.name}`} items={items} />
            </div>
          );
        },
      },
    ],
    [enforce.offered, navigate],
  );

  const filtered = !!(q || effect || status || cloud || resourceId || identityId);
  const emptyState = !filtered ? (
    <div className="mx-auto max-w-md space-y-3 py-6 text-center">
      <p className="text-sm font-semibold text-(--color-text)">No policies yet</p>
      <p className="text-[13px] text-(--color-text-muted)">
        A policy blocks or allows an agent&rsquo;s access to a resource, such as an S3 bucket, a DynamoDB table or an Azure storage account, for as long as you say. Create one here, or open an agent or resource in Discovery and start one from its page.
      </p>
      {enforce.offered ? (
        <Button asChild className="text-white">
          <Link to="/iga/policy/new">
            <Plus aria-hidden="true" className="size-4" />
            Create policy
          </Link>
        </Button>
      ) : null}
    </div>
  ) : (
    <div className="space-y-2 py-4 text-center text-sm text-(--color-text-muted)">
      <p>No policies match these filters.</p>
      <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
        Clear filters
      </Button>
    </div>
  );

  // A workspace with no policy at all: the filters and the empty table would only be noise, so show the invitation alone.
  const firstRun = !filtered && !failure && !!list.data && all.length === 0;
  // Nothing loaded at all: one clear message below, not a stack of three.
  const loadFailed = !!failure && !list.data;

  const applied = [
    resourceId ? { key: "resource", label: `Resource ${resourceName || resourceId}`, onRemove: () => setParams(dropKeys(params, ["resource_id", "resource_name"]), { replace: true }) } : null,
    identityId ? { key: "identity", label: `Identity ${identityName || identityId}`, onRemove: () => setParams(dropKeys(params, ["identity_account_id", "identity_name"]), { replace: true }) } : null,
    cloud ? { key: "cloud", label: `${CLOUD[cloud].label} only`, onRemove: () => setParam("cloud", null) } : null,
    effect ? { key: "effect", label: effect === "block" ? "Block only" : "Allow only", onRemove: () => setParam("effect", null) } : null,
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  const newHref = `/iga/policy/new${resourceId || identityId ? `?${new URLSearchParams(Object.fromEntries(Object.entries({ resource_id: resourceId, identity_account_id: identityId }).filter(([, v]) => v)))}` : ""}`;

  return (
    <PolicyShell
      title="Policy"
      description="Control what your AI agents can access and when. Allow or block access for a set period. AuthSec enforces each policy and removes temporary access automatically when it ends."
      requires="access_policies"
      actions={
        enforce.offered ? (
          <Button asChild className="text-white">
            <Link to={newHref}>
              <Plus aria-hidden="true" className="size-4" />
              Create policy
            </Link>
          </Button>
        ) : undefined
      }
    >
      {loadFailed ? null : <ReadinessBanner ws={ws} />}

      {firstRun || loadFailed ? null : (
      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by policy name or reason"
        filters={[{ key: "", label: "All", count: all.length }, ...STATUS_ORDER.filter((s) => counts[s] > 0 || s === status).map((s) => ({ key: s, label: STATUS[s].label, count: counts[s] }))]}
        activeFilter={status}
        onFilterChange={(k) => setParam("status", k || null)}
        trailing={
          <div className="flex flex-wrap items-center gap-3">
          {clouds.size > 1 || cloud ? (
            <div role="radiogroup" aria-label="Cloud" className="flex items-center gap-1.5">
              {(clouds.has("k8s") || cloud === "k8s" ? (["", "aws", "azure", "k8s"] as const) : (["", "aws", "azure"] as const)).map((c) => (
                <button
                  key={c || "any"}
                  type="button"
                  role="radio"
                  aria-checked={cloud === c}
                  onClick={() => setParam("cloud", c || null)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                    cloud === c
                      ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                      : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-secondary) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
                  }`}
                >
                  {c ? <span aria-hidden="true"><ProviderGlyph provider={c} /></span> : null}
                  {c === "" ? "Any cloud" : CLOUD[c].label}
                </button>
              ))}
            </div>
          ) : null}
          <div role="radiogroup" aria-label="Effect" className="flex items-center gap-1.5">
            {(["", "block", "allow"] as const).map((e) => (
              <button
                key={e || "any"}
                type="button"
                role="radio"
                aria-checked={effect === e}
                onClick={() => setParam("effect", e || null)}
                className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                  effect === e
                    ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                    : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-secondary) hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
                }`}
              >
                {e === "" ? "Any effect" : e === "block" ? "Block" : "Allow"}
              </button>
            ))}
          </div>
          </div>
        }
        below={applied.length ? <AppliedFilters filters={applied} onClearAll={() => setParams({}, { replace: true })} /> : undefined}
      />
      )}

      {failure && !list.data ? (
        <PolicyLoadFailure failure={failure} subject="policies" onRetry={() => void list.refetch()} />
      ) : firstRun ? (
        <TableCard>
          <CardContent variant="flush">{emptyState}</CardContent>
        </TableCard>
      ) : (
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="iga-access-policies"
              sizing="fit"
              rowDetails={false}
              cardsBelow={640}
              loading={list.isLoading || (narrowed && filteredList.isLoading)}
              emptyState={emptyState}
              columns={columns}
              data={rows}
              getRowId={(p) => p.id}
              onRowClick={(p) => navigate(`/iga/policy/${p.id}`)}
              enableSelection={false}
              enableExpansion={false}
              enableSorting={false}
              enablePagination={false}
            />
          </CardContent>
        </TableCard>
      )}
      {more || truncated ? (
        <p className="text-xs text-(--color-text-muted)">
          {truncated ? "This workspace has more policies than the list reads at once." : `Showing the first ${PAGE}.`} Search or filter to find the rest.
        </p>
      ) : null}

      <DeletePolicyDialog policy={deleting} onClose={() => setDeleting(null)} />
      <LifecycleDialog policy={lifecycle?.policy ?? null} action={lifecycle?.action ?? null} onClose={() => setLifecycle(null)} />
    </PolicyShell>
  );
}

function dropKeys(params: URLSearchParams, keys: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const k of keys) next.delete(k);
  return next;
}
