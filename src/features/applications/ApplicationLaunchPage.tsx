import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TableCard } from "@/theme/components/cards";
import {
  useActivateResourceServerMutation,
  useGetActivationPreviewQuery,
  useGetDriftEventsQuery,
  useGetSetupChecklistQuery,
} from "@/app/api/setupWizardApi";
import { useGetScopeMatrixQuery } from "@/app/api/scopeMatrixApi";

import { useApplicationContext } from "./useApplicationContext";
import { isLaunched } from "./lib/computeReadiness";

type QueueTone = "ok" | "warn" | "danger" | "info";

interface ActionQueueItem {
  key: string;
  title: string;
  body: string;
  href: string;
  action: string;
  tone: QueueTone;
}

const toneClass: Record<QueueTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export default function ApplicationLaunchPage() {
  const { application } = useApplicationContext();
  const navigate = useNavigate();
  const launched = isLaunched(application);

  const { data: checklist, isLoading: checklistLoading } =
    useGetSetupChecklistQuery(application.id);
  const { data: preview, isLoading: previewLoading } =
    useGetActivationPreviewQuery(application.id);
  const { data: matrix } = useGetScopeMatrixQuery(application.id);
  const { data: drift } = useGetDriftEventsQuery(application.id, {
    skip: !launched,
  });
  const [activate, { isLoading: activating }] =
    useActivateResourceServerMutation();

  const firstFailing = checklist?.steps.find((step) => !step.complete);
  const canActivate = checklist?.can_activate ?? false;
  const publicTools = preview?.tools.public ?? 0;
  const unmappedTools = preview?.tools.unmapped ?? 0;
  const mappedTools = preview?.tools.mapped ?? 0;
  const totalTools = preview?.tools.total ?? matrix?.tools.length ?? 0;
  const driftCount = drift?.events.length ?? 0;

  const highRiskTools = useMemo(
    () =>
      (matrix?.tools ?? []).filter((tool) =>
        tool.scopes.some((scope) =>
          scope.risk_level === "high" || scope.risk_level === "critical",
        ),
      ).length,
    [matrix?.tools],
  );

  const queue = useMemo<ActionQueueItem[]>(() => {
    const items: ActionQueueItem[] = [];

    if (firstFailing) {
      items.push({
        key: `blocker:${firstFailing.step}`,
        title: firstFailing.name,
        body:
          firstFailing.detail ||
          "This is the next launch blocker to resolve before runtime policy can go live.",
        href: failingStepRoute(application.id, firstFailing.step),
        action: firstFailing.step <= 1 ? "Open setup" : "Fix blocker",
        tone: "danger",
      });
    } else if (!launched && canActivate) {
      items.push({
        key: "launch",
        title: "Ready to launch",
        body: "All launch gates are complete. Publish the current tool, scope, role, and client policy.",
        href: `/applications/${application.id}/overview`,
        action: "Launch application",
        tone: "ok",
      });
    }

    if (unmappedTools > 0) {
      items.push({
        key: "unmapped-tools",
        title: `${unmappedTools} tool${unmappedTools === 1 ? "" : "s"} denied by default`,
        body: "Unmapped MCP tools cannot be called until an operator assigns an access label.",
        href: `/applications/${application.id}/tools`,
        action: "Review tools",
        tone: "warn",
      });
    }

    if (publicTools > 0) {
      items.push({
        key: "public-tools",
        title: `${publicTools} public tool${publicTools === 1 ? "" : "s"}`,
        body: "Public tools bypass scope checks for any authenticated token with this application audience.",
        href: `/applications/${application.id}/tools`,
        action: "Review public tools",
        tone: "warn",
      });
    }

    if (highRiskTools > 0) {
      items.push({
        key: "high-risk-tools",
        title: `${highRiskTools} high-risk mapped tool${highRiskTools === 1 ? "" : "s"}`,
        body: "Review who receives the roles and scopes that unlock write, admin, delete, or broad capabilities.",
        href: `/applications/${application.id}/access`,
        action: "Review access",
        tone: "info",
      });
    }

    if (driftCount > 0) {
      items.push({
        key: "drift",
        title: `${driftCount} drift event${driftCount === 1 ? "" : "s"} since launch`,
        body: "New, changed, or removed tools should be reviewed before operators trust the current policy.",
        href: `/applications/${application.id}/activity`,
        action: "Review drift",
        tone: "warn",
      });
    }

    if (items.length === 0) {
      items.push({
        key: "steady",
        title: launched ? "Runtime policy is steady" : "Setup is waiting for the first signal",
        body: launched
          ? "No current blockers, public tool warnings, or drift events need attention."
          : "Start with setup, then map tools and validate access before launch.",
        href: launched
          ? `/applications/${application.id}/activity`
          : `/applications/${application.id}/setup`,
        action: launched ? "View monitor" : "Open setup",
        tone: launched ? "ok" : "info",
      });
    }

    return items;
  }, [
    application.id,
    canActivate,
    driftCount,
    firstFailing,
    highRiskTools,
    launched,
    publicTools,
    unmappedTools,
  ]);

  const handlePrimary = async () => {
    if (!canActivate || launched) return;
    try {
      await activate(application.id).unwrap();
      toast.success("Application launched. Runtime policy is active.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Launch failed. Resolve blockers and retry.");
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Overview
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
            Operational posture for this MCP application: what is exposed, who
            can use it, and what needs attention before or after launch.
          </p>
        </div>
        {!launched && canActivate ? (
          <Button onClick={handlePrimary} disabled={activating}>
            {activating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <PlayCircle className="mr-2 size-4" />
            )}
            Launch application
          </Button>
        ) : null}
      </header>

      <TableCard>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Action queue
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ordered by launch impact and runtime risk.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to={`/applications/${application.id}/test`}>
                <PlayCircle className="mr-2 size-4" />
                Run test
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-border rounded-lg border border-border">
            {checklistLoading && !checklist ? (
              <div className="p-4 text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline size-4 animate-spin" />
                Reading application posture...
              </div>
            ) : (
              queue.map((item) => (
                <ActionQueueRow
                  key={item.key}
                  item={item}
                  onLaunch={
                    item.key === "launch" ? handlePrimary : undefined
                  }
                  launching={activating}
                />
              ))
            )}
          </div>
        </CardContent>
      </TableCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PostureStat
          icon={<ShieldCheck className="size-4" />}
          label="Runtime state"
          value={launched ? "Launched" : canActivate ? "Ready" : "Blocked"}
          detail={
            launched
              ? "Policy is active"
              : canActivate
                ? "Ready to publish"
                : firstFailing?.name ?? "Setup pending"
          }
          tone={launched || canActivate ? "ok" : "warn"}
        />
        <PostureStat
          icon={<Sparkles className="size-4" />}
          label="Tool exposure"
          value={previewLoading ? "..." : String(totalTools)}
          detail={`${mappedTools} mapped · ${unmappedTools} denied · ${publicTools} public`}
          tone={unmappedTools || publicTools ? "warn" : "ok"}
        />
        <PostureStat
          icon={<ShieldAlert className="size-4" />}
          label="High-risk tools"
          value={String(highRiskTools)}
          detail="Mapped through high or critical scopes"
          tone={highRiskTools ? "warn" : "ok"}
        />
        <PostureStat
          icon={<Activity className="size-4" />}
          label="Drift"
          value={launched ? String(driftCount) : "—"}
          detail={launched ? "Open events since launch" : "Starts after launch"}
          tone={driftCount ? "warn" : "ok"}
        />
      </div>

      <TableCard>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-foreground">
              Access proof points
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ProofPoint
              title="Who can call tools?"
              body="Inspect effective access from End Users or Access Assignments."
              href={`/applications/${application.id}/access`}
              action="Open access"
            />
            <ProofPoint
              title="Which tools are public?"
              body="Review public and denied tools from the tool matrix."
              href={`/applications/${application.id}/tools`}
              action="Open tools"
            />
            <ProofPoint
              title="Can the browser flow work?"
              body="Run the live OAuth test before trusting the launch state."
              href={`/applications/${application.id}/test`}
              action="Run test"
            />
          </div>
        </CardContent>
      </TableCard>
    </div>
  );
}

