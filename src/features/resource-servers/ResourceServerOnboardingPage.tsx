import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, ListChecks, RefreshCcw, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useGetResourceServerAccessPolicyQuery,
  useGetResourceServerQuery,
  useUpdateResourceServerAccessPolicyMutation,
  useValidateResourceServerMutation,
  type ResourceServerValidationResult,
} from "@/app/api/resourceServersApi";
import { useCreateBindingMutation } from "@/app/api/bindingsApi";
import { useGetAdminUsersQuery } from "@/app/api/admin/usersApi";
import { useGetScopeMatrixQuery, useRescanResourceServerMutation } from "@/app/api/scopeMatrixApi";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TableCard } from "@/theme/components/cards";

import { ResourceServerClientsPanel } from "./components/ResourceServerClientsPanel";
import { ResourceServerSecretBanner } from "./components/ResourceServerSecretBanner";
import {
  buildReadinessItems,
  computeAuthorizeURL,
  computeIntrospectionURL,
  computeJwksURL,
  computeMcpEndpointURL,
  computeMetadataPath,
  computeMetadataURL,
  computeOAuthIssuerURL,
  computeTokenURL,
  formatTimestamp,
  type ResourceServerSecretState,
} from "./resource-server-utils";

type ResourceServerLocationState = {
  latestSecret?: ResourceServerSecretState;
};

type SessionSnapshot = {
  user_id?: string;
  email?: string;
  tenant_id?: string;
};

const ONBOARDING_STEPS = [
  { id: "register", label: "1. Register" },
  { id: "discover", label: "2. Discover" },
  { id: "access", label: "3. Access" },
  { id: "clients", label: "4. Clients" },
  { id: "validate", label: "5. Validate" },
] as const;

function getSessionSnapshot(): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("authsec_session_v2");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionSnapshot;
  } catch {
    return null;
  }
}

function ValidationStatusPill({ status }: { status?: string }) {
  const normalized = status === "passing" || status === "passed" ? "passed" : status === "failing" ? "failing" : "idle";
  const label = normalized === "passed" ? "PASS" : normalized === "failing" ? "FAIL" : "Not run";
  return <Badge variant={normalized === "passed" ? "default" : "secondary"}>{label}</Badge>;
}

