/**
 * `ApplicationHeader` — the MCP page header: "MCP / <name>" breadcrumb, the
 * name as the page heading, meta chips (status, identity provider, copyable
 * URL) and one primary action.
 *
 * The action is "+ Register agent" (→ /agents/new?mcp=<id>) once the MCP is
 * enforcing; before that it is "Finish setup" (the next setup step from
 * `computeNextBestAction`), because an agent can't use an MCP that isn't
 * checking tokens yet. Renders inside a `[data-cr]` region.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Copy, Plus } from "lucide-react";

import { PageCrumbs } from "@/components/console/ConsolePage";
import type { Application, Readiness } from "../types";
import { computeNextBestAction, nextActionHref } from "../lib/computeNextBestAction";
import {
  mcpStatus,
  mcpStatusBadgeClass,
  useMcpIdentityProviderLabel,
} from "../lib/mcpSignals";

export interface ApplicationHeaderProps {
  application: Pick<
    Application,
    "id" | "name" | "resource_uri" | "active" | "state" | "setup_completed_at"
  >;
  readiness?: Readiness;
}

const CHIP =
  "inline-flex h-6 max-w-full items-center rounded-md border border-(--color-border-subtle) bg-(--color-surface-raised) px-2.5 text-[length:12.5px] font-semibold text-(--color-text)";

export function ApplicationHeader({ application, readiness }: ApplicationHeaderProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const status = mcpStatus(application);
  const idp = useMcpIdentityProviderLabel(application.id);
  const protectionFailing = readiness?.protection.state === "err";
  const next = readiness && !status.enforcing ? computeNextBestAction(application, readiness) : null;

  const copyUri = () => {
    if (!application.resource_uri) return;
    navigator.clipboard?.writeText(application.resource_uri).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4 pb-2"
      data-slot="application-header"
    >
      <div className="min-w-0">
        <PageCrumbs crumbs={[{ label: "MCP", to: "/applications" }, { label: application.name }]} />
        <h1 className="sh-title" style={{ overflowWrap: "anywhere" }}>
          {application.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={mcpStatusBadgeClass(status)}>
            <span className="bdot" />
            {status.label}
          </span>
          {status.enforcing && protectionFailing ? (
            <span className="badge badge--danger" title={readiness?.protection.detail}>
              <span className="bdot" />
              Last protection check failed
            </span>
          ) : null}
          {idp.label ? (
            <span className={CHIP} title={idp.title}>
              Identity provider: {idp.label}
            </span>
          ) : null}
          {application.resource_uri ? (
            <button
              type="button"
              className={`${CHIP} gap-1.5 font-mono hover:bg-(--color-hover)`}
              title={copied ? "Copied" : "Copy MCP URL"}
              onClick={copyUri}
            >
              <span className="truncate">{application.resource_uri.replace(/^https?:\/\//, "")}</span>
              {copied ? (
                <Check className="size-3.5 text-(--color-success-text)" />
              ) : (
                <Copy className="size-3.5 text-(--color-text-muted)" />
              )}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-6">
        {status.enforcing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              navigate(`/agents/new?mcp=${encodeURIComponent(application.id)}`)
            }
          >
            <Plus className="icon-sm" /> Register agent
          </button>
        ) : next ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(nextActionHref(application.id, next))}
          >
            Finish setup
          </button>
        ) : null}
      </div>
    </header>
  );
}
