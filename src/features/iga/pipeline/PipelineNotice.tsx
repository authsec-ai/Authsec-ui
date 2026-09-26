/**
 * Pipeline and first-run states (SPEC-iga-phase2-graph.md §2.14.7), shown on
 * Agents & workloads, Identities and Resources. Driven by `GET /pipeline`.
 *
 * Scans are serialized per workspace, so "queued" is a real, visible state
 * and is shown as such — which scan is running, which are waiting, since
 * when — never as a spinner that implies progress. A published graph stays
 * on screen while a later scan runs, fails or builds.
 */

import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";

import { refId, type GraphRef, type Pipeline, type PipelineAccount } from "@/app/api/igaGraphApi";
import { useScanAwsConnectorMutation } from "@/app/api/cloudDiscoveryApi";
import { DecisionBanner, StatusBadge, type ConsoleTone } from "@/components/console/status";
import { Button } from "@/components/ui/button";

interface AccountState {
  tone: ConsoleTone;
  label: string;
  detail: string;
  /** Offered when the customer can act: the first scan, or a retry. */
  action?: "scan" | "retry";
}

function ago(iso?: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "";
}

/** `cloud_connector:<uuid>` → the connector id the scan route takes. */
function connectorId(integration: string): string {
  return refId(integration as GraphRef);
}

/** What the graph still holds of an account whose latest attempt did not publish. */
function keptText(a: PipelineAccount): string {
  return a.last_published_rev == null
    ? "Nothing from this account is in the graph yet."
    : "Earlier results are still shown and marked stale where affected.";
}

/** Renders the server's `state` (§2.14.7); the run and projection only add detail. */
function describe(a: PipelineAccount, pipeline: Pipeline): AccountState | null {
  const run = a.latest_run;
  const job = a.projection;
  switch (a.state) {
    case "never_scanned":
      return {
        tone: "neutral",
        label: "Never scanned",
        detail: `${a.label} is connected. Start the first scan.`,
        action: "scan",
      };
    case "queued": {
      const b = pipeline.barrier;
      const behind = run?.waiting_on && b.scan_run === run.waiting_on ? b : null;
      return {
        tone: "neutral",
        label: "Queued",
        detail: behind?.label
          ? behind.started_at
            ? `Queued behind the scan of ${behind.label}, which started ${ago(behind.started_at)}.`
            : `Queued behind the scan of ${behind.label}, which has not started yet.`
          : run?.queued_at
            ? `Queued ${ago(run.queued_at)}.`
            : "Queued.",
      };
    }
    case "collecting":
      return {
        tone: "info",
        label: "Scanning",
        detail: run?.started_at ? `Scanning ${a.label} · started ${ago(run.started_at)}.` : `Scanning ${a.label}.`,
      };
    case "projecting":
      return {
        tone: "info",
        label: "Building the graph",
        detail: job?.retrying
          ? `Building the graph failed on attempt ${job.attempts}${job.last_error ? ` (${job.last_error})` : ""}; trying again.`
          : a.last_published_rev == null
            ? `The first scan of ${a.label} finished. The graph is being built.`
            : "Scan finished. Building the graph…",
      };
    case "first_publication_pending":
      return {
        tone: "neutral",
        label: "Not in the graph yet",
        detail: `${a.label} was scanned, but the graph was not built from that scan. The next scan adds it.`,
        action: "scan",
      };
    case "failed": {
      // Failed collection, or a projection that ran out of attempts.
      const graphFailed = run?.status === "published";
      return {
        tone: "danger",
        label: graphFailed ? "Graph not updated" : run?.status === "abandoned" ? "Scan abandoned" : "Scan failed",
        detail: graphFailed
          ? `The scan finished, but building the graph from it failed${job?.last_error ? ` (${job.last_error})` : ""}. ${keptText(a)}`
          : `${run?.error ? `${run.error}. ` : ""}${keptText(a)}`,
        action: "retry",
      };
    }
    case "collector": {
      const coverage = a.projection?.coverage_state;
      const label = coverage === "stale" ? "Stale" : coverage && coverage !== "unknown" ? coverage.replace(/_/g, " ") : "Unknown";
      return {
        tone: "warning",
        label,
        detail: `${a.label} collector coverage is ${label}. Desired and applied policy are not configured.`,
      };
    }
    case "revoked":
      return {
        tone: "neutral",
        label: "Revoked",
        detail:
          a.last_published_rev == null
            ? "This account's connection was revoked."
            : "This account's connection was revoked. Its last results are kept, and are no longer reconfirmed.",
      };
    case "published":
      return a.connector_status === "error"
        ? {
            tone: "warning",
            label: "Connection error",
            detail: `The graph shows the last scan; ${a.label}'s connection now reports an error.`,
            action: "retry",
          }
        : null;
    default:
      // A state this console does not know: never claim it is fine.
      return { tone: "warning", label: "Unknown state", detail: `${a.label} reported a state this console does not know.` };
  }
}

function AccountAction({ account, kind }: { account: PipelineAccount; kind: "scan" | "retry" }) {
  const [scan, { isLoading }] = useScanAwsConnectorMutation();
  const start = async () => {
    try {
      await scan(connectorId(account.integration)).unwrap();
      toast.success(`Scan of ${account.label} queued`);
    } catch (e) {
      const status = (e as { status?: number }).status;
      toast.error(
        status === 403
          ? "Your role is missing the discovery:admin permission."
          : `Could not start the scan of ${account.label}. Try again, or open it in Integrations.`,
      );
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={() => void start()} disabled={isLoading}>
      {kind === "scan" ? "Scan now" : "Retry scan"}
    </Button>
  );
}

export function PipelineNotice({ pipeline }: { pipeline: Pipeline }) {
  if (pipeline.accounts.length === 0) {
    return (
      <DecisionBanner
        tone="info"
        title="Connect an AWS account"
        body="Connect an AWS account to discover its agents and workloads, the identities they run as, and what those identities are granted."
        actionLabel="Connect AWS"
        actionHref="/iga/integrations"
      />
    );
  }

  const rows = pipeline.accounts.flatMap((a) => {
    const state = describe(a, pipeline);
    return state ? [{ account: a, state }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Scan status"
      className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)"
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {rows.map(({ account, state }) => (
          <li key={account.integration} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
            <span className="font-medium text-(--color-text)">
              {account.label}
              <span className="ml-1 font-mono text-xs text-(--color-text-muted)">{account.account_id}</span>
            </span>
            <span className="min-w-0 flex-1 text-(--color-text-muted)">{state.detail}</span>
            {state.action ? <AccountAction account={account} kind={state.action} /> : null}
            {state.action === "retry" ? (
              <Link
                to={`/iga/integrations?connector=${encodeURIComponent(connectorId(account.integration))}`}
                className="shrink-0 text-sm font-semibold text-(--color-primary-text) hover:underline"
              >
                View details
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
