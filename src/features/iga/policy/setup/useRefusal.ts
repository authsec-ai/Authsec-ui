/**
 * A read the server answered 403 means the caller's role lacks that permission:
 * remember it (as a refused mutation does) so the controls it guards go away.
 */

import { useEffect } from "react";

import { markPolicyDenied, type PolicyFailure, type PolicyPermission } from "../shared";

export function useMarkRefused(failure: PolicyFailure | null, permission: PolicyPermission): void {
  const forbidden = failure?.kind === "forbidden";
  useEffect(() => {
    if (forbidden) markPolicyDenied(permission);
  }, [forbidden, permission]);
}
