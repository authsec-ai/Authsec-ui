/** Plain helpers shared by the Agents & services create flows. */

/** "mcp:support-viewer" → "Support Viewer". */
export const roleLabel = (name: string) => {
  const raw = name.includes(":") ? name.split(":").pop() || name : name;
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
};

/** Pull a readable message out of an RTK Query error. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { error?: string; message?: string } };
  return e?.data?.error ?? e?.data?.message ?? fallback;
}
