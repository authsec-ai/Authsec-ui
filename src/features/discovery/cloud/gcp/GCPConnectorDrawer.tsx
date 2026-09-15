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

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { RefreshCw, ScanLine, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StatusTone } from "@/components/ui/status-badge";
import { CloudPill } from "../CloudPill";
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
  useScanGcpConnectorMutation,
  useRevokeGcpConnectorMutation,
  type CloudCoverageState,
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
/** The credential the connector holds. Federation is the default and the one
 * with no standing secret; a key is the fallback, and saying "JSON key" plainly
 * is how an operator notices they are carrying one. */
const AUTH_METHOD_LABEL: Record<string, string> = {
  wif: "Workload Identity Federation",
  json_key: "Service-account JSON key",
};

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

/* ─────────────────── Coverage: what a SCAN reached ───────────────────────
 *
 * Distinct from the capability profile above it, and the distinction is the
 * whole reason both are shown. The profile answers "what may this reader
 * read", proved by a permission probe at verify time. Coverage answers "what
 * did the last scan actually read". A reader can be permitted everything and
 * still have scanned nothing.
 *
 * Declared locally rather than shared with the AWS drawer: the two providers
 * name different surfaces, and the label maps are the place that difference
 * belongs. The STATES are shared (`CloudCoverageState`), so the vocabulary a
 * reader learns on one provider carries to the other.
 */

const COVERAGE_TONE: Record<CloudCoverageState, StatusTone> = {
  reached: "success",
  denied: "danger",
  throttled: "warning",
  not_configured: "muted",
  unknown: "muted",
  constrained: "warning",
  stale: "muted",
};

