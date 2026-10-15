/**
 * Create policy (`/iga/policy/new`) and Edit policy (`/iga/policy/:id/edit`).
 *
 * The admin chooses a bucket and roles from Discovery, Block or Allow, what
 * access, and for how long, then presses Apply: there is no approval step.
 * The right column is one summary: the rule in a sentence, whether AuthSec can
 * change AWS for this account, who it affects, and the IAM documents AWS will
 * hold (from the server's preview).
 *
 * `?resource_id=`, `?identity_account_id=` and `?effect=` fill the form when it
 * is opened from Discovery or the graph.
 */

import { ArrowRight, CheckCircle2, Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";

import {
  useCreateAccessPolicyMutation,
  useEditAccessPolicyMutation,
  useGetAccessPolicyQuery,
  usePreviewAccessPolicyMutation,
  type AccessEffect,
  type AccessLevel,
  type AccessPolicyPreview,
} from "@/app/api/igaAccessPoliciesApi";
import { useGetGraphIdentityQuery, useGetGraphResourceQuery } from "@/app/api/igaGraphApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyActionError, PolicyLoadFailure, PolicyShell, classifyPolicyError, describeFailure, usePolicyAction } from "../shared";
import {
  ACCESS,
  PRESETS,
  bodyOf,
  bucketOf,
  draftOf,
  draftProblem,
  emptyDraft,
  formFieldOf,
  policySentence,
  suggestedName,
  windowOf,
  windowText,
  withEffect,
  type PolicyDraft,
} from "./model";
import { AwsDocument, EffectChip } from "./parts";
import { useAccessReadiness } from "./readiness";
import { ResourcePicker, RolePicker } from "./Pickers";

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) p-4">
      <div>
        <h2 className="text-sm font-semibold text-(--color-text)">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-(--color-text-muted)">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-1.5 text-xs text-(--color-danger-text)">
      {message}
    </p>
  ) : null;
}

/** One toggle in a row of choices: a radio when `radio`, else a checkbox. */
function Pill({
  on,
  onClick,
  disabled,
  radio,
  danger,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  radio?: boolean;
  danger?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={radio ? "radio" : "checkbox"}
      aria-checked={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? danger
            ? "border-(--color-danger) bg-(--color-danger-soft) text-(--color-danger-text)"
            : "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary-text)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text) hover:bg-(--color-surface-subtle)",
      )}
    >
      {children}
    </button>
  );
}

/** One line under the access toggles saying what the choice covers. */
function accessHint(access: AccessLevel[], isBlock: boolean): string {
  if (access.includes("all")) return "Everything on this bucket or folder: reading, writing, deleting and listing.";
  const parts = ACCESS.filter((a) => access.includes(a.key)).map((a) => a.blurb.replace(/\.$/, "").toLowerCase());
  if (!parts.length) return isBlock ? "Choose what to block." : "Choose what to allow.";
  return `${isBlock ? "Blocks" : "Allows"}: ${parts.join("; ")}.`;
}

/** Scrolls to the field a refusal names and puts the cursor in it, so the fix is one keystroke away. */
function revealField(field: string) {
  const box = document.getElementById(`ap-${field}`);
  box?.scrollIntoView({ block: "center", behavior: "smooth" });
  const target = box?.matches("input, textarea, select, button") ? box : box?.querySelector<HTMLElement>("input, textarea, select, button");
  target?.focus({ preventScroll: true });
}

