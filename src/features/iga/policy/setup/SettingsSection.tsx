/**
 * Policy › Setup › Settings (SPEC-iga-phase3-policy.md §7.8, §9.3 S9): the
 * workspace's enforcement mode and the windows and deadlines the policy product
 * uses. One form over `GET/PUT /policy/settings`.
 *
 * Only the fields that changed are sent, with `expected_updated_at` only when a
 * settings row exists (for an unsaved workspace any value is a conflict). The
 * switch to `enforce` is a confirmed action and carries a reason; the server
 * refuses it without one. A 409 means the settings changed since they were read:
 * the form says so and reloads. The notification targets live under
 * Notifications and are not sent from here.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import {
  ENFORCEMENT_MODES,
  GOV_SETTINGS_RANGES,
  govSettingsNeedsReason,
  useGetGovSettingsQuery,
  usePutGovSettingsMutation,
  type GovEnforcementMode,
  type GovSettings,
  type GovSettingsNumberField,
  type GovSettingsPatch,
} from "@/app/api/igaPolicyReadsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, classifyPolicyError, usePolicyAction, usePolicyPermission } from "../shared";
import { ActionDialog } from "./ActionDialog";
import { SettingsFailure } from "./SettingsFailure";

const MODES: Record<GovEnforcementMode, { label: string; words: string }> = {
  findings_only: {
    label: "Findings only",
    words: "AuthSec reports findings and drafts changes. Changes are delivered by Export: AuthSec does not write to AWS or open pull requests.",
  },
  enforce: {
    label: "Enforce",
    words: "AuthSec writes to AWS for approved changes in verified accounts, and opens pull requests for mapped repositories.",
  },
};

const NUMBERS: { field: GovSettingsNumberField; label: string; unit: string; help: string }[] = [
  {
    field: "default_window_days",
    label: "Default evidence window",
    unit: "days",
    help: "How far back activity is read when judging whether a service is unused.",
  },
  {
    field: "default_observation_days",
    label: "Observation period",
    unit: "days",
    help: "How long a new policy watches a role before its change goes ahead. New policies start with this value.",
  },
  {
    field: "owner_review_days",
    label: "Owner review deadline",
    unit: "days",
    help: "How long owners have to respond to a review.",
  },
  {
    field: "approval_valid_days",
    label: "Approval validity",
    unit: "days",
    help: "How long an approval stays valid before the change needs approving again.",
  },
  {
    field: "canary_hours",
    label: "Canary window",
    unit: "hours",
    help: "How long the first role is watched before the change expands.",
  },
  {
    field: "iac_apply_hours",
    label: "IaC apply deadline",
    unit: "hours",
    help: "How long AuthSec waits for a merged pull request or an export to be applied before it reports it overdue.",
  },
  {
    field: "evidence_retention_revs",
    label: "Evidence retention",
    unit: "publications",
    help: "How many graph publications of evidence are kept. Evidence a policy version rests on is kept as long as the version exists.",
  },
];

/** `""` and non-integers are not numbers; the server takes integers only. */
function parseInt10(v: string): number | null {
  const t = v.trim();
  return /^-?\d+$/.test(t) ? Number(t) : null;
}

function rangeProblem(field: GovSettingsNumberField, v: string): string | null {
  const { min, max } = GOV_SETTINGS_RANGES[field];
  const n = parseInt10(v);
  if (n === null) return `Enter a whole number from ${min} to ${max}.`;
  return n < min || n > max ? `Between ${min} and ${max}.` : null;
}

