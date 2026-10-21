/**
 * A service account's detail drawer and everything you can do to it: edit,
 * rotate its client secret, delete. Opened by a row click on the Service
 * accounts page and on the Agents list (there are no row menus).
 */

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ClipboardCopy, KeyRound, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";

import {
  useUpdateWorkspaceServiceAccountMutation,
  useDeleteWorkspaceServiceAccountMutation,
  useRotateWorkloadCredentialMutation,
  useListServiceAccountAccessQuery,
  type WorkspaceServiceAccount,
} from "@/app/api/agentIdentityApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DrawerHeader,
  DrawerBody,
  DrawerSection,
  DetailGrid,
  DetailRow,
  CopyField,
  DrawerEmpty,
  DrawerFooter,
} from "@/components/console/detail";
import { StatusBadge } from "@/components/console/status";
import { RightDrawer } from "@/components/primitives/RightDrawer";
import { formatRoleName } from "@/utils/roleName";

import { AUTH_METHOD_LABEL, SA_STATUS, authMethodOf, saStatusOf } from "./serviceAccountStatus";

const SMALL_TEXT = "text-[length:var(--font-size-body-xs)]";

/** "MCP access" — GET /authsec/uflow/admin/service-accounts/:id/access (cached; the drawer reuses it). */
export function ServiceAccountReach({ saId }: { saId: string }) {
  const { data, isLoading, isError } = useListServiceAccountAccessQuery(saId);
  if (isLoading) return <span className="text-sm text-muted-foreground">…</span>;
  if (isError) return <span className="text-sm text-muted-foreground">–</span>;
  const names = Array.from(new Set((data?.items ?? []).map((i) => i.resource_server_name)));
  return names.length ? (
    <span className="text-sm text-foreground">{names.join(", ")}</span>
  ) : (
    <span className="text-sm text-muted-foreground">None</span>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ServiceAccountDrawer({
  sa,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  sa: WorkspaceServiceAccount | null;
  open: boolean;
  onClose: () => void;
  onEdit: (sa: WorkspaceServiceAccount) => void;
  onDelete: (sa: WorkspaceServiceAccount) => void;
}) {
  const { data: accessData, isLoading: accessLoading } = useListServiceAccountAccessQuery(
    sa?.id ?? "",
    { skip: !sa },
  );

  if (!sa) return null;
  const method = authMethodOf(sa);
  const status = SA_STATUS[saStatusOf(sa)];

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      ariaTitle={sa.name}
      ariaDescription="Service account details and access grants"
    >
      <DrawerHeader
        title={sa.name}
        subtitle={sa.description || `Service account · ${AUTH_METHOD_LABEL[method]}`}
        badge={
          <StatusBadge tone={status.tone} className={SMALL_TEXT}>
            {status.label}
          </StatusBadge>
        }
      />

      <DrawerBody>
        <DrawerSection label="Identity">
          <DetailGrid>
            {sa.oauth_client_id && <CopyField label="Client ID" value={sa.oauth_client_id} />}
            {sa.spiffe_id && <CopyField label="SPIFFE ID" value={sa.spiffe_id} />}
            {sa.owner_email && <DetailRow label="Owner" value={sa.owner_email} full />}
            {sa.owner_team && <DetailRow label="Team" value={sa.owner_team} full />}
            <DetailRow
              label="Created"
              value={formatDistanceToNow(new Date(sa.created_at), { addSuffix: true })}
            />
            <DetailRow
              label="Last seen"
              value={
                sa.last_seen_at
                  ? formatDistanceToNow(new Date(sa.last_seen_at), { addSuffix: true })
                  : "never"
              }
            />
          </DetailGrid>
        </DrawerSection>

        <DrawerSection label="Access grants">
          {accessLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !accessData?.items.length ? (
            <DrawerEmpty
              icon={<KeyRound />}
              title="No access grants yet"
              description="Grant this service account access from an MCP server's Access tab."
            />
          ) : (
            <div className="space-y-2">
              {accessData.items.map((item) => {
                const fmt = formatRoleName(item.role_name);
                return (
                <div
                  key={`${item.resource_server_id}:${item.role_id}`}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{item.resource_server_name}</p>
                    <Badge variant="secondary" className={`shrink-0 capitalize ${SMALL_TEXT}`}>{fmt.badge || fmt.primary}</Badge>
                  </div>
                  {item.effective_scopes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.effective_scopes.map((s) => (
                        <span
                          key={s}
                          className={`rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground ${SMALL_TEXT}`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </DrawerSection>
      </DrawerBody>

      <DrawerFooter>
        <Button variant="outline" className="flex-1" onClick={() => onEdit(sa)}>
          <Pencil className="mr-1.5 size-3.5" /> Edit
        </Button>
        {method === "credential" && <RotateSecretButton sa={sa} />}
        <Button
          variant="outline"
          className="text-(--color-danger-text)"
          onClick={() => onDelete(sa)}
        >
          <Trash2 className="mr-1.5 size-3.5" /> Delete
        </Button>
      </DrawerFooter>
    </RightDrawer>
  );
}

// ── Rotate secret ───────────────────────────────────────────────────────────

function RotateSecretButton({ sa }: { sa: WorkspaceServiceAccount }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<{ client_id: string; client_secret: string } | null>(
    null,
  );
  const [rotate, { isLoading }] = useRotateWorkloadCredentialMutation();

  const copy = (val: string) => {
    void navigator.clipboard.writeText(val);
    toast.success("Copied");
  };

  const submit = async () => {
    try {
      const res = await rotate({ saId: sa.id }).unwrap();
      if (res.client_secret) {
        setNewSecret({ client_id: res.client_id, client_secret: res.client_secret });
      }
      setConfirmOpen(false);
      toast.success("Secret rotated. The previous secret no longer works.");
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't rotate the secret.");
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setConfirmOpen(true)}>
        <RotateCcw className="mr-1.5 size-3.5" /> Rotate secret
      </Button>

      {/* Confirm */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate client secret?</DialogTitle>
            <DialogDescription>
              A new secret is generated and the current one stops working immediately. The{" "}
              <span className="font-medium">client ID stays the same</span>, so existing access
              grants keep working — you only need to update the secret wherever this account
              authenticates. The new secret is shown once.
            </DialogDescription>
          </DialogHeader>
          <div className={`rounded-md bg-muted px-3 py-2 font-mono break-all ${SMALL_TEXT}`}>{sa.name}</div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={isLoading} className="text-white">
              <RotateCcw className="mr-1.5 size-3.5" />
              {isLoading ? "Rotating…" : "Rotate secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show new secret once */}
      <Dialog open={!!newSecret} onOpenChange={(v) => !v && setNewSecret(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New client secret</DialogTitle>
            <DialogDescription>
              Copy it now — it won't be shown again. The previous secret is already revoked.
            </DialogDescription>
          </DialogHeader>
          {newSecret && (
            <div className="space-y-3 py-1">
              {(
                [
                  ["CLIENT_ID", newSecret.client_id],
                  ["CLIENT_SECRET", newSecret.client_secret],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="space-y-1">
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 rounded-md bg-muted px-3 py-2 font-mono break-all ${SMALL_TEXT}`}>
                      {val}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(val)}>
                      <ClipboardCopy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)} className="text-white">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

function EditServiceAccountDialog({
  sa,
  open,
  onOpenChange,
  onSaved,
}: {
  sa: WorkspaceServiceAccount | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [update, { isLoading }] = useUpdateWorkspaceServiceAccountMutation();

  // Sync form when the target changes.
  useEffect(() => {
    if (sa) {
      setName(sa.name);
      setDescription(sa.description ?? "");
    }
  }, [sa]);

  const submit = async () => {
    if (!sa) return;
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      await update({ saId: sa.id, name: name.trim(), description: description.trim() }).unwrap();
      toast.success("Service account updated.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't update service account.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit service account</DialogTitle>
          <DialogDescription>Rename or re-describe this service account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-sa-name">Name</Label>
            <Input id="edit-sa-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-sa-desc">Description</Label>
            <Input
              id="edit-sa-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="h-9"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!name.trim() || isLoading} className="text-white">
              {isLoading ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirm ──────────────────────────────────────────────────────────────

function DeleteServiceAccountDialog({
  sa,
  open,
  onOpenChange,
  onDeleted,
}: {
  sa: WorkspaceServiceAccount | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted: () => void;
}) {
  const [remove, { isLoading }] = useDeleteWorkspaceServiceAccountMutation();

  const submit = async () => {
    if (!sa) return;
    try {
      await remove(sa.id).unwrap();
      toast.success("Service account deleted.");
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      toast.error(apiErr?.data?.error ?? "Couldn't delete service account.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete service account?</DialogTitle>
          <DialogDescription>
            This permanently removes the service account and its credentials. Any server-to-server
            call using it will stop working. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {sa && (
          <div className={`rounded-md bg-muted px-3 py-2 font-mono break-all ${SMALL_TEXT}`}>{sa.name}</div>
        )}
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={isLoading}>
            <Trash2 className="mr-1.5 size-3.5" />
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Drawer + dialogs, one mount ─────────────────────────────────────────────

/**
 * Mount once per page. `sa` opens the drawer; `onChanged` refetches the list
 * (these endpoints carry no RTK tags).
 */
export function ServiceAccountDetail({
  sa,
  onClose,
  onChanged,
}: {
  sa: WorkspaceServiceAccount | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editSA, setEditSA] = useState<WorkspaceServiceAccount | null>(null);
  const [deleteSA, setDeleteSA] = useState<WorkspaceServiceAccount | null>(null);

  return (
    <>
      <ServiceAccountDrawer
        sa={sa}
        open={!!sa}
        onClose={onClose}
        onEdit={(target) => {
          onClose();
          setEditSA(target);
        }}
        onDelete={(target) => {
          onClose();
          setDeleteSA(target);
        }}
      />

      <EditServiceAccountDialog
        sa={editSA}
        open={!!editSA}
        onOpenChange={(v) => !v && setEditSA(null)}
        onSaved={onChanged}
      />

      <DeleteServiceAccountDialog
        sa={deleteSA}
        open={!!deleteSA}
        onOpenChange={(v) => !v && setDeleteSA(null)}
        onDeleted={onChanged}
      />
    </>
  );
}
