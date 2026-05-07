/**
 * `ApplicationLaunchPage` — production safety gate, fully wired.
 *
 * Backend sources of truth:
 *   • `useGetSetupChecklistQuery`     → step list + can_activate flag
 *   • `useGetActivationPreviewQuery`  → tool/scope counts, viewer scopes,
 *                                       first-time-user grant, public_tool_names
 *   • `useActivateResourceServerMutation` → POST /activate (the button)
 *
 * Doctrine: every gate row is a real backend step. We don't invent
 * "Endpoint protection / Client readiness / Scenario test" gates that
 * the backend doesn't enforce.
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  useActivateResourceServerMutation,
  useGetActivationPreviewQuery,
  useGetSetupChecklistQuery,
} from "@/app/api/setupWizardApi";

import { useApplicationContext } from "./useApplicationContext";
import { isLaunched } from "./lib/computeReadiness";

export default function ApplicationLaunchPage() {
  const { application } = useApplicationContext();
  const navigate = useNavigate();

  const { data: checklist, isLoading: checklistLoading } =
    useGetSetupChecklistQuery(application.id);
  const { data: preview, isLoading: previewLoading } =
    useGetActivationPreviewQuery(application.id);

  const [activate, { isLoading: activating }] =
    useActivateResourceServerMutation();

  const launched = isLaunched(application);
  const canActivate = checklist?.can_activate ?? false;

  const failingSteps = useMemo(
    () => (checklist?.steps ?? []).filter((s) => !s.complete),
    [checklist],
  );
  const failingCount = failingSteps.length;
  const totalSteps = checklist?.steps.length ?? 0;
  const passingCount = totalSteps - failingCount;
  const firstFailing = failingSteps[0];

  const handleLaunch = async () => {
    try {
      await activate(application.id).unwrap();
      toast.success("Application activated. Policy is now live.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string; failed?: string[] } };
      const message =
        apiErr?.data?.error ||
        "Activation failed. Resolve the failing gates and retry.";
      toast.error(message);
    }
  };

  // ── Banner identity ───────────────────────────────────────────────────
  const banner = (() => {
    if (launched) {
      return {
        tone: "ok" as const,
        icon: Sparkles,
        title: "Launched",
        subtitle: `${passingCount} of ${totalSteps} setup steps complete · policy is live.`,
        ctaLabel: "View activity",
        ctaHref: `/applications/${application.id}/activity`,
        primaryAction: () => navigate(`/applications/${application.id}/activity`),
        showActivate: false,
      };
    }
    if (canActivate) {
      return {
        tone: "ok" as const,
        icon: CheckCircle2,
        title: "Ready to launch",
        subtitle: `All ${totalSteps} setup steps complete.`,
        ctaLabel: activating ? "Launching…" : "Launch application",
        ctaHref: undefined,
        primaryAction: handleLaunch,
        showActivate: true,
      };
    }
    if (failingCount > 0) {
      return {
        tone: "err" as const,
        icon: XCircle,
        title: "Not ready to launch",
        subtitle: `${failingCount} step${failingCount === 1 ? "" : "s"} remaining · ${passingCount} of ${totalSteps} complete`,
        ctaLabel: firstFailing
          ? `Fix step ${firstFailing.step}: ${firstFailing.name}`
          : "Resolve blockers",
        ctaHref: firstFailing
          ? failingStepRoute(application.id, firstFailing.step)
          : `/applications/${application.id}/setup`,
        primaryAction: undefined,
        showActivate: false,
      };
    }
    return {
      tone: "warn" as const,
      icon: AlertTriangle,
      title: "Loading…",
      subtitle: "Fetching setup checklist.",
      ctaLabel: "—",
      ctaHref: `/applications/${application.id}/overview`,
      primaryAction: undefined,
      showActivate: false,
    };
  })();

  const BannerIcon = banner.icon;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Launch application
        </h2>
        <p className="text-sm text-muted-foreground">
          Each step below is enforced by the backend on activation. The
          launch button calls{" "}
          <code className="font-mono text-xs">/activate</code> and only
          succeeds when every step passes.
        </p>
      </header>

      {/* Status banner */}
      <Card
        className={cn(
          "flex flex-col gap-4 border-l-4 p-4 md:flex-row md:items-center",
          banner.tone === "ok" &&
            "border-l-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)]",
          banner.tone === "warn" &&
            "border-l-[var(--color-warning)] bg-[color:color-mix(in_oklch,var(--color-warning)_6%,transparent)]",
          banner.tone === "err" &&
            "border-l-[var(--color-danger)] bg-[color:color-mix(in_oklch,var(--color-danger)_6%,transparent)]",
        )}
      >
        <BannerIcon
          className={cn(
            "size-5 shrink-0",
            banner.tone === "ok" && "text-[var(--color-success)]",
            banner.tone === "warn" && "text-[var(--color-warning)]",
            banner.tone === "err" && "text-[var(--color-danger)]",
          )}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {banner.title}
          </h3>
          <p className="text-sm text-muted-foreground">{banner.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1 md:items-end">
          {banner.showActivate ? (
            <Button
              onClick={banner.primaryAction}
              disabled={!canActivate || activating}
              className="bg-[var(--color-success)] hover:opacity-90"
            >
              {activating && <Loader2 className="mr-2 size-4 animate-spin" />}
              {banner.ctaLabel}
            </Button>
          ) : banner.primaryAction ? (
            <Button onClick={banner.primaryAction}>{banner.ctaLabel}</Button>
          ) : banner.ctaHref ? (
            <Button onClick={() => navigate(banner.ctaHref!)}>
              {banner.ctaLabel} →
            </Button>
          ) : null}
          {banner.tone === "err" && firstFailing && (
            <p className="text-[11px] italic text-muted-foreground">
              first failing step
            </p>
          )}
        </div>
      </Card>

      {/* Real setup checklist */}
      <section>
        <h3 className="text-sm font-semibold text-foreground">
          Setup checklist
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sourced from{" "}
          <code className="font-mono">
            GET /authsec/resource-servers/{application.id}/setup
          </code>
          .
        </p>
        <div className="mt-3 space-y-2">
          {checklistLoading && !checklist && (
            <Card className="p-4 text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading checklist…
            </Card>
          )}
          {!checklistLoading &&
            checklist?.steps.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">
                Backend returned no checklist steps for this application.
              </Card>
            )}
          {checklist?.steps.map((step) => (
            <ChecklistRow
              key={step.step}
              step={step.step}
              name={step.name}
              detail={step.detail}
              complete={step.complete}
              onFix={() =>
                navigate(failingStepRoute(application.id, step.step))
              }
            />
          ))}
        </div>
      </section>

      {/* Real activation preview (numbers only — no fabricated narrative) */}
      <section>
        <h3 className="text-sm font-semibold text-foreground">
          Activation preview
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Sourced from{" "}
          <code className="font-mono">
            GET /authsec/resource-servers/{application.id}/activation-preview
          </code>
          . What policy will look like the moment you launch.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewStat
            label="Tools (total)"
            value={previewLoading ? "…" : preview?.tools.total ?? "—"}
          />
          <PreviewStat
            label="Mapped"
            value={previewLoading ? "…" : preview?.tools.mapped ?? "—"}
            tone="ok"
          />
          <PreviewStat
            label="Public"
            value={previewLoading ? "…" : preview?.tools.public ?? "—"}
            tone="info"
          />
          <PreviewStat
            label="Unmapped"
            value={previewLoading ? "…" : preview?.tools.unmapped ?? "—"}
            tone={
              (preview?.tools.unmapped ?? 0) > 0 ? "warn" : "muted"
            }
          />
        </div>
        {preview && (
          <Card className="mt-3 p-4 text-sm">
            <dl className="grid gap-3 sm:grid-cols-2">
              <PreviewKv
                label="Default role"
                value={preview.default_role || "(none)"}
              />
              <PreviewKv
                label="Scopes registered"
                value={String(preview.scope_count)}
              />
              <PreviewKv
                label="Viewer scopes"
                value={
                  preview.viewer_scopes.length
                    ? preview.viewer_scopes.join(", ")
                    : "(none)"
                }
                mono
              />
              <PreviewKv
                label="First-time user grant"
                value={
                  preview.first_time_user_grant.length
                    ? preview.first_time_user_grant.join(", ")
                    : "(none)"
                }
                mono
              />
            </dl>
            {preview.public_tool_names.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
                  Public tools ({preview.public_tool_names.length})
                </p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">
                  {preview.public_tool_names.join(", ")}
                </p>
              </div>
            )}
          </Card>
        )}
      </section>

      {/* Footer copy — what activation actually does */}
      <Card
        className={cn(
          "space-y-2 border-l-4 p-5",
          "border-l-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)]",
        )}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
          When you launch
        </p>
        <p className="text-sm text-foreground">
          AuthSec marks this application{" "}
          <code className="font-mono">state = ready</code>, sets{" "}
          <code className="font-mono">setup_completed_at</code>, and starts
          enforcing the activation-preview policy at runtime.
        </p>
      </Card>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ChecklistRow({
  step,
  name,
  detail,
  complete,
  onFix,
}: {
  step: number;
  name: string;
  detail?: string;
  complete: boolean;
  onFix: () => void;
}) {
  return (
    <Card className="flex items-stretch overflow-hidden p-0">
      <span
        className={cn(
          "w-1 shrink-0",
          complete ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]",
        )}
        aria-hidden
      />
      <div className="flex flex-1 flex-wrap items-center gap-3 px-4 py-3">
        <span
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            complete
              ? "border-[var(--color-success)] bg-[color:color-mix(in_oklch,var(--color-success)_15%,transparent)] text-[var(--color-success)]"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {complete ? "✓" : step}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-foreground">{name}</h4>
          {detail && (
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            complete
              ? "border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_10%,transparent)] text-[var(--color-success)]"
              : "border-[color:color-mix(in_oklch,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-warning)_10%,transparent)] text-[var(--color-warning)]",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {complete ? "Complete" : "Pending"}
        </span>
        {!complete && (
          <Button variant="default" size="sm" onClick={onFix}>
            Open →
          </Button>
        )}
      </div>
    </Card>
  );
}

function PreviewStat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "warn" | "info" | "muted";
}) {
  const TONE: Record<NonNullable<typeof tone>, string> = {
    ok: "text-[var(--color-success)]",
    warn: "text-[var(--color-warning)]",
    info: "text-[var(--color-primary)]",
    muted: "text-foreground",
  };
  return (
    <Card className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          TONE[tone],
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function PreviewKv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Map a setup-checklist step number to the most relevant tab.
 * Backend defines the canonical step list (see
 * `setup_checklist.go`); this is just the navigation hint.
 */
function failingStepRoute(applicationId: string, step: number): string {
  // Backend steps: 1 Register, 2 Tool inventory, 3 Define scopes,
  // 4 Map tools to scopes, 5 Default role, 6 Activate.
  const route =
    step <= 1
      ? "setup"
      : step <= 4
        ? "tools"
        : step === 5
          ? "access"
          : "launch";
  return `/applications/${applicationId}/${route}`;
}
