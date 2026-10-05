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
import { toast } from "react-hot-toast";

import { connectionsApi, useListDiscoveryConnectionsQuery, type Connection, type ConnectionProvider } from "@/app/api/connectionsApi";
import { useConvertGitHubAppManifestMutation } from "@/app/api/discoveryApi";
import { useAppDispatch } from "@/app/hooks";
import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  type ConsoleActionItem,
} from "@/components/console/iam-console";
import { tableFailure } from "@/components/console/load-failure";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";

import { AddConnectionDialogs, type Wizard } from "./AddConnectionDialogs";
import {
  ActionFailureList,
  Chip,
  ChipGroup,
  NameLink,
  PendingWord,
  StatusBlock,
} from "./ConnectionParts";
import {
  PROVIDERS,
  STATUS_FILTERS,
  actionsOf,
  detailHref,
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
import { RevokeConnectionDialog } from "./RevokeConnectionDialog";
import { useConnectionActions, type ActionKind } from "./useConnectionActions";

const POLL_MS = 5_000;

function searchText(c: Connection): string {
  return [c.name, c.native_id, providerWord(c.provider), typeWord(c), c.scope_summary].join(" ").toLowerCase();
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
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (c) => (!type || c.provider === type) && (status === "all" || statusFilterOf(c) === status) && (!q || searchText(c).includes(q)),
    );
  }, [all, search, type, status]);

  const filtered = !!search.trim() || type !== null || status !== "all";
  const clearFilters = () => setSearchParams({}, { replace: true });

  const columns = useMemo<AdaptiveColumn<Connection>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        label: "Name",
        primary: true,
        alwaysVisible: true,
        minWidth: 220,
        cell: ({ row }) => {
          const c = row.original;
          const friendly = hasFriendlyName(c);
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderGlyph provider={c.provider} />
              <div className="min-w-0">
                {/* With no friendly name the id is the name, in mono, once. */}
                <NameLink to={detailHref(c.id)}>{friendly ? c.name : <span className="font-mono text-[13px]">{c.name}</span>}</NameLink>
                <div className="truncate text-xs text-muted-foreground">{providerWord(c.provider)}</div>
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
        approxWidth: 320,
        cell: ({ row }) => <StatusBlock c={row.original} />,
        detail: (c) => <StatusBlock c={c} clamp={false} />,
      },
      {
        id: "last_scan",
        header: "Last scan",
        label: "Last scan",
        priority: 2,
        approxWidth: 150,
        cell: ({ row }) => <span className="text-xs">{lastScanText(row.original)}</span>,
        detail: (c) => lastScanText(c),
      },
      {
        id: "graph",
        header: "Graph",
        label: "Graph",
        priority: 3,
        approxWidth: 150,
        cell: ({ row }) => {
          const g = graphText(row.original);
          return (
            <div className="min-w-0">
              <div className="truncate text-xs">{g.text}</div>
              {g.note ? <div className="truncate text-xs text-muted-foreground">{g.note}</div> : null}
            </div>
          );
        },
        detail: (c) => {
          const g = graphText(c);
          return g.note ? `${g.text} · ${g.note}` : g.text;
        },
      },
      {
        id: "scope",
        header: "Scope",
        label: "Scope",
        priority: 4,
        approxWidth: 140,
        cell: ({ row }) => <span className="block truncate text-xs">{row.original.scope_summary || "—"}</span>,
        detail: (c) => c.scope_summary || "—",
      },
      {
        id: "type",
        header: "Type",
        label: "Type",
        priority: 5,
        approxWidth: 170,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate text-xs">{typeWord(c)}</div>
              {hasFriendlyName(c) ? <div className="truncate font-mono text-xs text-muted-foreground">{c.native_id}</div> : null}
            </div>
          );
        },
        detail: (c) => `${typeWord(c)}${hasFriendlyName(c) ? ` · ${c.native_id}` : ""}`,
      },
      {
        id: "actions",
        header: "",
        label: "Actions",
        alwaysVisible: true,
        approxWidth: 210,
        className: "pr-4",
        cellClassName: "pr-4 text-right",
        cell: ({ row }) => {
          const c = row.original;
          const a = actionsOf(c, canAdminister);
          const busy: ActionKind | undefined = pending[c.id];
          const items: ConsoleActionItem[] = [{ label: "Open details", onSelect: () => navigate(detailHref(c.id)) }];
          if (a.verify) items.push({ label: "Verify", onSelect: () => void run(c, "verify") });
          if (a.editScope) items.push({ label: "Edit scope", onSelect: () => navigate(detailHref(c.id, "scope"), { state: { editScope: true } }) });
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
                <Button variant="outline" size="sm" onClick={() => void run(c, "scan")}>
                  Scan now
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
      description="AWS accounts, Google Cloud projects, Kubernetes clusters and GitHub organisations: what is connected, whether it is reporting, and whether its data is usable."
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

      <ConsoleFilterBar
        className="[&>[data-slot=card-content]]:py-2.5"
        search={search}
        onSearchChange={(v) => setParam("q", v || null)}
        searchPlaceholder="Search by name, account, project, cluster or organisation"
        trailing={
          <>
            <ChipGroup label="Type">
              <Chip pressed={type === null} onClick={() => setParam("type", null)}>
                All types
              </Chip>
              {PROVIDERS.map((p) => (
                <Chip key={p} pressed={type === p} onClick={() => setParam("type", type === p ? null : p)}>
                  {providerWord(p)}
                  <span className="tabular-nums text-muted-foreground">{all.filter((c) => c.provider === p).length}</span>
                </Chip>
              ))}
            </ChipGroup>
            <ChipGroup label="Status">
              {STATUS_FILTERS.map((f) => (
                <Chip key={f.key} pressed={status === f.key} onClick={() => setParam("status", f.key === "all" ? null : f.key)}>
                  {f.label}
                  {f.key !== "all" ? (
                    <span className="tabular-nums text-muted-foreground">{all.filter((c) => statusFilterOf(c) === f.key).length}</span>
                  ) : null}
                </Chip>
              ))}
            </ChipGroup>
          </>
        }
      />

      <TableCard>
        <CardContent variant="flush">
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
