/**
 * Connections (SPEC-console-revamp.md §Connections): what is connected, is it
 * reporting, is its data usable?
 *
 * One row per connection across providers, fitted to the available width. The
 * Status column names the primary condition and one line of what still holds
 * and what to do; the four-way breakdown is on the connection's Overview. Every
 * state is distinct here: loading, failed, unauthorised, empty, filtered-empty.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";

import { connectionsApi, useListDiscoveryConnectionsQuery, type Connection, type ConnectionProvider } from "@/app/api/connectionsApi";
import { useListAwsConnectorsQuery, useListGcpConnectorsQuery, type CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { useConvertGitHubAppManifestMutation } from "@/app/api/discoveryApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsolePage } from "@/components/console/ConsolePage";
import { HowItWorks } from "@/components/console/HowItWorks";
import { PageAbout } from "@/components/console/PageAbout";
import { AUTH_METHOD_LABEL } from "@/features/discovery/cloud/gcp/gcpConnectorCopy";
import { cn } from "@/lib/utils";
import { ConsoleRowActions, type ConsoleActionItem } from "@/components/console/iam-console";
import { tableFailure } from "@/components/console/load-failure";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { AddConnectionDialogs, type Wizard } from "./AddConnectionDialogs";
import {
  ActionFailureList,
  NameLink,
  PendingWord,
  StatusBlock,
} from "./ConnectionParts";
import { ConnectMoreSources, FilterPills, TableToolbar } from "./ConnectionsListParts";
import { awsAttrs, gcpAttrs } from "./providerData";
import {
  PROVIDERS,
  actionsOf,
  coverageText,
  detailHref,
  k8sHealthLine,
  discoveryLink,
  graphText,
  hasFriendlyName,
  isConnectionProvider,
  isFilterKey,
  statusFilterOf,
  STATUS_FILTERS,
  lastScanText,
  providerWord,
  revokeWord,
  scanInFlight,
  typeWord,
  type StatusFilterKey,
} from "./connectionModel";
import { useAdminAccess } from "./permissions";
import { ProviderGlyph } from "./ProviderGlyph";
import { TruncatedId } from "../shared/components/TruncatedId";
import { RevokeConnectionDialog } from "./RevokeConnectionDialog";
import { useConnectionActions, type ActionKind } from "./useConnectionActions";

const POLL_MS = 5_000;

/** The scan, in the Last scan column: "Finished" is the usual case and goes unsaid. */
function scanLine(c: Connection): string {
  const text = lastScanText(c);
  return c.provider !== "k8s" && c.scan.state === "finished" ? text.replace(/^Finished /, "") || "Finished" : text;
}

/** What the graph made of it. The revision counter is on the detail page, not here. */
function graphLine(c: Connection): string {
  const g = graphText(c);
  if (c.graph.state === "published") return c.graph.published_at ? g.text.replace(/^Published/, "Graph updated") : "Graph updated";
  return g.note ? `${g.text} · ${g.note}` : g.text;
}

/** What the search box matches: the name, the account/project/cluster id, the provider and the scope. */
function searchText(c: Connection): string {
  return [c.name, c.native_id, providerWord(c.provider), typeWord(c), c.scope_summary].join(" ").toLowerCase();
}

/**
 * Where "Fix" goes for an account that needs it: the Overview says what failed
 * and what to do; a coverage gap is explained on Coverage. Null when nothing
 * needs fixing (a revoked account is history, not a fault).
 */
function fixHref(c: Connection): string | null {
  const f = statusFilterOf(c);
  if (f === "attention") return detailHref(c.id);
  if (f === "partial") return detailHref(c.id, "coverage");
  return null;
}

/** The role's name from its ARN: "arn:aws:iam::1:role/path/AuthSecReader" → "AuthSecReader". */
function roleName(arn: string | undefined): string | null {
  if (!arn) return null;
  return arn.slice(arn.lastIndexOf("/") + 1) || arn;
}

/** A provider's own connector fact: loading, not readable, or the value. */
function connectorFact(
  connectors: { data?: CloudConnector[]; isLoading: boolean; isError: boolean },
  id: string,
  pick: (c: CloudConnector) => string | null | undefined,
): string {
  if (connectors.isLoading) return "…";
  const found = connectors.data?.find((x) => x.id === id);
  if (!found) return connectors.isError ? "Could not load" : "—";
  return pick(found) || "—";
}

