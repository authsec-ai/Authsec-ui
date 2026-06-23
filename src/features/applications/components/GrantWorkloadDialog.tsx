/**
 * `GrantWorkloadDialog` — grant an EXISTING workload access to this MCP server
 * (plan Journey 1 / the model split). This is the safe "attach existing" path:
 * it calls POST /applications/:id/access/workloads, which only creates the role
 * binding + approved registration and NEVER mints or changes the workload's
 * identity. To create a brand-new workload, use the "Register" wizards instead.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";

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
import { Button } from "@/components/ui/button";
import {
  useListWorkspaceServiceAccountsQuery,
  useGrantWorkloadAccessMutation,
} from "@/app/api/agentIdentityApi";
import { useListRSRolesQuery } from "@/app/api/setupWizardApi";

const labelRole = (roleName: string) => {
  const raw = roleName.includes(":") ? roleName.split(":").pop() || roleName : roleName;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

export default function GrantWorkloadDialog({
  open,
  onOpenChange,
  rsId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rsId: string;
}) {
  const { data: sas } = useListWorkspaceServiceAccountsQuery(undefined, { skip: !open });
  const { data: rolesData } = useListRSRolesQuery(rsId, { skip: !open });
  const [grant, { isLoading }] = useGrantWorkloadAccessMutation();

  const [saId, setSaId] = useState("");
  const [roleId, setRoleId] = useState("");

  // Only workloads that already have an authentication method can be granted
  // access — without a credential there's nothing to register.
  const grantable = useMemo(
    () => (sas ?? []).filter((s) => s.oauth_client_id && s.status === "active"),
    [sas],
  );

  const handleSubmit = async () => {
    if (!saId || !roleId) return;
    try {
      const res = await grant({ rsId, service_account_id: saId, role_id: roleId }).unwrap();
      toast.success(
        res.effective_scopes.length > 0
          ? `Granted — ${res.service_account_name} can call this server (${res.effective_scopes.length} scope${res.effective_scopes.length === 1 ? "" : "s"}).`
          : `Granted, but the role yields no scopes here yet.`,
      );
      onOpenChange(false);
      setSaId("");
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
          <DialogTitle>Grant workload access</DialogTitle>
          <DialogDescription>
            Let an existing workload call this MCP server with a role. This never
            changes the workload's identity or credential.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="grant-wl">Workload</Label>
            <Select value={saId} onValueChange={setSaId}>
              <SelectTrigger id="grant-wl">
                <SelectValue placeholder="Select a workload" />
              </SelectTrigger>
              <SelectContent>
                {grantable.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No workloads with a credential yet — register one first.
                  </div>
                ) : (
                  grantable.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.spiffe_id ? " · Kubernetes" : " · credential"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-role">Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="grant-role">
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
            onClick={() => void handleSubmit()}
            disabled={!saId || !roleId || isLoading}
            className="text-white"
          >
            {isLoading ? "Granting…" : "Grant access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
