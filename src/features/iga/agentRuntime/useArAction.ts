/** Runs one mutation: unwraps it and turns a failure into a classified one the screen can show. */

import { useCallback, useRef, useState } from "react";

import type { PolicyFailure } from "../policy/shared";
import { classifyAr } from "./model";

export function useArAction() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PolicyFailure | null>(null);
  /** The newest failure, readable straight after `run` resolves (state is not yet updated). */
  const lastFailure = useRef<PolicyFailure | null>(null);
  const run = useCallback(async <R,>(start: () => { unwrap: () => Promise<R> }): Promise<R | undefined> => {
    setPending(true);
    setFailure(null);
    lastFailure.current = null;
    try {
      return await start().unwrap();
    } catch (e) {
      const f = classifyAr(e);
      lastFailure.current = f;
      setFailure(f);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, failure, lastFailure, clear: () => setFailure(null) };
}