/** The provider tabs' own words for the explainer line above the table. */
const PROVIDER_COLUMNS: Record<ConnectionProvider, string> = {
  aws: "Regions · Discovery role · Coverage",
  gcp: "Reader service account · Sign-in · Scope · Coverage",
  k8s: "Agent · Namespaces · Coverage",
  github: "Repositories · Coverage",
};

const HOW_DISCOVERY_WORKS = [
  {
    label: "1 · Connect",
    title: "An AWS role, a Google Cloud reader, a Kubernetes agent or a GitHub App",
    body: "Discovery only reads; it does not change your resources.",
  },
  {
    label: "2 · Scan",
    title: "On demand or on a schedule",
    body: "Identities, their permissions and the workloads that run as them.",
  },
  {
    label: "3 · Result",
    title: "Workloads appear in Discovery",
    body: "Each with an access graph of what it can reach.",
  },
];

export default function ConnectionsPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canAdminister, loading: adminLoading, unknown: adminUnknown } = useAdminAccess();

  // A scan in flight changes the row; follow it until it settles.
  const [poll, setPoll] = useState(0);
  const query = useListDiscoveryConnectionsQuery(undefined, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const inFlight = all.some(scanInFlight);
  useEffect(() => setPoll(inFlight ? POLL_MS : 0), [inFlight]);

  // ── URL-backed list state: q, type, status ──────────────────────────────
  const search = searchParams.get("q") ?? "";
  const typeParam = searchParams.get("type");
  const type: ConnectionProvider | null = isConnectionProvider(typeParam) ? typeParam : null;
  const statusParam = searchParams.get("status");
  const status: StatusFilterKey = isFilterKey(statusParam) ? statusParam : "all";
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // ── Adding a connection ────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizard, setWizard] = useState<Wizard>(null);
  const [convertManifest] = useConvertGitHubAppManifestMutation();

  // GitHub's App-manifest flow returns the operator here with ?code=<single-use>.
  // Exchange it at once for the App id and private key, then strip the code from
  // the URL so a refresh cannot replay a code that is already spent.
  const code = searchParams.get("code");
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await convertManifest({ code }).unwrap();
        if (cancelled) return;
        toast.success(`GitHub App "${info.name}" created`);
        // The wizard skips the App step now that one exists, so the operator lands
        // on the organisation step they were heading for.
        setWizard("github");
      } catch (err) {
        if (cancelled) return;
        toast.error((err as { data?: { error?: string } })?.data?.error ?? "Could not finish creating the GitHub App.");
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(window.location.search);
          next.delete("code");
          next.delete("state");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, convertManifest, setSearchParams]);

  const added = (id?: string) => {
    dispatch(connectionsApi.util.invalidateTags(["Connections"]));
    // A new GitHub organisation scans nothing until repositories are chosen.
    if (id) navigate(detailHref(id, "scope"));
  };

  // ── ?open=github-rules (the old Detection rules address) ────────────────
  const openRules = searchParams.get("open") === "github-rules";
  const githubConnections = useMemo(() => all.filter((c) => c.provider === "github"), [all]);
  useEffect(() => {
    if (openRules && query.isSuccess && githubConnections.length === 1) {
      navigate(detailHref(githubConnections[0].id, "rules"), { replace: true });
    }
  }, [openRules, query.isSuccess, githubConnections, navigate]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const { pending, failures, run, dismiss } = useConnectionActions();
  const [revokeTarget, setRevokeTarget] = useState<Connection | null>(null);
  const revokeError = revokeTarget ? failures.find((f) => f.id === revokeTarget.id && f.kind === "revoke")?.message : undefined;
  const lastGitHubOrg = githubConnections.length === 1;

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    if (await run(revokeTarget, "revoke")) setRevokeTarget(null);
  };
  const cancelRevoke = () => {
    if (revokeTarget) dismiss(revokeTarget.id, "revoke");
    setRevokeTarget(null);
  };

  // ── Rows ───────────────────────────────────────────────────────────────
  // Revoked connections are history: hidden until asked for, or until the Status filter names them.
  const showRevoked = searchParams.get("revoked") === "1";
  const revokedCount = useMemo(() => all.filter((c) => statusFilterOf(c) === "revoked").length, [all]);
  const hidingRevoked = status === "all" && !showRevoked;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (c) =>
        (!type || c.provider === type) &&
        (!q || searchText(c).includes(q)) &&
        (status === "all" ? showRevoked || statusFilterOf(c) !== "revoked" : statusFilterOf(c) === status),
    );
  }, [all, type, search, status, showRevoked]);
  const inScope = hidingRevoked ? all.length - revokedCount : all.length;

  // The provider tab is a view, not a filter: Clear filters keeps it.
  const filtered = !!search.trim() || status !== "all";
  const unconnected = PROVIDERS.filter((p) => !all.some((c) => c.provider === p));
  const clearFilters = () => setSearchParams(type ? { type } : {}, { replace: true });

  // A provider tab shows that provider's own facts, read from its own connector
  // list — only on that tab, so the All view costs no extra reads.
  const awsConnectors = useListAwsConnectorsQuery(undefined, { skip: type !== "aws" });
  const gcpConnectors = useListGcpConnectorsQuery(undefined, { skip: type !== "gcp" });

  const providerColumns = useMemo<AdaptiveColumn<Connection>[]>(() => {
    const text = (id: string, header: string, priority: number, value: (c: Connection) => string, approxWidth = 170): AdaptiveColumn<Connection> => ({
      id,
      header,
      label: header,
      priority,
      approxWidth,
      cell: ({ row }) => <span className="block truncate text-[13px]" title={value(row.original)}>{value(row.original)}</span>,
      detail: (c) => value(c),
    });
    const coverage = text("coverage_state", "Coverage", 5, (c) => coverageText(c), 150);
    switch (type) {
      case "aws":
        return [
          text("aws_regions", "Regions", 3, (c) => connectorFact(awsConnectors, c.id, (x) => awsAttrs(x)?.regions?.join(", ") || c.scope_summary)),
          text("aws_role", "Discovery role", 4, (c) => connectorFact(awsConnectors, c.id, (x) => roleName(awsAttrs(x)?.role_arn))),
          coverage,
        ];
      case "gcp":
        return [
          text("gcp_reader", "Reader service account", 3, (c) => connectorFact(gcpConnectors, c.id, (x) => gcpAttrs(x).reader_sa_email), 220),
          text("gcp_auth", "Sign-in", 4, (c) =>
            connectorFact(gcpConnectors, c.id, (x) => {
              const m = gcpAttrs(x).auth_method;
              return m ? (AUTH_METHOD_LABEL[m] ?? m) : null;
            }),
          ),
          text("gcp_scope", "Scope", 4, (c) => c.scope_summary || "—", 140),
          coverage,
        ];
      case "k8s":
        return [
          text("k8s_agent", "Agent", 3, (c) => k8sHealthLine(c), 220),
          text("k8s_namespaces", "Namespaces", 4, (c) => c.scope_summary || "—", 140),
          coverage,
        ];
      case "github":
        return [text("github_repos", "Repositories", 3, (c) => c.scope_summary || "—", 160), coverage];
      default:
        return [];
    }
  }, [type, awsConnectors, gcpConnectors]);

  const columns = useMemo<AdaptiveColumn<Connection>[]>(
    () => [
      {
        id: "name",
        header: "Account",
        label: "Account",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const c = row.original;
          // A name first, the id under it in mono (C-09): with no friendly
          // name of its own, the connection is named for what it is.
          const name = hasFriendlyName(c) ? c.name : typeWord(c);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <ProviderGlyph provider={c.provider} />
              <div className="min-w-0 space-y-0.5">
                <NameLink to={detailHref(c.id)}>{name}</NameLink>
                {name !== c.native_id ? (
                  <div className="flex min-w-0">
                    <TruncatedId value={c.native_id} what={c.provider === "aws" ? "Account ID" : "ID"} max={32} />
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
      },
      // All: which provider. A provider tab is one provider, so it has no such column.
      ...(type
        ? []
        : [
            {
              id: "provider",
              header: "Provider",
              label: "Provider",
              priority: 1,
              approxWidth: 120,
              cell: ({ row }) => <span className="text-[13px]">{providerWord(row.original.provider)}</span>,
              detail: (c) => providerWord(c.provider),
            } satisfies AdaptiveColumn<Connection>,
          ]),
      {
        id: "status",
        header: "Status",
        label: "Status",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => <StatusBlock c={row.original} brief />,
        detail: (c) => <StatusBlock c={c} clamp={false} />,
      },
      {
        id: "last_scan",
        header: "Last sync",
        label: "Last sync",
        priority: 2,
        approxWidth: 200,
        // The scan, and under it what the graph made of it.
        cell: ({ row }) => {
          return (
            <div className="min-w-0 space-y-0.5 whitespace-normal">
              <div className="text-[13px]">{scanLine(row.original)}</div>
              <div className="text-xs text-muted-foreground">{graphLine(row.original)}</div>
            </div>
          );
        },
        detail: (c) => `${scanLine(c)} · ${graphLine(c)}`,
      },
      // All: the scope chosen to scan. A provider tab names it in its own words instead.
      ...(type
        ? []
        : [
            {
              // The id stays "coverage" so saved column choices keep working. The value is
              // what was chosen to scan; what was actually read is the Coverage tab.
              id: "coverage",
              header: "Scope",
              label: "Scope",
              priority: 3,
              approxWidth: 150,
              cell: ({ row }) => <span className="block truncate text-[13px]">{row.original.scope_summary || "—"}</span>,
              detail: (c) => c.scope_summary || "—",
            } satisfies AdaptiveColumn<Connection>,
          ]),
      ...providerColumns,
      {
        id: "actions",
        // Named for screen readers; the buttons say what they do (C-08).
        header: () => <span className="sr-only">Actions</span>,
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 110,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) => {
          const c = row.original;
          const a = actionsOf(c, canAdminister);
          const busy: ActionKind | undefined = pending[c.id];
          const items: ConsoleActionItem[] = [{ label: "View details", onSelect: () => navigate(detailHref(c.id)) }];
          if (c.discovery.ready) items.push({ label: "Open in Discovery", onSelect: () => navigate(discoveryLink(c)) });
          if (a.verify) items.push({ label: "Verify", onSelect: () => void run(c, "verify") });
          if (a.editScope) items.push({ label: "Edit scope", onSelect: () => navigate(detailHref(c.id, "scope")) });
          if (a.rules) items.push({ label: "Scan rules", onSelect: () => navigate(detailHref(c.id, "rules")) });
          if (a.revoke) items.push({ label: `${revokeWord(c).verb}…`, destructive: true, onSelect: () => setRevokeTarget(c) });
          // A broken account says so with one button that opens what to do about it.
          const fix = fixHref(c);
          if (fix && a.scan) items.splice(1, 0, { label: "Scan now", onSelect: () => void run(c, "scan") });
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {busy ? (
                <PendingWord kind={busy} />
              ) : fix ? (
                <Button
                  size="sm"
                  className="h-8 px-3 text-[length:var(--text-sm)] text-white"
                  title={statusFilterOf(c) === "partial" ? "Open Coverage: what was not read, and what to do" : "Open the account: what failed, and what to do"}
                  onClick={() => navigate(fix)}
                >
                  Fix
                </Button>
              ) : c.provider === "k8s" && c.scan.reports_every_seconds ? (
                <span className="text-xs text-muted-foreground">
                  Reports every {Math.max(1, Math.round(c.scan.reports_every_seconds / 60))} min
                </span>
              ) : a.scan ? (
                <Button variant="ghost" size="icon" className="size-9" aria-label={`Scan ${c.name} now`} title="Scan now" onClick={() => void run(c, "scan")}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
              <ConsoleRowActions items={items} label={`Actions for ${c.name}`} />
            </div>
          );
        },
      },
    ],
    [canAdminister, navigate, pending, run, type, providerColumns],
  );

  const firstRun = query.isSuccess && all.length === 0;

  const emptyState = filtered ? (
    <div className="space-y-2 py-2">
      <p>No accounts match these filters.</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Clear filters
      </Button>
    </div>
  ) : type && !all.some((c) => c.provider === type) ? (
    <div className="space-y-2 py-2">
      <p>No {providerWord(type)} account is connected.</p>
      <Button variant="outline" size="sm" onClick={() => setParam("type", null)}>
        Show all accounts
      </Button>
    </div>
  ) : all.length > 0 ? (
    <div className="space-y-2 py-2">
      <p>Every account here has been revoked.</p>
      <Button variant="outline" size="sm" onClick={() => setParam("revoked", "1")}>
        Show revoked ({revokedCount})
      </Button>
    </div>
  ) : (
    <div className="mx-auto max-w-md space-y-3 py-4">
      <p className="text-sm font-medium text-foreground">Nothing is connected yet.</p>
      <p>
        Connect an AWS account, a Google Cloud project, a Kubernetes cluster or a GitHub organisation. AuthSec scans it, and
        Discovery then shows what it found.
      </p>
      {canAdminister || adminLoading ? (
        <Button className="text-[length:var(--text-sm)] text-white" disabled={adminLoading} onClick={() => setPickerOpen(true)}>
          Add account or cluster
        </Button>
      ) : adminUnknown ? (
        <p>Could not check whether you can add an account. Reload to try again.</p>
      ) : (
        <p>An administrator can add an account.</p>
      )}
    </div>
  );

  return (
    <ConsolePage
      title="Accounts"
      description="Cloud accounts, Kubernetes clusters and GitHub organisations that AuthSec scans."
      actions={
        canAdminister || adminLoading ? (
          // Until the server has answered whether this reader can administer, the control is shown but cannot be used.
          <Button className="text-[length:var(--text-sm)] text-white" disabled={adminLoading} onClick={() => setPickerOpen(true)}>
            Add account or cluster
          </Button>
        ) : undefined
      }
    >
      <PageAbout>
        <strong className="font-semibold">Accounts</strong> are the cloud accounts, Kubernetes clusters and GitHub organisations AuthSec
        reads to find workloads, the identities they use and what those identities can reach.
      </PageAbout>
      <HowItWorks
        title="How discovery works"
        subtitle="From an account to an access graph"
        steps={HOW_DISCOVERY_WORKS}
        storageKey="iga-accounts-how-discovery-works"
      />
      {openRules && query.isSuccess && githubConnections.length !== 1 ? (
        <RulesChooser
          connections={githubConnections}
          canAdd={canAdminister}
          onConnect={() => setWizard("github")}
          onDismiss={() => setParam("open", null)}
        />
      ) : null}

      {query.isError && query.data ? (
        <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
          <strong className="font-medium">Could not refresh the list.</strong> It shows what loaded earlier.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <ActionFailureList
        failures={failures.filter((f) => !(f.kind === "revoke" && revokeTarget?.id === f.id))}
        connections={all}
        onRetry={(c, kind) => (kind === "revoke" ? setRevokeTarget(c) : void run(c, kind))}
        onDismiss={dismiss}
      />

      {firstRun ? (
        // Nothing connected and nothing wrong: the invitation alone, without an empty table around it.
        <TableCard>
          <CardContent variant="flush">
            <div className="px-6 py-10 text-center text-sm text-(--color-text-secondary)">{emptyState}</div>
          </CardContent>
        </TableCard>
      ) : (
      <TableCard>
        <CardContent variant="flush">
          <ProviderTabs
            value={type}
            onChange={(p) => setParam("type", p)}
            counts={PROVIDERS.filter((p) => p === type || all.some((c) => c.provider === p)).map((p) => ({
              provider: p,
              count: all.filter((c) => c.provider === p).length,
            }))}
            total={all.length}
          />
          <TableToolbar
            // Search and the filters are there as soon as there is a connection to filter.
            controls={all.length >= 1 || filtered}
            showSearch={all.length >= 6 || !!search.trim()}
            search={search}
            onSearch={(v) => setParam("q", v || null)}
            filtered={filtered}
            onClear={clearFilters}
            countLabel={`${rows.length} of ${inScope} ${inScope === 1 ? "account" : "accounts"}`}
            extra={
              revokedCount > 0 && status === "all" ? (
                <button
                  type="button"
                  onClick={() => setParam("revoked", showRevoked ? null : "1")}
                  className="h-8 rounded-md px-2.5 text-[13px] font-medium text-(--color-primary-text) hover:bg-(--color-surface-subtle)"
                >
                  {showRevoked ? `Hide revoked (${revokedCount})` : `Show revoked (${revokedCount})`}
                </button>
              ) : undefined
            }
            typeControl={
              <>
                <FilterPills
                  label="Status"
                  value={status}
                  onChange={(k) => setParam("status", k === "all" ? null : k)}
                  options={STATUS_FILTERS.map((f) => ({ key: f.key, label: f.label, count: f.key === "all" ? undefined : all.filter((c) => statusFilterOf(c) === f.key).length })).filter(
                    (o) => o.key === "all" || o.key === status || (o.count ?? 0) > 0,
                  )}
                />
              </>
            }
          />
          <AdaptiveTable
            // Each provider tab has its own columns, so its own saved column choices.
            tableId={type ? `iga-connections-${type}` : "iga-connections"}
            sizing="fit"
            // Every field is a column, in the card's details, or on the detail page.
            rowDetails={false}
            cardsBelow={640}
            loading={query.isLoading}
            // Nothing loaded because a request failed: say so, never "none yet".
            failure={query.isError && !query.data ? tableFailure(query.error, "accounts", () => query.refetch(), "discovery:read") : undefined}
            emptyState={emptyState}
            columns={columns}
            data={rows}
            getRowId={(c) => c.id}
            onRowClick={(c) => navigate(detailHref(c.id))}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>
      )}

      {canAdminister && query.data ? <ConnectMoreSources providers={unconnected} onAdd={(p) => setWizard(p)} /> : null}

      <AddConnectionDialogs
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        wizard={wizard}
        onWizardChange={setWizard}
        onAdded={added}
      />

      <RevokeConnectionDialog
        connection={revokeTarget}
        open={revokeTarget !== null}
        pending={!!revokeTarget && pending[revokeTarget.id] === "revoke"}
        lastGitHubOrg={lastGitHubOrg}
        error={revokeError}
        onCancel={cancelRevoke}
        onConfirm={() => void confirmRevoke()}
      />
    </ConsolePage>
  );
}

/**
 * All, then one tab per connected provider. All shows the columns every
 * provider has; a provider tab adds that provider's own (a new cloud only adds
 * a tab). The tab is kept in the URL (`type`).
 */
function ProviderTabs({
  value,
  onChange,
  counts,
  total,
}: {
  value: ConnectionProvider | null;
  onChange: (p: ConnectionProvider | null) => void;
  counts: { provider: ConnectionProvider; count: number }[];
  total: number;
}) {
  const tabs: { key: ConnectionProvider | null; label: string; count: number }[] = [
    { key: null, label: "All", count: total },
    ...counts.map((c) => ({ key: c.provider, label: providerWord(c.provider), count: c.count })),
  ];
  return (
    <div className="border-b border-(--color-border-subtle) px-4 pt-3">
      <div role="tablist" aria-label="Provider" className="inline-flex flex-wrap gap-1 rounded-lg bg-(--color-surface-subtle) p-1">
        {tabs.map((t) => {
          const on = t.key === value;
          return (
            <button
              key={t.key ?? "all"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)",
                on ? "bg-(--color-surface-raised) text-(--color-text) shadow-(--shadow-xs)" : "text-(--color-text-secondary) hover:text-(--color-text)",
              )}
            >
              {t.label}
              <span className="tabular-nums text-(--color-text-muted)">{t.count}</span>
            </button>
          );
        })}
      </div>
      <p className="m-0 py-2 text-xs text-(--color-text-muted)">
        {value ? (
          <>
            <strong className="font-semibold text-(--color-text)">{providerWord(value)} columns:</strong> {PROVIDER_COLUMNS[value]}, beside the common
            Status and Last sync.
          </>
        ) : (
          <>
            <strong className="font-semibold text-(--color-text)">All providers:</strong> the columns every account has. Pick a provider tab for its own
            details.
          </>
        )}
      </p>
    </div>
  );
}

/** `?open=github-rules` with no single organisation to land on: pick one, or connect first. */
function RulesChooser({
  connections,
  canAdd,
  onConnect,
  onDismiss,
}: {
  connections: Connection[];
  canAdd: boolean;
  onConnect: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      aria-label="Scan rules"
      className="space-y-2 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3 text-sm"
    >
      {connections.length === 0 ? (
        <>
          <p className="font-medium text-foreground">Scan rules belong to a GitHub organisation.</p>
          <p className="text-muted-foreground">Connect one first; its Scan rules tab then opens here.</p>
        </>
      ) : (
        <>
          <p className="font-medium text-foreground">Which organisation&rsquo;s scan rules do you want to open?</p>
          <p className="text-muted-foreground">One catalogue of rules serves every connected organisation.</p>
          <ul className="flex flex-wrap gap-2">
            {connections.map((c) => (
              <li key={c.id}>
                <Link
                  to={detailHref(c.id, "rules")}
                  className="inline-flex h-8 items-center rounded-md border border-(--color-border-strong) px-3 text-xs font-semibold hover:bg-(--color-surface-subtle)"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex gap-2">
        {connections.length === 0 && canAdd ? (
          <Button size="sm" className="text-[length:var(--text-sm)] text-white" onClick={onConnect}>
            Connect GitHub
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}
