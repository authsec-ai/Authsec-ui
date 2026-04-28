import { useState } from "react";
import { useActivateResourceServerMutation } from "../../app/api/setupWizardApi";
import type { ActivationGateError } from "../../app/api/setupWizardApi";
import toast from "react-hot-toast";

interface Props {
  rsId: string;
  canActivate: boolean;
  onActivated: () => void;
}

export function ActivateButton({ rsId, canActivate, onActivated }: Props) {
  const [activate, { isLoading }] = useActivateResourceServerMutation();
  const [gateErrors, setGateErrors] = useState<string[]>([]);

  const handleActivate = async () => {
    setGateErrors([]);
    try {
      await activate(rsId).unwrap();
      toast.success("Resource Server activated!");
      onActivated();
    } catch (err: unknown) {
      const apiErr = err as { data?: ActivationGateError; status?: number };
      if (apiErr?.status === 409 && apiErr.data?.failed) {
        setGateErrors(apiErr.data.failed);
      } else {
        toast.error("Activation failed. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleActivate}
        disabled={!canActivate || isLoading}
        className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-green-700"
      >
        {isLoading ? "Activating…" : "Activate Resource Server"}
      </button>

      {!canActivate && (
        <p className="text-xs text-gray-500">
          Complete all required steps before activating.
        </p>
      )}

      {gateErrors.length > 0 && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <strong>Activation blocked:</strong>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {gateErrors.map((e) => (
              <li key={e}>{e.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
