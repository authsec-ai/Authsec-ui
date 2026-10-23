/** Small pieces every access-policy screen shares: chips, the change each cloud gets, and the readiness banner. */

import { Copy, Info } from "lucide-react";
import { Link } from "react-router-dom";

import { useGetAccessReadinessQuery, type AccessEffect, type AccessPolicyStatus } from "@/app/api/igaAccessPoliciesApi";
import { DecisionBanner } from "@/components/console/status";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

import { IgaBadge } from "../../shared/components/IgaBadge";
import { classifyPolicyError } from "../shared";
import { EFFECT, STATUS } from "./model";
import { readinessWords } from "./readiness";

export function PolicyStatusChip({ status, className }: { status: AccessPolicyStatus; className?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const, hint: "" };
  return (
    <IgaBadge tone={s.tone} title={s.hint} className={className}>
      {s.label}
    </IgaBadge>
  );
}

export function EffectChip({ effect }: { effect: AccessEffect }) {
  const e = EFFECT[effect];
  return <IgaBadge tone={e.tone}>{e.label}</IgaBadge>;
}

/** One IAM policy document, as AWS will hold it. */
export function AwsDocument({ title, document, className }: { title?: string; document: Record<string, unknown>; className?: string }) {
  const text = JSON.stringify(document, null, 2);
  return (
    <figure className={cn("min-w-0 overflow-hidden rounded-md border border-(--color-border-subtle)", className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5">
        <span className="truncate font-mono text-xs text-(--color-text-muted)">{title ?? "IAM policy"}</span>
        <button
          type="button"
          aria-label="Copy the policy document"
          className="inline-flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-text)"
          onClick={() => void copyToClipboard(text, "Policy document")}
        >
          <Copy aria-hidden="true" className="size-3.5" />
          Copy
        </button>
      </figcaption>
      <pre className="max-h-80 overflow-auto bg-(--color-surface-raised) px-3 py-2 font-mono text-xs leading-relaxed text-(--color-text)">{text}</pre>
    </figure>
  );
}

/** A string list from a document field, [] when absent. */
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Azure's built-in roles an allow assigns, by role definition GUID. */
const BUILT_IN_ROLE: Record<string, string> = {
  "2a2b9908-6ea1-4ae2-8e65-a410df84e7d1": "Storage Blob Data Reader",
  "ba92f5b4-2d11-453d-a403-e96b0029c9fe": "Storage Blob Data Contributor",
  "acdd72a7-3385-48ef-bd42-f606fba81ae7": "Reader",
  "b24988ac-6180-42a0-ab88-20f7382dd24c": "Contributor",
};

function roleName(roleDefinitionId: unknown): string {
  const id = typeof roleDefinitionId === "string" ? roleDefinitionId.slice(roleDefinitionId.lastIndexOf("/") + 1).toLowerCase() : "";
  return BUILT_IN_ROLE[id] ?? "Azure role (name not available)";
}

/**
 * What AuthSec changes in Azure for one identity, in words, with the JSON
 * behind it one click away. Two shapes reach here:
 *   the preview's  `remove_role_assignments_granting {scope, actions, data_actions}`
 *                  or `create_role_assignment {scope, role, role_definition_id}`;
 *   the detail's   `{scope, principal_id, removed_role_assignments: [...]}`
 *                  or `{scope, principal_id, create_role_assignment {name, role_definition_id}}`.
 */
export function AzureChange({ title, document, className }: { title?: string; document: Record<string, unknown>; className?: string }) {
  const remove = document.remove_role_assignments_granting as Record<string, unknown> | undefined;
  const create = document.create_role_assignment as Record<string, unknown> | undefined;
  const removed = Array.isArray(document.removed_role_assignments) ? (document.removed_role_assignments as Record<string, unknown>[]) : null;
  const scope = String(document.scope ?? (remove ?? create)?.scope ?? "");
  const where = scope ? scope.slice(scope.lastIndexOf("/") + 1) : "the resource";
  const grants = remove ? [...strings(remove.data_actions), ...strings(remove.actions)] : [];
  return (
    <figure className={cn("min-w-0 overflow-hidden rounded-md border border-(--color-border-subtle)", className)}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-1.5">
        <span className="truncate text-xs text-(--color-text-muted)">{title ?? "Azure role assignments"}</span>
        <button
          type="button"
          aria-label="Copy the change as JSON"
          className="inline-flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-text)"
          onClick={() => void copyToClipboard(JSON.stringify(document, null, 2), "Change")}
        >
          <Copy aria-hidden="true" className="size-3.5" />
          Copy
        </button>
      </figcaption>
      <div className="space-y-2 bg-(--color-surface-raised) px-3 py-2 text-[13px] text-(--color-text)">
        {removed ? (
          removed.length ? (
            <>
              <p>
                Removed {removed.length === 1 ? "this role assignment" : `these ${removed.length} role assignments`} on <span className="font-medium">{where}</span>; AuthSec puts {removed.length === 1 ? "it" : "them"} back when the policy ends:
              </p>
              <ul className="space-y-0.5 text-xs text-(--color-text-secondary)">
                {removed.map((a, i) => {
                  const props = (a.properties ?? {}) as Record<string, unknown>;
                  return (
                    <li key={String(a.id ?? i)} className="break-all">
                      {roleName(props.roleDefinitionId)}
                      {props.scope ? <span className="font-mono text-(--color-text-muted)"> · {String(props.scope)}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>No role assignment on <span className="font-medium">{where}</span> gave this identity the access, so nothing was removed. AuthSec removes any that appear while the block is on.</p>
          )
        ) : remove ? (
          <>
            <p>
              Removes this identity&rsquo;s role assignments on <span className="font-medium">{where}</span> (or inside it) whose role grants any of these, and puts them back when the policy ends:
            </p>
            <ul className="space-y-0.5 font-mono text-xs text-(--color-text-secondary)">
              {grants.map((a) => (
                <li key={a} className="break-all">
                  {a}
                </li>
              ))}
            </ul>
          </>
        ) : create ? (
          <p>
            Assigns <span className="font-medium">{typeof create.role === "string" ? create.role : roleName(create.role_definition_id)}</span> on <span className="font-medium">{where}</span>. Azure assignments do not expire on their own: AuthSec removes it when the policy ends.
          </p>
        ) : (
          <pre className="max-h-80 overflow-auto font-mono text-xs">{JSON.stringify(document, null, 2)}</pre>
        )}
        {scope ? <p className="break-all font-mono text-xs text-(--color-text-muted)">{scope}</p> : null}
      </div>
    </figure>
  );
}

/** The change one identity gets, in its cloud's form: an IAM policy document, or Azure role assignments. */
export function PolicyChange({ title, document, className }: { title?: string; document: Record<string, unknown>; className?: string }) {
  return document.provider === "azure" ? <AzureChange title={title} document={document} className={className} /> : <AwsDocument title={title} document={document} className={className} />;
}

/** A quiet note above a list: one line of what, one of why, and the way forward on the right. */
function SetupNotice({ title, body, actionLabel, actionHref }: { title: string; body: string; actionLabel?: string; actionHref?: string }) {
  return (
    <section className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-4 py-3">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-info-text)" />
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="text-[13px] font-semibold leading-5 text-(--color-text)">{title}</h2>
        <p className="mt-0.5 max-w-3xl text-[13px] leading-5 text-(--color-text-muted)">{body}</p>
      </div>
      {actionLabel && actionHref ? (
        <Link
          to={actionHref}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3 text-xs font-semibold text-(--color-text-secondary) transition-colors hover:bg-(--color-surface-subtle) hover:text-(--color-text)"
        >
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Whether AuthSec can change the clouds it is connected to. Says so once, with
 * the way to fix it, and nothing when every AWS account and Azure subscription
 * is ready. A failed check is said as a failed check, never as "not ready".
 */
export function ReadinessBanner({ ws, accountId }: { ws: string; accountId?: string }) {
  const q = useGetAccessReadinessQuery({ ws });
  if (q.isLoading) return null;
  if (q.isError) {
    const f = classifyPolicyError(q.error);
    if (f?.kind === "unavailable") return null; // the page shell already says Policy is not available
    return (
      <DecisionBanner
        tone="warning"
        title="Could not check whether AuthSec can make changes in your clouds"
        body="Applying may still be refused. Retry, or check Connections."
        actionLabel="Retry"
        onAction={() => void q.refetch()}
        secondaryLabel="Open Connections"
        secondaryHref="/iga/connections"
      />
    );
  }
  const r = q.data?.data;
  if (!r) return null;
  const accounts = accountId ? r.accounts.filter((a) => a.account_id === accountId) : r.accounts;
  const notReady = accounts.filter((a) => !a.ready);
  const subs = accountId ? [] : r.azure_subscriptions;
  const subsNotReady = subs.filter((s) => !s.ready);
  if (r.available && accounts.length === 0 && subs.length > 0) {
    // An Azure-only workspace: say only what Azure needs.
    return subsNotReady.length ? (
      <SetupNotice
        title="AuthSec cannot change role assignments in every subscription yet"
        body={`${subsNotReady.map((s) => s.name || s.subscription_id).join(", ")}: give AuthSec's Azure app the Role Based Access Control Administrator role on ${subsNotReady.length === 1 ? "that subscription" : "those subscriptions"} so it can block and allow access there.`}
      />
    ) : null;
  }
  if (r.available && notReady.length === 0 && accounts.length > 0 && subsNotReady.length === 0) return null;
  if (r.available && notReady.length === 0 && accounts.length > 0) {
    return (
      <SetupNotice
        title="AuthSec cannot change role assignments in every Azure subscription yet"
        body={`${subsNotReady.map((s) => s.name || s.subscription_id).join(", ")}: give AuthSec's Azure app the Role Based Access Control Administrator role on ${subsNotReady.length === 1 ? "that subscription" : "those subscriptions"} so it can block and allow access there.`}
      />
    );
  }
  const body = !r.available
    ? r.reason || "Applying policies is turned off on this server."
    : accounts.length === 0
      ? "No AWS account or Azure subscription is connected yet. Connect one in Connections first."
      : `${notReady.length === 1 ? `Account ${notReady[0].account_id} needs` : `Accounts ${notReady.map((a) => a.account_id).join(", ")} need`} AWS access set up before AuthSec can apply policies there. Until then AuthSec can read ${notReady.length === 1 ? "it" : "them"} but not change ${notReady.length === 1 ? "it" : "them"}. ${[...new Set(notReady.map((a) => readinessWords(a.reason)))].map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(". ")}.`;
  return (
    <SetupNotice
      title="AWS access is not set up yet"
      body={body}
      actionLabel={r.available && accounts.length > 0 ? "Open Connections" : undefined}
      actionHref={r.available && accounts.length > 0 ? "/iga/connections" : undefined}
    />
  );
}
