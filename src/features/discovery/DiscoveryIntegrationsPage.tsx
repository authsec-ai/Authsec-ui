/**
 * Discovery → Integrations
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). Lists the configured
 * discovery channels (`discovery_sources`). Named "Integrations" because
 * "Connectors" is the existing outbound action broker and is already taken.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  type ConsoleActionItem,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SOURCE_CADENCE,
  SOURCE_LABELS,
  useDeleteDiscoverySourceMutation,
  useListDiscoverySourcesQuery,
  useUpdateDiscoverySourceMutation,
  useConvertGitHubAppManifestMutation,
  type DiscoverySource,
} from "@/app/api/discoveryApi";
import { GitHubSetupWizard } from "./GitHubSetupWizard";
import { DeployCollectorWizard } from "./DeployCollectorWizard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StatusFilter = "all" | "enabled" | "disabled" | "attention";

const FILTERS: ConsoleFilterOption[] = [
  { key: "all", label: "All" },
  { key: "enabled", label: "Enabled" },
  { key: "disabled", label: "Disabled" },
  { key: "attention", label: "Needs attention" },
];

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

function StatusPill({ source }: { source: DiscoverySource }) {
  if (!source.enabled) {
    return (
      <span className={`${PILL} bg-muted text-muted-foreground`}>
        <span className="size-1.5 rounded-full bg-current" />
        Disabled
      </span>
    );
  }
  // last_status is free text from the connector, not an enum — map what we know
  // and fall through to showing the raw value rather than inventing a state.
  const raw = source.last_status?.trim() ?? "";
  // A source that has reported is live, whatever the connector wrote in
  // last_status. Without this an integration that is demonstrably working shows
  // "Never run" forever, because most connectors never set the field.
  if (raw === "" && source.last_sync_at) {
    return (
      <span className={`${PILL} bg-(--color-success-soft) text-(--color-success-text)`}>
        <span className="size-1.5 rounded-full bg-current" />
        Reporting
      </span>
    );
  }
  const known: Record<string, { cls: string; label: string }> = {
    "": { cls: "bg-muted text-muted-foreground", label: "Never run" },
    ok: { cls: "bg-(--color-success-soft) text-(--color-success-text)", label: "Healthy" },
    success: { cls: "bg-(--color-success-soft) text-(--color-success-text)", label: "Healthy" },
    degraded: { cls: "bg-(--color-warning-soft) text-(--color-warning-text)", label: "Degraded" },
    partial: { cls: "bg-(--color-warning-soft) text-(--color-warning-text)", label: "Partial" },
    failed: { cls: "bg-(--color-danger-soft) text-(--color-danger-text)", label: "Failed" },
    error: { cls: "bg-(--color-danger-soft) text-(--color-danger-text)", label: "Failed" },
  };
  const m = known[raw.toLowerCase()] ?? {
    cls: "bg-muted text-muted-foreground",
    label: raw,
  };
  return (
    <span className={`${PILL} ${m.cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}

export default function DiscoveryIntegrationsPage() {
  const { data, isError, error, refetch } = useListDiscoverySourcesQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const navigate = useNavigate();
  const [githubOpen, setGithubOpen] = useState(false);
  const [convertManifest] = useConvertGitHubAppManifestMutation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoverySource | null>(null);
  const [updateSource] = useUpdateDiscoverySourceMutation();
  const [deleteSource, { isLoading: deleting }] = useDeleteDiscoverySourceMutation();

  // GitHub's App-manifest flow returns the operator here with ?code=<single-use>.
  // Exchange it immediately for the App id + private key, then strip the code
  // from the URL so a refresh cannot replay a code that is already spent.
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await convertManifest({ code }).unwrap();
        if (cancelled) return;
        toast.success(`GitHub App "${info.name}" created`);
        // Reopen the GitHub wizard. It skips the App step on its own now that
        // an App exists, so the operator lands on the organisation step -- the
        // one they were heading for -- rather than back at the step they have
        // just finished.
        setGithubOpen(true);
      } catch (err) {
        if (cancelled) return;
        toast.error(
          (err as { data?: { error?: string } })?.data?.error ??
            "Could not finish creating the GitHub App.",
        );
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete("code");
          next.delete("state");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, convertManifest, setSearchParams]);

  const permissionError = (err: unknown, fallback: string) =>
    toast.error(
      (err as { status?: number })?.status === 403
        ? "Your role is missing the discovery:admin permission."
        : fallback,
    );

  const allSources = useMemo(() => data ?? [], [data]);

  // Whether deleting this one takes the workspace's GitHub App with it. Mirrors
  // the server's condition (last repo_scan source in the workspace) so the
  // dialog cannot promise something different from what happens.
  const isLastGitHubOrg =
    deleteTarget?.kind === "repo_scan" &&
    allSources.filter((s) => s.kind === "repo_scan").length === 1;

  const items = useMemo(() => {
    let list = allSources;
    if (statusFilter === "enabled") list = list.filter((s) => s.enabled);
    if (statusFilter === "disabled") list = list.filter((s) => !s.enabled);
    if (statusFilter === "attention") {
      list = list.filter(
        (s) => s.enabled && (s.last_status === "failed" || s.last_status === "degraded"),
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        [s.display_name, SOURCE_LABELS[s.kind], s.kind].join(" ").toLowerCase().includes(q),
      );
    }
    return list;
  }, [allSources, search, statusFilter]);

  const columns = useMemo<AdaptiveColumn<DiscoverySource>[]>(
    () => [
      {
        id: "name",
        header: "Integration",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.display_name}
            detail={SOURCE_LABELS[row.original.kind]}
          />
        ),
      },
      {
        id: "cadence",
        header: "Cadence",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {SOURCE_CADENCE[row.original.kind]}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => <StatusPill source={row.original} />,
      },
      {
        id: "last_sync_at",
        header: "Last sync",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.last_sync_at
              ? formatDistanceToNow(new Date(row.original.last_sync_at), { addSuffix: true })
              : "Never"}
          </span>
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={row.original.enabled}
              onCheckedChange={(v) =>
                void updateSource({ id: row.original.id, enabled: v })
                  .unwrap()
                  .catch((e) => permissionError(e, "Could not update the integration."))
              }
            />
          </div>
        ),
      },
      {
        id: "agent_count",
        header: "Agents",
        priority: 2,
        approxWidth: 90,
        cell: ({ row }) =>
          row.original.agent_count > 0 ? (
            <span className="text-xs font-medium">{row.original.agent_count}</span>
          ) : (
            <span className="text-xs text-muted-foreground">None yet</span>
          ),
      },
      {
        id: "last_error",
        header: "Detail",
        priority: 4,
        approxWidth: 240,
        cell: ({ row }) =>
          row.original.last_error ? (
            <span
              className="block max-w-[220px] truncate text-xs text-muted-foreground"
              title={row.original.last_error}
            >
              {row.original.last_error}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          const actions: ConsoleActionItem[] = [
            { label: "View details", onSelect: () => navigate(`/iga/integrations/${row.original.id}`) },
            {
              label: row.original.enabled ? "Disable" : "Enable",
              onSelect: () =>
                void updateSource({ id: row.original.id, enabled: !row.original.enabled })
                  .unwrap()
                  .catch((e) => permissionError(e, "Could not update the integration.")),
            },
            {
              label: "Delete…",
              destructive: true,
              onSelect: () => setDeleteTarget(row.original),
            },
          ];
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <ConsoleRowActions items={actions} />
            </div>
          );
        },
      },
    ],
    // updateSource/navigate are stable; permissionError closes over nothing mutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ConsolePage
      title="Integrations"
      description="Discovery channels that feed the agent inventory. Each environment gets an event-driven listener and a periodic scan; both write to the same inventory."
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="text-[length:var(--text-sm)] text-white">Add integration</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
              Kubernetes — deploy collector
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGithubOpen(true)}>
              GitHub — scan repositories
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load integrations.</strong>{" "}
          {(error as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The discovery API returned an error."}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <ConsoleFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search integrations…"
        filters={FILTERS}
        activeFilter={statusFilter}
        onFilterChange={(v) => setStatusFilter(v as StatusFilter)}
      />

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="discovery-integrations"
            columns={columns}
            data={items}
            getRowId={(s) => s.id}
            onRowClick={(s) => navigate(`/iga/integrations/${s.id}`)}
            enableSelection={false}
            enableExpansion={false}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
          />
        </CardContent>
      </TableCard>

      <DeployCollectorWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => void refetch()}
      />

      <GitHubSetupWizard
        open={githubOpen}
        onOpenChange={setGithubOpen}
        onCreated={(sourceId) => {
          void refetch();
          // Land the admin on repository selection: the source exists but is
          // scanning nothing until a scope is chosen.
          navigate(`/iga/integrations/${sourceId}`);
        }}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete integration</DialogTitle>
            {/* Kind-aware, because the two channels behave differently on
                delete and a single generic sentence was wrong for both. Each
                also names the thing this does NOT remove: for GitHub the App is
                still installed on github.com, which is why the organisation
                keeps appearing when adding one; for Kubernetes the collector is
                still running in the cluster. Both were previously left to be
                discovered, and both read as the delete having failed. */}
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {deleteTarget?.kind === "repo_scan" ? (
                    <>
                      Stops scanning <strong>{deleteTarget?.display_name}</strong> and
                      removes the agents it found from the inventory.
                    </>
                  ) : (
                    <>
                      Removes <strong>{deleteTarget?.display_name}</strong> and the agents it
                      reported from the inventory.
                    </>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Agents found by another integration are not affected. If this
                  organisation is added again, a scan re-finds whatever is still there.
                </p>

                {deleteTarget?.kind === "repo_scan" && (
                  <>
                    {isLastGitHubOrg && (
                      <p className="text-muted-foreground">
                        This is your last GitHub organisation, so the workspace&rsquo;s
                        GitHub App and its private key are removed too. Adding GitHub again
                        means setting the App up once more.
                      </p>
                    )}
                    {/* The one thing deleting here cannot do. Left unsaid, the App
                        still being listed on github.com -- and the organisation
                        still being offered in the picker -- reads as the delete
                        having silently failed. */}
                    <p className="text-muted-foreground">
                      The App is not deleted from GitHub. Remove it in your GitHub account
                      or organisation settings if you want it gone there too.
                    </p>
                  </>
                )}

                {deleteTarget?.kind === "k8s_webhook" && (
                  <p className="text-muted-foreground">
                    The agent running in your cluster is not uninstalled by this — it will
                    keep trying to report until you remove it there.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!deleteTarget) return;
                void deleteSource(deleteTarget.id)
                  .unwrap()
                  .then(() => {
                    toast.success(`${deleteTarget.display_name} deleted.`);
                    setDeleteTarget(null);
                    void refetch();
                  })
                  .catch((e) => permissionError(e, "Could not delete the integration."));
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
