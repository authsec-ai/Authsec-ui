import { useMemo } from "react";

import { useListWorkspaceClientsQuery } from "@/app/api/mcpClientsApi";

/**
 * Workspace OAuth clients by id, so a sighting's matched identity is named — and
 * linked — only when it resolves. An id that does not resolve is "matched, name
 * not available", never a guess and never a dead link.
 */
export function useClientsLookup() {
  const q = useListWorkspaceClientsQuery();
  return useMemo(() => {
    const byId = new Map((q.data ?? []).map((c) => [c.id, c]));
    return {
      ready: !!q.data,
      client: (id: string) => byId.get(id),
      nameOf: (id: string) => byId.get(id)?.client_name || byId.get(id)?.client_id,
    };
  }, [q.data]);
}
