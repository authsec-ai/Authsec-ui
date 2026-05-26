import { useMemo, useState } from "react";
import { AppWindow, Check, KeyRound, Search, ShieldCheck, Users } from "lucide-react";

import {
  useCreateApplicationRoleMutation,
  type ApplicationRole,
} from "@/app/api/accessApi";
import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { useGetScopeMatrixQuery } from "@/app/api/scopeMatrixApi";
import { useListEligibleUsersQuery } from "@/app/api/setupWizardApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface ApplicationRoleWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (role: ApplicationRole) => void;
}

const STEPS = [
  { label: "Role", icon: ShieldCheck },
  { label: "Application", icon: AppWindow },
  { label: "Scopes", icon: KeyRound },
  { label: "Users", icon: Users },
] as const;

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Create application role</DialogTitle>
          <DialogDescription>
            Build a runtime role from application scopes, then optionally assign it to users.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <nav className="space-y-1">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setStep(index)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium",
                    step === index
                      ? "bg-blue-50 text-blue-700"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {index < step ? <Check className="ml-auto h-4 w-4" /> : null}
                </button>
              );
            })}
          </nav>

          <div className="min-h-[440px] rounded-md border">
            {step === 0 ? (
              <div className="space-y-4 p-4">
                <div className="space-y-2">
                  <Label htmlFor="role-name">Role name</Label>
                  <Input
                    id="role-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Support operator"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role-description">Description</Label>
                  <Textarea
                    id="role-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What this role should allow, and who should receive it."
                    rows={5}
                  />
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-3 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={applicationQuery}
                    onChange={(event) => setApplicationQuery(event.target.value)}
                    placeholder="Filter hundreds of applications"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                <ScrollArea className="h-[360px]">
                  <div className="space-y-2 pr-3">
                    {filteredApplications.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          setApplicationId(app.id);
                          setSelectedScopes(new Set());
                          setSelectedUsers(new Set());
                        }}
                        className={cn(
                          "w-full rounded-md border p-3 text-left transition-colors",
                          applicationId === app.id
                            ? "border-blue-300 bg-blue-50"
                            : "hover:bg-muted/60",
                        )}
                      >
                        <div className="font-medium">{app.name}</div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {app.resource_uri}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{selectedApplication?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedScopes.size} scope{selectedScopes.size === 1 ? "" : "s"} selected
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScopes(new Set((matrix?.scopes ?? []).map((s) => s.id)))}
                    disabled={!matrix?.scopes?.length}
                  >
                    Select all
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={scopeQuery}
                    onChange={(event) => setScopeQuery(event.target.value)}
                    placeholder="Search scopes"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                <ScrollArea className="h-[315px]">
                  <div className="space-y-2 pr-3">
                    {scopesLoading ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Loading scopes...</div>
                    ) : scopes.length ? (
                      scopes.map((scope) => (
                        <label
                          key={scope.id}
                          className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={selectedScopes.has(scope.id)}
                            onCheckedChange={() =>
                              toggleSetValue(setSelectedScopes, selectedScopes, scope.id)
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-sm">{scope.scope_string}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {scope.display_name || scope.description || "No description yet"}
                            </span>
                          </span>
                          <Badge variant="outline">{scope.risk_level}</Badge>
                        </label>
                      ))
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No scopes found for this application.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4 p-4">
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={makeDefault}
                    onCheckedChange={(checked) => setMakeDefault(checked === true)}
                  />
                  <span>
                    <span className="block font-medium">Make this the default application role</span>
                    <span className="text-sm text-muted-foreground">
                      New first-time users can receive this role when default access is enabled.
                    </span>
                  </span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Search users to assign now"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                <ScrollArea className="h-[260px]">
                  <div className="space-y-2 pr-3">
                    {usersLoading ? (
                      <div className="py-8 text-center text-sm text-muted-foreground">Loading users...</div>
                    ) : users.length ? (
                      users.map((user) => (
                        <label
                          key={user.id}
                          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/60"
                        >
                          <Checkbox
                            checked={selectedUsers.has(user.id)}
                            onCheckedChange={() =>
                              toggleSetValue(setSelectedUsers, selectedUsers, user.id)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block font-medium">{user.name || user.email || user.id}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email || user.id}
                            </span>
                          </span>
                        </label>
                      ))
                    ) : (
                      <div className="py-8 text-center text-sm text-muted-foreground">
                        No eligible users found. You can assign users later from Role Bindings.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((value) => value - 1)}>
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((value) => value + 1)} disabled={!canContinue}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim() || !applicationId || selectedScopes.size === 0}
            >
              {creating ? "Creating..." : "Create role"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
