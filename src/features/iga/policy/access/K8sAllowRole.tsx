/**
 * A Kubernetes policy refused because the cluster's agent may not change
 * bindings of the chosen role yet (k8s_agent_cannot_act with a role): the one
 * command that allows it, on top of the roles the agent already reports. The
 * agent gets `bind` on named roles only, so allowing a role is a per-role step
 * a cluster admin takes when a policy first needs it.
 */

import { Copy } from "lucide-react";

import { helmAllowRolesCommand } from "@/features/iga/connections/k8sSetup";
import { copyToClipboard } from "@/lib/clipboard";

export function K8sAllowRole({ role, allowed }: { role: string; allowed: string[] }) {
  const cmd = helmAllowRolesCommand(allowed, [role]);
  return (
    <div className="mt-2 space-y-1 text-(--color-text)">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Allow {role} (a cluster admin runs this once)</span>
        <button
          type="button"
          onClick={() => void copyToClipboard(cmd, "Command")}
          className="inline-flex items-center gap-1 text-xs text-(--color-primary-text) hover:underline"
        >
          <Copy className="size-3" aria-hidden="true" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-(--color-border-subtle) bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs leading-5">{cmd}</pre>
      <p className="text-xs text-(--color-text-muted)">Within a minute of the upgrade the agent reports the role, and this policy can be applied.</p>
    </div>
  );
}
