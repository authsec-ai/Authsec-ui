/**
 * Policy › Deployments (SPEC-iga-phase3-policy.md §9.3 S8): every deployment of
 * the workspace across policies, with what needs a person first.
 *
 * What the list can truthfully do. `GET /deployments` filters only by
 * policy_id, state, account and kind, and orders `outcome_unresolved` first and
 * then by id (iga_gov_deploy_routes.go ListDeployments): there is no
 * `attention` or `delivery` filter and no newest-first order. So `?attention=1`
 * is a client rule over the rows of the page being shown (`needsOperator`),
 * said as such, and delivery is a column, not a filter. Filters live in the
 * URL; a cursor belongs to one filter set, so changing a filter drops it. A
 * failed read is a banner with Retry, never an empty table.
 */

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useListGovPoliciesQuery } from "@/app/api/igaPolicyAuthoringApi";
import {
  GOV_DEPLOYMENT_STATES,
  needsOperator,
  useListGovDeploymentsQuery,
  type GovDeploymentKind,
  type GovDeploymentState,
} from "@/app/api/igaPolicyDeploymentsApi";
import { DecisionBanner } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, classifyPolicyError, deploymentState, planKind } from "../shared";
import { DeploymentsTable } from "./DeploymentsTable";
import { deploymentHref, isLiveState } from "./deploymentModel";

const PAGE = 25;
const KINDS: GovDeploymentKind[] = ["apply", "undo", "remove_control", "split", "split_revert"];
const ACCOUNT_RE = /^\d{12}$/;

const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

