/**
 * `CreateServiceAccountPage` — /service-accounts/new. Service accounts are
 * created from the one-page Register agent form with Type = Service account;
 * this route renders that page preset to it (breadcrumb and Cancel/Done go
 * back to Service accounts).
 */

import RegisterAgentPage from "@/features/agents/RegisterAgentPage";

export default function CreateServiceAccountPage() {
  return <RegisterAgentPage presetType="service" />;
}
