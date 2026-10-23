/**
 * The form's two Azure pickers, the counterparts of Pickers.tsx's bucket and
 * role pickers (SPEC-access-policies.md §2.1).
 *
 * The resource is one Azure Resource Manager resource the last scan found, from
 * the unified inventory. Who holds access to it is the shared graph walked back
 * from it (D-114): each role assignment on the resource and the identity that
 * holds it. Access from a broader scope (resource group, subscription) reaches
 * the resource without naming it and is not listed; the preview reads it live.
 * Any other service principal, managed identity or agent identity can be
 * searched for. Users and groups cannot be named in a policy.
 */

import { ChevronsUpDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { refId, useGetGraphNeighbourhoodQuery, type GraphRef } from "@/app/api/igaGraphApi";
import { useListInventoryQuery, type InventoryRow } from "@/app/api/igaInventoryApi";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { identityKindLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { cn } from "@/lib/utils";

import type { AccessEffect } from "@/app/api/igaAccessPoliciesApi";

import { AZURE_TARGET_KINDS, azureResourceOf, holdersOf, type DraftResource, type DraftRole } from "./model";
import { CandidateRow, type Candidate } from "./Pickers";
import { useDebounced } from "./useDebounced";

/** A resource a policy can be on: an ARM resource, not an application permission, a resource group or a subscription. */
function isArmResource(row: InventoryRow): boolean {
  const id = row.native_id.toLowerCase();
  return id.startsWith("/subscriptions/") && id.includes("/providers/");
}

/** "Storage account · Authnull · rg-agent-authsec-iga-test". */
function whereText(r: Pick<DraftResource, "kind" | "subscription" | "resource_group">): string {
  return [r.kind, r.subscription, r.resource_group].filter(Boolean).join(" · ");
}

/* -------------------------------- resource --------------------------------- */

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
  const list = useListInventoryQuery({ ws, class: "resources", provider: "azure", q: dq || undefined, limit: 100 }, { skip: !!value });
  const rows = useMemo(() => (list.data?.data ?? []).filter(isArmResource), [list.data]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-(--color-text)">{value.name}</div>
          <div className="truncate text-xs text-(--color-text-muted)">{whereText(value) || value.arn}</div>
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
        {/* The inventory filters server-side, so cmdk does not filter again. */}
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search by name, for example a storage account" />
          <CommandList className="max-h-72">
            {list.isLoading || list.isFetching ? (
              <p role="status" className="px-3 py-6 text-center text-xs text-(--color-text-muted)">
                Looking for resources…
              </p>
            ) : list.isError ? (
              <p className="px-3 py-6 text-center text-xs text-(--color-danger-text)">
                Resources could not be read.{" "}
                <button type="button" className="font-medium underline" onClick={() => void list.refetch()}>
                  Retry
                </button>
              </p>
            ) : rows.length === 0 ? (
              <CommandEmpty>{dq ? `No Azure resource matches “${dq}”.` : "No Azure resource found yet. Resources show up here once a subscription has been scanned."}</CommandEmpty>
            ) : (
              <>
                {list.data?.meta?.next_cursor ? (
                  <p className="border-b border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
                    Showing the first 100. Type part of the name to find the rest.
                  </p>
                ) : null}
                <div className="p-1">
                  {rows.map((row) => {
                    const r = azureResourceOf(row);
                    return (
                      <CommandItem
                        key={row.ref}
                        value={row.ref}
                        onSelect={() => {
                          onChange(r);
                          setOpen(false);
                        }}
                        className="gap-3 px-2.5 py-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-(--color-text)">{r.name}</span>
                          <span className="block truncate text-xs text-(--color-text-muted)">{whereText(r)}</span>
                        </span>
                      </CommandItem>
                    );
                  })}
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- identities -------------------------------- */

/** Badge words (short: the list's footer says why). */
const NOT_TARGETABLE = "Can't be named";
const NOT_A_ROLE = "Not a role assignment";

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
  effect: AccessEffect;
  value: DraftRole[];
  onChange: (roles: DraftRole[]) => void;
  invalid?: boolean;
}) {
  const access = useGetGraphNeighbourhoodQuery(
    { ws, root: `resource:${resource?.resource_id ?? ""}` as GraphRef, direction: "reverse" },
    { skip: !resource },
  );
  const holders = useMemo(() => holdersOf(access.data?.data), [access.data]);
  // The walk is readable only when its root is the Azure resource (D-114); anything else is not an answer.
  const rootRead = access.data?.data.nodes.find((n) => n.ref === access.data?.data.root);
  const unreadable = access.isError || (!!access.data && rootRead?.provider !== "azure");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const search = useListInventoryQuery(
    { ws, class: "identities", provider: "azure", scope: resource?.tenant, q: dq, limit: 20 },
    { skip: dq.length < 2 || !resource },
  );
  const isAllow = effect === "allow";

  const chosen = new Set(value.map((r) => r.identity_account_id));
  const toggle = (c: { identity_account_id: string; name: string }) =>
    onChange(chosen.has(c.identity_account_id) ? value.filter((r) => r.identity_account_id !== c.identity_account_id) : [...value, { identity_account_id: c.identity_account_id, name: c.name }]);

  // Holding a role here is not proof of the access chosen, so the badge says what is known: a role is held.
  const listed: Candidate[] = holders.map((h) => ({
    identity_account_id: h.id,
    name: h.name,
    account: `${identityKindLabel(h.kind)} · ${h.roles.join(", ")}`,
    hasAccess: true,
    badge: "Holds a role here",
    blocked: !AZURE_TARGET_KINDS.has(h.kind) ? NOT_TARGETABLE : !h.hasRoleAssignment ? NOT_A_ROLE : undefined,
  }));
  // Access from a resource group, subscription or group is not listed, so "not listed" is all that is known.
  const found: Candidate[] = (search.data?.data ?? [])
    .filter((r) => AZURE_TARGET_KINDS.has(r.kind) && !holders.some((h) => h.id === refId(r.ref)))
    .map((r) => ({ identity_account_id: refId(r.ref), name: r.name, account: identityKindLabel(r.kind), hasAccess: false, badge: "No role here" }));
  // Identities ticked in the list need no chip; only ones added by search do.
  const extra = value.filter((r) => !listed.some((c) => c.identity_account_id === r.identity_account_id));

  if (!resource) {
    return <p className="rounded-md border border-dashed border-(--color-border-strong) px-3 py-3 text-xs text-(--color-text-muted)">Pick a resource first. The logins that already have access to it will appear here.</p>;
  }

  return (
    <div className="space-y-2">
      {extra.length ? (
        <div role="group" className="flex flex-wrap gap-1.5" aria-label="Other chosen identities">
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
          Logins with access to {resource.name} now
          {value.length ? ` · ${value.length} selected` : ""}
        </div>
        <div className="max-h-56 overflow-y-auto">
          {access.isLoading ? (
            <p role="status" className="px-3 py-3 text-xs text-(--color-text-muted)">
              Reading who holds a role on this resource…
            </p>
          ) : unreadable ? (
            <p className="px-3 py-3 text-xs text-(--color-danger-text)">
              Who holds a role on this resource could not be read. Search for an identity below.{" "}
              <button type="button" className="underline" onClick={() => void access.refetch()}>
                Retry
              </button>
            </p>
          ) : listed.length === 0 ? (
            <p className="px-3 py-3 text-xs text-(--color-text-muted)">
              {isAllow ? "No identity holds a role on this resource in the last scan. Search for the identity to allow below." : "No identity holds a role on this resource in the last scan. Search for an identity below to block it ahead of time."}
            </p>
          ) : (
            <ul>
              {listed.map((c) => (
                <CandidateRow key={c.identity_account_id} c={c} on={chosen.has(c.identity_account_id)} onToggle={() => toggle(c)} />
              ))}
            </ul>
          )}
        </div>
        <p className="border-t border-(--color-border-subtle) px-3 py-1.5 text-xs text-(--color-text-muted)">
          {isAllow
            ? "Holding a role here is not the same as having the access you allow; the summary says what AuthSec will assign. "
            : "Roles given on the resource group or subscription also reach this resource; the summary says if any do. "}
          Users and groups cannot be named in a policy, and AuthSec changes Azure role assignments only (not Key Vault access policies or app permissions).
        </p>
      </div>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--color-text-muted)" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find another service principal, managed identity or agent identity"
          aria-label="Find another identity"
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
            <p className="px-3 py-2 text-xs text-(--color-danger-text)">Logins could not be searched.</p>
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
