/**
 * The form's two pickers for an Azure policy. Both read Discovery, so what you
 * pick is what the last scan found: an Azure resource (an ARM resource in a
 * connected subscription, not a resource group or subscription), and the
 * identities to block or allow on it.
 *
 * Ids are the shared graph's (`/api/iga/v1/inventory`, the Azure graph): the
 * policy API resolves them to the resource's scope and each identity's Entra
 * object id. Only service principals, managed identities and agent identities
 * can be targets, from the resource's own tenant -- what the backend accepts.
 *
 * Who can reach a resource is its Azure role assignments as Discovery read them
 * (the graph's grant edges into it). Access through a broader scope or through
 * Entra groups is not in that list; the preview says when a block cannot
 * remove it.
 */

import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useGetAzureNeighbourhoodQuery } from "@/app/api/cloudDiscoveryApi";
import { refId } from "@/app/api/igaGraphApi";
import { useListInventoryQuery, type InventoryRow } from "@/app/api/igaInventoryApi";
import type { AccessEffect } from "@/app/api/igaAccessPoliciesApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { armTypeLabel, identityKindLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { cn } from "@/lib/utils";

import { azureTargetable as targetable, isArmResource, subscriptionOf, type DraftResource, type DraftRole } from "./model";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const rowButton = "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-(--color-surface-subtle)";

/* -------------------------------- resource -------------------------------- */

