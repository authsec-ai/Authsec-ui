import { useRef } from "react";
import type { GraphFailure } from "./graphErrors";
import { graphSessionGeneration } from "./revision";

/** Keep this object's last answer while refreshing; never reuse another object's answer. */
export function useRetainedDetail<T>(key: string, current: T | undefined, failure: GraphFailure | null): T | undefined {
  const scopedKey = `${graphSessionGeneration()}|${key}`;
  const saved = useRef<{ key: string; data: T } | null>(null);
  if (saved.current?.key !== scopedKey) saved.current = null;
  if (failure && ["unauthorized", "forbidden", "not_found", "unavailable"].includes(failure.kind)) {
    saved.current = null;
    return undefined;
  }
  if (current) saved.current = { key: scopedKey, data: current };
  return current ?? saved.current?.data;
}
