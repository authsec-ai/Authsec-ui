/**
 * Connect AWS — AWS onboarding wizard.
 *
 * Built strictly against the live AWS onboarding contract (verified against
 * `controllers/platform/cloud_aws_controller.go`, `services/cloud_aws_onboarding.go`
 * and `internal/awsdiscovery/{onboarding,permissions}.go` directly): GET
 * /aws/onboarding, POST /aws/connectors. Shape follows
 * `../gcp/GCPOnboardingWizard.tsx` — the existing in-Dialog step-wizard
 * pattern (local STEPS array, numbered step rail, per-step conditional
 * blocks, Back/Continue footer) — adapted to what AWS onboarding actually
 * asks for, which is a different two-step shape than GCP's:
 *
 *  - GCP asks the customer to run a script and paste back one derived value.
 *  - AWS asks the customer to deploy a CloudFormation template (downloaded,
 *    not run inline) and paste back what the STACK produced: a role ARN.
 *
 * The one rule this screen must never violate (the plan's own words): "if
 * the customer leaves this screen and comes back, calling /onboarding again
 * mints a different ExternalId. Whatever value they display must be the one
 * they hold onto." `fetchedOnceRef` guarantees GET /aws/onboarding is called
 * exactly once per dialog *open* — moving between steps, or opening the
 * permissions/hard-denies disclosures, never re-fetches and never re-mints.
 *
 * Error copy switches on the backend's own `fault` field
 * (mapAWSOnboardingError in cloud_aws_controller.go always attaches one of
 * "customer_account" | "aws" | "authsec" for the three sentinel AWS errors;
 * a plain caller-input rejection — bad ARN, bad region, external id not
 * issued to this workspace — carries no fault and is shown as written) —
 * never an invented cause the backend doesn't assert.
 *
 * Never exposes: nothing here can, by construction — this wizard never
 * receives an AWS credential at all, only a role ARN and region list.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, ShieldOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CopyField } from "@/components/console/detail";

import {
  useLazyGetAwsOnboardingPackageQuery,
  useCreateAwsConnectorMutation,
  useScanAwsConnectorMutation,
  type AWSPermission,
  type CloudConnector,
  type AWSConnectorAttrs,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import { awsErrorCopy } from "./awsErrorCopy";

const STEPS = ["Review & connect", "Confirm the role", "Connected"] as const;

// A curated, common subset — not AWS's full region list. The plan is explicit
// that scan cost scales with regions × services, so the picker defaults to
// one region rather than "select all"; the operator can widen it later by
// re-onboarding with a wider list. Region validity itself is a shape check
// server-side (internal/awsdiscovery.ValidateRegion), not this allow-list, so
// a region missing here is a display gap, never a hard block.
const AWS_REGIONS: { value: string; label: string }[] = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "eu-west-2", label: "Europe (London)" },
  { value: "eu-west-3", label: "Europe (Paris)" },
  { value: "eu-central-1", label: "Europe (Frankfurt)" },
  { value: "eu-north-1", label: "Europe (Stockholm)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

// internal/awsdiscovery.Permission.Surface, in a form a security reviewer
// reads without knowing AuthSec's internal names for things. Falls back to
// the raw surface string for anything not in this table, so a future surface
// added server-side never silently disappears from the console.
const SURFACE_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  iam: "IAM identities & policies",
  "bedrock-agents": "Bedrock Agents",
  "bedrock-agentcore": "Bedrock AgentCore",
  eks: "EKS / Kubernetes identity",
  cloudtrail: "CloudTrail activity",
  "secret-values": "Secret & parameter values",
  decryption: "Decryption keys",
  "role-chaining": "Assuming further roles",
};

function surfaceLabel(surface: string): string {
  return SURFACE_LABEL[surface] ?? surface;
}

function downloadTemplate(template: string, version: string) {
  const blob = new Blob([template], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `authsec-aws-discovery-role-${version}.yaml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PermissionRow({ perm }: { perm: AWSPermission }) {
  return (
    <div className="space-y-1.5 rounded-md border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-foreground">{surfaceLabel(perm.surface)}</span>
        {perm.possibly_redundant_with_baseline ? (
          <StatusBadge tone="muted" dot={false}>
            May overlap baseline
          </StatusBadge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {perm.actions.map((a) => (
          <span key={a} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            {a}
          </span>
        ))}
      </div>
      <p className="text-[11.5px] text-muted-foreground">{perm.why}</p>
    </div>
  );
}

function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {label}
      </button>
      {open ? <div className="space-y-1.5">{children}</div> : null}
    </div>
  );
}

export function AWSOnboardingWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);

  const [fetchPackage, packageResult] = useLazyGetAwsOnboardingPackageQuery();
  // Guarantees GET /aws/onboarding fires exactly once per dialog *open* — see
  // the file header. Reset only when the dialog actually closes, never on a
  // step change within the same open session.
  const fetchedOnceRef = useRef(false);
  useEffect(() => {
    if (open && !fetchedOnceRef.current) {
      fetchedOnceRef.current = true;
      void fetchPackage();
    }
    if (!open) fetchedOnceRef.current = false;
  }, [open, fetchPackage]);

  const pkg = packageResult.data?.configured ? packageResult.data.data : undefined;

  // Step 1 — Confirm the role
  const [roleArn, setRoleArn] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [regions, setRegions] = useState<string[]>(["us-east-1"]);

  const [createConnector, { isLoading: connecting }] = useCreateAwsConnectorMutation();
  const [submitError, setSubmitError] = useState<CloudOnboardingApiError | null>(null);
  const [connected, setConnected] = useState<CloudConnector | null>(null);

  const [scanConnector, { isLoading: scanning }] = useScanAwsConnectorMutation();
  const [scanStarted, setScanStarted] = useState(false);

  const reset = () => {
    setStep(0);
    setRoleArn("");
    setDisplayName("");
    setRegions(["us-east-1"]);
    setSubmitError(null);
    setConnected(null);
    setScanStarted(false);
  };

  const stepValid = [
    Boolean(pkg) && !packageResult.isFetching,
    roleArn.trim().length > 0 && regions.length > 0,
    true,
  ][step];

  const submit = async () => {
    if (!pkg) return;
    setSubmitError(null);
    try {
      const connector = await createConnector({
        role_arn: roleArn.trim(),
        external_id: pkg.external_id,
        regions,
        display_name: displayName.trim() || undefined,
      }).unwrap();
      setConnected(connector);
      onCreated();
      setStep(2);
    } catch (err) {
      const raw = err as { data?: CloudOnboardingApiError; status?: unknown };
      // RTK Query aborts the fetch client-side on timeout (TIMEOUT_ERROR) —
      // there is no response body, so there is nothing to read a fault from.
      // Mark it explicitly so the copy says "inconclusive, check the list"
      // instead of falling back to a generic failure.
      if (raw?.status === "TIMEOUT_ERROR") {
        setSubmitError({
          error: "The connection check timed out.",
          hint: "AuthSec was still verifying the role when the request timed out, so nothing was proven either way. " +
            "Check the connectors list — the connection may have completed — and try again if nothing appears.",
          timeout: true,
        });
        return;
      }
      const apiErr = raw?.data;
      setSubmitError(apiErr ?? { error: "Could not connect to AWS." });
    }
  };

  const connectedAttrs = connected?.attrs as AWSConnectorAttrs | undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect AWS</DialogTitle>
          <DialogDescription>
            AuthSec connects to your AWS account through a read-only IAM role you create and
            control. AuthSec never receives an access key — only temporary credentials from an
            sts:AssumeRole call your own trust policy gates.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-1.5 py-1 text-[11px]">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className={
                  i === step
                    ? "flex size-5 items-center justify-center rounded-full bg-(--color-primary) text-[10px] font-semibold text-white"
                    : i < step
                      ? "flex size-5 items-center justify-center rounded-full bg-(--color-success-soft) text-[10px] font-semibold text-(--color-success-text)"
                      : "flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                }
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
              {i < STEPS.length - 1 ? <span className="text-muted-foreground">›</span> : null}
            </li>
          ))}
        </ol>

        <div className="space-y-4 py-2">
          {/* 1 — Review & connect */}
          {step === 0 ? (
            <>
              {packageResult.isFetching ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Preparing your onboarding package…
                </p>
              ) : packageResult.isError ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                  Could not load onboarding instructions.{" "}
                  <button className="underline" onClick={() => void fetchPackage()}>
                    Retry
                  </button>
                </div>
              ) : packageResult.data && !packageResult.data.configured ? (
                <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                  <strong className="font-medium">AWS discovery isn't configured on this deployment.</strong>{" "}
                  {packageResult.data.error ??
                    "This AuthSec deployment has no AWS discovery principal configured."}{" "}
                  This is a deployment configuration problem, not something to fix in your own AWS
                  account.
                </div>
              ) : pkg ? (
                <>
                  <div className="rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
                    <strong className="font-medium">This ExternalId is shown once.</strong> Hold
                    onto the exact value below and paste it into your CloudFormation stack.
                    Leaving this screen and reopening it mints a different one, which will not
                    match a stack you already deployed.
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <CopyField label="ExternalId — paste into the stack parameters" value={pkg.external_id} />
                    <CopyField label="AuthSec principal (already in the template)" value={pkg.authsec_principal_arn} />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadTemplate(pkg.template, pkg.template_version)}
                  >
                    <Download className="mr-1.5 size-4" />
                    Download CloudFormation template
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Deploy it yourself in your AWS console (CloudFormation → Create stack → Upload
                    a template file), using the ExternalId and principal above as the stack's
                    parameters. It creates one IAM role and nothing else — nothing is installed in
                    your account.
                  </p>

                  <Disclosure label="View permissions this role grants">
                    <div className="rounded-md border p-2.5 text-[12.5px]">
                      <span className="font-medium text-foreground">Baseline: </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {pkg.baseline_managed_policy}
                      </span>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        AWS-managed, read-only metadata access. Does not include reading secret
                        values, parameter values, or decryption keys.
                      </p>
                    </div>
                    {pkg.additional_permissions.map((perm) => (
                      <PermissionRow key={perm.surface} perm={perm} />
                    ))}
                  </Disclosure>

                  <Disclosure label="What AuthSec is explicitly denied">
                    <div className="space-y-1.5">
                      {pkg.hard_denies.map((perm) => (
                        <div key={perm.surface} className="space-y-1 rounded-md border border-dashed p-2.5">
                          <div className="flex items-center gap-1.5">
                            <ShieldOff className="size-3.5 text-muted-foreground" />
                            <span className="text-[12.5px] font-medium text-foreground">
                              {surfaceLabel(perm.surface)}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {perm.actions.map((a) => (
                              <span
                                key={a}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                          <p className="text-[11.5px] text-muted-foreground">{perm.why}</p>
                        </div>
                      ))}
                    </div>
                  </Disclosure>
                </>
              ) : null}
            </>
          ) : null}

          {/* 2 — Confirm the role */}
          {step === 1 && pkg ? (
            <>
              <CopyField label="ExternalId (from step 1 — unchanged)" value={pkg.external_id} />

              <div className="space-y-2">
                <Label htmlFor="aws-role-arn">Role ARN from the deployed stack's output</Label>
                <Input
                  id="aws-role-arn"
                  value={roleArn}
                  onChange={(e) => setRoleArn(e.target.value)}
                  placeholder="arn:aws:iam::123456789012:role/AuthSecCloudDiscovery"
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aws-display-name">Display name (optional)</Label>
                <Input
                  id="aws-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Production AWS account"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="aws-regions">Regions in scope</Label>
                <SearchableSelect
                  multiple
                  options={AWS_REGIONS}
                  value={regions}
                  onChange={setRegions}
                  placeholder="Select at least one region"
                  searchPlaceholder="Search regions…"
                />
                <p className="text-xs text-muted-foreground">
                  Scan cost scales with regions × services — start small and widen later by
                  re-onboarding with a wider list.
                </p>
              </div>

              {submitError ? (
                <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2.5 text-xs">
                  {(() => {
                    const copy = awsErrorCopy(submitError, "Something went wrong connecting the account.");
                    return (
                      <>
                        <strong className="font-medium">{copy.title}.</strong> {copy.body}
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {connecting ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Assuming the role and verifying identity — this can take a few seconds.
                </p>
              ) : null}
            </>
          ) : null}

          {/* 3 — Connected */}
          {step === 2 && connected ? (
            <div className="space-y-3">
              <div className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
                AWS account connected.
              </div>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd className="font-mono">{connected.scope_id}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Regions</dt>
                  <dd className="font-mono">{connectedAttrs?.regions?.join(", ")}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                The connection is proven, but nothing has been discovered yet — IAM identity
                discovery is a separate step.
              </p>
              {scanStarted ? (
                <p className="text-xs text-(--color-success-text)">
                  Scan started — it runs in the background. Track progress from this account's row
                  in the connectors list.
                </p>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={scanning}
                  onClick={() =>
                    void scanConnector(connected.id)
                      .unwrap()
                      .then(() => setScanStarted(true))
                  }
                >
                  {scanning ? "Starting scan…" : "Scan now — discover IAM identities"}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
            disabled={step === 2}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 1 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!stepValid}
              onClick={() => setStep(1)}
            >
              I've deployed the stack — continue
            </Button>
          ) : step === 1 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!stepValid || connecting}
              onClick={() => void submit()}
            >
              {connecting ? "Connecting…" : "Connect account"}
            </Button>
          ) : (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              <Check className="mr-1.5 size-4" />
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