export function AzureResourcePicker({
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const list = useListInventoryQuery(
    { ws, class: "resources", provider: "azure", q: dq.length >= 2 ? dq : undefined, sort: "name", limit: 100 },
    { skip: !!value },
  );
  const rows = useMemo(() => (list.data?.data ?? []).filter((r) => isArmResource(r.native_id)), [list.data]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-(--color-text)">
            {value.bucket}
            {value.kind ? <span className="ml-2 text-xs font-normal text-(--color-text-muted)">{armTypeLabel(value.kind)}</span> : null}
          </div>
          <div className="truncate font-mono text-xs text-(--color-text-muted)" title={value.arn}>
            {value.arn}
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
          aria-label="Choose an Azure resource"
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border bg-(--color-surface-raised) px-3 text-left text-[13px] shadow-xs transition-colors hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
            invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
          <span className="flex-1 truncate text-(--color-text-muted)">Search for an Azure resource</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        {/* Discovery filters server-side, so cmdk does not filter again. */}
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search by name, e.g. a storage account" />
          <CommandList className="max-h-72">
            {list.isLoading || list.isFetching ? (
              <p role="status" className="px-3 py-6 text-center text-xs text-(--color-text-muted)">
                Looking for resources…
              </p>
            ) : list.isError ? (
              <p className="px-3 py-6 text-center text-xs text-(--color-danger-text)">
                Azure resources could not be read. Policies need AuthSec's graph (IGA_GRAPH_PROJECTION) to be on.{" "}
                <button type="button" className="font-medium underline" onClick={() => void list.refetch()}>
                  Retry
                </button>
              </p>
            ) : rows.length === 0 ? (
              <CommandEmpty>{dq ? `No Azure resource matches “${dq}”.` : "No Azure resource found yet. Resources show up after a scan of a connected subscription."}</CommandEmpty>
            ) : (
              <>
                {list.data?.meta?.next_cursor ? (
                  <p className="border-b border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">Showing the first 100. Type part of the name to find the rest.</p>
                ) : null}
                <div className="p-1">
                  {rows.map((r) => (
                    <CommandItem
                      key={r.ref}
                      value={r.ref}
                      onSelect={() => {
                        onChange({ resource_id: refId(r.ref), bucket: r.name, arn: r.native_id, account_id: subscriptionOf(r.native_id), kind: r.kind });
                        setOpen(false);
                      }}
                      className="gap-3 px-2.5 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-(--color-text)">{r.name}</span>
                        <span className="block truncate text-xs text-(--color-text-muted)">
                          {armTypeLabel(r.kind)}
                          {r.sub_scope ? ` · ${r.sub_scope}` : ""}
                        </span>
                      </span>
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

/* -------------------------------- identities ------------------------------- */

interface Candidate {
  identity_account_id: string;
  name: string;
  kind: string;
  /** The Azure roles it holds on the resource, as Discovery read them. */
  roles: string[];
  blocked?: string;
}

/** Who holds a role assignment on the resource: the graph's grant edges into it. */
function useResourceHolders(resource: DraftResource | null) {
  const q = useGetAzureNeighbourhoodQuery(`resource:${resource?.resource_id ?? ""}`, { skip: !resource?.resource_id });
  const holders = useMemo(() => {
    const d = q.data;
    if (!d) return [] as Candidate[];
    const root = d.root;
    const byRef = new Map(d.nodes.map((n) => [n.ref, n] as const));
    const seen = new Map<string, Candidate>();
    for (const e of d.edges) {
      if (e.kind !== "grant" || e.to !== root) continue;
      const n = byRef.get(e.from);
      if (!n || !n.ref.startsWith("identity:")) continue;
      const id = refId(n.ref as `identity:${string}`);
      const c = seen.get(id) ?? { identity_account_id: id, name: n.label, kind: n.kind, roles: [] };
      if (e.label && !c.roles.includes(e.label)) c.roles.push(e.label);
      seen.set(id, c);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);
  return { holders, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch, truncated: !!q.data?.truncated };
}

export function AzureIdentityPicker({
  ws,
  resource,
  effect,
  value,
  onChange,
  invalid,
}: {
  ws: string;
  resource: DraftResource | null;
  /** Block lists who holds a role on the resource now; Allow is mostly found by search. */
  effect: AccessEffect;
  value: DraftRole[];
  onChange: (roles: DraftRole[]) => void;
  invalid?: boolean;
}) {
  const access = useResourceHolders(resource);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const search = useListInventoryQuery({ ws, class: "identities", provider: "azure", q: dq, sort: "name", limit: 25 }, { skip: dq.length < 2 });
  const isAllow = effect === "allow";

  const eligible = access.holders.filter((c) => targetable(c.kind));
  const others = access.holders.length - eligible.length;
  const chosen = new Set(value.map((r) => r.identity_account_id));
  const toggle = (c: { identity_account_id: string; name: string }) =>
    onChange(chosen.has(c.identity_account_id) ? value.filter((r) => r.identity_account_id !== c.identity_account_id) : [...value, { identity_account_id: c.identity_account_id, name: c.name }]);

  const found = (search.data?.data ?? [])
    .map((r: InventoryRow): Candidate => {
      const id = refId(r.ref);
      const held = access.holders.find((x) => x.identity_account_id === id);
      const c: Candidate = { identity_account_id: id, name: r.name, kind: r.kind, roles: held?.roles ?? [] };
      if (!targetable(r.kind)) return { ...c, blocked: "Not a target" };
      return c;
    })
    .filter((c) => isAllow || !eligible.some((x) => x.identity_account_id === c.identity_account_id));

  const extra = value.filter((r) => !eligible.some((c) => c.identity_account_id === r.identity_account_id));
  // Chosen identities the rule would not change today: an Allow of one that already holds a role, a Block of one that holds none.
  const pointless = access.isLoading || access.isError ? [] : value.filter((r) => {
    const has = eligible.some((c) => c.identity_account_id === r.identity_account_id);
    return isAllow ? has : !has;
  });

  if (!resource) {
    return <p className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3 text-xs text-(--color-text-muted)">Choose a resource first. The identities with a role on it will be listed here.</p>;
  }

  return (
    <div className="space-y-2">
      {extra.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Other chosen identities">
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

      {!isAllow ? (
        <div className={cn("overflow-hidden rounded-md border", invalid ? "border-(--color-danger)" : "border-(--color-border-strong)")}>
          <div className="border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5 text-xs font-medium text-(--color-text-muted)">
            Identities with a role on {resource.bucket} now
            {value.length ? ` · ${value.length} selected` : ""}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {access.isLoading ? (
              <p role="status" className="px-3 py-3 text-xs text-(--color-text-muted)">
                Reading who has a role on this resource…
              </p>
            ) : access.isError ? (
              <p className="px-3 py-3 text-xs text-(--color-danger-text)">
                Who has a role on this resource could not be read.{" "}
                <button type="button" className="underline" onClick={() => void access.refetch()}>
                  Retry
                </button>
              </p>
            ) : eligible.length === 0 ? (
              <p className="px-3 py-3 text-xs text-(--color-text-muted)">No service principal, managed identity or agent identity has a role on this resource in the last scan. Search below to block one ahead of time.</p>
            ) : (
              <ul>
                {eligible.map((c) => (
                  <CandidateRow key={c.identity_account_id} c={c} on={chosen.has(c.identity_account_id)} onToggle={() => toggle(c)} />
                ))}
              </ul>
            )}
          </div>
          {others > 0 || access.truncated ? (
            <p className="border-t border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
              {others > 0 ? `${others} ${others === 1 ? "user or group has" : "users or groups have"} a role here and ${others === 1 ? "is" : "are"} not shown: only service principals, managed identities and agent identities can be targets. ` : ""}
              {access.truncated ? "Not every role holder was read; search for one that is missing." : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-(--color-text-muted)">Search for the service principal, managed identity or agent identity to allow on {resource.bucket}.</p>
      )}

      {pointless.length ? (
        <p role="status" className="rounded-md border border-(--color-border-strong) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-warning-text)">
          {isAllow
            ? `${pointless.map((r) => r.name).join(", ")} already ${pointless.length === 1 ? "holds" : "hold"} a role on ${resource.bucket}; check it is not the access you mean to allow.`
            : `${pointless.map((r) => r.name).join(", ")} ${pointless.length === 1 ? "holds" : "hold"} no role on ${resource.bucket} in the last scan; blocking ${pointless.length === 1 ? "it" : "them"} changes nothing today and only removes access added later.`}
        </p>
      ) : null}

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isAllow ? "Find an identity by name or object ID" : "Find another identity"}
          aria-label="Find an identity"
          className={cn("pl-9", isAllow && invalid && "border-(--color-danger)")}
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
            <p className="px-3 py-2 text-xs text-(--color-danger-text)">Identities could not be searched.</p>
          ) : found.length === 0 ? (
            <p className="px-3 py-2 text-xs text-(--color-text-muted)">No other identity matches “{dq}”.</p>
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
  const off = !!c.blocked && !on;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-disabled={off || undefined}
        disabled={off}
        title={c.blocked ? "Only service principals, managed identities and agent identities can be targets." : undefined}
        onClick={onToggle}
        className={cn(rowButton, off && "cursor-not-allowed opacity-60 hover:bg-transparent")}
      >
        <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-(--color-primary) bg-(--color-primary) text-white" : "border-(--color-border-strong)")}>
          {on ? <Check aria-hidden="true" className="size-3" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-(--color-text)">{c.name}</span>
          <span className="block truncate text-xs text-(--color-text-muted)">
            {identityKindLabel(c.kind)}
            {c.roles.length ? ` · ${c.roles.join(", ")}` : ""}
          </span>
        </span>
        <StatusBadge tone={c.roles.length ? "success" : "neutral"}>{c.blocked ?? (c.roles.length ? "Has a role" : "No role here")}</StatusBadge>
      </button>
    </li>
  );
}
