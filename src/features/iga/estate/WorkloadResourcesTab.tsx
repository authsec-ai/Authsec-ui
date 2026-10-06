/**
 * Resources — "what can this workload reach?"
 *
 * One table row per resource, as seen from one service: a short readable
 * name (the full ARN on hover, one click to copy), the service, the account,
 * the region, the permission level and the policy that grants it. Everything
 * an investigator opens second — the actions, each grant's evidence and
 * confirmation time, conditions, restrictions and the Access Graph link — is
 * in the row's expansion, so the table scans in one pass.
 *
 * Read / Write / Broad are inferred from action and resource names (see
 * `shared/access.ts`); the toolbar's info tooltip says so, once. The data,
 * paging, filters (?filter=) and cache entry are unchanged: the first page is
 * still the same request the Overview reads for its summary.
 */

import { Fragment, useMemo, useState, type ComponentType } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Activity,
  Bell,
  Bot,
  Box,
  Boxes,
  ChevronRight,
  Copy,
  Database,
  Globe,
  HardDrive,
  KeyRound,
  Lock,
  MessageSquare,
  Network,
  ScrollText,
  Server,
  Shield,
  SlidersHorizontal,
  Workflow,
  Zap,
} from "lucide-react";

import {
  igaGraphApi,
  objectPath,
  refId,
  useListGraphWorkloadResourcesQuery,
  type GraphListMeta,
  type GrantLine,
  type ResourceSummary,
  type WorkloadDetail,
  type WorkloadResourceRow,
} from "@/app/api/igaGraphApi";
import { useAppDispatch } from "@/app/hooks";
import { CardContent } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { TableCard } from "@/theme/components/cards";

import {
  LEVEL_MEANING,
  LEVEL_RANK,
  accessScope,
  grantViews,
  matchesFilter,
  parseAccessFilter,
  serviceLabel,
  type AccessFilter,
  type AccessLevel,
  type GrantView,
} from "../shared/access";
import { classifyGraphError } from "../shared/graphErrors";
import { resolvePagedView } from "../shared/listView";
import { usePaging } from "../shared/paging";
import { useGraphRevision, useTrackRevision } from "../shared/revision";
import { POLICY_KIND_LABEL, RESOURCE_KIND_NOTE, statementLabel } from "../shared/labels";
import { ClaimFacts } from "../shared/components/ClaimFacts";
import { ActionList } from "../shared/components/ActionList";
import { CursorPager } from "../shared/components/CursorPager";
import { GraphStatePanel } from "../shared/components/GraphStatePanel";
import { IgaBadge } from "../shared/components/IgaBadge";
import { InfoTip } from "../shared/components/InfoTip";
import { formatAccountId } from "../shared/ids";
import { viaLink } from "../shared/links";
import { emptyGiven } from "../shared/listSummary";
import { CoverageSummary } from "../coverage/CoverageSummary";

const FILTER_LABEL: Record<AccessFilter, string> = { all: "All", broad: "Broad", read: "Read", write: "Write" };
const FILTERS = Object.keys(FILTER_LABEL) as AccessFilter[];

/** The level a reader scans for. "Other" is an action we could not classify — never rounded down to Read. */
const LEVEL_WORD: Record<AccessLevel, string> = { read: "Read", write: "Write", full: "Full", other: "Other" };

/* ------------------------------- presentation ------------------------------ */

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

const SERVICE_ICON: Record<string, Icon> = {
  s3: HardDrive,
  dynamodb: Database,
  rds: Database,
  secretsmanager: KeyRound,
  kms: Lock,
  ssm: SlidersHorizontal,
  logs: ScrollText,
  cloudwatch: Activity,
  kinesis: Activity,
  xray: Activity,
  sqs: MessageSquare,
  sns: Bell,
  lambda: Zap,
  ec2: Server,
  ecr: Boxes,
  ecs: Box,
  eks: Box,
  iam: Shield,
  sts: Shield,
  bedrock: Bot,
  "bedrock-agentcore": Bot,
  events: Workflow,
  states: Workflow,
  any: Globe,
};

function ServiceCell({ service }: { service: string }) {
  const I = SERVICE_ICON[service] ?? Box;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <I className="size-4 shrink-0 text-(--color-text-muted)" aria-hidden="true" />
      <span className="truncate">{serviceLabel(service)}</span>
    </span>
  );
}

