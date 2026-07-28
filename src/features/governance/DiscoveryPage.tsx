import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Boxes,
  Cloud,
  EyeOff,
  GitBranch,
  HardDrive,
  Network,
  Plug,
  ShieldBan,
  UserCheck,
} from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  ConsoleFilterBar,
  ConsoleRowActions,
  EntityCell,
  type ConsoleActionItem,
  type ConsoleFilterOption,
} from "@/components/console/iam-console";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";
import type { Tone } from "@/features/governance/lib/riskTone";

type DiscoverySource =
  | "k8s_webhook"
  | "aws"
  | "azure"
  | "gcp"
  | "vm_sensor"
  | "repo_scan"
  | "egress";

type DiscoveryStatus = "Unregistered" | "Registered" | "Quarantined" | "Ignored";

interface DiscoveredAgent {
  id: string;
  name: string;
  fingerprint: string;
  source: DiscoverySource;
  location: string;
  matchedClient: string | null;
  owner: string | null;
  firstSeen: string;
  lastSeen: string;
  status: DiscoveryStatus;
}

const SOURCE_ICON: Record<DiscoverySource, typeof Cloud> = {
  k8s_webhook: Boxes,
  aws: Cloud,
  azure: Cloud,
  gcp: Cloud,
  vm_sensor: HardDrive,
  repo_scan: GitBranch,
  egress: Network,
};

const SOURCE_LABEL: Record<DiscoverySource, string> = {
  k8s_webhook: "K8s Webhook",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  vm_sensor: "VM Sensor",
  repo_scan: "Repo Scan",
  egress: "Egress",
};

const STATUS_TONE: Record<DiscoveryStatus, Tone> = {
  Unregistered: "medium",
  Registered: "low",
  Quarantined: "critical",
  Ignored: "neutral",
};

const INITIAL_AGENTS: DiscoveredAgent[] = [
  { id: "1", name: "invoice-processing-agent", fingerprint: "img:ghcr.io/fintools/invoice-agent@sha256:9f2c…", source: "k8s_webhook", location: "prod-east / ns:payments", matchedClient: null, owner: null, firstSeen: "3d ago", lastSeen: "4m ago", status: "Unregistered" },
  { id: "2", name: "sagemaker-churn-batch", fingerprint: "arn:aws:sagemaker:us-east-1:…:processing-job/churn", source: "aws", location: "us-east-1 · Config scan (pre-existing)", matchedClient: null, owner: null, firstSeen: "41d ago", lastSeen: "1h ago", status: "Unregistered" },
  { id: "3", name: "code-reviewer-v2", fingerprint: "img:registry.authnull.com/code-reviewer@sha256:1bd0…", source: "k8s_webhook", location: "prod-east / ns:devtools", matchedClient: "code-reviewer-v2", owner: "p.shah", firstSeen: "12d ago", lastSeen: "2m ago", status: "Registered" },
  { id: "4", name: "cursor-mcp-session", fingerprint: "proc:cursor + mcp.json@dev-mbp-anita", source: "vm_sensor", location: "host: dev-mbp-anita", matchedClient: null, owner: null, firstSeen: "6h ago", lastSeen: "9m ago", status: "Unregistered" },
  { id: "5", name: "unknown-llm-caller", fingerprint: "net:10.4.2.117 → api.openai.com", source: "egress", location: "vpc-prod / subnet-app-b", matchedClient: null, owner: null, firstSeen: "2d ago", lastSeen: "18m ago", status: "Quarantined" },
  { id: "6", name: "support-triage-bot", fingerprint: "res:/subscriptions/…/containerApps/support-triage", source: "azure", location: "westeurope · Container Apps", matchedClient: "support-triage-bot", owner: "m.okafor", firstSeen: "20d ago", lastSeen: "1m ago", status: "Registered" },
  { id: "7", name: "vertex-summarizer", fingerprint: "res:projects/acme-ml/locations/europe-west1/services/summarizer", source: "gcp", location: "europe-west1 · Cloud Run", matchedClient: null, owner: null, firstSeen: "5d ago", lastSeen: "26m ago", status: "Unregistered" },
  { id: "8", name: "data-export-agent", fingerprint: "tf:infra/agents/data_export.tf", source: "repo_scan", location: "repo: acme/infra (defined, not yet deployed)", matchedClient: null, owner: null, firstSeen: "1d ago", lastSeen: "1d ago", status: "Unregistered" },
  { id: "9", name: "onboarding-agent", fingerprint: "proc:python langchain@vm-hr-01", source: "vm_sensor", location: "host: vm-hr-01", matchedClient: "onboarding-agent", owner: "s.iqbal", firstSeen: "30d ago", lastSeen: "12m ago", status: "Registered" },
  { id: "10", name: "legacy-etl-langchain", fingerprint: "arn:aws:ecs:us-west-2:…:task/legacy-etl", source: "aws", location: "us-west-2 · ECS", matchedClient: null, owner: null, firstSeen: "60d ago", lastSeen: "3h ago", status: "Ignored" },
];

