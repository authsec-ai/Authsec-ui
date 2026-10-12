/**
 * A person's name from their user id, for an owner, an author or an approver.
 *
 * The policy APIs name people by user id only. Workspace members come from the
 * team list; it needs a team permission, so a reader without it simply gets
 * the id's first characters, never an error. A person is "You" for the signed-in user.
 */

import { useCallback, useMemo } from "react";

import { useListMembersQuery } from "@/app/api/membershipApi";

import { currentUserId } from "./policyModel";

export function useMemberNames(ws: string): (id: string | null | undefined) => string {
  const q = useListMembersQuery({ workspaceId: ws }, { skip: !ws });
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of q.data?.items ?? []) {
      const n = x.user_name || x.user_email;
      if (n) m.set(x.user_id, n);
    }
    return m;
  }, [q.data]);
  return useCallback(
    (id) => {
      if (!id) return "";
      if (id === currentUserId()) return "You";
      return names.get(id) ?? `Member ${id.slice(0, 8)}`;
    },
    [names],
  );
}
