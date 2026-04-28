import { useState } from "react";
import { useGetSetupChecklistQuery } from "../../app/api/setupWizardApi";
import type { ChecklistStep } from "../../app/api/setupWizardApi";
import { ToolInventoryStep } from "./ToolInventoryStep";
import { ScopesTab } from "./ScopesTab";
import { ToolsTab } from "./ToolsTab";
import { RolesAccessTab } from "./RolesAccessTab";
import { ActivationReviewScreen } from "./ActivationReviewScreen";
import { DriftBanner } from "./DriftBanner";
import { TestLoginPanel } from "./TestLoginPanel";

interface Props {
  rsId: string;
  rsName: string;
  rsState: string;
  onActivated: () => void;
}

// Manage-mode tab keys for a ready RS.
type ManageTab = "overview" | "tools" | "scopes" | "roles" | "test";

export function SetupWizard({ rsId, rsName, rsState, onActivated }: Props) {
  const [activeStep, setActiveStep] = useState(rsState === "ready" ? 6 : 1);
  const [manageTab, setManageTab] = useState<ManageTab>("overview");

  const { data: checklist, refetch: refetchChecklist } = useGetSetupChecklistQuery(rsId, {
    pollingInterval: rsState !== "ready" ? 10_000 : 0,
  });

  // Coerce nil → [] so .find/.map are safe even when the backend emits
  // JSON null for an empty steps array.
  const steps: ChecklistStep[] = checklist?.steps ?? [];
  const currentStep = steps.find((s) => !s.complete && s.step < 6) ?? steps[5];

  // Ready RS: render the management UI (status header + DriftBanner + tab strip).
  if (rsState === "ready") {
    return (
      <div className="space-y-4">
        <DriftBanner rsId={rsId} />

        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>Setup complete.</strong> {rsName} is active. End-users can log
          in. Manage the running configuration below.
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 border-b border-gray-200">
          {(
            [
              { key: "overview", label: "Overview" },
              { key: "tools", label: "Tools" },
              { key: "scopes", label: "Scopes" },
              { key: "roles", label: "Roles & access" },
              { key: "test", label: "Test login" },
            ] as { key: ManageTab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setManageTab(t.key)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-[2px] ${
                manageTab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-2">
          {manageTab === "overview" && (
            <ReadyOverview rsId={rsId} steps={steps} />
          )}
          {manageTab === "tools" && (
            <ToolsTab rsId={rsId} onChange={refetchChecklist} />
          )}
          {manageTab === "scopes" && (
            <ScopesTab rsId={rsId} onChange={refetchChecklist} />
          )}
          {manageTab === "roles" && (
            <RolesAccessTab rsId={rsId} onChange={refetchChecklist} />
          )}
          {manageTab === "test" && <TestLoginPanel rsId={rsId} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Left rail — wizard checklist */}
      <div className="w-56 shrink-0 space-y-1">
        {steps.map((step) => (
          <WizardStep
            key={step.step}
            step={step}
            active={activeStep === step.step}
            locked={step.step === 6 && !checklist?.can_activate}
            onClick={() => {
              if (step.step === 6 && !checklist?.can_activate) return;
              setActiveStep(step.step);
            }}
          />
        ))}

        <div className="pt-4 text-xs text-gray-400">
          Step {currentStep?.step ?? "?"} of 6
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1">
        {activeStep === 2 && (
          <ToolInventoryStep
            rsId={rsId}
            toolCount={steps.find((s) => s.step === 2)?.detail?.match(/\d+/)?.[0]
              ? parseInt(steps.find((s) => s.step === 2)!.detail!.match(/\d+/)![0])
              : 0}
            onRefresh={refetchChecklist}
          />
        )}

        {activeStep === 3 && (
          <ScopesTab rsId={rsId} onChange={refetchChecklist} />
        )}

        {activeStep === 4 && (
          <ToolsTab rsId={rsId} onChange={refetchChecklist} />
        )}

        {activeStep === 5 && (
          <RolesAccessTab rsId={rsId} onChange={refetchChecklist} />
        )}

        {activeStep === 6 && (
          <ActivationReviewScreen
            rsId={rsId}
            onActivated={onActivated}
            onBack={() => setActiveStep(5)}
          />
        )}

        {activeStep !== 2 &&
          activeStep !== 3 &&
          activeStep !== 4 &&
          activeStep !== 5 &&
          activeStep !== 6 && (
            <StepPlaceholder
              step={steps.find((s) => s.step === activeStep)}
              onContinue={() => setActiveStep((s) => Math.min(s + 1, 6))}
            />
          )}
      </div>
    </div>
  );
}

function WizardStep({
  step,
  active,
  locked,
  onClick,
}: {
  step: ChecklistStep;
  active: boolean;
  locked: boolean;
  onClick: () => void;
}) {
  const icon = step.complete ? "✅" : active ? "▶" : locked ? "🔒" : "⬜";

  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`w-full text-left px-3 py-2 rounded text-sm ${
        active
          ? "bg-blue-50 text-blue-800 font-medium"
          : step.complete
          ? "text-gray-600"
          : "text-gray-500"
      } disabled:cursor-not-allowed`}
    >
      <span className="mr-2">{icon}</span>
      {step.step}. {step.name}
      {step.detail && (
        <span className="block pl-6 text-xs text-gray-400">{step.detail}</span>
      )}
    </button>
  );
}

function StepPlaceholder({
  step,
  onContinue,
}: {
  step?: ChecklistStep;
  onContinue: () => void;
}) {
  if (!step) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        Step {step.step}: {step.name}
      </h2>
      {step.complete ? (
        <div className="text-sm text-green-700">
          ✅ This step is complete. {step.detail}
        </div>
      ) : (
        <div className="text-sm text-gray-500">Configure {step.name} below.</div>
      )}
      <button
        onClick={onContinue}
        className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
      >
        Continue →
      </button>
    </div>
  );
}

// Ready-state overview: re-uses the checklist steps as a config summary.
// Each row shows the same detail text the wizard rail used during setup, but
// with a "manage" call-to-action that jumps to the corresponding tab.
function ReadyOverview({ rsId, steps }: { rsId: string; steps: ChecklistStep[] }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Configuration summary
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          A snapshot of what was activated. Use the tabs above to make changes —
          edits to a ready RS take effect immediately and may surface drift
          events for end-users still holding tokens.
        </p>
      </div>
      <ul className="divide-y divide-gray-100 px-4">
        {steps.map((s) => (
          <li key={s.step} className="flex items-start justify-between gap-4 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">
                {s.step}. {s.name}
              </div>
              {s.detail && (
                <div className="mt-0.5 text-xs text-gray-500">{s.detail}</div>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                s.complete
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {s.complete ? "✓ complete" : "incomplete"}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400">
        RS ID: <code className="font-mono">{rsId}</code>
      </div>
    </div>
  );
}
