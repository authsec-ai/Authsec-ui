import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useWizard } from "@/contexts/WizardContext";
import { getWizardConfig, WizardStorage } from "@/features/wizards";
import { scopedStorageKey } from "@/utils/scopedStorageKey";

/**
 * Reusable hook for checking wizard completion status and launching wizards.
 * Replaces the duplicated per-wizard logic that was in IntegrationGuideGrid.
 */
export function useWizardStatus(wizardId: string) {
  const { startWizard, isActive } = useWizard();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Force re-render when wizard becomes inactive (completed/dismissed)
  useEffect(() => {
    if (!isActive) {
      forceUpdate();
    }
  }, [isActive]);

  const isCompleted = useMemo(() => {
    try {
      const raw = localStorage.getItem(scopedStorageKey("authsec_wizards"));
      if (!raw) return false;
      const data = JSON.parse(raw) as { completedWizards?: unknown };
      if (!Array.isArray(data.completedWizards)) return false;
      return data.completedWizards.includes(wizardId);
    } catch {
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- isActive is an intentional cache-buster to re-read localStorage when a wizard starts or stops
  }, [wizardId, isActive]);

  const launch = useCallback(() => {
    // Allow relaunching completed wizards by resetting first
    if (isCompleted) {
      WizardStorage.resetWizard(wizardId);
    }

    const config = getWizardConfig(wizardId);
    if (config) {
      startWizard(wizardId, config);
    }
  }, [wizardId, isCompleted, startWizard]);

  return { isCompleted, launch };
}
