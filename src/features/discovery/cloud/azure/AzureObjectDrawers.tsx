import { useListAzureGrantsQuery, type AzureGrant, type AzureResource, type AzureWorkload, type CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { DrawerBody, DrawerFooter, DrawerHeader, DrawerSection, CopyField, DetailGrid, DetailRow } from "@/components/console/detail";
import { DrawerPrevNext } from "@/components/primitives/DrawerPrevNext";
import { RightDrawer } from "@/components/primitives/RightDrawer";

import { AttrFacts, DrawerList, RelativeDate } from "./AzureDiscoveryShared";
import { GrantLine } from "./AzureIdentityDrawer";
import { armTypeLabel, connectorLabel, identityKindLabel } from "./azureDiscoveryLabels";

interface Pager {
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  index: number;
  total: number;
}

function Footer({ onPrev, onNext, index, total }: Pager) {
  return (
    <DrawerFooter>
      <div className="ml-auto" />
      <DrawerPrevNext onPrev={onPrev} onNext={onNext} hasPrev={index > 0} hasNext={index < total - 1} currentIndex={index} total={total} />
    </DrawerFooter>
  );
}

function WhoHasAccess({ resourceId }: { resourceId: string }) {
  const q = useListAzureGrantsQuery({ resource_id: resourceId, limit: 200 });
  return (
    <DrawerList
      query={q}
      empty="No Azure role assignment is scoped to this resource directly. Role assignments at the subscription or a resource group still apply to it and are listed on each identity."
      render={(g: AzureGrant) => <GrantLine g={g} showHolder />}
    />
  );
}

export function AzureResourceDrawer({ resource, subscription, ...p }: Pager & { resource: AzureResource | null; subscription?: CloudConnector }) {
  return (
    <RightDrawer open={resource !== null} onClose={p.onClose} width={560} ariaTitle={resource ? `Azure resource ${resource.name}` : "Azure resource"}>
      {!resource ? null : (
        <>
          <DrawerHeader title={resource.name || resource.native_id} subtitle={armTypeLabel(resource.kind)} />
          <DrawerBody>
            <div className="space-y-6">
              <DrawerSection label="Resource">
                <CopyField label="Resource ID" value={resource.native_id} />
                <DetailGrid>
                  <DetailRow label="Type" value={resource.kind} mono />
                  <DetailRow label="Subscription" value={connectorLabel(subscription)} />
                  <DetailRow label="First seen by AuthSec" value={<RelativeDate iso={resource.first_seen_at} />} />
                  <DetailRow label="Last seen by AuthSec" value={<RelativeDate iso={resource.last_seen_at} />} />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="Who has access">
                <WhoHasAccess resourceId={resource.id} />
              </DrawerSection>
            </div>
          </DrawerBody>
          <Footer {...p} />
        </>
      )}
    </RightDrawer>
  );
}

export function AzureWorkloadDrawer({ workload, subscription, ...p }: Pager & { workload: AzureWorkload | null; subscription?: CloudConnector }) {
  return (
    <RightDrawer open={workload !== null} onClose={p.onClose} width={560} ariaTitle={workload ? `Azure workload ${workload.name}` : "Azure workload"}>
      {!workload ? null : (
        <>
          <DrawerHeader title={workload.name || workload.native_id} subtitle={armTypeLabel(workload.runtime_kind)} />
          <DrawerBody>
            <div className="space-y-6">
              <DrawerSection label="Workload">
                <CopyField label="Resource ID" value={workload.native_id} />
                <DetailGrid>
                  <DetailRow label="Type" value={workload.runtime_kind} mono />
                  <DetailRow label="Region" value={workload.region || "—"} />
                  <DetailRow label="Subscription" value={connectorLabel(subscription)} />
                  <DetailRow
                    label="Runs as"
                    value={workload.identity_name ? `${workload.identity_name} (${identityKindLabel(workload.identity_kind)})` : "No identity recorded"}
                  />
                  <DetailRow label="First seen by AuthSec" value={<RelativeDate iso={workload.first_seen_at} />} />
                  <DetailRow label="Last seen by AuthSec" value={<RelativeDate iso={workload.last_seen_at} />} />
                </DetailGrid>
              </DrawerSection>
              <DrawerSection label="Attributes from Microsoft">
                <AttrFacts attrs={workload.attrs} />
              </DrawerSection>
            </div>
          </DrawerBody>
          <Footer {...p} />
        </>
      )}
    </RightDrawer>
  );
}
