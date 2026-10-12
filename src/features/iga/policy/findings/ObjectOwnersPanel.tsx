/**
 * Owners of one identity or workload (SPEC-iga-phase3-policy.md §9.4, §7.1):
 * who owns it, who is asked to review a change to it, and the owners an
 * identity inherits from the workloads that run as it, labelled as derived so
 * nobody mistakes them for an assignment on the role itself.
 *
 * Writes need `iga:admin` and a verified human workspace-member session; the
 * server decides. The first refusal hides the controls for the session
 * (`usePolicyPermission`), and the panel still reads.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Trash2, UserPlus } from "lucide-react";

import { useAppDispatch } from "@/app/hooks";
import {
  igaPolicyReadsApi,
  useGetGovOwnersQuery,
  usePatchGovOwnerMutation,
  usePutGovOwnersMutation,
  type GovObjectOwnership,
  type GovOwnerAssignmentInput,
  type GovOwnerObjectKind,
  type GovOwnerRole,
  type GovOwnerView,
} from "@/app/api/igaPolicyReadsApi";
import { useListMembersQuery } from "@/app/api/membershipApi";
import { StatusBadge } from "@/components/console/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Panel } from "@/features/iga/shared/components/Panel";
import { Timestamp } from "@/features/iga/shared/components/Timestamp";

import {
  PolicyActionError,
  PolicyLoadFailure,
  classifyPolicyError,
  usePolicyAction,
  usePolicyCapabilities,
  usePolicyPermission,
} from "../shared";
import { useMemberNames } from "../policies/useMemberNames";

const ROLE_WORDS: Record<GovOwnerRole, string> = { accountable: "Accountable", technical: "Technical" };
const ROLE_HINT: Record<GovOwnerRole, string> = {
  accountable: "Answers for the access and is asked to review changes.",
  technical: "Knows how it works and is consulted.",
};

const selectClass =
  "h-9 rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-2.5 text-sm text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus-ring)";

const dayOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const isoOfDay = (day: string) => (day ? `${day}T00:00:00Z` : null);

function reviewOverdue(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

/** What PUT /owners needs to keep exactly these manual owners. */
function manualInputs(owners: GovOwnerView[]): GovOwnerAssignmentInput[] {
  return owners
    .filter((o) => o.source === "manual")
    .map((o) => ({ user_id: o.user_id, role: o.role, review_due_at: o.review_due_at }));
}

const ownerKey = (o: GovOwnerAssignmentInput) => `${o.user_id}:${o.role ?? "accountable"}`;

/**
 * Saving owners replaces the whole list (`PUT /owners`) and the server has no concurrency token,
 * so a stale panel could silently delete another administrator's owner. Read the list again
 * just before sending and refuse if it is not the one this panel was built from. (Not atomic:
 * it narrows the window, it does not close it.)
 */
async function ownersMovedSince(dispatch: ReturnType<typeof useAppDispatch>, ws: string, object: { kind: GovOwnerObjectKind; id: string }, loaded: GovOwnerView[]): Promise<boolean> {
  const sub = dispatch(igaPolicyReadsApi.endpoints.getGovOwners.initiate({ ws, object_kind: object.kind, object_id: object.id }, { forceRefetch: true }));
  try {
    const fresh = await sub.unwrap();
    const a = manualInputs(loaded).map(ownerKey).sort().join("|");
    const b = manualInputs(fresh.owners).map(ownerKey).sort().join("|");
    return a !== b;
  } finally {
    sub.unsubscribe();
  }
}

const OWNERS_MOVED = "The owners changed while this was open. Close and reopen it to see the current list; nothing was saved.";

function who(o: { name: string; email: string; member: boolean; user_id: string }): string {
  if (!o.member) return "A former member";
  return o.name || o.email || `Member ${o.user_id.slice(0, 8)}`;
}

