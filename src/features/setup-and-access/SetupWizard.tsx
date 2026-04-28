import { useState } from "react";
import { useGetSetupChecklistQuery } from "../../app/api/setupWizardApi";
import type { ChecklistStep } from "../../app/api/setupWizardApi";
import { ToolInventoryStep } from "./ToolInventoryStep";
import { ActivationReviewScreen } from "./ActivationReviewScreen";
import { DriftBanner } from "./DriftBanner";

interface Props {
  rsId: string;
  rsName: string;
  rsState: string;
  onActivated: () => void;
}

export function SetupWizard({ rsId, rsName, rsState, onActivated }: Props) {
  const [activeStep, setActiveStep] = useState(rsState === "ready" ? 6 : 1);
  const { data: checklist, refetch: refetchChecklist } = useGetSetupChecklistQuery(rsId, {
    pollingInterval: rsState !== "ready" ? 10_000 : 0,
  });

  const steps = checklist?.steps ?? [];
  const currentStep = steps.find((s) => !s.complete && s.step < 6) ?? steps[5];

  if (rsState === "ready") {
    return (
      <div className="space-y-4">
        <DriftBanner rsId={rsId} />
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>Setup complete.</strong> {rsName} is active. End-users can log in.
          <button
            className="ml-2 text-green-700 underline text-xs"
            onClick={() => setActiveStep(1)}
          >
            Reconfigure
          </button>
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

        {activeStep === 6 && (
          <ActivationReviewScreen
            rsId={rsId}
            onActivated={onActivated}
            onBack={() => setActiveStep(5)}
          />
        )}

        {activeStep !== 2 && activeStep !== 6 && (
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
