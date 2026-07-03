import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { CheckCircle2, Download, ShieldCheck } from "lucide-react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdaptiveTable, type AdaptiveColumn } from "@/components/ui/adaptive-table";
import { EntityCell } from "@/components/console/iam-console";
import { TableCard } from "@/theme/components/cards";
import { cn } from "@/lib/utils";
import { TONE_CLASSES } from "@/features/governance/lib/riskTone";

interface GovernanceAuditEvent {
  id: string;
  timestamp: string;
  eventType: string;
  actor: string;
  subject: string;
  target: string;
  controlTags: string[];
}

const EVENTS: GovernanceAuditEvent[] = [
  { id: "1", timestamp: "2026-07-03 09:14", eventType: "request.approved", actor: "p.shah", subject: "code-reviewer-v2", target: "github-mcp", controlTags: ["SOC2:CC6.1"] },
  { id: "2", timestamp: "2026-07-03 08:52", eventType: "sod.prevented", actor: "system", subject: "data-export-bot", target: "approve:deployment", controlTags: ["SOC2:CC6.3", "ISO27001:A.5.18"] },
  { id: "3", timestamp: "2026-07-02 22:03", eventType: "binding.expired", actor: "expiry_sweep", subject: "s.iqbal", target: "PAM · vault-root", controlTags: ["SOC2:CC6.1"] },
  { id: "4", timestamp: "2026-07-02 17:40", eventType: "lifecycle.leaver", actor: "scim_consumer", subject: "tom.lund@authnull.com", target: "3 role_bindings, 1 client", controlTags: ["ISO27001:A.5.15"] },
  { id: "5", timestamp: "2026-07-01 11:05", eventType: "certification.revoked", actor: "m.okafor", subject: "svc-legacy-etl", target: "VPN Full Tunnel", controlTags: ["SOC2:CC6.1"] },
  { id: "6", timestamp: "2026-06-30 06:00", eventType: "policy.activated", actor: "s.iqbal", subject: "—", target: "Business-hours issuance only", controlTags: ["ISO27001:A.5.15"] },
];

const FRAMEWORKS = ["SOC2", "ISO27001", "GDPR"];
const PERIODS = ["Q1-2026", "Q2-2026", "Q3-2026"];

export default function AuditPage() {
  const [framework, setFramework] = useState(FRAMEWORKS[0]);
  const [period, setPeriod] = useState(PERIODS[2]);
  const [verifying, setVerifying] = useState(false);

  const columns = useMemo<AdaptiveColumn<GovernanceAuditEvent>[]>(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        alwaysVisible: true,
        approxWidth: 160,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.timestamp}</span>,
      },
      {
        id: "eventType",
        header: "Event",
        alwaysVisible: true,
        approxWidth: 200,
        cell: ({ row }) => <Badge variant="outline" className="font-mono">{row.original.eventType}</Badge>,
      },
      {
        id: "actor",
        header: "Actor",
        priority: 1,
        approxWidth: 180,
        cell: ({ row }) => <EntityCell label={row.original.actor} />,
      },
      {
        id: "subject",
        header: "Subject",
        priority: 1,
        approxWidth: 200,
        cell: ({ row }) => row.original.subject,
      },
      {
        id: "target",
        header: "Target",
        priority: 2,
        approxWidth: 220,
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.target}</span>,
      },
      {
        id: "controlTags",
        header: "Controls",
        alwaysVisible: true,
        approxWidth: 220,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.controlTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="font-mono text-[10px]">{tag}</Badge>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <ConsolePage
      title="Audit"
      description="The compliance-grade, hash-chained governance event stream."
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className={cn("border-transparent", TONE_CLASSES.low)}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                <ShieldCheck className="size-3.5" />
                Chain integrity
              </div>
              <div className="mt-1 flex items-center gap-2">
                <CheckCircle2 className="size-4" />
                <span className="text-lg font-semibold">Verified</span>
              </div>
              <p className="mt-1 text-xs opacity-80">Last verified 6 minutes ago · 4,812 events chained</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={verifying}
              onClick={() => {
                setVerifying(true);
                setTimeout(() => {
                  setVerifying(false);
                  toast.success("Chain verified — no gaps or tampering detected.");
                }, 600);
              }}
            >
              {verifying ? "Verifying..." : "Verify Chain"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Auditor export
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={framework} onValueChange={setFramework}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FRAMEWORKS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="text-white"
                size="sm"
                onClick={() => toast.success(`Exporting ${framework} bundle for ${period}...`)}
              >
                <Download className="mr-1.5 size-3.5" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <TableCard>
        <CardContent variant="flush">
          <AdaptiveTable
            tableId="governance-audit-events"
            data={EVENTS}
            columns={columns}
            enableSelection={false}
            getRowId={(e) => e.id}
            pagination={{ pageSize: 20, pageSizeOptions: [20, 50], alwaysVisible: false }}
          />
        </CardContent>
      </TableCard>
    </ConsolePage>
  );
}
