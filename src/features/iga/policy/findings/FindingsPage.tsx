/**
 * Policy › Findings (SPEC-iga-phase3-policy.md §9.3 S1): what AuthSec found in
 * the latest evaluated scan, one card per role with that role's findings
 * beneath it, the evidence for each, who owns the role and the next action.
 *
 * What the list can truthfully say.
 * - The tiles and status counts are the server's summary of the evaluated
 *   revision across every status, never counted from the rows on this page.
 * - A page is a page of FINDINGS (an unused service is one finding), so a
 *   role whose findings straddle two pages appears on both; the card says so.
 * - Evidence ("3 of 14 used") and owners are read per role as its card comes
 *   into view; a read that fails leaves its cell empty and says nothing false.
 * - Filters live in the URL. A cursor belongs to one filter set and one
 *   revision, so changing a filter drops it, and a rejected cursor restarts
 *   the list rather than showing an error.
 */

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useGetGraphPipelineQuery } from "@/app/api/igaGraphApi";
import {
  FINDING_CONFIDENCES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  useGetGovFindingsSummaryQuery,
  useGetGovOwnersQuery,
  useGetGovSettingsQuery,
  useListGovActivityEvidenceQuery,
  useListGovFindingsByRoleQuery,
  type GovFinding,
  type GovObjectOwnership,
  type GovRevMeta,
  type GovRoleGroup,
} from "@/app/api/igaPolicyReadsApi";
import { MetricStrip, type MetricStripItemDef } from "@/components/console/MetricStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { InfoTip } from "@/features/iga/shared/components/InfoTip";
import { classifyGraphError } from "@/features/iga/shared/graphErrors";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import {
  FINDING_STATUS,
  PolicyLoadFailure,
  PolicyShell,
  PolicyUnavailable,
  SEVERITY,
  StateChip,
  classifyPolicyError,
  findingStatus,
  humanize,
  plural,
  relTime,
  severity as severityView,
  usePolicyCapabilities,
  usePolicyPermission,
} from "../shared";
import { AccountSelect } from "./AccountSelect";
import { FindingDrawer } from "./FindingDrawer";
import {
  ACTIONABLE_STATUSES,
  KIND_ORDER,
  KIND_TILE,
  bucketActivity,
  coverageHref,
  newPolicyHref,
  otherHeadline,
  parseConfidence,
  parseKind,
  parseSeverity,
  parseStatus,
  summarizeUnused,
  usedOfTotal,
} from "./findingModel";
import { useInView } from "./useInView";

const PAGE = 25;

const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

const CONFIDENCE_WORDS: Record<(typeof FINDING_CONFIDENCES)[number], string> = {
  qualified: "Qualified",
  age_unverified: "Grant age unverified",
  not_applicable: "Not applicable",
};

export default function FindingsPage() {
  return (
    <PolicyShell title="Findings" description="Recommendations from the latest evaluated scan.">
      <FindingsView />
    </PolicyShell>
  );
}

