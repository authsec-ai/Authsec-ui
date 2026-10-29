/**
 * A Kubernetes policy refused because the cluster's agent may change bindings
 * of named roles only, and not this one (k8s_agent_cannot_act with a role):
 * the one command that switches the agent to every role, so no policy on that
 * cluster needs this step again.
 */

import { Copy } from "lucide-react";

import { helmEveryRoleCommand } from "@/features/iga/connections/k8sSetup";
import { copyToClipboard } from "@/lib/clipboard";

export function K8sAllowRole({ role }: { role: string }) {
  const cmd = helmEveryRoleCommand();
  return (
    <div className="mt-2 space-y-1 text-(--color-text)">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Allow {role} and every other role (a cluster admin runs this once)</span>
        <button
          type="button"
          onClick={() => void copyToClipboard(cmd, "Command")}
          className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline"
        >
          <Copy className="size-3" aria-hidden="true" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs leading-5">{cmd}</pre>
      <p className="text-xs text-(--color-text-muted)">Within a minute of the upgrade this policy, and any later one on this cluster, can be applied.</p>
    </div>
  );
}
