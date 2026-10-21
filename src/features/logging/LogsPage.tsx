/**
 * Logs — every sign-in, machine token and admin change in one searchable
 * list. The three backend log sources are loaded newest-first and merged
 * client-side; the query, time range and type pills filter what was loaded.
 * `?type=` (sign-in · machine-token · admin-change) keeps the type pill in
 * the URL so /logs/auth, /logs/m2m and /logs/audit land on the right pill.
 */

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Download, Search } from "lucide-react";

import { useGetAuditLogsQuery, useGetLogsQuery, useGetM2MLogsQuery, type PaginationMetadata } from "@/app/api/logsApi";
import { useListResourceServersQuery } from "@/app/api/resourceServersApi";
import { ConsolePage } from "@/components/console/ConsolePage";
import { PageAbout } from "@/components/console/PageAbout";
import { EntityCell } from "@/components/console/iam-console";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveWorkspaceId } from "@/utils/workspace";

import { EventTimeline } from "./components/EventTimeline";
import { LogResult } from "./components/LogTable";
import {
  KIND_LABEL,
  TIME_RANGES,
  exportCsv,
  exportJson,
  findRange,
  fromAdminChange,
  fromMachineToken,
  fromSignIn,
  isDenied,
  matchesQuery,
  parseQuery,
  type LogEvent,
  type LogKind,
} from "./components/unifiedLog";

/** Newest entries loaded from each source. */
const PAGE = 200;

const KINDS: LogKind[] = ["sign-in", "machine-token", "admin-change"];
const KIND_PLURAL: Record<LogKind, string> = {
  "sign-in": "Sign-ins",
  "machine-token": "Machine tokens",
  "admin-change": "Admin changes",
};

const QUERY_HELP =
  "Search the loaded events. Use field:value on any field of the event JSON (result, type, who, user, client, mcp, reason, action, ip, scope…), free text, NOT or -term to exclude. Terms are combined with AND; OR is not supported.";

function errorStatus(error: unknown): string | null {
  return error && typeof error === "object" && "status" in error ? String((error as { status: unknown }).status) : null;
}

