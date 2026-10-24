/**
 * The form's Kubernetes picker: a ServiceAccount, then one of the roles it
 * holds a binding of. A Kubernetes access policy blocks the ServiceAccount
 * from that role: the cluster's agent takes it out of every binding of the role
 * that names it, and puts it back at the end (migration 146). The role list is
 * the ServiceAccount's own access, so a pick always names a binding there is.
 */

import { ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useGetK8sAccessQuery, useListK8sIdentitiesQuery, type K8sIdentity } from "@/app/api/k8sGraphApi";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { k8sRolesOf, type DraftResource, type DraftRole } from "./model";

export function K8sPicker({
  resource,
  roles,
  onChange,
  invalid,
}: {
  resource: DraftResource | null;
  roles: DraftRole[];
  onChange: (resource: DraftResource | null, roles: DraftRole[]) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sa = roles[0];
  const ids = useListK8sIdentitiesQuery({ limit: 500 }, { skip: !!sa });
  const access = useGetK8sAccessQuery(sa?.identity_account_id ?? "", { skip: !sa || !!resource });
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (ids.data ?? []).filter((i: K8sIdentity) => i.lifecycle !== "retired" && (!needle || i.anchor.toLowerCase().includes(needle)));
  }, [ids.data, q]);
  const held = useMemo(() => k8sRolesOf(access.data?.grants ?? []), [access.data]);

  if (sa && resource) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-(--color-text)">{resource.name}</div>
          <div className="truncate font-mono text-xs text-(--color-text-muted)">{sa.name}</div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(null, [])}>
          Change
        </Button>
      </div>
    );
  }

  if (sa) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
          <div className="min-w-0 flex-1 truncate font-mono text-[13px] text-(--color-text)">{sa.name}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null, [])}>
            Change
          </Button>
        </div>
        <div role="radiogroup" aria-label="Role" className="rounded-md border border-(--color-border-subtle)">
          {access.isLoading ? (
            <p role="status" className="px-3 py-3 text-xs text-(--color-text-muted)">
              Reading the roles it holds…
            </p>
          ) : access.isError ? (
            <p className="px-3 py-3 text-xs text-(--color-danger-text)">Its roles could not be read.</p>
          ) : held.length === 0 ? (
            <p className="px-3 py-3 text-xs text-(--color-text-muted)">This ServiceAccount holds no role AuthSec has seen.</p>
          ) : (
            <ul className="divide-y divide-(--color-border-subtle)">
              {held.map((r) => (
                <li key={r.role_id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    onClick={() =>
                      onChange(
                        { provider: "k8s", resource_id: r.role_id, resource_type: "k8s_role", name: r.label, bucket: "", arn: "", account_id: "" },
                        roles,
                      )
                    }
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-(--color-surface-subtle)"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-(--color-text)">{r.label}</span>
                      <span className="block truncate text-xs text-(--color-text-muted)">
                        {r.kind} · through {r.bindings.join(", ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
          aria-label="Choose a ServiceAccount"
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border bg-(--color-surface-raised) px-3 text-left text-[13px] shadow-xs transition-colors hover:bg-(--color-surface-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary)",
            invalid ? "border-(--color-danger)" : "border-(--color-border-strong)",
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
          <span className="flex-1 truncate text-(--color-text-muted)">Search for a ServiceAccount</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-(--color-text-muted)" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder="Search for a ServiceAccount" />
          <CommandList className="max-h-72">
            {ids.isLoading ? (
              <p role="status" className="px-3 py-6 text-center text-xs text-(--color-text-muted)">
                Looking for ServiceAccounts…
              </p>
            ) : ids.isError ? (
              <p className="px-3 py-6 text-center text-xs text-(--color-danger-text)">ServiceAccounts could not be read.</p>
            ) : shown.length === 0 ? (
              <CommandEmpty>{q ? `No ServiceAccount matches “${q}”.` : "No ServiceAccount found yet. They show up after the cluster's agent sends its first RBAC sweep."}</CommandEmpty>
            ) : (
              <div className="p-1">
                {shown.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={i.id}
                    onSelect={() => {
                      onChange(null, [{ identity_account_id: i.id, name: i.anchor.replace(/^system:serviceaccount:/, "") }]);
                      setOpen(false);
                    }}
                    className="gap-3 px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[13px] text-(--color-text)">{i.anchor.replace(/^system:serviceaccount:/, "")}</span>
                      <span className="block truncate text-xs text-(--color-text-muted)">
                        {i.grants} {i.grants === 1 ? "grant" : "grants"}
                        {i.wildcard ? " · holds a wildcard rule" : ""}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
