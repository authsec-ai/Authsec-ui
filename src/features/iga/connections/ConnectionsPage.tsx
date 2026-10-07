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
import { useConvertGitHubAppManifestMutation } from "@/app/api/discoveryApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsolePage } from "@/components/console/ConsolePage";
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
import { ConnectMoreSources, StatusTiles, TableToolbar, type StatusTileKey } from "./ConnectionsListParts";
import {
  PROVIDERS,
  actionsOf,
  detailHref,
  discoveryLink,
  graphText,
  hasFriendlyName,
  isConnectionProvider,
  isFilterKey,
  lastScanText,
  providerWord,
  revokeWord,
  scanInFlight,
  statusFilterOf,
  typeWord,
  type StatusFilterKey,
} from "./connectionModel";
import { useAdminAccess } from "./permissions";
import { ProviderGlyph } from "./ProviderGlyph";
import { InfoTip } from "../shared/components/InfoTip";
import { TruncatedId } from "../shared/components/TruncatedId";
import { RevokeConnectionDialog } from "./RevokeConnectionDialog";
import { useConnectionActions, type ActionKind } from "./useConnectionActions";

const POLL_MS = 5_000;

/** What the search box matches: the name, the account/project/cluster id, the provider and the scope. */
function searchText(c: Connection): string {
  return [c.name, c.native_id, providerWord(c.provider), typeWord(c), c.scope_summary].join(" ").toLowerCase();
}

/** The design's four status tiles; partial coverage counts as needing attention. */
const TILES: { key: StatusTileKey; label: string }[] = [
  { key: "connected", label: "Connected" },
  { key: "attention", label: "Needs attention" },
  { key: "running", label: "Scanning" },
  { key: "revoked", label: "Revoked" },
];

function tileOf(c: Connection): StatusTileKey | null {
  const f = statusFilterOf(c);
  return f === "partial" ? "attention" : f === "all" ? null : (f as StatusTileKey);
}


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
  // An old link's ?status=partial selects the tile it now belongs to.
  const tile: StatusTileKey | null = status === "all" ? null : status === "partial" ? "attention" : (status as StatusTileKey);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => (!type || c.provider === type) && (!tile || tileOf(c) === tile) && (!q || searchText(c).includes(q)));
  }, [all, type, tile, search]);

  const filtered = !!search.trim() || type !== null || status !== "all";
  const tiles = TILES.map((t) => ({ ...t, count: all.filter((c) => tileOf(c) === t.key).length }));
  const unconnected = PROVIDERS.filter((p) => !all.some((c) => c.provider === p));
  const clearFilters = () => setSearchParams({}, { replace: true });

  const columns = useMemo<AdaptiveColumn<Connection>[]>(
    () => [
      {
        id: "name",
        header: "Connection",
        label: "Connection",
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
        header: "Last scan",
        label: "Last scan",
        priority: 2,
        approxWidth: 200,
        // The scan, and under it what the graph made of it.
        cell: ({ row }) => {
          const g = graphText(row.original);
          return (
            <div className="min-w-0 space-y-0.5 whitespace-normal">
              <div className="text-[13px]">{lastScanText(row.original)}</div>
              <div className="text-xs text-muted-foreground">{g.note ? `${g.text} · ${g.note}` : g.text}</div>
            </div>
          );
        },
        detail: (c) => {
          const g = graphText(c);
          return `${lastScanText(c)} · ${g.note ? `${g.text} · ${g.note}` : g.text}`;
        },
      },
      {
        id: "coverage",
        header: "Coverage",
        label: "Coverage",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => <span className="block truncate text-[13px]">{row.original.scope_summary || "—"}</span>,
        detail: (c) => c.scope_summary || "—",
      },
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
          return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {busy ? (
                <PendingWord kind={busy} />
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
    [canAdminister, navigate, pending, run],
  );

  const emptyState = filtered ? (
    <div className="space-y-2 py-2">
      <p>No connections match these filters.</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
        Clear filters
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
          Add connection
        </Button>
      ) : adminUnknown ? (
        <p>Could not check whether you can add a connection. Reload to try again.</p>
      ) : (
        <p>An administrator can add a connection.</p>
      )}
    </div>
  );

  return (
    <ConsolePage
      title="Connections"
      description={
        <span className="inline-flex flex-wrap items-center gap-1">
          Connect your AWS accounts, Google Cloud projects, Kubernetes clusters and GitHub organizations so AuthSec can
          discover the identities, agents and permissions inside them.
          <InfoTip label="What discovery reads">
            Discovery is read-only. AuthSec reads metadata: identities, roles, policies and the workloads that use them. It
            does not change anything in a connected source, and it does not read secret values or the data stored in your
            resources.
          </InfoTip>
        </span>
      }
      actions={
        canAdminister || adminLoading ? (
          // Until the server has answered whether this reader can administer, the control is shown but cannot be used.
          <Button className="text-[length:var(--text-sm)] text-white" disabled={adminLoading} onClick={() => setPickerOpen(true)}>
            Add connection
          </Button>
        ) : undefined
      }
    >
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

      {/* Doubles as the status filter. */}
      {/* Only from a list that loaded: never zeros while loading or after a failure. */}
      {query.data ? <StatusTiles tiles={tiles} active={tile} onPick={(k) => setParam("status", k)} /> : null}

      <TableCard>
        <CardContent variant="flush">
          <TableToolbar
            search={search}
            onSearch={(v) => setParam("q", v || null)}
            filtered={filtered}
            onClear={clearFilters}
            countLabel={`${rows.length} of ${all.length} ${all.length === 1 ? "connection" : "connections"}`}
            typeControl={
              <label className="flex items-center gap-2 text-[13px] text-(--color-text-muted)">
                Type
                <select
                  value={type ?? "all"}
                  onChange={(e) => setParam("type", e.target.value === "all" ? null : e.target.value)}
                  className="h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)"
                >
                  <option value="all">All types</option>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {providerWord(p)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          <AdaptiveTable
            tableId="iga-connections"
            sizing="fit"
            // Every field is a column, in the card's details, or on the detail page.
            rowDetails={false}
            cardsBelow={640}
            loading={query.isLoading}
            // Nothing loaded because a request failed: say so, never "none yet".
            failure={query.isError && !query.data ? tableFailure(query.error, "connections", () => query.refetch(), "discovery:read") : undefined}
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
