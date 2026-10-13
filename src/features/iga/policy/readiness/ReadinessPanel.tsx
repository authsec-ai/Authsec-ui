/**
 * S0 "What AuthSec can change today" (SPEC-iga-phase3-policy.md §9.3, §7.1):
 * before anyone starts a proposal, how many roles can be changed directly, need
 * a pull request or export, need an owner, are blocked by collection gaps, are
 * not eligible, or need no change. The categories are mutually exclusive: the
 * server counts each role once, in the first category that applies, and the
 * counts cover every role reviewed, not the page. They are shown as the server
 * sent them and never derived from the rows loaded below.
 *
 * "See every reason" lists each role of the current page with ALL its reasons,
 * not only the deciding one, and where to fix each. A category opens Findings
 * filtered to exactly the roles the server put in it (`category`), so the two
 * lists never disagree.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  useGetGovReadinessQuery,
  type GovReadinessCategory,
  type GovReadinessReason,
  type GovReadinessRole,
} from "@/app/api/igaPolicyReadsApi";
import type { ConsoleTone } from "@/components/console/status";
import { StatusBadge } from "@/components/console/status";
import { classifyGraphError } from "@/features/iga/shared/graphErrors";
import { CursorPager } from "@/features/iga/shared/components/CursorPager";
import { Panel } from "@/features/iga/shared/components/Panel";
import { cn } from "@/lib/utils";

import { PolicyLoadFailure, classifyPolicyError, findingKind, humanize, plural, usePolicyCapabilities } from "../shared";
import { AccountSelect } from "../findings/AccountSelect";
import { READINESS_CATEGORY_LABEL, consolePath, coverageHrefFor, findingsHref } from "../findings/findingModel";

const PAGE = 25;

interface CategoryView {
  label: string;
  hint: string;
  tone: ConsoleTone;
}

const CATEGORY: Record<GovReadinessCategory, CategoryView> = {
  direct_eligible: { label: READINESS_CATEGORY_LABEL.direct_eligible, hint: "Enforcement access is verified and nothing blocks the change.", tone: "success" },
  iac_only: { label: READINESS_CATEGORY_LABEL.iac_only, hint: "No verified enforcement access, enforcement is off, or the role has a boundary of your own.", tone: "info" },
  needs_owner: { label: READINESS_CATEGORY_LABEL.needs_owner, hint: "No accountable owner for the role or the workloads that run as it.", tone: "warning" },
  blocked_by_collection: { label: READINESS_CATEGORY_LABEL.blocked_by_collection, hint: "AWS activity or resource policies were not fully read.", tone: "danger" },
  ineligible: { label: READINESS_CATEGORY_LABEL.ineligible, hint: "Service-linked, AWS-reserved or protected roles.", tone: "neutral" },
  no_change_needed: { label: READINESS_CATEGORY_LABEL.no_change_needed, hint: "No open findings.", tone: "neutral" },
};

/** The order a reader scans in: what can be done first, what is stuck last. */
const DISPLAY: GovReadinessCategory[] = ["direct_eligible", "iac_only", "needs_owner", "blocked_by_collection", "ineligible", "no_change_needed"];

const REASON: Record<string, string> = {
  activity_not_collected: "AWS activity was not read for this role",
  resource_policy_coverage_partial: "Resource policies were only partly collected",
  resource_policy_coverage_not_collected: "Resource policies were not collected",
  resource_policy_coverage_denied: "Resource policies could not be read",
  no_accountable_owner: "No accountable owner for the role or the workloads that run as it",
  enforcement_mode_findings_only: "Enforcement is off for this workspace",
  no_verified_enforcement_binding: "No verified enforcement access for this account",
  customer_boundary: "A permissions boundary you own is attached to the role",
  not_a_role: "It is not an IAM role",
  no_immutable_role_id: "AuthSec has no stable AWS role id for it",
  service_linked_role: "It is a service-linked role",
  aws_reserved_role: "It is an AWS-reserved role",
  authsec_protected: "It is tagged authsec:protected",
  authsec_managed_role: "AuthSec manages this role itself",
};

function reasonWords(r: GovReadinessReason): string {
  const base = REASON[r.code] ?? humanize(r.code);
  if (r.code === "no_verified_enforcement_binding") {
    return r.detail === "iac_source_mapped"
      ? `${base}; an infrastructure-as-code source is mapped, so a pull request is possible`
      : `${base}; no infrastructure-as-code source is mapped, so only export is possible`;
  }
  if (r.code === "customer_boundary" && r.detail) return `${base} (${r.detail})`;
  return base;
}

