/**
 * The panels of the deployment page (SPEC-iga-phase3-policy.md §8.4-§8.10,
 * §9.3 S5, §9.7). Each takes only what it shows. Evidence sits behind a
 * `<details>`; ARNs and hashes are shown short with a copy control; nothing
 * here merges two kinds of proof into one status.
 */

import { useMemo, type ReactNode } from "react";

import type {
  GovApplyProgress,
  GovDeploymentDetail,
  GovValidationResultKind,
  IGAGovAcceptance,
  IGAGovArtifact,
  IGAGovAttempt,
  IGAGovHealthReport,
  IGAGovRevalidation,
  IGAGovServiceOutcome,
  IGAGovWorkloadMigration,
  GovValidationView,
} from "@/app/api/igaPolicyDeploymentsApi";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CopyValue, Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import { StateChip, humanize, roleNameOf, shortHash, plural, routeState, serviceOutcome, type StateView } from "../shared";
import {
  ACCEPTANCE_WORDS,
  ARTIFACT_STATE_WORDS,
  CLASSIFICATION_WORDS,
  MIGRATION_STATE_WORDS,
  RESTRICTION_WORDS,
  SERVICE_CHANGE,
  SERVICE_EXCLUSION,
  attemptStatus,
  clock,
  serviceSentence,
  stamp,
  type VerificationLine,
} from "./deploymentModel";

const SCOPE_NOTE =
  "AuthSec restricts whole AWS services for selected roles. It does not narrow actions or resources within the services a role keeps.";

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-(--color-text-muted) hover:text-(--color-text)">{summary}</summary>
      <div className="mt-1.5 space-y-1">{children}</div>
    </details>
  );
}

/* ------------------------------- verification ------------------------------ */

