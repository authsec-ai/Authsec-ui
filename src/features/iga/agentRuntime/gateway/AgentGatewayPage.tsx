/**
 * Agent runtime gateway console (SPEC-agent-runtime-gateway.md): gateways,
 * tool policies with an evaluator, the decision log and the workspace settings.
 * Intended route: /iga/agent-runtime/gateway, tab in `?tab=` (gateways |
 * policies | decisions | settings). There is no capabilities entry for this
 * part: a 503 (or a router 404) is shown by each tab as "not available".
 *
 * Permissions (routes in agent_gateway_controller.go:70-86): every read and the
 * evaluator need governance:read; register, rename, rotate, revoke, policy
 * create/edit/delete and settings need governance:enforce plus a verified
 * workspace member session.
 */

import { useSearchParams } from "react-router-dom";

import { useBreadcrumbTail } from "@/components/layout/breadcrumbTail";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getWorkspaceId } from "@/utils/workspace";

import { DecisionsTab } from "./DecisionsTab";
import { GatewaysTab } from "./GatewaysTab";
import { PoliciesTab } from "./PoliciesTab";
import { SettingsTab } from "./SettingsTab";

const TABS = [
  ["gateways", "Gateways"],
  ["policies", "Tool policies"],
  ["decisions", "Decisions"],
  ["settings", "Settings"],
] as const;
type TabId = (typeof TABS)[number][0];

export default function AgentGatewayPage() {
  const ws = getWorkspaceId() ?? "";
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some(([id]) => id === raw) ? (raw as TabId) : "gateways";
  useBreadcrumbTail("/iga/agent-runtime/gateway", "Agent gateway");

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    setParams(next, { replace: true });
  };

  return (
    <ConsolePage title="Agent gateway" description="Decide which tools and models your agents may call, enforce it at a gateway in your environment, and review every decision.">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Agent gateway">
          {TABS.map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="gateways">
          <GatewaysTab ws={ws} />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab ws={ws} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab ws={ws} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab ws={ws} />
        </TabsContent>
      </Tabs>
    </ConsolePage>
  );
}

export { AgentGatewayPage };
