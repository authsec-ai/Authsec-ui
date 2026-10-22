/**
 * One access policy (`/iga/policy/:id`): what it does, where it stands in AWS
 * for each role, the IAM documents AWS holds, and its history.
 *
 * Overview · In AWS · History. The page is read again while AuthSec is still
 * applying or repairing it, so the state moves without a reload.
 *
 * An Azure policy (no bucket; its roles' ARNs read `azure:<name>`) shows the
 * same tabs in Azure's terms: identities, a subscription, and the role
 * assignments AuthSec created or removed ("In Azure").
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  useGetAccessPolicyQuery,
  useListAccessPolicyEventsQuery,
  type AccessPolicyDetail,
} from "@/app/api/igaAccessPoliciesApi";
import { IgaBadge } from "../../shared/components/IgaBadge";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, classifyPolicyError, relTime, shortHash, usePolicyPermission } from "../shared";
import { DeletePolicyDialog } from "./DeletePolicyDialog";
import { LifecycleDialog, type LifecycleAction } from "./LifecycleDialog";
import {
  END_REASON,
  STATUS,
  accessText,
  deploymentView,
  eventLabel,
  inCloud,
  policyProvider,
  policySentence,
  resourceText,
  whenText,
  windowLength,
  windowProgress,
  windowText,
} from "./model";
import { AwsDocument, EffectChip, PolicyStatusChip } from "./parts";

type Tab = "overview" | "aws" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "aws", label: "In AWS" },
  { key: "history", label: "History" },
];

const MOVING = new Set(["applying", "drift"]);

export default function PolicyDetailPage() {
  const ws = getWorkspaceId() ?? "";
  const { id = "" } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [lifecycle, setLifecycle] = useState<LifecycleAction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const enforce = usePolicyPermission("governance:enforce");

  const [poll, setPoll] = useState(60_000);
  const q = useGetAccessPolicyQuery({ ws, id }, { pollingInterval: poll, skipPollingIfUnfocused: true });
  const p = q.data?.data;
  const nextPoll = p && MOVING.has(p.status) ? 10_000 : 60_000;
  if (nextPoll !== poll) setPoll(nextPoll);
  const failure = classifyPolicyError(q.error);

  if (!p) {
    return (
      <PolicyShell title="Policy" requires="access_policies">
        {failure ? (
          <PolicyLoadFailure failure={failure} subject="this policy" onRetry={() => void q.refetch()} />
        ) : (
          <p role="status" className="text-sm text-(--color-text-muted)">
            Loading the policy…
          </p>
        )}
      </PolicyShell>
    );
  }

  const live = p.status !== "ended";
  // AWS still holds the policy while any deployment is on its way in, in, or on its way out.
  const stillInAws = p.deployments.some((d) => ["approved", "deploying", "active", "outcome_unknown", "expiring"].includes(d.state));
  const azure = policyProvider(p) === "azure";
  // Ended and paused policies say where AuthSec is, in one quiet line by the status chip.
  const quietNote = (p.status === "ended" || p.status === "paused") && p.status_reason ? inCloud(p.status_reason.charAt(0).toUpperCase() + p.status_reason.slice(1), azure ? "azure" : "aws") : "";
  const actions =
    enforce.offered && live ? (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to={`/iga/policy/${p.id}/edit`}>Edit</Link>
        </Button>
        <Button variant="outline" onClick={() => setLifecycle(p.status === "paused" ? "resume" : "pause")}>
          {p.status === "paused" ? "Resume" : "Pause"}
        </Button>
        <Button variant="destructive" className="text-white" onClick={() => setLifecycle("end")}>
          End now
        </Button>
      </div>
    ) : enforce.offered ? (
      <Button
        variant="outline"
        className="text-(--color-danger-text)"
        onClick={() => setDeleteOpen(true)}
        disabled={stillInAws}
        title={stillInAws ? `Available once AuthSec has removed the policy from ${azure ? "Azure" : "AWS"}` : undefined}
      >
        Delete
      </Button>
    ) : undefined;

  return (
    <PolicyShell title={p.name} description={policySentence(p)} actions={actions} requires="access_policies">
      <div className="flex flex-wrap items-center gap-2">
        <EffectChip effect={p.effect} />
        <PolicyStatusChip status={p.status} provider={azure ? "azure" : "aws"} />
        <span className="text-xs text-(--color-text-muted)">{whenText(p)}</span>
        {quietNote ? <span className="text-xs text-(--color-text-secondary)">· {quietNote}</span> : null}
        <Link to="/iga/policy" className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          All policies
        </Link>
      </div>

      {p.status === "failed" || p.status === "drift" || (p.status_reason && !["applying", "ended", "paused"].includes(p.status)) ? (
        <p
          role={p.status === "failed" ? "alert" : undefined}
          className={cn(
            "rounded-md border px-3 py-2 text-[13px]",
            p.status === "failed" ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger-text)" : "border-(--color-warning) bg-(--color-warning-soft) text-(--color-warning-text)",
          )}
        >
          <strong className="font-semibold">{inCloud(STATUS[p.status]?.label ?? p.status, azure ? "azure" : "aws")}.</strong>{" "}
          {inCloud(p.status_reason || STATUS[p.status]?.hint || "", azure ? "azure" : "aws")}
        </p>
      ) : null}

      <div role="tablist" aria-label="Policy" className="flex gap-1 border-b border-(--color-border-subtle)">
        {TABS.map((t) => ({ ...t, label: t.key === "aws" && azure ? "In Azure" : t.label })).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--color-focus-ring)",
              tab === t.key ? "border-(--color-primary) text-(--color-text)" : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview p={p} /> : tab === "aws" ? <InAws p={p} /> : <History ws={ws} p={p} />}

      <DeletePolicyDialog policy={deleteOpen ? p : null} onClose={() => setDeleteOpen(false)} onDeleted={() => navigate("/iga/policy")} />
      <LifecycleDialog policy={lifecycle ? p : null} action={lifecycle} onClose={() => setLifecycle(null)} />
    </PolicyShell>
  );
}

/* --------------------------------- overview -------------------------------- */

