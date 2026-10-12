/**
 * Policy › Setup › IaC sources (SPEC-iga-phase3-policy.md §7.9, §8.11, §9.3 S9):
 * per connected AWS account, the repository directories AuthSec edits when a
 * change is delivered by pull request. A source can be created or deleted, never
 * edited. The forms AuthSec can and cannot change are listed as read-only
 * guidance; a form it cannot change is delivered by Export, decided before any
 * pull request is opened.
 *
 * The GitHub connections come from the connections list; no route lists a
 * repository's name, so it is typed. Each source shows the GitHub App permission
 * the server says is still missing.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { GitBranch, Plus } from "lucide-react";

import { useListDiscoveryConnectionsQuery, type Connection } from "@/app/api/connectionsApi";
import { useDeleteIacSourceMutation, useListIacSourcesQuery, type GovIaCSourceView } from "@/app/api/igaPolicySetupApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { getWorkspaceId } from "@/utils/workspace";

import {
  PolicyLoadFailure,
  classifyPolicyError,
  usePolicyAction,
  usePolicyCapabilities,
  usePolicyPermission,
} from "../shared";
import { ActionDialog } from "./ActionDialog";
import { awsAccounts, githubConnections } from "./enforcementModel";
import { GithubPermissionNote } from "./GithubPermissionNote";
import { IAC_FORMS, iacFormatLabel, permissionChip } from "./iacModel";
import { MapRepositoryDialog } from "./MapRepositoryDialog";
import { useMarkRefused } from "./useRefusal";

function SupportedForms() {
  return (
    <details className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-semibold text-(--color-text)">Which infrastructure code AuthSec can change</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-(--color-text-muted)">
          AuthSec edits only code it can locate and change mechanically. For anything else it delivers the change by Export, and says why before
          it opens anything. A change restricts whole AWS services for the selected roles; it does not narrow actions or resources within the
          services a role keeps.
        </p>
        <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
          {IAC_FORMS.map((row) => (
            <li key={row.form} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 basis-64 text-[13px] text-(--color-text)">{row.form}</p>
                <StatusBadge tone={row.supported ? "success" : "neutral"} className="shrink-0">
                  {row.supported ? "Pull request" : "Export"}
                </StatusBadge>
              </div>
              <p className="text-xs text-(--color-text-muted)">
                {row.change}
                {row.reason ? (
                  <>
                    {" "}
                    Reason: <span className="font-mono">{row.reason}</span>.
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function RoleRules({ source }: { source: GovIaCSourceView }) {
  const rules = source.role_match?.rules ?? [];
  if (rules.length === 0) return <>Roles are found by their literal name.</>;
  return (
    <details>
      <summary className="cursor-pointer">
        {rules.length} role {rules.length === 1 ? "rule" : "rules"}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {rules.map((r, i) => (
          <li key={`${r.role_name}-${i}`} className="font-mono text-xs break-all">
            {r.role_name} <span aria-hidden="true">→</span>
            <span className="sr-only">maps to</span> {r.resource}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SourceRow({
  source,
  github,
  canChange,
  onRemove,
}: {
  source: GovIaCSourceView;
  github: Connection | undefined;
  canChange: boolean;
  onRemove: (s: GovIaCSourceView) => void;
}) {
  const chip = permissionChip(source.permissions);
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-(--color-text)">
            <GitBranch className="size-3.5 shrink-0 text-(--color-text-muted)" aria-hidden="true" />
            <span className="break-all">{source.repository}</span>
          </p>
          <p className="mt-0.5 text-xs text-(--color-text-muted)">
            {iacFormatLabel(source.format)} · {source.directory ? <span className="font-mono">{source.directory}</span> : "repository root"} · branch{" "}
            <span className="font-mono">{source.base_branch}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={chip.tone}>{chip.label}</StatusBadge>
          {canChange ? (
            <Button size="sm" variant="outline" onClick={() => onRemove(source)} aria-label={`Remove the mapping of ${source.repository}`}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-1 text-xs text-(--color-text-muted)">
        <p>
          GitHub connection:{" "}
          {github ? (
            <Link to={`/iga/connections/${encodeURIComponent(github.id)}`} className="font-medium text-(--color-primary-text) hover:underline">
              {github.name || github.native_id}
            </Link>
          ) : (
            "not in the connections list"
          )}
          {" · "}mapped <Timestamp iso={source.created_at} />
        </p>
        <div>
          <RoleRules source={source} />
        </div>
      </div>
      {source.permissions.state !== "granted" ? <GithubPermissionNote permissions={source.permissions} /> : null}
    </li>
  );
}

function RemoveSourceDialog({
  account,
  source,
  onClose,
}: {
  account: Connection;
  source: GovIaCSourceView | null;
  onClose: () => void;
}) {
  const [remove] = useDeleteIacSourceMutation();
  const action = usePolicyAction("governance:enforce");

  async function confirm() {
    if (!source) return;
    const res = await action.run(() => remove({ connectorId: account.id, sourceId: source.id }));
    if (res) {
      toast.success("Mapping removed");
      onClose();
    }
  }

  return (
    <ActionDialog
      open={!!source}
      onOpenChange={(open) => {
        if (!open) {
          action.clear();
          onClose();
        }
      }}
      title="Remove this mapping"
      description={source ? `${source.repository}${source.directory ? ` / ${source.directory}` : ""}` : ""}
      confirmLabel="Remove mapping"
      busyLabel="Removing…"
      destructive
      pending={action.pending}
      failure={action.failure}
      onConfirm={() => void confirm()}
    >
      <p>
        AuthSec stops using this directory for roles in account {account.native_id}. Nothing in the repository or in AWS changes, and pull
        requests already opened stay open.
      </p>
      <p className="text-(--color-text-muted)">
        A policy that delivers to roles in this directory by pull request cannot do so until a repository is mapped again; it can still be
        delivered by Export. A mapping that pull requests were opened from cannot be removed.
      </p>
    </ActionDialog>
  );
}

function AccountSources({ account, githubList }: { account: Connection; githubList: Connection[] }) {
  const enforce = usePolicyPermission("governance:enforce");
  const sources = useListIacSourcesQuery(account.id);
  const failure = classifyPolicyError(sources.error);
  useMarkRefused(failure, "governance:enforce");
  const [mapOpen, setMapOpen] = useState(false);
  const [removing, setRemoving] = useState<GovIaCSourceView | null>(null);

  const rows = sources.data ?? [];
  const name = account.name || account.native_id;
  const changeable = !enforce.refused;
  const byId = new Map(githubList.map((g) => [g.id, g]));

  return (
    <Panel
      title={name}
      description={name !== account.native_id ? `AWS account ${account.native_id}` : "AWS account"}
      count={sources.data ? `${rows.length} ${rows.length === 1 ? "source" : "sources"}` : undefined}
      actions={
        changeable ? (
          <Button size="sm" variant="outline" onClick={() => setMapOpen(true)}>
            <Plus aria-hidden="true" />
            Map a repository
          </Button>
        ) : null
      }
      flush
    >
      {sources.isLoading ? (
        <p role="status" className="px-4 py-3 text-[13px] text-(--color-text-muted)">
          Loading…
        </p>
      ) : failure && !sources.data ? (
        <div className="px-4 py-3">
          {failure.kind === "forbidden" ? (
            <p className="text-[13px] text-(--color-text-muted)">Your role cannot see IaC sources for this account.</p>
          ) : (
            <PolicyLoadFailure failure={failure} subject="the IaC sources" onRetry={() => void sources.refetch()} />
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-1 px-4 py-3 text-[13px]">
          <p className="font-medium text-(--color-text)">No repository is mapped to this account.</p>
          <p className="text-(--color-text-muted)">
            Without one, AuthSec cannot deliver a change by pull request here. It can still deliver by Export, or apply it directly once
            enforcement is on and verified.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border-subtle)">
          {rows.map((s) => (
            <SourceRow key={s.id} source={s} github={byId.get(s.discovery_source_id)} canChange={changeable} onRemove={setRemoving} />
          ))}
        </ul>
      )}
      <MapRepositoryDialog account={account} github={githubList} open={mapOpen} onOpenChange={setMapOpen} />
      <RemoveSourceDialog account={account} source={removing} onClose={() => setRemoving(null)} />
    </Panel>
  );
}

export default function IacSection() {
  const ws = getWorkspaceId() ?? "";
  const caps = usePolicyCapabilities(ws);
  const connections = useListDiscoveryConnectionsQuery();
  const accounts = awsAccounts(connections.data);
  const github = githubConnections(connections.data);
  const failure = classifyPolicyError(connections.error);

  if (connections.isLoading) {
    return (
      <p role="status" className="text-[13px] text-(--color-text-muted)">
        Loading AWS accounts…
      </p>
    );
  }
  if (failure && !connections.data) {
    return <PolicyLoadFailure failure={failure} subject="AWS accounts" onRetry={() => void connections.refetch()} />;
  }

  return (
    <div className="space-y-4">
      {!caps.feature("iac") ? (
        <p role="status" className="rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
          Pull-request delivery is not available on this server{caps.featureReason("iac") ? `: ${caps.featureReason("iac")}` : ""}. Changes can
          still be delivered by Export.
        </p>
      ) : null}
      <SupportedForms />
      {accounts.length === 0 ? (
        <Panel title="No AWS accounts connected">
          <p className="text-[13px] text-(--color-text-muted)">
            Repositories are mapped per AWS account. Connect an account first, then come back here.{" "}
            <Link to="/iga/connections" className="font-medium text-(--color-primary-text) underline">
              Open Connections
            </Link>
          </p>
        </Panel>
      ) : (
        accounts.map((a) => <AccountSources key={a.id} account={a} githubList={github} />)
      )}
    </div>
  );
}
