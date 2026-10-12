/**
 * A rejected settings save. `version_conflict` here means the workspace's
 * settings changed since they were read (not a policy), so it gets its own
 * words and a Reload that re-reads them; every other refusal is the server's
 * answer, in the shared words.
 */

import { Button } from "@/components/ui/button";

import { PolicyActionError, type PolicyFailure } from "../shared";

export function SettingsFailure({ failure, onReload }: { failure: PolicyFailure | null; onReload: () => void }) {
  if (!failure) return null;
  if (failure.code !== "version_conflict") return <PolicyActionError failure={failure} />;
  return (
    <div role="alert" className="space-y-2 rounded-md border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-[13px] text-(--color-warning-text)">
      <p className="font-medium">These settings changed since you opened them.</p>
      <p>Nothing was saved. Reload to see the current values, then make your change again.</p>
      <Button size="sm" variant="outline" onClick={onReload}>
        Reload settings
      </Button>
    </div>
  );
}
