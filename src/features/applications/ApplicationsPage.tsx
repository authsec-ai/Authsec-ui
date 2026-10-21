/**
 * `ApplicationsPage` — the "MCP" list: every MCP server that requires a
 * valid AuthSec token before any tool runs, split into Enforcing and Needs
 * setup.
 *
 * Status, name and URL come from the list endpoint (`ResourceServer`).
 * Identity provider, tools with a permission and agents are read per row
 * (see `ApplicationsTable`). There is no per-MCP request log, so the list
 * has no "Last request" column.
 */

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Server } from "lucide-react";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";
import { PageAbout } from "@/components/console/PageAbout";

import {
  ApplicationsTable,
  type ApplicationTableRow,
  type McpStatusFilter,
} from "./components/ApplicationsTable";
import { computeReadiness } from "./lib/computeReadiness";
import { computeNextBestAction, nextActionHref } from "./lib/computeNextBestAction";
import { mcpStatus } from "./lib/mcpSignals";
import type { Application } from "./types";

function toRow(application: Application): ApplicationTableRow {
  const readiness = computeReadiness(application);
  return {
    application,
    status: mcpStatus(application),
    setupHref: nextActionHref(application.id, computeNextBestAction(application, readiness)),
  };
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { data: applications, isLoading } = useListApplicationsQuery();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<McpStatusFilter>("all");

  const rows = useMemo(() => (applications ?? []).map(toRow), [applications]);

  const counts = useMemo(() => {
    const enforcing = rows.filter((r) => r.status.enforcing).length;
    return { all: rows.length, enforcing, setup: rows.length - enforcing };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "enforcing" && !row.status.enforcing) return false;
      if (statusFilter === "setup" && row.status.enforcing) return false;
      if (!q) return true;
      return (
        row.application.name.toLowerCase().includes(q) ||
        (row.application.resource_uri ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  const openApplication = useCallback(
    (application: Application) => navigate(`/applications/${application.id}/overview`),
    [navigate],
  );
  const finishSetup = useCallback(
    (row: ApplicationTableRow) => navigate(row.setupHref),
    [navigate],
  );

  const addMcp = (
    <Button className="text-white" onClick={() => navigate("/applications/new")}>
      <Plus className="icon-sm" /> Add MCP
    </Button>
  );

  const emptyState = isLoading ? (
    <div className="py-16 text-center text-[length:13.5px] text-(--color-text-muted)">Loading…</div>
  ) : rows.length === 0 ? (
    <div className="empty">
      <span className="empty-ic">
        <Server className="icon-lg" />
      </span>
      <h3 className="empty-title">No MCPs yet</h3>
      <p className="empty-desc">
        Add an MCP server and AuthSec walks you through installing the SDK, giving its tools a
        permission and deciding who can call them.
      </p>
      {addMcp}
    </div>
  ) : filteredRows.length === 0 ? (
    <div className="py-16 text-center text-[length:13.5px] text-(--color-text-muted)">
      No MCPs match this filter.
    </div>
  ) : undefined;

  return (
    <ConsolePage title="MCP" actions={addMcp}>
      <PageAbout>MCP servers that require a valid AuthSec token before any tool runs.</PageAbout>

      <ApplicationsTable
        rows={filteredRows}
        counts={counts}
        filter={statusFilter}
        onFilterChange={setStatusFilter}
        search={query}
        onSearchChange={setQuery}
        onOpenApplication={openApplication}
        onFinishSetup={finishSetup}
        emptyState={emptyState}
      />
    </ConsolePage>
  );
}