function SettingsForm({ settings, onReload }: { settings: GovSettings; onReload: () => void }) {
  const enforce = usePolicyPermission("governance:enforce");
  const [put] = usePutGovSettingsMutation();
  const action = usePolicyAction("governance:enforce");

  const [mode, setMode] = useState<GovEnforcementMode>(settings.enforcement_mode);
  const [nums, setNums] = useState<Record<GovSettingsNumberField, string>>(() => ({
    default_window_days: String(settings.default_window_days),
    default_observation_days: String(settings.default_observation_days),
    owner_review_days: String(settings.owner_review_days),
    approval_valid_days: String(settings.approval_valid_days),
    canary_hours: String(settings.canary_hours),
    iac_apply_hours: String(settings.iac_apply_hours),
    evidence_retention_revs: String(settings.evidence_retention_revs),
  }));
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  const canChange = !enforce.refused;
  const problems = Object.fromEntries(NUMBERS.map((n) => [n.field, rangeProblem(n.field, nums[n.field])])) as Record<GovSettingsNumberField, string | null>;
  const invalid = Object.values(problems).some(Boolean);

  // Only what differs from what the server holds.
  const changed: GovSettingsPatch = {};
  if (mode !== settings.enforcement_mode) changed.enforcement_mode = mode;
  for (const n of NUMBERS) {
    const v = parseInt10(nums[n.field]);
    if (v !== null && v !== settings[n.field]) changed[n.field] = v;
  }
  const dirty = Object.keys(changed).length > 0;
  const needsReason = govSettingsNeedsReason(settings.enforcement_mode, changed.enforcement_mode);

  async function submit(why: string) {
    const body: GovSettingsPatch = {
      ...changed,
      ...(needsReason ? { reason: why.trim() } : {}),
      ...(settings.saved ? { expected_updated_at: settings.updated_at } : {}),
    };
    const res = await action.run(() => put(body));
    if (res) {
      setConfirming(false);
      setReason("");
      toast.success(needsReason ? "Settings saved. Enforcement is on." : "Settings saved");
    }
  }

  function save() {
    setTouched(true);
    if (invalid || !dirty) return;
    if (needsReason) setConfirming(true);
    else void submit("");
  }

  return (
    <div className="space-y-5">
      {!settings.saved ? (
        <p role="status" className="text-xs text-(--color-text-muted)">
          These are the defaults. Nothing is saved for this workspace until you save.
        </p>
      ) : null}

      <fieldset className="space-y-2" disabled={!canChange || action.pending}>
        <legend className="text-[13px] font-semibold text-(--color-text)">Enforcement mode</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {ENFORCEMENT_MODES.map((m) => {
            const on = mode === m;
            return (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5",
                  on ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-subtle) bg-(--color-surface-raised)",
                  (!canChange || action.pending) && "cursor-not-allowed opacity-70",
                )}
              >
                <input type="radio" name="enforcement-mode" value={m} checked={on} onChange={() => setMode(m)} className="mt-1" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-(--color-text)">
                    {MODES[m].label}
                    {settings.enforcement_mode === m ? <span className="ml-2 text-xs font-normal text-(--color-text-muted)">current</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-(--color-text-muted)">{MODES[m].words}</span>
                </span>
              </label>
            );
          })}
        </div>
        {needsReason ? <p className="text-xs text-(--color-warning-text)">Switching to enforce asks you to confirm and give a reason.</p> : null}
      </fieldset>

      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {NUMBERS.map((n) => {
          const problem = touched ? problems[n.field] : null;
          const id = `setting-${n.field}`;
          return (
            <div key={n.field} className="space-y-1">
              <label htmlFor={id} className="text-[13px] font-medium text-(--color-text)">
                {n.label} <span className="font-normal text-(--color-text-muted)">({n.unit})</span>
              </label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                step={1}
                min={GOV_SETTINGS_RANGES[n.field].min}
                max={GOV_SETTINGS_RANGES[n.field].max}
                value={nums[n.field]}
                onChange={(e) => setNums({ ...nums, [n.field]: e.target.value })}
                disabled={!canChange || action.pending}
                aria-invalid={!!problem}
                aria-describedby={`${id}-help`}
                className="max-w-40"
              />
              <p id={`${id}-help`} className={problem ? "text-xs text-(--color-danger-text)" : "text-xs text-(--color-text-muted)"}>
                {problem ?? `${n.help} ${GOV_SETTINGS_RANGES[n.field].min} to ${GOV_SETTINGS_RANGES[n.field].max}.`}
              </p>
            </div>
          );
        })}
      </div>

      {canChange ? (
        <div className="space-y-2 border-t border-(--color-border-subtle) pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || action.pending}>
              {action.pending && !confirming ? "Saving…" : "Save settings"}
            </Button>
            {settings.saved ? (
              <span className="text-xs text-(--color-text-muted)">
                Last saved <Timestamp iso={settings.updated_at} />
              </span>
            ) : null}
          </div>
          {!confirming ? <SettingsFailure failure={action.failure} onReload={onReload} /> : null}
        </div>
      ) : (
        <p className="border-t border-(--color-border-subtle) pt-4 text-xs text-(--color-text-muted)">
          Your role cannot change these settings. Ask a workspace administrator.
        </p>
      )}

      <ActionDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) action.clear();
        }}
        title="Switch to enforce"
        description="This workspace's enforcement mode"
        confirmLabel="Switch to enforce"
        busyLabel="Saving…"
        pending={action.pending}
        failure={action.failure?.code === "version_conflict" ? null : action.failure}
        onConfirm={() => void submit(reason)}
        confirmDisabled={!reason.trim()}
        wide
      >
        <p className="font-medium">AuthSec will write to AWS for approved changes in verified accounts.</p>
        <ul className="list-disc space-y-1 pl-5 text-(--color-text-muted)">
          <li>Only changes a person has approved are applied, and only in accounts whose enforcement self-test passed.</li>
          <li>Changes delivered by pull request are opened for repositories you mapped.</li>
          <li>You can switch back to findings only afterwards; that needs no reason.</li>
        </ul>
        <div className="space-y-1">
          <label htmlFor="setting-reason" className="text-xs font-medium text-(--color-text)">
            Reason (required, kept in the audit trail)
          </label>
          <Textarea id="setting-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
        {action.failure?.code === "version_conflict" ? <SettingsFailure failure={action.failure} onReload={onReload} /> : null}
      </ActionDialog>
    </div>
  );
}

export default function SettingsSection() {
  const ws = getWorkspaceId() ?? "";
  const q = useGetGovSettingsQuery({ ws });
  const failure = classifyPolicyError(q.error);
  const s = q.data;

  return (
    <Panel title="Workspace settings" description="How the policy product behaves in this workspace.">
      {q.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !s ? (
        failure.kind === "forbidden" ? (
          <p className="text-[13px] text-(--color-text-muted)">Your role cannot see the settings.</p>
        ) : (
          <PolicyLoadFailure failure={failure} subject="the settings" onRetry={() => void q.refetch()} />
        )
      ) : s ? (
        // A new key after each save or reload starts the form from what the server holds.
        <SettingsForm key={`${s.saved}-${s.updated_at}`} settings={s} onReload={() => void q.refetch()} />
      ) : null}
    </Panel>
  );
}
