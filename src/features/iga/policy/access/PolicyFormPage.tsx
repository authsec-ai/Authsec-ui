/**
 * Create policy (`/iga/policy/new`) and Edit policy (`/iga/policy/:id/edit`).
 *
 * The admin chooses a bucket and roles from Discovery, Block or Allow, what
 * access, and for how long, then presses Apply: there is no approval step.
 * The right column says what will happen, in words and as the IAM documents
 * AWS will hold, from the server's preview as the form is filled in.
 *
 * `?resource_id=`, `?identity_account_id=` and `?effect=` fill the form when it
 * is opened from Discovery or the graph.
 */

import { Check } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { AwsDocument, ReadinessBanner } from "./parts";
import { ResourcePicker, RolePicker } from "./Pickers";

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-(--color-text)">
          <span className="grid size-5 place-items-center rounded-full bg-(--color-primary-soft) text-[11px] text-(--color-primary-text)">{n}</span>
          {title}
        </h2>
        {hint ? <p className="mt-0.5 pl-7 text-xs text-(--color-text-muted)">{hint}</p> : null}
      </div>
      <div className="pl-7">{children}</div>
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

function Choice({ on, onClick, title, blurb, tone = "primary" }: { on: boolean; onClick: () => void; title: string; blurb: string; tone?: "primary" | "danger" }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
        on
          ? tone === "danger"
            ? "border-(--color-danger) bg-(--color-danger-soft)"
            : "border-(--color-primary) bg-(--color-primary-soft)"
          : "border-(--color-border-strong) bg-(--color-surface-raised) hover:bg-(--color-surface-subtle)",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          on ? (tone === "danger" ? "border-(--color-danger) bg-(--color-danger)" : "border-(--color-primary) bg-(--color-primary)") : "border-(--color-border-strong)",
        )}
      >
        {on ? <span className="size-1.5 rounded-full bg-white" /> : null}
      </span>
      <span>
        <span className="block text-[13px] font-semibold text-(--color-text)">{title}</span>
        <span className="block text-xs text-(--color-text-muted)">{blurb}</span>
      </span>
    </button>
  );
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
      document.getElementById(`ap-${problem.field}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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
      document.getElementById(`ap-${f}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
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

  if (editing && loadFailure && !existing.data) {
    return (
      <PolicyShell title="Edit policy" nav={false} requires="access_policies">
        <PolicyLoadFailure failure={loadFailure} subject="this policy" onRetry={() => void existing.refetch()} />
      </PolicyShell>
    );
  }
  if (editing && existing.data?.data.status === "ended") {
    return (
      <PolicyShell title="Edit policy" nav={false} requires="access_policies">
        <p className="text-sm text-(--color-text-muted)">
          This policy has ended and cannot be edited.{" "}
          <Link to={`/iga/policy/new`} className="font-medium text-(--color-primary-text) hover:underline">
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
          : "Choose a bucket and roles, Block or Allow, and for how long. AuthSec writes it into IAM; AWS enforces it."
      }
      nav={false}
      requires="access_policies"
    >
      {editing && existing.isLoading ? (
        <p role="status" className="text-sm text-(--color-text-muted)">
          Loading the policy…
        </p>
      ) : (
        <>
          <ReadinessBanner ws={ws} accountId={draft.resource?.account_id || undefined} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <form
              className="min-w-0 space-y-7"
              onSubmit={(e) => {
                e.preventDefault();
                void apply();
              }}
            >
              <Section n={1} title="Resource" hint="An S3 bucket Discovery found, and optionally one folder in it.">
                <div id="ap-resource" className="space-y-3">
                  <ResourcePicker
                    ws={ws}
                    value={draft.resource}
                    onChange={(r) => setDraft((d) => ({ ...d, resource: r, roles: r?.account_id === d.resource?.account_id ? d.roles : [] }))}
                    invalid={!!err("resource")}
                  />
                  <FieldError message={err("resource")} />
                  <div>
                    <label htmlFor="ap-prefix" className="text-[13px] font-medium text-(--color-text)">
                      Folder (optional)
                    </label>
                    <Input
                      id="ap-prefix"
                      value={draft.prefix}
                      onChange={(e) => set("prefix", e.target.value)}
                      placeholder="invoices/"
                      className="mt-1.5 max-w-sm font-mono"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!err("prefix")}
                    />
                    {err("prefix") ? <FieldError message={err("prefix")} /> : <p className="mt-1 text-xs text-(--color-text-muted)">Blank means the whole bucket.</p>}
                  </div>
                </div>
              </Section>

              <Section n={2} title="Roles" hint="An agent reaches AWS through the role it runs as. Every agent or job using a role is affected.">
                <div id="ap-roles">
                  <RolePicker ws={ws} resource={draft.resource} value={draft.roles} onChange={(r) => set("roles", r)} invalid={!!err("roles")} />
                  <FieldError message={err("roles")} />
                </div>
              </Section>

              <Section n={3} title="Block or allow">
                <div role="radiogroup" aria-label="Block or allow" className="flex flex-col gap-2 sm:flex-row">
                  <Choice on={isBlock} onClick={() => setEffect("block")} tone="danger" title="Block access" blurb="Deny these roles, whatever else allows them." />
                  <Choice on={!isBlock} onClick={() => setEffect("allow")} title="Allow access for a time" blurb="Grant access these roles do not have. Must end within 30 days." />
                </div>
              </Section>

              <Section n={4} title={isBlock ? "What to block" : "What to allow"}>
                <fieldset id="ap-access" className="space-y-2">
                  <legend className="sr-only">Access</legend>
                  <div className={cn("grid gap-2", isBlock ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
                    {isBlock ? (
                      <AccessBox on={draft.access.includes("all")} onClick={() => toggleAccess("all")} label="All access" blurb="Everything on this bucket or folder." />
                    ) : null}
                    {ACCESS.map((a) => (
                      <AccessBox
                        key={a.key}
                        on={draft.access.includes(a.key)}
                        disabled={draft.access.includes("all")}
                        onClick={() => toggleAccess(a.key)}
                        label={a.label}
                        blurb={a.blurb}
                      />
                    ))}
                  </div>
                  <FieldError message={err("access")} />
                </fieldset>
              </Section>

              <Section n={5} title="For how long">
                <div id="ap-end" className="space-y-3">
                  <div role="radiogroup" aria-label="How long" className="flex flex-wrap gap-1.5">
                    {PRESETS.filter((p) => isBlock || p.key !== "none").map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        role="radio"
                        aria-checked={draft.preset === p.key}
                        onClick={() => set("preset", p.key)}
                        className={cn(
                          "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition-colors",
                          draft.preset === p.key
                            ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                            : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {draft.preset === "custom" ? (
                    <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                      <div id="ap-start">
                        <label htmlFor="ap-start-input" className="text-[13px] font-medium text-(--color-text)">
                          Starts
                        </label>
                        <Input id="ap-start-input" type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} className="mt-1.5" />
                        <p className="mt-1 text-xs text-(--color-text-muted)">Blank means now.</p>
                        <FieldError message={err("start")} />
                      </div>
                      <div>
                        <label htmlFor="ap-end-input" className="text-[13px] font-medium text-(--color-text)">
                          Ends
                        </label>
                        <Input id="ap-end-input" type="datetime-local" value={draft.end} onChange={(e) => set("end", e.target.value)} className="mt-1.5" aria-invalid={!!err("end")} />
                        {isBlock ? <p className="mt-1 text-xs text-(--color-text-muted)">Blank means no end.</p> : null}
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-(--color-text-muted)">
                    {draft.preset === "none"
                      ? "No end: the block stays until you end or pause it."
                      : draft.preset === "custom"
                        ? `${windowText(windowOf(draft))}, your local time.`
                        : `Starts when you apply and lasts ${PRESETS.find((p) => p.key === draft.preset)?.label}. AWS stops honouring it at the end, even if AuthSec is down.`}
                  </p>
                  <FieldError message={err("end")} />
                </div>
              </Section>

              <Section n={6} title="Name and reason">
                <div className="grid gap-3">
                  <div id="ap-name">
                    <label htmlFor="ap-name-input" className="text-[13px] font-medium text-(--color-text)">
                      Name
                    </label>
                    <Input
                      id="ap-name-input"
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder={suggestedName(draft) || "Block the refund agent on the ledger"}
                      maxLength={200}
                      className="mt-1.5"
                      aria-invalid={!!err("name")}
                    />
                    {err("name") ? <FieldError message={err("name")} /> : <p className="mt-1 text-xs text-(--color-text-muted)">Left blank, the suggestion is used.</p>}
                  </div>
                  <div id="ap-reason">
                    <label htmlFor="ap-reason-input" className="text-[13px] font-medium text-(--color-text)">
                      Why
                    </label>
                    <Textarea
                      id="ap-reason-input"
                      rows={2}
                      value={draft.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      maxLength={500}
                      placeholder="For example: the refund agent must not read the ledger during the audit freeze"
                      className="mt-1.5"
                      aria-invalid={!!err("reason")}
                    />
                    <FieldError message={err("reason")} />
                  </div>
                </div>
              </Section>
            </form>

            <aside aria-label="What happens" className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className={cn("rounded-lg border px-4 py-3", isBlock ? "border-(--color-danger) bg-(--color-danger-soft)" : "border-(--color-primary) bg-(--color-primary-soft)")}>
                <h2 className="text-xs font-semibold text-(--color-text-muted)">What happens</h2>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-(--color-text)">
                  {shown?.sentence || localSentence || "Choose a bucket, roles and access to see what this policy will do."}
                </p>
                <p className="mt-1.5 text-xs text-(--color-text-muted)">AWS enforces it. AuthSec applies it, reads it back, and puts it back if someone changes it.</p>
              </div>

              {previewNote ? <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">Preview: {previewNote}</p> : null}
              {previewState.isLoading && !shown ? (
                <p role="status" className="text-xs text-(--color-text-muted)">
                  Working out what AWS will get…
                </p>
              ) : null}

              {blockers.length ? (
                <div role="alert" className="space-y-1 rounded-md border border-(--color-danger) bg-(--color-surface-raised) px-3 py-2">
                  <p className="text-[13px] font-semibold text-(--color-danger-text)">Apply would be refused</p>
                  {blockers.map((b) => (
                    <p key={`${b.code}:${b.message}`} className="text-xs text-(--color-text)">
                      {b.message}
                    </p>
                  ))}
                </div>
              ) : null}

              {shown?.also_affected.some((a) => a.workloads.length) ? (
                <div className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2">
                  <p className="text-[13px] font-semibold text-(--color-text)">Who this affects</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-(--color-text)">
                    {shown.also_affected.map((a) => {
                      const role = draft.roles.find((r) => r.identity_account_id === a.identity_account_id)?.name ?? "A role";
                      return a.workloads.length ? (
                        <li key={a.identity_account_id}>
                          <span className="font-medium">{role}</span> is used by {a.workloads.map((w) => w.name).join(", ")}.
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              ) : null}

              {shown?.warnings.length ? (
                <div className="space-y-1 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2">
                  {shown.warnings.map((w) => (
                    <p key={`${w.code}:${w.message}`} className="text-xs text-(--color-warning-text)">
                      {w.message}
                    </p>
                  ))}
                </div>
              ) : null}

              {shown?.documents.length ? (
                <details className="rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised)">
                  <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-(--color-text)">
                    What AWS will get ({shown.documents.length} IAM {shown.documents.length === 1 ? "policy" : "policies"})
                  </summary>
                  <div className="space-y-2 px-3 pb-3">
                    {shown.documents.map((d) => (
                      <AwsDocument key={d.identity_account_id} title={`${d.role_name} · ${d.policy_name}`} document={d.document} />
                    ))}
                  </div>
                </details>
              ) : null}
            </aside>
          </div>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) bg-(--color-surface-base) px-1 py-3">
            {staleEdit ? (
              <div className="basis-full rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
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
              <PolicyActionError failure={act.failure && !act.failure.field ? act.failure : null} className="basis-full" />
            )}
            <span className="text-xs text-(--color-text-muted)">{isBlock ? "Applies now. You can lift it any time." : "Applies now and ends on its own."}</span>
            <span className="flex-1" />
            <Button variant="outline" asChild>
              <Link to={editing ? `/iga/policy/${id}` : "/iga/policy"}>Cancel</Link>
            </Button>
            <Button
              variant={isBlock ? "destructive" : "default"}
              className="text-white"
              onClick={() => void apply()}
              disabled={act.pending || blockers.length > 0}
            >
              {act.pending ? "Applying…" : editing ? "Apply changes" : isBlock ? "Apply block" : "Apply allow"}
            </Button>
          </div>
        </>
      )}
    </PolicyShell>
  );
}

function AccessBox({ on, disabled, onClick, label, blurb }: { on: boolean; disabled?: boolean; onClick: () => void; label: string; blurb: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        on ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-strong) bg-(--color-surface-raised) hover:bg-(--color-surface-subtle)",
      )}
    >
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-(--color-primary) bg-(--color-primary) text-white" : "border-(--color-border-strong)")}>
        {on ? <Check aria-hidden="true" className="size-3" /> : null}
      </span>
      <span>
        <span className="block text-[13px] font-medium text-(--color-text)">{label}</span>
        <span className="block text-xs text-(--color-text-muted)">{blurb}</span>
      </span>
    </button>
  );
}
