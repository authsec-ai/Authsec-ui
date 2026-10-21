import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";

import { useAuth } from "@/auth/context/AuthContext";
import { useGetAdminTotpDevicesQuery } from "@/app/api/adminVoiceAgentApi";
import { useListMembersQuery } from "@/app/api/membershipApi";
import { useListMyWorkspacesQuery, useSwitchWorkspaceMutation } from "@/app/api/workspaceApi";
import { switchSessionWorkspace } from "@/auth/switchWorkspace";
import { ConsolePage } from "@/components/console/ConsolePage";
import { DetailGrid, DetailRow } from "@/components/console/detail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SessionManager } from "@/utils/sessionManager";
import { resolveWorkspaceId } from "@/utils/workspace";

function Badge({ tone, children }: { tone: "success" | "warning" | "info" | "muted"; children: string }) {
  return (
    <span className={`badge badge--${tone}`}>
      <span className="bdot" />
      {children}
    </span>
  );
}

const DANGER_OUTLINE =
  "border-[color:color-mix(in_srgb,var(--color-danger)_45%,transparent)] text-(--color-danger-text) hover:bg-(--color-danger-soft) hover:text-(--color-danger-text)";

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: Date) {
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

/** "Chrome on Windows" from this browser's user agent. */
function describeThisDevice(): string {
  if (typeof navigator === "undefined") return "This browser";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Your profile — everything about your own account in one place: details,
 * sign-in security, the workspaces "Switch workspace" opens, and this
 * session. Opened from the menu under your name.
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const workspaceId = resolveWorkspaceId() ?? "";
  const { data: workspaceData, isLoading: workspacesLoading, isError: workspacesError } = useListMyWorkspacesQuery();
  const { data: totp, isLoading: totpLoading, isError: totpError } = useGetAdminTotpDevicesQuery();
  const { data: members } = useListMembersQuery({ workspaceId }, { skip: !workspaceId });
  const [switchWorkspace, { isLoading: switching }] = useSwitchWorkspaceMutation();

  const workspaces = workspaceData?.workspaces ?? [];
  const current = workspaces.find((w) => w.current);
  const displayName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : (user?.email.split("@")[0] ?? "");

  // Your own membership row in this workspace: when you joined, your last sign-in, and whether you're the only owner.
  const membership = useMemo(() => {
    const items = members?.items ?? [];
    const mine = items.find(
      (m) => (user?.id && m.user_id === user.id) || (user?.email && m.user_email?.toLowerCase() === user.email.toLowerCase()),
    );
    const owners = items.filter((m) => m.membership_type === "owner" && m.status === "active");
    return {
      mine,
      onlyOwner: Boolean(mine && mine.membership_type === "owner" && owners.length === 1),
    };
  }, [members?.items, user?.id, user?.email]);

  const memberSince = formatDate(membership.mine?.joined_at ?? membership.mine?.created_at);
  const lastLogin = membership.mine?.user_last_login ? new Date(membership.mine.user_last_login) : null;

  const activeAuthenticators = (totp?.devices ?? []).filter((d) => d.is_active);
  const twoStepOn = activeAuthenticators.length > 0;
  const twoStepOff = !totpLoading && !totpError && !twoStepOn;

  const session = SessionManager.getSession();
  const issuedAt = session?.jwtPayload?.iat ? new Date(session.jwtPayload.iat * 1000) : null;
  const thisDevice = useMemo(describeThisDevice, []);

  const onSwitch = async (id: string) => {
    try {
      const res = await switchWorkspace(id).unwrap();
      switchSessionWorkspace(res.access_token);
    } catch {
      toast.error("Could not switch workspace");
    }
  };

  return (
    <ConsolePage
      title="Your profile"
      description="Your account details, how you sign in, and the workspaces you belong to."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="mb-5 flex items-center gap-4">
              <div
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold text-foreground"
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">{displayName}</h2>
                <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <DetailGrid>
              <DetailRow label="Display name" value={displayName || "—"} />
              <DetailRow label="Email" value={user?.email || "—"} />
              <DetailRow label="Role in this workspace" value={current?.role || "—"} />
              {memberSince ? <DetailRow label="Member since" value={memberSince} /> : null}
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-[length:15px] font-semibold text-foreground">Sign-in and security</h2>
            <DetailGrid>
              <DetailRow
                label="Two-step verification"
                value={
                  totpLoading ? (
                    "Checking…"
                  ) : totpError ? (
                    "Couldn't check"
                  ) : twoStepOn ? (
                    <Badge tone="success">On</Badge>
                  ) : (
                    <Badge tone="warning">Off</Badge>
                  )
                }
              />
              <DetailRow
                label="Authenticator apps"
                value={totpLoading || totpError ? "—" : String(activeAuthenticators.length)}
              />
              {lastLogin && !Number.isNaN(lastLogin.getTime()) ? (
                <DetailRow label="Last sign-in" value={formatDateTime(lastLogin)} />
              ) : null}
            </DetailGrid>
            {twoStepOff ? (
              <>
                {membership.onlyOwner ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-(--color-warning-soft) px-3.5 py-2.5 text-sm text-(--color-warning-text)">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <p className="m-0">
                      <span className="font-semibold">Turn on two-step verification.</span> You're the only owner of
                      this workspace.
                    </p>
                  </div>
                ) : null}
                <Button className="text-white" onClick={() => navigate("/admin/voice-agent")}>
                  Turn on two-step verification
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent variant="flush">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-[length:15px] font-semibold text-foreground">Your workspaces</h2>
            <span className="text-sm text-muted-foreground">Switch workspace opens one of these</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Your role</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspacesLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Loading workspaces…
                  </TableCell>
                </TableRow>
              ) : workspacesError ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Couldn't load your workspaces.
                  </TableCell>
                </TableRow>
              ) : workspaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No workspaces to show.
                  </TableCell>
                </TableRow>
              ) : (
                workspaces.map((w) => (
                  <TableRow key={w.workspace_id}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        {w.name || w.workspace_domain}
                        {w.current ? <Badge tone="info">Current</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[length:12.5px]">{w.workspace_domain}</code>
                    </TableCell>
                    <TableCell>{w.role || "—"}</TableCell>
                    <TableCell>
                      {w.current ? null : (
                        <Button variant="outline" size="sm" disabled={switching} onClick={() => void onSwitch(w.workspace_id)}>
                          Switch
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent variant="flush">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-[length:15px] font-semibold text-foreground">Active sessions</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Signed in</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {thisDevice}
                    <Badge tone="success">This device</Badge>
                  </span>
                </TableCell>
                <TableCell>{issuedAt ? formatDateTime(issuedAt) : "—"}</TableCell>
                <TableCell>Now</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" className={DANGER_OUTLINE} onClick={() => void signOut()}>
                    Sign out
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="m-0 border-t border-(--color-border-subtle) px-5 py-3 text-[length:12.5px] text-muted-foreground">
            AuthSec doesn't list your sessions on other devices yet, so they can't be signed out from here.
          </p>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