function FindingsView() {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const [params, setParams] = useSearchParams();

  const kind = parseKind(params.get("kind"));
  const status = parseStatus(params.get("status"));
  const sev = parseSeverity(params.get("severity"));
  const conf = parseConfidence(params.get("confidence"));
  const account = params.get("account") ?? "";
  const q = params.get("q") ?? "";
  const identityId = params.get("identity_id") ?? "";
  const workloadId = params.get("workload_id") ?? "";
  const findingId = params.get("finding");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (findingId) next.set("finding", findingId);
    setParams(next, { replace: true });
  };

  // The search box is typed into freely; the URL (and the request) follow it.
  const [typed, setTyped] = useState(q);
  useEffect(() => setTyped(q), [q]);
  useEffect(() => {
    if (typed === q) return;
    const t = setTimeout(() => setParam("q", typed.trim() || null), 300);
    return () => clearTimeout(t);
    // setParam closes over params; the timer restarts on each keystroke only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // A cursor belongs to one filter set.
  const filterKey = [kind, status, sev, conf, account, q, identityId, workloadId].join("|");
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: filterKey, stack: [] });
  const stack = paging.key === filterKey ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const list = useListGovFindingsByRoleQuery({
    ws,
    limit: PAGE,
    cursor,
    kind: kind ? [kind] : undefined,
    status: status ? [status] : undefined,
    severity: sev ? [sev] : undefined,
    confidence: conf ? [conf] : undefined,
    account: account || undefined,
    q: q || undefined,
    identity_id: identityId || undefined,
    workload_id: workloadId || undefined,
  });
  const summary = useGetGovFindingsSummaryQuery({ ws });
  const settings = useGetGovSettingsQuery({ ws });
  const pipeline = useGetGraphPipelineQuery({ ws });

  const failure = classifyPolicyError(list.error);
  // The list changed under a cursor: start again from the first page.
  const cursorRejected = failure?.code === "cursor_invalid";
  useEffect(() => {
    if (cursorRejected && stack.length > 0) setPaging({ key: filterKey, stack: [] });
  }, [cursorRejected, stack.length, filterKey]);

  const groups = list.currentData?.data ?? [];
  const meta: GovRevMeta | undefined = list.currentData?.meta;
  const next = meta?.next_cursor ?? null;
  const findingsOnPage = groups.reduce((n, g) => n + g.findings.length, 0);
  const filtered = !!(kind || status || sev || conf || account || q || identityId || workloadId);
  const sum = summary.data?.data;
  const evaluated = meta?.evaluated_rev ?? null;
  const neverEvaluated = !!meta && evaluated === null;

  if (caps.state === "on" && !caps.feature("findings")) {
    return <PolicyUnavailable reason={caps.featureReason("findings") ?? "findings are not served by this backend"} />;
  }

  const tiles: MetricStripItemDef[] = KIND_ORDER.map((k) => ({
    key: k,
    label: KIND_TILE[k],
    value: sum?.by_kind[k] ?? 0,
    tone: k === "unused_service" || k === "broad_grant" ? "warning" : "neutral",
    active: kind === k,
    onClick: () => setParam("kind", kind === k ? null : k),
    title: kind === k ? "Showing this kind. Click to show every kind." : `Show only ${KIND_TILE[k].toLowerCase()}`,
  }));

  return (
    <>
      {settings.data?.enforcement_mode === "findings_only" ? (
        <Notice tone="info">
          <strong className="font-medium">Enforcement is off for this workspace.</strong> You can review, approve and export changes; AuthSec writes nothing to AWS.{" "}
          <Link to="/iga/policy/setup/settings" className="font-medium underline">
            Open Setup
          </Link>
        </Notice>
      ) : null}

      <EvaluationLines meta={meta} publishedAt={pipeline.data?.current_rev === evaluated ? pipeline.data?.current_published_at ?? null : null} />

      {failure && !list.currentData && !cursorRejected ? (
        <PolicyLoadFailure failure={failure} subject="findings" onRetry={() => void list.refetch()} />
      ) : neverEvaluated && !filtered ? (
        <NeverEvaluated />
      ) : (
        <>
          <div className="overflow-x-auto" aria-label="Findings by kind">
            {summary.isError ? (
              <p className="text-xs text-(--color-text-muted)">
                The counts by kind could not be loaded.{" "}
                <button className="font-medium text-(--color-primary-text) hover:underline" onClick={() => void summary.refetch()}>
                  Retry
                </button>
              </p>
            ) : (
              <MetricStrip items={tiles} className="min-w-[720px]" aria-busy={summary.isLoading} />
            )}
          </div>

          {sum && Object.keys(sum.by_status).length > 0 ? (
            <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
              <StatusChip label="All" count={sum.total} on={!status} onClick={() => setParam("status", null)} />
              {FINDING_STATUSES.filter((s) => (sum.by_status[s] ?? 0) > 0).map((s) => (
                <StatusChip key={s} label={FINDING_STATUS[s]?.label ?? humanize(s)} count={sum.by_status[s] ?? 0} on={status === s} onClick={() => setParam("status", status === s ? null : s)} />
              ))}
            </div>
          ) : null}

          <div data-compact-toolbar className="flex flex-wrap items-center gap-3">
            <label className="relative flex min-w-[220px] max-w-[360px] flex-1 basis-[260px] items-center">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <Input
                type="search"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Search role or service"
                aria-label="Search findings by role name, role id or service"
                className="h-9 pl-9"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <AccountSelect ws={ws} value={account} onChange={(v) => setParam("account", v || null)} />
            <select aria-label="Severity" className={selectClass} value={sev ?? ""} onChange={(e) => setParam("severity", e.target.value || null)}>
              <option value="">Any severity</option>
              {FINDING_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY[s]?.label ?? humanize(s)}
                </option>
              ))}
            </select>
            <select aria-label="Confidence" className={selectClass} value={conf ?? ""} onChange={(e) => setParam("confidence", e.target.value || null)}>
              <option value="">Any confidence</option>
              {FINDING_CONFIDENCES.map((c) => (
                <option key={c} value={c}>
                  {CONFIDENCE_WORDS[c]}
                </option>
              ))}
            </select>
            {filtered ? (
              <button type="button" onClick={clearFilters} className="h-8 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
                Clear filters
              </button>
            ) : null}
          </div>

          {identityId || workloadId ? (
            <p className="text-xs text-(--color-text-muted)">
              Showing findings for one {identityId ? "role" : "workload"}.{" "}
              <button className="font-medium text-(--color-primary-text) hover:underline" onClick={() => { setParam("identity_id", null); setParam("workload_id", null); }}>
                Show every role
              </button>
            </p>
          ) : null}

          {cursorRejected ? (
            <p role="status" className="text-xs text-(--color-text-muted)">
              The list changed while you were paging, so it restarted from the first page.
            </p>
          ) : null}

          {failure && list.currentData && !cursorRejected ? (
            <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
              <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
              <button className="underline" onClick={() => void list.refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          {(list.isLoading || (list.isFetching && !list.currentData)) || (cursorRejected && !list.currentData) ? (
            <p role="status" className="py-6 text-center text-sm text-(--color-text-muted)">
              Loading findings…
            </p>
          ) : groups.length === 0 ? (
            filtered ? (
              <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-8 text-center text-sm">
                <p>No findings match these filters.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-8 text-center text-sm">
                <p className="font-medium text-foreground">Nothing to fix in this evaluation.</p>
                <p className="mt-1 text-(--color-text-muted)">No unused services, broad grants or ownership gaps were found{evaluated !== null ? ` at rev ${evaluated}` : ""}.</p>
              </div>
            )
          ) : (
            <div className="space-y-3" role="list" aria-label="Roles with findings">
              <div className="hidden px-4 text-xs font-medium text-(--color-text-muted) lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_auto] lg:gap-x-6">
                <span>Finding</span>
                <span>Evidence</span>
                <span className="w-[11rem] text-right">Next</span>
              </div>
              {groups.map((g, i) => (
                <RoleCard
                  key={`${g.identity_account_id ?? g.role_arn}:${i}`}
                  ws={ws}
                  group={g}
                  rev={evaluated}
                  straddles={(i === 0 && stack.length > 0 ? "before" : null) ?? (i === groups.length - 1 && next ? "after" : null)}
                  onOpen={(id) => setParam("finding", id)}
                />
              ))}
            </div>
          )}

          {list.currentData ? (
            <div className="overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
              <CursorPager
                meta={{ next_cursor: next, limit: PAGE }}
                pageIndex={stack.length}
                rowsOnPage={findingsOnPage}
                onPrev={() => setPaging({ key: filterKey, stack: stack.slice(0, -1) })}
                onNext={(c) => setPaging({ key: filterKey, stack: [...stack, c] })}
                failure={failure && !cursorRejected ? classifyGraphError(list.error) : null}
                onRetry={() => void list.refetch()}
              />
            </div>
          ) : null}
        </>
      )}

      <FindingDrawer ws={ws} findingId={findingId} onClose={() => setParam("finding", null)} onOpenFinding={(id) => setParam("finding", id)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Notice({ tone, children }: { tone: "info" | "warning"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border-l-2 px-4 py-2.5 text-[13px]",
        tone === "info"
          ? "border-l-(--color-primary) bg-(--color-primary-soft) text-(--color-text)"
          : "border-l-(--color-warning-text) bg-(--color-warning-soft) text-(--color-warning-text)",
      )}
    >
      {children}
    </p>
  );
}

