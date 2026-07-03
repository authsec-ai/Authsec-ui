import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { FileCheck2, Pencil, Play, Power } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import {
  AccessPath,
  ConsoleRowActions,
  EntityCell,
  VerdictCard,
  type AccessPathStep,
  type ConsoleActionItem,
} from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { StatusPill } from "@/features/governance/components/StatusPill";

type PolicyStatus = "Active" | "Draft" | "Retired";

interface Policy {
  id: string;
  name: string;
  selectors: string;
  conditions: string | null;
  status: PolicyStatus;
  updated: string;
}

const STATUS_TONE: Record<PolicyStatus, "low" | "medium" | "neutral"> = {
  Active: "low",
  Draft: "medium",
  Retired: "neutral",
};

const INITIAL_POLICIES: Policy[] = [
  { id: "1", name: "Business-hours issuance only", selectors: "client: *-agent · RS: prod-*", conditions: "08:00–19:00, Mon–Fri", status: "Active", updated: "2d ago" },
  { id: "2", name: "Deny weekend deploys", selectors: "RS: deployment-api", conditions: "weekdays: Sat, Sun", status: "Active", updated: "5d ago" },
  { id: "3", name: "Rate-limit export scope", selectors: "scope: data:export", conditions: "max 20/hour", status: "Active", updated: "1w ago" },
  { id: "4", name: "High-risk RS review", selectors: "RS.risk_tier: high", conditions: null, status: "Draft", updated: "3d ago" },
  { id: "5", name: "Legacy token-family cap", selectors: "token_family: legacy-*", conditions: "max 5/hour", status: "Retired", updated: "3mo ago" },
];

const PRINCIPALS = ["priya.nair@authnull.com", "code-reviewer-v2 (agent)", "data-export-bot (agent)"];
const RESOURCE_SERVERS = ["github-mcp", "deployment-api", "snowflake-mcp", "prod-db-east"];

export default function PoliciesPage() {
  const [policies, setPolicies] = useState(INITIAL_POLICIES);
  const [principal, setPrincipal] = useState(PRINCIPALS[0]);
  const [resourceServer, setResourceServer] = useState(RESOURCE_SERVERS[0]);
  const [scopes, setScopes] = useState("repo:write");
  const [result, setResult] = useState<{ verdict: "allow" | "deny" | "review"; steps: AccessPathStep[] } | null>(null);

  const columns = useMemo<AdaptiveColumn<Policy>[]>(
    () => [
      {
        id: "name",
        header: "Policy",
        alwaysVisible: true,
        approxWidth: 240,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="app-glyph">
              <FileCheck2 className="size-4" />
            </span>
            <EntityCell label={row.original.name} detail={row.original.selectors} />
          </div>
        ),
      },
      {
        id: "conditions",
        header: "Conditions",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) =>
          row.original.conditions ? (
            <Badge variant="outline">{row.original.conditions}</Badge>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        alwaysVisible: true,
        approxWidth: 110,
        cell: ({ row }) => <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: "updated",
        header: "Updated",
        priority: 2,
        approxWidth: 110,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.updated}</span>,
      },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        approxWidth: 60,
        cell: ({ row }) => {
          const items: ConsoleActionItem[] = [
            { label: "Edit", icon: <Pencil className="size-3.5" />, onSelect: () => toast("Policy editing is coming soon.") },
            {
              label: row.original.status === "Active" ? "Retire" : "Activate",
              icon: <Power className="size-3.5" />,
              onSelect: () => {
                const nextStatus: PolicyStatus = row.original.status === "Active" ? "Retired" : "Active";
                setPolicies((prev) =>
                  prev.map((p) => (p.id === row.original.id ? { ...p, status: nextStatus } : p)),
                );
                toast.success(`${row.original.name} ${nextStatus === "Active" ? "activated" : "retired"}`);
              },
            },
          ];
          return <ConsoleRowActions items={items} />;
        },
      },
    ],
    [],
  );

  const runSimulation = () => {
    const requestedScopes = scopes.split(",").map((s) => s.trim()).filter(Boolean);
    const conditionPolicy = policies.find(
      (p) => p.status === "Active" && p.conditions && p.selectors.includes(resourceServer.split("-")[0]),
    );
    const deny = resourceServer === "deployment-api" && requestedScopes.includes("deploy:prod");

    const steps: AccessPathStep[] = [
      { label: "ScopeResolver intersection", detail: `${requestedScopes.join(", ") || "(none)"} ∩ ${resourceServer}.scopes_supported`, state: "ok" },
      { label: "RBAC-effective scopes", detail: `${principal} — role bindings evaluated`, state: "ok" },
      {
        label: "SimplePDP conditions",
        detail: conditionPolicy ? `${conditionPolicy.name} — ${conditionPolicy.conditions}` : "no_policy — defers to gates",
        state: conditionPolicy ? "warn" : "muted",
      },
      {
        label: "Decision",
        detail: deny ? "Denied by policy: Deny weekend deploys" : "Granted the resolved intersection",
        state: deny ? "blocked" : "ok",
      },
    ];

    setResult({ verdict: deny ? "deny" : conditionPolicy ? "review" : "allow", steps });
  };

  return (
    <ConsolePage
      title="Policies"
      description="Condition-aware policies evaluated at token issuance, plus a resolution simulator."
    >
      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
        </TabsList>

        <TabsContent value="policies">
          <TableCard>
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="governance-policies"
                data={policies}
                columns={columns}
                enableSelection={false}
                getRowId={(p) => p.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="simulator">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardContent className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Run a hypothetical token request through the PDP and ScopeResolver.
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Principal</label>
                  <Select value={principal} onValueChange={setPrincipal}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRINCIPALS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Resource server</label>
                  <Select value={resourceServer} onValueChange={setResourceServer}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESOURCE_SERVERS.map((rs) => (
                        <SelectItem key={rs} value={rs}>{rs}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Requested scopes</label>
                  <Input value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="repo:write, deploy:prod" />
                </div>
                <Button className="text-white" onClick={runSimulation}>
                  <Play className="mr-1.5 size-3.5" />
                  Simulate
                </Button>
              </CardContent>
            </Card>

            {result ? (
              <VerdictCard
                verdict={result.verdict}
                title={
                  result.verdict === "allow" ? "Granted" : result.verdict === "deny" ? "Denied" : "Needs review"
                }
                body="Resolution diagnostics from the ScopeResolver and SimplePDP, in evaluation order."
                action={<AccessPath steps={result.steps} />}
              />
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Run a simulation to see the resolution diagnostics.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </ConsolePage>
  );
}
