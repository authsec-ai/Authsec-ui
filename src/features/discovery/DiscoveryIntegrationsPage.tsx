/**
 * Discovery → Integrations
 *
 * PROTOTYPE built to the team's discovery doc (§9.1–9.3). Lists the configured
 * discovery channels (`discovery_sources`). Named "Integrations" because
 * "Connectors" is the existing outbound action broker and is already taken.
 *
 * "Add integration" has three entries — Kubernetes, GitHub, Cloud. Kubernetes
 * and GitHub add a `discovery_sources` row; Cloud opens the same
 * CloudProviderPicker → GCPOnboardingWizard/AWSOnboardingWizard flow that
 * used to live behind a standalone "/iga/cloud" page.
 *
 * ONE table, not two. Per the current platform direction there is no
 * separate Cloud landing page and no second table for cloud accounts —
 * AWS/GCP connectors are rows in this SAME table, alongside `discovery_sources`
 * rows, filling the exact same seven columns (Integration, Cadence, Status,
 * Last sync, Enabled, Agents, Detail) via `IntegrationRow`, a small
 * discriminated union over the two backend shapes. Nothing about how a
 * `discovery_sources` row renders or behaves changed — every branch below
 * that touches `row.source` is copied verbatim from before this merge.
 *
 * Where the two shapes genuinely don't line up, the cloud side is mapped to
 * the closest honest equivalent rather than forcing a fake match:
 *  - Cadence: cloud has no schedule ("scan now" is manual) → "On demand".
 *  - Last sync: no `discovery_sources`-style sync event exists for cloud;
 *    the closest analog is the last completed scan, else the last proven
 *    connection, else "Never".
 *  - Enabled: cloud has three states (active/error/revoked), not a
 *    reversible boolean — the switch reflects "not revoked" but is read-only;
 *    revoking is one-way and lives in the row menu with a confirm dialog,
 *    exactly like a source's own "Delete…".
 *  - Agents: no agent classification is wired to cloud connectors yet
 *    (AWS discovers IAM identities, which are candidates, not agents; GCP
 *    has no discovery endpoints at all) — shown as "—", never a fabricated
 *    or mislabeled count.
 *  - Detail: `CloudConnector.last_error` is a direct analog of
 *    `DiscoverySource.last_error` — same meaning, shown the same way.
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
import {
  useListAwsConnectorsQuery,
  useListGcpConnectorsQuery,
  useVerifyAwsConnectorMutation,
  useScanAwsConnectorMutation,
  useRevokeAwsConnectorMutation,
  type CloudConnector,
  type CloudConnectorStatus,
  type AWSConnectorAttrs,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import { GitHubSetupWizard } from "./GitHubSetupWizard";
import { DeployCollectorWizard } from "./DeployCollectorWizard";
import { cloudProviderMeta } from "./cloud/cloudProviderMeta";
import { CloudProviderPicker } from "./cloud/CloudProviderPicker";
import { GCPOnboardingWizard } from "./cloud/gcp/GCPOnboardingWizard";
import { AWSOnboardingWizard } from "./cloud/aws/AWSOnboardingWizard";
import { AWSConnectorDrawer } from "./cloud/aws/AWSConnectorDrawer";
import { awsErrorCopy } from "./cloud/aws/awsErrorCopy";
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

// Cloud's analog of StatusPill — same PILL class, same dot, computed from
// CloudConnector.status (active/error/revoked) instead of a source's
// enabled/last_status pair. Kept as a separate function rather than
// generalizing StatusPill itself: the two backends' status vocabularies
// don't actually mean the same thing (see the file header), and forcing
// them through one function would be the fake match this file avoids.
const CLOUD_STATUS_STYLE: Record<CloudConnectorStatus, { cls: string; label: string }> = {
  active: { cls: "bg-(--color-success-soft) text-(--color-success-text)", label: "Active" },
  error: { cls: "bg-(--color-danger-soft) text-(--color-danger-text)", label: "Error" },
  revoked: { cls: "bg-muted text-muted-foreground", label: "Revoked" },
};

function CloudStatusPill({ connector }: { connector: CloudConnector }) {
  const s = CLOUD_STATUS_STYLE[connector.status];
  return (
    <span className={`${PILL} ${s.cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function cloudDisplayName(connector: CloudConnector): string | undefined {
  return connector.provider === "aws" ? (connector.attrs as AWSConnectorAttrs)?.display_name : undefined;
}

/** Integration-column label/detail for a cloud row, mirroring
 * `{label: display_name, detail: SOURCE_LABELS[kind]}` for a source: the
 * bold text identifies the specific account, the muted text says what kind
 * of thing it is. */