function ActionQueueRow({
  item,
  onLaunch,
  launching,
}: {
  item: ActionQueueItem;
  onLaunch?: () => void;
  launching?: boolean;
}) {
  const action = onLaunch ? (
    <Button size="sm" onClick={onLaunch} disabled={launching}>
      {launching ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
      {item.action}
    </Button>
  ) : (
    <Button asChild variant="outline" size="sm">
      <Link to={item.href}>
        {item.action}
        <ArrowRight className="ml-2 size-4" />
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span
          className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${toneClass[item.tone]}`}
        >
          {item.tone === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : item.tone === "danger" ? (
            <ShieldAlert className="size-4" />
          ) : (
            <Activity className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.body}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function PostureStat({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "ok" | "warn";
}) {
  return (
    <TableCard>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div
          className={`mt-3 text-2xl font-semibold ${
            tone === "ok" ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {value}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </TableCard>
  );
}

function ProofPoint({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{body}</p>
      <Separator className="my-3" />
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to={href}>
          {action}
          <ArrowRight className="ml-2 size-4" />
        </Link>
      </Button>
    </div>
  );
}

function failingStepRoute(applicationId: string, step: number): string {
  const route =
    step <= 1
      ? "setup"
      : step <= 4
        ? "tools"
        : step === 5
          ? "access"
          : "overview";
  return `/applications/${applicationId}/${route}`;
}
