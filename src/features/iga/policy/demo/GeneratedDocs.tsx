/**
 * What a policy would produce, three ways: in plain sentences, as the role
 * policy for the agent's identity, and as the statements for the bucket. The
 * documents are shown, not applied: nothing is deployed to AWS.
 */

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import type { PolicyDemoGenerated } from "@/app/api/policyDemoApi";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

type Tab = "words" | "role" | "bucket";

function Json({ value, label }: { value: unknown; label: string }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <div className="absolute right-1.5 top-1.5">
        <CopyButton text={text} label={label} />
      </div>
      <pre className="max-h-[360px] overflow-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) p-3 pr-10 font-mono text-[12px] leading-5 text-(--color-text)">
        {text}
      </pre>
    </div>
  );
}

export function GeneratedDocs({ docs, busy }: { docs: PolicyDemoGenerated | undefined; busy?: boolean }) {
  const [tab, setTab] = useState<Tab>("words");
  const tabs: { key: Tab; label: string }[] = [
    { key: "words", label: "In plain words" },
    { key: "role", label: "Agent role policy" },
    { key: "bucket", label: "Bucket policy" },
  ];

  return (
    <div className="space-y-3" aria-busy={busy}>
      <div role="tablist" aria-label="What AWS would see" className="flex gap-1 border-b border-(--color-border-subtle)">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
              tab === t.key
                ? "border-(--color-primary) text-(--color-primary-text)"
                : "border-transparent text-(--color-text-muted) hover:text-(--color-text)",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!docs ? (
        <p role="status" className="py-6 text-center text-sm text-(--color-text-muted)">
          {busy ? "Working it out…" : "Fill in the policy and AWS's view of it appears here."}
        </p>
      ) : tab === "words" ? (
        <div className="space-y-3">
          <ul className="space-y-2 text-[13px] leading-relaxed text-(--color-text)">
            {docs.summary.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-(--color-primary)" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          {docs.warnings.length > 0 ? (
            <div className="space-y-1.5 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2">
              {docs.warnings.map((w) => (
                <p key={w} className="flex gap-2 text-xs text-(--color-warning-text)">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : tab === "role" ? (
        <div className="space-y-2">
          <p className="text-xs text-(--color-text-muted)">
            Attached to <span className="font-medium text-(--color-text)">{docs.attach_to}</span>. Each statement is limited to the time window by the
            aws:CurrentTime conditions, so AWS stops honouring it by itself.
          </p>
          <Json value={docs.role_policy} label="Role policy" />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-(--color-text-muted)">Statements to add to the bucket&apos;s policy.</p>
          {docs.bucket_policy_statements.length === 0 ? (
            <p className="rounded-md border border-(--color-border-subtle) px-3 py-4 text-center text-sm text-(--color-text-muted)">
              This policy adds nothing to the bucket.
            </p>
          ) : (
            <Json value={{ Version: "2012-10-17", Statement: docs.bucket_policy_statements }} label="Bucket policy" />
          )}
        </div>
      )}
    </div>
  );
}
