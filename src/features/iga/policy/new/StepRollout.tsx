/**
 * Step 3 — Rollout and delivery (SPEC-iga-phase3-policy.md §9.3 S3, §8.6).
 *
 * Which control lives where (traced): observation days, the canary role and
 * the canary window are fields of the version's intent (`observation_days`,
 * `rollout.canary_target`, `rollout.canary_hours`, intent.go:94-108), so they
 * are edited here and saved as a new version. The delivery is the intent's
 * `delivery`. The review deadline and the workspace default for observation
 * and canary hours are Settings (`owner_review_days`, `default_observation_days`,
 * `canary_hours`), changed in Setup, not per policy.
 *
 * A delivery that cannot run is shown disabled WITH the reason and the Setup
 * step that fixes it; the server refuses it again when the rollout starts
 * (409 `enforcement_not_enabled` / `binding_not_verified` / `iac_source_missing`).
 */

import { Link } from "react-router-dom";

import type { GovDelivery } from "@/app/api/igaPolicyAuthoringApi";
import { useAppDispatch } from "@/app/hooks";
import { igaPolicyReadsApi, useGetGovSettingsQuery } from "@/app/api/igaPolicyReadsApi";
import { Input } from "@/components/ui/input";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { cn } from "@/lib/utils";

import { DELIVERY } from "../shared";
import { CANARY_HOURS, OBSERVATION_DAYS, withCanary, withDelivery, withObservationDays } from "./intentEdit";
import type { StepProps } from "./flow";
import type { DeliveryOption } from "./useDelivery";
import { useFetchMany } from "./useFetchMany";

const ORDER: GovDelivery[] = ["direct", "iac_pr", "export"];

function sharedCount(consumers: readonly { workload_id: string }[]): number {
  return new Set(consumers.map((c) => c.workload_id)).size;
}

function NumberField({ id, label, value, min, max, unit, onChange, help }: { id: string; label: string; value: number; min: number; max: number; unit: string; onChange: (n: number) => void; help: string }) {
  const bad = !Number.isInteger(value) || value < min || value > max;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-(--color-text-muted)">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          aria-invalid={bad}
          aria-describedby={`${id}-help`}
          className="w-24"
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onChange(n);
          }}
        />
        <span className="text-[13px] text-(--color-text-muted)">{unit}</span>
      </div>
      <p id={`${id}-help`} className={cn("text-xs", bad ? "text-(--color-danger-text)" : "text-(--color-text-muted)")}>
        {bad ? `Choose ${min} to ${max} ${unit}. ` : ""}
        {help}
      </p>
    </div>
  );
}

