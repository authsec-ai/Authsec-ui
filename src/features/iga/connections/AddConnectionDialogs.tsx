/**
 * Add a connection: the provider picker, then that provider's own setup.
 * The setup flows are the existing ones, unchanged — AWS Quick Create / role
 * ARN, Google Cloud, the Kubernetes agent install, GitHub App setup — and
 * after a successful add the list refetches.
 */

import { toast } from "react-hot-toast";

import { DeployCollectorWizard } from "@/features/discovery/DeployCollectorWizard";
import { GitHubSetupWizard } from "@/features/discovery/GitHubSetupWizard";
import { CloudProviderPicker, type PickerProvider } from "@/features/discovery/cloud/CloudProviderPicker";
import { AWSOnboardingWizard } from "@/features/discovery/cloud/aws/AWSOnboardingWizard";
import { GCPOnboardingWizard } from "@/features/discovery/cloud/gcp/GCPOnboardingWizard";

import type { ConnectionProvider } from "@/app/api/connectionsApi";

export type Wizard = ConnectionProvider | null;

export function AddConnectionDialogs({
  pickerOpen,
  onPickerOpenChange,
  wizard,
  onWizardChange,
  onAdded,
}: {
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  wizard: Wizard;
  onWizardChange: (w: Wizard) => void;
  /** A connection was added. `id` is given when the new connection needs its scope chosen next. */
  onAdded: (id?: string) => void;
}) {
  const close = () => onWizardChange(null);
  return (
    <>
      <CloudProviderPicker
        open={pickerOpen}
        onOpenChange={onPickerOpenChange}
        onContinue={(p: PickerProvider) => {
          if (p === "aws" || p === "gcp" || p === "k8s" || p === "github") onWizardChange(p);
          else toast("That provider is not available yet.");
        }}
      />
      <AWSOnboardingWizard open={wizard === "aws"} onOpenChange={(o) => !o && close()} onCreated={() => onAdded()} />
      <GCPOnboardingWizard open={wizard === "gcp"} onOpenChange={(o) => !o && close()} onCreated={() => onAdded()} />
      <DeployCollectorWizard open={wizard === "k8s"} onOpenChange={(o) => !o && close()} onCreated={() => onAdded()} />
      <GitHubSetupWizard
        open={wizard === "github"}
        onOpenChange={(o) => !o && close()}
        // The source exists but scans nothing until repositories are chosen.
        onCreated={(sourceId) => onAdded(sourceId)}
      />
    </>
  );
}
