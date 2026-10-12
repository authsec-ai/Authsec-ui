/**
 * Policy › Policies (SPEC-iga-phase3-policy.md §9.3 S7): every policy of the
 * workspace, what stage it is at, and what to do next.
 *
 * What the list can truthfully say. `GET /policies` serves a policy's current
 * version status, lifecycle, role count, owner and `next_action`; it serves no
 * counts, no delivery and no rollout stage (iga_gov_authoring_service.go
 * `GovPolicyView`). So the filters are chips on the server's `status`, not
 * tiles with invented numbers, and the Boundary chip and Delivery come from the
 * deployments list (the newest deployment per policy), which is read once and
 * said to be partial when more than one page exists. Application health and
 * the rollout stage live on the policy page. `last_verified_at` is never set
 * by the backend today: the column says "Not verified yet", never a date.
 *
 * Filters live in the URL. A cursor belongs to one filter set, so changing a
 * filter drops it. A failed read is a banner with Retry, never an empty table.
 */

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  GOV_POLICY_FAMILIES,
  GOV_VERSION_STATUSES,
  useListGovPoliciesQuery,
  type GovPolicyFamily,
  type GovPolicyLifecycle,
  type GovPolicyView,
  type GovVersionStatus,
} from "@/app/api/igaPolicyAuthoringApi";
import { useListGovDeploymentsQuery, type GovDeploymentView } from "@/app/api/igaPolicyDeploymentsApi";
import { ConsoleRowActions } from "@/components/console/iam-console";
import { Button } from "@/components/ui/button";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import {
  PolicyLoadFailure,
  PolicyShell,
  StateChip,
  classifyPolicyError,
  delivery,
  deploymentState,
  humanize,
  lifecycle,
  planKind,
  versionStatus,
} from "../shared";
import { LegacyPoliciesNotice } from "../legacy/LegacyPoliciesNotice";
import { NewPolicyButton } from "./NewPolicyChooser";
import { familyLabel, nextActionWords, policyHref, providerLabel } from "./policyModel";
import { useMemberNames } from "./useMemberNames";

const PAGE = 25;
const DEPLOYMENT_LOOK = 200;

