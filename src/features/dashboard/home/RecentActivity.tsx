/**
 * "Recent activity": the newest sign-ins, token requests and admin changes,
 * merged from the auth, M2M and audit logs. Time · Who · Event · Result.
 */

import { format, isToday } from "date-fns";

import { Skeleton } from "@/components/ui/skeleton";

import type { HomeData } from "../hooks/useHomeData";
import { HomeCard, ResultPill, TextLink } from "./parts";

function when(at: number) {
  return isToday(at) ? format(at, "HH:mm") : format(at, "MMM d, HH:mm");
}

export function RecentActivity({ recent }: { recent: HomeData["recent"] }) {
  const { rows, isLoading, failed } = recent;
  return (
    <HomeCard title="Recent activity" aside={<TextLink to="/logs">All logs</TextLink>} bodyClassName="px-0 pb-0">
      {isLoading ? (
        <div className="space-y-3 border-t border-(--color-border-subtle) px-5 py-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 border-t border-(--color-border-subtle) px-5 py-6 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
          {failed.length === 3 ? (
            <>
              Couldn't load the logs.{" "}
              <button
                type="button"
                onClick={recent.refetch}
                className="font-medium text-(--color-primary-text) underline underline-offset-2"
              >
                Try again
              </button>
            </>
          ) : (
            "No activity yet. Sign-ins, token requests and admin changes appear here."
          )}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[length:var(--font-size-sm)]">
            <thead>
              <tr className="border-t border-(--color-border-subtle) bg-(--color-surface-subtle) text-(--color-text)">
                <th scope="col" className="w-28 px-5 py-2.5 font-semibold">Time</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Who</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Event</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border-subtle)">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-5 py-3.5 tabular-nums text-(--color-text)">{when(row.at)}</td>
                  <td className="max-w-64 truncate px-5 py-3.5 text-(--color-text)" title={row.who}>
                    {row.who}
                  </td>
                  <td className="max-w-80 truncate px-5 py-3.5 text-(--color-text)" title={row.event}>
                    {row.event}
                  </td>
                  <td className="max-w-64 px-5 py-3.5">
                    <ResultPill ok={row.ok}>{row.result}</ResultPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {failed.length > 0 && failed.length < 3 ? (
        <p className="m-0 border-t border-(--color-border-subtle) px-5 py-3 text-[length:13px] text-(--color-text-muted)">
          Couldn't load {failed.join(", ")}, so this list may be incomplete.
        </p>
      ) : null}
    </HomeCard>
  );
}
