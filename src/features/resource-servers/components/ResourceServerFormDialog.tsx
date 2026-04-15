import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import {
  DEFAULT_FORM,
  buildResourceServerPayload,
  computeResourceURI,
  type ResourceServerFormState,
} from "../resource-server-utils";

interface ResourceServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: ResourceServerFormState;
  onSubmit: (payload: ReturnType<typeof buildResourceServerPayload>) => Promise<void> | void;
  isSaving?: boolean;
}

export function ResourceServerFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
  isSaving = false,
}: ResourceServerFormDialogProps) {
  const [form, setForm] = useState<ResourceServerFormState>(initialValues ?? DEFAULT_FORM);

  useEffect(() => {
    if (open) {
      setForm(initialValues ?? DEFAULT_FORM);
    }
  }, [initialValues, open]);

  const handleChange = <K extends keyof ResourceServerFormState>(
    key: K,
    value: ResourceServerFormState[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    await onSubmit(buildResourceServerPayload(form));
  };

  const resourceURI = computeResourceURI(form.public_base_url, form.protected_base_path);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create Resource Server" : "Edit Resource Server"}</DialogTitle>
          <DialogDescription>
            Configure the protected MCP resource, supported scopes, and client registration modes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resource-server-name">Name</Label>
              <Input
                id="resource-server-name"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                placeholder="GitHub MCP Server"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-server-public-url">Public base URL</Label>
              <Input
                id="resource-server-public-url"
                value={form.public_base_url}
                onChange={(event) => handleChange("public_base_url", event.target.value)}
                placeholder="https://20-106-226-245.sslip.io"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resource-server-base-path">Protected base path</Label>
              <Input
                id="resource-server-base-path"
                value={form.protected_base_path}
                onChange={(event) => handleChange("protected_base_path", event.target.value)}
                placeholder="/mcp"
              />
            </div>
            <div className="space-y-2">
              <Label>Resource URI</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {resourceURI}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resource-server-scopes">Supported scopes</Label>
              <Textarea
                id="resource-server-scopes"
                rows={7}
                value={form.scopes_supported}
                onChange={(event) => handleChange("scopes_supported", event.target.value)}
                placeholder={"issues:read\nissues:write\nrepos:read"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-server-registration-modes">Registration modes</Label>
              <Textarea
                id="resource-server-registration-modes"
                rows={7}
                value={form.registration_modes}
                onChange={(event) => handleChange("registration_modes", event.target.value)}
                placeholder={"dcr\nprereg\ncimd"}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="font-medium text-foreground">Active</div>
              <div className="text-sm text-muted-foreground">
                Active resource servers can validate AuthSec tokens and accept OAuth-bound MCP traffic.
              </div>
            </div>
            <Switch checked={form.active} onCheckedChange={(checked) => handleChange("active", checked)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : mode === "create" ? "Create Resource Server" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