const OWNER_OPTIONS: SearchableSelectOption[] = [
  { value: "p.shah", label: "P. Shah" },
  { value: "m.okafor", label: "M. Okafor" },
  { value: "s.iqbal", label: "S. Iqbal" },
  { value: "it-admin", label: "IT Admin" },
  { value: "g.rossi", label: "G. Rossi" },
];

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agents, setAgents] = useState(INITIAL_AGENTS);
  const [claiming, setClaiming] = useState<DiscoveredAgent | null>(null);
  const [pickedOwner, setPickedOwner] = useState<string | undefined>();
  const [quarantining, setQuarantining] = useState<DiscoveredAgent | null>(null);

  const counts = useMemo(() => {
    const by = (s: DiscoveryStatus) => agents.filter((a) => a.status === s).length;
    return {
      total: agents.length,
      unregistered: by("Unregistered"),
      registered: by("Registered"),
      quarantined: by("Quarantined"),
      ignored: by("Ignored"),
    };
  }, [agents]);

  const coverage = counts.total === 0 ? 0 : Math.round((counts.registered / counts.total) * 100);

  const filters: ConsoleFilterOption[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "Unregistered", label: "Unregistered", count: counts.unregistered },
    { key: "Registered", label: "Registered", count: counts.registered },
    { key: "Quarantined", label: "Quarantined", count: counts.quarantined },
    { key: "Ignored", label: "Ignored", count: counts.ignored },
  ];

  const filtered = useMemo(
    () =>
      agents.filter((a) => {
        if (statusFilter !== "all" && a.status !== statusFilter) return false;
        return `${a.name} ${a.fingerprint} ${a.source} ${a.location} ${a.matchedClient ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [agents, query, statusFilter],
  );

  const setStatus = (id: string, status: DiscoveryStatus, extra?: Partial<DiscoveredAgent>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...extra, status } : a)));
  };

  const columns = useMemo<AdaptiveColumn<DiscoveredAgent>[]>(
    () => [
      {
        id: "agent",
        header: "Agent",
        alwaysVisible: true,
        approxWidth: 280,
        cell: ({ row }) => {
          const Icon = SOURCE_ICON[row.original.source];
          return (
            <div className="flex items-center gap-3">
              <span className="app-glyph">
                <Icon className="size-4" />
              </span>
              <EntityCell label={row.original.name} detail={row.original.fingerprint} />
            </div>
          );
        },
      },
      {
        id: "source",
        header: "Source",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => <Badge variant="outline">{SOURCE_LABEL[row.original.source]}</Badge>,
      },
      {
        id: "location",
        header: "Where seen",
        priority: 1,
        approxWidth: 240,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.location}</span>
        ),
      },
      {
        id: "matched",
        header: "Matched client",
        priority: 1,
        approxWidth: 170,
        cell: ({ row }) =>
          row.original.matchedClient ? (
            <EntityCell label={row.original.matchedClient} detail={row.original.owner ?? undefined} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "lastSeen",
        header: "Last seen",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => (
          <span className="text-muted-foreground" title={`First seen ${row.original.firstSeen}`}>
            {row.original.lastSeen}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />
        ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 180,
        cell: ({ row }) => {
          const agent = row.original;
          if (agent.status === "Registered") return null;
          const menu: ConsoleActionItem[] = [];
          if (agent.status === "Unregistered") {
            menu.push({
              label: "Quarantine",
              icon: <ShieldBan className="size-3.5" />,
              destructive: true,
              onSelect: () => setQuarantining(agent),
            });
            menu.push({
              label: "Ignore",
              icon: <EyeOff className="size-3.5" />,
              onSelect: () => {
                setStatus(agent.id, "Ignored");
                toast.success(`${agent.name} ignored — it will stop appearing as unregistered`);
              },
            });
          }
          if (agent.status === "Ignored") {
            menu.push({
              label: "Reconsider",
              icon: <UserCheck className="size-3.5" />,
              onSelect: () => {
                setStatus(agent.id, "Unregistered");
                toast.success(`${agent.name} moved back to unregistered`);
              },
            });
          }
          return (
            <div className="flex items-center justify-end gap-1.5">
              {agent.status !== "Ignored" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setClaiming(agent);
                    setPickedOwner(undefined);
                  }}
                >
                  <UserCheck className="mr-1 size-3.5" />
                  Claim
                </Button>
              ) : null}
              {menu.length ? <ConsoleRowActions items={menu} /> : null}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Agent Discovery"
      description="Every AI agent the connector fabric has sighted — claim it into governance or quarantine it."
      actions={
        <Button variant="outline" onClick={() => navigate("/governance/discovery/connectors")}>
          <Plug className="mr-1 size-3.5" />
          Connectors
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Discovered</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{counts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unregistered</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-(--color-warning-text)">{counts.unregistered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quarantined</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-(--color-danger-text)">{counts.quarantined}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Coverage</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-(--color-success-text)">{coverage}%</div>
          </CardContent>
        </Card>
      </div>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by name, fingerprint, source, or location"
        filters={filters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />
      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="governance-discovery"
            data={filtered}
            columns={columns}
            enableSelection={false}
            getRowId={(a) => a.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>

      <Dialog open={claiming !== null} onOpenChange={(open) => !open && setClaiming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim agent — {claiming?.name}</DialogTitle>
            <DialogDescription>
              Registers this discovered agent as an OAuth client bound to an accountable owner.
              Access is then requested and granted through the normal governance pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-(--color-surface-subtle) px-3 py-2 font-mono text-xs text-muted-foreground">
              {claiming?.fingerprint}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Owner</Label>
              <SearchableSelect
                options={OWNER_OPTIONS}
                value={pickedOwner}
                onChange={setPickedOwner}
                placeholder="Select a user..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaiming(null)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              disabled={!pickedOwner}
              onClick={() => {
                if (!claiming || !pickedOwner) return;
                setStatus(claiming.id, "Registered", {
                  matchedClient: claiming.name,
                  owner: pickedOwner,
                });
                toast.success(`${claiming.name} registered — owner ${pickedOwner}`);
                setClaiming(null);
              }}
            >
              Claim &amp; Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quarantining !== null} onOpenChange={(open) => !open && setQuarantining(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quarantine — {quarantining?.name}</DialogTitle>
            <DialogDescription>
              Applies an enforcement-tier network deny: the agent's egress is blocked at its
              interception point until an owner claims it. Sightings continue to be recorded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuarantining(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!quarantining) return;
                setStatus(quarantining.id, "Quarantined");
                toast.success(`${quarantining.name} quarantined — egress denied`);
                setQuarantining(null);
              }}
            >
              <ShieldBan className="mr-1 size-3.5" />
              Quarantine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
