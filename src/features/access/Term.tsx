import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Plain-language meanings for the words the Access page uses. Shown when
 * the customer hovers (or focuses) a dotted-underlined term.
 */
export const ACCESS_TERMS = {
  permission: "Allows one kind of action on one MCP server, written as server:action.",
  scope: "A token scope: allows one kind of action on one MCP server, written as server:action.",
  role: "A named set of permissions you give out.",
  givenTo: "The people and service accounts that hold this role.",
  mcpServer: "Where the role or permission applies. Whole workspace means every MCP server in this workspace.",
  risk: "How much a caller could change or read with this permission.",
  tools: "How many tools on the MCP server this permission unlocks.",
  inRoles: "How many roles include this permission.",
  who: "The person or service account that holds the role.",
  source: "How the role was given, for example by an admin or by provisioning.",
  expires: "When this access ends on its own. Never means it stays until someone removes it.",
} as const;

/** A word with a dotted underline that explains itself on hover or focus. */
export function Term({ children, meaning }: { children: ReactNode; meaning: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-help underline decoration-dotted decoration-(--color-border-strong) underline-offset-[3px]"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs leading-5">
        {meaning}
      </TooltipContent>
    </Tooltip>
  );
}
