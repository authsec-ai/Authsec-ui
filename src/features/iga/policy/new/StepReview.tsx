/**
 * Step 4 — Review and submit (SPEC-iga-phase3-policy.md §9.3 S3): the plan in
 * one summary, the evidence it rests on (trust, sources, gaps), the hashes
 * behind a disclosure, and what submitting does. The submit control itself is
 * in the page footer; a refusal of it is rendered here by `SubmitFailure`.
 *
 * The evidence shown is the bundle built when the draft was created.
 * Submitting compiles against live AWS with a fresh bundle, and the compiled
 * plans name the bundle they used; they can differ if AWS changed meanwhile.
 */

import { useState } from "react";

import { Link } from "react-router-dom";

import { govErrorDetail, type GovTargetKey } from "@/app/api/igaPolicyAuthoringApi";
import { useGetGovSettingsQuery } from "@/app/api/igaPolicyReadsApi";
import { StatusBadge } from "@/components/console/status";
import { CopyButton } from "@/features/iga/shared/components/CopyButton";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";

import { EvidenceBundleView } from "../plans/EvidenceBundleView";
import { R1A_SCOPE, arnTail } from "../plans/planCopy";
import { PolicyActionError, StateChip, DELIVERY, plural, serviceList, shortHash, trust, type PolicyFailure } from "../shared";
import { daysWord, reasonText, trustReasons } from "./copy";
import type { StepProps } from "./flow";

function BundleRow({ ws, name, bundleId, hash, trustValue, gaps }: { ws: string; name: string; bundleId: string; hash: string; trustValue: string; gaps: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-md border border-(--color-border-subtle)" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 px-3 py-2 text-[13px]">
        <span className="font-medium text-(--color-text)">{name}</span>
        <StateChip state={trust(trustValue)} />
        <span className="text-xs text-(--color-text-muted)">
          {gaps === 0 ? "no gaps" : `${plural(gaps, "gap")} to accept at approval`} · bundle {shortHash(hash)}
        </span>
      </summary>
      <div className="border-t border-(--color-border-subtle) px-3 py-3">{open ? <EvidenceBundleView ws={ws} bundleId={bundleId} /> : null}</div>
    </details>
  );
}