function NeverEvaluated() {
  return (
    <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">Findings appear after the next scan publishes.</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-(--color-text-muted)">
        AuthSec evaluates every published scan. Nothing has been evaluated yet, so there is nothing to show, which is not the same as nothing being wrong.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/iga/connections">Open Connections</Link>
      </Button>
    </div>
  );
}

/** Which revision the list is, and when the newest evaluation failed or is still running. */
function EvaluationLines({ meta, publishedAt }: { meta: GovRevMeta | undefined; publishedAt: string | null }) {
  if (!meta) return null;
  const { evaluated_rev: rev, latest_rev: latest, last_evaluation: last } = meta;
  const failedNewer = last?.status === "failed" && last.rev !== rev;
  const runningNewer = last?.status === "running" && last.rev !== rev;
  return (
    <div className="space-y-1 text-xs text-(--color-text-muted)">
      {rev !== null ? (
        <p>
          Evaluated at the scan {publishedAt ? <>published {relTime(publishedAt)} </> : null}(rev {rev}).
        </p>
      ) : null}
      {failedNewer ? (
        <p role="status">
          {rev !== null ? `Showing rev ${rev}; evaluation` : "Evaluation"} of rev {last.rev} failed — retried at the next scan.
        </p>
      ) : runningNewer ? (
        <p role="status">A newer scan (rev {last.rev}) is being evaluated. Findings update when it finishes.</p>
      ) : rev !== null && latest !== null && latest > rev && !last ? (
        <p role="status">A newer scan (rev {latest}) has not been evaluated yet.</p>
      ) : null}
    </div>
  );
}

function StatusChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
        on
          ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function RoleCard({
  ws,
  group,
  rev,
  straddles,
  onOpen,
}: {
  ws: string;
  group: GovRoleGroup;
  rev: number | null;
  straddles: "before" | "after" | null;
  onOpen: (id: string) => void;
}) {
  const { ref, seen } = useInView();
  const id = group.identity_account_id;
  const unused = useMemo(() => summarizeUnused(group.findings), [group.findings]);
  const others = group.findings.filter((f) => f.kind !== "unused_service");

  const owners = useGetGovOwnersQuery({ ws, object_kind: "identity_account", object_id: id ?? "" }, { skip: !seen || !id });
  const evidence = useListGovActivityEvidenceQuery({ ws, identityId: id ?? "", rev: rev ?? undefined }, { skip: !seen || !id || unused.findings.length === 0 });
  const buckets = useMemo(() => (evidence.data ? bucketActivity(evidence.data.data, unused.services) : null), [evidence.data, unused.services]);

  const name = group.role_name || group.role_arn || "Unnamed role";
  const account = group.role_arn.split(":")[4] ?? "";

  return (
    <section ref={ref} role="listitem" aria-label={name} className="overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold text-(--color-text)">{name}</h3>
          <p className="truncate text-xs text-(--color-text-muted)">IAM role{account ? ` · ${account}` : ""}</p>
        </div>
        <p className="text-xs text-(--color-text-muted)">
          Owner:{" "}
          <span className="font-medium text-(--color-text)">
            {!id ? "unknown" : owners.isLoading || !seen ? "…" : owners.isError ? "unavailable" : <OwnerWords data={owners.data} />}
          </span>
        </p>
      </header>

      <div className="divide-y divide-(--color-border-subtle)">
        {unused.findings.length > 0 ? (
          <FindingLine
            title={`${plural(unused.services.length, "service")} unused`}
            sub={unused.minDays !== null ? `No reported attempt in ${plural(unused.minDays, "day")}` : "No reported attempt"}
            statuses={unused.findings.map((f) => f.current.status)}
            evidence={
              <>
                <p>
                  {buckets ? `${usedOfTotal(buckets)} · ` : ""}
                  {unused.minDays !== null ? plural(unused.minDays, "day") : "window unknown"}
                  {unused.maxDays !== null && unused.maxDays !== unused.minDays ? ` or more` : ""}
                </p>
                {unused.ageUnverified.length > 0 ? (
                  <p className="flex items-center gap-1">
                    {plural(unused.ageUnverified.length, "grant")} predate{unused.ageUnverified.length === 1 ? "s" : ""} AuthSec
                    <InfoTip label="Why grant age matters">
                      These grants existed before AuthSec's first scan, so AuthSec cannot say how long they have gone unused. The owner is asked to confirm they were not added recently.
                    </InfoTip>
                  </p>
                ) : null}
              </>
            }
            onOpen={() => onOpen(unused.findings[0].id)}
            action={<UnusedAction findings={unused.findings} onOpen={() => onOpen(unused.findings[0].id)} />}
          />
        ) : null}
        {others.map((f) => (
          <OtherLine key={f.id} f={f} onOpen={() => onOpen(f.id)} />
        ))}
      </div>

      {straddles ? (
        <p className="border-t border-(--color-border-subtle) px-4 py-1.5 text-xs text-(--color-text-muted)">
          More findings for this role may be on the {straddles === "before" ? "previous" : "next"} page.
        </p>
      ) : null}
    </section>
  );
}

