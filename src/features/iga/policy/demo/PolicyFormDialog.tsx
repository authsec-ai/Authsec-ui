/**
 * Add or edit a policy: who (agent and identity), what (bucket, folder, kind of
 * access), when (a window) and two bucket guards, with the documents AWS would
 * see updating beside the form as it is filled in. Opened from the Policy page
 * and from an S3 bucket on the graph, where the bucket is already filled in.
 */

import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "react-hot-toast";

import {
  policyDemoError,
  useCreatePolicyDemoMutation,
  useListPolicyDemoQuery,
  usePreviewPolicyDemoMutation,
  useUpdatePolicyDemoMutation,
  type PolicyDemo,
  type PolicyDemoAction,
  type PolicyDemoError,
} from "@/app/api/policyDemoApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { GeneratedDocs } from "./GeneratedDocs";
import { ACTIONS, PRESETS, applyPreset, draftOf, emptyDraft, inputOf, windowText, type PolicyDraft } from "./policyDemoModel";

const FIELD_ID: Record<string, string> = { name: "pd-name", agent: "pd-agent", identity: "pd-identity", resource: "pd-bucket", prefix: "pd-prefix", end_time: "pd-end" };

/** Puts the cursor in the field a refusal names, so the fix is one keystroke away. */
function focusField(field?: string) {
  const id = field ? FIELD_ID[field] : undefined;
  if (id) setTimeout(() => document.getElementById(id)?.focus(), 0);
}

function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-(--color-text)">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-(--color-danger-text)">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-(--color-text-muted)">{hint}</p>
      ) : null}
    </div>
  );
}

