import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, Check, GitBranch, X } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { RiskPill } from "@/features/governance/components/RiskPill";
import { StatusPill } from "@/features/governance/components/StatusPill";

type EntitlementType = "Privileged" | "Role" | "Entitlement" | "Agent Tool";

interface Entitlement {
  id: string;
  name: string;
  type: EntitlementType;
  owner: string;
  holders: number;
  conflicts: number;
  risk: number;
}

const TYPE_VARIANT: Record<EntitlementType, "default" | "secondary" | "outline"> = {
  Privileged: "secondary",
  Role: "outline",
  Entitlement: "outline",
  "Agent Tool": "default",
};

const ENTITLEMENTS: Entitlement[] = [
  { id: "1", name: "Global Administrator", type: "Privileged", owner: "it-admin", holders: 5, conflicts: 2, risk: 97 },
  { id: "2", name: "Domain Admins", type: "Privileged", owner: "it-admin", holders: 12, conflicts: 3, risk: 94 },
  { id: "3", name: "prod-db-east (admin)", type: "Privileged", owner: "p.shah", holders: 8, conflicts: 1, risk: 88 },
  { id: "4", name: "PAM · vault-secrets", type: "Privileged", owner: "s.iqbal", holders: 7, conflicts: 1, risk: 84 },
  { id: "5", name: "PAM · vault-root", type: "Privileged", owner: "s.iqbal", holders: 3, conflicts: 0, risk: 86 },
  { id: "6", name: "payroll_db.read_write", type: "Entitlement", owner: "m.okafor", holders: 6, conflicts: 2, risk: 72 },
  { id: "7", name: "DevOps · Cluster Admin", type: "Privileged", owner: "p.shah", holders: 9, conflicts: 0, risk: 72 },
  { id: "8", name: "github:repo-write", type: "Agent Tool", owner: "p.shah", holders: 14, conflicts: 0, risk: 54 },
  { id: "9", name: "VPN Full Tunnel", type: "Entitlement", owner: "IT Security", holders: 42, conflicts: 0, risk: 34 },
  { id: "10", name: "Finance Analyst", type: "Role", owner: "m.okafor", holders: 24, conflicts: 0, risk: 42 },
  { id: "11", name: "Salesforce · Reports", type: "Entitlement", owner: "g.rossi", holders: 31, conflicts: 0, risk: 28 },
];

interface MyRequest {
  id: string;
  item: string;
  type: EntitlementType;
  submitted: string;
  status: "Pending" | "Approved" | "Denied";
}

const MY_REQUESTS: MyRequest[] = [
  { id: "1", item: "Salesforce · Reports", type: "Entitlement", submitted: "Jul 01", status: "Pending" },
  { id: "2", item: "VPN Full Tunnel", type: "Entitlement", submitted: "Jun 20", status: "Approved" },
  { id: "3", item: "PAM · vault-secrets", type: "Privileged", submitted: "Jun 15", status: "Denied" },
  { id: "4", item: "Finance Analyst", type: "Role", submitted: "May 30", status: "Approved" },
];

interface ApprovalItem {
  id: string;
  requester: string;
  item: string;
  submitted: string;
  sodWarning?: string;
}

const APPROVAL_QUEUE: ApprovalItem[] = [
  { id: "1", requester: "priya.nair@authnull.com", item: "DevOps · Cluster Admin", submitted: "Jul 02" },
  {
    id: "2",
    requester: "code-reviewer-v2 (agent)",
    item: "github:repo-write",
    submitted: "Jul 01",
    sodWarning: "Conflicts with existing Dev-Deploy role",
  },
  {
    id: "3",
    requester: "liam.brooks@authnull.com",
    item: "PAM · vault-root",
    submitted: "Jun 29",
    sodWarning: "Holder already has PAM · vault-secrets",
  },
];

const DURATION_OPTIONS = ["30 days", "60 days", "90 days", "1 year"];

function statusTone(status: MyRequest["status"]) {
  if (status === "Approved") return "low" as const;
  if (status === "Denied") return "critical" as const;
  return "medium" as const;
}

