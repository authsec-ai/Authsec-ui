/**
 * Azure's Agents tab. Identities, resources and workloads are listed by the
 * shared inventory screen (AzureInventoryScreen); only the Entra Agent ID view
 * lives here. A row opens its own page (AzureObjectPage).
 */

import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";

import AzureAgentsScreen from "./AzureAgentsScreen";
import type { AzureDiscoveryType } from "./azureDiscoveryLabels";

export default function AzureDiscoveryScreen({ connectors }: { type: AzureDiscoveryType; connectors: CloudConnector[] }) {
  return <AzureAgentsScreen connectors={connectors} />;
}
