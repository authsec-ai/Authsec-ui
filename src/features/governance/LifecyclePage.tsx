import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { RefreshCw, Users } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleRowActions, EntityCell, type ConsoleActionItem } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";
import type { Tone } from "@/features/governance/lib/riskTone";

interface BirthrightPolicy {
  id: string;
  name: string;
  match: string;
  roles: string[];
  enabled: boolean;
}

const INITIAL_POLICIES: BirthrightPolicy[] = [
  { id: "1", name: "Engineering baseline", match: "group: Engineering", roles: ["Developer", "VPN Full Tunnel"], enabled: true },
  { id: "2", name: "Finance baseline", match: "group: Finance", roles: ["Finance Analyst"], enabled: true },
  { id: "3", name: "New hire default", match: "workspace_membership: any", roles: ["Base Employee"], enabled: true },
  { id: "4", name: "Contractor restricted", match: "email_domain: contractors.authnull.com", roles: ["Contractor Limited"], enabled: false },
];

type EventType = "Joiner" | "Mover" | "Leaver";
type EventStatus = "Pending" | "Processed" | "Failed";

interface LifecycleEvent {
  id: string;
  type: EventType;
  subject: string;
  source: "scim" | "oidc_jit" | "manual";
  status: EventStatus;
  occurred: string;
}

const EVENT_TYPE_VARIANT: Record<EventType, "default" | "secondary" | "outline"> = {
  Joiner: "default",
  Mover: "secondary",
  Leaver: "outline",
};

const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  Pending: "medium",
  Processed: "low",
  Failed: "critical",
};

const INITIAL_EVENTS: LifecycleEvent[] = [
  { id: "1", type: "Joiner", subject: "noor.patel@authnull.com", source: "scim", status: "Processed", occurred: "2h ago" },
  { id: "2", type: "Mover", subject: "raj.patel@authnull.com", source: "scim", status: "Processed", occurred: "5h ago" },
  { id: "3", type: "Leaver", subject: "tom.lund@authnull.com", source: "scim", status: "Failed", occurred: "1d ago" },
  { id: "4", type: "Joiner", subject: "svc-data-pipeline", source: "manual", status: "Pending", occurred: "1d ago" },
  { id: "5", type: "Leaver", subject: "sarah.chen@authnull.com", source: "oidc_jit", status: "Failed", occurred: "2d ago" },
];

export default function LifecyclePage() {
  const [policies, setPolicies] = useState(INITIAL_POLICIES);
  const [events, setEvents] = useState(INITIAL_EVENTS);

  const policyColumns = useMemo<AdaptiveColumn<BirthrightPolicy>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="app-glyph">
              <Users className="size-4" />
            </span>
            <EntityCell label={row.original.name} />
          </div>
        ),
      },
      {
        id: "match",
        header: "Match",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.match}</span>,
      },
      {
        id: "roles",
        header: "Grants",
        priority: 1,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="outline">{r}</Badge>
            ))}
          </div>
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        alwaysVisible: true,
        approxWidth: 100,
        cell: ({ row }) => (
          <Switch
            checked={row.original.enabled}
            onCheckedChange={(checked) => {
              setPolicies((prev) =>
                prev.map((p) => (p.id === row.original.id ? { ...p, enabled: checked } : p)),
              );
              toast.success(`${row.original.name} ${checked ? "enabled" : "disabled"}`);
            }}
          />
        ),
      },
    ],
    [],
  );

  const eventColumns = useMemo<AdaptiveColumn<LifecycleEvent>[]>(
    () => [
      {
        id: "type",
        header: "Event",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => <Badge variant={EVENT_TYPE_VARIANT[row.original.type]}>{row.original.type}</Badge>,
      },
      {
        id: "subject",
        header: "Subject",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => <EntityCell label={row.original.subject} />,
      },
      {
        id: "source",
        header: "Source",
        priority: 1,
        approxWidth: 120,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.source}</span>,
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => (
          <StatusPill label={row.original.status} tone={EVENT_STATUS_TONE[row.original.status]} />
        ),
      },
      {
        id: "occurred",
        header: "Occurred",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.occurred}</span>,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 60,
        cell: ({ row }) => {
          if (row.original.status !== "Failed") return null;
          const items: ConsoleActionItem[] = [
            {
              label: "Retry",
              icon: <RefreshCw className="size-3.5" />,
              onSelect: () => {
                setEvents((prev) =>
                  prev.map((e) => (e.id === row.original.id ? { ...e, status: "Processed" } : e)),
                );
                toast.success(`Retried ${row.original.type.toLowerCase()} event for ${row.original.subject}`);
              },
            },
          ];
          return <ConsoleRowActions items={items} />;
        },
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Lifecycle"
      description="Birthright provisioning and the joiner/mover/leaver event log."
    >
      <Tabs defaultValue="birthright">
        <TabsList>
          <TabsTrigger value="birthright">Birthright Policies</TabsTrigger>
          <TabsTrigger value="events">Event Log</TabsTrigger>
        </TabsList>

        <TabsContent value="birthright">
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="birthright-policies"
                data={policies}
                columns={policyColumns}
                enableSelection={false}
                getRowId={(p) => p.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="events">
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="lifecycle-events"
                data={events}
                columns={eventColumns}
                enableSelection={false}
                getRowId={(e) => e.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>
      </Tabs>
    </ConsolePage>
  );
}