type LifecycleParam = "" | GovPolicyLifecycle | "all";
const LIFECYCLE_OPTIONS: { value: LifecycleParam; label: string }[] = [
  { value: "", label: "Active and paused" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All, including archived" },
];

const STATUS_CHIPS: { value: "" | GovVersionStatus; label: string }[] = [
  { value: "", label: "All" },
  ...GOV_VERSION_STATUSES.map((v) => ({ value: v, label: versionStatus(v).label })),
];

/** The newest deployment of each policy that still says something about the boundary. */
function newestByPolicy(rows: GovDeploymentView[]): Map<string, GovDeploymentView> {
  const m = new Map<string, GovDeploymentView>();
  for (const d of rows) {
    if (d.state === "superseded" || d.state === "recovered") continue;
    const cur = m.get(d.policy_id);
    if (!cur || d.created_at > cur.created_at) m.set(d.policy_id, d);
  }
  return m;
}

const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

export default function PoliciesPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const nameOf = useMemberNames(ws);
  const [params, setParams] = useSearchParams();

  const family = params.get("family") ?? "";
  const status = (params.get("status") ?? "") as "" | GovVersionStatus;
  const life = (params.get("lifecycle") ?? "") as LifecycleParam;
  const q = params.get("q") ?? "";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
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
  const filterKey = [family, status, life, q].join("|");
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: filterKey, stack: [] });
  const stack = paging.key === filterKey ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const query = useListGovPoliciesQuery({
    ws,
    limit: PAGE,
    cursor,
    q: q || undefined,
    family: (family || undefined) as GovPolicyFamily | undefined,
    status: status || undefined,
    // The server has no "not archived": the default asks for everything and hides archived rows below.
    lifecycle: life === "" || life === "all" ? undefined : life,
  });
  const deployments = useListGovDeploymentsQuery({ ws, limit: DEPLOYMENT_LOOK });

  const failure = classifyPolicyError(query.error);
  // `currentData` is the answer for these filters; `data` still holds the previous filter's rows while the next load runs.
  const page = query.currentData;
  const all = useMemo(() => page?.data ?? [], [page]);
  const rows = useMemo(() => (life === "" ? all.filter((p) => p.lifecycle !== "archived") : all), [all, life]);
  const hiddenArchived = all.length - rows.length;
  const next = page?.meta.next_cursor ?? null;
  const newest = useMemo(() => newestByPolicy(deployments.data?.data ?? []), [deployments.data]);
  const depPartial = !!deployments.data?.meta.next_cursor;
  const filtered = !!(family || status || q || life);

  const clear = () => setParams({}, { replace: true });

  const columns = useMemo<AdaptiveColumn<GovPolicyView>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        label: "Policy",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-0">
              <Link to={policyHref(p.id)} className="block truncate text-[13px] font-medium text-(--color-primary-text) hover:underline">
                {p.name}
              </Link>
              {p.purpose ? <div className="truncate text-xs text-(--color-text-muted)">{p.purpose}</div> : null}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        label: "Status",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => <StatusChips policy={row.original} deployment={newest.get(row.original.id)} />,
        detail: (p) => <StatusChips policy={p} deployment={newest.get(p.id)} />,
      },
      {
        id: "next",
        header: "Next action",
        label: "Next action",
        priority: 2,
        approxWidth: 190,
        cell: ({ row }) => <span className="block truncate text-[13px]">{nextActionWords(row.original)}</span>,
        detail: (p) => nextActionWords(p),
      },
      {
        id: "scope",
        header: "Scope",
        label: "Scope",
        priority: 3,
        approxWidth: 100,
        cell: ({ row }) => <span className="text-[13px]">{row.original.scope_summary || "No roles"}</span>,
        detail: (p) => p.scope_summary || "No roles",
      },
      {
        id: "family",
        header: "Family",
        label: "Family",
        priority: 4,
        approxWidth: 130,
        cell: ({ row }) => <span className="block truncate text-[13px]">{familyLabel(row.original.family)}</span>,
        detail: (p) => familyLabel(p.family),
      },
      {
        id: "provider",
        header: "Provider",
        label: "Provider",
        priority: 5,
        approxWidth: 90,
        cell: ({ row }) => <span className="text-[13px]">{providerLabel(row.original.provider)}</span>,
        detail: (p) => providerLabel(p.provider),
      },
      {
        id: "delivery",
        header: "Delivery",
        label: "Delivery",
        priority: 6,
        approxWidth: 150,
        cell: ({ row }) => <DeliveryText deployment={newest.get(row.original.id)} partial={depPartial} />,
        detail: (p) => <DeliveryText deployment={newest.get(p.id)} partial={depPartial} />,
      },
      {
        id: "owner",
        header: "Owner",
        label: "Owner",
        priority: 7,
        approxWidth: 150,
        cell: ({ row }) => <span className="block truncate text-[13px]">{row.original.owner ? nameOf(row.original.owner) : "No owner"}</span>,
        detail: (p) => (p.owner ? nameOf(p.owner) : "No owner"),
      },
      {
        id: "verified",
        header: "Last verified",
        label: "Last verified",
        priority: 8,
        approxWidth: 140,
        cell: ({ row }) => <span className="text-[13px]">{row.original.last_verified_at ? <Timestamp iso={row.original.last_verified_at} /> : "Not verified yet"}</span>,
        detail: (p) => (p.last_verified_at ? <Timestamp iso={p.last_verified_at} /> : "Not verified yet"),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 64,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions
                label={`Actions for ${p.name}`}
                items={[
                  { label: "Open policy", onSelect: () => navigate(policyHref(p.id)) },
                  { label: "Open deployments", onSelect: () => navigate(policyHref(p.id, "deployments")) },
                  { label: "Open in Logs", onSelect: () => navigate(`/iga/logs?policy=${encodeURIComponent(p.id)}`) },
                ]}
              />
            </div>
          );
        },
      },
    ],
    [newest, depPartial, nameOf, navigate],
  );

  const emptyState =
    hiddenArchived > 0 && rows.length === 0 ? (
      <div className="space-y-2 py-2">
        <p>Every policy on this page is archived.</p>
        <Button variant="outline" size="sm" onClick={() => setParam("lifecycle", "all")}>
          Show archived
        </Button>
      </div>
    ) : filtered ? (
      <div className="space-y-2 py-2">
        <p>No policies match these filters.</p>
        <Button variant="outline" size="sm" onClick={clear}>
          Clear filters
        </Button>
      </div>
    ) : (
      <div className="mx-auto max-w-md space-y-3 py-4">
        <p className="text-sm font-medium text-foreground">Right-size your first role from a finding.</p>
        <p>A policy restricts the AWS services a role has not used. Findings show which roles have grants nobody uses; start from one.</p>
        <Button asChild className="text-white">
          <Link to="/iga/policy/findings">Open Findings</Link>
        </Button>
      </div>
    );

  return (
    <PolicyShell
      title="Policies"
      description="What AuthSec restricts, what stage each change is at, and what needs you next."
      actions={<NewPolicyButton />}
    >
      <LegacyPoliciesNotice ws={ws} />
      {failure && !page ? (
        <PolicyLoadFailure failure={failure} subject="policies" onRetry={() => void query.refetch()} />
      ) : (
        <>
          {failure && page ? (
            <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
              <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          <TableCard>
            <CardContent variant="flush">
              <div data-compact-toolbar className="space-y-3 border-b border-(--color-border-subtle) px-4 py-3">
                <div role="group" aria-label="Filter by version status" className="flex flex-wrap items-center gap-1.5">
                  {STATUS_CHIPS.map((c) => {
                    const on = status === c.value;
                    return (
                      <button
                        key={c.value || "all"}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setParam("status", c.value || null)}
                        className={cn(
                          "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors",
                          on
                            ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                            : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="relative flex min-w-[220px] max-w-[360px] flex-1 basis-[260px] items-center">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
                    <Input
                      type="search"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="Search by name"
                      aria-label="Search policies by name"
                      className="h-9 pl-9"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                    Family
                    <select value={family} onChange={(e) => setParam("family", e.target.value || null)} className={selectClass}>
                      <option value="">All families</option>
                      {GOV_POLICY_FAMILIES.map((f) => (
                        <option key={f} value={f}>
                          {familyLabel(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                    Lifecycle
                    <select value={life} onChange={(e) => setParam("lifecycle", e.target.value || null)} className={selectClass}>
                      {LIFECYCLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="flex-1" />
                  {filtered ? (
                    <button type="button" onClick={clear} className="h-8 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
                      Clear filters
                    </button>
                  ) : null}
                </div>
              </div>

              <AdaptiveTable
                tableId="iga-policy-policies"
                sizing="fit"
                rowDetails={false}
                cardsBelow={640}
                loading={query.isFetching && !page}
                emptyState={emptyState}
                columns={columns}
                data={rows}
                getRowId={(p) => p.id}
                onRowClick={(p) => navigate(policyHref(p.id))}
                enableSelection={false}
                enableExpansion={false}
                enablePagination={false}
              />

              {page ? (
                <CursorPager
                  meta={{ next_cursor: next, limit: PAGE }}
                  pageIndex={stack.length}
                  rowsOnPage={rows.length}
                  onPrev={() => setPaging({ key: filterKey, stack: stack.slice(0, -1) })}
                  onNext={(c) => setPaging({ key: filterKey, stack: [...stack, c] })}
                  failure={failure ? { kind: "failed" } : null}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
            </CardContent>
          </TableCard>

          {hiddenArchived > 0 && rows.length > 0 ? (
            <p className="text-xs text-(--color-text-muted)">
              {hiddenArchived} archived {hiddenArchived === 1 ? "policy is" : "policies are"} hidden on this page.{" "}
              <button className="font-medium text-(--color-primary-text) hover:underline" onClick={() => setParam("lifecycle", "all")}>
                Show archived
              </button>
            </p>
          ) : null}
          {deployments.isError ? (
            <p className="text-xs text-(--color-text-muted)">
              The boundary state and delivery could not be loaded, so those columns are empty. This does not change the list.{" "}
              <button className="font-medium text-(--color-primary-text) hover:underline" onClick={() => void deployments.refetch()}>
                Retry
              </button>
            </p>
          ) : depPartial ? (
            <p className="text-xs text-(--color-text-muted)">
              Boundary state and delivery are read from the first {DEPLOYMENT_LOOK} deployments. Open a policy for its full state.
            </p>
          ) : null}
        </>
      )}
    </PolicyShell>
  );
}

/** Version status, lifecycle and boundary: three different facts, three chips. */
function StatusChips({ policy, deployment }: { policy: GovPolicyView; deployment: GovDeploymentView | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {policy.status ? <StateChip state={versionStatus(policy.status)} /> : <StateChip state={{ label: "No version", tone: "neutral" }} />}
      {policy.lifecycle !== "active" ? <StateChip state={lifecycle(policy.lifecycle)} /> : null}
      {deployment ? (
        <StateChip
          state={{
            ...deploymentState(deployment.state),
            label: deployment.kind === "apply" ? `Boundary: ${deploymentState(deployment.state).label}` : `${planKind(deployment.kind)}: ${deploymentState(deployment.state).label}`,
          }}
        />
      ) : null}
    </div>
  );
}

function DeliveryText({ deployment, partial }: { deployment: GovDeploymentView | undefined; partial: boolean }) {
  if (deployment) return <span className="block truncate text-[13px]">{delivery(deployment.delivery) || humanize(deployment.delivery)}</span>;
  return (
    <span className="text-[13px] text-(--color-text-muted)" title="Delivery is shown once a deployment exists. Open the policy for the planned delivery.">
      {partial ? "Open policy" : "Not deployed yet"}
    </span>
  );
}

