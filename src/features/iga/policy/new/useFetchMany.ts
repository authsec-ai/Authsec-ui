/**
 * Reads a set of things whose size is not known when hooks are written (one
 * enforcement binding per AWS account, one evidence bundle per role) without a
 * hook per item: each key is fetched once through RTK Query's imperative API,
 * so the answers share the cache with every other screen. A failed read is
 * kept as a failure, never as an empty answer.
 */

import { useEffect, useRef, useState } from "react";

import { classifyPolicyError, type PolicyFailure } from "../shared";

export type Fetched<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error"; failure: PolicyFailure };

export function useFetchMany<T>(keys: readonly string[], fetcher: (key: string) => Promise<T>): Record<string, Fetched<T>> {
  const [state, setState] = useState<Record<string, Fetched<T>>>({});
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const wanted = [...new Set(keys)].filter(Boolean).sort().join("\u0000");

  useEffect(() => {
    let cancelled = false;
    for (const k of wanted ? wanted.split("\u0000") : []) {
      setState((s) => (s[k]?.status === "ok" ? s : { ...s, [k]: { status: "loading" } }));
      fetchRef
        .current(k)
        .then((data) => !cancelled && setState((s) => ({ ...s, [k]: { status: "ok", data } })))
        .catch((e) => {
          if (cancelled) return;
          const failure = classifyPolicyError(e) ?? { kind: "failed" as const, code: "", message: "", detail: {} };
          setState((s) => ({ ...s, [k]: { status: "error", failure } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return state;
}
