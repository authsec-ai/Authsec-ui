import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  useListRSRolesQuery,
  useListRSBindingsQuery,
  useCreateRSBindingMutation,
  useDeleteRSBindingMutation,
  useListEligibleUsersQuery,
} from "../../app/api/setupWizardApi";
import type { RSBinding, RSRole } from "../../app/api/setupWizardApi";

interface Props {
  rsId: string;
  /** Refresh wizard checklist + activation gates after a binding change. */
  onChange?: () => void;
}

type SubTab = "roles" | "bindings";

export function RolesAccessTab({ rsId, onChange }: Props) {
  const [tab, setTab] = useState<SubTab>("roles");

  const { data: rolesResp, isLoading: rolesLoading } = useListRSRolesQuery(rsId);
  const { data: bindingsResp, isLoading: bindingsLoading } = useListRSBindingsQuery(rsId);
  const { data: usersResp } = useListEligibleUsersQuery(rsId, { skip: tab !== "bindings" });
  const [createBinding, { isLoading: creating }] = useCreateRSBindingMutation();
  const [deleteBinding] = useDeleteRSBindingMutation();

  const roles = rolesResp?.roles ?? [];
  const bindings = bindingsResp?.bindings ?? [];
  const eligibleUsers = usersResp?.users ?? [];

  // Form state for the assign-binding form on the bindings sub-tab.
  const [selectedUserID, setSelectedUserID] = useState("");
  const [selectedRoleID, setSelectedRoleID] = useState("");

  const roleByID = useMemo(() => {
    const m = new Map<string, RSRole>();
    for (const r of roles) m.set(r.id, r);
    return m;
  }, [roles]);

  const handleCreate = async () => {
    if (!selectedUserID || !selectedRoleID) {
      toast.error("Select a user and a role first");
      return;
    }
    try {
      await createBinding({
        rsId,
        userId: selectedUserID,
        roleId: selectedRoleID,
      }).unwrap();
      toast.success("Binding created");
      setSelectedUserID("");
      setSelectedRoleID("");
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string; hint?: string } };
      const msg = apiErr?.data?.error ?? "Failed to create binding";
      const hint = apiErr?.data?.hint;
      toast.error(hint ? `${msg} — ${hint}` : msg);
    }
  };

  const handleDelete = async (b: RSBinding) => {
    if (
      !window.confirm(
        `Remove ${b.user_email || b.username || b.user_id}'s "${b.role_name}" binding on this resource server?`,
      )
    ) {
      return;
    }
    try {
      await deleteBinding({ rsId, bindingId: b.id }).unwrap();
      toast.success("Binding removed");
      onChange?.();
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Failed to remove binding");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Roles & access</h2>
        <p className="mt-1 text-sm text-gray-600">
          Auto-generated roles for this resource server live here:
          <code className="mx-1 rounded bg-gray-100 px-1 text-xs">rs-…:admin</code>,
          <code className="mx-1 rounded bg-gray-100 px-1 text-xs">rs-…:viewer</code>,
          and <code className="mx-1 rounded bg-gray-100 px-1 text-xs">rs-…:readonly</code>.
          Bindings on this tab are RS-scoped — they grant the role only against
          this resource server, not tenant-wide.
        </p>
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["roles", "bindings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-[2px] ${
              tab === t
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            {t === "roles" ? "Roles" : "Bindings"}
          </button>
        ))}
      </div>

      {tab === "roles" && (
        <div className="rounded-md border border-gray-200 bg-white">
          {rolesLoading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading roles…</div>
          ) : roles.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              No roles yet. Roles are auto-created when the RS is registered or after
              its first successful scope sync.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {roles.map((r) => {
                // Strip the rs-{uuid}: prefix for a cleaner display.
                const shortName = r.name.replace(/^rs-[^:]+:/, "");
                return (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 capitalize">
                          {shortName}
                        </span>
                        {r.is_default && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                            default — first-time users
                          </span>
                        )}
                      </div>
                      {r.description && (
                        <div className="mt-0.5 text-xs text-gray-500">{r.description}</div>
                      )}
                      <div className="mt-1 font-mono text-[10px] text-gray-400">{r.name}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-gray-600">
                      <span>
                        <strong>{r.permissions}</strong> perm{r.permissions !== 1 ? "s" : ""}
                      </span>
                      <span>
                        <strong>{r.bindings}</strong> user{r.bindings !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "bindings" && (
        <>
          {/* Create form */}
          <div className="rounded-md border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Assign role to user</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-sm md:col-span-1">
                <span className="block text-xs font-medium text-gray-700 mb-1">User</span>
                <select
                  value={selectedUserID}
                  onChange={(e) => setSelectedUserID(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select a user…</option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name === u.email ? u.email : `${u.name} (${u.email})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm md:col-span-1">
                <span className="block text-xs font-medium text-gray-700 mb-1">Role</span>
                <select
                  value={selectedRoleID}
                  onChange={(e) => setSelectedRoleID(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select a role…</option>
                  {roles.map((r) => {
                    const shortName = r.name.replace(/^rs-[^:]+:/, "");
                    return (
                      <option key={r.id} value={r.id}>
                        {shortName}
                        {r.is_default ? " (default)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  onClick={handleCreate}
                  disabled={creating || !selectedUserID || !selectedRoleID}
                  className="w-full rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
            {eligibleUsers.length === 0 && (
              <p className="mt-2 text-xs text-yellow-700">
                No eligible end-users. Users appear here after they complete their
                first OAuth login against this resource server (which auto-mirrors
                them into master users), or after admin signup.
              </p>
            )}
          </div>

          {/* Existing bindings */}
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">
                {bindings.length} binding{bindings.length !== 1 ? "s" : ""}
              </h3>
            </div>
            {bindingsLoading ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading bindings…</div>
            ) : bindings.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                No bindings yet on this resource server.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {bindings.map((b) => {
                  const shortRole = b.role_name.replace(/^rs-[^:]+:/, "");
                  const isGlobal = !b.scope_type && !b.scope_id;
                  const role = roleByID.get(b.role_id);
                  return (
                    <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {b.user_email || b.username || b.user_id}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 capitalize">
                            {shortRole}
                          </span>
                          {role?.is_default && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                              default
                            </span>
                          )}
                          {isGlobal && (
                            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                              tenant-wide (legacy)
                            </span>
                          )}
                          {b.assignment_source && b.assignment_source !== "manual_admin" && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                              {b.assignment_source}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          since {new Date(b.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(b)}
                        disabled={isGlobal}
                        title={
                          isGlobal
                            ? "Tenant-wide bindings can only be removed from the main RBAC page"
                            : "Remove binding"
                        }
                        className="text-xs text-red-600 hover:text-red-800 underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