/** Four kinds of proof on four lines. A verified boundary is not application health and not an observed restriction. */
export function VerificationPanel({ lines }: { lines: VerificationLine[] }) {
  return (
    <Panel
      title="What is verified"
      description="Each line is its own evidence. The boundary being verified does not mean applications still work, and does not mean a service cannot be reached."
      flush
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {lines.map((l) => (
          <li key={l.key} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-[11rem] text-[13px] font-medium" title={l.help}>
                {l.label}
              </span>
              <StateChip state={l.result} />
              {l.checkedAt ? (
                <span className="text-xs text-(--color-text-muted)">
                  checked <Timestamp iso={l.checkedAt} />
                </span>
              ) : null}
            </div>
            <p className="text-[13px] text-(--color-text)">{l.text}</p>
            {l.evidence.length > 0 ? (
              <Disclosure summary={`Evidence (${l.evidence.length})`}>
                <ul className="list-disc space-y-0.5 pl-5 text-(--color-text-muted)">
                  {l.evidence.map((e, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      {e}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* --------------------------------- delivery -------------------------------- */

/**
 * J1/J2 progress. The API has no pull-request or IaC change object: only the
 * deployment's state, `apply_deadline_at` and the artifact verification's
 * apply-progress evidence. Said so rather than inventing a link.
 */
export function DeliveryPanel({ detail, progress }: { detail: GovDeploymentDetail; progress: GovApplyProgress | undefined }) {
  const d = detail.deployment;
  const viaPr = d.delivery === "iac_pr";
  return (
    <Panel title={viaPr ? "Pull request delivery" : "Export delivery"}>
      <Facts>
        <Fact label="State">{humanize(d.state)}</Fact>
        {d.apply_deadline_at ? (
          <Fact label="Apply deadline">
            {clock(d.apply_deadline_at)} (<Timestamp iso={d.apply_deadline_at} />)
          </Fact>
        ) : null}
        {progress ? (
          <Fact label="In AWS now">
            {progress.summary || `${progress.visible} of ${progress.total} changes are visible.`}
            {progress.overdue ? " The deadline has passed." : ""}
          </Fact>
        ) : null}
      </Facts>
      {progress ? (
        <div className="mt-2 space-y-1">
          <Meta>
            {CLASSIFICATION_WORDS[progress.class] ?? humanize(progress.class)} ({progress.visible} of {progress.total} changes visible).
          </Meta>
          {(progress.awaited_facts?.length ?? 0) > 0 ? (
            <Disclosure summary={`Still waiting for ${progress.awaited_facts?.length} change${progress.awaited_facts?.length === 1 ? "" : "s"}`}>
              <ul className="list-disc space-y-0.5 pl-5 text-(--color-text-muted)">
                {(progress.awaited_facts ?? []).map((f) => (
                  <li key={f.key} className="[overflow-wrap:anywhere]">
                    {humanize(f.kind)}
                    {f.subject ? ` ${f.subject}` : ""}: expected {f.after || "none"}, AWS shows {f.observed || "none"}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>
      ) : null}
      <Meta className="mt-2">
        {viaPr
          ? "AuthSec does not return a link to the pull request here. Find it in your repository. AuthSec checks for the change at every scan and records it once AWS shows it."
          : "You apply the exported change yourself. AuthSec checks for it at every scan and records it once AWS shows it."}
      </Meta>
    </Panel>
  );
}

/* ---------------------------- per-service outcomes --------------------------- */

export function ServiceOutcomesPanel({ outcomes }: { outcomes: IGAGovServiceOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <Panel
      title="Services this change touched"
      count={plural(outcomes.length, "service")}
      description={`What this deployment established for each service when it was checked. ${SCOPE_NOTE}`}
      flush
    >
      <ul className="divide-y divide-(--color-border-subtle)">
        {outcomes.map((o) => (
          <li key={o.service} className="space-y-1.5 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] font-medium">{o.service}</span>
              <StateChip state={serviceOutcome(o.outcome)} />
              <StateChip state={routeState(o.route_state)} />
              <span className="text-xs text-(--color-text-muted)">
                {SERVICE_CHANGE[o.change] ?? humanize(o.change)} · {SERVICE_EXCLUSION[o.exclusion] ?? humanize(o.exclusion)} ·{" "}
                {RESTRICTION_WORDS[o.restriction] ?? humanize(o.restriction)}
              </span>
            </div>
            <p className="text-[13px]">{serviceSentence(o)}</p>
            {o.routes.length > 0 ? (
              <Disclosure summary={`Routes (${o.routes.length})`}>
                <ul className="space-y-1 text-(--color-text-muted)">
                  {o.routes.map((r, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      {humanize(r.effect)}
                      {r.form ? ` · ${humanize(r.form)}` : ""}
                      {r.region ? ` · ${r.region}` : ""}
                      {r.resource ? ` · ${r.resource}` : ""}
                      {r.reason ? ` · ${humanize(r.reason)}` : ""}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------- attempts -------------------------------- */

export function AttemptsPanel({ detail }: { detail: GovDeploymentDetail }) {
  const attempts = detail.attempts;
  const completed = detail.deployment.completed_ops ?? [];
  const columns = useMemo<AdaptiveColumn<IGAGovAttempt>[]>(
    () => [
      {
        id: "operation",
        header: "Operation",
        label: "Operation",
        primary: true,
        alwaysVisible: true,
        minWidth: 200,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-mono text-[13px]">{row.original.operation}</div>
            <div className="text-xs text-(--color-text-muted)">
              Step {row.original.op_seq + 1}, attempt {row.original.attempt_no}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Write-ahead status",
        label: "Write-ahead status",
        priority: 1,
        approxWidth: 170,
        cell: ({ row }) => <StateChip state={attemptStatus(row.original.status)} />,
        detail: (a) => <StateChip state={attemptStatus(a.status)} />,
      },
      {
        id: "outcome",
        header: "Outcome",
        label: "Outcome",
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => <AttemptOutcome a={row.original} />,
        detail: (a) => <AttemptOutcome a={a} />,
      },
      {
        id: "request",
        header: "AWS request id",
        label: "AWS request id",
        priority: 3,
        approxWidth: 260,
        cell: ({ row }) => (row.original.request_id ? <CopyValue value={row.original.request_id} what="Request id" /> : <span className="text-xs text-(--color-text-muted)">None</span>),
        detail: (a) => (a.request_id ? <CopyValue value={a.request_id} what="Request id" /> : "None"),
      },
      {
        id: "signed",
        header: "Signed",
        label: "Signing time",
        priority: 4,
        approxWidth: 160,
        cell: ({ row }) => <span className="text-xs tabular-nums">{stamp(row.original.signed_at) || "Not signed"}</span>,
        detail: (a) => stamp(a.signed_at) || "Not signed",
      },
    ],
    [],
  );
  const artifact = detail.verifications.find((v) => v.dimension === "artifact");
  const cls = artifact?.dimension === "artifact" && "classification" in artifact.evidence ? artifact.evidence.classification : undefined;

  return (
    <Panel
      title="Attempts"
      count={attempts.length === 0 ? undefined : plural(attempts.length, "attempt")}
      description="Every change to AWS is recorded before it is sent, then marked as the answer arrives. A request that was sent and not answered stays Unknown until AuthSec has settled it."
      flush
    >
      <AdaptiveTable
        tableId="iga-policy-deployment-attempts"
        sizing="fit"
        rowDetails={false}
        cardsBelow={640}
        emptyState={<p className="py-2">Nothing has been sent to AWS by this deployment.</p>}
        columns={columns}
        data={attempts}
        getRowId={(a) => a.id}
        enableSelection={false}
        enableExpansion={false}
        enablePagination={false}
      />
      {cls || completed.length > 0 ? (
        <div className="space-y-1 border-t border-(--color-border-subtle) px-4 py-3">
          {cls ? (
            <Meta>
              Where AWS stood at the last check: {CLASSIFICATION_WORDS[cls.class] ?? humanize(cls.class)} ({cls.visible} of {cls.total} changes visible).
            </Meta>
          ) : null}
          {completed.length > 0 ? (
            <Disclosure summary={`Completed steps (${completed.length})`}>
              <ul className="space-y-0.5 text-(--color-text-muted)">
                {completed.map((c) => (
                  <li key={`${c.op_seq}-${c.operation}`}>
                    <span className="font-mono">{c.operation}</span> · {humanize(c.outcome)}
                    {c.basis ? ` · recognised from ${c.basis === "attempt" ? "AuthSec's request" : c.basis === "live_read" ? "a read of AWS" : "its selector"}` : ""}
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function AttemptOutcome({ a }: { a: IGAGovAttempt }) {
  const words: Record<string, string> = {
    ok: "Succeeded",
    retryable: "Rejected, may be retried",
    terminal: "Failed",
    recognised_done: "Already done in AWS",
    not_needed: "Not needed",
  };
  const parts: string[] = [];
  if (a.outcome) parts.push(words[a.outcome] ?? humanize(a.outcome));
  if (a.resolved_as) parts.push(a.resolved_as === "applied" ? "settled: it was applied" : "settled: it was not applied");
  return (
    <div className="min-w-0 text-[13px]">
      <div>{parts.join(" · ") || "No answer"}</div>
      {a.error_code ? (
        <div className="truncate text-xs text-(--color-text-muted)" title={a.error_message}>
          {a.error_code}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- ledger ---------------------------------- */

const OWNER_WORDS: Record<string, string> = { authsec_direct: "AuthSec", customer_iac: "Your infrastructure code" };

export function LedgerPanel({ ledger }: { ledger: IGAGovArtifact[] }) {
  if (ledger.length === 0) return null;
  return (
    <Panel title="What AuthSec controls on this role" count={plural(ledger.length, "object")} description="The ledger of native AWS objects behind this role's control, across all of its deployments." flush>
      <ul className="divide-y divide-(--color-border-subtle)">
        {ledger.map((a) => (
          <li key={a.id} className="space-y-1 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium">{humanize(a.kind)}</span>
              <span className="text-xs text-(--color-text-muted)">
                {ARTIFACT_STATE_WORDS[a.state] ?? humanize(a.state)} · managed by {OWNER_WORDS[a.owned_by] ?? humanize(a.owned_by)}
              </span>
            </div>
            <CopyValue value={a.native_arn} what="ARN" />
            <Meta>
              {a.last_readback_at ? (
                <>
                  Last read back <Timestamp iso={a.last_readback_at} />
                </>
              ) : (
                "Not read back yet"
              )}
              {a.document_hash ? ` · document ${shortHash(a.document_hash)}` : ""}
            </Meta>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------ revalidations ------------------------------ */

function jsonShort(v: unknown): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  } catch {
    return "";
  }
}

export function RevalidationsPanel({ items }: { items: IGAGovRevalidation[] }) {
  if (items.length === 0) return null;
  return (
    <Panel title="Evidence rechecked after approval" flush>
      <ul className="divide-y divide-(--color-border-subtle)">
        {items.map((r) => (
          <li key={r.id} className="space-y-1 px-4 py-3 text-[13px]">
            {r.result === "unchanged" ? (
              <p>
                Evidence rechecked against the scan read at {stamp(r.basis_read_at)} (revision {r.evidence_rev}): nothing material changed. Proceeding on the
                approved plan.
              </p>
            ) : (
              <>
                <p>
                  {r.result === "blocked" ? "Blocked" : "Changed"} since approval{r.blocked_reason ? `: ${humanize(r.blocked_reason)}` : ""}. Review the new
                  plan; it needs a new approval.
                </p>
                {r.changes.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-(--color-text-muted)">
                    {r.changes.map((c, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {humanize(c.item)}
                        {c.before !== undefined || c.after !== undefined ? `: ${jsonShort(c.before)} → ${jsonShort(c.after)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
            <Meta>
              Checked <Timestamp iso={r.created_at} />
            </Meta>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------- acceptances ------------------------------- */

export function AcceptancesPanel({ items, nameOf }: { items: IGAGovAcceptance[]; nameOf: (id: string) => string }) {
  if (items.length === 0) return null;
  return (
    <Panel title="Uncertainty accepted" count={String(items.length)} description="Gaps and unanalysed items an approver accepted, with the reason, for this version." flush>
      <ul className="divide-y divide-(--color-border-subtle)">
        {items.map((a) => (
          <li key={a.id} className="space-y-0.5 px-4 py-3 text-[13px]">
            <p className="font-medium">
              {ACCEPTANCE_WORDS[a.kind] ?? humanize(a.kind)}: <span className="font-mono text-xs">{a.item_key}</span>
            </p>
            <p>{a.reason}</p>
            <Meta>
              {nameOf(a.accepted_by)} · <Timestamp iso={a.accepted_at} />
            </Meta>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------- validations ------------------------------- */

const VALIDATION_RESULT: Record<GovValidationResultKind | "pending", StateView> = {
  pending: { label: "Waiting for CloudTrail", tone: "info" },
  matched: { label: "Matched", tone: "success", hint: "Every declared call was seen with the outcome expected." },
  partial: { label: "Partly seen", tone: "warning", hint: "Some declared calls matched and the rest were not seen." },
  not_seen: { label: "Not seen", tone: "neutral", hint: "No declared call was seen in the window. Not a failure." },
  contradicted: { label: "Contradicted", tone: "danger", hint: "A call had the opposite outcome to the one declared." },
};
const ITEM_RESULT: Record<string, StateView> = {
  pending: VALIDATION_RESULT.pending,
  matched: VALIDATION_RESULT.matched,
  not_seen: VALIDATION_RESULT.not_seen,
  contradicted: VALIDATION_RESULT.contradicted,
};

export function ValidationsPanel({ items, action }: { items: GovValidationView[]; action?: ReactNode }) {
  return (
    <Panel
      title="Declared test calls"
      count={items.length > 0 ? String(items.length) : undefined}
      actions={action}
      description="A test declared before it runs proves what the change does. Only a declared expected denial is excused from the unexpected-denials check."
    >
      {items.length === 0 ? (
        <Meta>No test calls declared.</Meta>
      ) : (
        <ul className="space-y-4">
          {items.map((v) => (
            <li key={v.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <StateChip state={VALIDATION_RESULT[v.result] ?? { label: humanize(v.result), tone: "neutral" }} />
                <span className="text-xs text-(--color-text-muted)">
                  {v.correlation === "assumed_session" ? "Assumed session" : "Dedicated workload"} · {stamp(v.window_start)} to {stamp(v.window_end)}
                </span>
              </div>
              {v.session_name ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-(--color-text-muted)">{v.correlation === "assumed_session" ? "Session name" : "Workload name"}</span>
                  <CopyValue value={v.session_name} what="Session name" />
                </div>
              ) : null}
              <ul className="space-y-0.5 text-[13px]">
                {v.items.map((i) => (
                  <li key={i.action} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{i.action}</span>
                    <span className="text-(--color-text-muted)">expected {i.expected}</span>
                    <StateChip state={ITEM_RESULT[i.result] ?? { label: humanize(i.result), tone: "neutral" }} />
                    {i.result === "contradicted" ? <span className="text-xs">{i.opposite_events} call(s) had the opposite outcome</span> : null}
                    {i.result === "matched" && i.expected === "denied" ? (
                      <span className="text-xs text-(--color-text-muted)">
                        {i.evidence.boundary_attributed ? "denied by the boundary" : "denied, cause not attributed"}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {v.note ? <Meta>{v.note}</Meta> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ----------------------------- health reports ------------------------------ */

export function HealthReportsPanel({ items, nameOf, action }: { items: IGAGovHealthReport[]; nameOf: (id: string) => string; action?: ReactNode }) {
  return (
    <Panel
      title="Reports from owners"
      count={items.length > 0 ? String(items.length) : undefined}
      actions={action}
      description="A problem report fails the canary's no-problem-reports gate. A working report is the owner's word that a kept service still works."
      flush={items.length > 0}
    >
      {items.length === 0 ? (
        <Meta>No reports yet.</Meta>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {items.map((r) => (
            <li key={r.id} className="space-y-0.5 px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <StateChip state={r.kind === "problem" ? { label: "Problem", tone: "danger" } : { label: "Working", tone: "success" }} />
                {r.service ? <span className="font-mono text-xs">{r.service}</span> : null}
              </div>
              {r.detail ? <p>{r.detail}</p> : null}
              <Meta>
                {nameOf(r.reported_by)} · <Timestamp iso={r.created_at} />
              </Meta>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------- migrations -------------------------------- */

/** Dedicated identity (§11): never "no permission change". */
export function MigrationsPanel({ items, revert }: { items: IGAGovWorkloadMigration[]; revert: boolean }) {
  return (
    <Panel
      title={revert ? "Moved back to the shared role" : "Moved to its own role"}
      count={items.length > 0 ? plural(items.length, "subject") : undefined}
      description={
        revert
          ? "Each subject runs as the shared role again. Access granted to the dedicated role by name elsewhere is not carried back unless it is updated."
          : "Each subject moves to its own role with the same IAM policies, inline copies and boundary. Access granted to the old role by name elsewhere does not follow unless it is updated. Narrowing the new role is a later, separate change."
      }
      flush={items.length > 0}
    >
      {items.length === 0 ? (
        <Meta>No subjects are recorded for this change yet.</Meta>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {items.map((m) => (
            <li key={m.id} className="space-y-1 px-4 py-3 text-[13px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{roleNameOf(m.subject_arn)}</span>
                <span className="text-xs text-(--color-text-muted)">{humanize(m.subject_kind)}</span>
                <StateChip state={{ label: MIGRATION_STATE_WORDS[m.state] ?? humanize(m.state), tone: m.state === "moved" ? "success" : m.state === "incomplete" ? "warning" : "info" }} />
              </div>
              <Meta>
                From {roleNameOf(m.from_role_arn)} to {roleNameOf(m.to_role_arn)}.
                {m.remaining_old_refs ? ` ${plural(m.remaining_old_refs, "reference")} still use the old role; AuthSec re-checks.` : ""}
                {!m.evidence_complete ? " The binding evidence is not complete yet." : ""}
                {m.checked_at ? (
                  <>
                    {" "}Checked <Timestamp iso={m.checked_at} />.
                  </>
                ) : null}
              </Meta>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
