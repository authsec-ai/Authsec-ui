import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useRevokeAdminConsentGrantMutation,
  useRevokeUserConsentGrantMutation,
} from "@/app/api/consentGrantsApi";
import type { OAuthConsentGrant } from "@/app/api/types/scopeMatrix";
import { useRbacAudience } from "@/contexts/RbacAudienceContext";

interface RevokeConsentDialogProps {
  grant: OAuthConsentGrant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevokeConsentDialog({
  grant,
  open,
  onOpenChange,
}: RevokeConsentDialogProps) {
  const { isAdmin } = useRbacAudience();
  const [isRevoking, setIsRevoking] = useState(false);

  const [revokeAdmin] = useRevokeAdminConsentGrantMutation();
  const [revokeUser] = useRevokeUserConsentGrantMutation();

  if (!grant) return null;

  const clientLabel = grant.client_name || grant.client_id;
  const resourceLabel = grant.resource_name || grant.resource_server_id;

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      if (isAdmin) {
        await revokeAdmin(grant.id).unwrap();
      } else {
        await revokeUser(grant.id).unwrap();
      }
      toast.success(`Access revoked for ${clientLabel}`);
      onOpenChange(false);
    } catch {
      toast.error("Failed to revoke consent grant. Please try again.");
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCancel = () => {
    if (!isRevoking) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isRevoking) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            Revoke Consent Grant
          </DialogTitle>
          <DialogDescription className="text-left">
            This will immediately remove the application's access. It cannot be
            undone without the user re-authorizing the client.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                Client
              </span>
              <div className="font-medium text-foreground mt-0.5">{clientLabel}</div>
            </div>
            {grant.client_name && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                  Client ID
                </span>
                <div className="font-mono text-xs text-muted-foreground mt-0.5">
                  {grant.client_id}
                </div>
              </div>
            )}
            <div className="text-sm">
              <span className="text-muted-foreground text-xs uppercase tracking-wide font-medium">
                Resource Server
              </span>
              <div className="font-medium text-foreground mt-0.5">{resourceLabel}</div>
            </div>
          </div>

          {grant.granted_scopes.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Scopes that will be revoked
              </p>
              <div className="flex flex-wrap gap-1.5">
                {grant.granted_scopes.map((scope) => (
                  <Badge
                    key={scope}
                    variant="outline"
                    className="font-mono text-xs border-destructive/30 text-destructive bg-destructive/5"
                  >
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isRevoking}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={isRevoking}
          >
            {isRevoking ? "Revoking..." : "Revoke Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
