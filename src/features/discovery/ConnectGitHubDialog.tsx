/**
 * Discovery → Add integration → GitHub
 *
 * GitHub is not configured here. It is configured under **Connectors**, where
 * the workspace registers its GitHub App (app id + private-key PEM → Vault) and
 * binds it to an installation on an organisation. This dialog only turns one of
 * those existing connectors into a discovery *source*.
 *
 * The split is deliberate:
 *
 *   connector = can we talk to GitHub at all
 *   source    = what are we watching
 *
 * Collapsing them is how a broken connection ends up reported as "0 agents
 * found" — which is the opposite of the truth and the most dangerous bug class
 * in a discovery product.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ExternalLink, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useListConnectorsQuery } from "@/app/api/connectorsApi";
import { useCreateSourceFromConnectorMutation } from "@/app/api/discoveryApi";

export function ConnectGitHubDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the new source id so the caller can route to its detail page. */
  onCreated: (sourceId: string) => void;
}) {
  const { data: connectors = [], isLoading } = useListConnectorsQuery(undefined, {
    skip: !open,
  });
  const [createSource, { isLoading: saving }] = useCreateSourceFromConnectorMutation();

  const [connectorId, setConnectorId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const githubConnectors = useMemo(
    () => connectors.filter((c) => c.provider_key === "github"),
    [connectors],
  );

  const selected = githubConnectors.find((c) => c.id === connectorId);

  const close = () => {
    setConnectorId("");
    setDisplayName("");
    onOpenChange(false);
  };

  const submit = async () => {
    if (!connectorId) return;
    try {
      const source = await createSource({
        connector_id: connectorId,
        display_name: displayName.trim() || selected?.name || undefined,
      }).unwrap();
      toast.success("GitHub integration added");
      onCreated(source.id);
      close();
    } catch (err) {
      const msg =
        (err as { data?: { error?: string } })?.data?.error ??
        "Could not create the integration.";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-4" />
            Add GitHub
          </DialogTitle>
          <DialogDescription>
            Discovers AI agents declared in the repositories your GitHub App can
            read — CI/CD workflows, agent manifests, MCP configuration,
            containers and infrastructure code.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading connectors…</p>
        ) : githubConnectors.length === 0 ? (
          // No GitHub connector exists. Say what is missing and where to fix it,
          // rather than offering a form that cannot succeed.
          <div className="space-y-3 rounded-md border border-dashed p-4">
            <p className="text-sm font-medium">No GitHub connector yet</p>
            <p className="text-xs text-muted-foreground">
              A GitHub App has to be registered and installed on your
              organisation before we can read anything. That happens once, under
              Connectors, and it is where you choose which repositories we are
              allowed to see.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/connectors">
                Set up GitHub
                <ExternalLink className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>GitHub connector</Label>
              <div className="space-y-1.5">
                {githubConnectors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setConnectorId(c.id)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      connectorId === c.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {String(c.config?.org_name ?? c.config?.installation_id ?? c.id)}
                      </span>
                    </span>
                    {!c.enabled && (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        Disabled
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gh-display-name">Name in discovery</Label>
              <Input
                id="gh-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={selected?.name ?? "Acme GitHub"}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Defaults to the connector name.
              </p>
            </div>

            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Nothing is scanned yet. You choose the repositories on the next
              screen, then run the first scan.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!connectorId || saving || githubConnectors.length === 0}
          >
            {saving ? "Adding…" : "Add integration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
