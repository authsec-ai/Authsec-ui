/**
 * GCP connector detail.
 *
 * The AWS drawer shows what a connector has DISCOVERED — identities, secrets,
 * scan results. GCP has no discovery endpoints yet, so this one shows
 * something different and, until discovery lands, more useful: what the
 * connector was PROVED able to reach.
 *
 * Onboarding runs a live per-surface permission probe and records the result
 * on the connector, so every panel here is evidence rather than configuration.
 * The distinction runs through the whole file: a surface the reader provably
 * cannot read and a surface we could not check are shown differently
 * everywhere, because collapsing them turns "we could not look" into "there is
 * nothing there".
 *
 * There is no separate probe action. Verify re-runs the probe, which is also
 * how a role granted out of band gets picked up.
 */

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import {
  DrawerHeader,
  DrawerBody,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
  DrawerEmpty,
  DrawerFooter,
} from "@/components/console/detail";

import {
  useGetGcpConnectorQuery,
  useVerifyGcpConnectorMutation,
  useRevokeGcpConnectorMutation,
  type GCPCapabilityLimit,
  type GCPConnectorAttrs,
  type GCPSurfaceCapability,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import { gcpErrorCopy } from "./gcpErrorCopy";

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  error: "danger",
  revoked: "muted",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  error: "Error",
  revoked: "Revoked",
};

const READINESS_TONE: Record<string, StatusTone> = {
  ready: "success",
  partial: "warning",
  blocked: "danger",
};

/** Human labels for the probe's surface keys. A raw key like
 * "allow_bindings" is meaningful to whoever wrote the scanner and to nobody
 * else. */
const SURFACE_LABEL: Record<string, string> = {
  identities: "Service accounts",
  keys: "Service-account keys",
  allow_bindings: "IAM allow bindings",
  roles: "Role definitions",
  deny: "Deny policies",
  pab: "Principal Access Boundary",
  resource_iam: "Resources",
  workloads: "Workload hosts",
  agents: "Agent runtimes",
  registry: "Agent Registry",
  logs: "Audit logs",
  audit_configs: "Audit configuration",
  apis: "API enablement",
};

/** Why a probe could not answer, in words. These are the backend's sanitized
 * reason codes; showing them raw would leak an internal vocabulary into the
 * console. */
const PROBE_REASON: Record<string, string> = {
  permission_not_applicable_at_this_scope:
    "This permission does not apply at this scope kind, so the check could not run. Not evidence about access.",
  permission_check_denied: "The permission check itself was refused.",
  vpc_service_controls: "A VPC Service Controls perimeter refused the check.",
  org_policy_constraint: "An organization policy refused the check.",
  scope_not_found: "The scope could not be found.",
  throttled: "Google throttled the check.",
  permission_check_failed: "The check did not complete.",
};

/** Capability limits are permanent boundaries, not failures — each needs to
 * explain itself or it reads as a bug. */
const LIMIT_COPY: Record<GCPCapabilityLimit, { label: string; body: string }> = {
  oauth_project_scope_only: {
    label: "Project scope only",
    body:
      "Onboarded with Google Authentication, which can only offer projects — Google's project search " +
      "does not return organizations or folders. Nothing above this project was ever in scope, so an " +
      "empty result higher up means it was never looked at.",
  },
  keyed_credential: {
    label: "Legacy key credential",
    body:
      "Authenticates with a stored service-account key rather than federation. No new connector can be " +
      "created this way. Re-onboard this scope to move it onto workload identity federation.",
  },
  quota_project_unusable: {
    label: "Quota project unusable",
    body:
      "The reader cannot use the quota project that Cloud Asset calls bill against, so those reads will " +
      "fail however complete its other permissions are. Usually the reader project sits outside the " +
      "onboarded scope and the role grants there do not reach it.",
  },
};

function relative(iso?: string | null): string {
  if (!iso) return "Never";
  try {
    return `${formatDistanceToNow(new Date(iso))} ago`;
  } catch {
    return iso;
  }
}