function Section({ step, title, children }: { step: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
        <span className="grid size-5 place-items-center rounded-full bg-(--color-primary-soft) text-[11px] text-(--color-primary-text)">{step}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function PolicyFormDialog({
  open,
  onOpenChange,
  policy,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  policy?: PolicyDemo;
  /** Fills the bucket and folder when the form is opened from the graph. */
  initial?: { resource: string; prefix: string };
  onSaved?: (p: PolicyDemo) => void;
}) {
  const editing = !!policy;
  const [draft, setDraft] = useState<PolicyDraft>(() => (policy ? draftOf(policy) : emptyDraft(initial)));
  const [refusal, setRefusal] = useState<PolicyDemoError | null>(null);
  const [docs, setDocs] = useState<PolicyDemo | undefined>();
  const [previewNote, setPreviewNote] = useState<string | null>(null);

  const [create, creating] = useCreatePolicyDemoMutation();
  const [update, updating] = useUpdatePolicyDemoMutation();
  const [preview, previewing] = usePreviewPolicyDemoMutation();
  const saving = creating.isLoading || updating.isLoading;

  // Start fresh each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setDraft(policy ? draftOf(policy) : emptyDraft(initial));
    setRefusal(null);
    setDocs(undefined);
    setPreviewNote(null);
    // Only opening resets the form; a policy refetched underneath must not erase typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof PolicyDraft>(k: K, v: PolicyDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setRefusal(null);
  };

  // Names already in use, to suggest.
  const existing = useListPolicyDemoQuery(undefined, { skip: !open });
  const agents = useMemo(() => [...new Set((existing.data ?? []).map((p) => p.agent))], [existing.data]);
  const identities = useMemo(() => [...new Set((existing.data ?? []).map((p) => p.identity))], [existing.data]);

  // The documents follow the form: asked for a moment after typing stops, and a late answer never overwrites a newer one.
  const seq = useRef(0);
  const ready = draft.agent.trim() !== "" && draft.identity.trim() !== "" && draft.resource.trim() !== "" && draft.actions.length > 0;
  useEffect(() => {
    if (!open) return;
    if (!ready) {
      setDocs(undefined);
      setPreviewNote(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      void preview({ ...inputOf(draft), name: draft.name.trim() || "Untitled policy" })
        .unwrap()
        .then((v) => {
          if (seq.current !== mine) return;
          setDocs(v);
          setPreviewNote(null);
        })
        .catch((e) => {
          if (seq.current !== mine) return;
          setDocs(undefined);
          setPreviewNote(policyDemoError(e).message);
        });
    }, 350);
    return () => clearTimeout(t);
    // `draft` as a whole: every field changes the documents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, draft]);

  const toggleAction = (a: PolicyDemoAction) =>
    set("actions", draft.actions.includes(a) ? draft.actions.filter((x) => x !== a) : [...draft.actions, a]);

  async function save() {
    setRefusal(null);
    if (!draft.name.trim()) {
      setRefusal({ field: "name", message: "Give the policy a name." });
      focusField("name");
      return;
    }
    try {
      const body = inputOf(draft);
      const saved = policy ? await update({ id: policy.id, body }).unwrap() : await create(body).unwrap();
      toast.success(policy ? "Policy saved" : "Policy created");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      const r = policyDemoError(e);
      setRefusal(r);
      focusField(r.field);
    }
  }

  const err = (f: string) => (refusal?.field === f ? refusal.message : undefined);
  const generalError = refusal && !["name", "agent", "identity", "resource", "prefix", "actions", "end_time"].includes(refusal.field ?? "") ? refusal.message : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? undefined : onOpenChange(o))}>
      {/* Escape closes this dialog only, not the graph card it was opened from. */}
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-5xl" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader className="border-b border-(--color-border-subtle) px-6 py-4">
          <DialogTitle>{editing ? "Edit policy" : "Add policy"}</DialogTitle>
          <DialogDescription>
            Say which agent may do what to which bucket, and for how long. The documents AWS would see build on the right as you go. Nothing is applied to AWS in this demo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <form
            className="max-h-[calc(92vh-9.5rem)] space-y-6 overflow-y-auto px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Section step="1" title="Who">
              <Field label="Policy name" htmlFor="pd-name" error={err("name")}>
                <Input id="pd-name" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Invoice reader for the finance agent" maxLength={120} aria-invalid={!!err("name")} autoFocus />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Agent" htmlFor="pd-agent" hint="The AI agent this is for." error={err("agent")}>
                  <Input id="pd-agent" list="pd-agents" value={draft.agent} onChange={(e) => set("agent", e.target.value)} placeholder="my-agentic-ai" aria-invalid={!!err("agent")} autoComplete="off" />
                  <datalist id="pd-agents">{agents.map((a) => <option key={a} value={a} />)}</datalist>
                </Field>
                <Field label="Acts as (identity)" htmlFor="pd-identity" hint="The role or account it uses in AWS." error={err("identity")}>
                  <Input id="pd-identity" list="pd-identities" value={draft.identity} onChange={(e) => set("identity", e.target.value)} placeholder="my-privilege-account" aria-invalid={!!err("identity")} autoComplete="off" />
                  <datalist id="pd-identities">{identities.map((a) => <option key={a} value={a} />)}</datalist>
                </Field>
              </div>
              <Field label="Why (optional)" htmlFor="pd-desc">
                <Textarea id="pd-desc" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={500} placeholder="What the agent needs this for" />
              </Field>
            </Section>

            <Section step="2" title="What">
              <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="Resource" htmlFor="pd-type">
                  <select id="pd-type" disabled className="h-10 w-full rounded-md border border-(--color-border-strong) bg-(--color-surface-subtle) px-3 text-sm text-(--color-text-muted)">
                    <option>S3 bucket</option>
                  </select>
                </Field>
                <Field label="Bucket" htmlFor="pd-bucket" error={err("resource")}>
                  <Input id="pd-bucket" value={draft.resource} onChange={(e) => set("resource", e.target.value)} placeholder="finance-reports" aria-invalid={!!err("resource")} autoComplete="off" spellCheck={false} />
                </Field>
                <Field label="Folder (optional)" htmlFor="pd-prefix" hint="Blank means the whole bucket." error={err("prefix")}>
                  <Input id="pd-prefix" value={draft.prefix} onChange={(e) => set("prefix", e.target.value)} placeholder="invoices/" aria-invalid={!!err("prefix")} autoComplete="off" spellCheck={false} />
                </Field>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-[13px] font-medium text-(--color-text)">Access</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ACTIONS.map((a) => {
                    const on = draft.actions.includes(a.key);
                    return (
                      <button
                        key={a.key}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleAction(a.key)}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                          on ? "border-(--color-primary) bg-(--color-primary-soft)" : "border-(--color-border-strong) bg-(--color-surface-raised) hover:bg-(--color-surface-subtle)",
                        )}
                      >
                        <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", on ? "border-(--color-primary) bg-(--color-primary) text-white" : "border-(--color-border-strong)")}>
                          {on ? <Check aria-hidden="true" className="size-3" /> : null}
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium text-(--color-text)">{a.label}</span>
                          <span className={cn("block text-xs", a.risky ? "text-(--color-warning-text)" : "text-(--color-text-muted)")}>{a.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {err("actions") ? <p role="alert" className="text-xs text-(--color-danger-text)">{err("actions")}</p> : null}
              </fieldset>
            </Section>

            <Section step="3" title="When">
              <div role="radiogroup" aria-label="Time window" className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={draft.preset === p.key}
                    onClick={() => setDraft((d) => applyPreset(d, p.key))}
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Starts" htmlFor="pd-start">
                    <Input id="pd-start" type="datetime-local" value={draft.start} onChange={(e) => set("start", e.target.value)} />
                  </Field>
                  <Field label="Ends" htmlFor="pd-end" error={err("end_time")}>
                    <Input id="pd-end" type="datetime-local" value={draft.end} onChange={(e) => set("end", e.target.value)} aria-invalid={!!err("end_time")} />
                  </Field>
                </div>
              ) : null}
              <p className="text-xs text-(--color-text-muted)">
                {draft.preset === "none" ? "No time limit: it applies until the policy is paused or removed." : `${windowText(inputWindow(draft))} (your local time).`}
              </p>
            </Section>

            <Section step="4" title="Guard the bucket">
              <div className="divide-y divide-(--color-border-subtle) rounded-md border border-(--color-border-subtle)">
                <label className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <span>
                    <span className="block text-[13px] font-medium text-(--color-text)">Agents cannot change or delete the bucket</span>
                    <span className="block text-xs text-(--color-text-muted)">Denies policy, ACL and encryption changes to any agent-tagged role.</span>
                  </span>
                  <Switch checked={draft.protect_bucket} onCheckedChange={(v) => set("protect_bucket", v)} aria-label="Agents cannot change or delete the bucket" />
                </label>
                <label className="flex items-center justify-between gap-4 px-3 py-2.5">
                  <span>
                    <span className="block text-[13px] font-medium text-(--color-text)">Require TLS</span>
                    <span className="block text-xs text-(--color-text-muted)">Denies plain-HTTP requests from everyone.</span>
                  </span>
                  <Switch checked={draft.require_tls} onCheckedChange={(v) => set("require_tls", v)} aria-label="Require TLS" />
                </label>
              </div>
            </Section>

            {generalError ? (
              <p role="alert" className="rounded-md border-l-2 border-l-(--color-danger-text) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger-text)">
                {generalError}
              </p>
            ) : null}
          </form>

          <aside aria-label="What AWS would see" className="max-h-[calc(92vh-9.5rem)] space-y-3 overflow-y-auto border-t border-(--color-border-subtle) bg-(--color-surface-subtle) px-6 py-5 lg:border-l lg:border-t-0">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
              <ShieldCheck aria-hidden="true" className="size-4" />
              What AWS would see
            </h3>
            {previewNote ? <p className="rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">{previewNote}</p> : null}
            <GeneratedDocs docs={docs?.generated} busy={previewing.isLoading || (ready && !docs && !previewNote)} />
          </aside>
        </div>

        <DialogFooter className="border-t border-(--color-border-subtle) px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="text-white" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The window a draft would make, for the line under the presets. */
function inputWindow(d: PolicyDraft) {
  const i = inputOf(d);
  return { start_time: i.start_time, end_time: i.end_time };
}
