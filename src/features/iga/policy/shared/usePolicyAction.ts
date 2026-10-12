/**
 * Runs one policy mutation the way every screen should: unwraps it, turns a
 * failure into a `PolicyFailure`, and on a 403 remembers which permission the
 * server refused so the controls it guards disappear (`policyAccess.ts`).
 */

import { useCallback, useState } from "react";

import { classifyPolicyError, type PolicyFailure } from "./policyErrors";
import { markPolicyDenied, type PolicyPermission } from "./policyAccess";

interface Unwrappable<R> {
  unwrap: () => Promise<R>;
}

export interface PolicyActionState {
  pending: boolean;
  failure: PolicyFailure | null;
  clear: () => void;
}

/**
 * `const { run, pending, failure } = usePolicyAction("governance:author")`;
 * `const ok = await run(() => propose({ ... }))` resolves to the result, or to
 * `undefined` after setting `failure`.
 */
export function usePolicyAction(permission?: PolicyPermission): PolicyActionState & {
  run: <R>(start: () => Unwrappable<R>) => Promise<R | undefined>;
} {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PolicyFailure | null>(null);

  const run = useCallback(
    async <R,>(start: () => Unwrappable<R>): Promise<R | undefined> => {
      setPending(true);
      setFailure(null);
      try {
        return await start().unwrap();
      } catch (e) {
        const f = classifyPolicyError(e);
        if (f?.kind === "forbidden" && permission) markPolicyDenied(permission);
        setFailure(f);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [permission],
  );

  return { run, pending, failure, clear: () => setFailure(null) };
}