function cloudIntegrationText(connector: CloudConnector): { label: string; detail: string } {
  const meta = cloudProviderMeta(connector.provider);
  return {
    label: cloudDisplayName(connector) ?? connector.scope_id,
    detail: `${meta.label} ${connector.scope_kind}`,
  };
}

/** The closest honest analog of "last sync" for a connector that has no
 * sync concept: the last completed scan, else the last proven connection,
 * else never. See the file header for why this isn't `last_sync_at`. */
function cloudLastSync(connector: CloudConnector): string | null {
  return connector.coverage?.finished_at ?? connector.verified_at ?? null;
}

type IntegrationRow =
  | { rowKind: "source"; source: DiscoverySource }
  | { rowKind: "cloud"; connector: CloudConnector };

export default function DiscoveryIntegrationsPage() {
  const { data, isError: sourcesError, error: sourcesErrorObj, refetch } = useListDiscoverySourcesQuery();
  const aws = useListAwsConnectorsQuery();
  const gcp = useListGcpConnectorsQuery();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const navigate = useNavigate();
  const [githubOpen, setGithubOpen] = useState(false);
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);
  const [gcpWizardOpen, setGcpWizardOpen] = useState(false);
  const [awsWizardOpen, setAwsWizardOpen] = useState(false);
  const [selectedAwsConnectorId, setSelectedAwsConnectorId] = useState<string | null>(null);
  const [convertManifest] = useConvertGitHubAppManifestMutation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscoverySource | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<CloudConnector | null>(null);
  const [updateSource] = useUpdateDiscoverySourceMutation();
  const [deleteSource, { isLoading: deleting }] = useDeleteDiscoverySourceMutation();
  const [verifyAws] = useVerifyAwsConnectorMutation();
  const [scanAws] = useScanAwsConnectorMutation();
  const [revokeAws, { isLoading: revoking }] = useRevokeAwsConnectorMutation();

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

  const runAwsRowAction = async (
    action: () => Promise<unknown>,
    successMessage: string,
    failFallback: string,
  ) => {
    try {
      await action();
      toast.success(successMessage);
    } catch (err) {
      const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
      const copy = awsErrorCopy(apiErr, failFallback);
      toast.error(`${copy.title}. ${copy.body}`);
    }
  };

  const allSources = useMemo(() => data ?? [], [data]);

  // A cloud provider whose backend is not deployed yet answers 404 on its list
  // route, and that is not an error the operator can act on: it means "this
  // console build is ahead of this deployment", not "your integrations failed
  // to load". Folding it into the page-level banner would put a permanent red
  // "Could not load integrations" over a page whose Kubernetes and GitHub rows
  // loaded perfectly -- and would train people to ignore the banner that exists
  // to report the real thing. GCP onboarding lands with authsec-ai/authsec#51;
  // until it is deployed, this page simply lists no GCP connectors.
  //
  // Deliberately narrow: only 404 is absorbed. A 403 still surfaces (the role
  // is missing discovery:read), and so does a 500 -- those are real and the
  // operator can act on both.
  const notDeployed = (e: unknown) => (e as { status?: number } | undefined)?.status === 404;
  const awsUnavailable = aws.isError && notDeployed(aws.error);
  const gcpUnavailable = gcp.isError && notDeployed(gcp.error);

  const isError =
    sourcesError || (aws.isError && !awsUnavailable) || (gcp.isError && !gcpUnavailable);
  const firstError =
    sourcesErrorObj ??
    (awsUnavailable ? undefined : aws.error) ??
    (gcpUnavailable ? undefined : gcp.error);
  const retryAll = () => {
    void refetch();
    void aws.refetch();
    void gcp.refetch();
  };

  // Whether deleting this one takes the workspace's GitHub App with it. Mirrors
  // the server's condition (last repo_scan source in the workspace) so the
  // dialog cannot promise something different from what happens.
  const isLastGitHubOrg =
    deleteTarget?.kind === "repo_scan" &&
    allSources.filter((s) => s.kind === "repo_scan").length === 1;

  const allRows = useMemo<IntegrationRow[]>(
    () => [
      ...allSources.map((source): IntegrationRow => ({ rowKind: "source", source })),
      ...(aws.data ?? []).map((connector): IntegrationRow => ({ rowKind: "cloud", connector })),
      ...(gcp.data ?? []).map((connector): IntegrationRow => ({ rowKind: "cloud", connector })),
    ],
    [allSources, aws.data, gcp.data],
  );

  const items = useMemo(() => {
    let list = allRows;
    if (statusFilter === "enabled") {
      list = list.filter((r) =>
        r.rowKind === "source" ? r.source.enabled : r.connector.status !== "revoked",
      );
    }
    if (statusFilter === "disabled") {
      list = list.filter((r) =>
        r.rowKind === "source" ? !r.source.enabled : r.connector.status === "revoked",
      );
    }
    if (statusFilter === "attention") {
      list = list.filter((r) =>
        r.rowKind === "source"
          ? r.source.enabled && (r.source.last_status === "failed" || r.source.last_status === "degraded")
          : r.connector.status === "error",
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        if (r.rowKind === "source") {
          return [r.source.display_name, SOURCE_LABELS[r.source.kind], r.source.kind]
            .join(" ")
            .toLowerCase()
            .includes(q);
        }
        const { label, detail } = cloudIntegrationText(r.connector);
        return [label, detail, r.connector.scope_id].join(" ").toLowerCase().includes(q);
      });
    }
    return list;
  }, [allRows, search, statusFilter]);

  const columns = useMemo<AdaptiveColumn<IntegrationRow>[]>(
    () => [
      {
        id: "name",
        header: "Integration",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => {
          if (row.original.rowKind === "source") {
            return (
              <EntityCell
                label={row.original.source.display_name}
                detail={SOURCE_LABELS[row.original.source.kind]}
              />
            );
          }
          const { label, detail } = cloudIntegrationText(row.original.connector);
          return <EntityCell label={label} detail={detail} />;
        },
      },
      {
        id: "cadence",
        header: "Cadence",
        priority: 2,
        approxWidth: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.rowKind === "source" ? SOURCE_CADENCE[row.original.source.kind] : "On demand"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) =>
          row.original.rowKind === "source" ? (
            <StatusPill source={row.original.source} />
          ) : (
            <CloudStatusPill connector={row.original.connector} />
          ),
      },
      {
        id: "last_sync_at",
        header: "Last sync",
        priority: 3,
        approxWidth: 130,
        cell: ({ row }) => {
          const iso =
            row.original.rowKind === "source"
              ? row.original.source.last_sync_at
              : cloudLastSync(row.original.connector);
          return (
            <span className="text-xs text-muted-foreground">
              {iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "Never"}
            </span>
          );
        },
      },
      {
        id: "enabled",
        header: "Enabled",
        priority: 5,
        approxWidth: 100,
        cell: ({ row }) => {
          // Bound to a const before the callback: narrowing `row.original` by
          // rowKind does not survive into a nested closure, because TypeScript
          // cannot prove the property has not changed by the time the callback
          // runs. A const it cannot reassign carries the narrowed type in.
          const item = row.original;
          return (
          <div onClick={(e) => e.stopPropagation()}>
            {item.rowKind === "source" ? (
              <Switch
                checked={item.source.enabled}
                onCheckedChange={(v) =>
                  void updateSource({ id: item.source.id, enabled: v })
                    .unwrap()
                    .catch((e) => permissionError(e, "Could not update the integration."))
                }
              />
            ) : (
              // Cloud has no reversible enabled/disabled flag — active/error
              // are both "still onboarded", revoked is a one-way action.
              // Read-only here on purpose; "Revoke…" in the row menu is the
              // real lever, with the confirmation a one-way action deserves.
              <Switch checked={item.connector.status !== "revoked"} disabled />
            )}
          </div>
          );
        },
      },
      {
        id: "agent_count",
        header: "Agents",
        priority: 2,
        approxWidth: 90,
        cell: ({ row }) => {
          if (row.original.rowKind === "cloud") {
            // No agent classification is wired to cloud connectors yet (see
            // file header) — "—" states that plainly rather than showing 0,
            // which would read as "checked, found none".
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const count = row.original.source.agent_count;
          return count > 0 ? (
            <span className="text-xs font-medium">{count}</span>
          ) : (
            <span className="text-xs text-muted-foreground">None yet</span>
          );
        },
      },
      {
        id: "last_error",
        header: "Detail",
        priority: 4,
        approxWidth: 240,
        cell: ({ row }) => {
          const err =
            row.original.rowKind === "source" ? row.original.source.last_error : row.original.connector.last_error;
          return err ? (
            <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={err}>
              {err}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 56,
        cell: ({ row }) => {
          if (row.original.rowKind === "source") {
            const source = row.original.source;
            const actions: ConsoleActionItem[] = [
              { label: "View details", onSelect: () => navigate(`/iga/integrations/${source.id}`) },
              {
                label: source.enabled ? "Disable" : "Enable",
                onSelect: () =>
                  void updateSource({ id: source.id, enabled: !source.enabled })
                    .unwrap()
                    .catch((e) => permissionError(e, "Could not update the integration.")),
              },
              {
                label: "Delete…",
                destructive: true,
                onSelect: () => setDeleteTarget(source),
              },
            ];
            return (
              <div onClick={(e) => e.stopPropagation()}>
                <ConsoleRowActions items={actions} />
              </div>
            );
          }

          const connector = row.original.connector;
          // GCP has no connector detail/verify/scan surface at all today —
          // nothing here to act on yet.
          if (connector.provider !== "aws") return null;
          const revoked = connector.status === "revoked";
          const actions: ConsoleActionItem[] = [
            // Kept enabled even when revoked: everything this connector
            // already discovered stays for audit, and that history is
            // exactly what "View details" shows.
            { label: "View details", onSelect: () => setSelectedAwsConnectorId(connector.id) },
            {
              label: "Verify connection",
              disabled: revoked,
              onSelect: () =>
                void runAwsRowAction(
                  () => verifyAws(connector.id).unwrap(),
                  "Connection verified.",
                  "Could not verify the connection.",
                ),
            },
            {
              label: "Scan now",
              disabled: revoked,
              onSelect: () =>
                void runAwsRowAction(
                  () => scanAws(connector.id).unwrap(),
                  "Scan started — it runs in the background.",
                  "Could not start the scan.",
                ),
            },
            {
              label: "Revoke…",
              destructive: true,
              disabled: revoked,
              onSelect: () => setRevokeTarget(connector),
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
    // updateSource/verifyAws/scanAws/navigate are stable; permissionError/runAwsRowAction close over nothing mutable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <ConsolePage
      title="Integrations"
      description="Discovery channels that feed the agent inventory — Kubernetes and GitHub scan on a schedule, cloud accounts are scanned on demand once connected."
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="text-[length:var(--text-sm)] text-white">Add integration</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setWizardOpen(true)}>Kubernetes</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setGithubOpen(true)}>GitHub</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCloudPickerOpen(true)}>Cloud</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {isError ? (
        <div className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-3 text-xs">
          <strong className="font-medium">Could not load integrations.</strong>{" "}
          {(firstError as { status?: number })?.status === 403
            ? "Your role is missing the discovery:read permission."
            : "The discovery API returned an error."}{" "}
          <button className="underline" onClick={retryAll}>
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
            getRowId={(r) => (r.rowKind === "source" ? `source:${r.source.id}` : `cloud:${r.connector.id}`)}
            onRowClick={(r) => {
              if (r.rowKind === "source") {
                navigate(`/iga/integrations/${r.source.id}`);
                return;
              }
              if (r.connector.provider === "aws") setSelectedAwsConnectorId(r.connector.id);
            }}
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

      <CloudProviderPicker
        open={cloudPickerOpen}
        onOpenChange={setCloudPickerOpen}
        onContinue={(provider) => {
          if (provider === "gcp") {
            setGcpWizardOpen(true);
            return;
          }
          if (provider === "aws") {
            setAwsWizardOpen(true);
            return;
          }
          const meta = cloudProviderMeta(provider);
          toast(`${meta.label} onboarding is coming in a later build stage.`);
        }}
      />

      <GCPOnboardingWizard
        open={gcpWizardOpen}
        onOpenChange={setGcpWizardOpen}
        onCreated={() => void gcp.refetch()}
      />

      <AWSOnboardingWizard
        open={awsWizardOpen}
        onOpenChange={setAwsWizardOpen}
        onCreated={() => void aws.refetch()}
      />

      <AWSConnectorDrawer
        connectorId={selectedAwsConnectorId}
        onClose={() => setSelectedAwsConnectorId(null)}
        onRevoked={() => void aws.refetch()}
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

      <Dialog open={revokeTarget !== null} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this AWS connection?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This purges the stored ExternalId for{" "}
                  <strong>{revokeTarget ? cloudIntegrationText(revokeTarget).label : ""}</strong> so
                  AuthSec can no longer assume the role.
                </p>
                <p className="text-muted-foreground">
                  Everything already discovered — identities, access keys, permissions — is kept,
                  unchanged, for audit; it is not deleted. The IAM role itself still exists in the
                  AWS account until the CloudFormation stack is deleted there. Re-onboarding the
                  same account later reactivates this same connector rather than creating a
                  duplicate.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoking}
              onClick={() => {
                if (!revokeTarget) return;
                void revokeAws(revokeTarget.id)
                  .unwrap()
                  .then(() => {
                    toast.success("AWS connector revoked. Everything already discovered is kept, for audit.");
                    setRevokeTarget(null);
                    void aws.refetch();
                  })
                  .catch((err) => {
                    const apiErr = (err as { data?: CloudOnboardingApiError })?.data;
                    const copy = awsErrorCopy(apiErr, "Could not revoke the connector.");
                    toast.error(`${copy.title}. ${copy.body}`);
                  });
              }}
            >
              {revoking ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
