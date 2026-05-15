/**
 * EffectiveAccessPage — Authz → Effective Access (Phase A).
 *
 * Takes a user UUID and lists every role binding currently affecting them —
 * direct user bindings + bindings on every group they belong to. Used by
 * admins to answer "what can this user actually do?" and by support to
 * triage denials.
 *
 * Backend: GET /uflow/v2/users/:user_id/effective-access
 */

import React, { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCard } from "@/theme/components/cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEffectiveAccessQuery } from "@/app/api/membershipApi";
import { Search } from "lucide-react";

const SubjectBadge: React.FC<{ subject: "user" | "group" | "service_account" }> = ({ subject }) => {
  switch (subject) {
    case "user":
      return <Badge variant="secondary">Direct (user)</Badge>;
    case "group":
      return <Badge variant="default">Via group</Badge>;
    case "service_account":
      return <Badge variant="outline">Service account</Badge>;
  }
};

const formatDate = (iso?: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleString();

export default function EffectiveAccessPage() {
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading, isFetching, refetch } = useEffectiveAccessQuery(
    { userId: query },
    { skip: !query },
  );

  const handleResolve = () => {
    setQuery(userId.trim());
  };

  return (
    <>
      <PageHeader
        title="Effective Access"
        description="Show every role binding affecting a user — direct + inherited via groups. Answers 'why can this user do X?' or 'why was that denied?'."
      />

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Paste a user UUID…"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleResolve();
              }}
              className="pl-8 font-mono text-sm"
            />
          </div>
          <Button onClick={handleResolve} disabled={!userId.trim()}>
            Resolve
          </Button>
          {query && (
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          )}
        </div>

        {!query ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            Paste a user UUID and press <kbd className="rounded border px-1.5 py-0.5">Enter</kbd> to compute their effective bindings.
          </div>
        ) : (
          <TableCard>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Binding ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">Resolving…</TableCell></TableRow>
                  ) : (data?.items.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12">
                        <div className="text-muted-foreground">No active role bindings affect this user.</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          This means they cannot perform any role-gated action in this tenant.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.items.map((b) => (
                      <TableRow key={b.binding_id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="font-medium">{b.role_name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{b.role_id}</div>
                        </TableCell>
                        <TableCell><SubjectBadge subject={b.subject} /></TableCell>
                        <TableCell>
                          {b.scope_type ? (
                            <div>
                              <div>{b.scope_type}</div>
                              {b.scope_id && (
                                <div className="font-mono text-xs text-muted-foreground">{b.scope_id}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Tenant-wide</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(b.expires_at)}</TableCell>
                        <TableCell className="font-mono text-xs">{b.binding_id}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </TableCard>
        )}

        {query && data && (
          <div className="text-xs text-muted-foreground">
            {data.count} effective binding{data.count === 1 ? "" : "s"} for user{" "}
            <code className="font-mono">{query}</code>.
          </div>
        )}
      </div>
    </>
  );
}
