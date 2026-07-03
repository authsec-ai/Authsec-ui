import { useMemo } from "react";
import { toast } from "react-hot-toast";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";
import type { Tone } from "@/features/governance/lib/riskTone";

type CampaignType = "Privileged" | "User" | "Agent" | "Role";
type CampaignStatus = "Active" | "Closed" | "Scheduled";

interface Campaign {
  id: string;
  name: string;
  reviewer: string;
  type: CampaignType;
  approved: number;
  rejected: number;
  pending: number;
  due: string;
  status: CampaignStatus;
}

const CAMPAIGNS: Campaign[] = [
  { id: "1", name: "Q2 PAM Privileged Review", reviewer: "Resource Owners", type: "Privileged", approved: 104, rejected: 8, pending: 30, due: "Jun 30", status: "Active" },
  { id: "2", name: "Engineering Access Recert", reviewer: "Direct Managers", type: "User", approved: 96, rejected: 14, pending: 158, due: "Jul 05", status: "Active" },
  { id: "3", name: "AI Agent Entitlement Audit", reviewer: "Platform Team", type: "Agent", approved: 30, rejected: 0, pending: 4, due: "Jun 26", status: "Active" },
  { id: "4", name: "Finance Role Certification", reviewer: "M. Okafor", type: "Role", approved: 11, rejected: 1, pending: 40, due: "Jul 12", status: "Active" },
  { id: "5", name: "Q1 SOX User Access", reviewer: "Direct Managers", type: "User", approved: 312, rejected: 18, pending: 0, due: "Mar 31", status: "Closed" },
  { id: "6", name: "Contractor Quarterly", reviewer: "Sponsors", type: "User", approved: 0, rejected: 0, pending: 0, due: "Sep 30", status: "Scheduled" },
];

const TYPE_VARIANT: Record<CampaignType, "default" | "secondary" | "outline"> = {
  Privileged: "secondary",
  User: "outline",
  Agent: "default",
  Role: "outline",
};

const STATUS_TONE: Record<CampaignStatus, Tone> = {
  Active: "medium",
  Closed: "neutral",
  Scheduled: "neutral",
};

function total(c: Campaign) {
  return c.approved + c.rejected + c.pending;
}

export default function CertificationsPage() {
  const columns = useMemo<AdaptiveColumn<Campaign>[]>(
    () => [
      {
        id: "name",
        header: "Campaign",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <EntityCell
            label={row.original.name}
            detail={`${row.original.reviewer} · ${total(row.original)} items`}
          />
        ),
      },
      {
        id: "type",
        header: "Type",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => <Badge variant={TYPE_VARIANT[row.original.type]}>{row.original.type}</Badge>,
      },
      {
        id: "progress",
        header: "Progress",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => {
          const c = row.original;
          const t = total(c);
          const pct = t > 0 ? Math.round(((c.approved + c.rejected) / t) * 100) : 0;
          return (
            <div className="flex items-center gap-2">
              <Progress value={pct} className="h-1.5 w-24" />
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                {c.approved}✓ {c.rejected}✗ {c.pending}•
              </span>
            </div>
          );
        },
      },
      {
        id: "due",
        header: "Due",
        priority: 1,
        approxWidth: 100,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.due}</span>,
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 110,
        cell: ({ row }) => (
          <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Certifications"
      description="Certification campaigns across users, roles, privileged access, and AI agents."
      actions={
        <Button
          className="text-[length:var(--font-size-sm)] text-white"
          onClick={() => toast("Campaign creation is coming soon.")}
        >
          + New Campaign
        </Button>
      }
    >
      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="certifications"
            data={CAMPAIGNS}
            columns={columns}
            enableSelection={false}
            getRowId={(c) => c.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