function formatTime(ts: number, iso: string) {
  if (!Number.isFinite(ts)) return iso || "—";
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

/** True when the source has older entries that fall inside the range but were not loaded. */
function truncated(pagination: PaginationMetadata | undefined, events: LogEvent[], kind: LogKind, start: number) {
  if (!pagination?.has_next) return false;
  const stamps = events.filter((e) => e.kind === kind && Number.isFinite(e.ts)).map((e) => e.ts);
  if (stamps.length === 0) return false;
  return Math.min(...stamps) > start;
}

export default function LogsPage() {
  const [params, setParams] = useSearchParams();
  const workspaceId = resolveWorkspaceId() ?? "";
  const skip = !workspaceId;

  const typeParam = params.get("type");
  const activeType: LogKind | "all" = KINDS.includes(typeParam as LogKind) ? (typeParam as LogKind) : "all";
  const query = params.get("q") ?? "";
  const range = findRange(params.get("range"));

  const [draftQuery, setDraftQuery] = useState(query);
  const [draftRange, setDraftRange] = useState(range.key);
  const [end, setEnd] = useState(() => Date.now());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const auth = useGetLogsQuery({ workspace_id: workspaceId, page: 1, page_size: PAGE }, { skip });
  const m2m = useGetM2MLogsQuery({ workspace_id: workspaceId, page: 1, page_size: PAGE }, { skip });
  const audit = useGetAuditLogsQuery({ workspace_id: workspaceId, page: 1, page_size: PAGE }, { skip });
  const { data: resourceServers } = useListResourceServersQuery();

  const serverName = useMemo(() => {
    const m = new Map<string, string>();
    (resourceServers ?? []).forEach((rs) => m.set(rs.id, rs.name));
    return (id: string) => m.get(id);
  }, [resourceServers]);

  const allEvents = useMemo<LogEvent[]>(() => {
    const out = [
      ...(auth.data?.logs ?? []).map(fromSignIn),
      ...(m2m.data?.logs ?? []).map((l) => fromMachineToken(l, serverName)),
      ...(audit.data?.logs ?? []).map(fromAdminChange),
    ];
    return out.sort((a, b) => (Number.isFinite(b.ts) ? b.ts : 0) - (Number.isFinite(a.ts) ? a.ts : 0));
  }, [auth.data?.logs, m2m.data?.logs, audit.data?.logs, serverName]);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const start = end - range.ms;

  // Query + time range, before the type pill. No upper bound: an event stamped
  // after `end` (server clock ahead, or loaded by a later refetch) is still the newest.
  const inScope = useMemo(
    () => allEvents.filter((e) => Number.isFinite(e.ts) && e.ts >= start && matchesQuery(parsed, e)),
    [allEvents, start, parsed],
  );
  const counts = useMemo(() => {
    const c: Record<LogKind, number> = { "sign-in": 0, "machine-token": 0, "admin-change": 0 };
    inScope.forEach((e) => (c[e.kind] += 1));
    return c;
  }, [inScope]);
  const visible = useMemo(
    () => (activeType === "all" ? inScope : inScope.filter((e) => e.kind === activeType)),
    [inScope, activeType],
  );
  const selected = visible.find((e) => e.key === selectedKey) ?? null;

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const onSearch = (ev: FormEvent) => {
    ev.preventDefault();
    updateParams({ q: draftQuery.trim() || null, range: draftRange === "24h" ? null : draftRange });
    setEnd(Date.now());
    setSelectedKey(null);
    if (!skip) {
      void auth.refetch();
      void m2m.refetch();
      void audit.refetch();
    }
  };

  const loading = auth.isLoading || m2m.isLoading || audit.isLoading;
  const failures = (
    [
      ["sign-ins", auth],
      ["machine tokens", m2m],
      ["admin changes", audit],
    ] as const
  )
    .filter(([, q]) => q.isError)
    .map(([label, q]) => `${label}${errorStatus(q.error) ? ` (${errorStatus(q.error)})` : ""}`);

  const cut = [
    truncated(auth.data?.pagination, allEvents, "sign-in", start) ? "sign-ins" : null,
    truncated(m2m.data?.pagination, allEvents, "machine-token", start) ? "machine tokens" : null,
    truncated(audit.data?.pagination, allEvents, "admin-change", start) ? "admin changes" : null,
  ].filter(Boolean) as string[];

  const columns = useMemo<AdaptiveColumn<LogEvent>[]>(
    () => [
      {
        id: "time",
        header: "Time",
        alwaysVisible: true,
        approxWidth: 130,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums" title={row.original.time}>
            {formatTime(row.original.ts, row.original.time)}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        alwaysVisible: true,
        approxWidth: 140,
        cell: ({ row }) => <span className="whitespace-nowrap">{KIND_LABEL[row.original.kind]}</span>,
      },
      {
        id: "who",
        header: "Who",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => <EntityCell label={row.original.who} detail={row.original.whoDetail} />,
      },
      {
        id: "event",
        header: "Event",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => <span className="break-words">{row.original.event}</span>,
      },
      {
        id: "result",
        header: "Result",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => <LogResult result={row.original.result} />,
      },
    ],
    [],
  );

  const pills: Array<{ key: LogKind | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: inScope.length },
    ...KINDS.map((k) => ({ key: k, label: KIND_PLURAL[k], count: counts[k] })),
  ];

  return (
    <ConsolePage
      title="Logs"
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" disabled={visible.length === 0}>
              <Download className="size-4" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={() => exportJson(visible)}>
              JSON · {visible.length.toLocaleString()} events
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => exportCsv(visible)}>
              CSV · {visible.length.toLocaleString()} events
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <PageAbout>Every sign-in, token and tool request, searchable as JSON. Denied events include the reason.</PageAbout>

      {failures.length ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-(--color-danger-soft) px-4 py-2.5 text-[length:13px] text-(--color-danger-text)"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="m-0">Couldn't load {failures.join(", ")}. The other logs are shown.</p>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-5">
          <form onSubmit={onSearch} className="flex flex-col gap-2.5 sm:flex-row sm:items-center" role="search">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder="result:denied AND mcp:askn"
                aria-label="Search logs"
                aria-describedby="logs-query-help"
                className="h-9 pl-9 font-mono text-[length:13px]"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <Select value={draftRange} onValueChange={setDraftRange}>
              <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="text-white" disabled={skip}>
              Search
            </Button>
          </form>
          <p id="logs-query-help" className="m-0 text-[length:12.5px] text-(--color-text-muted)">
            {QUERY_HELP}
            {parsed.unsupported.length ? (
              <span className="text-(--color-warning-text)"> “OR” was ignored.</span>
            ) : null}
          </p>

          <EventTimeline events={visible} range={range} end={end} />

          {cut.length ? (
            <p className="m-0 text-[length:12.5px] text-(--color-warning-text)">
              Only the newest {PAGE} entries of each log were loaded; older {cut.join(" and ")} in this range aren't
              counted. Narrow the time range to see all of them.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent variant="flush">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-(--color-border-subtle) px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Event type">
              {pills.map((p) => {
                const active = activeType === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      updateParams({ type: p.key === "all" ? null : p.key });
                      setSelectedKey(null);
                    }}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[length:12.5px] font-semibold transition-colors",
                      active
                        ? "border-transparent bg-(--color-primary-soft) text-(--color-primary-text)"
                        : "border-(--color-border-strong) bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-surface-subtle) hover:text-(--color-text)",
                    )}
                  >
                    {p.label}
                    <span className="tabular-nums opacity-80">{p.count.toLocaleString()}</span>
                  </button>
                );
              })}
              <button
                type="button"
                disabled
                aria-describedby="logs-tool-requests-note"
                className="inline-flex h-8 cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-(--color-border-strong) px-2.5 text-[length:12.5px] font-semibold text-(--color-text-subtle)"
              >
                Tool requests
              </button>
            </div>
            <span id="logs-tool-requests-note" className="text-[length:12.5px] text-(--color-text-muted)">
              Tool requests to MCP servers aren't recorded in these logs yet.
            </span>
          </div>

          <AdaptiveTable
            tableId="logs-unified"
            data={visible}
            columns={columns}
            getRowId={(e) => e.key}
            enableSelection={false}
            enableSorting={false}
            loading={loading}
            onRowClick={(e) => setSelectedKey((k) => (k === e.key ? null : e.key))}
            rowClassName={(e) =>
              cn(
                "cursor-pointer",
                isDenied(e) && "font-semibold",
                e.key === selectedKey && "bg-(--color-primary-soft)",
              )
            }
            pagination={{ pageSize: 50, pageSizeOptions: [25, 50, 100], alwaysVisible: true }}
            emptyState={
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  {allEvents.length ? "No events match" : "No events yet"}
                </p>
                <p className="mx-auto mt-1 max-w-md text-[length:12.5px] text-muted-foreground">
                  {allEvents.length
                    ? "Nothing in the loaded logs matches this search, time range and type."
                    : "Sign-ins, machine tokens and admin changes appear here as they happen."}
                </p>
              </div>
            }
          />

          <div className="border-t border-(--color-border-subtle) px-4 py-4">
            {selected ? (
              <>
                <p className="mb-2 text-[length:13px] text-(--color-text-muted)">
                  Selected event: <span className="tabular-nums">{formatTime(selected.ts, selected.time)}</span>
                </p>
                <pre
                  aria-label="Selected event JSON"
                  className="m-0 max-h-[28rem] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-[length:13px] leading-relaxed text-zinc-100"
                >
                  {JSON.stringify(selected.raw, null, 2)}
                </pre>
              </>
            ) : (
              <p className="m-0 text-[length:13px] text-(--color-text-muted)">
                Select an event to see it as JSON{visible.some(isDenied) ? ", including why it was denied" : ""}.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
