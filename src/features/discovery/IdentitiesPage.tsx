/**
 * Discovery → Identities
 *
 * The discovered-identities inventory (the accounts agents authenticate as) is
 * not a shipping concept yet: `/authsec/discovery/identities` does not exist in
 * the backend. Rather than seed the page with fabricated rows — the exact failure
 * this product exists to prevent — it renders an explicit "not yet available"
 * empty state. The mock fixtures have been deleted.
 */

import { Fingerprint } from "lucide-react";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";

export default function IdentitiesPage() {
  return (
    <ConsolePage
      title="Identities"
      description="Accounts that discovered agents authenticate as, with the credential posture behind each one."
    >
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Fingerprint className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              Identity inventory is not available yet
            </h2>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">
              Discovered identities — the service accounts, IAM roles, SPIFFE IDs and OAuth
              clients your agents authenticate as — will appear here once the backend exposes
              them. Nothing is seeded in the meantime, so an empty screen means no inventory,
              not hidden data. The rest of Discovery is live today.
            </p>
          </div>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
