/**
 * Add integration dialog — PROTOTYPE.
 *
 * Collects a `discovery_sources` row per the team's doc (§9.3):
 *   kind · display_name · config (jsonb) · enabled
 *
 * `id`, `workspace_id`, `created_by`, `created_at`, `updated_at` come from the
 * server. `last_sync_at` / `last_status` / `last_error` are written by the
 * connector, never by this form.
 *
 * The doc's first comment on the table is "Config never holds raw secrets — a
 * Vault reference, resolved at connector runtime", so the credential field here
 * takes a Vault path and nothing else.
 *
 * There is no backend: `onCreated` hands the row to the page, which keeps it in
 * local state. A reload clears it.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOURCE_CADENCE,
  SOURCE_LABELS,
  useCreateDiscoverySourceMutation,
  type DiscoverySourceKind,
} from "@/app/api/discoveryApi";

// `repo_scan` is deliberately absent: GitHub is added through
// ConnectGitHubDialog, which builds a source from an existing GitHub App
// connector. Offering it here would ask for a Vault path the GitHub flow does
// not use, and produce a source that can never scan.
const KINDS: DiscoverySourceKind[] = [
  "k8s_webhook",
  "aws",
  "azure",
  "gcp",
  "vm_sensor",
];

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  /** Comma-separated input stored as a string[] in config. */
  list?: boolean;
  hint?: string;
}

/** Config shape per channel, matching the fixtures and the doc's connector table. */
const CONFIG_FIELDS: Record<DiscoverySourceKind, ConfigField[]> = {
  k8s_webhook: [
    { key: "cluster", label: "Cluster", placeholder: "prod-eks-us-east" },
    {
      key: "namespaces",
      label: "Namespaces",
      placeholder: "default, ml, agents",
      list: true,
      hint: "Leave empty to watch all namespaces.",
    },
  ],
  aws: [
    { key: "account_id", label: "Account ID", placeholder: "123456789012" },
    { key: "regions", label: "Regions", placeholder: "us-east-1, eu-west-1", list: true },
  ],
  azure: [{ key: "subscription_id", label: "Subscription ID", placeholder: "8f1c…a204" }],
  gcp: [{ key: "project_id", label: "Project ID", placeholder: "acme-vertex-prod" }],
  vm_sensor: [{ key: "fleet", label: "Fleet tag", placeholder: "agent-shield-prod" }],
  repo_scan: [{ key: "org", label: "Organisation", placeholder: "acme" }],
};

const VAULT_PLACEHOLDER: Record<DiscoverySourceKind, string> = {
  k8s_webhook: "kv/discovery/k8s/prod-eks-us-east",
  aws: "kv/discovery/aws/123456789012",
  azure: "kv/discovery/azure/acme-ai-sub",
  gcp: "kv/discovery/gcp/acme-vertex-prod",
  vm_sensor: "kv/discovery/vm/agent-shield",
  repo_scan: "kv/discovery/github/acme",
};

export function AddIntegrationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [createSource, { isLoading: saving }] = useCreateDiscoverySourceMutation();
  const [kind, setKind] = useState<DiscoverySourceKind>("k8s_webhook");
  const [displayName, setDisplayName] = useState("");
  const [vaultRef, setVaultRef] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = CONFIG_FIELDS[kind];
  const requiredConfigKey = fields[0]?.key;
  const canSave =
    displayName.trim().length > 0 &&
    vaultRef.trim().length > 0 &&
    (values[requiredConfigKey] ?? "").trim().length > 0;

  const reset = () => {
    setKind("k8s_webhook");
    setDisplayName("");
    setVaultRef("");
    setEnabled(true);
    setValues({});
  };

  const changeKind = (next: DiscoverySourceKind) => {
    setKind(next);
    setValues({}); // config keys differ per channel
  };

  const submit = async () => {
    if (!canSave) return;

    const config: Record<string, unknown> = { vault_ref: vaultRef.trim() };
    for (const field of fields) {
      const raw = (values[field.key] ?? "").trim();
      if (!raw) continue;
      config[field.key] = field.list
        ? raw.split(",").map((v) => v.trim()).filter(Boolean)
        : raw;
    }

    try {
      await createSource({ kind, display_name: displayName.trim(), config, enabled }).unwrap();
      toast.success(`${displayName.trim()} connected.`);
      onCreated();
      reset();
      onOpenChange(false);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      toast.error(
        status === 403
          ? "Your role is missing the discovery:admin permission."
          : status === 409
            ? "An integration with that name already exists for this channel."
            : "Could not save the integration.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add integration</DialogTitle>
          <DialogDescription>
            A discovery channel for one environment. Credentials are stored as a Vault
            reference and resolved at connector runtime — no raw secret is held here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="integration-kind">Channel</Label>
            <Select value={kind} onValueChange={(v) => changeKind(v as DiscoverySourceKind)}>
              <SelectTrigger id="integration-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SOURCE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cadence: {SOURCE_CADENCE[kind]}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="integration-name">Display name</Label>
            <Input
              id="integration-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={CONFIG_FIELDS[kind][0]?.placeholder}
            />
            <p className="text-xs text-muted-foreground">
              Unique per workspace and channel.
            </p>
          </div>

          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`cfg-${field.key}`}>{field.label}</Label>
              <Input
                id={`cfg-${field.key}`}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
              />
              {field.hint ? (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              ) : null}
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="integration-vault">Vault reference</Label>
            <Input
              id="integration-vault"
              value={vaultRef}
              onChange={(e) => setVaultRef(e.target.value)}
              placeholder={VAULT_PLACEHOLDER[kind]}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Path to the credential. Never paste the secret itself.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="integration-enabled">Enabled</Label>
              <p className="text-xs text-muted-foreground">
                A disabled channel is configured but never scans.
              </p>
            </div>
            <Switch id="integration-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={!canSave || saving}
            onClick={() => void submit()}
          >
            {saving ? "Saving…" : "Add integration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