export function StepReview({ ws, session, intent, roles }: StepProps) {
  const settings = useGetGovSettingsQuery({ ws });
  const evidence = session.snapshot?.evidence_targets ?? [];
  const canary = roles.find((r) => r.subject.role_id === intent.rollout?.canary_target) ?? roles[0];
  const hours = intent.rollout?.canary_hours ?? settings.data?.canary_hours;
  const clean = intent.remove.filter((r) => !r.route_state || r.route_state === "none_observed");
  const withRoute = intent.remove.filter((r) => r.route_state && r.route_state !== "none_observed");
  const gaps = evidence.reduce((n, e) => n + e.gaps.length, 0);

  return (
    <div className="space-y-4">
      <Panel title="Plan summary">
        <Facts>
          <Fact label="Roles">{roles.map((r) => r.name).join(", ")}</Fact>
          <Fact label="Removed">
            {intent.remove.length === 0 ? "nothing" : serviceList(clean.map((r) => r.service), 14)}
            {withRoute.length > 0 ? (
              <span className="block text-xs text-(--color-warning-text)">
                Excluded, but a route remains: {serviceList(withRoute.map((r) => r.service), 8)}
              </span>
            ) : null}
          </Fact>
          <Fact label="Kept">{intent.retain.length === 0 ? "nothing listed" : serviceList(intent.retain.map((r) => r.service), 14)}</Fact>
          <Fact label="Observe first">{daysWord(intent.observation_days)}</Fact>
          <Fact label="Canary">
            {canary?.name ?? "the role"} for {hours ? `${hours} h` : "the workspace default"}
          </Fact>
          <Fact label="Delivery">{DELIVERY[intent.delivery].label}</Fact>
          <Fact label="Owner review">{settings.data ? `${daysWord(settings.data.owner_review_days)} from submission` : "deadline set in Setup"}</Fact>
          <Fact label="Draft">
            {session.name}, version {session.versionNo}
          </Fact>
        </Facts>
        <Meta className="mt-3">{R1A_SCOPE}</Meta>
      </Panel>

      <Panel
        title="Evidence"
        count={evidence.length > 0 ? plural(evidence.length, "bundle") : undefined}
        description="What AuthSec relied on when it made the recommendation. It reads AWS again when you submit, and each plan names the bundle it was compiled from."
      >
        {evidence.length === 0 ? (
          <p className="text-[13px] text-(--color-text-muted)">
            This draft was opened in another session, so its original evidence summary is not kept here. Submitting builds fresh evidence, and the plan shows it.
          </p>
        ) : (
          <div className="space-y-2">
            {evidence.map((e) => (
              <BundleRow
                key={e.bundle_id}
                ws={ws}
                name={roles.find((r) => r.subject.role_id === e.role_id)?.name ?? e.role_id}
                bundleId={e.bundle_id}
                hash={e.bundle_hash}
                trustValue={e.trust}
                gaps={e.gaps.length}
              />
            ))}
            {evidence.some((e) => e.trust_reasons?.length) ? (
              <Meta>{evidence.filter((e) => e.trust_reasons?.length).map((e) => trustReasons(e.trust_reasons)).join("; ")}.</Meta>
            ) : null}
            {gaps > 0 ? <StatusBadge tone="warning">An approver must accept {plural(gaps, "gap")}</StatusBadge> : null}
          </div>
        )}
      </Panel>

      <Panel title="When you submit">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-(--color-text)">
          <li>AuthSec reads AWS (read only) and compiles an apply plan and an undo plan for each role. A role that cannot be changed is listed with the reason, and nothing is submitted.</li>
          <li>The owners listed in step 2 are asked to review. Nothing is changed in AWS by a review, and silence is not consent.</li>
          <li>An approver who did not write the version approves it; only then can the rollout start.</li>
        </ul>
      </Panel>

      <details className="rounded-md border border-(--color-border-subtle)">
        <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-(--color-text)">Hashes</summary>
        <div className="border-t border-(--color-border-subtle) px-3 py-2">
          <Facts>
            <Fact label="Intent hash">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs" title={session.intentHash}>
                  {shortHash(session.intentHash)}
                </span>
                <CopyButton value={session.intentHash} label="Copy" what="intent hash" />
              </span>
            </Fact>
            {evidence.map((e) => (
              <Fact key={e.bundle_id} label={`Bundle · ${roles.find((r) => r.subject.role_id === e.role_id)?.name ?? arnTail(e.role_id)}`}>
                <span className="font-mono text-xs" title={e.bundle_hash}>
                  {shortHash(e.bundle_hash)}
                </span>
              </Fact>
            ))}
          </Facts>
          <Meta className="mt-1.5">
            The plan and impact hashes exist once the plans are compiled; an approval binds all of them.{" "}
            <Link to={`/iga/policy/policies/${encodeURIComponent(session.policyId)}`} className="font-medium text-(--color-primary-text) hover:underline">
              Open the draft policy
            </Link>
          </Meta>
        </div>
      </details>
    </div>
  );
}

const keyName = (k: GovTargetKey | undefined, nameOf: (roleId: string) => string): string =>
  !k ? "A role" : k.role_arn ? arnTail(k.role_arn) : k.role_id ? nameOf(k.role_id) : k.service_account ? `service account ${k.service_account}` : k.object_id ? `object ${k.object_id.slice(0, 8)}` : "A role";

/**
 * A refusal of Submit or of opening the flow, with the detail the server gave:
 * which targets became ineligible and why, which source is untrusted, which
 * keys are not supported (and what they need first).
 */
