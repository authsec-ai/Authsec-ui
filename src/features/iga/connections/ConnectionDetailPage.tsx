/**
 * One connection: Overview · Scans · Coverage · Scope (+ Scan rules for a
 * GitHub organisation). Resolved by id from the connections read, with loading,
 * failed and not-found kept apart — a failed request is never "Not found".
 */

import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { ConsolePage } from "@/components/console/ConsolePage";
import { LoadFailurePanel } from "@/components/console/load-state";
import { Button } from "@/components/ui/button";
import { RuleCatalogPanel } from "@/features/discovery/RuleCatalogPage";
import { ObjectTabs } from "@/features/iga/shared/components/ObjectTabs";
import { Panel } from "@/features/iga/shared/components/Panel";

import {
  ActionFailureList,
  ConnectionActionBar,
  PendingWord,
  StatusBlock,
} from "./ConnectionParts";
import { CoverageTab } from "./CoverageTab";
import { OverviewTab } from "./OverviewTab";
import { RevokeConnectionDialog } from "./RevokeConnectionDialog";
import { ScansTab } from "./ScansTab";
import { ScopeTab } from "./ScopeTab";
import {
  PROVIDER_WORD,
  TYPE_WORD,
  actionsOf,
  detailHref,
  discoveryLink,
  hasFriendlyName,
  tabsOf,
  type DetailTab,
} from "./connectionModel";
import { useCanAdminister } from "./permissions";
import { useConnection } from "./useConnection";
import { useConnectionActions, type ActionKind } from "./useConnectionActions";
import { useListDiscoveryConnectionsQuery } from "@/app/api/connectionsApi";
import { ProviderGlyph } from "./ProviderGlyph";

const BACK = (
  <Button variant="outline" asChild>
    <Link to="/iga/connections">All connections</Link>
  </Button>
);

export default function ConnectionDetailPage() {
  const { id = "", tab: tabParam } = useParams<{ id?: string; tab?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const canAdminister = useCanAdminister();
  const { connection: c, loading, failure, notFound, refetch, refreshFailed } = useConnection(id);
  const all = useListDiscoveryConnectionsQuery().data ?? [];
  const { pending, failures, run, dismiss } = useConnectionActions();
  const [revokeOpen, setRevokeOpen] = useState(false);

  useBreadcrumbTail(c ? detailHref(id) : null, c?.name ?? null, { label: "Connections", href: "/iga/connections" });

  if (loading) {
    return (
      <ConsolePage title="Connection" description="Loading…" variant="object">
        <div className="h-40 animate-pulse rounded-md bg-(--color-surface-subtle)" aria-busy="true" aria-label="Loading the connection" />
      </ConsolePage>
    );
  }
  if (!c) {
    return (
      <ConsolePage title="Connection" variant="object">
        <LoadFailurePanel failure={failure ?? (notFound ? "not_found" : "failed")} subject="this connection" permission="discovery:read" onRetry={() => void refetch()} />
        <div>{BACK}</div>
      </ConsolePage>
    );
  }

  const tabs = tabsOf(c);
  const active: DetailTab | null = !tabParam ? "overview" : (tabs.find((t) => t.key === tabParam)?.key ?? null);
  const actions = actionsOf(c, canAdminister);
  const busy: ActionKind | undefined = pending[c.id];
  const revokeError = failures.find((f) => f.id === c.id && f.kind === "revoke")?.message;
  const lastGitHubOrg = c.provider === "github" && all.filter((x) => x.provider === "github").length === 1;

  const onRun = (kind: ActionKind) => {
    if (kind === "revoke") setRevokeOpen(true);
    else void run(c, kind);
  };

  const confirmRevoke = async () => {
    if (await run(c, "revoke")) {
      setRevokeOpen(false);
      // A Kubernetes cluster or a GitHub organisation is gone from the list; AWS and GCP stay, revoked.
      if (c.provider === "k8s" || c.provider === "github") navigate("/iga/connections", { replace: true });
    }
  };

  return (
    <ConsolePage
      variant="object"
      title={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <ProviderGlyph provider={c.provider} size="size-8" />
          <span className={hasFriendlyName(c) ? undefined : "font-mono"}>{c.name}</span>
        </span>
      }
      description={`${TYPE_WORD[c.provider]}${hasFriendlyName(c) ? ` · ${c.native_id}` : ""} · ${PROVIDER_WORD[c.provider]}`}
      actions={
        <>
          {busy ? <PendingWord kind={busy} /> : null}
          <ConnectionActionBar
            c={c}
            canAdminister={canAdminister}
            pending={busy}
            onRun={onRun}
            onEditScope={() => navigate(detailHref(c.id, "scope"), { state: { editScope: true } })}
          />
          {c.discovery.ready ? (
            <Button className="text-[length:var(--text-sm)] text-white" size="sm" asChild>
              <Link to={discoveryLink(c)}>Open in Discovery</Link>
            </Button>
          ) : (
            <Button className="text-[length:var(--text-sm)] text-white" size="sm" disabled title="Discovery has no result for this connection yet. The Overview says what it is waiting for.">
              Open in Discovery
            </Button>
          )}
        </>
      }
    >
      {refreshFailed ? (
        <div role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-4 py-2.5 text-xs">
          <strong className="font-medium">Could not refresh this connection.</strong> It shows what loaded earlier.{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3">
        <StatusBlock c={c} clamp={false} />
      </div>

      <ActionFailureList
        failures={failures.filter((f) => !(f.kind === "revoke" && revokeOpen))}
        connections={[c]}
        onRetry={(_conn, kind) => onRun(kind)}
        onDismiss={dismiss}
      />

      <ObjectTabs tabs={tabs.map((t) => ({ key: t.key, label: t.label, to: detailHref(c.id, t.key) }))} active={active ?? "overview"} />

      {active === "overview" ? <OverviewTab c={c} actions={actions} pending={busy} onRun={onRun} /> : null}
      {active === "scans" ? <ScansTab c={c} /> : null}
      {active === "coverage" ? <CoverageTab c={c} /> : null}
      {active === "scope" ? <ScopeTab c={c} actions={actions} startEditing={(location.state as { editScope?: boolean } | null)?.editScope === true} /> : null}
      {active === "rules" ? <RuleCatalogPanel scansHref={detailHref(c.id, "scans")} /> : null}
      {active === null ? (
        tabParam === "rules" ? (
          <Panel title="Scan rules">
            <p className="text-[13px] text-(--color-text-muted)">Scan rules apply to GitHub organisations. {PROVIDER_WORD[c.provider]} connections have none.</p>
          </Panel>
        ) : (
          <LoadFailurePanel failure="not_found" subject="this view of the connection" onRetry={() => undefined} />
        )
      ) : null}

      <RevokeConnectionDialog
        connection={c}
        open={revokeOpen}
        pending={busy === "revoke"}
        lastGitHubOrg={lastGitHubOrg}
        error={revokeError}
        onCancel={() => {
          dismiss(c.id, "revoke");
          setRevokeOpen(false);
        }}
        onConfirm={() => void confirmRevoke()}
      />
    </ConsolePage>
  );
}
