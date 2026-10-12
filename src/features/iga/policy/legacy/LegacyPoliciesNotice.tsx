/**
 * A small notice for the Policy Overview and Policies list (SPEC-iga-phase3-policy.md
 * §9.5): shown only when the workspace still has legacy Kubernetes agent-lifecycle
 * policies, linking to the read-only legacy view. A failed or forbidden read, or an
 * empty list, renders nothing: this is an aside, never an error on another page.
 */

import { Link } from "react-router-dom";

import { useListLegacyAgentPoliciesQuery } from "@/app/api/igaPolicySetupApi";

export function LegacyPoliciesNotice({ ws }: { ws: string }) {
  const q = useListLegacyAgentPoliciesQuery({ ws, limit: 1 });
  if ((q.data?.data.length ?? 0) === 0) return null;
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-4 py-2.5 text-[13px] text-(--color-text-muted)">
      <span className="min-w-0 flex-1 basis-72">
        This workspace still has legacy Kubernetes agent-lifecycle policies. The previous reconciler runs them; they are not part of Policy.
      </span>
      <Link to="/iga/policy/legacy" className="font-medium text-(--color-primary-text) hover:underline">
        Review legacy policies
      </Link>
    </div>
  );
}