export function ObjectOwnersPanel(props: { ws: string; objectKind: "identity_account" | "workload"; objectId: string }) {
  const { ws, objectKind, objectId } = props;
  const caps = usePolicyCapabilities(ws);
  const admin = usePolicyPermission("iga:admin");
  const q = useGetGovOwnersQuery({ ws, object_kind: objectKind, object_id: objectId }, { skip: caps.state !== "on" || !objectId });
  const [assigning, setAssigning] = useState(false);
  if (caps.state !== "on") return null;

  const failure = classifyPolicyError(q.error);
  const data = q.data;
  const canWrite = admin.offered && !!data;

  return (
    <Panel
      title="Owners"
      description={
        objectKind === "identity_account"
          ? "People asked to review a change to this role, including the owners of the workloads that run as it."
          : "People who own this workload and are asked to review a change to the role it runs as."
      }
      actions={
        canWrite ? (
          <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
            <UserPlus className="size-3.5" aria-hidden="true" />
            Assign owner
          </Button>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <p role="status" className="text-[13px] text-(--color-text-muted)">
          Loading owners…
        </p>
      ) : failure && !data ? (
        <PolicyLoadFailure failure={failure} subject="owners" onRetry={() => void q.refetch()} />
      ) : data ? (
        <OwnersBody ws={ws} data={data} canWrite={admin.offered} />
      ) : null}
      {assigning ? <AssignOwnersDialog ws={ws} objectKind={objectKind} objectId={objectId} onClose={() => setAssigning(false)} /> : null}
      {!admin.offered ? (
        <p className="mt-3 text-xs text-(--color-text-muted)">Your role cannot assign owners. An administrator can.</p>
      ) : null}
    </Panel>
  );
}

