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

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useGetActivationPreviewQuery,
  useGetSetupChecklistQuery,
} from "@/app/api/setupWizardApi";
import { cn } from "@/lib/utils";

import { useApplicationContext } from "./useApplicationContext";
import { ReadinessGate } from "./components/ReadinessGate";
import type { ReadinessArea } from "./types";

export default function ApplicationOverviewPage() {
  const { application } = useApplicationContext();

  const { data: checklist, isLoading: checklistLoading } =
    useGetSetupChecklistQuery(application.id);
  const { data: preview, isLoading: previewLoading } =
    useGetActivationPreviewQuery(application.id);

  const firstFailing = checklist?.steps.find((s) => !s.complete);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      {/* LEFT — real setup checklist */}
      <Card className="p-4 sm:p-6">
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Launch readiness
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Backend setup checklist. Click any incomplete step to jump to
              the tab that resolves it.
            </p>
          </div>
        </header>
        <div className="-mx-2">
          {checklistLoading && !checklist && (
            <div className="px-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              Loading checklist…
            </div>
          )}
          {!checklistLoading && (checklist?.steps.length ?? 0) === 0 && (
            <div className="px-2 py-6 text-sm text-muted-foreground">
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
      </Card>

      {/* RIGHT — NBA + real activation preview */}
      <div className="flex flex-col gap-3">
        <NextActionCard
          firstFailing={firstFailing}
          canActivate={checklist?.can_activate ?? false}
          applicationId={application.id}
          loading={checklistLoading}
        />
        <Card className="p-4 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Activation preview
          </p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">
            What policy will look like
          </h3>
          {previewLoading && !preview && (
            <p className="mt-3 text-xs text-muted-foreground">
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
          <p className="mt-3 text-[11px] italic text-muted-foreground">
            New tools after launch are denied by default until mapped.
          </p>
        </Card>
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
      <Card className="p-6">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Next best action
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline size-3 animate-spin" />
          Reading checklist…
        </p>
      </Card>
    );
  }

  if (canActivate) {
    return (
      <Card className="border-[color:color-mix(in_oklch,var(--color-success)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-success)_6%,transparent)] p-6">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-success)]">
          Ready to launch
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          Launch this application
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          All setup steps are complete. Activation publishes runtime policy
          to the SDK.
        </p>
        <Button asChild className="mt-5 w-full justify-center">
          <Link to={`/applications/${applicationId}/launch`}>
            Open Launch  →
          </Link>
        </Button>
      </Card>
    );
  }

  if (firstFailing) {
    const href = `/applications/${applicationId}/${tabForStep(firstFailing.step)}`;
    return (
      <Card className="border-[color:color-mix(in_oklch,var(--color-primary)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_6%,transparent)] p-6">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
          Next best action
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          {firstFailing.name}
        </h2>
        {firstFailing.detail ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {firstFailing.detail}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This is the first incomplete step in your setup checklist.
          </p>
        )}
        <Button asChild className="mt-5 w-full justify-center">
          <Link to={href}>Open  →</Link>
        </Button>
        <p className="mt-3 text-[11px] italic text-muted-foreground">
          The backend won't let you launch until every step is complete.
        </p>
      </Card>
    );
  }

  // Backend returned no steps — be honest
  return (
    <Card className="p-6">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Next best action
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
        Open Setup
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Backend hasn't returned any setup steps yet.
      </p>
      <Button asChild variant="outline" className="mt-5 w-full justify-center">
        <Link to={`/applications/${applicationId}/setup`}>Open Setup</Link>
      </Button>
    </Card>
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
      <span
        className={cn(
          "min-w-[2.5rem] text-lg font-semibold tabular-nums",
          TONE[tone],
        )}
      >
        {value}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">
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