export default function AccessRequestsPage() {
  const [query, setQuery] = useState("");
  const [decided, setDecided] = useState<Record<string, "approved" | "denied">>({});
  const [approving, setApproving] = useState<ApprovalItem | null>(null);
  const [duration, setDuration] = useState(DURATION_OPTIONS[2]);
  const [comment, setComment] = useState("");

  const catalogItems = useMemo(
    () =>
      ENTITLEMENTS.filter((e) =>
        `${e.name} ${e.owner} ${e.type}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const catalogColumns = useMemo<AdaptiveColumn<Entitlement>[]>(
    () => [
      {
        id: "name",
        header: "Entitlement",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="app-glyph">
              <GitBranch className="size-4" />
            </span>
            <EntityCell label={row.original.name} detail={row.original.owner} />
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        alwaysVisible: true,
        approxWidth: 130,
        cell: ({ row }) => <Badge variant={TYPE_VARIANT[row.original.type]}>{row.original.type}</Badge>,
      },
      {
        id: "risk",
        header: "Risk",
        priority: 1,
        approxWidth: 100,
        cell: ({ row }) => <RiskPill score={row.original.risk} />,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 110,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.success(`Requested ${row.original.name}`)}
          >
            Request
          </Button>
        ),
      },
    ],
    [],
  );

  const myRequestsColumns = useMemo<AdaptiveColumn<MyRequest>[]>(
    () => [
      {
        id: "item",
        header: "Item",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => <EntityCell label={row.original.item} detail={row.original.type} />,
      },
      {
        id: "submitted",
        header: "Submitted",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.submitted}</span>,
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 130,
        cell: ({ row }) => (
          <StatusPill label={row.original.status} tone={statusTone(row.original.status)} />
        ),
      },
    ],
    [],
  );

  const approvalColumns = useMemo<AdaptiveColumn<ApprovalItem>[]>(
    () => [
      {
        id: "requester",
        header: "Requester",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => <EntityCell label={row.original.requester} />,
      },
      {
        id: "item",
        header: "Item",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) =>
          row.original.sodWarning ? (
            <EntityCell
              label={row.original.item}
              detail={
                <span className="inline-flex items-center gap-1 text-(--color-warning-text)">
                  <AlertTriangle className="size-3" />
                  {row.original.sodWarning}
                </span>
              }
            />
          ) : (
            row.original.item
          ),
      },
      {
        id: "submitted",
        header: "Submitted",
        priority: 1,
        approxWidth: 130,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.submitted}</span>,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 160,
        cell: ({ row }) => {
          const decision = decided[row.original.id];
          if (decision) {
            return (
              <StatusPill
                label={decision === "approved" ? "Approved" : "Denied"}
                tone={decision === "approved" ? "low" : "critical"}
              />
            );
          }
          return (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setApproving(row.original);
                  setDuration(DURATION_OPTIONS[2]);
                  setComment("");
                }}
              >
                <Check className="mr-1 size-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDecided((d) => ({ ...d, [row.original.id]: "denied" }));
                  toast.error(`Denied ${row.original.item} for ${row.original.requester}`);
                }}
              >
                <X className="mr-1 size-3.5" />
                Deny
              </Button>
            </div>
          );
        },
      },
    ],
    [decided],
  );

  return (
    <ConsolePage
      title="Access Requests"
      description="Browse the catalog, track your requests, and act on approvals waiting for your decision."
    >
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
          <TabsTrigger value="approver-inbox">Approver Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <ConsoleFilterBar
            search={query}
            onSearchChange={setQuery}
            searchPlaceholder="Search by entitlement, owner, or type"
          />
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="governance-access-catalog"
                data={catalogItems}
                columns={catalogColumns}
                enableSelection={false}
                getRowId={(e) => e.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50, 100], alwaysVisible: true }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="my-requests">
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="my-access-requests"
                data={MY_REQUESTS}
                columns={myRequestsColumns}
                enableSelection={false}
                getRowId={(r) => r.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="approver-inbox">
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="approver-inbox"
                data={APPROVAL_QUEUE}
                columns={approvalColumns}
                enableSelection={false}
                getRowId={(r) => r.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>
      </Tabs>

      <Dialog open={approving !== null} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {approving?.item}</DialogTitle>
            <DialogDescription>
              Grant {approving?.requester} time-boxed access. This binding will expire automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {approving?.sodWarning ? (
              <div className="flex items-start gap-2 rounded-md bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning-text)">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{approving.sodWarning}</span>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Comment (optional)</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Reason for approval..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              onClick={() => {
                if (!approving) return;
                setDecided((d) => ({ ...d, [approving.id]: "approved" }));
                toast.success(`Approved ${approving.item} for ${approving.requester} · ${duration}`);
                setApproving(null);
              }}
            >
              Approve for {duration}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
