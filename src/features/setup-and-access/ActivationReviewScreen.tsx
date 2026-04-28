import { useGetActivationPreviewQuery } from "../../app/api/setupWizardApi";
import { useActivateResourceServerMutation } from "../../app/api/setupWizardApi";
import type { ActivationGateError } from "../../app/api/setupWizardApi";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  rsId: string;
  onActivated: () => void;
  onBack: () => void;
}

export function ActivationReviewScreen({ rsId, onActivated, onBack }: Props) {
  const { data: preview, isLoading } = useGetActivationPreviewQuery(rsId);
  const [activate, { isLoading: activating }] = useActivateResourceServerMutation();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        Loading activation preview…
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="py-8 text-center text-red-600">
        Could not load activation preview.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Activation Review</h2>
      <p className="text-sm text-gray-600">
        Review the configuration below before activating. Once activated,
        end-user OAuth flows will be allowed.
      </p>

      {/* Gate errors */}
      {gateErrors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <strong>Activation blocked:</strong>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {gateErrors.map((e) => (
              <li key={e}>{e.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tools summary */}
      <SummaryCard title="Tools">
        <SummaryRow label="Total" value={String(preview.tools.total)} />
        <SummaryRow label="Public (🔓)" value={String(preview.tools.public)} />
        <SummaryRow label="Mapped" value={String(preview.tools.mapped)} />
        <SummaryRow
          label="Unmapped"
          value={String(preview.tools.unmapped)}
          warn={preview.tools.unmapped > 0}
        />
      </SummaryCard>

      {/* Scopes summary */}
      <SummaryCard title={`Scopes (${preview.scope_count})`}>
        {preview.scopes.map((s) => (
          <SummaryRow
            key={s.scope_string}
            label={s.scope_string}
            value={`used by ${s.tool_count} tool${s.tool_count !== 1 ? "s" : ""}`}
          />
        ))}
        {preview.scopes.length === 0 && (
          <p className="text-sm text-red-600">No scopes defined.</p>
        )}
      </SummaryCard>

      {/* Default role */}
      <SummaryCard title="Default role">
        <SummaryRow label="Role name" value={preview.default_role} />
        <SummaryRow
          label="Scopes granted"
          value={
            preview.viewer_scopes.length > 0
              ? preview.viewer_scopes.join(", ")
              : "None"
          }
          warn={preview.viewer_scopes.length === 0}
        />
        <SummaryRow
          label="First-time user grant"
          value={
            preview.first_time_user_grant.length > 0
              ? preview.first_time_user_grant.join(", ")
              : "None"
          }
        />
      </SummaryCard>

      {/* Public tools callout */}
      {preview.public_tool_names.length > 0 && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          <strong>🔓 Public tools</strong> — callable by any token issued for this RS:
          <ul className="mt-1 list-disc pl-5">
            {preview.public_tool_names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleActivate}
          disabled={activating || !preview.can_activate}
          className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-green-700"
        >
          {activating ? "Activating…" : "Activate Resource Server"}
        </button>
        <button
          onClick={onBack}
          className="text-sm text-gray-600 underline"
        >
          ← Back
        </button>
        {!preview.can_activate && (
          <span className="text-sm text-red-600">
            Complete all required steps before activating.
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={warn ? "font-medium text-red-600" : "text-gray-900"}>
        {value}
      </span>
    </div>
  );
}
