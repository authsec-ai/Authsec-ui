/**
 * `ClientDrawer` — one OAuth client and its registrations, one per MCP server.
 *
 * Opened by clicking a row on the Agents list (AI agents, voice agents, other
 * clients) and on the Clients tables. Everything a row menu used to offer
 * lives here: approve or deny a pending registration, revoke an approved one,
 * copy the client ID.
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Ban, Bot, Check, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useRevokeWorkspaceClientMutation,
  type WorkspaceClientItem,
} from "@/app/api/mcpClientsApi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CopyField,
  DetailGrid,
  DetailRow,
  DrawerBody,
  DrawerEmpty,
  DrawerHeader,
  DrawerSection,
} from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { cn } from "@/lib/utils";

import {
  CONNECTION_STATUS,
  KIND_LABELS,
  REGISTRATION_LABELS,
  SMALL_TEXT,
  clientStatus,
  connectionStatus,
  errorText,
  latestToken,
  relativeOrNever,
  useApproveClient,
} from "./clientStatus";

/** Revoke an approved registration, or deny a pending one, after confirming. */
function RevokeClientDialog({
  target,
  onOpenChange,
}: {
  target: WorkspaceClientItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [revoke, { isLoading }] = useRevokeWorkspaceClientMutation();
  const deny = target?.status === "pending_approval";

  const submit = async () => {
    if (!target) return;
    try {
      await revoke({ rsId: target.resource_server_id, clientId: target.client_id }).unwrap();
      toast.success(deny ? "Request denied." : "Access revoked.");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorText(err, deny ? "Couldn't deny the request." : "Couldn't revoke access."));
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{deny ? "Deny this request?" : "Revoke access?"}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{target?.client_name || target?.client_id}</span>{" "}
            {deny ? "won't be able to connect to" : "stops getting new tokens for"}{" "}
            <span className="font-medium text-foreground">{target?.resource_server_name || "this server"}</span>.
            {deny ? "" : " Tokens already issued expire at their normal lifetime."} This affects only this
            workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={isLoading}>
            <Ban className="mr-1.5 size-3.5" />
            {isLoading ? (deny ? "Denying…" : "Revoking…") : deny ? "Deny" : "Revoke access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionRow({
  c,
  onRevoke,
}: {
  c: WorkspaceClientItem;
  onRevoke: (c: WorkspaceClientItem) => void;
}) {
  const [approve, { isLoading: approving }] = useApproveClient();
  const status = connectionStatus(c);
  const s = CONNECTION_STATUS[status];
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/applications/${c.resource_server_id}/connections`}
            className="block truncate text-sm font-medium text-foreground hover:underline"
          >
            {c.resource_server_name || c.resource_server_id}
          </Link>
          <p className={cn(SMALL_TEXT, "text-muted-foreground")}>
            {status === "pending"
              ? `Requested ${relativeOrNever(c.created_at)}`
              : `Last token ${relativeOrNever(c.last_token_issued_at).toLowerCase()}`}
            {c.adopted_elsewhere
              ? status === "pending"
                ? " · from another workspace"
                : " · registered in another workspace"
              : ""}
          </p>
        </div>
        <StatusBadge tone={s.tone} className={SMALL_TEXT}>
          {s.label}
        </StatusBadge>
      </div>
      {status !== "revoked" ? (
        <div className="flex flex-wrap gap-2">
          {status === "pending" ? (
            <Button size="sm" className="text-white" onClick={() => void approve(c)} disabled={approving}>
              {approving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />}
              Approve
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onRevoke(c)}>
            <Ban className="mr-1.5 size-3.5" />
            {status === "pending" ? "Deny" : "Revoke"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ClientDrawer({
  open,
  onClose,
  name,
  clientId,
  subtitle,
  connections,
  emptyDescription,
  identityExtra,
  children,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  clientId: string;
  /** What kind of caller this is, e.g. "AI agent · acts for a signed-in person". */
  subtitle?: string;
  /** Its registrations, one per MCP server. Empty before it reaches one. */
  connections: WorkspaceClientItem[];
  emptyDescription?: string;
  /** More rows for the Identity grid. */
  identityExtra?: ReactNode;
  /** More sections after the MCP servers. */
  children?: ReactNode;
}) {
  const [revokeTarget, setRevokeTarget] = useState<WorkspaceClientItem | null>(null);
  const first = connections[0];
  const status = connections.length ? CONNECTION_STATUS[clientStatus(connections)] : CONNECTION_STATUS.waiting;

  return (
    <>
      <RightDrawer
        open={open}
        onClose={onClose}
        ariaTitle={name}
        ariaDescription="Client details and the MCP servers it can reach"
      >
        <DrawerHeader
          title={name}
          subtitle={subtitle ?? (first ? KIND_LABELS[first.client_kind] : undefined)}
          badge={
            <StatusBadge tone={status.tone} className={SMALL_TEXT}>
              {status.label}
            </StatusBadge>
          }
        />
        <DrawerBody>
          <DrawerSection label="Identity">
            <DetailGrid>
              <CopyField label="Client ID" value={clientId} />
              {first ? (
                <DetailRow
                  label="Registration"
                  value={REGISTRATION_LABELS[first.registration_type] ?? first.registration_type}
                />
              ) : null}
              {first?.software_id ? <DetailRow label="Software" value={first.software_id} /> : null}
              <DetailRow label="Last used" value={relativeOrNever(latestToken(connections))} />
              {identityExtra}
            </DetailGrid>
          </DrawerSection>

          <DrawerSection label="MCP servers">
            {connections.length === 0 ? (
              <DrawerEmpty
                icon={<Bot />}
                title="Hasn't reached a server yet"
                description={
                  emptyDescription ??
                  "Its first call to an MCP server asks for your approval on that server's Connections tab."
                }
              />
            ) : (
              <div className="space-y-2">
                {connections.map((c) => (
                  <ConnectionRow key={`${c.resource_server_id}:${c.client_id}`} c={c} onRevoke={setRevokeTarget} />
                ))}
              </div>
            )}
          </DrawerSection>

          {children}
        </DrawerBody>
      </RightDrawer>

      <RevokeClientDialog target={revokeTarget} onOpenChange={(v) => !v && setRevokeTarget(null)} />
    </>
  );
}
