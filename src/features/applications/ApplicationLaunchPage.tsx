import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { cn } from "@/lib/utils";
import {
  useActivateResourceServerMutation,
  useGetActivationPreviewQuery,
  useGetDriftEventsQuery,
  useGetSetupChecklistQuery,
  useListRSBindingsQuery,
} from "@/app/api/setupWizardApi";
import { useGetScopeMatrixQuery } from "@/app/api/scopeMatrixApi";
import { useListConnectionsQuery } from "@/app/api/agentIdentityApi";
import { Button } from "@/components/ui/button";

import {
  DecisionBanner,
  StatusBadge,
  Surface,
} from "./components/ApplicationConsole";
import { useApplicationContext } from "./useApplicationContext";
import { isLaunched } from "./lib/computeReadiness";
import { isAgentConnection, toolLevel } from "./lib/mcpSignals";
import {
  ServerOverviewSummary,
  type ToolLevelCounts,
} from "./components/ServerOverviewSummary";
import { DeleteApplicationDialog } from "./components/DeleteApplicationDialog";

/**
 * Overview — one MCP at a glance.
 *
 * Layout: count cards + "Agents with access" (ServerOverviewSummary) → the
 * state banner (the only launch CTA on the page) → launch gates → "Settings"
 * (links to the setup sub-pages, and Delete). Before the MCP is enforcing,
 * every gate is listed; once it is, only gates that still need a look are.
 * Every number is backend-sourced; the "Activate" checklist step is
 * deliberately not rendered as a gate — activation is the banner's action,
 * not a defect to fix.
 */

type GateTone = "ok" | "warn" | "danger" | "task";

interface GateRow {
  key: string;
  tone: GateTone;
  title: string;
  detail: string;
  to: string;
  linkLabel: string;
  advisory?: boolean;
}

