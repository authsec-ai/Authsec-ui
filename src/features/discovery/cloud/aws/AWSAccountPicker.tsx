/**
 * The account scope control for the AWS inventory pages.
 *
 * Honest about a real asymmetry in the API rather than papering over it:
 * `connector_id` is accepted only by `GET /aws/identities` and
 * `GET /aws/resources`. Permissions, assume-edges, workloads and usage take
 * `identity_id` only and otherwise return every row in the workspace. So this
 * picker genuinely narrows the identity inventory, and on the compute page it
 * can only narrow what the client already holds.
 *
 * `scopes` says which it is, so the caller cannot accidentally imply
 * server-side scoping the endpoint does not do.
 */

import { Server } from "lucide-react";

import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CloudConnector } from "@/app/api/cloudDiscoveryApi";
import { ALL_ACCOUNTS, accountLabel } from "./awsInventoryLabels";

export function AWSAccountPicker({
  connectors,
  value,
  onChange,
}: {
  connectors: CloudConnector[];
  /** `ALL_ACCOUNTS` or a connector id. */
  value: string;
  onChange: (next: string) => void;
}) {
  // One account is not a choice. Rendering a single-option dropdown invites
  // the reader to look for the others.
  if (connectors.length < 2) return null;

  const options = [
    { value: ALL_ACCOUNTS, label: `All accounts (${connectors.length})` },
    ...connectors.map((c) => ({
      value: c.id,
      label: accountLabel(c),
    })),
  ];

  return (
    <div className="flex items-center gap-2">
      <Server className="size-3.5 flex-none text-muted-foreground" aria-hidden />
      <SearchableSelect
        options={options}
        value={value}
        onChange={(next) => onChange(next ?? ALL_ACCOUNTS)}
        placeholder="All accounts"
        searchPlaceholder="Search accounts…"
        className="h-9 min-w-[200px]"
      />
    </div>
  );
}