function OwnerWords({ data }: { data: GovObjectOwnership | undefined }) {
  if (!data) return <>unavailable</>;
  const people = data.resolved.filter((r) => r.member);
  if (people.length === 0) return <>No owner</>;
  const first = people[0].name || people[0].email || "A member";
  return (
    <>
      {first}
      {people.length > 1 ? ` +${people.length - 1}` : ""}
      {!data.has_accountable ? <span className="font-normal text-(--color-warning-text)"> (none accountable)</span> : null}
    </>
  );
}

function FindingLine({
  title,
  sub,
  statuses,
  evidence,
  onOpen,
  action,
}: {
  title: string;
  sub?: string;
  statuses: string[];
  evidence: React.ReactNode;
  onOpen: () => void;
  action: React.ReactNode;
}) {
  const distinct = [...new Set(statuses)];
  return (
    <div className="grid gap-x-6 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_auto] lg:items-center">
      <div className="min-w-0">
        <button type="button" onClick={onOpen} className="text-left text-[13px] font-medium text-(--color-primary-text) hover:underline">
          {title}
        </button>
        {sub ? <p className="text-xs text-(--color-text-muted)">{sub}</p> : null}
        {distinct.some((s) => !ACTIONABLE_STATUSES.includes(s as never)) ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {distinct.map((s) => (
              <StateChip key={s} state={findingStatus(s)} />
            ))}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 space-y-0.5 text-[13px] text-(--color-text)">{evidence}</div>
      <div className="lg:w-[11rem] lg:text-right">{action}</div>
    </div>
  );
}

function UnusedAction({ findings, onOpen }: { findings: GovFinding[]; onOpen: () => void }) {
  const ids = findings.filter((f) => ACTIONABLE_STATUSES.includes(f.current.status)).map((f) => f.id);
  if (ids.length === 0) {
    return (
      <Button variant="outline" size="sm" onClick={onOpen}>
        Review
      </Button>
    );
  }
  return (
    <Button asChild size="sm" className="text-white">
      <Link to={newPolicyHref(ids)}>Generate tighter policy</Link>
    </Button>
  );
}

function OtherLine({ f, onOpen }: { f: GovFinding; onOpen: () => void }) {
  const admin = usePolicyPermission("iga:admin");
  const words = otherHeadline(f);
  const sevView = f.condition ? severityView(f.condition.severity) : null;
  let action: React.ReactNode;
  if (f.kind === "activity_not_read") {
    action = (
      <Button asChild variant="outline" size="sm">
        <Link to={coverageHref(f)}>View in Connections</Link>
      </Button>
    );
  } else if (f.kind === "missing_owner" && admin.offered) {
    action = (
      <Button variant="outline" size="sm" onClick={onOpen}>
        Assign owner
      </Button>
    );
  } else {
    action = (
      <Button variant="outline" size="sm" onClick={onOpen}>
        Review
      </Button>
    );
  }
  return (
    <FindingLine
      title={words.title}
      sub={sevView && f.kind !== "activity_not_read" ? `${sevView.label} severity` : undefined}
      statuses={[f.current.status]}
      evidence={<p>{words.evidence || " "}</p>}
      onOpen={onOpen}
      action={action}
    />
  );
}
