import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { ArrowLeft, Boxes, Cloud, GitBranch, HardDrive, Network, Plus } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";
import type { Tone } from "@/features/governance/lib/riskTone";

type ConnectorKind = "k8s_webhook" | "aws" | "azure" | "gcp" | "vm_sensor" | "repo_scan" | "egress";
type Channel = "Real-time" | "Scheduled scan" | "Passive";
type ConnectorHealth = "Healthy" | "Degraded" | "Pending";

interface DiscoveryConnector {
  id: string;
  kind: ConnectorKind;
  name: string;
  detail: string;
  channels: Channel[];
  sightings: number;
  lastSync: string;
  enabled: boolean;
  health: ConnectorHealth;
}

const KIND_ICON: Record<ConnectorKind, typeof Cloud> = {
  k8s_webhook: Boxes,
  aws: Cloud,
  azure: Cloud,
  gcp: Cloud,
  vm_sensor: HardDrive,
  repo_scan: GitBranch,
  egress: Network,
};

const HEALTH_TONE: Record<ConnectorHealth, Tone> = {
  Healthy: "low",
  Degraded: "high",
  Pending: "neutral",
};

const INITIAL_CONNECTORS: DiscoveryConnector[] = [
  { id: "1", kind: "k8s_webhook", name: "K8s Admission Webhook", detail: "prod-east · report-only · pod CREATE heuristics + initial sweep", channels: ["Real-time", "Scheduled scan"], sightings: 14, lastSync: "2m ago", enabled: true, health: "Healthy" },
  { id: "2", kind: "aws", name: "AWS", detail: "CloudTrail + EventBridge events · Config/Resource Groups sweep", channels: ["Real-time", "Scheduled scan"], sightings: 9, lastSync: "11m ago", enabled: true, health: "Healthy" },
  { id: "3", kind: "azure", name: "Azure", detail: "Event Grid + Activity Logs · Resource Graph sweep", channels: ["Real-time", "Scheduled scan"], sightings: 4, lastSync: "26m ago", enabled: true, health: "Degraded" },
  { id: "4", kind: "gcp", name: "GCP", detail: "Cloud Audit Logs + Pub/Sub · Asset Inventory sweep", channels: ["Real-time", "Scheduled scan"], sightings: 3, lastSync: "31m ago", enabled: true, health: "Healthy" },
  { id: "5", kind: "vm_sensor", name: "VM Sensor (agent-shield)", detail: "Process + MCP-config scan on enrolled hosts · reports over mTLS", channels: ["Scheduled scan"], sightings: 6, lastSync: "8m ago", enabled: true, health: "Healthy" },
  { id: "6", kind: "repo_scan", name: "Repo / IaC Scanner", detail: "Terraform · ARM · Bicep · manifests · pipeline monitoring", channels: ["Scheduled scan"], sightings: 2, lastSync: "3h ago", enabled: true, health: "Healthy" },
  { id: "7", kind: "egress", name: "Egress Traffic Analysis", detail: "Outbound patterns to LLM/MCP endpoints — undeclared agents", channels: ["Passive"], sightings: 1, lastSync: "—", enabled: false, health: "Pending" },
];

const KIND_OPTIONS: SearchableSelectOption[] = [
  { value: "k8s_webhook", label: "Kubernetes Admission Webhook" },
  { value: "aws", label: "AWS (CloudTrail + Config)" },
  { value: "azure", label: "Azure (Event Grid + Resource Graph)" },
  { value: "gcp", label: "GCP (Audit Logs + Asset Inventory)" },
  { value: "vm_sensor", label: "VM Sensor (agent-shield)" },
  { value: "repo_scan", label: "Repo / IaC Scanner" },
  { value: "egress", label: "Egress Traffic Analysis" },
];

export default function ConnectorsPage() {
  const navigate = useNavigate();
  const [connectors, setConnectors] = useState(INITIAL_CONNECTORS);
  const [adding, setAdding] = useState(false);
  const [pickedKind, setPickedKind] = useState<string | undefined>();

  const columns = useMemo<AdaptiveColumn<DiscoveryConnector>[]>(
    () => [
      {
        id: "name",
        header: "Connector",
        alwaysVisible: true,
        approxWidth: 300,
        cell: ({ row }) => {
          const Icon = KIND_ICON[row.original.kind];
          return (
            <div className="flex items-center gap-3">
              <span className="app-glyph">
                <Icon className="size-4" />
              </span>
              <EntityCell label={row.original.name} detail={row.original.detail} />
            </div>
          );
        },
      },
      {
        id: "channels",
        header: "Channels",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.channels.map((c) => (
              <Badge key={c} variant={c === "Real-time" ? "default" : "outline"}>
                {c}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "sightings",
        header: "Sightings",
        priority: 2,
        approxWidth: 100,
        cell: ({ row }) => <span className="tabular-nums">{row.original.sightings}</span>,
      },
      {
        id: "lastSync",
        header: "Last sync",
        priority: 2,
        approxWidth: 100,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.lastSync}</span>,
      },
      {
        id: "health",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 110,
        cell: ({ row }) => (
          <StatusPill label={row.original.health} tone={HEALTH_TONE[row.original.health]} />
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        alwaysVisible: true,
        approxWidth: 90,
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            onCheckedChange={(checked) => {
              setConnectors((prev) =>
                prev.map((c) => (c.id === row.original.id ? { ...c, enabled: checked } : c)),
              );
              toast.success(`${row.original.name} ${checked ? "enabled" : "disabled"}`);
            }}
          />
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Discovery Connectors"
      description="The connector fabric feeding the discovered-agents inventory — each environment pairs a real-time listener with a scheduled sweep of the installed base."
      actions={
        <>
          <Button variant="outline" onClick={() => navigate("/governance/discovery")}>
            <ArrowLeft className="mr-1 size-3.5" />
            Discovery
          </Button>
          <Button className="text-white" onClick={() => setAdding(true)}>
            <Plus className="mr-1 size-3.5" />
            Add Connector
          </Button>
        </>
      }
    >
      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="governance-discovery-connectors"
            data={connectors}
            columns={columns}
            enableSelection={false}
            getRowId={(c) => c.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add discovery connector</DialogTitle>
            <DialogDescription>
              Credentials are stored as vault references; the connector starts in report-only
              mode and writes sightings into the shared inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Connector type</Label>
            <SearchableSelect
              options={KIND_OPTIONS}
              value={pickedKind}
              onChange={setPickedKind}
              placeholder="Select an environment..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              disabled={!pickedKind}
              onClick={() => {
                const kind = KIND_OPTIONS.find((k) => k.value === pickedKind);
                if (!kind) return;
                setConnectors((prev) => [
                  ...prev,
                  {
                    id: `${prev.length + 1}-new`,
                    kind: pickedKind as ConnectorKind,
                    name: kind.label,
                    detail: "Awaiting first sync",
                    channels: ["Scheduled scan"],
                    sightings: 0,
                    lastSync: "—",
                    enabled: true,
                    health: "Pending",
                  },
                ]);
                toast.success(`${kind.label} connector added — first sync scheduled`);
                setAdding(false);
                setPickedKind(undefined);
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