/** "log-group" → "log groups", "policy" → "policies": only for the "All …" label. */
function plural(word: string): string {
  const w = word.replace(/[-_]/g, " ");
  if (/s$/.test(w)) return w;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

/**
 * What a reader calls the resource: the part of the ARN after its type —
 * "function:rag-agent-lab-retrieve" → "rag-agent-lab-retrieve",
 * "table/orders" → "orders". S3 keeps bucket/key whole (the bucket is the name).
 * A wildcard over everything is "All resources"; over one type, "All tables".
 */
function resourceName(r: ResourceSummary): { name: string; all: boolean } {
  const text = r.text.trim();
  if (text === "*") return { name: "All resources", all: true };
  const parts = text.split(":");
  if (parts[0] !== "arn" || parts.length < 6) return { name: text, all: accessScope(r) === "all" };
  const service = parts[2];
  const res = parts.slice(5).join(":");
  if (res === "*") return { name: `All ${serviceLabel(service)} resources`, all: true };
  if (accessScope(r) === "all") {
    const type = res.replace(/[:/]\*$/, "");
    return { name: `All ${plural(type)}`, all: true };
  }
  if (service === "s3") return { name: res, all: false };
  const sep = res.search(/[:/]/);
  return { name: sep > 0 && sep < res.length - 1 ? res.slice(sep + 1) : res, all: false };
}

function CopyIcon({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={done ? "Copied" : `Copy ${what}`}
      aria-label={`Copy ${what}`}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value, what, { toastSuccess: false });
        setDone(ok);
        if (ok) window.setTimeout(() => setDone(false), 1500);
      }}
      className="grid size-6 shrink-0 place-items-center rounded text-(--color-text-muted) opacity-0 transition-opacity hover:bg-(--color-surface-subtle) hover:text-(--color-text) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-(--color-primary) group-hover/row:opacity-100"
    >
      <Copy className={cn("size-3.5", done && "text-(--color-success-text)")} aria-hidden="true" />
    </button>
  );
}

function PermissionCell({ level, broad }: { level: AccessLevel; broad: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <IgaBadge tone={level === "write" ? "info" : level === "full" ? "warning" : "neutral"} title={LEVEL_MEANING[level]}>
        {LEVEL_WORD[level]}
      </IgaBadge>
      {broad ? (
        <IgaBadge tone="warning" title="Not limited to a named resource: a wildcard, or every action of the service.">
          Broad
        </IgaBadge>
      ) : null}
    </span>
  );
}

/* ---------------------------------- model --------------------------------- */

/** One grant on one resource, seen from one service. */
interface Entry {
  row: WorkloadResourceRow;
  grant: GrantLine;
  view: GrantView;
}

/** A table row: one resource as one service sees it, with every grant that reaches it. */
interface ResourceLine {
  key: string;
  row: WorkloadResourceRow;
  service: string;
  entries: Entry[];
  level: AccessLevel;
  broad: boolean;
  policies: string[];
}

function entriesOf(rows: WorkloadResourceRow[]): Entry[] {
  return rows.flatMap((row) => row.grants.flatMap((grant) => grantViews(row.resource, grant).map((view) => ({ row, grant, view }))));
}

function linesOf(entries: Entry[]): ResourceLine[] {
  const by = new Map<string, ResourceLine>();
  for (const e of entries) {
    const key = `${e.row.resource.ref}|${e.view.service}`;
    let l = by.get(key);
    if (!l) {
      l = { key, row: e.row, service: e.view.service, entries: [], level: e.view.level, broad: false, policies: [] };
      by.set(key, l);
    }
    l.entries.push(e);
    if (LEVEL_RANK[e.view.level] > LEVEL_RANK[l.level]) l.level = e.view.level;
    if (e.view.broad) l.broad = true;
    if (!l.policies.includes(e.grant.policy.name)) l.policies.push(e.grant.policy.name);
  }
  // Broad first, then the higher level, then by service and name.
  return [...by.values()].sort(
    (a, b) =>
      Number(b.broad) - Number(a.broad) ||
      LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
      serviceLabel(a.service).localeCompare(serviceLabel(b.service)) ||
      resourceName(a.row.resource).name.localeCompare(resourceName(b.row.resource).name),
  );
}

/* ---------------------------------- rows ---------------------------------- */

const TH = "h-10 px-4 text-left text-xs font-semibold text-(--color-text-secondary) whitespace-nowrap";
const TD = "px-4 py-2.5 align-middle text-[13px] text-(--color-text)";

