import { useMemo } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { RiskPill } from "@/features/governance/components/RiskPill";
import { StatusPill } from "@/features/governance/components/StatusPill";
import { TONE_CLASSES } from "@/features/governance/lib/riskTone";
import { cn } from "@/lib/utils";

const RISK_FACTORS = ["Privilege", "Dormancy", "SoD", "Anomaly"] as const;

const HEATMAP: { identity: string; scores: [number, number, number, number] }[] = [
  { identity: "sarah.chen", scores: [80, 79, 67, 37] },
  { identity: "liam.brooks", scores: [97, 93, 43, 86] },
  { identity: "priya.nair", scores: [80, 79, 67, 37] },
  { identity: "tom.lund", scores: [12, 91, 4, 81] },
  { identity: "raj.patel", scores: [58, 12, 94, 28] },
  { identity: "code-reviewer-v2", scores: [24, 73, 8, 94] },
  { identity: "data-export-bot", scores: [16, 20, 89, 54] },
  { identity: "okta-sync", scores: [58, 12, 94, 28] },
];

const TOP_RISKY_ENTITLEMENTS = [
  { name: "Global Administrator", holders: 5, conflicts: 2, score: 97 },
  { name: "Domain Admins", holders: 12, conflicts: 3, score: 94 },
  { name: "prod-db-east (admin)", holders: 8, conflicts: 1, score: 88 },
  { name: "PAM · vault-root", holders: 3, conflicts: 0, score: 86 },
  { name: "payroll_db.read_write", holders: 6, conflicts: 2, score: 72 },
];

interface DormantEntitlement {
  id: string;
  entitlement: string;
  holder: string;
  lastIssuance: string;
  daysDormant: number;
}

const DORMANT_ENTITLEMENTS: DormantEntitlement[] = [
  { id: "1", entitlement: "PAM · vault-root", holder: "s.iqbal", lastIssuance: "94d ago", daysDormant: 94 },
  { id: "2", entitlement: "github:repo-write", holder: "code-reviewer-v1", lastIssuance: "61d ago", daysDormant: 61 },
  { id: "3", entitlement: "Salesforce · Reports", holder: "g.rossi", lastIssuance: "48d ago", daysDormant: 48 },
  { id: "4", entitlement: "VPN Full Tunnel", holder: "svc-legacy-etl", lastIssuance: "120d ago", daysDormant: 120 },
];

interface LeastPrivilegeRow {
  id: string;
  subject: string;
  granted: number;
  exercised: number;
  unused: string[];
}

const LEAST_PRIVILEGE: LeastPrivilegeRow[] = [
  { id: "1", subject: "code-reviewer-v2", granted: 6, exercised: 2, unused: ["repo:admin", "org:write", "billing:read", "webhooks:manage"] },
  { id: "2", subject: "data-export-bot", granted: 4, exercised: 3, unused: ["s3:delete"] },
  { id: "3", subject: "okta-sync", granted: 3, exercised: 3, unused: [] },
  { id: "4", subject: "m.okafor", granted: 8, exercised: 4, unused: ["payroll:approve", "payroll:release", "vendor:create", "budget:override"] },
];

