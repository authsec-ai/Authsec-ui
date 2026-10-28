/**
 * AgentBindingPanel — enforcement binding controls for an agent.
 *
 * Shows the current backend (AuthSec/OpenShell), identity mode (SPIFFE/enrolled_mtls),
 * effective vs default backend, plan job status, and blockers.
 */

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Shield, Server, Key } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Panel, Facts, Fact } from "@/features/iga/shared/components/Panel";
import { StatusBadge, type ConsoleTone } from "@/components/console/status";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useGetEnforcementBindingQuery,
  useUpdateEnforcementBindingMutation,
  type EnforcementBackend,
  type BindingState,
} from "./policyApi";

// ── Helpers ──────────────────────────────────────────────────────────────────

function bindingStateTone(state: BindingState): ConsoleTone {
  switch (state) {
    case "draft":
      return "neutral";
    case "planned":
      return "info";
    case "approved":
      return "warning";
    case "active":
      return "success";
    case "superseded":
      return "neutral";
    default:
      return "neutral";
  }
}

const BINDING_STATE_LABELS: Record<BindingState, string> = {
  draft: "Draft",
  planned: "Planned",
  approved: "Approved",
  active: "Active",
  superseded: "Superseded",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface AgentBindingPanelProps {
  agentId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AgentBindingPanel({ agentId }: AgentBindingPanelProps) {
  const {
    data: binding,
    isLoading,
    isError,
  } = useGetEnforcementBindingQuery(agentId);

  const [updateBinding, { isLoading: isUpdating }] =
    useUpdateEnforcementBindingMutation();

  const [editMode, setEditMode] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<EnforcementBackend>("authsec");
  const [selectedIdentity, setSelectedIdentity] = useState("spiffe");
  const [selectedProfile, setSelectedProfile] = useState("");

  const startEdit = () => {
    if (binding) {
      setSelectedBackend(binding.backend);
      setSelectedIdentity(binding.identity_mode);
      setSelectedProfile(binding.backend_profile);
    }
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      await updateBinding({
        agentId,
        backend: selectedBackend,
        backend_profile: selectedProfile || undefined,
        identity_mode: selectedIdentity,
      }).unwrap();
      toast.success("Enforcement binding updated");
      setEditMode(false);
    } catch {
      toast.error("Failed to update binding");
    }
  };

  if (isLoading) {
    return (
      <Panel title="Enforcement Binding">
        <div className="h-24 animate-pulse rounded-md bg-(--color-surface-subtle)" />
      </Panel>
    );
  }

  if (isError) {
    return (
      <Panel title="Enforcement Binding">
        <p className="text-sm text-(--color-text-muted)">
          Failed to load enforcement binding.
        </p>
      </Panel>
    );
  }

  // No binding yet
  if (!binding) {
    return (
      <Panel title="Enforcement Binding">
        <div className="space-y-3">
          <p className="text-sm text-(--color-text-muted)">
            No enforcement binding configured. The agent will use the workspace
            default backend.
          </p>
          {!editMode ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              Configure Binding
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-(--color-border-subtle) p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Backend</Label>
                <Select
                  value={selectedBackend}
                  onValueChange={(v) => setSelectedBackend(v as EnforcementBackend)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="authsec">AuthSec</SelectItem>
                    <SelectItem value="openshell">OpenShell</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Identity Mode</Label>
                <Select
                  value={selectedIdentity}
                  onValueChange={setSelectedIdentity}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spiffe">SPIFFE</SelectItem>
                    <SelectItem value="enrolled_mtls">Enrolled mTLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={isUpdating}>
                  {isUpdating ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    );
  }

  // Existing binding
  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Shield className="size-4" />
          Enforcement Binding
          <StatusBadge tone={bindingStateTone(binding.state)}>
            {BINDING_STATE_LABELS[binding.state] ?? binding.state}
          </StatusBadge>
        </span>
      }
    >
      {editMode ? (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Backend</Label>
              <Select
                value={selectedBackend}
                onValueChange={(v) => setSelectedBackend(v as EnforcementBackend)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="authsec">AuthSec</SelectItem>
                  <SelectItem value="openshell">OpenShell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Identity Mode</Label>
              <Select
                value={selectedIdentity}
                onValueChange={setSelectedIdentity}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spiffe">SPIFFE</SelectItem>
                  <SelectItem value="enrolled_mtls">Enrolled mTLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Draft"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Facts>
            <Fact label="Backend">
              <span className="inline-flex items-center gap-1.5">
                <Server className="size-3.5" />
                {binding.backend}
              </span>
            </Fact>
            <Fact label="Profile">{binding.backend_profile || "Default"}</Fact>
            <Fact label="Identity Mode">
              <span className="inline-flex items-center gap-1.5">
                <Key className="size-3.5" />
                {binding.identity_mode}
              </span>
            </Fact>
            <Fact label="Revision">v{binding.binding_revision}</Fact>
            {binding.capability_digest && (
              <Fact label="Capability Digest" mono>
                {binding.capability_digest.slice(0, 16)}...
              </Fact>
            )}
            {binding.plan_hash && (
              <Fact label="Plan Hash" mono>
                {binding.plan_hash.slice(0, 16)}...
              </Fact>
            )}
          </Facts>

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={startEdit}
          >
            Edit Binding
          </Button>
        </div>
      )}
    </Panel>
  );
}