export function GCPConnectorDrawer({
  connectorId,
  open,
  onOpenChange,
}: {
  connectorId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: connector, isLoading } = useGetGcpConnectorQuery(connectorId ?? "", {
    skip: !connectorId,
  });
  const [verify, { isLoading: verifying }] = useVerifyGcpConnectorMutation();
  const [revoke, { isLoading: revoking }] = useRevokeGcpConnectorMutation();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const attrs = (connector?.attrs ?? {}) as GCPConnectorAttrs;
  const revoked = connector?.status === "revoked";

  const runAction = async (action: () => Promise<unknown>, ok: string, fallback: string) => {
    try {
      await action();
      toast.success(ok);
    } catch (err) {
      const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
      const copy = gcpErrorCopy(apiErr, fallback);
      toast.error(`${copy.title}. ${copy.body}`);
    }
  };

  const profile = attrs.capability_profile ?? {};
  const surfaceKeys = Object.keys(profile);
  const enablement = attrs.api_enablement ?? {};
  const disabledApis = Object.entries(enablement)
    .filter(([, state]) => state === "not_enabled")
    .map(([api]) => api);
  const unknownApis = Object.entries(enablement)
    .filter(([, state]) => state === "unknown")
    .map(([api]) => api);

  return (
    <RightDrawer
      open={open}
      onOpenChange={onOpenChange}
      ariaTitle="Google Cloud connector"
      ariaDescription="Inspect what this connector was proved able to read, and verify or revoke it."
    >
      {isLoading || !connector ? (
        <DrawerEmpty title="Loading…" description="Fetching this connector." />
      ) : (
        <>
          <DrawerHeader
            title={attrs.display_name || connector.scope_id}
            subtitle={`${connector.scope_kind} · ${connector.scope_id}`}
            badge={
              <StatusBadge tone={STATUS_TONE[connector.status] ?? "muted"}>
                {STATUS_LABEL[connector.status] ?? connector.status}
              </StatusBadge>
            }
          />

          <DrawerBody>
            {/* Readiness first: it is the one field that answers "can this be
                scanned", and everything below it is the argument for that
                verdict. */}
            <DrawerSection title="Discovery readiness">
              {attrs.discovery_readiness ? (
                <div className="space-y-2">
                  <StatusBadge tone={READINESS_TONE[attrs.discovery_readiness] ?? "muted"}>
                    {attrs.discovery_readiness}
                  </StatusBadge>
                  {attrs.discovery_readiness_reasons?.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {attrs.discovery_readiness_reasons.map((r) => (
                        <li key={r}>
                          <code>{r}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Every first-phase surface is reachable and the APIs behind them are enabled.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not assessed yet. Verify this connector to run the permission probe.
                </p>
              )}
            </DrawerSection>

            {/* A write permission on a read-only reader is the one thing here
                that is a finding rather than a measurement, so it gets its own
                section instead of a line in a table. */}
            {attrs.write_permissions_held?.length ? (
              <DrawerSection title="Write permissions held">
                <p className="text-sm text-destructive">
                  This reader holds permissions that can change customer state. It is supposed to
                  hold none.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {attrs.write_permissions_held.map((p) => (
                    <li key={p}>
                      <code>{p}</code>
                    </li>
                  ))}
                </ul>
              </DrawerSection>
            ) : null}

            {attrs.capability_limits?.length ? (
              <DrawerSection title="Capability limits">
                <div className="space-y-3">
                  {attrs.capability_limits.map((limit) => {
                    const copy = LIMIT_COPY[limit];
                    return (
                      <div key={limit}>
                        <div className="text-sm font-medium">{copy?.label ?? limit}</div>
                        <p className="text-sm text-muted-foreground">{copy?.body ?? ""}</p>
                      </div>
                    );
                  })}
                </div>
              </DrawerSection>
            ) : null}

            <DrawerSection title="What this reader can reach">
              {surfaceKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Never probed. Verify this connector to find out — nothing here means &ldquo;no
                  access&rdquo;, only that nobody has checked.
                </p>
              ) : (
                <div className="space-y-2">
                  {surfaceKeys.map((key) => (
                    <SurfaceRow key={key} surface={key} cap={profile[key]} />
                  ))}
                  {attrs.probed_at ? (
                    <p className="pt-1 text-xs text-muted-foreground">
                      Last checked {relative(attrs.probed_at)}
                      {attrs.role_set_version ? ` · role set ${attrs.role_set_version}` : ""}
                    </p>
                  ) : null}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="APIs">
              {Object.keys(enablement).length === 0 ? (
                <p className="text-sm text-muted-foreground">Not checked yet.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {disabledApis.length === 0 && unknownApis.length === 0 ? (
                    <p className="text-muted-foreground">
                      All {Object.keys(enablement).length} APIs discovery reads are enabled.
                    </p>
                  ) : null}
                  {disabledApis.length > 0 ? (
                    <div>
                      <div className="font-medium">Not enabled</div>
                      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                        {disabledApis.map((a) => (
                          <li key={a}>
                            <code>{a}</code>
                          </li>
                        ))}
                      </ul>
                      {attrs.api_enablement_repaired === false ? (
                        <p className="pt-1 text-xs text-muted-foreground">
                          This connector was onboarded with the setup script, which holds no
                          credential that can enable an API. Enable these in the project, or
                          re-onboard with Google Authentication.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {unknownApis.length > 0 ? (
                    <div>
                      <div className="font-medium">Unknown</div>
                      <p className="text-muted-foreground">
                        The reader cannot list services in the quota project, so these could not be
                        checked. Unknown is not the same as off.
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="Scope">
              <DetailGrid>
                <DetailRow label="Scope">{`${connector.scope_kind} ${connector.scope_id}`}</DetailRow>
                <DetailRow label="Parent">{connector.parent_scope_id || "None"}</DetailRow>
                <DetailRow label="Enumerable below">
                  {attrs.scope_enumeration
                    ? attrs.scope_enumeration.unknown
                      ? "Unknown — could not check"
                      : attrs.scope_enumeration.via === "none"
                        ? "No — neither listing route is available"
                        : attrs.scope_enumeration.via
                    : "Not checked"}
                </DetailRow>
                <DetailRow label="Quota project">{attrs.cai_quota_project || "—"}</DetailRow>
              </DetailGrid>
            </DrawerSection>

            <DrawerSection title="Credential">
              <DetailGrid>
                <DetailRow label="Onboarded via">{attrs.onboarding_path ?? "—"}</DetailRow>
                <DetailRow label="Reader project">{attrs.reader_project_id || "—"}</DetailRow>
                <DetailRow label="Last verified">{relative(connector.verified_at)}</DetailRow>
              </DetailGrid>
              {attrs.reader_sa_email ? (
                <div className="pt-2">
                  <CopyField label="Reader service account" value={attrs.reader_sa_email} />
                </div>
              ) : null}
              {connector.last_error ? (
                <p className="pt-2 text-sm text-destructive">{connector.last_error}</p>
              ) : null}
            </DrawerSection>

            {attrs.hints &&
            (attrs.hints.environment || attrs.hints.owning_team || attrs.hints.naming_convention) ? (
              <DrawerSection title="Declared at onboarding">
                <DetailGrid>
                  <DetailRow label="Environment">{attrs.hints.environment || "—"}</DetailRow>
                  <DetailRow label="Owning team">{attrs.hints.owning_team || "—"}</DetailRow>
                  <DetailRow label="Contact">{attrs.hints.owner_contact || "—"}</DetailRow>
                  <DetailRow label="Naming">{attrs.hints.naming_convention || "—"}</DetailRow>
                </DetailGrid>
              </DrawerSection>
            ) : null}
          </DrawerBody>

          <DrawerFooter>
            <Button
              variant="outline"
              disabled={verifying || revoked}
              onClick={() =>
                void runAction(
                  () => verify(connector.id).unwrap(),
                  "Connection verified and permissions re-checked.",
                  "Could not verify the connection.",
                )
              }
            >
              {verifying ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {verifying ? "Verifying…" : "Verify connection"}
            </Button>
            <Button
              variant="destructive"
              className="text-white"
              disabled={revoking || revoked}
              onClick={() => setConfirmRevoke(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Revoke
            </Button>
          </DrawerFooter>

          <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Revoke this Google Cloud connection?</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      This marks the connector revoked in AuthSec, so nothing here will read from it
                      again.
                    </p>
                    {/* First and in bold, because this is the part people
                        assume wrongly. Someone who believes revoking cuts
                        access will stop here and leave the reader in place. */}
                    <p className="text-muted-foreground">
                      <strong>AuthSec deletes nothing in your Google Cloud.</strong> The reader
                      service account, the workload identity pool and its provider all remain in
                      your project. Removing them there is the step that actually ends
                      AuthSec&apos;s access.
                    </p>
                    <p className="text-muted-foreground">
                      Everything already discovered is kept, unchanged, for audit.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmRevoke(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="text-white"
                  disabled={revoking}
                  onClick={() => {
                    void runAction(
                      () => revoke(connector.id).unwrap(),
                      "Connector revoked. Remove the reader service account and pool in Google Cloud to fully end access.",
                      "Could not revoke the connector.",
                    ).then(() => {
                      setConfirmRevoke(false);
                      onOpenChange(false);
                    });
                  }}
                >
                  {revoking ? "Revoking…" : "Revoke"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </RightDrawer>
  );
}

/** One surface's probe result.
 *
 * Three visual states, not two. "Unknown" is deliberately not styled as a
 * failure: the reader may well have the access, and we simply could not ask. */
function SurfaceRow({ surface, cap }: { surface: string; cap?: GCPSurfaceCapability }) {
  const label = SURFACE_LABEL[surface] ?? surface;
  if (!cap) return null;

  const tone: StatusTone = cap.unknown ? "muted" : cap.can ? "success" : "warning";
  const text = cap.unknown ? "Unknown" : cap.can ? "Readable" : "Not readable";

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {cap.unknown && cap.reason ? (
          <p className="text-xs text-muted-foreground">
            {PROBE_REASON[cap.reason] ?? cap.reason}
          </p>
        ) : null}
        {!cap.unknown && cap.missing?.length ? (
          <p className="text-xs text-muted-foreground">Missing: {cap.missing.join(", ")}</p>
        ) : null}
      </div>
      <StatusBadge tone={tone}>{text}</StatusBadge>
    </div>
  );
}
