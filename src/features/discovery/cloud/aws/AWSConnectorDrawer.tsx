/**
 * AWS connector detail — the "Connector Detail" section of the AWS Cloud
 * Discovery plan: Overview / Identities / Secrets, plus Scan now / Verify
 * connection / Revoke actions.
 *
 * Shape follows `features/connectors/ConnectorDrawer.tsx` (RightDrawer +
 * Tabs + the shared detail.tsx building blocks) — the existing pattern for
 * "a row's full detail in a side panel" elsewhere in the console.
 *
 * AWS-only by construction: GCP has no scan/identities/secrets endpoints at
 * all today (see cloudDiscoveryApi.ts's own header comment), so this drawer
 * is never opened for a GCP row — DiscoveryIntegrationsPage gates that.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Info,
  KeyRound,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";

import {
  useGetAwsConnectorQuery,
  useVerifyAwsConnectorMutation,
  useRevokeAwsConnectorMutation,
  useScanAwsConnectorMutation,
  useListAwsIdentitiesQuery,
  useListAwsSecretsQuery,
  type AWSConnectorAttrs,
  type AWSIdentityAttrs,
  type CloudCoverageState,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import { awsErrorCopy } from "./awsErrorCopy";
import { stackPredatesCompute, TEMPLATE_VERSION_WITH_COMPUTE } from "./awsInventoryLabels";

const STATUS_TONE: Record<string, StatusTone> = { active: "success", error: "danger", revoked: "muted" };
const STATUS_LABEL: Record<string, string> = { active: "Active", error: "Error", revoked: "Revoked" };

// Total by construction: Record<CloudCoverageState, …> forces every state to
// have a tone, so widening the shared union cannot leave a surface rendering
// with an undefined tone.
//
// The last three are states GCP onboarding introduced and the AWS scanner does
// not write today. They are here because the type is shared, and because
// "unknown" is the one a reader is most likely to meet first if AWS ever
// pre-creates a coverage skeleton the way GCP now does — it must read as
// "nobody has looked yet", never as a clean result.
const COVERAGE_TONE: Record<CloudCoverageState, StatusTone> = {
  reached: "success",
  denied: "danger",
  throttled: "warning",
  not_configured: "muted",
  unknown: "muted",
  constrained: "warning",
  stale: "muted",
};

// Also total, and for a sharper reason than the tones. This used to be a
// ternary chain ending in "Not configured", so any state it did not name
// rendered as a definite configuration fact — "unknown" in particular would
// have claimed the surface was switched off when the truth is that nobody has
// looked at it yet. A Record forces every state to be named deliberately.
const COVERAGE_LABEL: Record<CloudCoverageState, string> = {
  reached: "Reached",
  denied: "Denied",
  throttled: "Throttled",
  not_configured: "Not configured",
  unknown: "Not checked",
  constrained: "Blocked by policy",
  stale: "Stale",
};

// The AWS surfaces ticket [1] writes into `cloud_connector.coverage.surfaces`
// (models.SurfaceIAMRoles etc., cloud_discovery.go) — in a form a reader
// recognizes without knowing the internal key.
const COVERAGE_SURFACE_LABEL: Record<string, string> = {
  iam_roles: "IAM roles",
  iam_users: "IAM users",
  iam_access_keys: "Access keys",
  iam_policies: "Policies (managed & inline)",
};

const IDENTITY_KIND_LABEL: Record<string, string> = { iam_role: "IAM role", iam_user: "IAM user" };

function relativeOrUnknown(iso: string | null | undefined): string {
  // nil means UNKNOWN, never "never used" — CloudIdentity/CloudSecret's own
  // comment in models/cloud_discovery.go. Never upgrade an absence into a
  // more confident claim than the data supports.
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Unknown";
}

function CoverageRow({ surfaceKey, state, count }: { surfaceKey: string; state: CloudCoverageState; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-[12.5px] text-foreground">{COVERAGE_SURFACE_LABEL[surfaceKey] ?? surfaceKey}</span>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {state === "reached" ? count : `≥ ${count}`}
        </span>
        <StatusBadge tone={COVERAGE_TONE[state]}>{COVERAGE_LABEL[state]}</StatusBadge>
      </div>
    </div>
  );
}

export function AWSConnectorDrawer({
  connectorId,
  onClose,
  onRevoked,
}: {
  connectorId: string | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [tab, setTab] = useState("overview");
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  // Once true, stays true until this component instance is torn down —
  // avoids the connector's own transient `coverage.status` flipping back to
  // "running" on the very next scan reading as if the button reset itself.
  const [autoPoll, setAutoPoll] = useState(false);

  const open = !!connectorId;

  const { data: connector, isLoading } = useGetAwsConnectorQuery(connectorId ?? "", {
    skip: !connectorId,
    pollingInterval: autoPoll ? 4000 : 0,
  });

  useEffect(() => {
    setAutoPoll(connector?.coverage?.status === "running");
  }, [connector?.coverage?.status]);

  const { data: identities, isLoading: identitiesLoading } = useListAwsIdentitiesQuery(
    { connector_id: connectorId ?? undefined },
    { skip: !connectorId },
  );
  const { data: secretsAll, isLoading: secretsLoading } = useListAwsSecretsQuery(undefined, {
    skip: !connectorId || tab !== "secrets",
  });

  const identityIds = useMemo(() => new Set((identities ?? []).map((i) => i.id)), [identities]);
  const connectorSecrets = useMemo(
    () => (secretsAll ?? []).filter((s) => identityIds.has(s.identity_id)),
    [secretsAll, identityIds],
  );

  const [verifyConnector, { isLoading: verifying }] = useVerifyAwsConnectorMutation();
  const [scanConnector, { isLoading: scanStarting }] = useScanAwsConnectorMutation();
  const [revokeConnector, { isLoading: revoking }] = useRevokeAwsConnectorMutation();

  const handleClose = () => {
    setTab("overview");
    setConfirmRevokeOpen(false);
    onClose();
  };

  const runOrToast = async (
    action: () => Promise<unknown>,
    successMessage: string,
    failFallback: string,
  ) => {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
      const copy = awsErrorCopy(apiErr, failFallback);
      toast.error(`${copy.title}. ${copy.body}`);
    }
  };

  const handleVerify = () =>
    void runOrToast(
      () => verifyConnector(connector!.id).unwrap(),
      "Connection verified.",
      "Could not verify the connection.",
    );

  const handleScan = () =>
    void runOrToast(
      () => scanConnector(connector!.id).unwrap(),
      "Scan started — it runs in the background.",
      "Could not start the scan.",
    );

  const handleRevoke = async () => {
    if (!connector) return;
    await runOrToast(
      () => revokeConnector(connector.id).unwrap(),
      "AWS connector revoked. Everything already discovered is kept, for audit.",
      "Could not revoke the connector.",
    );
    setConfirmRevokeOpen(false);
    handleClose();
    onRevoked();
  };

  const attrs = connector?.attrs as AWSConnectorAttrs | undefined;
  const surfaces = connector?.coverage?.surfaces ?? {};
  const surfaceEntries = Object.entries(surfaces);
  // A denied/throttled IAM surface means an empty identities/secrets list is
  // a floor, not a total — never let that read as "found nothing".
  const iamIncomplete = ["iam_roles", "iam_users"].some((k) => surfaces[k] && surfaces[k].state !== "reached");
  const keysIncomplete = surfaces["iam_access_keys"] && surfaces["iam_access_keys"].state !== "reached";
  // A stack older than 2026-09-08 grants no compute reads at all. Because the
  // workload scanner writes no coverage of its own, that shortfall is
  // invisible in the report above — it surfaces only as compute never
  // appearing, which is why it has to be said here.
  const staleStack = stackPredatesCompute(attrs?.template_version);
  const scanned = (connector?.scan_generation ?? 0) > 0;

  return (
    <>
      <RightDrawer
        open={open}
        onClose={handleClose}
        width={560}
        ariaTitle={connector ? `AWS account ${connector.scope_id}` : "AWS connector"}
        ariaDescription="AWS connector overview, discovered identities, secrets, and actions."
      >
        {isLoading || !connector ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <DrawerHeader
              title={<span className="font-mono">{connector.scope_id}</span>}
              subtitle={attrs?.display_name ? attrs.display_name : "AWS account"}
              badge={<StatusBadge tone={STATUS_TONE[connector.status]}>{STATUS_LABEL[connector.status]}</StatusBadge>}
            />

            <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col gap-0 overflow-hidden">
              <div className="border-b px-6 pt-3">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="identities">Identities</TabsTrigger>
                  <TabsTrigger value="secrets">Secrets</TabsTrigger>
                </TabsList>
              </div>

              <DrawerBody>
                <TabsContent value="overview" className="space-y-6">
                  {connector.status === "error" && connector.last_error ? (
                    <div className="rounded-md bg-(--color-danger-soft) px-3 py-2.5 text-[11.5px] text-(--color-danger-text)">
                      {connector.last_error}
                    </div>
                  ) : null}

                  {staleStack ? (
                    <div className="flex items-start gap-2 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-[11.5px] leading-relaxed text-(--color-warning-text)">
                      <AlertTriangle className="mt-px size-3.5 flex-none" aria-hidden />
                      <div>
                        <strong className="font-medium">This stack predates compute discovery.</strong>{" "}
                        The deployed template is {attrs?.template_version}; version{" "}
                        {TEMPLATE_VERSION_WITH_COMPUTE} added the Lambda, ECS and EC2 reads. Until
                        this account's CloudFormation stack is updated in AWS, compute will stay
                        empty for it — an absence caused by a missing permission, not by an account
                        without compute. Everything else on this connector is unaffected.
                      </div>
                    </div>
                  ) : null}

                  <DrawerSection label="Connection">
                    <DetailGrid>
                      <CopyField label="Role ARN" value={attrs?.role_arn ?? ""} />
                      <DetailRow label="Partition" value={attrs?.partition ?? "—"} />
                      <DetailRow label="Regions" value={attrs?.regions?.join(", ") ?? "—"} />
                      <DetailRow
                        label="Template version"
                        value={
                          attrs?.template_version ? (
                            <span className="flex items-center gap-1.5">
                              {attrs.template_version}
                              {staleStack ? (
                                <StatusBadge tone="warning" dot={false}>
                                  Outdated
                                </StatusBadge>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )
                        }
                      />
                      <DetailRow
                        label="Last verified"
                        value={connector.verified_at ? relativeOrUnknown(connector.verified_at) : "Never proven"}
                      />
                      <DetailRow label="Caller identity" value={attrs?.caller_arn ?? "—"} mono />
                    </DetailGrid>
                  </DrawerSection>

                  <DrawerSection label="Scan coverage">
                    {connector.scan_generation === 0 || surfaceEntries.length === 0 ? (
                      <DrawerEmpty
                        icon={<ScanLine />}
                        title="Not scanned yet"
                        description="Run a scan to discover IAM roles, users, access keys and policies in this account."
                        action={
                          <Button size="sm" onClick={handleScan} disabled={scanStarting}>
                            {scanStarting ? "Starting…" : "Scan now"}
                          </Button>
                        }
                      />
                    ) : (
                      <div className="space-y-1.5">
                        {surfaceEntries.map(([key, s]) => (
                          <CoverageRow key={key} surfaceKey={key} state={s.state} count={s.count} />
                        ))}
                        {connector.coverage.status === "partial" ? (
                          <p className="text-[11px] text-(--color-warning-text)">
                            Partial — at least one surface was denied or throttled. Counts above are
                            a floor, not a total.
                          </p>
                        ) : null}
                        {/* The report above covers the IAM phase and nothing
                            else. The scan chains a permission pass and then a
                            compute/activity pass after it, in the same
                            background run, and neither writes into this blob —
                            so "complete" here does not mean those finished.
                            Without saying so, a reader watching this reach
                            complete and then finding no permissions would
                            reasonably conclude the account has none. */}
                        <p className="flex items-start gap-1.5 pt-1 text-[11px] text-muted-foreground">
                          <Info className="mt-px size-3.5 flex-none" aria-hidden />
                          Covers the IAM phase only. Permissions, compute and service activity are
                          read afterwards in the same background run and report no status of their
                          own — see the inventory for what they found.
                        </p>
                      </div>
                    )}
                  </DrawerSection>

                  {/* The connector answers "is this connection healthy". What
                      it discovered lives in the inventory, which needs table
                      width this 560px panel does not have. Link out rather
                      than duplicate it here. */}
                  {scanned ? (
                    <DrawerSection label="Discovered in this account">
                      <div className="grid gap-1.5">
                        <Button asChild variant="outline" size="sm" className="justify-between">
                          <Link to={`/iga/cloud/aws/identities?account=${connector.id}`}>
                            <span className="flex items-center gap-1.5">
                              <Users className="size-3.5" />
                              Identities, permissions and activity
                            </span>
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="justify-between">
                          <Link to="/iga/cloud/aws/compute">
                            <span className="flex items-center gap-1.5">
                              <Boxes className="size-3.5" />
                              Compute running as these identities
                            </span>
                            <ArrowRight className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Compute is listed across every connected account — that endpoint filters by
                        identity, not by account.
                      </p>
                    </DrawerSection>
                  ) : null}
                </TabsContent>

                <TabsContent value="identities" className="space-y-4">
                  <p className="text-[11px] text-muted-foreground">
                    Candidate identities, not agents — nothing here asserts that an identity belongs
                    to an AI agent.
                  </p>
                  {iamIncomplete ? (
                    <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-[11.5px] text-(--color-warning-text)">
                      The IAM surface was not fully reached on the last scan — this list may be
                      incomplete, not empty.
                    </p>
                  ) : null}
                  {identitiesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !identities?.length ? (
                    <DrawerEmpty
                      icon={<Users />}
                      title={connector.scan_generation === 0 ? "Not scanned yet" : "No identities returned"}
                      description={
                        connector.scan_generation === 0
                          ? "Run a scan from the Overview tab to discover IAM roles and users."
                          : undefined
                      }
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {identities.map((identity) => {
                        const iAttrs = identity.attrs as AWSIdentityAttrs;
                        return (
                          <div key={identity.id} className="rounded-md border px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[12.5px] font-medium text-foreground">
                                {identity.name || identity.native_id}
                              </span>
                              <span className="flex-none rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                                {IDENTITY_KIND_LABEL[identity.kind] ?? identity.kind}
                              </span>
                            </div>
                            <p className="truncate font-mono text-[10.5px] text-muted-foreground" title={identity.native_id}>
                              {identity.native_id}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Last used {relativeOrUnknown(identity.last_used_at)}
                              {iAttrs?.has_trust_policy ? " · has a trust policy" : ""}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="secrets" className="space-y-4">
                  <p className="text-[11px] text-muted-foreground">
                    Key identifiers and dates only — no secret value is ever read or stored.
                  </p>
                  {keysIncomplete ? (
                    <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-[11.5px] text-(--color-warning-text)">
                      Access keys were not fully reached on the last scan — this list may be
                      incomplete, not empty.
                    </p>
                  ) : null}
                  {secretsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !connectorSecrets.length ? (
                    <DrawerEmpty
                      icon={<KeyRound />}
                      title={connector.scan_generation === 0 ? "Not scanned yet" : "No access keys found"}
                    />
                  ) : (
                    <div className="space-y-1.5">
                      {connectorSecrets.map((secret) => (
                        <div key={secret.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[11.5px] text-foreground">{secret.native_id}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Created {relativeOrUnknown(secret.created_at)} · last used{" "}
                              {relativeOrUnknown(secret.last_used_at)}
                            </p>
                          </div>
                          <StatusBadge tone={secret.status === "active" ? "success" : "muted"}>
                            {secret.status === "active" ? "Active" : "Inactive"}
                          </StatusBadge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </DrawerBody>
            </Tabs>

            <DrawerFooter>
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={verifying || connector.status === "revoked"}>
                <ShieldCheck className={cn("mr-1.5 size-3.5", verifying && "animate-pulse")} />
                {verifying ? "Verifying…" : "Verify connection"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={scanStarting || connector.status === "revoked" || connector.coverage?.status === "running"}
              >
                <RefreshCw className={cn("mr-1.5 size-3.5", scanStarting && "animate-spin")} />
                {connector.coverage?.status === "running" ? "Scanning…" : "Scan now"}
              </Button>
              <div className="flex-1" />
              <Button
                variant="outline"
                className="text-(--color-danger-text)"
                onClick={() => setConfirmRevokeOpen(true)}
                disabled={connector.status === "revoked"}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Revoke
              </Button>
            </DrawerFooter>
          </>
        )}
      </RightDrawer>

      <Dialog open={confirmRevokeOpen} onOpenChange={setConfirmRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this AWS connection?</DialogTitle>
            <DialogDescription>
              This purges the stored ExternalId so AuthSec can no longer assume the role. Everything
              already discovered — identities, access keys, permissions — is kept, unchanged, for
              audit; it is not deleted. The IAM role itself still exists in your AWS account until
              you delete the CloudFormation stack yourself. Re-onboarding the same account later
              reactivates this same connector rather than creating a duplicate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setConfirmRevokeOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleRevoke()} disabled={revoking}>
              <Trash2 className="mr-1.5 size-3.5" />
              {revoking ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
