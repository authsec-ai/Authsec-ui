import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Bot, Layers, Server, UserCheck } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { ConsoleFilterBar, EntityCell } from "@/components/console/iam-console";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";

type ResourceType = "Application" | "OAuth Client" | "Service Account";

interface OwnedResource {
  id: string;
  name: string;
  type: ResourceType;
  owner: string | null;
  orphan: boolean;
}

const INITIAL_RESOURCES: OwnedResource[] = [
  { id: "1", name: "GitHub MCP", type: "Application", owner: "p.shah", orphan: false },
  { id: "2", name: "Snowflake Connector", type: "Application", owner: null, orphan: false },
  { id: "3", name: "code-reviewer-v2", type: "OAuth Client", owner: "p.shah", orphan: false },
  { id: "4", name: "data-export-bot", type: "OAuth Client", owner: "t.lund", orphan: true },
  { id: "5", name: "svc-legacy-etl", type: "Service Account", owner: null, orphan: false },
  { id: "6", name: "okta-sync", type: "Service Account", owner: "it-admin", orphan: false },
  { id: "7", name: "billing-webhook-relay", type: "Application", owner: null, orphan: false },
  { id: "8", name: "onboarding-agent", type: "OAuth Client", owner: null, orphan: false },
];

const TYPE_ICON: Record<ResourceType, typeof Layers> = {
  Application: Layers,
  "OAuth Client": Bot,
  "Service Account": Server,
};

const OWNER_OPTIONS: SearchableSelectOption[] = [
  { value: "p.shah", label: "P. Shah" },
  { value: "m.okafor", label: "M. Okafor" },
  { value: "s.iqbal", label: "S. Iqbal" },
  { value: "it-admin", label: "IT Admin" },
  { value: "g.rossi", label: "G. Rossi" },
];

export default function OwnershipPage() {
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState(INITIAL_RESOURCES);
  const [assigning, setAssigning] = useState<OwnedResource | null>(null);
  const [pickedOwner, setPickedOwner] = useState<string | undefined>();

  const filtered = useMemo(
    () =>
      resources.filter((r) =>
        `${r.name} ${r.type} ${r.owner ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [resources, query],
  );

  const unownedCount = useMemo(() => resources.filter((r) => !r.owner).length, [resources]);
  const orphanCount = useMemo(() => resources.filter((r) => r.orphan).length, [resources]);

  const columns = useMemo<AdaptiveColumn<OwnedResource>[]>(
    () => [
      {
        id: "name",
        header: "Resource",
        alwaysVisible: true,
        approxWidth: 260,
        cell: ({ row }) => {
          const Icon = TYPE_ICON[row.original.type];
          return (
            <div className="flex items-center gap-3">
              <span className="app-glyph">
                <Icon className="size-4" />
              </span>
              <EntityCell label={row.original.name} detail={row.original.type} />
            </div>
          );
        },
      },
      {
        id: "owner",
        header: "Owner",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) =>
          row.original.owner ? (
            <span className="flex items-center gap-2">
              {row.original.owner}
              {row.original.orphan ? (
                <StatusPill label="Orphaned" tone="critical" />
              ) : null}
            </span>
          ) : (
            <StatusPill label="Unowned" tone="medium" />
          ),
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 160,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAssigning(row.original);
              setPickedOwner(row.original.owner ?? undefined);
            }}
          >
            <UserCheck className="mr-1 size-3.5" />
            Assign Owner
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Ownership"
      description="Applications, OAuth clients, and service accounts without an accountable owner."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total resources</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{resources.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Unowned</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-(--color-warning-text)">{unownedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orphaned</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-(--color-danger-text)">{orphanCount}</div>
          </CardContent>
        </Card>
      </div>

      <ConsoleFilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search by resource, type, or owner"
      />
      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="governance-ownership"
            data={filtered}
            columns={columns}
            enableSelection={false}
            getRowId={(r) => r.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>

      <Dialog open={assigning !== null} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign owner — {assigning?.name}</DialogTitle>
            <DialogDescription>
              The owner becomes the default approver and certifier for this resource.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Owner</Label>
            <SearchableSelect
              options={OWNER_OPTIONS}
              value={pickedOwner}
              onChange={setPickedOwner}
              placeholder="Select a user..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button
              className="text-white"
              disabled={!pickedOwner}
              onClick={() => {
                if (!assigning || !pickedOwner) return;
                setResources((prev) =>
                  prev.map((r) =>
                    r.id === assigning.id ? { ...r, owner: pickedOwner, orphan: false } : r,
                  ),
                );
                toast.success(`${assigning.name} is now owned by ${pickedOwner}`);
                setAssigning(null);
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConsolePage>
  );
}
