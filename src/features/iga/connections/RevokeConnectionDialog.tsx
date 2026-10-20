/**
 * The consequences of revoking (AWS, Google Cloud) or removing (Kubernetes,
 * GitHub) a connection, said before the button is pressed.
 *
 * Every sentence below was checked against what the backend does, and where it
 * differs from SPEC-console-revamp.md the dialog says what the backend does:
 *
 * - AWS / GCP revoke flips the connector to `revoked`, purges the credential
 *   (AWS: the stored ExternalId; GCP: the Vault key for a JSON key, nothing for
 *   federation) and touches no discovered row. No scan can run on it again, so
 *   nothing is reconfirmed — the lists say so with a "revoked" note. Rows are
 *   not made stale by the revoke itself.
 * - Kubernetes and GitHub have no revoke: the only operation is DELETE of the
 *   discovery source, which deletes the sightings it reported. AuthSec issues
 *   no per-agent token, so the agent keeps running and registers again at its
 *   next heartbeat. Graph rows written by earlier sweeps are not deleted.
 */

import type { ReactNode } from "react";

import type { Connection } from "@/app/api/connectionsApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { PENDING_WORD } from "./useConnectionActions";
import { revokeWord } from "./connectionModel";

function Copy({ c, lastGitHubOrg }: { c: Connection; lastGitHubOrg: boolean }): ReactNode {
  switch (c.provider) {
    case "aws":
      return (
        <div className="space-y-2">
          <p>
            AuthSec stops reading <strong>{c.name}</strong>. The stored ExternalId is purged, so AuthSec can no longer assume
            the role, and no scan can run on this connection.
          </p>
          <p className="text-muted-foreground">
            Everything already discovered is kept, unchanged; nothing is deleted. Those results are no longer reconfirmed,
            and Discovery notes that this account is revoked.
          </p>
          <p className="text-muted-foreground">
            The IAM role stays in your AWS account until you delete the CloudFormation stack there. Connecting the same
            account again reactivates this connection rather than creating a duplicate.
          </p>
        </div>
      );
    case "gcp":
      return (
        <div className="space-y-2">
          <p>
            AuthSec stops reading <strong>{c.name}</strong>, and nothing here will read from it again.
          </p>
          <p className="text-muted-foreground">
            <strong>AuthSec deletes nothing in your Google Cloud.</strong> The <code>authsec-reader</code> service account,
            the workload identity pool and its provider all remain in your project. Removing them there is the step that
            actually ends AuthSec&apos;s access.
          </p>
          <p className="text-muted-foreground">
            Everything already discovered is kept, unchanged, and is no longer reconfirmed. Connecting the same scope again
            reactivates this connection rather than creating a duplicate.
          </p>
        </div>
      );
    case "k8s":
      return (
        <div className="space-y-2">
          <p>
            This removes <strong>{c.name}</strong> and the sightings it reported from the inventory.
          </p>
          <p className="text-muted-foreground">
            It does not stop the agent. AuthSec issues no token to it, so the agent keeps running in your cluster and
            registers again at its next heartbeat unless you uninstall it there. Workloads and identities that earlier sweeps
            wrote to Discovery are not deleted by this.
          </p>
        </div>
      );
    default:
      return (
        <div className="space-y-2">
          <p>
            Repository scans stop, and <strong>{c.name}</strong> and the sightings it found are removed from the inventory.
            Sightings from another connection are not affected.
          </p>
          {lastGitHubOrg ? (
            <p className="text-muted-foreground">
              This is your last GitHub organisation, so the workspace&rsquo;s GitHub App registration and its private key are
              removed too. Connecting GitHub again means setting the App up once more.
            </p>
          ) : null}
          <p className="text-muted-foreground">
            The App is not deleted from GitHub. Remove it in your GitHub organisation settings if you want it gone there too.
          </p>
        </div>
      );
  }
}

export function RevokeConnectionDialog({
  connection,
  open,
  pending,
  lastGitHubOrg,
  error,
  onCancel,
  onConfirm,
}: {
  connection: Connection | null;
  open: boolean;
  pending: boolean;
  lastGitHubOrg: boolean;
  /** Why the last attempt failed. The dialog stays open on it, with Try again. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const word = connection ? revokeWord(connection) : { verb: "Revoke", noun: "revoke" };
  const title = !connection
    ? "Revoke this connection?"
    : connection.provider === "aws"
      ? "Revoke this AWS connection?"
      : connection.provider === "gcp"
        ? "Revoke this Google Cloud connection?"
        : connection.provider === "k8s"
          ? "Remove this cluster connection?"
          : "Remove this GitHub organisation?";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{connection ? <Copy c={connection} lastGitHubOrg={lastGitHubOrg} /> : null}</div>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-md bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending} className="text-white">
            {pending ? PENDING_WORD.revoke : error ? "Try again" : word.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