export function StepRollout({
  ws,
  session,
  intent,
  onIntent,
  roles,
  delivery,
}: StepProps & { delivery: Record<GovDelivery, DeliveryOption> }) {
  const dispatch = useAppDispatch();
  const canary = intent.rollout?.canary_target ?? intent.subjects[0]?.role_id;
  const settings = useGetGovSettingsQuery({ ws });
  const canaryHours = intent.rollout?.canary_hours ?? settings.data?.canary_hours ?? 48;
  const multi = roles.length > 1;

  // Administration-level roles (the AdministratorAccess policy among the grants of the evidence) cannot be the canary of several roles.
  const bundleByRole = new Map((session.snapshot?.evidence_targets ?? []).map((e) => [e.role_id, e.bundle_id]));
  const bundleIds = multi ? [...bundleByRole.values()] : [];
  const bundles = useFetchMany(bundleIds, async (id) => {
    const sub = dispatch(igaPolicyReadsApi.endpoints.getGovEvidenceBundle.initiate({ ws, id }));
    try {
      return await sub.unwrap();
    } finally {
      sub.unsubscribe();
    }
  });
  const isAdmin = (roleId: string): boolean => {
    const b = bundles[bundleByRole.get(roleId) ?? ""];
    return b?.status === "ok" && b.data.facts.grants.some((g) => g.policy_arn.endsWith(":policy/AdministratorAccess"));
  };

  const offered = roles.filter((r) => !isAdmin(r.subject.role_id));
  const notOffered = roles.filter((r) => isAdmin(r.subject.role_id));
  const isolated = offered.filter((r) => sharedCount(r.consumers) <= 1);
  const shared = offered.filter((r) => sharedCount(r.consumers) > 1);
  const picked = roles.find((r) => r.subject.role_id === canary);
  const selected = delivery[intent.delivery];

  return (
    <div className="space-y-4">
      <Panel title="Observe first" description="After approval AuthSec watches before it changes anything.">
        <NumberField
          id="observe-days"
          label="Observation period"
          value={intent.observation_days}
          min={OBSERVATION_DAYS.min}
          max={OBSERVATION_DAYS.max}
          unit="days"
          onChange={(n) => onIntent(withObservationDays(intent, n))}
          help="Ends after this period and a fresh activity report that follows it. Nothing changes in AWS while AuthSec observes."
        />
        <Meta className="mt-2">
          The workspace default is set in{" "}
          <Link to="/iga/policy/setup/settings" className="font-medium text-(--color-primary-text) hover:underline">
            Setup › Settings
          </Link>
          ; this value applies to this policy.
        </Meta>
      </Panel>

      <Panel title="Canary" description="One role is changed first. Expansion to the rest waits for its gates.">
        {!multi ? (
          <div className="space-y-1.5 text-[13px] text-(--color-text)">
            <p>{roles[0]?.name ?? "The role"} is the only role, so the canary is the whole rollout.</p>
            {roles[0] && sharedCount(roles[0].consumers) > 1 ? (
              <p className="text-(--color-warning-text)">
                It is shared by {sharedCount(roles[0].consumers)} workloads: all of their owners must acknowledge before it can be changed.
              </p>
            ) : null}
          </div>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Canary role</legend>
            {[...isolated, ...shared].map((r) => {
              const n = sharedCount(r.consumers);
              return (
                <label key={r.subject.role_id} className="flex items-start gap-2 rounded-md border border-(--color-border-subtle) px-3 py-2 text-[13px]">
                  <input
                    type="radio"
                    name="canary"
                    className="mt-1"
                    checked={canary === r.subject.role_id}
                    onChange={() => onIntent(withCanary(intent, { target: r.subject.role_id }))}
                  />
                  <span>
                    <span className="font-medium text-(--color-text)">{r.name}</span>
                    <span className="block text-xs text-(--color-text-muted)">
                      {n > 1 ? `Shared by ${n} workloads: needs all consumer owners to acknowledge` : n === 1 ? "Isolated: one workload runs as it" : "Isolated: no workload found"}
                    </span>
                  </span>
                </label>
              );
            })}
            {notOffered.length > 0 ? (
              <p className="text-xs text-(--color-text-muted)">
                Not offered as canary (administration-level access): {notOffered.map((r) => r.name).join(", ")}.
              </p>
            ) : null}
            {!session.snapshot ? (
              <p className="text-xs text-(--color-text-muted)">
                AuthSec checks again when the canary starts that the role has no administration-level statements; it refuses one when several roles are changed.
              </p>
            ) : null}
            {picked && notOffered.some((r) => r.subject.role_id === picked.subject.role_id) ? (
              <p role="alert" className="text-xs text-(--color-danger-text)">
                {picked.name} has administration-level access and cannot be the canary. Choose another role.
              </p>
            ) : null}
          </fieldset>
        )}
        <div className="mt-3">
          <NumberField
            id="canary-hours"
            label="Canary window"
            value={canaryHours}
            min={CANARY_HOURS.min}
            max={CANARY_HOURS.max}
            unit="hours"
            onChange={(n) => onIntent(withCanary(intent, { hours: n }))}
            help="Pauses on any unexpected access denial or reported problem."
          />
        </div>
      </Panel>

      <Panel title="Delivery" description="How the change reaches AWS. Each option states what must be set up.">
        <fieldset className="space-y-2">
          <legend className="sr-only">Delivery</legend>
          {ORDER.map((d) => {
            const o = delivery[d];
            const off = o.available === false;
            return (
              <label
                key={d}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]",
                  intent.delivery === d ? "border-(--color-primary)" : "border-(--color-border-subtle)",
                  off && "bg-(--color-surface-subtle)",
                )}
              >
                <input
                  type="radio"
                  name="delivery"
                  className="mt-1"
                  disabled={off}
                  checked={intent.delivery === d}
                  onChange={() => onIntent(withDelivery(intent, d))}
                />
                <span className="min-w-0">
                  <span className={cn("font-medium", off ? "text-(--color-text-muted)" : "text-(--color-text)")}>{DELIVERY[d].label}</span>
                  <span className="block text-xs text-(--color-text-muted)">{DELIVERY[d].hint}</span>
                  {off ? (
                    <span className="block text-xs font-medium text-(--color-warning-text)">
                      {o.reason}{" "}
                      {o.fix ? (
                        <Link to={o.fix.to} className="underline">
                          {o.fix.label}
                        </Link>
                      ) : null}
                    </span>
                  ) : o.detail ? (
                    <span className="block text-xs text-(--color-text-muted)">{o.detail}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        {selected.available === false ? (
          <p role="alert" className="mt-2 text-xs font-medium text-(--color-danger-text)">
            {DELIVERY[intent.delivery].label} is not available: {selected.reason} Choose another delivery to continue.
          </p>
        ) : null}
        {session.initialDelivery === "export" && intent.delivery === "export" ? (
          <Meta className="mt-2">
            AuthSec suggested Export: a role with a boundary AuthSec does not own is never edited by AuthSec in AWS, so it is delivered by pull request or export.
          </Meta>
        ) : null}
      </Panel>

      <Facts>
        <Fact label="Undo">
          One step back to each role&apos;s state now, from the undo plan compiled when you submit.
        </Fact>
      </Facts>
    </div>
  );
}