export default function ResourceServerOnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const session = useMemo(() => getSessionSnapshot(), []);
  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [assignEmail, setAssignEmail] = useState("");
  const [validationResult, setValidationResult] = useState<ResourceServerValidationResult | null>(null);
  const [latestSecret, setLatestSecret] = useState<ResourceServerSecretState | null>(null);

  const { data: server, isLoading: isLoadingServer, refetch: refetchServer } = useGetResourceServerQuery(id);
  const { data: accessPolicy, refetch: refetchPolicy } = useGetResourceServerAccessPolicyQuery(id, {
    skip: !id,
  });
  const { data: scopeMatrix, refetch: refetchScopeMatrix } = useGetScopeMatrixQuery(id, {
    skip: !id,
  });
  const { data: adminUsersResponse } = useGetAdminUsersQuery(
    { page: 1, limit: 20, searchQuery: assignEmail.trim() || undefined },
    { skip: !id || assignEmail.trim().length < 2 },
  );

  const [updateAccessPolicy, { isLoading: isSavingPolicy }] = useUpdateResourceServerAccessPolicyMutation();
  const [createBinding, { isLoading: isAssigningBinding }] = useCreateBindingMutation();
  const [rescanResourceServer, { isLoading: isRescanning }] = useRescanResourceServerMutation();
  const [validateResourceServer, { isLoading: isValidating }] = useValidateResourceServerMutation();

  const locationState = (location.state as ResourceServerLocationState | null) ?? null;

  useEffect(() => {
    if (locationState?.latestSecret) {
      setLatestSecret(locationState.latestSecret);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.pathname, location.search, locationState, navigate]);

  useEffect(() => {
    if (!accessPolicy) return;
    setPolicyEnabled(accessPolicy.enabled);
    const recommendedRole = accessPolicy.role_options.find((option) => option.recommended);
    setSelectedRoleId(accessPolicy.default_role_id || recommendedRole?.role_id || accessPolicy.role_options[0]?.role_id || "");
  }, [accessPolicy]);

  const readinessItems = useMemo(() => (server ? buildReadinessItems(server) : []), [server]);

  const derivedValues = useMemo(() => {
    if (!server) return null;
    return {
      mcpEndpointURL: computeMcpEndpointURL(server),
      metadataPath: computeMetadataPath(server.resource_uri),
      metadataURL: computeMetadataURL(server.resource_uri),
      issuerURL: computeOAuthIssuerURL(),
      authorizeURL: computeAuthorizeURL(),
      tokenURL: computeTokenURL(),
      jwksURL: computeJwksURL(),
      introspectionURL: computeIntrospectionURL(),
    };
  }, [server]);

  const validationChecks = validationResult?.checks ?? [];
  const assignableUsers = adminUsersResponse?.users ?? [];
  const matchedUser = assignableUsers.find((user) => user.email?.toLowerCase() === assignEmail.trim().toLowerCase());
  const protectedDiscovery =
    server.status === "degraded" &&
    server.last_scan_status === "success" &&
    Number(scopeMatrix?.total_tools ?? 0) === 0 &&
    Number(scopeMatrix?.unmapped_scopes?.length ?? 0) > 0;

  const handleSavePolicy = async () => {
    if (!server) return;
    try {
      await updateAccessPolicy({
        id: server.id,
        body: {
          enabled: policyEnabled,
          default_role_id: policyEnabled ? selectedRoleId : undefined,
        },
      }).unwrap();
      toast.success("Default access policy saved.");
      refetchPolicy();
      refetchServer();
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to save default access policy.");
    }
  };

  const handleAssignBinding = async (userId?: string) => {
    if (!userId || !selectedRoleId) {
      toast.error("Select a role and a user first.");
      return;
    }

    try {
      await createBinding({
        user_id: userId,
        role_id: selectedRoleId,
        audience: "admin",
      }).unwrap();
      toast.success("Role binding created.");
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to create role binding.");
    }
  };

  const handleRescan = async () => {
    if (!server) return;
    try {
      await rescanResourceServer(server.id).unwrap();
      toast.success("Resource server discovery refreshed.");
      refetchScopeMatrix();
      refetchServer();
      refetchPolicy();
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to rescan resource server.");
    }
  };

  const handleValidate = async () => {
    if (!server) return;
    try {
      const result = await validateResourceServer(server.id).unwrap();
      setValidationResult(result);
      toast.success(result.status === "passed" ? "Validation checks passed." : "Validation finished with follow-up items.");
      refetchServer();
    } catch (error: any) {
      toast.error(error?.data?.error || "Failed to validate resource server.");
    }
  };

  if (isLoadingServer || !server || !derivedValues) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-10xl space-y-4 p-6">
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {isLoadingServer ? "Loading resource server onboarding…" : "Resource server not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-10xl space-y-4 p-6">
        <PageHeader
          title={`${server.name} Onboarding`}
          description="Drive the full MCP protection flow from registration through first-login readiness without leaving the resource-server workspace."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Details
              </Button>
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/sdk`)}>
                <Copy className="mr-2 h-4 w-4" />
                SDK
              </Button>
              <Button onClick={handleValidate} disabled={isValidating}>
                <ListChecks className="mr-2 h-4 w-4" />
                {isValidating ? "Running checks…" : "Run Validation"}
              </Button>
            </div>
          }
        />

        {latestSecret ? <ResourceServerSecretBanner secret={latestSecret} onDismiss={() => setLatestSecret(null)} /> : null}

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Workspace readiness</h2>
              <p className="text-sm text-muted-foreground">
                New users can be granted baseline viewer access automatically on first login. Advanced roles and SCIM/SSO mappings can be layered on later.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {readinessItems.map((item) => (
                <Badge key={item.key} variant={item.ready ? "default" : "secondary"}>
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {ONBOARDING_STEPS.map((step) => (
              <div key={step.id} className="rounded-xl border px-4 py-3 text-sm">
                <div className="font-medium text-foreground">{step.label}</div>
              </div>
            ))}
          </div>
        </TableCard>

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">1. Register</h3>
              <p className="text-sm text-muted-foreground">
                Confirm the protected resource shape and copy the exact OAuth/discovery values immediately after registration.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}`)}>
                Open Details
              </Button>
              <Button variant="outline" onClick={() => refetchServer()}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "MCP endpoint", value: derivedValues.mcpEndpointURL },
              { label: "Metadata path", value: derivedValues.metadataPath },
              { label: "Metadata URL", value: derivedValues.metadataURL },
              { label: "OAuth issuer", value: derivedValues.issuerURL },
              { label: "Authorize URL", value: derivedValues.authorizeURL },
              { label: "Token URL", value: derivedValues.tokenURL },
              { label: "JWKS URL", value: derivedValues.jwksURL },
              { label: "Introspection URL", value: derivedValues.introspectionURL },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <CopyButton text={item.value} label={item.label} variant="outline" showLabel />
                </div>
                <div className="break-all font-mono text-xs text-muted-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </TableCard>

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">2. Discover</h3>
              <p className="text-sm text-muted-foreground">
                Run tool discovery, inspect the current scan state, and keep unresolved scopes visible without dropping to logs or the database.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/resource-servers/${server.id}/scope-matrix`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Scope Matrix
              </Button>
              <Button onClick={handleRescan} disabled={isRescanning}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                {isRescanning ? "Scanning…" : "Rescan"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Server status</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-foreground">
                  {protectedDiscovery ? "protected" : server.status}
                </span>
                {protectedDiscovery ? <Badge variant="secondary">Tool auth needed</Badge> : null}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Last scan</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{server.last_scan_status || "Not run"}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Tools discovered</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{scopeMatrix?.total_tools ?? 0}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Unmapped scopes</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{scopeMatrix?.unmapped_scopes?.length ?? 0}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium text-foreground">Last scan started</div>
              <div className="mt-1 text-sm text-muted-foreground">{formatTimestamp(server.last_scan_started_at)}</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm font-medium text-foreground">Last scan completed</div>
              <div className="mt-1 text-sm text-muted-foreground">{formatTimestamp(server.last_scan_completed_at)}</div>
            </div>
          </div>

          {protectedDiscovery ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              Discovery reached this MCP server and confirmed it is OAuth-protected, but the scanner cannot call
              <code className="mx-1 rounded bg-white/60 px-1 py-0.5 font-mono text-xs dark:bg-black/20">tools/list</code>
              without an AuthSec access token. The listed scopes are advertised by protected-resource metadata; tools will appear after authenticated
              discovery is configured.
            </div>
          ) : null}
        </TableCard>

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">3. Access</h3>
              <p className="text-sm text-muted-foreground">
                Opt into a baseline viewer role for first-time users, or assign a test role immediately without leaving the onboarding flow.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/authz/roles")}>
              <Sparkles className="mr-2 h-4 w-4" />
              Advanced roles
            </Button>
          </div>

          <div className="rounded-xl border p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">Enable baseline access for first-time users</div>
                <div className="text-sm text-muted-foreground">
                  Behavior: only add the configured role if the user does not already have resource-server access through an existing binding.
                </div>
              </div>
              <Switch checked={policyEnabled} onCheckedChange={setPolicyEnabled} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-role-select">Default role</Label>
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId} disabled={!policyEnabled}>
                  <SelectTrigger id="default-role-select">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {accessPolicy?.role_options.map((option) => (
                      <SelectItem key={option.role_id} value={option.role_id}>
                        {option.name}
                        {option.recommended ? " (recommended)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignment trigger</Label>
                <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground">
                  {accessPolicy?.assignment_trigger || "first_successful_login"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSavePolicy} disabled={isSavingPolicy || (policyEnabled && !selectedRoleId)}>
                <ShieldCheck className="mr-2 h-4 w-4" />
                {isSavingPolicy ? "Saving…" : "Save Policy"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAssignBinding(session?.user_id)}
                disabled={isAssigningBinding || !session?.user_id || !selectedRoleId}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Assign current user
              </Button>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">Assign by email</div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="assign-email">Admin email</Label>
                <Input
                  id="assign-email"
                  value={assignEmail}
                  onChange={(event) => setAssignEmail(event.target.value)}
                  placeholder="person@company.com"
                />
                <div className="text-xs text-muted-foreground">
                  {matchedUser ? `Matched ${matchedUser.name || matchedUser.email}` : "Enter an existing admin user email to assign a test role."}
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => handleAssignBinding(matchedUser?.id)}
                  disabled={isAssigningBinding || !matchedUser || !selectedRoleId}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign by email
                </Button>
              </div>
            </div>
          </div>
        </TableCard>

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">4. Clients</h3>
              <p className="text-sm text-muted-foreground">
                Pre-register Claude, Codex, or custom browser clients with the exact redirect expectations for this protected MCP server.
              </p>
            </div>
            <Badge variant="secondary">{server.client_count || 0} registered</Badge>
          </div>
          <ResourceServerClientsPanel server={server} />
        </TableCard>

        <TableCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">5. Validate</h3>
              <p className="text-sm text-muted-foreground">
                Run live checks against the public resource metadata and unauthorized challenge so readiness is visible without dropping to shell commands.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ValidationStatusPill status={validationResult?.status || server.last_validation_status} />
              <span className="text-xs text-muted-foreground">
                Last checked {formatTimestamp(validationResult?.last_validated_at || server.last_validated_at)}
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { label: "MCP endpoint", value: derivedValues.mcpEndpointURL },
              { label: "Metadata URL", value: derivedValues.metadataURL },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border p-4">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-3">
            {validationChecks.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Run validation to capture live MCP readiness checks for metadata, browser login readiness, and tool enforcement prerequisites.
              </div>
            ) : (
              validationChecks.map((check) => (
                <div key={check.key} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{check.label}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{check.message}</div>
                      {check.observed ? (
                        <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{check.observed}</div>
                      ) : null}
                    </div>
                    <ValidationStatusPill status={check.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </TableCard>
      </div>
    </div>
  );
}
