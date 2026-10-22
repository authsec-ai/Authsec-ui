/**
 * One access policy (`/iga/policy/:id`): what it does, where it stands in its
 * cloud for each identity, the change the cloud holds (an IAM policy document
 * on AWS, role assignments on Azure), and its history (SPEC-access-policies.md
 * §2.3).
 *
 * Overview · In AWS / In Azure · History. The page is read again while AuthSec
 * is still applying, repairing or undoing it, so the state moves without a
 * reload.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  useGetAccessPolicyQuery,
  useListAccessPolicyEventsQuery,
  type AccessPolicyDetail,
} from "@/app/api/igaAccessPoliciesApi";
import { IgaBadge } from "../../shared/components/IgaBadge";
import { identityKindLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { Button } from "@/components/ui/button";
import { Fact, Facts, Meta, Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyLoadFailure, PolicyShell, classifyPolicyError, relTime, shortHash, usePolicyPermission } from "../shared";
import { DeletePolicyDialog } from "./DeletePolicyDialog";
import { LifecycleDialog, type LifecycleAction } from "./LifecycleDialog";
import {
  CLOUD,
  END_REASON,
  STATUS,
  accessText,
  deploymentView,
  eventLabel,
  isOver,
  policySentence,
  resourceText,
  whoWord,
  whenText,
  windowLength,
  windowProgress,
  windowText,
} from "./model";
import { EffectChip, PolicyChange, PolicyStatusChip } from "./parts";

type Tab = "overview" | "cloud" | "history";

const MOVING = new Set(["applying", "drift", "ending"]);
/** Deployment states in which the cloud still holds the policy's change, or AuthSec is putting it in or taking it out. */
const HELD = ["approved", "deploying", "active", "outcome_unknown", "expiring"];

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

  const provider = p.resource.provider;
  const cloud = CLOUD[provider].label;
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cloud", label: `In ${cloud}` },
    { key: "history", label: "History" },
  ];
  const live = !isOver(p.status);
  // The cloud still holds the policy's change while any deployment is on its way in, in, or on its way out.
  const stillHeld = p.status === "ending" || p.deployments.some((d) => HELD.includes(d.state));
  // Ended and paused policies say where AuthSec is, in one quiet line by the status chip.
  const quietNote = (isOver(p.status) || p.status === "paused") && p.status_reason ? p.status_reason.charAt(0).toUpperCase() + p.status_reason.slice(1) : "";
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
        disabled={stillHeld}
        title={stillHeld ? `Available once AuthSec has finished undoing the policy in ${cloud}` : undefined}
      >
        Delete
      </Button>
    ) : undefined;

  return (
    <PolicyShell title={p.name} description={policySentence(p)} actions={actions} requires="access_policies">
      <div className="flex flex-wrap items-center gap-2">
        <EffectChip effect={p.effect} />
        <PolicyStatusChip status={p.status} />
        <span className="text-xs text-(--color-text-muted)">{whenText(p)}</span>
        {quietNote ? <span className="text-xs text-(--color-text-secondary)">· {quietNote}</span> : null}
        <Link to="/iga/policy" className="ml-auto text-xs font-medium text-(--color-primary-text) hover:underline">
          All policies
        </Link>
      </div>

      {p.status === "failed" || p.status === "drift" || (p.status_reason && !["applying", "ending", "ended", "paused"].includes(p.status)) ? (
        <p
          role={p.status === "failed" ? "alert" : undefined}
          className={cn(
            "rounded-md border px-3 py-2 text-[13px]",
            p.status === "failed" ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger-text)" : "border-(--color-warning) bg-(--color-warning-soft) text-(--color-warning-text)",
          )}
        >
          <strong className="font-semibold">{STATUS[p.status]?.label ?? p.status}.</strong> {p.status_reason || STATUS[p.status]?.hint}
        </p>
      ) : null}

      <div role="tablist" aria-label="Policy" className="flex gap-1 border-b border-(--color-border-subtle)">
        {tabs.map((t) => (
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

      {tab === "overview" ? <Overview p={p} /> : tab === "cloud" ? <InCloud p={p} /> : <History ws={ws} p={p} />}

      <DeletePolicyDialog policy={deleteOpen ? p : null} onClose={() => setDeleteOpen(false)} onDeleted={() => navigate("/iga/policy")} />
      <LifecycleDialog policy={lifecycle ? p : null} action={lifecycle} onClose={() => setLifecycle(null)} />
    </PolicyShell>
  );
}

/* --------------------------------- overview -------------------------------- */

function Overview({ p }: { p: AccessPolicyDetail }) {
  const progress = windowProgress(p);
  const length = windowLength(p);
  const provider = p.resource.provider;
  const azure = provider === "azure";
  const Who = whoWord(provider, 2);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Rule">
        <Facts>
          <Fact label="Effect">
            {p.effect === "block"
              ? azure
                ? "Block: take away these identities' role assignments on the resource that give the access, until the policy ends"
                : "Block: deny these roles, whatever else allows them"
              : `Allow for a time: grant access the ${Who} do not have`}
          </Fact>
          <Fact label="Resource">
            {azure ? (
              <Link to={`/iga/azure/resource/${encodeURIComponent(p.resource.resource_id)}`} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
                {resourceText(p.resource)}
              </Link>
            ) : (
              <span className="font-mono text-xs">{resourceText(p.resource)}</span>
            )}
            {!azure || p.resource.arn.startsWith("/") ? <Meta>{p.resource.arn}</Meta> : null}
            {p.resource.account_id ? (
              <Meta>
                {azure ? "Subscription" : "Account"} {p.resource.account_id}
              </Meta>
            ) : null}
          </Fact>
          <Fact label="Access">{accessText(p.access)}</Fact>
          <Fact label="Window">
            {windowText(p)}
            {length ? <Meta>{length}</Meta> : null}
            {progress != null && !isOver(p.status) ? (
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
          {isOver(p.status) ? <Fact label="Ended">{[relTime(p.ended_at), END_REASON[p.end_reason] ?? ""].filter(Boolean).join(" · ") || "Ended"}</Fact> : null}
        </Facts>
      </Panel>

      <Panel
        title={azure ? "Identities" : "Roles"}
        count={p.roles.length}
        description={`The agents and jobs below reach ${CLOUD[provider].label} through these ${Who}, so the policy applies to them.`}
      >
        <ul className="divide-y divide-(--color-border-subtle)">
          {p.roles.map((r) => (
            <li key={r.identity_account_id} className="py-2 first:pt-0 last:pb-0">
              {azure ? (
                // The Azure identity page is keyed by the Entra object id, which the policy does not carry.
                <span className="text-[13px] font-medium text-(--color-text)">
                  {r.name}
                  {r.kind ? <span className="ml-1.5 text-xs font-normal text-(--color-text-muted)">{identityKindLabel(r.kind)}</span> : null}
                </span>
              ) : (
                <Link to={`/iga/identities/${r.identity_account_id}`} className="text-[13px] font-medium text-(--color-primary-text) hover:underline">
                  {r.name}
                </Link>
              )}
              <Meta>{r.used_by.length ? `Used by ${r.used_by.map((w) => w.name).join(", ")}` : "No workload found running as it"}</Meta>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ------------------------------- in the cloud ------------------------------ */

function InCloud({ p }: { p: AccessPolicyDetail }) {
  const provider = p.resource.provider;
  const cloud = CLOUD[provider].label;
  const [showEarlier, setShowEarlier] = useState(false);
  // deployments[] carries rows from older versions and past runs, newest first.
  // The main view is this version's rows; earlier ones go behind a toggle.
  const current = p.deployments.filter((d) => d.version_no === p.version_no);
  const earlier = p.deployments.filter((d) => d.version_no !== p.version_no);
  const docOf = (identity: string) => p.documents.find((d) => d.identity_account_id === identity);

  return (
    <div className="space-y-4">
      <Meta>
        {provider === "aws" ? (
          <>
            One AuthSec-owned IAM policy per role, under the <span className="font-mono">/authsec/</span> path, attached to the role. AuthSec reads it back after
            applying and every few minutes after that; if someone changes or removes it in AWS, AuthSec puts it back and records it in History.
          </>
        ) : p.effect === "block" ? (
          "For each identity, AuthSec records and then removes its role assignments on the resource that give the access, and puts exactly those back when the policy ends, is paused or is ended by hand. Azure assignments have no expiry of their own, so the end depends on AuthSec."
        ) : (
          "For each identity, AuthSec creates one built-in role assignment on the resource and deletes it when the policy ends. Azure assignments have no expiry of their own, so the end depends on AuthSec."
        )}
      </Meta>
      {p.deployments.length === 0 ? (
        <p className="text-sm text-(--color-text-muted)">Nothing has been sent to {cloud} for this policy yet.</p>
      ) : (
        <>
          {current.length === 0 ? (
            <p className="text-sm text-(--color-text-muted)">Nothing is in {cloud} for the current version yet.</p>
          ) : (
            current.map((d) => <DeploymentCard key={d.id} p={p} d={d} doc={docOf(d.identity_account_id)} />)
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
              {showEarlier ? earlier.map((d) => <DeploymentCard key={d.id} p={p} d={d} doc={docOf(d.identity_account_id)} earlier />) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DeploymentCard({
  p,
  d,
  doc,
  earlier,
}: {
  p: AccessPolicyDetail;
  d: AccessPolicyDetail["deployments"][number];
  doc: AccessPolicyDetail["documents"][number] | undefined;
  earlier?: boolean;
}) {
  const provider = p.resource.provider;
  const azure = provider === "azure";
  const cloud = CLOUD[provider].label;
  const v = deploymentView(d.state, provider, p.effect);
  return (
    <Panel
      title={earlier ? `${d.role_name} · v${d.version_no}` : d.role_name}
      actions={<IgaBadge tone={v.tone}>{v.label}</IgaBadge>}
    >
      <div className="space-y-3">
        <Facts>
          {azure ? (
            <Fact label="Scope" mono>
              {d.target_ref || d.aws_policy_arn || p.resource.arn}
            </Fact>
          ) : (
            <Fact label="AWS policy" mono>
              {doc?.policy_name || d.aws_policy_arn || "Not created yet"}
            </Fact>
          )}
          {d.deployed_at ? <Fact label="Applied"><Timestamp iso={d.deployed_at} /></Fact> : null}
          {d.verified_at ? <Fact label={`Confirmed by ${cloud}`}><Timestamp iso={d.verified_at} /></Fact> : null}
          {d.last_readback_at ? <Fact label="Last checked">{relTime(d.last_readback_at)}</Fact> : null}
          {d.drift || d.last_readback_at ? (
            <Fact label="Matches AuthSec's copy">{d.drift ? <span className="text-(--color-warning-text)">No: {d.drift}</span> : "Yes"}</Fact>
          ) : null}
          {!d.deployed_at && !d.error ? <Fact label="Status">{azure ? "Waiting for Azure to accept the change." : "Waiting for AWS to accept the policy."}</Fact> : null}
          {d.end_reason ? <Fact label={azure && p.effect === "block" ? "Restored because" : "Removed because"}>{END_REASON[d.end_reason] ?? d.end_reason}</Fact> : null}
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
        {doc ? <PolicyChange title={doc.policy_name || d.aws_policy_arn || d.role_name} document={doc.document} /> : null}
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
                  <span className="block text-[13px] text-(--color-text)">{eventLabel(e, { provider: p.resource.provider, effect: p.effect })}</span>
                  <span className="block text-xs text-(--color-text-muted)">{e.actor_kind === "system" ? "AuthSec" : "A member"}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Versions" count={p.versions.length} description={`A version never changes once applied. Applying a new one replaces it in ${CLOUD[p.resource.provider].label}.`}>
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