export default function DeploymentsPage() {
  const ws = getWorkspaceId() ?? "";
  const [params, setParams] = useSearchParams();

  const state = (params.get("state") ?? "") as "" | GovDeploymentState;
  const kind = (params.get("kind") ?? "") as "" | GovDeploymentKind;
  const account = params.get("account") ?? "";
  const attention = params.get("attention") === "1";

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const [typedAccount, setTypedAccount] = useState(account);
  const accountValid = account === "" || ACCOUNT_RE.test(account);

  // A cursor belongs to one filter set.
  const filterKey = [state, kind, account].join("|");
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: filterKey, stack: [] });
  const stack = paging.key === filterKey ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const query = useListGovDeploymentsQuery(
    {
      ws,
      limit: PAGE,
      cursor,
      state: state || undefined,
      kind: kind || undefined,
      // The server answers 400 to an account that is not 12 digits: do not send a half-typed one.
      account: account && accountValid ? account : undefined,
    },
    { pollingInterval: 30_000, skipPollingIfUnfocused: true },
  );
  const policies = useListGovPoliciesQuery({ ws, limit: 200 });

  const failure = classifyPolicyError(query.error);
  const all = useMemo(() => query.currentData?.data ?? [], [query.currentData]);
  const rows = useMemo(() => (attention ? all.filter((d) => needsOperator(d, new Date())) : all), [all, attention]);
  const next = query.currentData?.meta.next_cursor ?? null;
  const policyNames = useMemo(() => new Map((policies.data?.data ?? []).map((p) => [p.id, p.name])), [policies.data]);
  const unresolved = all.filter((d) => d.state === "outcome_unresolved");
  const filtered = !!(state || kind || account || attention);
  const anyLive = all.some((d) => isLiveState(d.state));

  const clear = () => {
    setTypedAccount("");
    setParams({}, { replace: true });
  };

  const emptyState = attention ? (
    <div className="space-y-2 py-2">
      <p>
        Nothing on this page needs attention.
        {next ? " More deployments exist on the next page." : ""}
      </p>
      <Button variant="outline" size="sm" onClick={() => setParam("attention", null)}>
        Show every deployment
      </Button>
    </div>
  ) : filtered ? (
    <div className="space-y-2 py-2">
      <p>No deployments match these filters.</p>
      <Button variant="outline" size="sm" onClick={clear}>
        Clear filters
      </Button>
    </div>
  ) : (
    <div className="mx-auto max-w-md space-y-3 py-4">
      <p className="text-sm font-medium text-foreground">No deployments yet.</p>
      <p>A deployment appears when an approved policy is rolled out to a role, and stays here as the record of what changed.</p>
      <Button asChild className="text-white">
        <Link to="/iga/policy/policies">Open Policies</Link>
      </Button>
    </div>
  );

  return (
    <PolicyShell title="Deployments" description="Every change to AWS across policies, with what needs a person first.">
      {failure && !query.currentData ? (
        <PolicyLoadFailure failure={failure} subject="deployments" onRetry={() => void query.refetch()} />
      ) : (
        <>
          {failure && query.currentData ? (
            <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
              <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          {unresolved.length > 0 ? (
            <DecisionBanner
              tone="danger"
              title={`${unresolved.length === 1 ? "A deployment needs" : `${unresolved.length} deployments need`} your decision`}
              body="AuthSec could not confirm whether its change reached AWS. The role stays locked until you choose: re-read, accept what AWS shows, or emergency undo."
              actionLabel="Open it"
              actionHref={deploymentHref(unresolved[0].id, unresolved[0].policy_id)}
            />
          ) : null}

          <TableCard>
            <CardContent variant="flush">
              <div data-compact-toolbar className="space-y-3 border-b border-(--color-border-subtle) px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    aria-pressed={attention}
                    onClick={() => setParam("attention", attention ? null : "1")}
                    className={cn(
                      "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors",
                      attention
                        ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                        : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                    )}
                  >
                    Needs attention
                  </button>
                  <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                    State
                    <select value={state} onChange={(e) => setParam("state", e.target.value || null)} className={selectClass}>
                      <option value="">All states</option>
                      {GOV_DEPLOYMENT_STATES.map((s) => (
                        <option key={s} value={s}>
                          {deploymentState(s).label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                    Kind
                    <select value={kind} onChange={(e) => setParam("kind", e.target.value || null)} className={selectClass}>
                      <option value="">All kinds</option>
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {planKind(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="relative flex min-w-[200px] max-w-[260px] flex-1 items-center">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
                    <Input
                      value={typedAccount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                        setTypedAccount(v);
                        if (v === "" || ACCOUNT_RE.test(v)) setParam("account", v || null);
                      }}
                      placeholder="AWS account (12 digits)"
                      aria-label="Filter by AWS account id"
                      aria-invalid={typedAccount !== "" && !ACCOUNT_RE.test(typedAccount)}
                      inputMode="numeric"
                      className="h-9 pl-9"
                      autoComplete="off"
                    />
                  </label>
                  <span className="flex-1" />
                  {filtered ? (
                    <button type="button" onClick={clear} className="h-8 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)">
                      Clear filters
                    </button>
                  ) : null}
                </div>
                {typedAccount !== "" && !ACCOUNT_RE.test(typedAccount) ? (
                  <p className="text-xs text-(--color-text-muted)">An AWS account id has 12 digits; the filter applies when it is complete.</p>
                ) : null}
              </div>

              <DeploymentsTable tableId="iga-policy-deployments" rows={rows} loading={(query.isLoading || (query.isFetching && !query.currentData))} emptyState={emptyState} policyNames={policyNames} />

              {query.currentData ? (
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

          {attention ? (
            <p className="text-xs text-(--color-text-muted)">
              Needs attention is checked on this page of {PAGE}: blocked, failed or drifted changes, outcomes AuthSec could not establish, verification
              past its deadline, and customer applies past theirs. Gate failures are on the policy&apos;s Rollout tab.
            </p>
          ) : null}
          {anyLive ? <p className="text-xs text-(--color-text-muted)">Changes still in progress refresh about every 30 seconds.</p> : null}
        </>
      )}
    </PolicyShell>
  );
}
