/**
 * Google Authentication's status panel — shown after a project is picked:
 * permission preflight running, insufficient-permission fallback (with a
 * clean path back to the existing WIF flow), or ready/provisioning. Purely
 * presentational; the wizard owns all state transitions.
 */
import { useEffect, useState } from "react";
export type GoogleOAuthProgressPhase =
  | "checking-permissions"
  | "insufficient-permissions"
  | "ready"
  | "provisioning";

export function GoogleOAuthProgress({
  phase,
  projectId,
  missingPermissions,
  onUseWifInstead,
}: {
  phase: GoogleOAuthProgressPhase;
  projectId: string;
  missingPermissions?: string[] | null;
  onUseWifInstead: () => void;
}) {
  if (phase === "checking-permissions") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Checking that this Google account can configure {projectId}…
      </p>
    );
  }

  if (phase === "insufficient-permissions") {
    return (
      <div className="space-y-2 rounded-md border-l-2 border-l-(--color-warning-text) bg-(--color-warning-soft) px-3 py-2.5 text-xs text-(--color-warning-text)">
        <p>
          <strong className="font-medium">Automatic setup isn't available for this project.</strong>{" "}
          The signed-in Google account doesn't have the IAM and Service Usage admin permissions
          needed to configure this automatically.
        </p>
        {missingPermissions && missingPermissions.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-4 font-mono text-[11px]">
            {missingPermissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="underline" onClick={onUseWifInstead}>
          Use Workload Identity Federation instead
        </button>
      </div>
    );
  }

  if (phase === "provisioning") {
    return <ProvisioningProgress projectId={projectId} />;
  }

  return (
    <p className="rounded-md border-l-2 border-l-(--color-success-text) bg-(--color-success-soft) px-3 py-2.5 text-xs text-(--color-success-text)">
      Ready to connect {projectId}. AuthSec will configure Workload Identity Federation
      automatically — no key file, no Cloud Shell.
    </p>
  );
}

export default GoogleOAuthProgress;

/**
 * Provisioning is the one step in this wizard that is genuinely slow, and it is
 * slow for a reason worth telling the customer about: after AuthSec creates the
 * reader service account and the workload identity pool, Google still has to
 * propagate the IAM binding before the federated credential can impersonate it.
 * That routinely takes ~60s and has been observed near 90s.
 *
 * The previous copy said "this can take a few seconds", so anything past about
 * ten seconds looked like a hang. Showing elapsed time and naming the stage
 * makes a long wait legible instead of alarming -- nothing here changes how long
 * it takes, only whether the customer can tell it is still working.
 */
function ProvisioningProgress({ projectId }: { projectId: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Thresholds match the backend's own sequence: the GCP writes finish in
  // roughly 20s, after which every remaining second is spent waiting on IAM.
  const message =
    elapsed < 20
      ? `Creating the reader identity and workload identity pool in ${projectId}…`
      : elapsed < 50
        ? "Waiting for Google Cloud to apply the new permissions. This usually takes under a minute."
        : "Still waiting on Google Cloud. New IAM permissions can take up to about 90 seconds to take effect — this is normal, and AuthSec is still retrying.";

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <span className="mt-0.5 size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>
        {message}
        {elapsed >= 5 ? <span className="ml-1 tabular-nums opacity-70">({elapsed}s)</span> : null}
      </span>
    </div>
  );
}