function LineRow({
  line,
  workload,
  open,
  onToggle,
}: {
  line: ResourceLine;
  workload: WorkloadDetail;
  open: boolean;
  onToggle: () => void;
}) {
  const r = line.row.resource;
  const { name, all } = resourceName(r);
  const path = objectPath(r.ref);
  const from = { ref: workload.ref, name: workload.name };
  const panelId = `res-${line.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const account = r.account;
  const accountText = account ? (account.label && account.label !== account.id ? account.label : formatAccountId(account.id)) : "Unknown";

  return (
    <tr
      className={cn("group/row cursor-pointer border-b border-(--color-border-subtle) transition-colors hover:bg-(--color-surface-subtle)/60", open && "bg-(--color-surface-subtle)/60")}
      onClick={onToggle}
    >
      <td className="w-10 py-2.5 pl-3 pr-0 align-middle">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={`${open ? "Hide" : "Show"} details for ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="grid size-7 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text) focus-visible:outline-2 focus-visible:outline-(--color-primary)"
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden="true" />
        </button>
      </td>
      <td className={cn(TD, "max-w-[22rem]")}>
        <span className="flex min-w-0 items-center gap-1.5">
          {path && !all ? (
            <Link
              {...viaLink(path, from)}
              title={r.text}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 truncate font-medium text-(--color-primary-text) hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span title={r.text} className="min-w-0 truncate font-medium">
              {name}
            </span>
          )}
          {all ? (
            <IgaBadge tone="warning" title={r.text === "*" ? "The grant names *: every resource." : `Wildcard: ${r.text}`}>
              Wildcard
            </IgaBadge>
          ) : null}
          {r.text !== "*" ? <CopyIcon value={r.text} what="ARN" /> : null}
        </span>
      </td>
      <td className={cn(TD, "whitespace-nowrap")}>
        <ServiceCell service={line.service} />
      </td>
      <td className={cn(TD, "hidden whitespace-nowrap lg:table-cell")} title={account ? account.id : undefined}>
        <span className={cn(account && account.label && account.label !== account.id ? "" : "font-mono text-xs text-(--color-text-secondary)")}>{accountText}</span>
      </td>
      <td className={cn(TD, "hidden whitespace-nowrap md:table-cell")}>
        {r.region ? <span className="font-mono text-xs text-(--color-text-secondary)">{r.region}</span> : <span className="text-(--color-text-muted)" title="Global, or not stated">Global</span>}
      </td>
      <td className={cn(TD, "whitespace-nowrap")}>
        <PermissionCell level={line.level} broad={line.broad} />
      </td>
      <td className={cn(TD, "hidden max-w-[16rem] sm:table-cell")}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" title={line.policies.join(", ")}>
            {line.policies[0]}
          </span>
          {line.policies.length > 1 ? (
            <span className="shrink-0 rounded bg-(--color-surface-subtle) px-1.5 text-[11px] font-semibold tabular-nums text-(--color-text-secondary)" title={line.policies.join(", ")}>
              +{line.policies.length - 1}
            </span>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

function LineDetail({ line, workload, graphAvailable }: { line: ResourceLine; workload: WorkloadDetail; graphAvailable: boolean }) {
  const r = line.row.resource;
  const panelId = `res-${line.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const runsAs = workload.execution_role.state === "resolved" ? workload.execution_role : null;
  const graph = graphAvailable ? `/iga/estate/${encodeURIComponent(refId(workload.ref))}/graph?target=${encodeURIComponent(r.ref)}` : null;
  const path = objectPath(r.ref);
  const restrictions = line.row.restrictions;
  return (
    <tr className="border-b border-(--color-border-subtle) bg-(--color-surface-subtle)/60">
      <td colSpan={7} id={panelId} className="px-4 pb-4 pt-1 sm:pl-14">
        <div className="space-y-3">
          {/* The identifier, whole, and where to go next. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="flex min-w-0 max-w-full items-center gap-1.5">
              <code className="min-w-0 break-all font-mono text-(--color-text-secondary)" title={RESOURCE_KIND_NOTE[r.kind]}>
                {r.text}
              </code>
              {r.text !== "*" ? <CopyIcon value={r.text} what="ARN" /> : null}
            </span>
            <span className="flex items-center gap-3 sm:ml-auto">
              {path ? (
                <Link {...viaLink(path, { ref: workload.ref, name: workload.name })} className="font-medium text-(--color-primary-text) hover:underline">
                  Open resource
                </Link>
              ) : null}
              {graph ? (
                <Link to={graph} className="inline-flex items-center gap-1 font-medium text-(--color-primary-text) hover:underline">
                  <Network className="size-3.5" aria-hidden="true" />
                  Access Graph
                </Link>
              ) : null}
            </span>
          </div>

          {/* Mobile: the columns that are hidden at this width. */}
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs lg:hidden">
            <dt className="text-(--color-text-muted)">Account</dt>
            <dd className="font-mono">{r.account ? formatAccountId(r.account.id) : "Unknown"}</dd>
            <dt className="text-(--color-text-muted) md:hidden">Region</dt>
            <dd className="font-mono md:hidden">{r.region ?? "Global"}</dd>
          </dl>

          <ul className="space-y-2">
            {line.entries.map(({ grant: g, view }) => (
              <li key={g.claim} className="space-y-1.5 rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1.5">
                  <p className="text-xs text-(--color-text-secondary)">
                    <span className="font-medium text-(--color-text)">{g.policy.name}</span>
                    {" · "}
                    {POLICY_KIND_LABEL[g.policy.kind]}, {statementLabel(g.statement)}
                    {runsAs && g.via_identity === runsAs.identity && runsAs.name ? ` · via ${runsAs.name}` : null}
                    {g.via_group ? " · through a group" : null}
                  </p>
                  <ClaimFacts claim={g.claim} basis="declared" state={g.state} confirmedAt={g.last_confirmed_at} />
                </div>
                {view.actions.length ? <ActionList actions={view.actions} /> : null}
                {view.notActions.length ? (
                  <p className="text-xs text-(--color-text-secondary)">
                    Every action except <span className="font-mono text-(--color-text)">{view.notActions.join(", ")}</span>
                  </p>
                ) : null}
                {g.exclusions.length ? <p className="text-xs text-(--color-text-secondary)">Excludes {g.exclusions.map((x) => x.text).join(", ")}.</p> : null}
                {g.statement.conditional ? <p className="text-xs text-(--color-warning-text)">Has conditions (not evaluated).</p> : null}
              </li>
            ))}
          </ul>

          {restrictions.deny_statements || restrictions.permissions_boundary ? (
            <p className="text-xs text-(--color-warning-text)">
              May be restricted by{" "}
              {[
                restrictions.deny_statements ? `${restrictions.deny_statements} Deny ${restrictions.deny_statements === 1 ? "statement" : "statements"}` : null,
                restrictions.permissions_boundary ? "a permissions boundary" : null,
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              (listed, not evaluated).
            </p>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/* ----------------------------------- tab ---------------------------------- */

export function WorkloadResourcesTab({
  ws,
  workload,
  graphAvailable = true,
}: {
  ws: string;
  workload: WorkloadDetail;
  graphAvailable?: boolean;
}) {
  const dispatch = useAppDispatch();
  const { rev, epoch, refresh } = useGraphRevision(ws);
  // The filter is in the URL like every list's (§2.14.5); edits replace the entry.
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const filter = parseAccessFilter(params.get("filter"));
  const setFilter = (f: AccessFilter) => {
    const next = new URLSearchParams(params);
    if (f === "all") next.delete("filter");
    else next.set("filter", f);
    setParams(next, { replace: true, state: location.state });
  };
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setOpenKeys((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // Always the API's default order: it is what the Overview reads for its
  // summary, so the first page here is the same cache entry.
  const paging = usePaging("workload-resources-kind", epoch);
  const args = { ws, rev, key: paging.cacheKey, id: refId(workload.ref), sort: "kind" as const, cursor: paging.cursor };
  const q = useListGraphWorkloadResourcesQuery(args);
  const failure = classifyGraphError(q.error);
  useTrackRevision(ws, q.currentData, failure, (r, d) =>
    dispatch(igaGraphApi.util.upsertQueryData("listGraphWorkloadResources", { ...args, rev: r }, d)),
  );
  const view = resolvePagedView<WorkloadResourceRow, GraphListMeta>(q, paging.pageIndex);

  const all = useMemo(() => (view.kind === "rows" ? entriesOf(view.rows) : []), [view]);
  // Counted in table rows, so a tab's number is the rows it shows.
  const counts = useMemo(() => {
    const c = {} as Record<AccessFilter, number>;
    for (const f of FILTERS) c[f] = linesOf(all.filter((e) => matchesFilter(e.view, f))).length;
    return c;
  }, [all]);
  const lines = useMemo(() => linesOf(all.filter((e) => matchesFilter(e.view, filter))), [all, filter]);
  // The counts are for the page in view; more pages may hold more of each kind.
  const pagePartial = view.kind === "rows" && (!!view.meta.next_cursor || paging.pageIndex > 0);

  return (
    <TableCard>
      <CardContent variant="flush">
        <div className="flex flex-wrap items-center gap-3 border-b border-(--color-border-subtle) px-4 py-2.5">
          <div
            className="inline-flex rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.5"
            role="group"
            aria-label="Filter resources"
            title={pagePartial ? "Counts are for this page; other pages may have more." : undefined}
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--color-primary)",
                  filter === f
                    ? "bg-(--color-surface-raised) text-(--color-text) shadow-[0_1px_2px_rgb(15_23_42/0.08)]"
                    : "text-(--color-text-secondary) hover:text-(--color-text)",
                )}
              >
                {FILTER_LABEL[f]}
                {view.kind === "rows" ? (
                  <span className={cn("tabular-nums", counts[f] === 0 ? "text-(--color-text-muted)" : "text-(--color-text-secondary)")}>
                    {counts[f]}
                    {pagePartial ? "+" : ""}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <InfoTip label="How permissions are worked out">
            What this workload's execution identities declare. Read, Write and Broad are inferred from action and resource names; conditions, Deny
            statements and permissions boundaries are not evaluated.
          </InfoTip>
        </div>

        {q.currentData?.meta.coverage?.length ? (
          <div className="border-b border-(--color-border-subtle) p-3">
            <CoverageSummary subject="resources" ws={ws} gaps={q.currentData.meta.coverage} accountName={(id) => id} />
          </div>
        ) : null}

        {view.kind === "loading" ? (
          <div aria-busy="true" aria-label="Loading resources">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-(--color-border-subtle) px-4 py-3.5 last:border-b-0">
                <span className="h-3 w-48 animate-pulse rounded bg-(--color-surface-subtle)" />
                <span className="h-3 w-24 animate-pulse rounded bg-(--color-surface-subtle)" />
                <span className="ml-auto h-3 w-16 animate-pulse rounded bg-(--color-surface-subtle)" />
              </div>
            ))}
          </div>
        ) : view.kind === "failed" ? (
          <GraphStatePanel failure={view.failure} subject="resources" onRetry={() => void q.refetch()} onRefresh={refresh} />
        ) : !view.rows.length && !view.footerFailure ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-(--color-text)">No resources</p>
            <p className="mt-1 text-[13px] text-(--color-text-muted)">
              {workload.execution_role.state === "resolved"
                ? emptyGiven("No declared access names any resource.", q.currentData?.meta.coverage)
                : "No execution identity was resolved, so there is no declared access to read."}
            </p>
          </div>
        ) : (
          <>
            {!lines.length ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-(--color-text)">No {FILTER_LABEL[filter].toLowerCase()} access on this page</p>
                <button type="button" onClick={() => setFilter("all")} className="mt-2 text-[13px] font-medium text-(--color-primary-text) hover:underline">
                  Show all
                </button>
              </div>
            ) : (
              <div className={cn("overflow-x-auto", view.dim && "opacity-60")}>
                <table className="w-full min-w-[560px] border-collapse">
                  <thead className="bg-(--color-surface-subtle)">
                    <tr className="border-b border-(--color-border-subtle)">
                      <th className="w-10" aria-label="Details" />
                      <th className={TH}>Resource</th>
                      <th className={TH}>Service</th>
                      <th className={cn(TH, "hidden lg:table-cell")}>Account</th>
                      <th className={cn(TH, "hidden md:table-cell")}>Region</th>
                      <th className={TH}>Permission</th>
                      <th className={cn(TH, "hidden sm:table-cell")}>Granted by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const open = openKeys.has(l.key);
                      return (
                        <Fragment key={l.key}>
                          <LineRow line={l} workload={workload} open={open} onToggle={() => toggle(l.key)} />
                          {open ? <LineDetail line={l} workload={workload} graphAvailable={graphAvailable} /> : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <CursorPager
              meta={view.meta}
              pageIndex={paging.pageIndex}
              rowsOnPage={view.rows.length}
              onPrev={paging.prev}
              onNext={paging.next}
              failure={view.footerFailure}
              onRetry={() => void q.refetch()}
              onRefresh={refresh}
              previousPage={view.previousPage}
            />
          </>
        )}
      </CardContent>
    </TableCard>
  );
}