export default function PolicyFormPage() {
  const ws = getWorkspaceId() ?? "";
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const [params] = useSearchParams();

  const existing = useGetAccessPolicyQuery({ ws, id: id ?? "" }, { skip: !editing });
  const loadFailure = classifyPolicyError(existing.error);

  // Opened from Discovery: fill in the bucket and the role it named.
  const fromResource = !editing ? params.get("resource_id") ?? "" : "";
  const fromRole = !editing ? params.get("identity_account_id") ?? "" : "";
  const resourceQ = useGetGraphResourceQuery({ ws, id: fromResource }, { skip: !fromResource });
  const roleQ = useGetGraphIdentityQuery({ ws, id: fromRole }, { skip: !fromRole });

  const [draft, setDraft] = useState<PolicyDraft>(() => emptyDraft({ effect: params.get("effect") === "allow" ? "allow" : "block" }));
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const filled = useRef({ policy: false, resource: false, role: false });

  useEffect(() => {
    if (editing && existing.data && !filled.current.policy) {
      filled.current.policy = true;
      setDraft(draftOf(existing.data.data));
    }
  }, [editing, existing.data]);
  useEffect(() => {
    const r = resourceQ.data?.data;
    if (r && !filled.current.resource) {
      filled.current.resource = true;
      const b = bucketOf(r.text);
      if (r.type === "s3_bucket" || b) {
        setDraft((d) => ({ ...d, resource: { resource_id: fromResource, bucket: b?.bucket ?? r.text, arn: r.text, account_id: r.account?.id ?? "" }, prefix: d.prefix || b?.prefix || "" }));
      }
    }
  }, [resourceQ.data, fromResource]);
  useEffect(() => {
    const r = roleQ.data?.data;
    if (r && !filled.current.role && r.kind === "iam_role") {
      filled.current.role = true;
      setDraft((d) => (d.roles.some((x) => x.identity_account_id === fromRole) ? d : { ...d, roles: [...d.roles, { identity_account_id: fromRole, name: r.name }] }));
    }
  }, [roleQ.data, fromRole]);

  const set = <K extends keyof PolicyDraft>(k: K, v: PolicyDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setFieldError(null);
  };
  const setEffect = (e: AccessEffect) => {
    setDraft((d) => withEffect(d, e));
    setFieldError(null);
  };
  const toggleAccess = (a: AccessLevel) => {
    if (a === "all") return set("access", draft.access.includes("all") ? ["read"] : ["all"]);
    const base = draft.access.filter((x) => x !== "all");
    set("access", base.includes(a) ? base.filter((x) => x !== a) : [...base, a]);
  };

  /* ---- preview: asked for a moment after the form stops changing; a late answer never overwrites a newer one ---- */
  const [preview, previewState] = usePreviewAccessPolicyMutation();
  const [shown, setShown] = useState<AccessPolicyPreview | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const seq = useRef(0);
  const previewable = !!draft.resource && draft.roles.length > 0 && draft.access.length > 0;
  const previewKey = JSON.stringify({ ...bodyOf(draft), ends_at: draft.preset === "custom" || draft.preset === "none" ? bodyOf(draft).ends_at : draft.preset, name: "", reason: "" });
  useEffect(() => {
    if (!previewable) {
      setShown(null);
      setPreviewNote(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      const body = { ...bodyOf(draft), name: draft.name.trim() || suggestedName(draft) || "Untitled policy", reason: draft.reason.trim() || "preview" };
      void preview(body)
        .unwrap()
        .then((r) => {
          if (seq.current !== mine) return;
          setShown(r.data);
          setPreviewNote(null);
        })
        .catch((e) => {
          if (seq.current !== mine) return;
          setShown(null);
          const f = classifyPolicyError(e);
          setPreviewNote(f ? describeFailure(f).title : "The preview could not be read.");
        });
    }, 400);
    return () => clearTimeout(t);
    // previewKey stands for every field that changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewable, previewKey]);

  /* ---- apply ---- */
  const [create] = useCreateAccessPolicyMutation();
  const [edit] = useEditAccessPolicyMutation();
  const act = usePolicyAction("governance:enforce");
  const blockers = shown?.blockers ?? [];

  async function apply() {
    const problem = draftProblem(draft);
    if (problem) {
      setFieldError(problem);
      revealField(problem.field);
      return;
    }
    const body = { ...bodyOf(draft), name: draft.name.trim() || suggestedName(draft) };
    const res = await act.run(() =>
      editing && existing.data ? edit({ id: id!, body: { ...body, base_version_no: existing.data.data.version_no } }) : create(body),
    );
    if (res) {
      toast.success(editing ? "Saved. AuthSec is applying the new version in AWS." : "Applied. AuthSec is putting it into AWS.");
      navigate(`/iga/policy/${res.data.id}`);
    }
  }
  useEffect(() => {
    const f = formFieldOf(act.failure?.field);
    if (f && act.failure) {
      // The server's own message is written for the field; fall back to the
      // code's title only when it did not send one.
      setFieldError({ field: f, message: act.failure.message || describeFailure(act.failure).title });
      revealField(f);
    }
  }, [act.failure]);

  // A stale edit is refused with 409 version_conflict (detail.current_version_no).
  // The only cure is to reload the policy and re-apply, so say exactly that.
  const staleEdit = editing && act.failure?.code === "version_conflict";

  const err = (f: string) => (fieldError?.field === f ? fieldError.message : undefined);
  const localSentence = useMemo(() => {
    if (!draft.resource || draft.roles.length === 0 || draft.access.length === 0) return "";
    return policySentence({ ...draft, resource: { bucket: draft.resource.bucket, prefix: draft.prefix.trim() }, ...windowOf(draft) });
  }, [draft]);
  const isBlock = draft.effect === "block";
  const readiness = useAccessReadiness(ws, draft.resource?.account_id || undefined);
  const bindingBlocked = blockers.some((b) => b.code.startsWith("binding_")) || (!readiness.loading && !readiness.ready);
  const otherBlockers = blockers.filter((b) => !b.code.startsWith("binding_"));
  const notes = (shown?.warnings ?? []).filter((w) => w.code !== "other_paths");
  const workloads = [...new Set((shown?.also_affected ?? []).flatMap((a) => a.workloads.map((w) => w.name)))];
  const disabledWhy = bindingBlocked
    ? "Set up AWS access for this account to apply."
    : otherBlockers.length
      ? otherBlockers[0].message
      : "";

  if (editing && loadFailure && !existing.data) {
    return (
      <PolicyShell title="Edit policy" requires="access_policies">
        <PolicyLoadFailure failure={loadFailure} subject="this policy" onRetry={() => void existing.refetch()} />
      </PolicyShell>
    );
  }
  if (editing && existing.data?.data.status === "ended") {
    return (
      <PolicyShell title="Edit policy" requires="access_policies">
        <p className="text-sm text-(--color-text-muted)">
          This policy has ended and cannot be edited.{" "}
          <Link to="/iga/policy/new" className="font-medium text-(--color-primary-text) hover:underline">
            Create a new one
          </Link>
          .
        </p>
      </PolicyShell>
    );
  }

  return (
    <PolicyShell
      title={editing ? `Edit ${existing.data?.data.name ?? "policy"}` : "Create policy"}
      description={
        editing
          ? "Applying replaces the version in AWS. The new version goes on before the old one comes off, so there is no gap."
          : "Block or allow roles on a bucket for as long as you say. AuthSec writes it into IAM and AWS enforces it."
      }
      requires="access_policies"
    >
      {editing && existing.isLoading ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Loading the policy…
        </p>
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <form
              className="min-w-0 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void apply();
              }}
            >
              <Block title="Bucket" hint="Choose the S3 bucket (file storage) this rule is about. Only buckets that AuthSec has found in your AWS policies are listed. To cover just one folder, add it next to the bucket.">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-start">
                  <div id="ap-resource">
                    <ResourcePicker
                      ws={ws}
                      value={draft.resource}
                      onChange={(r) => setDraft((d) => ({ ...d, resource: r, roles: r?.account_id === d.resource?.account_id ? d.roles : [] }))}
                      invalid={!!err("resource")}
                    />
                    <FieldError message={err("resource")} />
                  </div>
                  <div>
                    <label htmlFor="ap-prefix" className="sr-only">
                      Folder (optional)
                    </label>
                    <Input
                      id="ap-prefix"
                      value={draft.prefix}
                      onChange={(e) => set("prefix", e.target.value)}
                      placeholder="Whole bucket, or a folder/"
                      className="font-mono placeholder:font-sans"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!err("prefix")}
                    />
                    {draft.resource?.folders?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Folders Discovery found">
                        {["", ...draft.resource.folders].map((f) => (
                          <button
                            key={f || "whole"}
                            type="button"
                            onClick={() => set("prefix", f)}
                            className={cn(
                              "rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                              draft.prefix.trim() === f
                                ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary-text)"
                                : "border-(--color-border-subtle) text-(--color-text-muted) hover:text-(--color-text)",
                            )}
                          >
                            {f || "whole bucket"}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <FieldError message={err("prefix")} />
                  </div>
                </div>
              </Block>

              <Block title="Roles" hint="Choose the AWS roles this rule is for. Every agent or job that runs as one of these roles is covered.">
                <div id="ap-roles">
                  <RolePicker ws={ws} resource={draft.resource} effect={draft.effect} folder={draft.prefix} value={draft.roles} onChange={(r) => set("roles", r)} invalid={!!err("roles")} />
                  <FieldError message={err("roles")} />
                </div>
              </Block>

              <Block title="Rule">
                <div className="space-y-4">
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-(--color-text)">Effect</p>
                    <div role="radiogroup" aria-label="Block or allow" className="flex flex-wrap items-center gap-1.5">
                      <Pill radio danger on={isBlock} onClick={() => setEffect("block")} title="Deny these roles, whatever else allows them">
                        Block
                      </Pill>
                      <Pill radio on={!isBlock} onClick={() => setEffect("allow")} title="Grant access these roles do not have; must end within 30 days">
                        Allow for a time
                      </Pill>
                    </div>
                  </div>

                  <fieldset id="ap-access">
                    <legend className="mb-1.5 text-[13px] font-medium text-(--color-text)">{isBlock ? "What to block" : "What to allow"}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {isBlock ? (
                        <Pill on={draft.access.includes("all")} onClick={() => toggleAccess("all")}>
                          All access
                        </Pill>
                      ) : null}
                      {ACCESS.map((a) => (
                        <Pill key={a.key} on={draft.access.includes(a.key)} disabled={draft.access.includes("all")} onClick={() => toggleAccess(a.key)} title={a.blurb}>
                          {a.label}
                        </Pill>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-(--color-text-muted)">{accessHint(draft.access, isBlock)}</p>
                    <FieldError message={err("access")} />
                  </fieldset>

                  <div id="ap-end">
                    <p className="mb-1.5 text-[13px] font-medium text-(--color-text)">For how long</p>
                    <div role="radiogroup" aria-label="For how long" className="flex flex-wrap gap-1.5">
                      {PRESETS.filter((p) => isBlock || p.key !== "none").map((p) => (
                        <Pill key={p.key} radio on={draft.preset === p.key} onClick={() => set("preset", p.key)}>
                          {p.label}
                        </Pill>
                      ))}
                    </div>
                    {draft.preset === "custom" ? (
                      <div className="mt-2 grid max-w-lg gap-2 sm:grid-cols-2">
                        <div id="ap-start">
                          <label htmlFor="ap-start-input" className="text-xs text-(--color-text-muted)">
                            Starts (blank: now)
                          </label>
                          <Input id="ap-start-input" type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} className="mt-1" />
                          <FieldError message={err("start")} />
                        </div>
                        <div>
                          <label htmlFor="ap-end-input" className="text-xs text-(--color-text-muted)">
                            Ends{isBlock ? " (blank: no end)" : ""}
                          </label>
                          <Input id="ap-end-input" type="datetime-local" value={draft.end} onChange={(e) => set("end", e.target.value)} className="mt-1" aria-invalid={!!err("end")} />
                        </div>
                      </div>
                    ) : null}
                    <p className="mt-1.5 text-xs text-(--color-text-muted)">
                      {draft.preset === "none"
                        ? "No end: it stays until you end or pause it."
                        : draft.preset === "custom"
                          ? `${windowText(windowOf(draft))}, your local time.`
                          : `From when you apply, for ${PRESETS.find((p) => p.key === draft.preset)?.label}. AWS stops honouring it at the end, even if AuthSec is down.`}
                    </p>
                    <FieldError message={err("end")} />
                  </div>
                </div>
              </Block>

              <Block title="Name and reason">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div id="ap-name">
                    <label htmlFor="ap-name-input" className="sr-only">
                      Name
                    </label>
                    <Input
                      id="ap-name-input"
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder={suggestedName(draft) || "Name"}
                      maxLength={200}
                      aria-invalid={!!err("name")}
                    />
                    <FieldError message={err("name")} />
                  </div>
                  <div id="ap-reason">
                    <label htmlFor="ap-reason-input" className="sr-only">
                      Why
                    </label>
                    <Input
                      id="ap-reason-input"
                      value={draft.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      maxLength={500}
                      placeholder="Why (kept in the history)"
                      aria-invalid={!!err("reason")}
                    />
                    <FieldError message={err("reason")} />
                  </div>
                </div>
              </Block>
            </form>

            <aside aria-label="Summary" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <div className="overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
                <div className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <EffectChip effect={draft.effect} />
                    <span className="text-xs text-(--color-text-muted)">Summary</span>
                  </div>
                  <p className="text-[15px] font-semibold leading-snug text-(--color-text)">
                    {localSentence || "Choose a bucket, roles and access to see what this does."}
                  </p>
                  {previewable ? (
                    <p className="text-xs text-(--color-text-muted)">
                      Only these roles change. Other roles, users, groups and bucket policies keep their access.
                    </p>
                  ) : null}
                </div>

                <ul className="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle) text-[13px]">
                  {readiness.loading ? null : readiness.ready ? (
                    <li className="flex items-start gap-2 px-4 py-2.5 text-(--color-text)">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-success-text)" />
                      AuthSec can change IAM in this account.
                    </li>
                  ) : (
                    <li className="space-y-1.5 bg-(--color-surface-subtle) px-4 py-2.5">
                      <p className="flex items-start gap-2 text-(--color-text)">
                        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-info-text)" />
                        <span>
                          {readiness.failed
                            ? "Could not check whether AuthSec can change AWS."
                            : !readiness.available
                              ? readiness.reason || "Applying policies is turned off on this server."
                              : readiness.notReady.length
                                ? `AWS access is not set up for ${readiness.notReady.length === 1 ? "account" : "accounts"} ${readiness.notReady.map((a) => a.account_id).join(", ")}. AuthSec can read ${readiness.notReady.length === 1 ? "it" : "them"} but cannot change ${readiness.notReady.length === 1 ? "it" : "them"} yet.`
                                : "No AWS account is connected yet."}
                        </span>
                      </p>
                      {readiness.available && !readiness.failed ? (
                        <Link to="/iga/connections" className="ml-6 inline-flex items-center gap-1 text-xs font-semibold text-(--color-primary-text) hover:underline">
                          Open Connections
                          <ArrowRight aria-hidden="true" className="size-3.5" />
                        </Link>
                      ) : null}
                    </li>
                  )}

                  {previewable && shown ? (
                    <li className="px-4 py-2.5 text-(--color-text)">
                      {workloads.length ? (
                        <>
                          Affects <span className="font-medium">{workloads.join(", ")}</span>, which run as {draft.roles.length === 1 ? "this role" : "these roles"}.
                        </>
                      ) : (
                        <span className="text-(--color-text-muted)">No workload Discovery found runs as {draft.roles.length === 1 ? "this role" : "these roles"}.</span>
                      )}
                    </li>
                  ) : null}

                  {otherBlockers.map((b) => (
                    <li key={`${b.code}:${b.message}`} role="alert" className="px-4 py-2.5 text-(--color-danger-text)">
                      {b.message}
                    </li>
                  ))}
                  {notes.map((w) => (
                    <li key={`${w.code}:${w.message}`} className="px-4 py-2.5 text-(--color-warning-text)">
                      {w.message}
                    </li>
                  ))}
                  {previewNote ? <li className="px-4 py-2.5 text-xs text-(--color-text-muted)">Preview unavailable: {previewNote}</li> : null}
                  {previewState.isLoading && !shown && previewable ? (
                    <li role="status" className="px-4 py-2.5 text-xs text-(--color-text-muted)">
                      Working out what AWS will get…
                    </li>
                  ) : null}
                </ul>

                {shown?.documents.length ? (
                  <details className="border-t border-(--color-border-subtle)">
                    <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-(--color-primary-text)">
                      View the IAM {shown.documents.length === 1 ? "policy" : `policies (${shown.documents.length})`} AuthSec will attach
                    </summary>
                    <div className="space-y-2 px-4 pb-3">
                      {shown.documents.map((d) => (
                        <AwsDocument key={d.identity_account_id} title={[d.role_name, d.policy_name].filter(Boolean).join(" · ") || "IAM policy"} document={d.document} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </aside>
          </div>

          {/* Sticky action bar, aligned to the page content (not full-bleed, so
              it sits flush with the form columns above). It stays in view while
              the form scrolls, so Apply/Cancel are always one click away. */}
          <div className="sticky bottom-0 z-10 mt-4 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)/90 px-4 py-3 shadow-(--shadow-xs) backdrop-blur supports-backdrop-filter:bg-(--color-surface-raised)/80">
            {staleEdit ? (
              <div className="mb-3 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
                <p className="font-semibold">This policy changed since you opened it.</p>
                <p className="mt-0.5">
                  Someone applied version {typeof act.failure?.detail?.current_version_no === "number" ? act.failure.detail.current_version_no : "a newer one"} while you were editing. Reload it, then re-apply your change.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    filled.current.policy = false;
                    act.clear();
                    void existing.refetch();
                  }}
                >
                  Reload the policy
                </Button>
              </div>
            ) : (
              <PolicyActionError failure={act.failure && !act.failure.field ? act.failure : null} className="mb-3" />
            )}
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
              <span className={cn("mr-auto text-xs", disabledWhy ? "text-(--color-warning-text)" : "text-(--color-text-muted)")}>
                {disabledWhy || (isBlock ? "Takes effect when you apply. You can lift it any time." : "Takes effect when you apply and ends on its own.")}
              </span>
              <Button variant="outline" asChild>
                <Link to={editing ? `/iga/policy/${id}` : "/iga/policy"}>Cancel</Link>
              </Button>
              <Button
                variant={isBlock ? "destructive" : "default"}
                className="text-white"
                onClick={() => void apply()}
                disabled={act.pending || !!disabledWhy}
              >
                {act.pending ? "Applying…" : editing ? "Apply changes" : isBlock ? "Apply block" : "Apply allow"}
              </Button>
            </div>
          </div>
        </>
      )}
    </PolicyShell>
  );
}
