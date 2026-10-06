/**
 * Policy — a reserved destination (SPEC-console-revamp.md, "Policy — reserved
 * destination"), restored to its original structure (commit 75db0ed / 8e99f0d):
 *
 *   1. title and a one-line description;
 *   2. the preview boundary, stated once: nothing is evaluated or enforced;
 *   3. what Policy will hold, in one paragraph;
 *   4. the way out: links to Discovery and Connections.
 *
 * Added inside that structure: one shared rule layout — who · can do · on ·
 * where — with each provider's own field names (AWS, Google Cloud, Azure,
 * Kubernetes, GitHub), so a rule reads the same whichever provider it governs.
 * It is reference only: no network call, no sample data, no control that
 * looks operational.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { ConsolePage } from "@/components/console/ConsolePage";
import { toneClasses } from "@/components/console/status";
import { cn } from "@/lib/utils";

const LINK_CLASS =
  "inline-flex h-9 items-center rounded-md border border-(--color-border-strong) bg-(--color-surface-raised) px-3.5 text-sm font-medium text-(--color-text) transition-colors hover:bg-(--color-surface-subtle) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)";

/** The four parts every rule has, whatever it governs. */
type Slot = "subject" | "action" | "target" | "scope";

const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: "subject", label: "Who", hint: "The non-human identity the rule is about" },
  { key: "action", label: "Can do", hint: "The permission, in the provider's own terms" },
  { key: "target", label: "On", hint: "The resource, or a pattern of resources" },
  { key: "scope", label: "Where", hint: "The boundary the rule applies within" },
];

type ProviderKey = "aws" | "gcp" | "azure" | "k8s" | "github";

interface Field {
  name: string;
  example: string;
}

const PROVIDERS: { key: ProviderKey; label: string; fields: Record<Slot, Field> }[] = [
  {
    key: "aws",
    label: "AWS",
    fields: {
      subject: { name: "IAM role", example: "role/refund-agent" },
      action: { name: "IAM action", example: "dynamodb:PutItem" },
      target: { name: "Resource ARN or pattern", example: "table/acme-refunds" },
      scope: { name: "Account · Region", example: "1234-5678-9012 · us-east-1" },
    },
  },
  {
    key: "gcp",
    label: "Google Cloud",
    fields: {
      subject: { name: "Service account", example: "refund-agent@acme.iam.gserviceaccount.com" },
      action: { name: "IAM permission or role", example: "storage.objects.create" },
      target: { name: "Resource name", example: "buckets/acme-refunds" },
      scope: { name: "Project", example: "acme-prod" },
    },
  },
  {
    key: "azure",
    label: "Azure",
    fields: {
      subject: { name: "Managed identity or service principal", example: "refund-agent-mi" },
      action: { name: "Role definition action", example: "Microsoft.Storage/storageAccounts/write" },
      target: { name: "Resource ID", example: "storageAccounts/acmerefunds" },
      scope: { name: "Subscription · Resource group", example: "acme-prod · rg-refunds" },
    },
  },
  {
    key: "k8s",
    label: "Kubernetes",
    fields: {
      subject: { name: "ServiceAccount", example: "payments/refund-agent" },
      action: { name: "Verb", example: "create" },
      target: { name: "API group · Resource", example: "batch · jobs" },
      scope: { name: "Cluster · Namespace", example: "prod-eu · payments" },
    },
  },
  {
    key: "github",
    label: "GitHub",
    fields: {
      subject: { name: "GitHub App or workflow token", example: "refund-bot" },
      action: { name: "Permission · Level", example: "contents · write" },
      target: { name: "Repository", example: "acme/refunds-service" },
      scope: { name: "Organization", example: "acme" },
    },
  },
];

function RuleFields() {
  const [active, setActive] = useState<ProviderKey>("aws");
  const provider = PROVIDERS.find((p) => p.key === active) ?? PROVIDERS[0];
  return (
    <section aria-labelledby="policy-fields" className="max-w-3xl overflow-hidden rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised)">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border-subtle) px-5 py-3">
        <h2 id="policy-fields" className="text-sm font-semibold text-(--color-text)">
          How a rule will read
        </h2>
        <div
          role="tablist"
          aria-label="Provider"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            const i = PROVIDERS.findIndex((p) => p.key === active);
            const next = PROVIDERS[(i + (e.key === "ArrowRight" ? 1 : PROVIDERS.length - 1)) % PROVIDERS.length];
            setActive(next.key);
            document.getElementById(`policy-tab-${next.key}`)?.focus();
          }}
          className="inline-flex flex-wrap rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-0.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              id={`policy-tab-${p.key}`}
              aria-selected={active === p.key}
              tabIndex={active === p.key ? 0 : -1}
              aria-controls="policy-fields-panel"
              onClick={() => setActive(p.key)}
              className={cn(
                "h-7 rounded px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-(--color-primary)",
                active === p.key ? "bg-(--color-surface-raised) text-(--color-text) shadow-[0_1px_2px_rgb(15_23_42/0.08)]" : "text-(--color-text-secondary) hover:text-(--color-text)",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>
      <dl id="policy-fields-panel" role="tabpanel" aria-labelledby={`policy-tab-${provider.key}`} className="divide-y divide-(--color-border-subtle)">
        {SLOTS.map((s) => {
          const f = provider.fields[s.key];
          return (
            <div key={s.key} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline">
              <dt className="text-[13px] font-medium text-(--color-text)" title={s.hint}>
                {s.label}
              </dt>
              <dd className="text-[13px] text-(--color-text-secondary)">{f.name}</dd>
              <dd className="min-w-0 truncate font-mono text-xs text-(--color-text-muted)" title={f.example}>
                e.g. {f.example}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export default function PolicyPage() {
  return (
    <ConsolePage title="Policy" description="Decisions about what discovered identities may do.">
      <div role="note" className={cn("max-w-3xl rounded-lg border px-4 py-3", toneClasses.neutral.banner)}>
        <p className="text-sm font-medium text-(--color-text)">Preview. Nothing here is evaluated or enforced.</p>
      </div>

      <section className="max-w-3xl space-y-4 rounded-lg border border-(--color-border-subtle) bg-(--color-surface-raised) px-5 py-4">
        <h2 className="text-sm font-semibold text-(--color-text)">What Policy will hold</h2>
        <p className="text-sm leading-6 text-(--color-text-secondary)">
          Rules about which workloads may reach which resources, each checked against what Discovery found — so a rule is judged against your real
          inventory, not a description of it.
        </p>
        <nav aria-label="Related screens" className="flex flex-wrap gap-2">
          <Link to="/iga/discovery" className={LINK_CLASS}>
            Open Discovery
          </Link>
          <Link to="/iga/connections" className={LINK_CLASS}>
            Open Connections
          </Link>
        </nav>
      </section>

      <RuleFields />
    </ConsolePage>
  );
}
