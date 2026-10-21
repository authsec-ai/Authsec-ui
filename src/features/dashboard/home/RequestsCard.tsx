/**
 * Requests AuthSec allowed or denied over the last 7 days, per day and per
 * MCP — counted from the M2M decision log (GET /authsec/logs/m2m/paginated).
 * The backend logs one decision per token request (an agent or service
 * asking for access to an MCP), not per individual tool call, so the copy
 * says "requests" and the table shows the most requested scope.
 */

import { Skeleton } from "@/components/ui/skeleton";

import type { HomeData } from "../hooks/useHomeData";
import { HomeCard, LoadError, MonoChip, TextLink } from "./parts";

const CHART_H = 160; // px, bar area

function Total({ value, label, tone }: { value: string; label: string; tone?: "success" | "danger" }) {
  const color =
    tone === "success"
      ? "text-(--color-success-text)"
      : tone === "danger"
        ? "text-(--color-danger-text)"
        : "text-(--color-text)";
  return (
    <div>
      <p className={`m-0 text-[length:28px] font-bold leading-tight tabular-nums ${color}`}>{value}</p>
      <p className="m-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">{label}</p>
    </div>
  );
}

export function RequestsCard({ data }: { data: HomeData }) {
  const { requests, mcps } = data;
  const r = requests.data;
  const max = r ? Math.max(1, ...r.days.map((d) => d.allowed + d.denied)) : 1;
  const plus = r?.partial ? "+" : "";
  const exampleWho = r?.example?.who ?? "agent";
  const exampleMcp = r?.example?.mcp ?? data.apps.data?.[0]?.name ?? "mcp";

  return (
    <HomeCard title="Requests checked by AuthSec" aside="Last 7 days">
      <p className="m-0 text-[length:var(--font-size-sm)] leading-relaxed text-(--color-text-muted)">
        A request is an agent or service asking AuthSec for access to one of your MCPs, e.g.{" "}
        <MonoChip>
          {exampleWho} → {exampleMcp}
        </MonoChip>
        . AuthSec allows or denies it before any tool runs.
      </p>

      {requests.isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : requests.isError || !r ? (
        <div className="mt-4">
          <LoadError what="the request log" onRetry={requests.refetch} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-2">
            <Total value={`${r.total.toLocaleString()}${plus}`} label="Total" />
            <Total value={`${r.allowed.toLocaleString()}${plus}`} label="Allowed" tone="success" />
            <Total value={`${r.denied.toLocaleString()}${plus}`} label="Denied" tone="danger" />
          </div>

          {r.total === 0 ? (
            <p className="mt-4 mb-0 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
              {mcps.enforcing === 0
                ? "No requests yet. Requests appear here once an MCP is enforcing and an agent calls it."
                : "No agent or service made a request in the last 7 days."}
            </p>
          ) : (
            <>
              <div
                role="img"
                aria-label={`Requests per day: ${r.days
                  .map((d) => `${d.label} ${d.allowed} allowed, ${d.denied} denied`)
                  .join("; ")}`}
                className="mt-5 grid grid-cols-7 items-end gap-3"
                style={{ height: CHART_H + 26 }}
              >
                {r.days.map((d) => {
                  const total = d.allowed + d.denied;
                  const allowedH = Math.round((d.allowed / max) * CHART_H);
                  const deniedH = Math.round((d.denied / max) * CHART_H);
                  return (
                    <div
                      key={d.key}
                      className="group flex h-full min-w-0 flex-col items-center justify-end"
                      title={`${d.label}: ${d.allowed} allowed, ${d.denied} denied`}
                    >
                      <div className="flex w-full max-w-10 flex-col items-stretch justify-end" style={{ height: CHART_H }}>
                        {d.denied > 0 ? (
                          <span
                            className="block rounded-t-[3px] bg-(--color-danger) group-hover:opacity-80"
                            style={{ height: Math.max(2, deniedH) }}
                          />
                        ) : null}
                        {d.allowed > 0 ? (
                          <span
                            className={`block bg-(--color-primary) group-hover:opacity-80 ${d.denied > 0 ? "" : "rounded-t-[3px]"}`}
                            style={{ height: Math.max(2, allowedH) }}
                          />
                        ) : null}
                        {total === 0 ? <span className="block h-px bg-(--color-border-subtle)" /> : null}
                      </div>
                      <span className="mt-2 truncate text-[length:13px] text-(--color-text-muted)">{d.label}</span>
                    </div>
                  );
                })}
              </div>
              <table className="sr-only">
                <caption>Requests per day</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Allowed</th>
                    <th scope="col">Denied</th>
                  </tr>
                </thead>
                <tbody>
                  {r.days.map((d) => (
                    <tr key={d.key}>
                      <th scope="row">{d.label}</th>
                      <td>{d.allowed}</td>
                      <td>{d.denied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-5 text-[length:var(--font-size-sm)] text-(--color-text-muted)">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-(--color-primary)" /> Allowed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm bg-(--color-danger)" /> Denied
                </span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[length:var(--font-size-sm)]">
                  <thead>
                    <tr className="bg-(--color-surface-subtle) text-(--color-text)">
                      <th scope="col" className="px-4 py-2.5 font-semibold">MCP</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Requests</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Denied</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Most requested scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border-subtle)">
                    {r.rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row" className="max-w-48 truncate px-4 py-3 font-semibold text-(--color-text)">
                          {row.name}
                        </th>
                        <td className="px-4 py-3 tabular-nums text-(--color-text)">{row.requests.toLocaleString()}</td>
                        <td
                          className={`px-4 py-3 tabular-nums ${
                            row.notSetUp && row.denied > 0
                              ? "font-semibold text-(--color-danger-text)"
                              : "text-(--color-text)"
                          }`}
                        >
                          {row.denied.toLocaleString()}
                          {row.notSetUp && row.denied > 0 ? " · not set up" : ""}
                        </td>
                        <td className="max-w-48 px-4 py-3">
                          {row.topScope ? <MonoChip>{row.topScope}</MonoChip> : <span className="text-(--color-text-muted)">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[length:13px] text-(--color-text-muted)">
                <span>
                  {r.partial
                    ? `Counted from the latest ${r.sampled.toLocaleString()} requests; earlier days may be higher.`
                    : null}
                </span>
                <TextLink to="/logs/m2m">Open request log</TextLink>
              </div>
            </>
          )}
        </>
      )}
    </HomeCard>
  );
}
