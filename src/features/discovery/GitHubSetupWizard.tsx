/**
 * Discovery → Add integration → GitHub, end to end.
 *
 * TWO steps on the first run, ONE on every run after it. The earlier version
 * had four and asked for two names and a connector before it got to the only
 * question that matters — which organisation to scan. Everything else it
 * collected was either derivable (the display name is the organisation) or an
 * artefact of building on the connector broker (the connector name, the pick
 * list, the separate bind step).
 *
 * What replaced the connector: the discovery source now carries an
 * `iga_integrations` binding, which is where verified_at, requested-versus-
 * granted permissions and the cross-workspace rebinding guard live. Per
 * SPEC-connectors, Agentic IGA must not depend on the connector framework, and
 * nothing in this flow touches a connector row. The App private KEY is still
 * stored once per workspace and shared with the broker — one key, one place —
 * but that is a backend detail with no surface here.
 *
 * The distinction the old comment defended still holds and is still modelled:
 * "can we reach GitHub at all" (the integration, verified) is separate from
 * "what are we watching" (the source, and its repository selection). Collapsing
 * them is how a broken connection gets reported as "0 agents found". This
 * unifies the FLOW without collapsing the MODEL — the operator makes one
 * choice and the server creates both records together, in one call, so there is
 * no half-built state for a failure to strand.
 *
 * Step shape follows DeployCollectorWizard (numeric index, inline rail).
 * `src/features/wizards/` is an onboarding-tour framework and is deliberately
 * not used here.
 */

import { useEffect, useState } from "react";
import { Check, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGetGitHubAppQuery } from "@/app/api/discoveryApi";
import { GitHubAppPanel } from "./github/GitHubAppPanel";
import { GitHubOrganisationPanel } from "./github/GitHubOrganisationPanel";

const STEPS = ["GitHub App", "Organisation"] as const;

export function GitHubSetupWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the source id so the caller can route to repository selection. */
  onCreated: (sourceId: string) => void;
}) {
  const { data: appStatus, isLoading: appLoading } = useGetGitHubAppQuery(undefined, {
    skip: !open,
  });
  const appRegistered = appStatus?.configured === true;

  const [step, setStep] = useState(0);
  // Whether the operator deliberately went BACK to the App step. Without this,
  // the effect below would bounce them forward again the moment they arrived,
  // which is what made Back a no-op in the previous version.
  const [pinnedToAppStep, setPinnedToAppStep] = useState(false);

  // Skip the App step when there is nothing to do there. This is what makes the
  // second and every later organisation a one-step flow — and what returns the
  // operator to the organisation step after the manifest round trip, rather
  // than to the beginning of a step they have just completed.
  useEffect(() => {
    if (open && !appLoading && appRegistered && step === 0 && !pinnedToAppStep) {
      setStep(1);
    }
  }, [open, appLoading, appRegistered, step, pinnedToAppStep]);

  const close = () => {
    setStep(0);
    setPinnedToAppStep(false);
    onOpenChange(false);
  };

  const finish = (sourceId: string) => {
    setStep(0);
    setPinnedToAppStep(false);
    onOpenChange(false);
    onCreated(sourceId);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-4" />
            Scan GitHub for agents
          </DialogTitle>
          <DialogDescription>
            Reads your repositories for declared agents — CI/CD workflows, agent manifests,
            MCP configuration, containers and infrastructure code. Read-only: AuthSec never
            writes to your repositories.
          </DialogDescription>
        </DialogHeader>

        {/* Rail. Two steps, so it stays a progress indicator rather than a
            navigation control -- there is nowhere to jump to. */}
        <ol className="flex items-center gap-2 text-[11px]">
          {STEPS.map((label, i) => {
            const done = i < step || (i === 0 && appRegistered);
            const current = i === step;
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex size-5 items-center justify-center rounded-full border text-[10px] font-medium ${
                    done
                      ? "border-transparent bg-(--color-success-soft) text-(--color-success-text)"
                      : current
                        ? "border-primary text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={current ? "font-medium" : "text-muted-foreground"}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="w-6 border-t" />}
              </li>
            );
          })}
        </ol>

        <div className="min-h-[220px] py-1">
          {/* Nothing is rendered until we know whether an App exists. Rendering
              step 0 first would flash "no App registered" at a workspace that
              has one, then jump -- and the jump lands right where a click was
              heading. */}
          {appLoading ? (
            <p className="py-8 text-center text-[11px] text-muted-foreground">Loading…</p>
          ) : step === 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium">One GitHub App for this workspace</p>
                <p className="text-[11px] text-muted-foreground">
                  Set up once. The same App then covers every organisation you connect —
                  you will not be asked for this again.
                </p>
              </div>
              <GitHubAppPanel
                registered={appRegistered}
                registeredAppId={appStatus?.app_id}
                onChanged={() => setPinnedToAppStep(false)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-medium">Which organisation should we scan?</p>
                <p className="text-[11px] text-muted-foreground">
                  Choosing one sets it up and takes you to picking repositories. Nothing is
                  scanned until you choose them.
                </p>
              </div>
              <GitHubOrganisationPanel
                appRegistered={appRegistered}
                onAdded={finish}
                onOpenExisting={finish}
              />
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {step === 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPinnedToAppStep(true);
                  setStep(0);
                }}
              >
                GitHub App settings
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            {step === 0 && (
              <Button
                size="sm"
                className="text-[length:var(--text-sm)] text-white"
                disabled={!appRegistered}
                onClick={() => {
                  setPinnedToAppStep(false);
                  setStep(1);
                }}
              >
                Continue
              </Button>
            )}
          </div>
        </DialogFooter>

        {step === 0 && !appRegistered && !appLoading && (
          <p className="text-[11px] text-muted-foreground">
            Create or register the App above to continue.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