export default function ApplicationLaunchPage() {
  const { application } = useApplicationContext();
  const navigate = useNavigate();
  const launched = isLaunched(application);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: checklist,
    isLoading: checklistLoading,
    isError: checklistError,
  } = useGetSetupChecklistQuery(application.id);
  const { data: preview } = useGetActivationPreviewQuery(application.id);
  const { data: matrix } = useGetScopeMatrixQuery(application.id);
  const { data: bindingsData } = useListRSBindingsQuery(application.id);
  const { data: drift } = useGetDriftEventsQuery(application.id, {
    skip: !launched,
  });
  const { data: connectionsData } = useListConnectionsQuery(application.id);
  const [activate, { isLoading: activating }] =
    useActivateResourceServerMutation();

  const canActivate = checklist?.can_activate ?? false;
  const publicTools = preview?.tools.public ?? 0;
  const unmappedTools = preview?.tools.unmapped ?? 0;
  const mappedTools = preview?.tools.mapped ?? 0;
  const totalTools = preview?.tools.total ?? matrix?.tools.length ?? 0;
  const scopeCount = matrix?.scopes?.length ?? 0;
  const viewerScopeCount = preview?.viewer_scopes?.length ?? 0;
  const driftCount = drift?.events.length ?? 0;
  const boundUsers = new Set(
    (bindingsData?.bindings ?? []).map((b) => b.user_id),
  ).size;
  // Approved connections made by agents (machine credentials are listed on Access).
  const agents = useMemo(
    () => connectionsData?.items.filter(isAgentConnection),
    [connectionsData],
  );

  // Read / Write / Admin from each tool's runtime-effective scopes.
  const toolLevels = useMemo<ToolLevelCounts | undefined>(() => {
    if (!matrix) return undefined;
    const counts: ToolLevelCounts = { total: 0, read: 0, write: 0, admin: 0, public: 0, none: 0 };
    for (const tool of matrix.tools) {
      counts.total += 1;
      if (tool.is_public) {
        counts.public += 1;
        continue;
      }
      const level = toolLevel(
        tool.scopes.filter((s) => s.source === "admin_override").map((s) => s.scope_string),
      );
      if (level) counts[level] += 1;
      else counts.none += 1;
    }
    return counts;
  }, [matrix]);

  const highRisk = useMemo(() => {
    const hits: { tool: string; scope: string; risk: string }[] = [];
    for (const tool of matrix?.tools ?? []) {
      // sdk_suggested mappings are advisory-only, not runtime-effective.
      const scope = tool.scopes.find(
        (s) =>
          s.source !== "sdk_suggested" &&
          (s.risk_level === "high" || s.risk_level === "critical"),
      );
      if (scope) {
        hits.push({
          tool: tool.name,
          scope: scope.scope_string,
          risk: scope.risk_level,
        });
      }
    }
    return hits;
  }, [matrix?.tools]);

  const gates = useMemo<GateRow[]>(() => {
    if (!checklist) return [];
    const stepComplete = (step: number) =>
      checklist.steps.find((s) => s.step === step)?.complete ?? false;
    const base = `/applications/${application.id}`;
    const host = application.resource_uri?.replace(/^https?:\/\//, "") ?? "";
    const rows: GateRow[] = [];

    // Endpoint protection — from the last protection check, not the checklist.
    if (application.last_validation_status === "passed") {
      rows.push({
        key: "protection",
        tone: "ok",
        title: "Protection check passing",
        detail: `SDK verified on ${host}${
          application.last_validated_at
            ? ` · checked ${new Date(application.last_validated_at).toLocaleDateString()}`
            : ""
        }`,
        to: `${base}/setup`,
        linkLabel: "Setup",
      });
    } else if (
      application.last_validation_status === "failed" ||
      application.last_validation_status === "failing"
    ) {
      // Failing protection doesn't gate activation on the backend — surface
      // it as a loud advisory, not a launch blocker.
      rows.push({
        key: "protection",
        tone: "warn",
        advisory: true,
        title: "Protection check failing",
        detail:
          application.last_validation_error ??
          "The last protection check failed. Re-run it after your next deploy.",
        to: `${base}/setup`,
        linkLabel: "Open setup",
      });
    } else {
      rows.push({
        key: "protection",
        tone: "task",
        title: "Protection not verified",
        detail: "Run a protection check to confirm the SDK is responding.",
        to: `${base}/setup`,
        linkLabel: "Open setup",
      });
    }

    // Tool inventory (checklist step 2).
    rows.push(
      stepComplete(2)
        ? {
            key: "tools",
            tone: "ok",
            title: "Tools discovered",
            detail: `${totalTools} tool${totalTools === 1 ? "" : "s"} in the manifest`,
            to: `${base}/tools`,
            linkLabel: "Tools",
          }
        : {
            key: "tools",
            tone: "danger",
            title: "No tools discovered yet",
            detail: "Connect the SDK or run a scan so AuthSec can inventory this server.",
            to: `${base}/tools`,
            linkLabel: "Open tools",
          },
    );

    // Scope registry (checklist step 3).
    rows.push(
      stepComplete(3)
        ? {
            key: "scopes",
            tone: "ok",
            title: "Scopes defined",
            detail: `${scopeCount} scope${scopeCount === 1 ? "" : "s"} registered for this MCP`,
            to: `${base}/scopes`,
            linkLabel: "Scopes",
          }
        : {
            key: "scopes",
            tone: "danger",
            title: "No scopes defined yet",
            detail: "Register at least one scope so tools can be gated.",
            to: `${base}/scopes`,
            linkLabel: "Open scopes",
          },
    );

    // Tool ↔ scope mapping (checklist step 4).
    rows.push(
      stepComplete(4)
        ? {
            key: "mapping",
            tone: "ok",
            title: "Every tool mapped to a scope",
            detail: `${mappedTools} of ${totalTools} mapped · ${unmappedTools} denied · ${publicTools} public`,
            to: `${base}/tools`,
            linkLabel: "Tools",
          }
        : {
            key: "mapping",
            tone: "danger",
            title:
              unmappedTools > 0
                ? `${unmappedTools} tool${unmappedTools === 1 ? "" : "s"} not mapped`
                : "Tools not mapped yet",
            detail: "Unmapped tools are denied by default until an operator assigns a scope.",
            to: `${base}/tools`,
            linkLabel: "Open tools",
          },
    );

    // Default role (checklist step 5).
    rows.push(
      stepComplete(5)
        ? {
            key: "default-role",
            tone: "ok",
            title: "Default role grants access",
            detail: `Viewer grants ${viewerScopeCount} scope${viewerScopeCount === 1 ? "" : "s"} to first-time users`,
            to: `${base}/access`,
            linkLabel: "Access",
          }
        : {
            key: "default-role",
            tone: "danger",
            title: "Default role has no scopes",
            detail: "First-time users get no access until the default role grants at least one scope.",
            to: `${base}/access`,
            linkLabel: "Open access",
          },
    );

    // Advisories — launch is allowed, but these deserve a look first.
    if (publicTools > 0) {
      rows.push({
        key: "public-tools",
        tone: "warn",
        advisory: true,
        title: `${publicTools} public tool${publicTools === 1 ? "" : "s"}`,
        detail:
          "Public tools bypass scope checks for any authenticated token with this MCP audience.",
        to: `${base}/tools`,
        linkLabel: "Review tools",
      });
    }
    if (highRisk.length > 0) {
      const first = highRisk[0];
      const more = highRisk.length - 1;
      rows.push({
        key: "high-risk",
        tone: "warn",
        advisory: true,
        title:
          highRisk.length === 1
            ? "A high-risk scope is granted"
            : `${highRisk.length} tools map high-risk scopes`,
        detail: `${first.tool} maps ${first.scope} (${first.risk})${
          more > 0 ? ` and ${more} more` : ""
        }. Review who holds it before launch.`,
        to: `${base}/access`,
        linkLabel: "Review access",
      });
    }

    // Drift after launch; the flow-test reminder before it.
    if (launched) {
      if (driftCount > 0) {
        rows.push({
          key: "drift",
          tone: "warn",
          advisory: true,
          title: `${driftCount} drift event${driftCount === 1 ? "" : "s"} since launch`,
          detail:
            "New, changed, or removed tools should be reviewed before operators trust the current policy.",
          to: `${base}/activity`,
          linkLabel: "Review drift",
        });
      }
    } else {
      rows.push({
        key: "flow-test",
        tone: "task",
        title: "Run the flow test",
        detail: "Run the live OAuth test before trusting the launch state.",
        to: `${base}/test`,
        linkLabel: "Run test",
      });
    }

    return rows;
  }, [
    application.id,
    application.last_validated_at,
    application.last_validation_error,
    application.last_validation_status,
    application.resource_uri,
    checklist,
    driftCount,
    highRisk,
    launched,
    mappedTools,
    publicTools,
    scopeCount,
    totalTools,
    unmappedTools,
    viewerScopeCount,
  ]);

  const failingGates = gates.filter((g) => g.tone === "danger");
  const advisoryCount = gates.filter((g) => g.advisory).length;
  // Once enforcing, list only the gates that still need a look.
  const visibleGates = launched
    ? gates.filter((g) => g.tone === "danger" || g.advisory)
    : gates;

  const handleLaunch = async () => {
    if (!canActivate || launched) return;
    try {
      await activate(application.id).unwrap();
      toast.success("MCP is enforcing. Runtime policy is active.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Launch failed. Resolve blockers and retry.");
    }
  };

  const banner = (() => {
    if (!checklist) return null;
    if (launched) {
      if (driftCount > 0) {
        return (
          <DecisionBanner
            tone="warning"
            title={`${driftCount} drift event${driftCount === 1 ? "" : "s"} since launch`}
            body="New, changed, or removed tools should be reviewed before operators trust the current policy."
            actionLabel="Review drift"
            actionHref={`/applications/${application.id}/activity`}
          />
        );
      }
      const openItems = failingGates.length + advisoryCount;
      if (openItems > 0) {
        return (
          <DecisionBanner
            tone="warning"
            title={`Enforcing — ${openItems} item${openItems === 1 ? "" : "s"} worth reviewing`}
            body="Runtime policy is active. Review the flagged items below."
          />
        );
      }
      // Enforcing and nothing to review: the count cards say enough.
      return null;
    }
    if (canActivate) {
      return (
        <DecisionBanner
          tone="success"
          title="Ready to launch"
          body={
            advisoryCount > 0
              ? `All launch gates passed · ${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"} worth a look before you publish`
              : "All launch gates passed. Publish the current tool, scope, role, and client policy."
          }
          actionLabel={activating ? "Starting…" : "Start enforcing"}
          onAction={handleLaunch}
          actionDisabled={activating}
          secondaryLabel="Run pre-launch test"
          secondaryHref={`/applications/${application.id}/test`}
        />
      );
    }
    const firstFailing = failingGates[0];
    return (
      <DecisionBanner
        tone="danger"
        title={`${failingGates.length} launch gate${failingGates.length === 1 ? "" : "s"} failing`}
        body="Resolve the gates below, then launch from here."
        actionLabel={firstFailing?.linkLabel ?? "Open setup"}
        actionHref={firstFailing?.to ?? `/applications/${application.id}/setup`}
      />
    );
  })();

  const base = `/applications/${application.id}`;
  const settingsLinks: Array<{ label: string; detail: string; to: string }> = [
    { label: "Setup", detail: "SDK install and protection check", to: `${base}/setup` },
    { label: "Tools", detail: "Give each tool a permission", to: `${base}/tools` },
    { label: "Scopes", detail: "The permissions tools are gated by", to: `${base}/scopes` },
    { label: "Test sign-in", detail: "Run the live OAuth test", to: `${base}/test` },
  ];

  return (
    <div data-cr className="space-y-4">
      <ServerOverviewSummary
        applicationId={application.id}
        tools={toolLevels}
        agents={agents}
        usersWithAccess={bindingsData ? boundUsers : undefined}
      />

      {banner}

      {checklistLoading && !checklist ? (
        <Surface>
          <div className="flex items-center gap-2 px-5 py-4 text-[length:13.5px] text-(--color-text-muted)">
            <Loader2 className="size-4 animate-spin" />
            Reading MCP posture…
          </div>
        </Surface>
      ) : checklistError && !checklist ? (
        <Surface>
          <div className="px-5 py-4 text-[length:13.5px] text-(--color-danger-text)">
            Couldn't load the launch checklist. Reload the page to retry.
          </div>
        </Surface>
      ) : visibleGates.length > 0 ? (
        <Surface>
          <div className="px-5 pb-3 pt-4">
            <h2 className="sec-title">{launched ? "Worth a look" : "Launch gates"}</h2>
            <p className="mt-0.5 text-[length:13.5px] text-(--color-text-muted)">
              {launched
                ? "This MCP is enforcing. These items still deserve a review."
                : "Everything AuthSec checks before this MCP can start enforcing."}
            </p>
          </div>
          <div className="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle)">
            {visibleGates.map((gate) => (
              <LaunchGateRow key={gate.key} gate={gate} />
            ))}
          </div>
        </Surface>
      ) : null}

      <Surface>
        <div className="px-5 pb-3 pt-4">
          <h2 className="sec-title">Settings</h2>
        </div>
        <div className="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle)">
          {settingsLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-4 px-5 py-3 hover:bg-(--color-hover)"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[length:14px] font-semibold text-(--color-text)">{link.label}</div>
                <div className="text-[length:13px] text-(--color-text-muted)">{link.detail}</div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-(--color-text-muted)" />
            </Link>
          ))}
          <div className="flex flex-wrap items-center gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[length:14px] font-semibold text-(--color-text)">Delete this MCP</div>
              <div className="text-[length:13px] text-(--color-text-muted)">
                Removes its scopes, tools, access policy and credentials. Agents lose access
                immediately.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1.5 size-4" /> Delete MCP
            </Button>
          </div>
        </div>
      </Surface>

      <DeleteApplicationDialog
        application={application}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate("/applications")}
      />
    </div>
  );
}

const gateIcon: Record<GateTone, string> = {
  ok: "bg-(--color-success-soft) text-(--color-success-text)",
  warn: "bg-(--color-warning-soft) text-(--color-warning-text)",
  danger: "bg-(--color-danger-soft) text-(--color-danger-text)",
  task: "border border-dashed border-(--color-border-strong) text-(--color-text-subtle)",
};

function LaunchGateRow({ gate }: { gate: GateRow }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
          gateIcon[gate.tone],
        )}
      >
        {gate.tone === "ok" ? (
          <Check className="size-4" />
        ) : gate.tone === "task" ? (
          <span className="size-2 rounded-full border border-dashed border-current" />
        ) : gate.tone === "danger" ? (
          <AlertCircle className="size-4" />
        ) : (
          <AlertTriangle className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-(--color-text)">{gate.title}</h4>
          {gate.advisory ? (
            <StatusBadge tone="warning">Advisory — doesn't block launch</StatusBadge>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm leading-5 text-(--color-text-muted)">{gate.detail}</p>
      </div>
      <Link
        to={gate.to}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-(--color-primary-text) hover:underline"
      >
        {gate.linkLabel}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