export default function RiskPage() {
  const dormantColumns = useMemo<AdaptiveColumn<DormantEntitlement>[]>(
    () => [
      {
        id: "entitlement",
        header: "Entitlement",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => <EntityCell label={row.original.entitlement} detail={row.original.holder} />,
      },
      {
        id: "lastIssuance",
        header: "Last issuance",
        priority: 1,
        approxWidth: 140,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.lastIssuance}</span>,
      },
      {
        id: "daysDormant",
        header: "Dormant",
        alwaysVisible: true,
        approxWidth: 120,
        cell: ({ row }) => (
          <StatusPill
            label={`${row.original.daysDormant}d`}
            tone={row.original.daysDormant >= 90 ? "critical" : "medium"}
          />
        ),
      },
    ],
    [],
  );

  const leastPrivilegeColumns = useMemo<AdaptiveColumn<LeastPrivilegeRow>[]>(
    () => [
      {
        id: "subject",
        header: "Subject",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) => <EntityCell label={row.original.subject} />,
      },
      {
        id: "granted",
        header: "Granted",
        priority: 1,
        approxWidth: 100,
        cell: ({ row }) => <span className="tabular-nums">{row.original.granted}</span>,
      },
      {
        id: "exercised",
        header: "Exercised",
        priority: 1,
        approxWidth: 100,
        cell: ({ row }) => <span className="tabular-nums">{row.original.exercised}</span>,
      },
      {
        id: "unused",
        header: "Unused scopes",
        alwaysVisible: true,
        approxWidth: 320,
        cell: ({ row }) =>
          row.original.unused.length > 0 ? (
            <span className="font-mono text-xs text-(--color-warning-text)">{row.original.unused.join(", ")}</span>
          ) : (
            <span className="text-muted-foreground">Fully exercised</span>
          ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Risk"
      description="Identity risk posture, dormant entitlements, and least-privilege gaps."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className={cn("border-transparent", TONE_CLASSES.critical)}>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              Highest user risk
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-semibold">sarah.chen</span>
              <span className="text-3xl font-bold tabular-nums">91</span>
            </div>
            <a href="#" className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
              View profile →
            </a>
          </CardContent>
        </Card>
        <Card className={cn("border-transparent", TONE_CLASSES.critical)}>
          <CardContent className="py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              Highest agent risk
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-semibold">data-export-bot</span>
              <span className="text-3xl font-bold tabular-nums">91</span>
            </div>
            <a href="#" className="mt-1 inline-block text-xs font-medium underline underline-offset-2">
              View agent →
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="p-0">
            <div className="border-b border-(--color-border-subtle) px-4 py-3">
              <h3 className="text-sm font-semibold text-(--color-text)">Risk Heatmap</h3>
              <p className="text-xs text-muted-foreground">Identity × risk factor</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Identity</th>
                    {RISK_FACTORS.map((factor) => (
                      <th key={factor} className="px-2 py-2 font-medium">
                        {factor}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border-subtle)">
                  {HEATMAP.map((row) => (
                    <tr key={row.identity}>
                      <td className="px-4 py-2 font-mono text-xs">{row.identity}</td>
                      {row.scores.map((score, i) => (
                        <td key={i} className="px-2 py-2">
                          <RiskPill score={score} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-(--color-border-subtle) px-4 py-3">
              <h3 className="text-sm font-semibold text-(--color-text)">Top Risky Entitlements</h3>
            </div>
            <ul className="divide-y divide-(--color-border-subtle)">
              {TOP_RISKY_ENTITLEMENTS.map((ent) => (
                <li key={ent.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-(--color-text)">{ent.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ent.holders} holders · {ent.conflicts > 0 ? `${ent.conflicts} conflicts` : "no conflicts"}
                    </div>
                  </div>
                  <RiskPill score={ent.score} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-(--color-border-subtle) px-4 py-3">
            <h3 className="text-sm font-semibold text-(--color-text)">Dormant Entitlements</h3>
            <p className="text-xs text-muted-foreground">Grants with no matching token issuance in the lookback window.</p>
          </div>
          <TableCard className="border-0 shadow-none">
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="dormant-entitlements"
                data={DORMANT_ENTITLEMENTS}
                columns={dormantColumns}
                enableSelection={false}
                getRowId={(d) => d.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-(--color-border-subtle) px-4 py-3">
            <h3 className="text-sm font-semibold text-(--color-text)">Least Privilege</h3>
            <p className="text-xs text-muted-foreground">Granted scopes vs. scopes actually exercised in issued tokens.</p>
          </div>
          <TableCard className="border-0 shadow-none">
            <CardContent variant="flush">
              <AdaptiveTable
                tableId="least-privilege"
                data={LEAST_PRIVILEGE}
                columns={leastPrivilegeColumns}
                enableSelection={false}
                getRowId={(r) => r.id}
                pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
              />
            </CardContent>
          </TableCard>
        </CardContent>
      </Card>
    </ConsolePage>
  );
}