function Overview({ p }: { p: AccessPolicyDetail }) {
  const progress = windowProgress(p);
  const length = windowLength(p);
  const azure = policyProvider(p) === "azure";
  const effect = azure
    ? p.effect === "block"
      ? "Block: AuthSec removes these identities' role assignments on the resource that grant the access, and puts them back at the end"
      : "Allow for a time: AuthSec creates a role assignment for these identities and removes it at the end"
    : p.effect === "block"
      ? "Block: deny these roles, whatever else allows them"
      : "Allow for a time: grant access the roles do not have";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Rule">
        <Facts>
          <Fact label="Effect">{effect}</Fact>
          <Fact label="Resource">
            <span className="font-mono text-xs">{resourceText(p.resource)}</span>
            {p.resource.arn && p.resource.arn !== resourceText(p.resource) ? <Meta>{p.resource.arn}</Meta> : null}
            {p.resource.account_id ? <Meta>{azure ? "Subscription" : "Account"} {p.resource.account_id}</Meta> : null}
          </Fact>
          <Fact label="Access">{accessText(p.access)}</Fact>
          <Fact label="Window">
            {windowText(p)}
            {length ? <Meta>{length}</Meta> : null}
            {progress != null && p.status !== "ended" ? (
              <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-(--color-surface-subtle)" aria-label={`${Math.round(progress * 100)}% of the window has passed`}>
                <div className="h-full rounded-full bg-(--color-primary)" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
          </Fact>
          <Fact label="Why">{p.reason || "—"}</Fact>
          <Fact label="Applied by">
            {p.created_by.name || "Unknown"} · <Timestamp iso={p.created_at} />
          </Fact>
          {/* Version lives on the History tab */}
          {p.version_no > 1 ? <Fact label="Last changed">{relTime(p.updated_at)}</Fact> : null}
          {p.status === "ended" ? <Fact label="Ended">{[relTime(p.ended_at), END_REASON[p.end_reason] ?? ""].filter(Boolean).join(" · ") || "Ended"}</Fact> : null}
        </Facts>
      </Panel>

      <Panel
        title={azure ? "Identities" : "Roles"}
        count={p.roles.length}
        description={azure ? "Agents that run as these identities reach Azure through them, so the policy applies to them." : "The agents and jobs below reach AWS through these roles, so the policy applies to them."}
      >
        <ul className="divide-y divide-(--color-border-subtle)">
          {p.roles.map((r) => (
            <li key={r.identity_account_id} className="py-2 first:pt-0 last:pb-0">
              {azure ? (
                <Link
                  to={`/iga/discovery?provider=azure&type=identities&q=${encodeURIComponent(r.name)}`}
                  className="text-[13px] font-medium text-(--color-primary-text) hover:underline"
                >
                  {r.name}
                </Link>
              ) : (
                <Link to={`/iga/identities/${r.identity_account_id}`} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
                  {r.name}
                </Link>
              )}
              {azure ? null : <Meta>{r.used_by.length ? `Used by ${r.used_by.map((w) => w.name).join(", ")}` : "No workload found running as it"}</Meta>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ---------------------------------- in AWS --------------------------------- */

function InAws({ p }: { p: AccessPolicyDetail }) {
  const [showEarlier, setShowEarlier] = useState(false);
  // deployments[] carries rows from older versions and past runs, newest first.
  // The main view is this version's rows; earlier ones go behind a toggle.
  const current = p.deployments.filter((d) => d.version_no === p.version_no);
  const earlier = p.deployments.filter((d) => d.version_no !== p.version_no);
  const docOf = (identity: string) => p.documents.find((d) => d.identity_account_id === identity);
  const azure = policyProvider(p) === "azure";
  const cloud = azure ? "Azure" : "AWS";

  return (
    <div className="space-y-4">
      <Meta>
        {azure ? (
          <>
            One entry per identity: the role assignment AuthSec created (Allow), or the identity&rsquo;s role assignments AuthSec removed and keeps a copy of to put
            back at the end (Block). AuthSec checks them again every few minutes; if one comes back or disappears in Azure, it changes it back and records it in History.
          </>
        ) : (
          <>
            One AuthSec-owned IAM policy per role, under the <span className="font-mono">/authsec/</span> path, attached to the role. AuthSec reads it back after
            applying and every few minutes after that; if someone changes or removes it in AWS, AuthSec puts it back and records it in History.
          </>
        )}
      </Meta>
      {p.deployments.length === 0 ? (
        <p className="text-sm text-(--color-text-muted)">Nothing has been sent to {cloud} for this policy yet.</p>
      ) : (
        <>
          {current.length === 0 ? (
            <p className="text-sm text-(--color-text-muted)">Nothing is in {cloud} for the current version yet.</p>
          ) : (
            current.map((d) => <DeploymentCard key={d.id} d={d} doc={docOf(d.identity_account_id)} azure={azure} />)
          )}

          {earlier.length > 0 ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowEarlier((s) => !s)}
                className="text-xs font-medium text-(--color-primary-text) hover:underline"
                aria-expanded={showEarlier}
              >
                {showEarlier ? "Hide earlier versions" : `Show earlier versions (${earlier.length})`}
              </button>
              {showEarlier ? earlier.map((d) => <DeploymentCard key={d.id} d={d} doc={docOf(d.identity_account_id)} earlier azure={azure} />) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DeploymentCard({
  d,
  doc,
  earlier,
  azure,
}: {
  d: AccessPolicyDetail["deployments"][number];
  doc: AccessPolicyDetail["documents"][number] | undefined;
  earlier?: boolean;
  azure?: boolean;
}) {
  const v = deploymentView(d.state, azure ? "azure" : "aws");
  return (
    <Panel
      title={earlier ? `${d.role_name} · v${d.version_no}` : d.role_name}
      actions={<IgaBadge tone={v.tone}>{v.label}</IgaBadge>}
    >
      <div className="space-y-3">
        <Facts>
          {azure ? (
            <Fact label="Azure scope" mono>
              {d.aws_policy_arn || "Not changed yet"}
            </Fact>
          ) : (
            <Fact label="AWS policy" mono>
              {doc?.policy_name || d.aws_policy_arn || "Not created yet"}
            </Fact>
          )}
          {d.deployed_at ? <Fact label="Applied"><Timestamp iso={d.deployed_at} /></Fact> : null}
          {d.verified_at ? <Fact label={azure ? "Confirmed in Azure" : "Confirmed by AWS"}><Timestamp iso={d.verified_at} /></Fact> : null}
          {d.last_readback_at ? <Fact label="Last checked">{relTime(d.last_readback_at)}</Fact> : null}
          {d.drift || d.last_readback_at ? (
            <Fact label="Matches AuthSec's copy">{d.drift ? <span className="text-(--color-warning-text)">No: {d.drift}</span> : "Yes"}</Fact>
          ) : null}
          {!d.deployed_at && !d.error ? <Fact label="Status">{azure ? "Waiting for AuthSec to change the role assignments in Azure." : "Waiting for AWS to accept the policy."}</Fact> : null}
          {d.end_reason ? <Fact label="Removed because">{END_REASON[d.end_reason] ?? d.end_reason}</Fact> : null}
          {d.document_hash ? (
            <Fact label="Fingerprint" mono>
              {shortHash(d.document_hash)}
            </Fact>
          ) : null}
          {d.error ? (
            <Fact label="Problem">
              <span className="text-(--color-danger-text)">{d.error}</span>
            </Fact>
          ) : null}
        </Facts>
        {doc ? <AwsDocument title={doc.policy_name || d.aws_policy_arn || d.role_name} document={doc.document} /> : null}
      </div>
    </Panel>
  );
}

/* --------------------------------- history --------------------------------- */

function History({ ws, p }: { ws: string; p: AccessPolicyDetail }) {
  const events = useListAccessPolicyEventsQuery({ ws, id: p.id, limit: 100 });
  const failure = classifyPolicyError(events.error);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Panel title="What happened" count={events.data ? events.data.data.length : undefined} flush>
        {failure && !events.data ? (
          <div className="p-3">
            <PolicyLoadFailure failure={failure} subject="the history" onRetry={() => void events.refetch()} />
          </div>
        ) : events.isLoading ? (
          <p role="status" className="px-4 py-3 text-sm text-(--color-text-muted)">
            Loading the history…
          </p>
        ) : (events.data?.data ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-(--color-text-muted)">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y divide-(--color-border-subtle)">
            {(events.data?.data ?? []).map((e) => (
              <li key={e.id} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
                <span className="text-xs text-(--color-text-muted)" title={e.occurred_at}>
                  {relTime(e.occurred_at)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] text-(--color-text)">{eventLabel(e)}</span>
                  <span className="block text-xs text-(--color-text-muted)">{e.actor_kind === "system" ? "AuthSec" : "A member"}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Versions" count={p.versions.length} description={inCloud("A version never changes once applied. Applying a new one replaces it in AWS.", policyProvider(p))}>
        <ul className="divide-y divide-(--color-border-subtle)">
          {p.versions.map((v) => (
            <li key={v.version_no} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              <span className="text-[13px] font-semibold text-(--color-text)">v{v.version_no}</span>
              <span className="min-w-0 flex-1 text-xs text-(--color-text-secondary)">
                {v.created_by.name || "Unknown"} · {relTime(v.created_at)} · <span className="font-mono">{shortHash(v.intent_hash)}</span>
              </span>
              <IgaBadge tone={v.status === "applied" ? "success" : "info"}>{v.status === "applied" ? "Current" : "Replaced"}</IgaBadge>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
