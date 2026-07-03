import { useMemo, useState } from "react";
import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/theme/components/cards";
import { EntityCell, VerdictCard } from "@/components/console/iam-console";
import { StatusPill } from "@/features/governance/components/StatusPill";
import type { Tone } from "@/features/governance/lib/riskTone";

type Level = "Critical" | "High" | "Medium";

const LEVEL_TONE: Record<Level, Tone> = {
  Critical: "critical",
  High: "high",
  Medium: "medium",
};

interface Rule {
  id: string;
  roleA: string;
  roleB: string;
  level: Level;
  violations: number;
  checked: string;
}

const RULEBOOK: Rule[] = [
  { id: "1", roleA: "Finance-Approve", roleB: "Finance-Create", level: "Critical", violations: 6, checked: "2h ago" },
  { id: "2", roleA: "Payroll-Admin", roleB: "Payroll-Audit", level: "Critical", violations: 2, checked: "2h ago" },
  { id: "3", roleA: "Vendor-Create", roleB: "Payment-Release", level: "High", violations: 3, checked: "5h ago" },
  { id: "4", roleA: "Dev-Deploy", roleB: "Prod-Approve", level: "High", violations: 2, checked: "1d ago" },
  { id: "5", roleA: "User-Admin", roleB: "Audit-Reader", level: "Medium", violations: 1, checked: "1d ago" },
];

const ROLE_OPTIONS = Array.from(
  new Set(RULEBOOK.flatMap((rule) => [rule.roleA, rule.roleB])),
).sort();

const VIOLATIONS = [
  { id: "1", identity: "sarah.chen@authnull.com", rule: "Finance-Approve + Finance-Create", level: "Critical" as Level, detected: "2h ago", status: "Open" },
  { id: "2", identity: "liam.brooks@authnull.com", rule: "Payroll-Admin + Payroll-Audit", level: "Critical" as Level, detected: "2h ago", status: "Open" },
  { id: "3", identity: "raj.patel@authnull.com", rule: "Vendor-Create + Payment-Release", level: "High" as Level, detected: "5h ago", status: "Under review" },
  { id: "4", identity: "tom.lund@authnull.com", rule: "Dev-Deploy + Prod-Approve", level: "High" as Level, detected: "1d ago", status: "Open" },
  { id: "5", identity: "priya.nair@authnull.com", rule: "User-Admin + Audit-Reader", level: "Medium" as Level, detected: "1d ago", status: "Exception granted" },
];

const EXCEPTIONS = [
  { id: "1", identity: "sarah.chen@authnull.com", rule: "Vendor-Create + Payment-Release", approver: "s.iqbal", expires: "Jul 15" },
  { id: "2", identity: "priya.nair@authnull.com", rule: "User-Admin + Audit-Reader", approver: "m.okafor", expires: "Aug 01" },
];

export default function SodPage() {
  const [roleA, setRoleA] = useState<string>(ROLE_OPTIONS[0]);
  const [roleB, setRoleB] = useState<string>(ROLE_OPTIONS[1]);
  const [checked, setChecked] = useState(false);

  const conflict = useMemo(
    () =>
      RULEBOOK.find(
        (rule) =>
          (rule.roleA === roleA && rule.roleB === roleB) ||
          (rule.roleA === roleB && rule.roleB === roleA),
      ),
    [roleA, roleB],
  );

  return (
    <ConsolePage
      title="Segregation of Duties"
      description="Toxic-combination rules, violation detection, simulation, and exceptions."
    >
      <Tabs defaultValue="rulebook">
        <TabsList>
          <TabsTrigger value="rulebook">Rulebook</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        <TabsContent value="rulebook">
          <TableCard>
            <CardContent variant="flush">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border-subtle) text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Role A</th>
                    <th className="px-4 py-2.5 font-medium">Role B</th>
                    <th className="px-4 py-2.5 font-medium">Level</th>
                    <th className="px-4 py-2.5 font-medium">Violations</th>
                    <th className="px-4 py-2.5 font-medium">Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border-subtle)">
                  {RULEBOOK.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-4 py-3 font-mono text-xs">{rule.roleA}</td>
                      <td className="px-4 py-3 font-mono text-xs">{rule.roleB}</td>
                      <td className="px-4 py-3">
                        <StatusPill label={rule.level} tone={LEVEL_TONE[rule.level]} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-(--color-danger-text)">{rule.violations}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rule.checked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="violations">
          <TableCard>
            <CardContent variant="flush">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border-subtle) text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Identity</th>
                    <th className="px-4 py-2.5 font-medium">Rule</th>
                    <th className="px-4 py-2.5 font-medium">Level</th>
                    <th className="px-4 py-2.5 font-medium">Detected</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border-subtle)">
                  {VIOLATIONS.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3">
                        <EntityCell label={v.identity} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{v.rule}</td>
                      <td className="px-4 py-3">
                        <StatusPill label={v.level} tone={LEVEL_TONE[v.level]} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{v.detected}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </TableCard>
        </TabsContent>

        <TabsContent value="simulator">
          <Card className="max-w-xl">
            <CardContent className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Test a proposed access grant against the rulebook before it's approved.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Role A</label>
                  <Select value={roleA} onValueChange={(v) => { setRoleA(v); setChecked(false); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Role B</label>
                  <Select value={roleB} onValueChange={(v) => { setRoleB(v); setChecked(false); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="text-white" onClick={() => setChecked(true)} disabled={roleA === roleB}>
                Check conflict
              </Button>
              {checked && (
                <VerdictCard
                  verdict={conflict ? "deny" : "allow"}
                  title={conflict ? `Conflict — ${conflict.level}` : "No conflict"}
                  body={
                    conflict
                      ? `${roleA} and ${roleB} match the "${conflict.roleA} + ${conflict.roleB}" rule. This combination should not be granted to one identity.`
                      : `${roleA} and ${roleB} do not match any rule in the SoD rulebook.`
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exceptions">
          <TableCard>
            <CardContent variant="flush">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border-subtle) text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Identity</th>
                    <th className="px-4 py-2.5 font-medium">Rule</th>
                    <th className="px-4 py-2.5 font-medium">Approver</th>
                    <th className="px-4 py-2.5 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border-subtle)">
                  {EXCEPTIONS.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3">
                        <EntityCell label={e.identity} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.rule}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.approver}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.expires}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </TableCard>
        </TabsContent>
      </Tabs>
    </ConsolePage>
  );
}
