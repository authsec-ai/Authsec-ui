import { useMemo, useState } from "react";
import { Check, Search, Server, X } from "lucide-react";

import {
  useCreateApplicationRoleMutation,
  type ApplicationRole,
} from "@/app/api/accessApi";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { useGetScopeMatrixQuery } from "@/app/api/scopeMatrixApi";
import { useListEligibleUsersQuery } from "@/app/api/setupWizardApi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

interface ApplicationRoleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (role: ApplicationRole) => void;
}

const STEP_LABELS = ["Basics", "Application", "Scopes", "Assign"] as const;

function userInitials(label: string): string {
  const parts = label.split(/[@.\s]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function ApplicationRoleWizard({
  open,
  onOpenChange,
  onCreated,
}: ApplicationRoleWizardProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [makeDefault, setMakeDefault] = useState(false);
  const [applicationQuery, setApplicationQuery] = useState("");
  const [scopeQuery, setScopeQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const { data: applications = [] } = useListApplicationsQuery();
  const { data: matrix, isFetching: scopesLoading } = useGetScopeMatrixQuery(applicationId, {
    skip: !applicationId,
  });
  const { data: eligibleUsers, isFetching: usersLoading } = useListEligibleUsersQuery(
    applicationId,
    { skip: !applicationId },
  );
  const [createRole, { isLoading: creating }] = useCreateApplicationRoleMutation();

  const filteredApplications = useMemo(() => {
    const q = applicationQuery.trim().toLowerCase();
    if (!q) return applications;
    return applications.filter((app) =>
      [app.name, app.resource_uri, app.public_base_url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [applications, applicationQuery]);

  const scopes = useMemo(() => {
    const items = matrix?.scopes ?? [];
    const q = scopeQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((scope) =>
      [scope.scope_string, scope.display_name, scope.description, scope.risk_level]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [matrix?.scopes, scopeQuery]);

  const users = useMemo(() => {
    const items = eligibleUsers?.users ?? [];
    const q = userQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((user) =>
      [user.email, user.name, user.id].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [eligibleUsers?.users, userQuery]);

  const selectedApplication = applications.find((app) => app.id === applicationId);
  const canContinue =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && Boolean(applicationId)) ||
    (step === 2 && selectedScopes.size > 0) ||
    step === 3;

  const reset = () => {
    setStep(0);
    setName("");
    setDescription("");
    setApplicationId("");
    setSelectedScopes(new Set());
    setSelectedUsers(new Set());
    setMakeDefault(false);
    setApplicationQuery("");
    setScopeQuery("");
    setUserQuery("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

  const toggleSetValue = (setter: (value: Set<string>) => void, current: Set<string>, id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const handleCreate = async () => {
    if (!applicationId) return;
    try {
      const role = await createRole({
        applicationId,
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          scope_ids: Array.from(selectedScopes),
          default_role: makeDefault,
          assign_user_ids: Array.from(selectedUsers),
        },
      }).unwrap();
      toast.success("Application role created");
      onCreated?.(role);
      handleOpenChange(false);
    } catch (error: any) {
      toast.error(error?.data?.error ?? "Could not create application role");
    }
  };

  const allScopeIds = (matrix?.scopes ?? []).map((s) => s.id);
  const allSelected = allScopeIds.length > 0 && allScopeIds.every((id) => selectedScopes.has(id));
  const lastStep = step === STEP_LABELS.length - 1;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-cr
        showCloseButton={false}
        className="gap-0 overflow-hidden border-(--color-border-subtle) p-0 sm:max-w-170"
      >
        <DialogTitle className="sr-only">Create application role</DialogTitle>
        <DialogDescription className="sr-only">
          Bundle an application's scopes into an assignable role.
        </DialogDescription>

        <div className="wiz-head">
          <div className="wiz-head-top">
            <div>
              <h2 className="wiz-title">Create application role</h2>
              <p className="wiz-sub">Bundle an application's scopes into an assignable role.</p>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={() => handleOpenChange(false)}>
              <X className="icon" />
            </button>
          </div>
          <div className="stepper">
            {STEP_LABELS.map((label, i) => {
              const state = i === step ? "active" : i < step ? "done" : "todo";
              return (
                <div className="contents" key={label} style={{ display: "contents" }}>
                  <div className="step-dot" data-state={state}>
                    <span className="step-num">{state === "done" ? <Check className="icon-sm" /> : i + 1}</span>
                    <span className="step-label">{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && <div className="step-line" data-done={i < step} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="wiz-body">
          {step === 0 && (
            <>
              <div className="wiz-field">
                <label className="wiz-label" htmlFor="role-name">
                  Role name <span className="req">*</span>
                </label>
                <input
                  id="role-name"
                  className="input"
                  style={{ width: "100%" }}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Editor, Read-only Ops"
                  autoComplete="off"
                />
              </div>
              <div className="wiz-field">
                <label className="wiz-label" htmlFor="role-description">
                  Description
                </label>
                <textarea
                  id="role-description"
                  className="textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this role is for (optional)"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className={`search wiz-search${applicationQuery ? " has-value" : ""}`}>
                <span className="search-ic">
                  <Search className="icon" />
                </span>
                <input
                  value={applicationQuery}
                  onChange={(e) => setApplicationQuery(e.target.value)}
                  placeholder="Search by name or resource URI"
                  autoComplete="off"
                />
              </div>
              <div className="pick-list" role="radiogroup" aria-label="Applications">
                {filteredApplications.length ? (
                  filteredApplications.map((app) => (
                    <button
                      key={app.id}
                      className="pick"
                      data-selected={applicationId === app.id}
                      role="radio"
                      aria-checked={applicationId === app.id}
                      onClick={() => {
                        setApplicationId(app.id);
                        setSelectedScopes(new Set());
                        setSelectedUsers(new Set());
                      }}
                    >
                      <span className="pick-radio" />
                      <span className="pick-glyph">
                        <Server className="icon-sm" />
                      </span>
                      <span className="pick-body">
                        <div className="pick-title">{app.name}</div>
                        <div className="pick-sub mono">{app.resource_uri}</div>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="step-empty">
                    <div className="se-title">No applications found</div>
                    <div>Try a different search term.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="scope-toolbar">
                <span className="scope-count">
                  <b>{selectedScopes.size}</b> scopes selected
                </span>
                <button
                  className="link-btn"
                  onClick={() => setSelectedScopes(allSelected ? new Set() : new Set(allScopeIds))}
                  disabled={!allScopeIds.length}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className={`search wiz-search${scopeQuery ? " has-value" : ""}`}>
                <span className="search-ic">
                  <Search className="icon" />
                </span>
                <input
                  value={scopeQuery}
                  onChange={(e) => setScopeQuery(e.target.value)}
                  placeholder="Search scopes"
                  autoComplete="off"
                />
              </div>
              <div className="pick-list">
                {scopesLoading ? (
                  <div className="step-empty">
                    <div className="se-title">Loading scopes…</div>
                  </div>
                ) : scopes.length ? (
                  scopes.map((scope) => {
                    const sel = selectedScopes.has(scope.id);
                    const risk = (scope.risk_level as string) ?? "low";
                    return (
                      <button
                        key={scope.id}
                        className="pick"
                        data-selected={sel}
                        onClick={() => toggleSetValue(setSelectedScopes, selectedScopes, scope.id)}
                      >
                        <span className="pick-check">
                          <Check className="icon-sm" />
                        </span>
                        <span className="pick-body">
                          <div className="pick-title mono">{scope.scope_string}</div>
                          <div className="pick-sub">
                            {scope.display_name || scope.description || "No description yet"}
                          </div>
                        </span>
                        <span className="pick-right">
                          <span className={`badge badge--risk-${risk}`}>
                            <span className="bdot" />
                            {risk.charAt(0).toUpperCase() + risk.slice(1)}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="step-empty">
                    <div className="se-title">No scopes found for this application</div>
                  </div>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wiz-field">
                <div className="switch-row">
                  <button
                    className="switch"
                    data-on={makeDefault}
                    role="switch"
                    aria-checked={makeDefault}
                    aria-label="Make default"
                    onClick={() => setMakeDefault((v) => !v)}
                  />
                  <div className="switch-text">
                    <div className="switch-title">Make this the default application role</div>
                    <div className="switch-desc">
                      New first-time users receive this role automatically when default access is enabled.
                    </div>
                  </div>
                </div>
              </div>
              <div className="wiz-field">
                <label className="wiz-label">
                  Assign users now{" "}
                  <span style={{ fontWeight: 400, color: "var(--color-text-subtle)" }}>— optional</span>
                </label>
                <div className={`search wiz-search${userQuery ? " has-value" : ""}`}>
                  <span className="search-ic">
                    <Search className="icon" />
                  </span>
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search by email, name, or id"
                    autoComplete="off"
                  />
                </div>
                <div className="pick-list">
                  {usersLoading ? (
                    <div className="step-empty">
                      <div className="se-title">Loading users…</div>
                    </div>
                  ) : users.length ? (
                    users.map((user) => {
                      const label = user.name || user.email || user.id;
                      return (
                        <button
                          key={user.id}
                          className="pick"
                          data-selected={selectedUsers.has(user.id)}
                          onClick={() => toggleSetValue(setSelectedUsers, selectedUsers, user.id)}
                        >
                          <span className="pick-check">
                            <Check className="icon-sm" />
                          </span>
                          <span className="pick-avatar" style={{ background: "linear-gradient(150deg,#6366f1,#4f46e5)" }}>
                            {userInitials(label)}
                          </span>
                          <span className="pick-body">
                            <div className="pick-title">{label}</div>
                            <div className="pick-sub mono">{user.email || user.id}</div>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="step-empty">
                      <div className="se-title">No eligible users found</div>
                    </div>
                  )}
                </div>
                <p className="wiz-hint">You can also assign users later from the Assignments page.</p>
              </div>
            </>
          )}
        </div>

        <div className="wiz-foot">
          <button
            className="btn btn-ghost"
            style={{ visibility: step === 0 ? "hidden" : "visible" }}
            onClick={() => setStep((v) => Math.max(0, v - 1))}
          >
            Back
          </button>
          <div className="wf-right">
            <button className="btn btn-secondary" onClick={() => handleOpenChange(false)}>
              Cancel
            </button>
            {lastStep ? (
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !name.trim() || !applicationId || selectedScopes.size === 0}
              >
                <Check className="icon-sm" /> {creating ? "Creating…" : "Create role"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setStep((v) => v + 1)} disabled={!canContinue}>
                Continue
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