function OwnersBody({ ws, data, canWrite }: { ws: string; data: GovObjectOwnership; canWrite: boolean }) {
  const hasConsumers = data.consumers.length > 0;
  return (
    <div className="space-y-4">
      {!data.has_accountable ? (
        <p role="status" className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
          <strong className="font-medium">No accountable owner.</strong> A change to this {data.object_kind === "workload" ? "workload's role" : "role"} cannot go to owner review until someone is assigned.
        </p>
      ) : null}

      <div>
        <h4 className="mb-1.5 text-xs font-medium text-(--color-text-muted)">
          {data.object_kind === "workload" ? "Owners of this workload" : "Owners of this role"}
        </h4>
        {data.owners.length === 0 ? (
          <p className="text-[13px] text-(--color-text-muted)">None assigned.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle)">
            {data.owners.map((o) => (
              <OwnerRow key={o.id} ws={ws} owner={o} all={data.owners} object={{ kind: data.object_kind, id: data.object_id }} canWrite={canWrite} />
            ))}
          </ul>
        )}
      </div>

      {hasConsumers ? (
        <div>
          <h4 className="mb-1.5 text-xs font-medium text-(--color-text-muted)">
            Derived from the workloads that run as this role
          </h4>
          <ul className="divide-y divide-(--color-border-subtle)">
            {data.consumers.map((c) => (
              <li key={`${c.workload_id}:${c.relationship}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[13px]">
                <span className="min-w-0">
                  <Link to={`/iga/estate/${encodeURIComponent(c.workload_id)}`} className="font-medium text-(--color-primary-text) hover:underline">
                    {c.name || "Unnamed workload"}
                  </Link>
                  <span className="ml-2 text-xs text-(--color-text-muted)">
                    {c.relationship === "task_execution_role" ? "task execution role" : "runs as"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {c.owners.length === 0 ? (
                    <span className="text-(--color-text-muted)">No accountable owner</span>
                  ) : (
                    c.owners.map((o) => (
                      <span key={o.id} className="inline-flex items-center gap-1.5">
                        {who(o)}
                        <StatusBadge tone="neutral" title="Inherited from the workload; change it on the workload.">
                          Derived
                        </StatusBadge>
                      </span>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OwnerRow({
  ws,
  owner,
  all,
  object,
  canWrite,
}: {
  ws: string;
  owner: GovOwnerView;
  all: GovOwnerView[];
  object: { kind: GovOwnerObjectKind; id: string };
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const dispatch = useAppDispatch();
  const [day, setDay] = useState(dayOf(owner.review_due_at));
  const [patch] = usePatchGovOwnerMutation();
  const [put] = usePutGovOwnersMutation();
  const save = usePolicyAction("iga:admin");
  const remove = usePolicyAction("iga:admin");

  const overdue = reviewOverdue(owner.review_due_at);

  const saveDate = async () => {
    const ok = await save.run(() => patch({ id: owner.id, review_due_at: isoOfDay(day) }));
    if (ok) {
      setEditing(false);
      toast.success(day ? "Review date set." : "Review date cleared.");
    }
  };
  const removeOwner = async () => {
    setMoved(false);
    try {
      if (await ownersMovedSince(dispatch, ws, object, all)) {
        setMoved(true);
        return;
      }
    } catch {
      // The read failed: let the save report its own failure rather than block on a check.
    }
    const next = manualInputs(all).filter((m) => !(m.user_id === owner.user_id && m.role === owner.role));
    const ok = await remove.run(() => put({ object_kind: object.kind, object_id: object.id, owners: next }));
    if (ok) toast.success("Owner removed.");
  };

  return (
    <li className="space-y-1.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
          <span className="font-medium text-(--color-text)">{who(owner)}</span>
          <StatusBadge tone={owner.role === "accountable" ? "info" : "neutral"} title={ROLE_HINT[owner.role]}>
            {ROLE_WORDS[owner.role]}
          </StatusBadge>
          {owner.source === "tag_rule" ? (
            <StatusBadge tone="neutral" title="Assigned by an owner-tag rule. Remove the rule in Setup to remove the owner.">
              From a tag rule
            </StatusBadge>
          ) : null}
          {!owner.member ? <StatusBadge tone="warning">No longer a member</StatusBadge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-(--color-text-muted)">
          <span className={overdue ? "font-medium text-(--color-danger-text)" : undefined}>
            {owner.review_due_at ? (
              <>
                {overdue ? "Review overdue " : "Review due "}
                <Timestamp iso={owner.review_due_at} />
              </>
            ) : (
              "No review date"
            )}
          </span>
          {canWrite && !editing && !removing ? (
            <>
              <button type="button" className="font-medium text-(--color-primary-text) hover:underline" onClick={() => setEditing(true)}>
                {owner.review_due_at ? "Change date" : "Set review date"}
              </button>
              {owner.source === "manual" ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-(--color-danger-text) hover:underline"
                  onClick={() => setRemoving(true)}
                  aria-label={`Remove ${who(owner)} as ${ROLE_WORDS[owner.role].toLowerCase()} owner`}
                >
                  <Trash2 className="size-3" aria-hidden="true" /> Remove
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Review date" className="h-9 w-44" />
          <Button size="sm" onClick={() => void saveDate()} disabled={save.pending}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
          {owner.review_due_at ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDay("");
                void save.run(() => patch({ id: owner.id, review_due_at: null })).then((ok) => {
                  if (ok) {
                    setEditing(false);
                    toast.success("Review date cleared.");
                  }
                });
              }}
              disabled={save.pending}
            >
              Clear date
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.pending}>
            Cancel
          </Button>
        </div>
      ) : null}
      {removing ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span>
            Remove {who(owner)}? They will no longer be asked to review changes to this {object.kind === "workload" ? "workload" : "role"}.
          </span>
          <Button size="sm" variant="destructive" onClick={() => void removeOwner()} disabled={remove.pending}>
            {remove.pending ? "Removing…" : "Remove owner"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(false)} disabled={remove.pending}>
            Keep
          </Button>
        </div>
      ) : null}
      {moved ? (
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {OWNERS_MOVED}
        </p>
      ) : null}
      <PolicyActionError failure={save.failure ?? remove.failure} />
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*                               assign owners                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sets the object's MANUAL owners to exactly the list shown (PUT /owners).
 * Owners that a tag rule assigned stay as they are. Opened from the panel and
 * from the finding drawer.
 */
export function AssignOwnersDialog({
  ws,
  objectKind,
  objectId,
  onClose,
}: {
  ws: string;
  objectKind: GovOwnerObjectKind;
  objectId: string;
  onClose: () => void;
}) {
  const q = useGetGovOwnersQuery({ ws, object_kind: objectKind, object_id: objectId });
  const failure = classifyPolicyError(q.error);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign owners</DialogTitle>
          <DialogDescription>
            These people are asked to review a change to {q.data?.name ? <strong className="font-medium">{q.data.name}</strong> : "this object"}. Saving replaces the owners you assigned by hand; owners from tag rules stay.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p role="status" className="text-[13px] text-(--color-text-muted)">
            Loading the current owners…
          </p>
        ) : failure && !q.data ? (
          <PolicyLoadFailure failure={failure} subject="owners" onRetry={() => void q.refetch()} />
        ) : q.data ? (
          <AssignForm ws={ws} data={q.data} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface DraftOwner {
  user_id: string;
  role: GovOwnerRole;
  day: string;
}

function AssignForm({ ws, data, onClose }: { ws: string; data: GovObjectOwnership; onClose: () => void }) {
  const [draft, setDraft] = useState<DraftOwner[]>(() =>
    manualInputs(data.owners).map((o) => ({ user_id: o.user_id, role: o.role ?? "accountable", day: dayOf(o.review_due_at) })),
  );
  const [pick, setPick] = useState("");
  const [pickRole, setPickRole] = useState<GovOwnerRole>("accountable");
  const members = useListMembersQuery({ workspaceId: ws, status: "active" }, { skip: !ws });
  const nameOf = useMemberNames(ws);
  const [put] = usePutGovOwnersMutation();
  const { run, pending, failure } = usePolicyAction("iga:admin");

  const taken = useMemo(() => new Set(draft.map((d) => `${d.user_id}:${d.role}`)), [draft]);
  const candidates = useMemo(
    () =>
      (members.data?.items ?? [])
        .filter((m) => m.status === "active" && !taken.has(`${m.user_id}:${pickRole}`))
        .map((m) => ({ id: m.user_id, label: m.user_name || m.user_email || `Member ${m.user_id.slice(0, 8)}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [members.data, taken, pickRole],
  );
  const memberFailure = members.isError;

  const add = () => {
    if (!pick) return;
    setDraft((d) => [...d, { user_id: pick, role: pickRole, day: "" }]);
    setPick("");
  };

  const [moved, setMoved] = useState(false);
  const dispatch = useAppDispatch();
  const save = async () => {
    setMoved(false);
    try {
      if (await ownersMovedSince(dispatch, ws, { kind: data.object_kind, id: data.object_id }, data.owners)) {
        setMoved(true);
        return;
      }
    } catch {
      // The read failed: let the save report its own failure.
    }
    const owners: GovOwnerAssignmentInput[] = draft.map((d) => ({ user_id: d.user_id, role: d.role, review_due_at: isoOfDay(d.day) }));
    const ok = await run(() => put({ object_kind: data.object_kind, object_id: data.object_id, owners }));
    if (ok) {
      toast.success(owners.length === 0 ? "Owners cleared." : "Owners saved.");
      onClose();
    }
  };

  const tagOwners = data.owners.filter((o) => o.source === "tag_rule");

  return (
    <>
      <div className="space-y-3 text-[13px] text-(--color-text)">
        {draft.length === 0 ? (
          <p className="text-(--color-text-muted)">No one is assigned by hand. Saving now would leave only owners from tag rules.</p>
        ) : (
          <ul className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
            {draft.map((d, i) => (
              <li key={`${d.user_id}:${d.role}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-[8rem] flex-1 truncate font-medium">{nameOf(d.user_id)}</span>
                <label className="sr-only" htmlFor={`own-role-${i}`}>
                  Role of {nameOf(d.user_id)}
                </label>
                <select
                  id={`own-role-${i}`}
                  className={selectClass}
                  value={d.role}
                  onChange={(e) => {
                    const role = e.target.value as GovOwnerRole;
                    setDraft((all) => all.map((x, j) => (j === i ? { ...x, role } : x)));
                  }}
                >
                  {(Object.keys(ROLE_WORDS) as GovOwnerRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_WORDS[r]}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={d.day}
                  onChange={(e) => setDraft((all) => all.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))}
                  aria-label={`Review date for ${nameOf(d.user_id)}`}
                  className="h-9 w-40"
                />
                <button
                  type="button"
                  aria-label={`Remove ${nameOf(d.user_id)}`}
                  onClick={() => setDraft((all) => all.filter((_, j) => j !== i))}
                  className="grid size-8 place-items-center rounded text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-danger-text)"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {memberFailure ? (
          <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-(--color-warning-text)">
            The member list could not be read, so no one can be added here. Listing members needs the team permission.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-(--color-text-muted)">
              Person
              <select className={selectClass} value={pick} onChange={(e) => setPick(e.target.value)} disabled={members.isLoading}>
                <option value="">{members.isLoading ? "Loading members…" : candidates.length === 0 ? "No one left to add" : "Choose a member"}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-(--color-text-muted)">
              As
              <select className={selectClass} value={pickRole} onChange={(e) => setPickRole(e.target.value as GovOwnerRole)}>
                {(Object.keys(ROLE_WORDS) as GovOwnerRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_WORDS[r]}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="outline" onClick={add} disabled={!pick}>
              Add
            </Button>
          </div>
        )}
        <p className="text-xs text-(--color-text-muted)">
          Accountable owners answer for the access and are asked to review changes. A review date is when the owner is next asked to re-confirm.
        </p>
        {tagOwners.length > 0 ? (
          <p className="text-xs text-(--color-text-muted)">
            {tagOwners.length === 1 ? "One owner comes" : `${tagOwners.length} owners come`} from a tag rule and stay as they are. Adding the same person and role here makes that owner manual.
          </p>
        ) : null}
        <p className="text-xs text-(--color-text-muted)">Saving needs the iga:admin permission and a signed-in workspace member.</p>
      </div>
      {moved ? (
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {OWNERS_MOVED}
        </p>
      ) : null}
      <PolicyActionError failure={failure} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={pending}>
          {pending ? "Saving…" : "Save owners"}
        </Button>
      </DialogFooter>
    </>
  );
}
