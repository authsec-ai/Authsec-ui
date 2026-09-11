/**
 * The honesty layer for the AWS inventory: the components and the one
 * derivation that stop an empty list from reading as a clean result.
 *
 * This file exists because of two facts about the backend that no response
 * field states directly, and that a naive "no rows → show empty state" would
 * misreport:
 *
 * 1. `coverage` REPORTS THE IAM PHASE ONLY. `POST /connectors/:id/scan`
 *    returns 202 and runs three scanners chained in one goroutine —
 *    AWSIAMScanner, then AWSPermissionScanner, then AWSWorkloadScanner. Only
 *    the first writes `coverage.surfaces` (and only ever the four `iam_*`
 *    keys). The other two return in-process reports the controller discards
 *    apart from logging failures. So `coverage.status === "complete"` means
 *    the IAM phase finished; permissions, compute and usage may still be
 *    running, or may have failed with only the server log knowing. The
 *    controller's own `meta.note` on the scan endpoint admits this for
 *    permissions.
 *
 * 2. A STACK DEPLOYED BEFORE TEMPLATE 2026-09-08 CANNOT DISCOVER COMPUTE.
 *    That version added the `WorkloadReads` statement; PR #52's commit message
 *    calls it "the one change that requires existing customers to redeploy
 *    their stack". Combined with (1) — the workload scanner writing no
 *    coverage — an old stack produces an empty compute list with no reason
 *    attached anywhere in the API response.
 *
 * Both cases converge on the same observable state (zero rows) as a genuinely
 * empty account. Telling them apart is the job of `inventoryEmptyReason` in
 * ./awsInventoryState, whose verdict `InventoryEmptyState` below renders.
 * Every AWS inventory view must route its empty state through that pair rather
 * than rendering a bare "None found".
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Info, Radar, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AWSConnectorAttrs, CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { stackPredatesCompute, TEMPLATE_VERSION_WITH_COMPUTE } from "./awsInventoryLabels";
import type { InventoryEmptyReason, InventorySurface } from "./awsInventoryState";

/* ──────────────────────────── inline notices ────────────────────────────── */

type NoticeTone = "info" | "warning" | "danger";

const NOTICE_CLASS: Record<NoticeTone, string> = {
  info: "border-l-(--color-primary) bg-(--color-info-soft) text-(--color-info-text)",
  warning: "border-l-(--color-warning-text) bg-(--color-warning-soft) text-(--color-warning-text)",
  danger: "border-l-(--color-danger-text) bg-(--color-danger-soft) text-(--color-danger-text)",
};

/** A one-paragraph inline notice. Same visual language as the banners already
 * used in AWSOnboardingWizard and AWSConnectorDrawer. */
