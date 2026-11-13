/** `useArAction` that also remembers a refused permission, so the controls it guards disappear (policyAccess.ts). */

import { useCallback } from "react";

import { markPolicyDenied } from "../../policy/shared";
import { useArAction } from "../useArAction";

export function useGwAction() {
  const act = useArAction();
  const run = useCallback(
    async <R,>(start: () => { unwrap: () => Promise<R> }): Promise<R | undefined> => {
      const r = await act.run(start);
      if (r === undefined && act.lastFailure.current?.kind === "forbidden") markPolicyDenied("governance:enforce");
      return r;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [act.run],
  );
  return { ...act, run };
}
