/**
 * Home, first sign-in — shown until the workspace has at least one MCP,
 * agent or identity provider. Three ways to start, then the developer
 * details (issuer URL, workspace ID, SDK docs).
 */

import type { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Server, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConsolePage } from "@/components/console/ConsolePage";
import { cn } from "@/lib/utils";

import { DeveloperDetails } from "./parts";

interface Start {
  step: number;
  title: string;
  body: string;
  action: string;
  to: string;
  primary?: boolean;
  icon: ComponentType<{ className?: string }>;
  /** Icon tile colour, from the theme tokens. */
  tile: string;
}

const STARTS: Start[] = [
  {
    step: 1,
    title: "Connect your users",
    body: "Link Okta, Microsoft Entra ID, Google Workspace or Active Directory, or create a new identity provider.",
    action: "Connect identity provider",
    to: "/identity-providers/new?returnTo=/dashboard",
    primary: true,
    icon: Users,
    tile: "bg-(--color-accent-iga)",
  },
  {
    step: 2,
    title: "Add an MCP",
    body: "Require a valid token on every tool request.",
    action: "Add MCP",
    to: "/applications/new",
    icon: Server,
    tile: "bg-(--color-primary)",
  },
  {
    step: 2,
    title: "Register an agent",
    body: "Give an AI agent, voice agent or service account access to your MCPs.",
    action: "Register agent",
    to: "/agents/new",
    icon: Bot,
    tile: "bg-(--color-success-text)",
  },
];

function StartCard({ start }: { start: Start }) {
  const navigate = useNavigate();
  const Icon = start.icon;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-(--color-surface-raised) p-6",
        start.primary
          ? "border-2 border-(--color-primary)"
          : "border border-(--color-border-subtle)",
      )}
    >
      <span
        aria-hidden
        className={cn("inline-flex size-11 items-center justify-center rounded-xl text-white", start.tile)}
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-5 mb-0 text-[length:13px] font-semibold tracking-[0.04em] text-(--color-text)">
        STEP {start.step}
      </p>
      <h2 className="m-0 text-[length:var(--font-size-xl)] font-semibold text-(--color-text)">{start.title}</h2>
      <p className="mt-2 mb-5 flex-1 text-[length:15px] leading-relaxed text-(--color-text-muted)">{start.body}</p>
      <Button
        variant={start.primary ? "default" : "outline"}
        size="lg"
        className={cn("w-full", start.primary && "text-white")}
        onClick={() => navigate(start.to)}
      >
        {start.action}
      </Button>
    </li>
  );
}

export function Welcome({ issuerUrl, workspaceId }: { issuerUrl: string; workspaceId: string }) {
  return (
    <ConsolePage title="Welcome to AuthSec" description="What would you like to set up first?">
      <ol aria-label="Ways to start" className="m-0 grid list-none gap-5 p-0 md:grid-cols-3">
        {STARTS.map((s) => (
          <StartCard key={s.title} start={s} />
        ))}
      </ol>
      <DeveloperDetails issuerUrl={issuerUrl} workspaceId={workspaceId} />
    </ConsolePage>
  );
}
