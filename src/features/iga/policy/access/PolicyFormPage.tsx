/**
 * Create policy (`/iga/policy/new`) and Edit policy (`/iga/policy/:id/edit`),
 * one form for AWS and Azure (SPEC-access-policies.md §2.1).
 *
 * The admin chooses the cloud, a resource and the identities from Discovery
 * (AWS: an S3 bucket or folder and IAM roles; Azure: one resource and service
 * principals, managed identities or agent identities), Block or Allow, what
 * access, and for how long, then presses Apply: there is no approval step.
 * The right column is one summary: the rule in a sentence, whether AuthSec can
 * change this account or subscription, who it affects, and the change the
 * cloud gets (from the server's preview).
 *
 * `?resource_id=`, `?identity_account_id=`, `?effect=` and `?provider=azure`
 * fill the form when it is opened from Discovery or the graph.
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
import { useGetGraphIdentityQuery, useGetGraphNeighbourhoodQuery, useGetGraphResourceQuery, type GraphRef } from "@/app/api/igaGraphApi";
import { armTypeLabel } from "@/features/discovery/cloud/azure/azureDiscoveryLabels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getWorkspaceId } from "@/utils/workspace";

import { PolicyActionError, PolicyLoadFailure, PolicyShell, classifyPolicyError, describeFailure, usePolicyAction } from "../shared";
import { usePolicyCapabilities } from "../shared/usePolicyCapabilities";
import { PageFooter } from "@/components/layout/PageFooter";
import { ProviderGlyph } from "../../shared/components/ProviderGlyph";
import { AzureIdentityPicker, AzureResourcePicker } from "./AzurePickers";
import {
  ACCESS,
  AZURE_TARGET_KINDS,
  CLOUD,
  PRESETS,
  accessBlurbs,
  armParts,
  bodyOf,
  awsTypeOf,
  awsResourceOf,
  azureNoDelete,
  draftCopy,
  draftOf,
  draftProblem,
  draftSubScope,
  draftType,
  isOver,
  emptyDraft,
  formFieldOf,
  policySentence,
  suggestedName,
  windowOf,
  windowText,
  whoWord,
  withEffect,
  type PolicyDraft,
} from "./model";
import { EffectChip, PolicyChange } from "./parts";
import { useAccessReadiness } from "./readiness";
import { K8sPicker } from "./K8sPickers";
import { ResourcePicker, RolePicker } from "./Pickers";
import { RESOURCE_TYPES, resourceTypeCopy, typeRules, type AwsResourceType, type ResourceTypeCopy } from "./resourceTypes";

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

/** One line under the access toggles saying what the choice covers. `copy` is the AWS type's words, absent on Azure. */
function accessHint(access: AccessLevel[], isBlock: boolean, blurbs: ReturnType<typeof accessBlurbs>, copy: ResourceTypeCopy | undefined): string {
  if (access.includes("all")) return copy ? copy.allHint : "Everything on this resource: reading, changing and deleting.";
  const parts = ACCESS.filter((a) => access.includes(a.key)).map((a) => blurbs[a.key].replace(/\.$/, "").toLowerCase());
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

  // Opened from Discovery or the graph: fill in the resource and the identity it named.
  const fromResource = !editing ? params.get("resource_id") ?? "" : "";
  const fromRole = !editing ? params.get("identity_account_id") ?? "" : "";
  const fromAzure = params.get("provider") === "azure";
  // Opened from a Kubernetes page: the ServiceAccount is named in the link (UI-054).
  const fromK8s = !editing && params.get("provider") === "k8s";
  const fromSA = fromK8s && fromRole ? { identity_account_id: fromRole, name: params.get("sa") || fromRole } : null;
  const resourceQ = useGetGraphResourceQuery({ ws, id: fromResource }, { skip: !fromResource || fromAzure || fromK8s });
  const roleQ = useGetGraphIdentityQuery({ ws, id: fromRole }, { skip: !fromRole || fromAzure || fromK8s });
  // An Azure object is read off the shared graph: its root node names it (D-114).
  const azureResourceQ = useGetGraphNeighbourhoodQuery({ ws, root: `resource:${fromResource}` as GraphRef, direction: "reverse" }, { skip: !fromResource || !fromAzure });
  const azureRoleQ = useGetGraphNeighbourhoodQuery({ ws, root: `identity:${fromRole}` as GraphRef, direction: "forward" }, { skip: !fromRole || !fromAzure });

  const [draft, setDraft] = useState<PolicyDraft>(() =>
    fromK8s
      ? withEffect(emptyDraft({ provider: "k8s", roles: fromSA ? [fromSA] : undefined }), "block")
      : emptyDraft({
          provider: fromAzure ? "azure" : "aws",
          awsType: awsTypeOf(params.get("type") ?? undefined),
          effect: params.get("effect") === "allow" && !resourceTypeCopy(params.get("type") ?? undefined)?.blockOnly ? "allow" : "block",
        }),
  );
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
      const got = awsResourceOf(fromResource, r.text, r.type, r.account?.id ?? "");
      if (got) {
        setDraft((d) => ({
          ...(resourceTypeCopy(got.awsType)?.blockOnly ? withEffect(d, "block") : d),
          awsType: got.awsType,
          resource: got.resource,
          prefix: got.awsType === "s3_bucket" ? d.prefix || got.prefix : "",
        }));
      }
    }
  }, [resourceQ.data, fromResource]);
  useEffect(() => {
    const g = azureResourceQ.data?.data;
    const n = g?.nodes.find((x) => x.ref === g.root);
    // Only an Azure root with its ARM id fills the form; anything else leaves the picker to the admin.
    if (n && n.provider === "azure" && n.native_id && !filled.current.resource) {
      filled.current.resource = true;
      const arn = n.native_id ?? "";
      const { subscription, resourceGroup } = armParts(arn);
      setDraft((d) => ({
        ...d,
        resource: {
          provider: "azure",
          resource_id: fromResource,
          resource_type: "azure_resource",
          name: n.label,
          bucket: "",
          arn,
          account_id: subscription,
          tenant: n.scope?.id,
          kind: armTypeLabel(String(n.kind)),
          subscription: n.sub_scope ?? undefined,
          resource_group: resourceGroup || undefined,
        },
      }));
    }
  }, [azureResourceQ.data, fromResource]);
  useEffect(() => {
    const g = azureRoleQ.data?.data;
    const n = g?.nodes.find((x) => x.ref === g.root);
    if (n && !filled.current.role && AZURE_TARGET_KINDS.has(String(n.kind))) {
      filled.current.role = true;
      setDraft((d) => (d.roles.some((x) => x.identity_account_id === fromRole) ? d : { ...d, roles: [...d.roles, { identity_account_id: fromRole, name: n.label }] }));
    }
  }, [azureRoleQ.data, fromRole]);
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
  // Another cloud is another resource and other identities: start those over.
  const setProvider = (provider: PolicyDraft["provider"]) => {
    setDraft((d) =>
      d.provider === provider
        ? d
        : // Kubernetes blocks a ServiceAccount from a whole role.
          { ...d, provider, resource: null, prefix: "", roles: [], ...(provider === "k8s" ? { effect: "block" as const, access: ["all" as const] } : {}) },
    );
    setFieldError(null);
  };
  // So is another kind of AWS resource.
  const setAwsType = (awsType: AwsResourceType) => {
    setDraft((d) =>
      d.awsType === awsType && (!d.resource || d.resource.resource_type === awsType)
        ? d
        : {
            ...(resourceTypeCopy(awsType)?.blockOnly ? withEffect(d, "block") : d),
            awsType,
            resource: null,
            prefix: "",
            roles: [],
            ...(resourceTypeCopy(awsType)?.noDelete ? { access: d.access.filter((a) => a !== "delete").length ? d.access.filter((a) => a !== "delete") : ["read" as const] } : {}),
          },
    );
    setFieldError(null);
  };
  const caps = usePolicyCapabilities(ws);
  const awsTypes = (Object.keys(RESOURCE_TYPES) as AwsResourceType[]).filter((t) => caps.accessResourceTypes.includes(t));
  const setEffect = (e: AccessEffect) => {
    setDraft((d) => withEffect(d, e));
    setFieldError(null);
  };
  const toggleAccess = (a: AccessLevel) => {
    if (draft.provider === "k8s") return;
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
      const cloud = CLOUD[draft.provider].label;
      toast.success(editing ? `Saved. AuthSec is applying the new version in ${cloud}.` : `Applied. AuthSec is putting it into ${cloud}.`);
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
    return policySentence({ ...draft, resource: { ...draft.resource, prefix: draftSubScope(draft) }, ...windowOf(draft) });
  }, [draft]);
  const isBlock = draft.effect === "block";
  const aws = draft.provider === "aws";
  const k8s = draft.provider === "k8s";
  const who = whoWord(draft.provider, draft.roles.length);
  const blurbs = accessBlurbs(draft.provider, draft.resource?.arn, draftType(draft));
  // The AWS resource type's words: S3's until another type is chosen. Read on AWS only.
  const awsCopy: ResourceTypeCopy = draftCopy(draft) ?? RESOURCE_TYPES.s3_bucket;
  const rules = typeRules(awsCopy, caps.accessTypeViews[draftType(draft)]);
  const blockOnly = k8s || (aws && (rules.blockOnly || caps.accessBlockOnly.includes(draftType(draft))));
  const readiness = useAccessReadiness(ws, draft.resource?.account_id || undefined, draft.provider);
  const bindingBlocked = blockers.some((b) => b.code.startsWith("binding_")) || (!readiness.loading && !readiness.ready);
  const otherBlockers = blockers.filter((b) => !b.code.startsWith("binding_"));
  const notes = (shown?.warnings ?? []).filter((w) => w.code !== "other_paths");
  const workloads = [...new Set((shown?.also_affected ?? []).flatMap((a) => a.workloads.map((w) => w.name)))];
  const disabledWhy = bindingBlocked
    ? k8s
      ? readiness.reason || "Kubernetes access policies are not available on this server."
      : aws
      ? "Set up AWS access for this account to apply."
      : !readiness.available
        ? readiness.reason || "Applying policies is not available on this server."
        : readiness.scopes.length === 0
          ? "This resource's subscription is not connected to AuthSec."
          : "Give AuthSec's Azure app the Role Based Access Control Administrator role on this subscription to apply."
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
  if (editing && existing.data && isOver(existing.data.data.status)) {
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
          ? aws
            ? "Applying replaces the version in AWS. The new version goes on before the old one comes off, so there is no gap."
            : "Applying replaces the version in Azure: AuthSec applies the new one and undoes what the old one changed."
          : aws
            ? "Block or allow an agent's access to a resource for as long as you say. AuthSec makes the change in AWS and undoes it at the end."
            : "Block or allow an agent's access to an Azure resource for a set time. AuthSec makes the change in Azure and reverses it when the time is up."
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
              {editing || fromAzure ? null : (
                <Block title="Cloud">
                  <div role="radiogroup" aria-label="Cloud" className="flex flex-wrap gap-1.5">
                    {(caps.accessK8s ? (["aws", "azure", "k8s"] as const) : (["aws", "azure"] as const)).map((c) => (
                      <Pill key={c} radio on={draft.provider === c} onClick={() => setProvider(c)}>
                        <span aria-hidden="true" className="mr-1.5 inline-flex"><ProviderGlyph provider={c} /></span>
                        {CLOUD[c].label}
                      </Pill>
                    ))}
                  </div>
                </Block>
              )}

              {fromAzure && (azureResourceQ.isError || azureRoleQ.isError) ? (
                <p role="status" className="rounded-md border border-(--color-border-strong) bg-(--color-surface-subtle) px-3 py-2 text-xs text-(--color-text-muted)">
                  The {fromResource ? "resource" : "identity"} this link names could not be read. Choose it below.
                </p>
              ) : null}

              {aws && awsTypes.length > 1 ? (
                <Block title="Resource type">
                  <div role="radiogroup" aria-label="Resource type" className="flex flex-wrap gap-1.5">
                    {awsTypes.map((t) => (
                      <Pill key={t} radio on={draftType(draft) === t} onClick={() => setAwsType(t)}>
                        {RESOURCE_TYPES[t].pill}
                      </Pill>
                    ))}
                  </div>
                </Block>
              ) : null}

              {aws ? (
              <Block title={awsCopy.title} hint={awsCopy.hint}>
                <div className={cn("grid gap-2 sm:items-start", awsCopy.subScope === "folder" && "sm:grid-cols-[minmax(0,1fr)_14rem]")}>
                  <div id="ap-resource">
                    <ResourcePicker
                      ws={ws}
                      type={awsTypeOf(draftType(draft))}
                      value={draft.resource}
                      onChange={(r) => setDraft((d) => ({ ...d, resource: r, roles: !r || !d.resource || r.account_id === d.resource.account_id ? d.roles : [] }))}
                      invalid={!!err("resource")}
                    />
                    <FieldError message={err("resource")} />
                  </div>
                  {awsCopy.subScope === "folder" ? (
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
                  ) : null}
                </div>
              </Block>
              ) : k8s ? (
                <Block
                  title="ServiceAccount and role"
                  hint="Choose the ServiceAccount, then the role to take it out of. AuthSec asks the cluster's agent to remove it from every binding of that role, and to put it back at the end."
                >
                  <div id="ap-resource">
                    <K8sPicker
                      resource={draft.resource}
                      roles={draft.roles}
                      onChange={(resource, roles) => setDraft((d) => ({ ...d, resource, roles }))}
                      invalid={!!err("resource") || !!err("roles")}
                    />
                    <FieldError message={err("resource") || err("roles")} />
                  </div>
                </Block>
              ) : (
                <Block title="Resource to control" hint="Pick the Azure resource to control, such as a storage account or a key vault. Only resources found by a scan are listed.">
                  <div id="ap-resource">
                    <AzureResourcePicker
                      ws={ws}
                      value={draft.resource}
                      // Identities stay while the tenant does: one filled in from a link survives the first pick, and Change keeps them.
                      onChange={(r) => setDraft((d) => ({ ...d, resource: r, roles: !r || !d.resource || r.tenant === d.resource.tenant ? d.roles : [] }))}
                      invalid={!!err("resource")}
                    />
                    <FieldError message={err("resource")} />
                  </div>
                </Block>
              )}

              {aws ? (
                <Block title="Roles" hint="Choose the AWS roles this rule is for. Every agent or job that runs as one of these roles is covered.">
                  <div id="ap-roles">
                    <RolePicker ws={ws} resource={draft.resource} effect={draft.effect} folder={draft.prefix} value={draft.roles} onChange={(r) => set("roles", r)} invalid={!!err("roles")} />
                    <FieldError message={err("roles")} />
                  </div>
                </Block>
              ) : k8s ? null : (
                <Block title="Logins" hint="Pick the logins this rule applies to: app logins, Azure-run logins or AI agents. Anything that runs under one of them is covered too.">
                  <div id="ap-roles">
                    <AzureIdentityPicker ws={ws} resource={draft.resource} effect={draft.effect} value={draft.roles} onChange={(r) => set("roles", r)} invalid={!!err("roles")} />
                    <FieldError message={err("roles")} />
                  </div>
                </Block>
              )}

              <Block title={aws ? "Rule" : "What to do"}>
                <div className="space-y-4">
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-(--color-text)">{aws ? "Effect" : "Action"}</p>
                    <div role="radiogroup" aria-label="Block or allow" className="flex flex-wrap items-center gap-1.5">
                      <Pill
                        radio
                        danger
                        on={isBlock}
                        onClick={() => setEffect("block")}
                        title={aws ? "Deny these roles, whatever else allows them" : "Take away the role assignments on this resource that give these identities the access, until the policy ends"}
                      >
                        Block
                      </Pill>
                      <Pill
                        radio
                        on={!isBlock}
                        onClick={() => setEffect("allow")}
                        disabled={blockOnly}
                        title={
                          k8s
                            ? "Kubernetes roles can only be blocked for now."
                            : blockOnly
                              ? `A ${awsCopy.noun} can only be blocked for now.`
                              : `Grant access these ${whoWord(draft.provider, 2)} do not have; must end within 30 days`
                        }
                      >
                        {aws ? "Allow for a time" : "Allow for a set time"}
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
                      {ACCESS.filter(
                        (a) =>
                          !k8s &&
                          !(a.key === "delete" && (aws ? rules.noDelete : azureNoDelete(draft.resource?.arn))) &&
                          !(aws && !isBlock && rules.allowLevels && !rules.allowLevels.includes(a.key)),
                      ).map((a) => (
                        <Pill key={a.key} on={draft.access.includes(a.key)} disabled={draft.access.includes("all")} onClick={() => toggleAccess(a.key)} title={blurbs[a.key]}>
                          {a.label}
                        </Pill>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-(--color-text-muted)">
                      {k8s
                        ? "Kubernetes cannot take away part of a binding: the ServiceAccount loses everything the role gives it."
                        : accessHint(draft.access, isBlock, blurbs, aws ? awsCopy : undefined)}
                    </p>
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
                          : `From when you apply, for ${PRESETS.find((p) => p.key === draft.preset)?.label}. ${
                              aws ? "AWS stops honouring it at the end, even if AuthSec is down." : "AuthSec undoes it in Azure at the end."
                            }`}
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
                      Reason
                    </label>
                    <Input
                      id="ap-reason-input"
                      value={draft.reason}
                      onChange={(e) => set("reason", e.target.value)}
                      maxLength={500}
                      placeholder="Reason (kept in the history)"
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
                    {localSentence || (aws ? `Choose a ${awsCopy.noun}, roles and access to see what this does.` : "Pick a resource, logins and action to see a plain summary here.")}
                  </p>
                  {previewable ? (
                    <p className="text-xs text-(--color-text-muted)">
                      {aws
                        ? awsCopy.untouched
                        : k8s
                          ? "Only this ServiceAccount changes, and only in the bindings of this role. Its other roles, and access through groups, are untouched."
                          : "Only these identities change, and only on this resource. Other identities, and roles given on the resource group or subscription, are untouched."}
                    </p>
                  ) : null}
                </div>

                <ul className="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle) text-[13px]">
                  {readiness.loading || (!aws && !draft.resource) ? null : k8s ? (
                    <li className="flex items-start gap-2 px-4 py-2.5 text-(--color-text)">
                      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-info-text)" />
                      The cluster&rsquo;s agent makes the change. It must have enforcement.bindings on and list this role; the preview says if it does not.
                    </li>
                  ) : readiness.ready ? (
                    <li className="flex items-start gap-2 px-4 py-2.5 text-(--color-text)">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-success-text)" />
                      {aws ? "AuthSec can change IAM in this account." : `AuthSec can change role assignments in subscription ${readiness.scopes[0]?.name ?? draft.resource?.subscription ?? ""}.`}
                    </li>
                  ) : !aws ? (
                    <li className="space-y-1.5 bg-(--color-surface-subtle) px-4 py-2.5">
                      <p className="flex items-start gap-2 text-(--color-text)">
                        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-(--color-info-text)" />
                        <span>
                          {readiness.failed
                            ? "Could not check whether AuthSec can change Azure."
                            : !readiness.available
                              ? readiness.reason || "Applying policies is turned off on this server."
                              : readiness.scopes.length === 0
                                ? "This resource's subscription is not connected to AuthSec."
                                : `AuthSec's Azure app cannot manage role assignments in subscription ${readiness.scopes[0].name}. Give it the Role Based Access Control Administrator role there.`}
                        </span>
                      </p>
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
                                ? `AWS access is not set up for ${readiness.notReady.length === 1 ? "account" : "accounts"} ${readiness.notReady.map((a) => a.id).join(", ")}. AuthSec can read ${readiness.notReady.length === 1 ? "it" : "them"} but cannot change ${readiness.notReady.length === 1 ? "it" : "them"} yet.`
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
                          Affects <span className="font-medium">{workloads.join(", ")}</span>, which run as {draft.roles.length === 1 ? "this" : "these"} {who}.
                        </>
                      ) : (
                        <span className="text-(--color-text-muted)">
                          No workload Discovery found runs as {draft.roles.length === 1 ? "this" : "these"} {who}.
                        </span>
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
                      Working out what {CLOUD[draft.provider].label} will get…
                    </li>
                  ) : null}
                </ul>

                {shown?.documents.length ? (
                  <details className="border-t border-(--color-border-subtle)">
                    <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-(--color-primary-text)">
                      {aws
                        ? `View the IAM ${shown.documents.length === 1 ? "policy" : `policies (${shown.documents.length})`} AuthSec will attach`
                        : "View the role assignment changes AuthSec will make"}
                    </summary>
                    <div className="space-y-2 px-4 pb-3">
                      {shown.documents.map((d) => (
                        <PolicyChange key={d.identity_account_id} title={[d.role_name, d.policy_name].filter(Boolean).join(" · ") || (aws ? "IAM policy" : "Role assignments")} document={d.document} />
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </aside>
          </div>

          {/* The page's commit zone: rendered by the layout beneath the scroll
              area, so it is always at the bottom of the window and spans it. */}
          <PageFooter>
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
                {disabledWhy ||
                  (isBlock
                    ? "Takes effect when you apply. You can remove it at any time."
                    : aws
                      ? "Takes effect when you apply and ends on its own."
                      : "Takes effect when you apply. AuthSec removes it at the end.")}
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
          </PageFooter>
        </>
      )}
    </PolicyShell>
  );
}