function reasonFix(r: GovReadinessReason, role: GovReadinessRole): { label: string; to: string } | null {
  switch (r.code) {
    case "activity_not_collected":
    case "resource_policy_coverage_partial":
    case "resource_policy_coverage_not_collected":
    case "resource_policy_coverage_denied":
      return { label: "Open the connection", to: coverageHrefFor(role.connector_id) };
    case "no_accountable_owner":
      return { label: "Assign an owner", to: findingsHref({ kind: "missing_owner", identity_id: role.identity_account_id }) };
    case "enforcement_mode_findings_only":
      return { label: "Open Setup", to: "/iga/policy/setup/settings" };
    case "no_verified_enforcement_binding":
      return r.detail === "iac_source_mapped"
        ? { label: "Open Enforcement setup", to: "/iga/policy/setup/enforcement" }
        : { label: "Open Setup", to: "/iga/policy/setup" };
    default:
      return null;
  }
}

export function ReadinessPanel({ ws }: { ws: string }) {
  const caps = usePolicyCapabilities(ws);
  const [account, setAccount] = useState("");
  const [open, setOpen] = useState(false);
  const [only, setOnly] = useState<GovReadinessCategory | null>(null);
  const [paging, setPaging] = useState<{ key: string; stack: string[] }>({ key: "", stack: [] });
  const stack = paging.key === account ? paging.stack : [];
  const cursor = stack[stack.length - 1];

  const q = useGetGovReadinessQuery({ ws, account: account || undefined, limit: PAGE, cursor }, { skip: caps.state !== "on" });
  const data = q.data?.data;
  const meta = q.data?.meta;
  const roles = useMemo(() => data?.roles ?? [], [data]);
  const shown = useMemo(() => (only ? roles.filter((r) => r.category === only) : roles), [roles, only]);
  const blockedConnectors = useMemo(
    () => [...new Set(roles.filter((r) => r.category === "blocked_by_collection" && r.connector_id).map((r) => r.connector_id as string))],
    [roles],
  );
  if (caps.state !== "on") return null;

  const failure = classifyPolicyError(q.error);
  const pickAccount = (v: string) => {
    setAccount(v);
    setPaging({ key: v, stack: [] });
    setOnly(null);
  };

  return (
    <Panel
      title="What AuthSec can change today"
      count={data ? `${plural(data.roles_reviewed, "role")} reviewed` : undefined}
      actions={<AccountSelect ws={ws} value={account} onChange={pickAccount} />}
      description="This release restricts whole AWS services for selected roles. It does not narrow actions or resources within the services a role keeps."
    >
      {q.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Checking what can change…
        </p>
      ) : failure && !data ? (
        <PolicyLoadFailure failure={failure} subject="readiness" onRetry={() => void q.refetch()} />
      ) : data && meta ? (
        meta.evaluated_rev === null ? (
          <p className="text-[13px] text-(--color-text-muted)">Readiness appears after the next scan publishes and is evaluated.</p>
        ) : data.roles_reviewed === 0 ? (
          <p className="text-[13px] text-(--color-text-muted)">
            No roles{account ? ` in account ${account}` : ""} had findings or activity evidence at rev {meta.evaluated_rev}.
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-(--color-border-subtle)">
              {DISPLAY.map((c) => (
                <li key={c} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5">
                  <span className={cn("w-10 shrink-0 text-right text-[20px] font-semibold tabular-nums leading-6", data.counts[c] === 0 ? "text-(--color-text-subtle)" : "text-(--color-text)")}>
                    {data.counts[c] ?? 0}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-(--color-text)">
                      {CATEGORY[c].label}
                      <StatusBadge tone={CATEGORY[c].tone}>{CATEGORY[c].label}</StatusBadge>
                    </p>
                    <p className="text-xs text-(--color-text-muted)">{CATEGORY[c].hint}</p>
                    {(data.counts[c] ?? 0) > 0 ? (
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <button
                          type="button"
                          className="font-medium text-(--color-primary-text) hover:underline"
                          onClick={() => {
                            setOnly(c);
                            setOpen(true);
                          }}
                        >
                          Show these roles
                        </button>
                        <CategoryLinks category={c} account={account} blockedConnectors={blockedConnectors} />
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-(--color-text-muted)">
              Each role is counted once, in the first category that applies:{" "}
              {data.categories.filter((c) => c !== "no_change_needed").map((c) => CATEGORY[c]?.label ?? humanize(c)).join(", then ")}.{" "}
              <button
                type="button"
                aria-expanded={open}
                className="font-medium text-(--color-primary-text) hover:underline"
                onClick={() => {
                  setOpen((o) => !o);
                  if (open) setOnly(null);
                }}
              >
                {open ? "Hide every reason" : "See every reason"}
              </button>
            </p>

            {open ? (
              <div className="rounded-md border border-(--color-border-subtle)">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
                  <span>
                    {only ? `${CATEGORY[only].label}: ` : ""}
                    {plural(shown.length, "role")} on this page{only ? " in this category" : ""}. The counts above cover every role.
                  </span>
                  {only ? (
                    <button type="button" className="font-medium text-(--color-primary-text) hover:underline" onClick={() => setOnly(null)}>
                      Show every category
                    </button>
                  ) : null}
                </div>
                {shown.length === 0 ? (
                  <p className="px-3 py-4 text-[13px] text-(--color-text-muted)">
                    No role of this category is on this page. Use the pager to look at the others.
                  </p>
                ) : (
                  <ul className="divide-y divide-(--color-border-subtle)">
                    {shown.map((r) => (
                      <RoleReasons key={r.identity_account_id} role={r} />
                    ))}
                  </ul>
                )}
                <CursorPager
                  meta={{ next_cursor: meta.next_cursor, limit: PAGE }}
                  pageIndex={stack.length}
                  rowsOnPage={roles.length}
                  onPrev={() => setPaging({ key: account, stack: stack.slice(0, -1) })}
                  onNext={(c) => setPaging({ key: account, stack: [...stack, c] })}
                  failure={failure ? classifyGraphError(q.error) : null}
                  onRetry={() => void q.refetch()}
                />
              </div>
            ) : null}
            {failure && data ? (
              <p role="alert" className="text-xs text-(--color-danger-text)">
                Could not refresh. This shows what loaded earlier.{" "}
                <button className="underline" onClick={() => void q.refetch()}>
                  Retry
                </button>
              </p>
            ) : null}
          </div>
        )
      ) : null}
    </Panel>
  );
}

function CategoryLinks({ category, account, blockedConnectors }: { category: GovReadinessCategory; account: string; blockedConnectors: string[] }) {
  const link = "font-medium text-(--color-primary-text) hover:underline";
  switch (category) {
    case "blocked_by_collection":
      return blockedConnectors.length > 0 ? (
        <>
          <Link to={findingsHref({ category, account })} className={link}>
            Open these roles&apos; findings
          </Link>
          {blockedConnectors.slice(0, 3).map((id, i) => (
            <Link key={id} to={coverageHrefFor(id)} className={link}>
              {blockedConnectors.length > 1 ? `Open coverage (connection ${i + 1})` : "Open the connection's Coverage"}
            </Link>
          ))}
        </>
      ) : (
        <Link to="/iga/connections" className={link}>
          Open Connections
        </Link>
      );
    case "needs_owner":
      return (
        <Link to={findingsHref({ category, account })} className={link}>
          Open these roles&apos; findings
        </Link>
      );
    case "iac_only":
      return (
        <>
          <Link to={findingsHref({ category, account })} className={link}>
            Open these roles&apos; findings
          </Link>
          <Link to="/iga/policy/setup" className={link}>
            Open Setup
          </Link>
        </>
      );
    case "direct_eligible":
      return (
        <Link to={findingsHref({ category, account })} className={link}>
          Open these roles&apos; findings
        </Link>
      );
    default:
      return null;
  }
}

function RoleReasons({ role }: { role: GovReadinessRole }) {
  const cat = CATEGORY[role.category];
  const remedy = consolePath(role.remedy);
  const open = Object.entries(role.open_findings ?? {}).filter(([, n]) => n > 0);
  return (
    <li className="space-y-1.5 px-3 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className="font-medium text-(--color-text)">{role.role_name || role.role_arn}</span>
          <span className="ml-2 text-xs text-(--color-text-muted)">{role.account_id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={cat?.tone ?? "neutral"}>{cat?.label ?? humanize(role.category)}</StatusBadge>
          {remedy ? (
            <Link to={remedy} className="text-xs font-medium text-(--color-primary-text) hover:underline">
              Open
            </Link>
          ) : null}
        </div>
      </div>
      {open.length > 0 ? (
        <p className="text-xs text-(--color-text-muted)">
          Open findings: {open.map(([k, n]) => `${n} ${findingKind(k).toLowerCase()}`).join(" · ")}
        </p>
      ) : null}
      {role.reasons.length === 0 ? (
        <p className="text-xs text-(--color-text-muted)">{role.category === "no_change_needed" ? "Nothing blocks or limits it, and nothing needs changing." : "No reason was given."}</p>
      ) : (
        <ul className="space-y-0.5">
          {role.reasons.map((r, i) => {
            const fix = reasonFix(r, role);
            const c = CATEGORY[r.category];
            return (
              <li key={`${r.code}:${i}`} className="flex flex-wrap items-baseline gap-x-2 text-xs text-(--color-text)">
                <span className="text-(--color-text-muted)">{c?.label ?? humanize(r.category)}:</span>
                <span>{reasonWords(r)}</span>
                {fix ? (
                  <Link to={fix.to} className="font-medium text-(--color-primary-text) hover:underline">
                    {fix.label}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