// A total Record, not a ternary chain, so a state nobody thought about cannot
// fall through to wording that asserts something. "unknown" is the one that
// matters most here: GCP writes a skeleton of all thirteen surfaces at
// ONBOARDING, so a freshly connected scope has thirteen surfaces sitting at
// unknown. That must read as "nobody has looked", never as a clean result.
const COVERAGE_LABEL: Record<CloudCoverageState, string> = {
  reached: "Reached",
  denied: "Denied",
  throttled: "Throttled",
  not_configured: "Not configured",
  unknown: "Not checked",
  constrained: "Blocked by policy",
  stale: "Stale",
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
const LIMIT_COPY: Record<GCPCapabilityLimit, { label: string; body: string }> =
  {
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

/** Readiness, as a word a reader recognises.
 *
 * The raw values are lowercase enum strings ("ready", "partial", "blocked").
 * Rendering them verbatim in a pill put an internal identifier beside
 * badges that everywhere else read "Active" / "Error" / "Revoked". */
const READINESS_LABEL: Record<string, string> = {
  ready: "Ready to scan",
  partial: "Partially ready",
  blocked: "Blocked",
};

/** Which of the three onboarding routes created this connector.
 *
 * They differ in what they could configure, and therefore in what a shortfall
 * means — so the value is worth showing, but not as the raw
 * "oauth_default" / "manual_wif" / "manual_key". */
const ONBOARDING_PATH_LABEL: Record<string, string> = {
  oauth_default: "Google Authentication",
  manual_wif: "Workload Identity Federation (manual)",
  manual_key: "Service-account key (manual)",
};

/** How the reader can walk the resource tree below the top scope. */
const ENUMERATION_VIA_LABEL: Record<string, string> = {
  rm_list: "Yes — by listing through Resource Manager",
  cai_search: "Yes — by searching Cloud Asset Inventory",
  both: "Yes — through Resource Manager and Cloud Asset Inventory",
};

/** Why readiness fell short of "ready".
 *
 * These codes are the ARGUMENT for the readiness verdict — the API's own
 * comment says that without them "the verdict is an assertion with no argument,
 * and nobody can act on it". Rendering them as raw codes in a <code> tag meant
 * nobody could act on them either. Unknown codes fall through to the code
 * itself, the same way PROBE_REASON handles it below. */
const READINESS_REASON: Record<string, string> = {
  oauth_project_scope_only:
    "Onboarded through Google Authentication, which can only ever see one project — organization and folder bindings are out of reach for this connector.",
  keyed_credential:
    "Authenticates with a downloaded service-account key rather than federation, so the credential cannot be rotated by AuthSec.",
  quota_project_unusable:
    "The reader cannot use the quota project Cloud Asset calls bill against, so those reads will fail however complete its other permissions are.",
  missing_permissions: "The reader is missing one or more required read permissions.",
  api_not_enabled: "An API a first-phase surface depends on is not enabled on the reader project.",
  vpc_service_controls: "A VPC Service Controls perimeter refuses some reads by design.",
  org_policy_constraint: "An organization policy refuses some reads by design.",
  scope_enumeration_unavailable:
    "Neither listing route is available, so the resources below this scope cannot be walked.",
  scope_enumeration_unknown:
    "Neither listing route could be checked, so whether the tree below this scope is reachable is unknown.",
  never_probed: "This connector has not been probed yet — verify it to find out what the reader can reach.",
};

function readinessReason(code: string): string {
  return READINESS_REASON[code] ?? code;
}

/** Whether the reader can walk below the top scope, in words.
 *
 * "None" and "unknown" are kept apart deliberately: one says no route is
 * available, the other says neither route could be checked. For an org
 * connector those lead to completely different next steps. */
function enumerationLabel(attrs: GCPConnectorAttrs): string {
  const e = attrs.scope_enumeration;
  if (!e) return "Not checked";
  if (e.unknown) return "Unknown — could not check";
  if (e.via === "none") return "No — neither listing route is available";
  return ENUMERATION_VIA_LABEL[e.via] ?? e.via;
}

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
  onClose,
}: {
  connectorId: string | null;
  open: boolean;
  /** RightDrawer's contract is onClose, not onOpenChange — it only ever
   * reports closing. Getting this wrong leaves the panel with no way to shut:
   * the close button, Escape and outside-click all route through it, and a
   * missing handler strands the Sheet open with its overlay swallowing every
   * click on the page behind it. */
  onClose: () => void;
}) {
  // Mirrors the AWS drawer: poll only while a scan is actually running, and
  // hold the flag in state so the connector's own transient status cannot
  // flip polling off between two frames of the same scan.
  const [autoPoll, setAutoPoll] = useState(false);

  const { data: connector, isLoading } = useGetGcpConnectorQuery(
    connectorId ?? "",
    {
      skip: !connectorId,
      pollingInterval: autoPoll ? 4000 : 0,
    },
  );

  useEffect(() => {
    setAutoPoll(connector?.coverage?.status === "running");
  }, [connector?.coverage?.status]);

  const [verify, { isLoading: verifying }] = useVerifyGcpConnectorMutation();
  const [scan, { isLoading: scanStarting }] = useScanGcpConnectorMutation();
  const [revoke, { isLoading: revoking }] = useRevokeGcpConnectorMutation();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const attrs = (connector?.attrs ?? {}) as GCPConnectorAttrs;
  const revoked = connector?.status === "revoked";

  /** Always close the confirmation before the drawer.
   *
   * Radix keeps a `pointer-events: none` guard on <body> while a modal layer
   * is open and removes it as that layer unmounts. Tearing the drawer down
   * while the nested confirmation is still open can unmount both together and
   * leave the guard behind, which locks the entire page — no clicks anywhere,
   * with nothing visibly wrong. Resetting the inner state first keeps the
   * teardown ordered. */
  const handleClose = () => {
    setConfirmRevoke(false);
    onClose();
  };

  const runAction = async (
    action: () => Promise<unknown>,
    ok: string,
    fallback: string,
  ) => {
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

  const coverageSurfaces = connector?.coverage?.surfaces ?? {};
  const coverageKeys = Object.keys(coverageSurfaces);
  // Every surface still at `unknown`. On a connector that has never been
  // scanned that is ALL of them, and the section says so in one sentence
  // rather than making a reader infer it from thirteen identical rows.
  const allUnchecked =
    coverageKeys.length > 0 &&
    coverageKeys.every((k) => coverageSurfaces[k]?.state === "unknown");
  const enablement = attrs.api_enablement ?? {};
  const disabledApis = Object.entries(enablement)
    .filter(([, state]) => state === "not_enabled")
    .map(([api]) => api);
  const unknownApis = Object.entries(enablement)
    .filter(([, state]) => state === "unknown")
    .map(([api]) => api);

  return (
    <>
      <RightDrawer
        open={open}
        onClose={handleClose}
        width={560}
        ariaTitle="Google Cloud connector"
        ariaDescription="Inspect what this connector was proved able to read, and verify or revoke it."
      >
        {isLoading || !connector ? (
          <DrawerEmpty
            title="Loading…"
            description="Fetching this connector."
          />
        ) : (
          <>
            <DrawerHeader
              title={attrs.display_name || connector.scope_id}
              subtitle={`${connector.scope_kind} · ${connector.scope_id}`}
              badge={
                <CloudPill tone={STATUS_TONE[connector.status] ?? "muted"}>
                  {STATUS_LABEL[connector.status] ?? connector.status}
                </CloudPill>
              }
            />

            <DrawerBody>
              {/* Readiness first: it is the one field that answers "can this be
                scanned", and everything below it is the argument for that
                verdict. */}
              <DrawerSection label="Discovery readiness">
                {attrs.discovery_readiness ? (
                  <div className="space-y-2">
                    <CloudPill
                      tone={
                        READINESS_TONE[attrs.discovery_readiness] ?? "muted"
                      }
                    >
                      {READINESS_LABEL[attrs.discovery_readiness] ??
                        attrs.discovery_readiness}
                    </CloudPill>
                    {attrs.discovery_readiness_reasons?.length ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {attrs.discovery_readiness_reasons.map((r) => (
                          <li key={r}>{readinessReason(r)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Every first-phase surface is reachable and the APIs
                        behind them are enabled.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Not assessed yet. Verify this connector to run the
                    permission probe.
                  </p>
                )}
              </DrawerSection>

              {/* Coverage sits directly under readiness because the two are
                the before and after of the same question, and a reader who
                sees only one of them draws the wrong conclusion from it: a
                "Ready" verdict says nothing about whether a scan has run, and
                a scan's silence says nothing about whether it was allowed to
                look. */}
              <DrawerSection label="Scan coverage">
                {coverageKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No coverage recorded. Nothing has scanned this scope yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 pb-1">
                      <span className="text-[11px] text-muted-foreground">
                        {connector.scan_generation === 0
                          ? "Not scanned yet"
                          : `Scan generation ${connector.scan_generation}`}
                      </span>
                      {connector.coverage?.status ? (
                        <CloudPill
                          tone={
                            connector.coverage.status === "complete"
                              ? "success"
                              : connector.coverage.status === "running"
                                ? "info"
                                : "warning"
                          }
                        >
                          {connector.coverage.status === "complete"
                            ? "Complete"
                            : connector.coverage.status === "running"
                              ? "Running"
                              : connector.coverage.status === "partial"
                                ? "Partial"
                                : "Failed"}
                        </CloudPill>
                      ) : null}
                    </div>

                    {coverageKeys.map((key) => {
                      const s = coverageSurfaces[key];
                      const state = (s?.state ?? "unknown") as CloudCoverageState;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-[12.5px] text-foreground">
                            {SURFACE_LABEL[key] ?? key}
                          </span>
                          <div className="flex flex-none items-center gap-2">
                            {/* A count is only a count when the surface was
                              reached. Anywhere else it is a floor, and
                              printing it bare would understate the scope. */}
                            <span className="text-[11px] text-muted-foreground">
                              {state === "reached" ? s.count : `≥ ${s?.count ?? 0}`}
                            </span>
                            <CloudPill tone={COVERAGE_TONE[state]}>
                              {COVERAGE_LABEL[state]}
                            </CloudPill>
                          </div>
                        </div>
                      );
                    })}

                    {allUnchecked ? (
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        Every surface is listed the moment a scope is connected, so this
                        is the full set AuthSec would look at — not a result. Nothing here
                        has been read yet.
                      </p>
                    ) : (
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        Today a GCP scan reads service accounts and their keys. The
                        remaining surfaces stay &ldquo;Not checked&rdquo; because no scan
                        looks at them yet — which is different from finding them empty.
                      </p>
                    )}
                  </div>
                )}
              </DrawerSection>

              {/* A write permission on a read-only reader is the one thing here
                that is a finding rather than a measurement, so it gets its own
                section instead of a line in a table. */}
              {attrs.write_permissions_held?.length ? (
                <DrawerSection label="Write permissions held">
                  <p className="text-sm text-destructive">
                    This reader holds permissions that can change customer
                    state. It is supposed to hold none.
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
                <DrawerSection label="Capability limits">
                  <div className="space-y-3">
                    {attrs.capability_limits.map((limit) => {
                      const copy = LIMIT_COPY[limit];
                      return (
                        <div key={limit}>
                          <div className="text-sm font-medium">
                            {copy?.label ?? limit}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {copy?.body ?? ""}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </DrawerSection>
              ) : null}

              <DrawerSection label="What this reader can reach">
                {surfaceKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Never probed. Verify this connector to find out — nothing
                    here means &ldquo;no access&rdquo;, only that nobody has
                    checked.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {surfaceKeys.map((key) => (
                      <SurfaceRow key={key} surface={key} cap={profile[key]} />
                    ))}
                    {attrs.probed_at ? (
                      <p className="pt-1 text-xs text-muted-foreground">
                        Last checked {relative(attrs.probed_at)}
                        {attrs.role_set_version
                          ? ` · role set ${attrs.role_set_version}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                )}
              </DrawerSection>

              <DrawerSection label="APIs">
                {Object.keys(enablement).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not checked yet.
                  </p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {disabledApis.length === 0 && unknownApis.length === 0 ? (
                      <p className="text-muted-foreground">
                        All {Object.keys(enablement).length} APIs discovery
                        reads are enabled.
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
                            This connector was onboarded with the setup script,
                            which holds no credential that can enable an API.
                            Enable these in the project, or re-onboard with
                            Google Authentication.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {unknownApis.length > 0 ? (
                      <div>
                        <div className="font-medium">Unknown</div>
                        <p className="text-muted-foreground">
                          The reader cannot list services in the quota project,
                          so these could not be checked. Unknown is not the same
                          as off.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </DrawerSection>

              {/* The raw evidence behind every verdict above. Collapsed by
                default because it is long and nobody reads it casually — but
                without it "Ready to scan" is an assertion with no argument,
                and the one question it answers ("does the reader really hold
                X?") is exactly the one asked when a scan behaves oddly. */}
              {attrs.probed_permissions?.length ? (
                <DrawerSection label="Permissions proved">
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-muted-foreground marker:text-muted-foreground">
                      {attrs.probed_permissions.length} permission
                      {attrs.probed_permissions.length === 1 ? "" : "s"} confirmed held
                      {attrs.probed_at ? ` · probed ${relative(attrs.probed_at)}` : ""}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {attrs.probed_permissions.map((p) => (
                        <li key={p}>
                          <code className="text-[11.5px] text-muted-foreground">{p}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <p className="pt-2 text-[11px] text-muted-foreground">
                    Proved by a live permission check, not read from the roles granted —
                    a custom role can carry a permission, and a deny policy can remove one
                    the role appears to give.
                  </p>
                </DrawerSection>
              ) : null}

              <DrawerSection label="Scope">
                <DetailGrid>
                  <DetailRow
                    label="Scope"
                    value={`${connector.scope_kind} ${connector.scope_id}`}
                  />
                  <DetailRow
                    label="Parent"
                    value={connector.parent_scope_id || "None"}
                  />
                  <DetailRow
                    label="Enumerable below"
                    value={enumerationLabel(attrs)}
                  />
                  <DetailRow
                    label="Quota project"
                    value={attrs.cai_quota_project || "—"}
                  />
                </DetailGrid>
              </DrawerSection>

              <DrawerSection label="Credential">
                <DetailGrid>
                  <DetailRow
                    label="Onboarded via"
                    value={
                      attrs.onboarding_path
                        ? ONBOARDING_PATH_LABEL[attrs.onboarding_path] ??
                          attrs.onboarding_path
                        : "—"
                    }
                  />
                  {/* Distinct from "Onboarded via" above it, which records the
                    ROUTE that created this connector. This is the credential
                    it actually holds, and the two can differ: the Google
                    Authentication route provisions an ordinary WIF connector.
                    A keyed credential is also the one that carries a standing
                    secret, so it is worth being able to see at a glance. */}
                  <DetailRow
                    label="Authentication"
                    value={
                      attrs.auth_method
                        ? AUTH_METHOD_LABEL[attrs.auth_method] ?? attrs.auth_method
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Reader project"
                    value={attrs.reader_project_id || "—"}
                  />
                  <DetailRow
                    label="Last verified"
                    value={relative(connector.verified_at)}
                  />
                </DetailGrid>
                {attrs.reader_sa_email ? (
                  <div className="pt-2">
                    <CopyField
                      label="Reader service account"
                      value={attrs.reader_sa_email}
                    />
                  </div>
                ) : null}
                {connector.last_error ? (
                  <p className="pt-2 text-sm text-destructive">
                    {connector.last_error}
                  </p>
                ) : null}
              </DrawerSection>

              {attrs.hints &&
              (attrs.hints.environment ||
                attrs.hints.owning_team ||
                attrs.hints.naming_convention) ? (
                <DrawerSection label="Declared at onboarding">
                  <DetailGrid>
                    <DetailRow
                      label="Environment"
                      value={attrs.hints.environment || "—"}
                    />
                    <DetailRow
                      label="Owning team"
                      value={attrs.hints.owning_team || "—"}
                    />
                    <DetailRow
                      label="Contact"
                      value={attrs.hints.owner_contact || "—"}
                    />
                    <DetailRow
                      label="Naming"
                      value={attrs.hints.naming_convention || "—"}
                    />
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

              {/* Discovery readiness gates this, not just revocation. The
                  backend answers 409 with a `reasons` list when readiness is
                  `blocked`, so offering the button in that state would spend a
                  round trip to be told something the drawer already displays
                  two sections above. `partial` stays enabled: a partial
                  connector can still read something, and finding out what is
                  the point of scanning. */}
              <Button
                variant="outline"
                disabled={
                  scanStarting ||
                  revoked ||
                  attrs.discovery_readiness === "blocked" ||
                  connector.coverage?.status === "running"
                }
                onClick={() =>
                  void runAction(
                    () => scan(connector.id).unwrap(),
                    "Scan started — it runs in the background.",
                    "Could not start the scan.",
                  )
                }
              >
                <ScanLine
                  className={cn(
                    "mr-2 h-4 w-4",
                    connector.coverage?.status === "running" && "animate-pulse",
                  )}
                />
                {connector.coverage?.status === "running"
                  ? "Scanning…"
                  : scanStarting
                    ? "Starting…"
                    : "Scan now"}
              </Button>

              {/* Pushed away from Verify with an auto margin. These two sat
                  flush against each other, which puts a one-way destructive
                  action a few pixels from the routine one an operator clicks
                  most often. `ml-auto` rather than a flex-1 spacer so it still
                  behaves if the footer wraps at a narrow width. */}
              <Button
                variant="destructive"
                className="ml-auto text-white"
                disabled={revoking || revoked}
                onClick={() => setConfirmRevoke(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke
              </Button>
            </DrawerFooter>
          </>
        )}
      </RightDrawer>

      {/* A SIBLING of the drawer, never a child.
          Nesting one Radix modal inside another makes their overlays and
          their pointer-events guards on <body> unmount in an order neither
          controls, which is how a confirmation dialog ends up locking the
          whole page. Rendering them side by side keeps each one's teardown
          its own business. */}
      {connector ? (
        <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke this Google Cloud connection?</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    This marks the connector revoked in AuthSec, so nothing here
                    will read from it again.
                  </p>
                  {/* First and in bold, because this is the part people
                      assume wrongly. Someone who believes revoking cuts
                      access will stop here and leave the reader in place. */}
                  <p className="text-muted-foreground">
                    <strong>
                      AuthSec deletes nothing in your Google Cloud.
                    </strong>{" "}
                    The reader service account, the workload identity pool and
                    its provider all remain in your project. Removing them there
                    is the step that actually ends AuthSec&apos;s access.
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
                  ).then(handleClose);
                }}
              >
                {revoking ? "Revoking…" : "Revoke"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/** One surface's probe result.
 *
 * Three visual states, not two. "Unknown" is deliberately not styled as a
 * failure: the reader may well have the access, and we simply could not ask. */
function SurfaceRow({
  surface,
  cap,
}: {
  surface: string;
  cap?: GCPSurfaceCapability;
}) {
  const label = SURFACE_LABEL[surface] ?? surface;
  if (!cap) return null;

  const tone: StatusTone = cap.unknown
    ? "muted"
    : cap.can
      ? "success"
      : "warning";
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
          <p className="text-xs text-muted-foreground">
            Missing: {cap.missing.join(", ")}
          </p>
        ) : null}
      </div>
      <CloudPill tone={tone}>{text}</CloudPill>
    </div>
  );
}
