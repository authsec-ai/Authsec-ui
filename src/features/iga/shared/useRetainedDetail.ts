import { useRef } from "react";
import type { GraphFailure } from "./graphErrors";
import { graphSessionGeneration } from "./revision";

export interface RetainedDetail<T> {
  /** This object's answer: the current one, or the last one while a refresh is in flight or failed. */
  value: T | undefined;
  /**
   * The object was shown, and a read at the newer publication says it is not
   * there. `value` is then what was shown, as of the publication it came from:
   * the page renders its retired state from it (SPEC-console-revamp.md
   * *Investigation-context contract*) rather than a blank page or a raw 404.
   * Never set for an object that was not loaded first — that is "not found".
   */
  vanished: boolean;
}

/**
 * Keep this object's last answer while refreshing; never reuse another
 * object's answer. A permission or availability failure drops it (what was
 * shown may no longer be shown); a `not_found` after the object had loaded
 * keeps it, marked vanished.
 */
export function useRetainedDetail<T>(key: string, current: T | undefined, failure: GraphFailure | null): RetainedDetail<T> {
  const scopedKey = `${graphSessionGeneration()}|${key}`;
  const saved = useRef<{ key: string; data: T } | null>(null);
  if (saved.current?.key !== scopedKey) saved.current = null;
  if (failure && ["unauthorized", "forbidden", "unavailable"].includes(failure.kind)) {
    saved.current = null;
    return { value: undefined, vanished: false };
  }
  if (failure?.kind === "not_found") {
    if (!saved.current) return { value: undefined, vanished: false };
    return { value: saved.current.data, vanished: true };
  }
  if (current) saved.current = { key: scopedKey, data: current };
  return { value: current ?? saved.current?.data, vanished: false };
}