export function InventoryNotice({
  tone = "info",
  icon,
  children,
}: {
  tone?: NoticeTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border-l-2 px-3 py-2.5 text-[11.5px] leading-relaxed ${NOTICE_CLASS[tone]}`}
    >
      {icon ? <span className="mt-px flex-none [&_svg]:size-3.5">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ─────────────────────────── the stale stack ────────────────────────────── */

/**
 * Shown wherever compute is displayed, for any connector whose deployed
 * template predates the compute reads.
 *
 * Deliberately does NOT offer a "fix it" action: AuthSec cannot redeploy the
 * customer's stack, and the remedy is a CloudFormation stack update the
 * customer performs in their own account. Saying so is the whole value.
 */
export function StaleStackNotice({ connectors }: { connectors: CloudConnector[] }) {
  const stale = connectors.filter((c) => {
    const attrs = c.attrs as AWSConnectorAttrs | undefined;
    return c.status !== "revoked" && stackPredatesCompute(attrs?.template_version);
  });

  if (!stale.length) return null;

  return (
    <InventoryNotice tone="warning" icon={<AlertTriangle />}>
      <strong className="font-medium">
        {stale.length === 1
          ? "One connected account is on an older CloudFormation stack."
          : `${stale.length} connected accounts are on an older CloudFormation stack.`}
      </strong>{" "}
      {/* Built as one string rather than interleaved JSX expressions: the
          version is conditional and the punctuation after it is not, which in
          JSX leaves a stray space before the comma ("template 2026-09-01 ,"). */}
      {stale.length === 1
        ? `${stale[0].scope_id} deployed template ` +
          `${(stale[0].attrs as AWSConnectorAttrs | undefined)?.template_version ?? "an older version"}, which predates `
        : `${stale.map((c) => c.scope_id).join(", ")} deployed template versions that predate `}
      {TEMPLATE_VERSION_WITH_COMPUTE} and do not grant the Lambda, ECS and EC2 reads compute
      discovery needs. Compute will stay empty for{" "}
      {stale.length === 1 ? "that account" : "those accounts"} until the stack is updated in AWS —
      an empty list here is a missing permission, not an account without compute.
    </InventoryNotice>
  );
}

/* ───────────────────── the unobservable later phases ────────────────────── */

/**
 * Shown on the permissions, compute and usage views whenever they are empty
 * but the IAM phase reports success — the case the API cannot distinguish.
 */
export function PhaseUnobservableNotice({ surface }: { surface: string }) {
  return (
    <InventoryNotice tone="info" icon={<Info />}>
      <strong className="font-medium">The last scan reported the IAM phase only.</strong> {surface}{" "}
      is read afterwards, in the same background run, and reports no progress of its own — so an
      empty list shortly after a scan may still be filling in. Refresh in a minute; if it stays
      empty after that, the account has none, or the read failed and only the server log recorded it.
    </InventoryNotice>
  );
}

/* ───────────────────────────── empty state ─────────────────────────────── */

const SURFACE_NOUN: Record<InventorySurface, string> = {
  identities: "IAM roles or users",
  permissions: "permission statements",
  compute: "compute",
  usage: "service activity",
};

const SURFACE_PHRASE: Record<InventorySurface, string> = {
  identities: "Identity discovery",
  permissions: "Permission extraction",
  compute: "Compute discovery",
  usage: "Service activity",
};

/**
 * The card an inventory view renders instead of a table when it has no rows.
 *
 * Every branch says which of the six situations this is. Only
 * `genuinely_empty` is allowed to assert that the account has none — and it is
 * reachable only for identities, the one surface whose coverage the backend
 * actually reports.
 */
export function InventoryEmptyState({
  reason,
  surface,
  onScan,
  scanning = false,
}: {
  reason: InventoryEmptyReason;
  surface: InventorySurface;
  onScan?: (connectorId: string) => void;
  scanning?: boolean;
}) {
  const noun = SURFACE_NOUN[surface];
  const phrase = SURFACE_PHRASE[surface];

  let title: string;
  let body: string;
  let action: ReactNode = null;
  let icon: ReactNode = <ScanLine />;

  switch (reason.kind) {
    case "no_connectors":
      icon = <Radar />;
      title = "No AWS account connected";
      body =
        "Connect an AWS account from Integrations to discover the IAM identities, permissions and compute in it. AuthSec connects through a read-only role you create and control.";
      action = (
        <Button asChild size="sm" variant="outline">
          <Link to="/iga/integrations">
            Go to Integrations
            <ExternalLink className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      );
      break;

    case "never_scanned":
      title = "Not scanned yet";
      body = `The connection is proven but nothing has been discovered — scanning is a separate step. Run a scan to find ${noun}.`;
      action =
        reason.connectorId && onScan ? (
          <Button size="sm" disabled={scanning} onClick={() => onScan(reason.connectorId!)}>
            {scanning ? "Starting…" : "Scan now"}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link to="/iga/integrations">Scan from Integrations</Link>
          </Button>
        );
      break;

    case "scanning":
      title = "Scan in progress";
      body = `A scan is running now. ${phrase} results appear as they are written, so this list will fill in — it is not empty, it is not finished.`;
      break;

    case "coverage_incomplete":
      icon = <AlertTriangle />;
      title = "The last scan could not read everything";
      body =
        "At least one IAM surface was denied or throttled, so this list is a floor rather than a total. Nothing here means the account has none — it means the scan could not look everywhere. Check the connector's coverage report in Integrations.";
      break;

    case "stale_stack":
      icon = <AlertTriangle />;
      title = "Compute reads are not granted on this stack";
      body = `The connected account's CloudFormation stack predates template ${TEMPLATE_VERSION_WITH_COMPUTE}, which added the Lambda, ECS and EC2 permissions compute discovery needs. Update the stack in AWS and scan again.`;
      break;

    case "phase_unobservable":
      icon = <Info />;
      title = `No ${noun} recorded yet`;
      body = `The last scan reported the IAM phase as complete, but ${phrase.toLowerCase()} runs afterwards and reports no status of its own. This may still be filling in, or the read may have failed without surfacing here. Refresh shortly; if it stays empty, check the connector.`;
      break;

    case "genuinely_empty":
    default:
      title = `No ${noun} found`;
      body =
        "The last scan reached every IAM surface and found none. This is a complete answer, not a missing one.";
      break;
  }

  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* ──────────────────────── standing caveats ─────────────────────────────── */

/** The caveat every identity list carries, in the controller's own words. */
export function CandidateIdentityCaveat() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Candidate identities, not agents — nothing here asserts that an identity belongs to an AI
      agent. Classification is a separate, later step.
    </p>
  );
}

/** The caveat every compute list carries, likewise. */
export function ComputeCaveat() {
  return (
    <p className="text-[11px] text-muted-foreground">
      Compute that <span className="font-medium text-foreground">runs as</span> an identity — a
      Lambda function, ECS task definition, EC2 instance or Bedrock agent. Whether any of it is an
      agent is a separate judgement this inventory does not make.
    </p>
  );
}

/**
 * Shown wherever a view is workspace-wide because the endpoint behind it takes
 * no `connector_id`.
 *
 * `connector_id` is accepted only by `/aws/identities` and `/aws/resources`.
 * Secrets, assume-edges, permissions, workloads and usage take `identity_id`
 * only, so with two accounts connected these views mix both. Filtering
 * client-side is possible but costs a full identity fetch to build the
 * identity→account map, so the honest move for now is to say so.
 */
export function WorkspaceScopeCaveat({ accountCount }: { accountCount: number }) {
  if (accountCount < 2) return null;
  return (
    <InventoryNotice tone="info" icon={<Info />}>
      Showing every connected AWS account ({accountCount}). This view cannot be narrowed to one
      account — the endpoint behind it filters by identity, not by account.
    </InventoryNotice>
  );
}