export function SubmitFailure({ failure, nameOf }: { failure: PolicyFailure | null; nameOf: (roleId: string) => string }) {
  if (!failure) return null;
  const inel = govErrorDetail(failure, "target_ineligible");
  const unsupported = govErrorDetail(failure, "target_not_supported");
  const untrusted = govErrorDetail(failure, "evidence_untrusted");
  const invalid = govErrorDetail(failure, "invalid_intent");
  const nothing = govErrorDetail(failure, "nothing_to_remove");
  const notActionable = govErrorDetail(failure, "finding_not_actionable");
  return (
    <div className="space-y-2">
      <PolicyActionError failure={failure} />
      {inel?.targets?.length ? (
        <ul className="space-y-1.5 rounded-md border border-(--color-border-subtle) px-3 py-2 text-xs">
          {inel.targets.map((t, i) => (
            <li key={`${t.role_id ?? t.target_id ?? i}`}>
              <span className="font-medium text-(--color-text)">{t.role_id ? nameOf(t.role_id) : keyName(t.key, nameOf)}</span>
              <ul className="list-disc pl-5 text-(--color-text-muted)">
                {(t.reasons ?? (t.reason ? [t.reason] : [])).map((r, j) => (
                  <li key={j}>{reasonText(r)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {unsupported?.targets?.length ? (
        <ul className="space-y-1 rounded-md border border-(--color-border-subtle) px-3 py-2 text-xs">
          {unsupported.targets.map((t, i) => (
            <li key={i}>
              <span className="font-medium text-(--color-text)">{keyName(t.key, nameOf)}</span>
              <span className="text-(--color-text-muted)">
                {" "}
                · Not yet supported for policy{t.prerequisite ? ` (needs ${t.prerequisite})` : ""}
                {t.reason && !t.reason.startsWith("provider_not_supported") ? `: ${t.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {nothing ? (
        <ul className="list-disc space-y-0.5 rounded-md border border-(--color-border-subtle) py-2 pl-7 pr-3 text-xs text-(--color-text-muted)">
          {(nothing.targets ?? []).map((t) => (
            <li key={t.role_id}>
              {nameOf(t.role_id)}: no service has a qualified no-attempt basis for removal.
            </li>
          ))}
          {(nothing.warnings ?? []).length > 0 ? <li>The selected roles have no removable service in common.</li> : null}
        </ul>
      ) : null}
      {notActionable?.findings?.length ? (
        <ul className="list-disc space-y-0.5 rounded-md border border-(--color-border-subtle) py-2 pl-7 pr-3 text-xs text-(--color-text-muted)">
          {notActionable.findings.map((f) => (
            <li key={f.finding_id}>
              A {f.kind.replace(/_/g, " ")} finding that is {f.status.replace(/_/g, " ")} cannot start a right-size policy.
            </li>
          ))}
        </ul>
      ) : null}
      {untrusted ? (
        <div className="space-y-1 rounded-md border border-(--color-border-subtle) px-3 py-2 text-xs text-(--color-text)">
          {untrusted.role_id ? <p className="font-medium">{nameOf(untrusted.role_id)}</p> : null}
          {untrusted.reasons?.length ? <p>{trustReasons(untrusted.reasons)}.</p> : null}
          {(untrusted.sources ?? []).map((s, i) => (
            <p key={`${s.connector_id}:${i}`}>
              {s.kind === "aws_publication" ? "AWS scan" : s.kind} (revision {s.rev}, {s.freshness_hours} h old): {trustReasons(s.reasons)}.{" "}
              {s.remedy ? (
                <Link to={s.remedy} className="font-medium underline">
                  Open the connection
                </Link>
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
      {invalid?.errors?.length ? (
        <ul className="list-disc space-y-0.5 rounded-md border border-(--color-border-subtle) py-2 pl-7 pr-3 text-xs text-(--color-text)">
          {invalid.errors.map((e, i) => (
            <li key={`${e.field}:${i}`}>
              {e.field ? `${e.field}: ` : ""}
              {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
