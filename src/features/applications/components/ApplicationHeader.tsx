/**
 * `ApplicationHeader` — detail-shell object header (Console Refresh prototype):
 * title + type badge, copyable mono resource URI, readiness/risk status
 * cluster, tools-reviewed indicator, and a context-aware primary action.
 * Renders inside a `[data-cr]` region.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, CheckCircle2, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Application, Readiness, ReadinessState } from "../types";
import { isLaunched } from "../lib/computeReadiness";
import { computeNextBestAction, nextActionHref } from "../lib/computeNextBestAction";
import { DeleteApplicationDialog } from "./DeleteApplicationDialog";

export interface ApplicationHeaderProps {
  application: Pick<
    Application,
    "id" | "name" | "resource_uri" | "active" | "state" | "setup_completed_at"
  >;
  readiness?: Readiness;
  typeLabel?: string;
}

function toneClass(state: ReadinessState): string {
  if (state === "ok") return "badge--success";
  if (state === "warn") return "badge--warning";
  if (state === "err") return "badge--danger";
  return "badge--muted";
}

export function ApplicationHeader({
  application,
  readiness,
  typeLabel = "MCP",
}: ApplicationHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const launched = isLaunched(application);
  const launchTone = launched ? "badge--success" : application.state === "scan_failed" ? "badge--danger" : "badge--warning";
  const launchLabel = launched ? "Launched" : application.state === "scan_failed" ? "Scan failed" : "Not launched";
  const next = readiness ? computeNextBestAction(application as Application, readiness) : null;
  const toolsReviewed = readiness?.tools.state === "ok";

  const copyUri = () => {
    if (!application.resource_uri) return;
    navigator.clipboard?.writeText(application.resource_uri).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <>
      <header className="detail-header" data-slot="application-header">
      <div className="dh-top">
        <div className="dh-left">
          <div className="dh-titlerow">
            <h1 className="dh-title">{application.name}</h1>
            <span className="badge badge--type">{typeLabel}</span>
          </div>
          {application.resource_uri && (
            <button className={`dh-uri${copied ? " copied" : ""}`} title="Copy resource URI" onClick={copyUri}>
              <span className="uri-txt mono">{application.resource_uri}</span>
              <span className="uri-copy">{copied ? <Check className="icon-sm" /> : <Copy className="icon-sm" />}</span>
            </button>
          )}
        </div>
        <div className="dh-right">
          <div className="dh-statuses">
            <span className={`badge ${launchTone}`} onClick={() => navigate(`/applications/${application.id}/overview`)} style={{ cursor: "pointer" }}>
              <span className="bdot" />
              {launchLabel}
            </span>
            {readiness && readiness.tools.state !== "none" && !toolsReviewed && (
              <span className={`badge ${toneClass(readiness.tools.state)}`}>
                <span className="bdot" />
                {readiness.tools.status}
              </span>
            )}
          </div>
          {toolsReviewed && (
            <span className="tools-indicator">
              <span className="ti-ic">
                <CheckCircle2 className="icon-sm" />
              </span>
              Tools reviewed
            </span>
          )}
          {next && (
            <button className="btn btn-primary" onClick={() => navigate(nextActionHref(application.id, next))}>
              {next.primary} <ArrowRight className="icon-sm" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="btn btn-secondary" aria-label="Application actions">
                <MoreHorizontal className="icon-sm" /> Actions
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" data-cr className="min-w-52 p-1">
              <DropdownMenuItem
                className="menu-item danger"
                onSelect={() => setDeleteOpen(true)}
              >
                <span className="mi-ic">
                  <Trash2 className="icon-sm" />
                </span>
                Delete application
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </header>
      <DeleteApplicationDialog
        application={application}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => navigate("/applications", { replace: true })}
      />
    </>
  );
}
