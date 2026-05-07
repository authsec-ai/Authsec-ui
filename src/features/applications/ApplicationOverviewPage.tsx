/**
 * `ApplicationOverviewPage` — command center.
 *
 * Two-column layout:
 *   • Left — Launch readiness map sourced from `useGetSetupChecklistQuery`
 *            (the real backend step list).
 *   • Right — Next best action card + Runtime consequence summary
 *            sourced from `useGetActivationPreviewQuery` (real tool
 *            counts, not fabricated).
 *
 * Anything we can't honestly source from a backend response is omitted.
 */

import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  useGetActivationPreviewQuery,
  useGetSetupChecklistQuery,
} from "@/app/api/setupWizardApi";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";
import { ReadinessGate } from "./components/ReadinessGate";
import type { ReadinessArea } from "./types";
import {
  DecisionBanner,
  Surface,
} from "./components/ApplicationConsole";

export default function ApplicationOverviewPage() {
  const { application } = useApplicationContext();

  const { data: checklist, isLoading: checklistLoading } =
    useGetSetupChecklistQuery(application.id);
  const { data: preview, isLoading: previewLoading } =
    useGetActivationPreviewQuery(application.id);

  const firstFailing = checklist?.steps.find((s) => !s.complete);
  const firstFailingHref = firstFailing
    ? `/applications/${application.id}/${tabForStep(firstFailing.step)}`
    : `/applications/${application.id}/setup`;

  return (
    <div className="space-y-5">
      <DecisionBanner
        tone={checklist?.can_activate ? "success" : firstFailing ? "warning" : "info"}
        title={
          checklist?.can_activate
            ? "Ready to launch"
            : firstFailing
              ? `${firstFailing.name} is blocking launch`
              : "Reading launch readiness"
        }
        body={
          firstFailing?.detail ??
          "AuthSec turns setup state into launch gates so protected resources stay fail-closed until policy is complete."
        }
        actionLabel={checklist?.can_activate ? "Open launch" : firstFailing ? "Fix blocker" : "Open setup"}
        actionHref={checklist?.can_activate ? `/applications/${application.id}/launch` : firstFailingHref}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* LEFT — real setup checklist */}
      <Surface className="p-5">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Launch readiness
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Click the first incomplete gate to jump directly to the screen
              that resolves it.
            </p>
          </div>
        </header>
        <div className="-mx-2">
          {checklistLoading && !checklist && (
            <div className="px-2 py-6 text-sm text-slate-500">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading checklist…
            </div>
          )}
          {!checklistLoading && (checklist?.steps.length ?? 0) === 0 && (
            <div className="px-2 py-6 text-sm text-slate-500">
              Backend returned no checklist steps yet.
            </div>
          )}
          {checklist?.steps.map((step, idx) => (
            <ReadinessGate
              key={step.step}
              step={step.step}
              label={step.name}
              area={areaForStep(step.complete, step.detail)}
              tab={tabForStep(step.step)}
              applicationId={application.id}
              withDivider={idx > 0}
            />
          ))}
        </div>
      </Surface>

      {/* RIGHT — NBA + real activation preview */}
      <div className="sticky top-4 flex h-max flex-col gap-3">
        <NextActionCard
          firstFailing={firstFailing}
          canActivate={checklist?.can_activate ?? false}
          applicationId={application.id}
          loading={checklistLoading}
        />
        <Surface className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
            Activation preview
          </p>
          <h3 className="mt-2 text-base font-semibold text-slate-950">
            What policy will look like
          </h3>
          {previewLoading && !preview && (
            <p className="mt-3 text-xs text-slate-500">
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              Loading preview…
            </p>
          )}
          {preview && (
            <ul className="mt-3 space-y-2">
              <RuntimeStat
                value={preview.tools.total}
                label="tools discovered"
                tone="info"
              />
              <RuntimeStat
                value={preview.tools.mapped}
                label="mapped to access labels"
                tone="ok"
              />
              <RuntimeStat
                value={preview.tools.unmapped}
                label="unmapped (denied by default)"
                tone={preview.tools.unmapped > 0 ? "warn" : "muted"}
              />
              <RuntimeStat
                value={preview.tools.public}
                label="explicitly public"
                tone="info"
              />
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">
            New tools after launch are denied by default until mapped.
          </p>
        </Surface>
      </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function NextActionCard({
  firstFailing,
  canActivate,
  applicationId,
  loading,
}: {
  firstFailing: { step: number; name: string; detail?: string } | undefined;
  canActivate: boolean;
  applicationId: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Surface className="p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
          Next best action
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          Reading checklist…
        </p>
      </Surface>
    );
  }

  if (canActivate) {
    return (
      <Surface className="border-emerald-200 bg-emerald-50 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-emerald-700">
          Ready to launch
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          Launch this application
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          All setup steps are complete. Activation publishes runtime policy
          to the SDK.
        </p>
        <Button asChild className="mt-5 w-full justify-center">
          <Link to={`/applications/${applicationId}/launch`}>
            Open Launch  →
          </Link>
        </Button>
      </Surface>
    );
  }

  if (firstFailing) {
    const href = `/applications/${applicationId}/${tabForStep(firstFailing.step)}`;
    return (
      <Surface className="border-blue-200 bg-blue-50 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-blue-700">
          Next best action
        </p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">
          {firstFailing.name}
        </h2>
        {firstFailing.detail ? (
          <p className="mt-2 text-sm text-slate-600">
            {firstFailing.detail}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            This is the first incomplete step in your setup checklist.
          </p>
        )}
        <Button asChild className="mt-5 w-full justify-center">
          <Link to={href}>Open  →</Link>
        </Button>
        <p className="mt-3 text-xs text-slate-500">
          The backend won't let you launch until every step is complete.
        </p>
      </Surface>
    );
  }

  // Backend returned no steps — be honest
  return (
    <Surface className="p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
        Next best action
      </p>
      <h2 className="mt-2 text-lg font-semibold text-slate-950">
        Open Setup
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        Backend hasn't returned any setup steps yet.
      </p>
      <Button asChild variant="outline" className="mt-5 w-full justify-center">
        <Link to={`/applications/${applicationId}/setup`}>Open Setup</Link>
      </Button>
    </Surface>
  );
}

function RuntimeStat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "ok" | "warn" | "err" | "info" | "muted";
}) {
  const TONE: Record<typeof tone, string> = {
    ok: "text-[var(--color-success)]",
    warn: "text-[var(--color-warning)]",
    err: "text-[var(--color-danger)]",
    info: "text-[var(--color-primary)]",
    muted: "text-foreground",
  };
  return (
    <li className="flex items-baseline gap-3">
      <span className={cn("min-w-[2.5rem] text-lg font-semibold tabular-nums", TONE[tone])}>
        {value}
      </span>
      <span className="text-xs leading-snug text-slate-600">
        {label}
      </span>
    </li>
  );
}

function areaForStep(complete: boolean, detail?: string): ReadinessArea {
  return complete
    ? { state: "ok", status: "Complete", detail }
    : { state: "warn", status: "Pending", detail };
}

/** See ApplicationLaunchPage — same mapping. */
function tabForStep(step: number): string {
  if (step <= 1) return "setup";
  if (step <= 4) return "tools";
  if (step === 5) return "access";
  return "launch";
}
