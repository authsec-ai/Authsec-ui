import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronsUpDown, KeyRound, ShieldOff } from "lucide-react";
import { toast } from "react-hot-toast";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import {
  useGetApplicationEffectiveAccessQuery,
  type EffectiveAccessScope,
} from "@/app/api/accessApi";
import { useListEndUsersQuery } from "@/app/api/membershipApi";
import { useDeleteRSBindingMutation } from "@/app/api/setupWizardApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import {
  DecisionBanner,
  StatusBadge,
  type ConsoleTone,
} from "@/components/console/status";
import {
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterCard, TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/utils/workspace";

/**
 * Effective Access — resolve whether one user can reach one application's
 * scopes, why, and the safest next fix.
 *
 * Layout follows the console standard: ConsolePage shell (no boxed header),
 * a two-field resolver bar, one DecisionBanner verdict carrying the only CTA,
 * and the scope table. Internal role names (`rs-<uuid>:viewer`) are never
 * shown raw — see displayRoleName.
 */

function riskTone(risk?: string): ConsoleTone {
  if (risk === "high" || risk === "critical") return "danger";
  if (risk === "medium") return "warning";
  return "neutral";
}

/** `rs-<uuid>:viewer` → `Viewer`; anything else passes through untouched. */
function displayRoleName(name: string): string {
  const stripped = name.replace(/^rs-[0-9a-fA-F-]{36}:/, "");
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export default function EffectiveAccessPage() {
  const workspaceId = resolveWorkspaceId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userSearch, setUserSearch] = useState("");
  const [userId, setUserId] = useState(searchParams.get("user_id") || "");
  const [applicationId, setApplicationId] = useState(searchParams.get("application_id") || "");

  const { data: endUsers } = useListEndUsersQuery(
    { workspaceId: workspaceId || "", q: userSearch.trim() || undefined },
    { skip: !workspaceId },
  );
  const { data: applications = [] } = useListApplicationsQuery();
  const { data, isLoading, refetch } = useGetApplicationEffectiveAccessQuery(
    { applicationId, userId },
    { skip: !applicationId || !userId },
  );
  const [deleteBinding, { isLoading: deletingBinding }] = useDeleteRSBindingMutation();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (userId) next.set("user_id", userId);
    else next.delete("user_id");
    if (applicationId) next.set("application_id", applicationId);
    else next.delete("application_id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, applicationId]);

  const scopes = data?.scopes ?? [];
  const grantedCount = scopes.filter((s) => s.status === "granted").length;
  const who = data?.user.email || data?.user.name || "This user";
  const selectedApplication = applications.find((a) => a.id === applicationId);
  const configureHref = `/applications/${applicationId}/access-assignments`;

  // When arriving deep-linked with ?user_id= (e.g. from the Users page), the
  // selected user may not be in the current search page — inject it so the
  // picker shows a label instead of appearing blank.
  const userOptions = useMemo(() => {
    const list = (endUsers?.items ?? []).map((u) => ({
      id: u.user_id,
      label: u.user_email || u.user_username || u.user_id,
    }));
    if (userId && !list.some((o) => o.id === userId)) {
      list.unshift({ id: userId, label: data?.user.email || data?.user.name || userId });
    }
    return list;
  }, [endUsers, userId, data]);

  const columns = useMemo<AdaptiveColumn<EffectiveAccessScope>[]>(
    () => [
      {
        id: "scope",
        header: "Access label",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name || row.original.scope_string}
            detail={row.original.scope_string}
            monoDetail
          />
        ),
      },
      {
        id: "verdict",
        header: "Verdict",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge tone={row.original.status === "granted" ? "success" : "neutral"}>
            {row.original.status === "granted" ? "Granted" : "Not granted"}
          </StatusBadge>
        ),
      },
      {
        id: "through",
        header: "Granted through",
        priority: 2,
        approxWidth: 240,
        cell: ({ row }) =>
          (row.original.granted_through ?? []).length ? (
            <div className="flex flex-wrap gap-1">
              {(row.original.granted_through ?? []).map((source) => (
                <StatusBadge key={`${source.binding_id}:${source.role_id}`} tone="info">
                  {displayRoleName(source.role_name)}
                </StatusBadge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-(--color-text-muted)">No role grants this scope</span>
          ),
      },
      {
        id: "risk",
        header: "Risk",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusBadge tone={riskTone(row.original.risk_level)}>
            {row.original.risk_level || "unspecified"}
          </StatusBadge>
        ),
      },
      {
        id: "action",
        header: "Action",
        alwaysVisible: true,
        approxWidth: 76,
        cell: ({ row }) => {
          const sources = row.original.granted_through ?? [];
          return (
            <ConsoleRowActions
              items={[
                row.original.status !== "granted"
                  ? {
                      label: "Grant via role",
                      icon: <KeyRound className="size-4" />,
                      onSelect: () => navigate(configureHref),
                    }
                  : {
                      label: "View role bindings",
                      icon: <KeyRound className="size-4" />,
                      onSelect: () => navigate(`/authz/role-bindings?user_id=${userId}`),
                    },
                {
                  label: "Remove role binding",
                  icon: <ShieldOff className="size-4" />,
                  disabled:
                    row.original.status !== "granted" ||
                    !row.original.removable ||
                    sources.length !== 1 ||
                    deletingBinding,
                  destructive: true,
                  onSelect: async () => {
                    try {
                      await deleteBinding({
                        rsId: applicationId,
                        bindingId: sources[0].binding_id,
                      }).unwrap();
                      toast.success("Role binding removed.");
                      refetch();
                    } catch (err) {
                      const apiErr = err as { data?: { error?: string } };
                      toast.error(apiErr?.data?.error ?? "Couldn't remove binding.");
                    }
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [applicationId, configureHref, deleteBinding, deletingBinding, navigate, refetch, userId],
  );

  return (
    <ConsolePage
      title="Effective Access"
      description="Resolve whether a user can reach an application capability, why, and the safest next fix."
    >
      <FilterCard>
        <CardContent variant="compact">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-(--color-text)" htmlFor="ea-user">
                End user
              </label>
              <UserCombobox
                id="ea-user"
                value={userId}
                options={userOptions}
                search={userSearch}
                onSearchChange={setUserSearch}
                onSelect={setUserId}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-(--color-text)" htmlFor="ea-application">
                Application
              </label>
              <Select value={applicationId} onValueChange={setApplicationId}>
                <SelectTrigger id="ea-application">
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {applications.map((application) => (
                    <SelectItem key={application.id} value={application.id}>
                      {application.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedApplication?.resource_uri ? (
                <div className="truncate font-mono text-xs text-(--color-text-muted)">
                  {selectedApplication.resource_uri}
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </FilterCard>

      {data ? (
        data.roles.length ? (
          <DecisionBanner
            tone="success"
            title="Access is active"
            body={`${who} holds ${data.roles.map((role) => role.label).join(", ")} on ${data.application.name} · ${grantedCount} of ${scopes.length} scopes granted.`}
            actionLabel="Configure access"
            actionHref={configureHref}
          />
        ) : (
          <DecisionBanner
            tone="danger"
            title="No role grants access"
            body={`${who} has no role on ${data.application.name}. Assign an application role, then confirm the client requests the matching scope.`}
            actionLabel="Assign a role"
            actionHref={configureHref}
          />
        )
      ) : null}

      {!applicationId || !userId ? (
        <div className="rounded-lg border border-dashed border-(--color-border-strong) bg-(--color-surface-subtle) p-8 text-center text-sm text-(--color-text-muted)">
          Select an end user and an application to compute effective access.
        </div>
      ) : (
        <TableCard>
          <CardContent variant="flush">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-(--color-text-muted)">
                Resolving effective access…
              </div>
            ) : (
              <AdaptiveTable
                tableId="effective-access"
                data={scopes}
                columns={columns}
                enableSelection={false}
                enableExpansion={false}
                getRowId={(scope) => scope.id}
                pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
              />
            )}
          </CardContent>
        </TableCard>
      )}
    </ConsolePage>
  );
}

function UserCombobox({
  id,
  value,
  options,
  search,
  onSearchChange,
  onSelect,
}: {
  id?: string;
  value: string;
  options: { id: string; label: string }[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.label}</span>
          ) : (
            <span className="text-(--color-text-subtle)">Search users by email or username</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {/* Search is server-side (the `q` param) — disable cmdk's own filter. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={onSearchChange}
            placeholder="Search by email or username"
          />
          <CommandList>
            <CommandEmpty>No users match.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                onSelect={() => {
                  onSelect(option.id);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
