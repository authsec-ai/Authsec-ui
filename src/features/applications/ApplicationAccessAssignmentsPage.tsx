import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Plus, UserPlus, Cpu } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useListAccessAssignmentsQuery,
  useDeleteAssignmentMutation,
  type AccessAssignment,
} from "@/app/api/agentIdentityApi";
import {
  useListRSRolesQuery,
  useListEligibleUsersQuery,
} from "@/app/api/setupWizardApi";
import { useCreateUserAssignmentMutation } from "@/app/api/agentIdentityApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  AdaptiveTable,
  type AdaptiveColumn,
} from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useApplicationContext } from "./useApplicationContext";
import CreateAPICredentialWizard from "./components/CreateAPICredentialWizard";
import CreateWorkloadWizard from "./components/CreateWorkloadWizard";

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":") ? roleName.split(":").pop() || roleName : roleName;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

const IDENTITY_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  user: { label: "User", variant: "secondary" },
  service_account: { label: "Machine identity", variant: "outline" },
};

// ── Add User Dialog ────────────────────────────────────────────────────────────

function AddUserDialog({
  open,
  onOpenChange,
  rsId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}) {
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");

  const { data: usersData } = useListEligibleUsersQuery(rsId, { skip: !open });
  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !open });
  const [createAssignment, { isLoading }] = useCreateUserAssignmentMutation();

  const handleSubmit = async () => {
    if (!userId || !roleId) return;
    try {
      await createAssignment({ rsId, userId, roleId }).unwrap();
      toast.success("User access granted.");
      onOpenChange(false);
      setUserId("");
      setRoleId("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't grant access.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user access</DialogTitle>
          <DialogDescription>
            Grant a workspace user access to this MCP server by assigning a role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-select">User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="user-select">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {(usersData?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ? `${u.name} (${u.email})` : u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-select">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="role-select">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {(rolesData?.roles ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {labelRole(r.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!userId || !roleId || isLoading}
            className="text-white"
          >
            {isLoading ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApplicationAccessAssignmentsPage() {
  const { application } = useApplicationContext();
  const [query, setQuery] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [workloadWizardOpen, setWorkloadWizardOpen] = useState(false);

  const { data, isLoading } = useListAccessAssignmentsQuery(application.id);
  const [deleteAssignment, { isLoading: deleting }] = useDeleteAssignmentMutation();

  const assignments = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((a) =>
      [a.identity_name, a.role_name, a.identity_type, ...(a.effective_scopes ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data?.items, query]);

  const columns = useMemo<AdaptiveColumn<AccessAssignment>[]>(
    () => [
      {
        id: "identity",
        header: "Identity",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => {
          const badge = IDENTITY_BADGE[row.original.identity_type] ?? IDENTITY_BADGE.user;
          return (
            <EntityCell
              label={row.original.identity_name}
              detail={
                <Badge variant={badge.variant} className="mt-0.5">
                  {badge.label}
                </Badge>
              }
            />
          );
        },
      },
      {
        id: "role",
        header: "Role",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => (
          <Badge variant="secondary">{labelRole(row.original.role_name)}</Badge>
        ),
      },
      {
        id: "scopes",
        header: "Effective scopes",
        priority: 2,
        approxWidth: 260,
        cell: ({ row }) => {
          const scopes = row.original.effective_scopes ?? [];
          if (!scopes.length) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {scopes.slice(0, 3).map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-[11px]">
                  {s}
                </Badge>
              ))}
              {scopes.length > 3 && (
                <Badge variant="outline" className="text-[11px]">
                  +{scopes.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "default" : "outline"}>
            {row.original.status ?? "active"}
          </Badge>
        ),
      },
      {
        id: "assigned",
        header: "Assigned",
        priority: 4,
        approxWidth: 140,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(row.original.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 52,
        cell: ({ row }) => (
          <ConsoleRowActions
            items={[
              {
                label: "Revoke access",
                disabled: deleting,
                destructive: true,
                onSelect: async () => {
                  try {
                    await deleteAssignment({
                      rsId: application.id,
                      assignmentId: row.original.id,
                    }).unwrap();
                    toast.success("Access revoked.");
                  } catch (err) {
                    const apiErr = err as { data?: { error?: string } };
                    toast.error(apiErr?.data?.error ?? "Couldn't revoke access.");
                  }
                },
              },
            ]}
          />
        ),
      },
    ],
    [application.id, deleteAssignment, deleting],
  );

  return (
    <div className="space-y-4">
      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search identities, roles, or scopes"
        trailing={
          <div className="flex items-center gap-2">
            {query.trim() && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddUserOpen(true)}
            >
              <UserPlus className="mr-1.5 size-3.5" />
              Add user
            </Button>
            <Button
              size="sm"
              onClick={() => setWorkloadWizardOpen(true)}
              className="text-white"
            >
              <Cpu className="mr-1.5 size-3.5" />
              Kubernetes workload, no secret
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWizardOpen(true)}
            >
              <Cpu className="mr-1.5 size-3.5" />
              Machine credential
            </Button>
          </div>
        }
      />

      <TableCard>
        <CardContent variant="flush">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading access assignments…
            </div>
          ) : assignments.length === 0 && !query ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No identities can access this MCP server yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a user, connect a Kubernetes workload without a secret, or create a fallback
                machine credential.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddUserOpen(true)}
                >
                  <UserPlus className="mr-1.5 size-3.5" />
                  Add user
                </Button>
                <Button
                  size="sm"
                  onClick={() => setWorkloadWizardOpen(true)}
                  className="text-white"
                >
                  <Cpu className="mr-1.5 size-3.5" />
                  Kubernetes workload, no secret
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Machine credential
                </Button>
              </div>
            </div>
          ) : (
            <AdaptiveTable
              tableId="access-assignments"
              data={assignments}
              columns={columns}
              enableSelection={false}
              enableExpansion={false}
              getRowId={(a) => a.id}
              pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 25], alwaysVisible: true }}
            />
          )}
        </CardContent>
      </TableCard>

      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        rsId={application.id}
      />

      <CreateAPICredentialWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        rsId={application.id}
      />

      <CreateWorkloadWizard
        open={workloadWizardOpen}
        onOpenChange={setWorkloadWizardOpen}
        rsId={application.id}
      />
    </div>
  );
}
