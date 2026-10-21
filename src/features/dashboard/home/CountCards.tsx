/**
 * The four count cards across the top of Home: MCPs, Agents, Users and
 * Sign-ins today. Each links to the page that lists what it counts.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { HomeData } from "../hooks/useHomeData";

function CountCard({
  to,
  value,
  label,
  loading,
  error,
  children,
}: {
  to: string;
  value: ReactNode;
  label: string;
  loading?: boolean;
  error?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="block min-w-0 rounded-xl border border-(--color-border-subtle) bg-(--color-surface-raised) px-6 py-5 transition-colors hover:border-(--color-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-focus-ring)"
    >
      {loading ? (
        <Skeleton className="h-9 w-16" />
      ) : (
        <p className="m-0 text-[length:34px] font-bold leading-tight tracking-[-0.02em] text-(--color-text) tabular-nums">
          {error ? "—" : value}
        </p>
      )}
      <p className="mt-1 mb-0 text-[length:var(--font-size-md)] font-semibold text-(--color-text)">{label}</p>
      <p className="mt-2 mb-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
        {error ? "Couldn't load" : loading ? " " : children}
      </p>
    </Link>
  );
}

function n(v: number, atLeast?: boolean) {
  return `${v.toLocaleString()}${atLeast ? "+" : ""}`;
}

export function CountCards({ data }: { data: HomeData }) {
  const { apps, mcps, agents, usersThisWeek, signInsToday } = data;
  const s = signInsToday.data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <CountCard to="/applications" value={n(mcps.total)} label={mcps.total === 1 ? "MCP" : "MCPs"} loading={apps.isLoading} error={apps.isError}>
        Enforcing: {mcps.enforcing.toLocaleString()} · Needs setup: {mcps.needsSetup.toLocaleString()}
      </CountCard>
      <CountCard
        to="/agents"
        value={agents.data ? n(agents.data.total) : "—"}
        label={agents.data?.total === 1 ? "Agent" : "Agents"}
        loading={agents.isLoading}
        error={agents.isError}
      >
        {agents.data
          ? `Active: ${agents.data.active.toLocaleString()} · Waiting: ${agents.data.waiting.toLocaleString()}`
          : null}
      </CountCard>
      <CountCard
        to="/end-users"
        value={usersThisWeek.data ? n(usersThisWeek.data.count, usersThisWeek.data.atLeast) : "—"}
        label={usersThisWeek.data?.count === 1 ? "User" : "Users"}
        loading={usersThisWeek.isLoading}
        error={usersThisWeek.isError}
      >
        Signed in this week
      </CountCard>
      <CountCard
        to="/logs/auth"
        value={s ? n(s.count, s.atLeast) : "—"}
        label="Sign-ins today"
        loading={signInsToday.isLoading}
        error={signInsToday.isError}
      >
        {s ? (
          <span className={cn(s.failed > 0 && "font-medium text-(--color-warning-text)")}>
            Failed: {s.failed.toLocaleString()}
          </span>
        ) : null}
      </CountCard>
    </div>
  );
}
