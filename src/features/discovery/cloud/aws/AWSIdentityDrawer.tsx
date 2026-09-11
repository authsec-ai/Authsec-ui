/**
 * AWS identity detail — one IAM role or user, with everything the seven
 * discovery surfaces know about it.
 *
 * Distinct from AWSConnectorDrawer, which is about a CONNECTION: is the role
 * assumable, what did the last scan reach, verify/scan/revoke. This drawer is
 * about the CONTENTS of an account — one identity, its trust relationships,
 * what it may do, what runs as it, and what it has actually used. The split
 * follows the backend's own boundary between the connector endpoints and the
 * seven list endpoints.
 *
 * Shape follows AWSConnectorDrawer (RightDrawer + Tabs + the shared detail.tsx
 * blocks), widened to 640px because permission statements carry an `actions[]`
 * array that needs the room. Each tab is `skip`-gated on being the active tab,
 * so opening this costs one request rather than six.
 */

import { useEffect, useState } from "react";
import { Bot, User } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { DrawerPrevNext } from "@/components/primitives/DrawerPrevNext";
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerSection, CopyField } from "@/components/console/detail";
import type { CloudIdentity } from "@/app/api/cloudDiscoveryApi";
import { IDENTITY_KIND_LABEL } from "./awsInventoryLabels";
import {
  ComputeTab,
  KeysTab,
  OverviewTab,
  PermissionsTab,
  TrustTab,
  UsageTab,
} from "./AWSIdentityTabs";

type IdentityTab = "overview" | "permissions" | "trust" | "compute" | "usage" | "keys";

export function AWSIdentityDrawer({
  identity,
  onClose,
  onPrev,
  onNext,
  index,
  total,
}: {
  identity: CloudIdentity | null;
  onClose: () => void;
  /** Prev/next step through the table's current page without closing. Omit
   * both to hide the pager (e.g. when opened from a single-row context). */
  onPrev?: () => void;
  onNext?: () => void;
  index?: number;
  total?: number;
}) {
  const [tab, setTab] = useState<IdentityTab>("overview");

  // Reset to Overview when the subject changes. Without this, stepping from a
  // role with compute to a user without one leaves the reader on an empty
  // Compute tab wondering whether the new identity has none — the tab is
  // sticky but the answer under it is not.
  useEffect(() => {
    setTab("overview");
  }, [identity?.id]);

  const open = identity !== null;
  const showPager =
    onPrev !== undefined && onNext !== undefined && index !== undefined && total !== undefined;

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      width={640}
      ariaTitle={identity ? `AWS identity ${identity.name || identity.native_id}` : "AWS identity"}
      ariaDescription="Trust relationships, granted permissions, attributed compute, service activity and access keys for one AWS IAM identity."
    >
      {!identity ? null : (
        <>
          <DrawerHeader
            title={identity.name || identity.native_id}
            subtitle={IDENTITY_KIND_LABEL[identity.kind]}
            badge={
              identity.enabled ? (
                <StatusBadge tone="success">Enabled</StatusBadge>
              ) : (
                <StatusBadge tone="muted">Disabled</StatusBadge>
              )
            }
          />

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as IdentityTab)}
            className="flex flex-1 flex-col gap-0 overflow-hidden"
          >
            <div className="border-b px-6 pt-3">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
                <TabsTrigger value="trust">Trust</TabsTrigger>
                <TabsTrigger value="compute">Compute</TabsTrigger>
                <TabsTrigger value="usage">Activity</TabsTrigger>
                <TabsTrigger value="keys">Keys</TabsTrigger>
              </TabsList>
            </div>

            <DrawerBody>
              <TabsContent value="overview" className="space-y-6">
                <DrawerSection label="Identity">
                  <CopyField label="ARN" value={identity.native_id} />
                </DrawerSection>
                <OverviewTab identity={identity} />
              </TabsContent>

              {/* Mounted only while active — each tab is one unpaginated
                  request, and permissions in particular is one row per policy
                  statement, so firing all five on open would be the most
                  expensive thing this screen could do. */}
              <TabsContent value="permissions">
                {tab === "permissions" ? <PermissionsTab identity={identity} /> : null}
              </TabsContent>
              <TabsContent value="trust">
                {tab === "trust" ? <TrustTab identity={identity} /> : null}
              </TabsContent>
              <TabsContent value="compute">
                {tab === "compute" ? <ComputeTab identity={identity} /> : null}
              </TabsContent>
              <TabsContent value="usage">
                {tab === "usage" ? <UsageTab identity={identity} /> : null}
              </TabsContent>
              <TabsContent value="keys">
                {tab === "keys" ? <KeysTab identity={identity} /> : null}
              </TabsContent>
            </DrawerBody>
          </Tabs>

          <DrawerFooter>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {identity.kind === "iam_role" ? (
                <Bot className="size-3.5" />
              ) : (
                <User className="size-3.5" />
              )}
              Candidate identity — not classified as an agent
            </span>
            {/* Same reason as the connector drawer: an auto margin survives a
                wrapping footer, a flex-1 spacer would eat a row. */}
            <div className="ml-auto" />
            {showPager ? (
              <DrawerPrevNext
                onPrev={onPrev}
                onNext={onNext}
                hasPrev={index > 0}
                hasNext={index < total - 1}
                currentIndex={index}
                total={total}
              />
            ) : null}
          </DrawerFooter>
        </>
      )}
    </RightDrawer>
  );
}
