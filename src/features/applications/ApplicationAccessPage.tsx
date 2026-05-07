/**
 * `ApplicationAccessPage` — roll out access, fully wired.
 *
 * Backend sources of truth:
 *   • `useGetResourceServerAccessPolicyQuery` → enabled flag, default
 *      role id/name, role_options (the list to choose from)
 *   • `useUpdateResourceServerAccessPolicyMutation` → toggle enable +
 *      change default role
 *   • `useListRSBindingsQuery`  → manual exception assignments
 *   • `useListEligibleUsersQuery` → users available to assign
 *   • `useCreateRSBindingMutation` / `useDeleteRSBindingMutation` →
 *      add / remove an assignment
 *   • `useGetActivationPreviewQuery` → viewer_scopes,
 *     first_time_user_grant, scope_count
 *
 * The previous page fabricated reachable/blocked tool counts, bulk
 * import, time-bound access, and labelled scenario tester promises that
 * the backend doesn't support. Those are gone. Only what the existing
 * APIs can honestly populate is rendered.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useGetResourceServerAccessPolicyQuery,
  useUpdateResourceServerAccessPolicyMutation,
} from "@/app/api/resourceServersApi";
import {
  useGetActivationPreviewQuery,
  useListEligibleUsersQuery,
  useListRSBindingsQuery,
  useCreateRSBindingMutation,
  useDeleteRSBindingMutation,
} from "@/app/api/setupWizardApi";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";

export default function ApplicationAccessPage() {
  const { application } = useApplicationContext();

  const { data: policy, isLoading: policyLoading } =
    useGetResourceServerAccessPolicyQuery(application.id);
  const { data: preview } = useGetActivationPreviewQuery(application.id);
  const { data: bindingsResp } = useListRSBindingsQuery(application.id);
  const { data: usersResp } = useListEligibleUsersQuery(application.id);

  const [updatePolicy, { isLoading: updating }] =
    useUpdateResourceServerAccessPolicyMutation();
  const [createBinding, { isLoading: assigning }] =
    useCreateRSBindingMutation();
  const [deleteBinding, { isLoading: removing }] =
    useDeleteRSBindingMutation();

  const bindings = bindingsResp?.bindings ?? [];
  const eligibleUsers = usersResp?.users ?? [];
  const roleOptions = policy?.role_options ?? [];
  const publicToolCount = preview?.public_tool_names.length ?? preview?.tools.public ?? 0;

  const handleToggle = async (enabled: boolean) => {
    if (!policy) return;
    try {
      await updatePolicy({
        id: application.id,
        body: { enabled, default_role_id: policy.default_role_id },
      }).unwrap();
      toast.success(enabled ? "Default access enabled." : "Default access disabled.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't update policy.");
    }
  };

  const handleChangeRole = async (roleId: string) => {
    try {
      await updatePolicy({
        id: application.id,
        body: { enabled: policy?.enabled ?? true, default_role_id: roleId },
      }).unwrap();
      toast.success("Default role changed.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't change role.");
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Roll out access
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose what first-time users get by default. Then add manual
          exceptions for pilots and admins.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* LEFT — Default access (real) */}
        <Card className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Default access
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Applies to every user not covered by a manual binding.
                Sourced from{" "}
                <code className="font-mono">/access-policy</code>.
              </p>
            </div>
            {policy && (
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  disabled={updating}
                  onChange={(e) => handleToggle(e.target.checked)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-xs font-semibold text-foreground">
                  Enabled
                </span>
              </label>
            )}
          </div>

          {policyLoading && !policy && (
            <p className="text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading policy…
            </p>
          )}

          {policy && !policy.enabled && (
            <Card className="border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_6%,transparent)] p-3 text-xs text-foreground">
              Default access is <strong>disabled</strong>. Only users with
              a manual binding below can call scoped tools
              {publicToolCount > 0
                ? `; ${publicToolCount} public tool${publicToolCount === 1 ? "" : "s"} remain callable by any authenticated token for this application.`
                : "."}
            </Card>
          )}

          {policy && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Default role
              </p>
              {roleOptions.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No roles available. Define roles for this application
                  first (Tools tab → access labels → Roles).
                </p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {roleOptions.map((role) => {
                    const selected = role.role_id === policy.default_role_id;
                    return (
                      <button
                        key={role.role_id}
                        type="button"
                        disabled={updating || selected}
                        onClick={() => handleChangeRole(role.role_id)}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3 text-left transition-colors disabled:cursor-default",
                          selected
                            ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]"
                            : "border-border bg-card hover:bg-muted/40",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                            selected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                              : "border-border bg-card",
                          )}
                          aria-hidden
                        >
                          {selected && (
                            <span className="size-1.5 rounded-full bg-white" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {role.name}
                            </span>
                            {role.recommended && (
                              <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--color-primary)]">
                                recommended
                              </span>
                            )}
                            {role.is_generated && (
                              <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                                generated
                              </span>
                            )}
                          </div>
                          {role.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {role.description}
                            </p>
                          )}
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {role.permissions} permission
                            {role.permissions === 1 ? "" : "s"}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {policy && (
            <p className="text-[11px] italic text-muted-foreground">
              Trigger: <code className="font-mono">{policy.assignment_trigger}</code>
              {" · "}Source: <code className="font-mono">{policy.assignment_source}</code>
            </p>
          )}
        </Card>

        {/* RIGHT — Activation preview slice (real) */}
        <Card className="space-y-3 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            What policy will look like
          </p>
          <h3 className="text-sm font-semibold text-foreground">
            Activation preview
          </h3>
          {!preview ? (
            <p className="text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              Loading preview…
            </p>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Default role grants
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">
                  {preview.first_time_user_grant.length
                    ? preview.first_time_user_grant.join(", ")
                    : "(no scopes)"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Viewer scopes (computed)
                </dt>
                <dd className="mt-1 break-all font-mono text-xs text-foreground">
                  {preview.viewer_scopes.length
                    ? preview.viewer_scopes.join(", ")
                    : "(none)"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Tools / scopes registered
                </dt>
                <dd className="mt-1 text-foreground">
                  {preview.tools.total} tools · {preview.scope_count} scopes
                </dd>
              </div>
            </dl>
          )}
          <Button asChild variant="outline" className="w-full justify-center">
            <Link to={`/applications/${application.id}/test`}>
              Run protection test  →
            </Link>
          </Button>
          <p className="text-[11px] italic text-muted-foreground">
            Per-scenario simulation (user × client × tool) requires a
            backend endpoint we don't have yet.
          </p>
        </Card>
      </div>

      {/* Manual exceptions (real bindings) */}
      <section>
        <h3 className="text-sm font-semibold text-foreground">
          Manual exceptions
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          User-to-role assignments specific to this application. These
          override the default role. Bulk import and time-bound expiry
          are not yet supported by the backend.
        </p>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2 text-right" aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {bindings.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      {policy?.enabled
                        ? "No manual exceptions. Users without an exception receive the default role above."
                        : "No manual exceptions. With default access disabled, scoped tools are denied unless a public tool is explicitly configured."}
                    </td>
                  </tr>
                )}
                {bindings.map((binding) => (
                  <tr
                    key={binding.id}
                    className="border-t border-border/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-semibold text-foreground">
                        {binding.username}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {binding.user_email}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {binding.role_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {binding.assignment_source ?? "manual"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(binding.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removing}
                        onClick={() =>
                          deleteBinding({
                            rsId: application.id,
                            bindingId: binding.id,
                          })
                            .unwrap()
                            .then(() => toast.success("Assignment removed."))
                            .catch((err) => {
                              const apiErr = err as { data?: { error?: string } };
                              toast.error(
                                apiErr?.data?.error ?? "Couldn't remove.",
                              );
                            })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddBindingForm
            applicationId={application.id}
            users={eligibleUsers}
            roleOptions={roleOptions}
            assigning={assigning}
            createBinding={createBinding}
          />
        </Card>
      </section>
    </div>
  );
}

function AddBindingForm({
  applicationId,
  users,
  roleOptions,
  assigning,
  createBinding,
}: {
  applicationId: string;
  users: { id: string; email: string; name: string }[];
  roleOptions: { role_id: string; name: string }[];
  assigning: boolean;
  createBinding: ReturnType<typeof useCreateRSBindingMutation>[0];
}) {
  const [userId, setUserId] = useState<string>("");
  const [roleId, setRoleId] = useState<string>("");

  const canSubmit = useMemo(
    () => userId !== "" && roleId !== "" && !assigning,
    [userId, roleId, assigning],
  );

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await createBinding({ rsId: applicationId, userId, roleId }).unwrap();
      toast.success("Assignment added.");
      setUserId("");
      setRoleId("");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't add assignment.");
    }
  };

  if (users.length === 0 || roleOptions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
      <div className="flex-1 space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          User
        </label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="block w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="">Select…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Role
        </label>
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          className="block w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="">Select…</option>
          {roleOptions.map((r) => (
            <option key={r.role_id} value={r.role_id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={submit} disabled={!canSubmit} size="sm">
        Add assignment
      </Button>
    </div>
  );
}
