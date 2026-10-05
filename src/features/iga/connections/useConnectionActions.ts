/**
 * Connection actions (Scan now, Verify, Revoke) with the states the spec asks
 * of every one of them:
 *
 * - a submitted action shows what is happening (*Queuing…*, *Verifying…*,
 *   *Revoking…*) and a second submission on the same connection is refused
 *   before it leaves the browser;
 * - a 403 is *Your role cannot do this*, not a failure, and hides the
 *   administrative controls for the rest of the session;
 * - a 409 on a scan is said as its meaning: *A scan is already running*;
 * - a failure keeps the control and keeps the cause, with Retry;
 * - a toast is shown only after the request has resolved, and a scan says
 *   *queued* — it has not finished.
 *
 * Success refetches through the "Connections" tag every connection-changing
 * mutation invalidates; this hook does not refetch by hand.
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "react-hot-toast";

import type { Connection } from "@/app/api/connectionsApi";
import {
  useRevokeAwsConnectorMutation,
  useRevokeGcpConnectorMutation,
  useScanAwsConnectorMutation,
  useScanGcpConnectorMutation,
  useVerifyAwsConnectorMutation,
  useVerifyGcpConnectorMutation,
  type CloudOnboardingApiError,
} from "@/app/api/cloudDiscoveryApi";
import { useDeleteDiscoverySourceMutation, useScanGitHubSourceMutation } from "@/app/api/discoveryApi";
import { awsErrorCopy } from "@/features/discovery/cloud/aws/awsErrorCopy";
import { gcpErrorCopy } from "@/features/discovery/cloud/gcp/gcpErrorCopy";

import { markAdminDenied } from "./permissions";

export type ActionKind = "scan" | "verify" | "revoke";

export const PENDING_WORD: Record<ActionKind, string> = {
  scan: "Queuing…",
  verify: "Verifying…",
  revoke: "Revoking…",
};

export interface ActionFailure {
  id: string;
  name: string;
  kind: ActionKind;
  message: string;
  forbidden: boolean;
}

const FALLBACK: Record<ActionKind, string> = {
  scan: "The scan could not be queued.",
  verify: "The connection could not be verified.",
  revoke: "The connection could not be changed.",
};

interface Described {
  message: string;
  forbidden: boolean;
  /** The server says a scan is already queued or running: not a failure. */
  alreadyRunning: boolean;
}

function describe(c: Connection, kind: ActionKind, err: unknown): Described {
  const e = err as { status?: number | string; data?: unknown } | undefined;
  if (e?.status === 403) return { message: "Your role cannot do this.", forbidden: true, alreadyRunning: false };

  const data = (e?.data && typeof e.data === "object" ? e.data : undefined) as
    | (CloudOnboardingApiError & { meta?: { run_id?: string }; data?: { id?: string } })
    | undefined;

  if (kind === "scan" && e?.status === 409) {
    // AWS hands back the run in flight under meta; GitHub under data. A 409
    // without one is something else (a revoked connection, a blocked reader)
    // and says its own reason below.
    if ((c.provider === "aws" && data?.meta?.run_id) || (c.provider === "github" && data?.data?.id)) {
      return { message: "A scan is already running.", forbidden: false, alreadyRunning: true };
    }
  }

  const apiErr: CloudOnboardingApiError | undefined =
    e?.status === "TIMEOUT_ERROR" ? { error: "", timeout: true } : data && typeof data.error === "string" ? data : undefined;

  if (c.provider === "aws") {
    const copy = awsErrorCopy(apiErr, FALLBACK[kind]);
    return { message: `${copy.title}. ${copy.body}`, forbidden: false, alreadyRunning: false };
  }
  if (c.provider === "gcp") {
    const copy = gcpErrorCopy(apiErr, FALLBACK[kind]);
    return { message: `${copy.title}. ${copy.body}`, forbidden: false, alreadyRunning: false };
  }
  return { message: apiErr?.error || FALLBACK[kind], forbidden: false, alreadyRunning: false };
}

export function useConnectionActions() {
  const [scanAws] = useScanAwsConnectorMutation();
  const [verifyAws] = useVerifyAwsConnectorMutation();
  const [revokeAws] = useRevokeAwsConnectorMutation();
  const [scanGcp] = useScanGcpConnectorMutation();
  const [verifyGcp] = useVerifyGcpConnectorMutation();
  const [revokeGcp] = useRevokeGcpConnectorMutation();
  const [scanGitHub] = useScanGitHubSourceMutation();
  const [deleteSource] = useDeleteDiscoverySourceMutation();

  const [pending, setPending] = useState<Record<string, ActionKind>>({});
  const [failures, setFailures] = useState<ActionFailure[]>([]);
  // State updates are asynchronous; a second click in the same tick must still be refused.
  const inFlight = useRef(new Set<string>());

  const dismiss = useCallback((id: string, kind?: ActionKind) => {
    setFailures((f) => f.filter((x) => !(x.id === id && (kind === undefined || x.kind === kind))));
  }, []);

  /** Resolves true when the request succeeded (or a scan was already running). */
  const run = useCallback(
    async (c: Connection, kind: ActionKind): Promise<boolean> => {
      if (inFlight.current.has(c.id)) return false;
      inFlight.current.add(c.id);
      setPending((p) => ({ ...p, [c.id]: kind }));
      dismiss(c.id);
      try {
        if (kind === "scan") {
          await (c.provider === "aws" ? scanAws(c.id) : c.provider === "gcp" ? scanGcp(c.id) : scanGitHub(c.id)).unwrap();
          toast.success(`Scan of ${c.name} queued. It runs in the background.`);
        } else if (kind === "verify") {
          await (c.provider === "aws" ? verifyAws(c.id) : verifyGcp(c.id)).unwrap();
          toast.success(c.provider === "gcp" ? "Connection verified and permissions re-checked." : "Connection verified.");
        } else {
          await (c.provider === "aws" ? revokeAws(c.id) : c.provider === "gcp" ? revokeGcp(c.id) : deleteSource(c.id)).unwrap();
          toast.success(
            c.provider === "aws" || c.provider === "gcp"
              ? `${c.name} revoked. Everything already discovered is kept.`
              : `${c.name} removed.`,
          );
        }
        return true;
      } catch (err) {
        const d = describe(c, kind, err);
        if (d.forbidden) markAdminDenied();
        if (d.alreadyRunning) {
          toast(d.message);
          return true;
        }
        setFailures((f) => [...f, { id: c.id, name: c.name, kind, message: d.message, forbidden: d.forbidden }]);
        toast.error(d.message);
        return false;
      } finally {
        inFlight.current.delete(c.id);
        setPending((p) => {
          const next = { ...p };
          delete next[c.id];
          return next;
        });
      }
    },
    [dismiss, scanAws, scanGcp, scanGitHub, verifyAws, verifyGcp, revokeAws, revokeGcp, deleteSource],
  );

  return { pending, failures, run, dismiss };
}
