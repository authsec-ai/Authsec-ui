/**
 * Governance → Separation of Duties
 *
 * Rules that flag conflicting or prohibited combinations of authority. Three
 * surfaces: the simulate panel (what would the rules flag for this subject right
 * now, without enforcing anything), the rule catalogue, and open violations to
 * resolve. Simulate comes first because it is how you check a rule's blast radius
 * against live data before trusting it.
 *
 * SoDDecision splits `blocking` (preventive rules) from `warnings` (detective) —
 * that distinction survives into the UI, and each hit's human-written explanation
 * is rendered in full, never truncated to a rule name.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

import { ConsolePage } from "@/components/console/ConsolePage";
import { Card, CardContent } from "@/components/ui/card";
import { TableCard } from "@/theme/components/cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { EntityCell } from "@/components/console/iam-console";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  governanceError,
  useListSoDRulesQuery,
  useListSoDViolationsQuery,
  useSimulateSoDMutation,
  useResolveSoDViolationMutation,
  useScanSoDMutation,
  type SoDRule,
  type SoDViolation,
  type SoDHit,
  type SoDDecision,
} from "@/app/api/governanceApi";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium";

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-(--color-warning-soft) text-(--color-warning-text)",
  high: "bg-(--color-danger-soft) text-(--color-danger-text)",
  critical: "bg-(--color-danger-soft) text-(--color-danger-text)",
};

function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function HitList({ title, hits, tone }: { title: string; hits: SoDHit[]; tone: "block" | "warn" }) {
  if (hits.length === 0) return null;
  return (
    <div className="space-y-2">
      <div
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          tone === "block" ? "text-(--color-danger-text)" : "text-(--color-warning-text)"
        }`}
      >
        {title}
      </div>
      {hits.map((h) => (
        <div
          key={h.rule_id}
          className={`rounded-md border-l-2 px-3 py-2 text-xs ${
            tone === "block"
              ? "border-l-(--color-danger-text) bg-(--color-danger-soft)"
              : "border-l-(--color-warning-text) bg-(--color-warning-soft)"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{h.rule_name}</span>
            <span className={`${PILL} ${SEVERITY_STYLE[h.severity] ?? "bg-muted"}`}>
              {h.severity}
            </span>
          </div>
          {/* Written for a human deciding what to do — render it in full. */}
          <p className="mt-1 text-foreground/80">{h.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function SimulatePanel() {
  const [subjectType, setSubjectType] = useState("user");
  const [subjectId, setSubjectId] = useState("");
  const [addRoles, setAddRoles] = useState("");
  const [addPermissions, setAddPermissions] = useState("");
  const [result, setResult] = useState<SoDDecision | null>(null);
  const [simulate, { isLoading: running }] = useSimulateSoDMutation();

  const run = async () => {
    try {
      const r = await simulate({
        subject_type: subjectType,
        ...(subjectId.trim() ? { subject_id: subjectId.trim() } : {}),
        ...(parseList(addRoles).length ? { add_roles: parseList(addRoles) } : {}),
        ...(parseList(addPermissions).length
          ? { add_permissions: parseList(addPermissions) }
          : {}),
      }).unwrap();
      setResult(r);
    } catch (err) {
      toast.error(governanceError(err, "Could not run the simulation."));
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold">Simulate</h3>
          <p className="text-xs text-muted-foreground">
            Evaluate the live rules against a subject — optionally with roles or permissions added
            — without changing anything. This is how you check a rule&apos;s blast radius before
            relying on it.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sim-type">Subject type</Label>
            <Select value={subjectType} onValueChange={setSubjectType}>
              <SelectTrigger id="sim-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="service_account">Service account</SelectItem>
                <SelectItem value="oauth_client">OAuth client</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sim-id">Subject id (optional)</Label>
            <Input
              id="sim-id"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Leave empty to evaluate the added grants alone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sim-roles">Add roles</Label>
            <Input
              id="sim-roles"
              value={addRoles}
              onChange={(e) => setAddRoles(e.target.value)}
              placeholder="role-a, role-b"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sim-perms">Add permissions</Label>
            <Input
              id="sim-perms"
              value={addPermissions}
              onChange={(e) => setAddPermissions(e.target.value)}
              placeholder="payments:approve"
              className="font-mono text-xs"
            />
          </div>
        </div>
        <Button
          className="text-[length:var(--text-sm)] text-white"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? "Simulating…" : "Simulate"}
        </Button>

        {result ? (
          <div className="space-y-3 border-t pt-3">
            <div
              className={`${PILL} ${
                result.allowed
                  ? "bg-(--color-success-soft) text-(--color-success-text)"
                  : "bg-(--color-danger-soft) text-(--color-danger-text)"
              }`}
            >
              {result.allowed ? "Allowed" : "Blocked"}
            </div>
            <HitList title="Blocking" hits={result.blocking ?? []} tone="block" />
            <HitList title="Warnings" hits={result.warnings ?? []} tone="warn" />
            {!result.blocking?.length && !result.warnings?.length ? (
              <p className="text-xs text-muted-foreground">No rule flags this combination.</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResolveViolationDialog({
  violation,
  open,
  onOpenChange,
}: {
  violation: SoDViolation | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [resolution, setResolution] = useState<"accepted" | "remediated">("remediated");
  const [note, setNote] = useState("");
  const [resolve, { isLoading: saving }] = useResolveSoDViolationMutation();

  const needsNote = resolution === "accepted" && !note.trim();

  const submit = async () => {
    if (!violation || needsNote) return;
    try {
      await resolve({ id: violation.id, resolution, note: note.trim() }).unwrap();
      toast.success("Violation resolved.");
      setNote("");
      onOpenChange(false);
    } catch (err) {
      toast.error(governanceError(err, "Could not resolve the violation."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve violation</DialogTitle>
          <DialogDescription>
            {violation?.rule_name} — {violation?.subject_label || violation?.subject_id}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="rv-res">Resolution</Label>
            <Select
              value={resolution}
              onValueChange={(v) => setResolution(v as "accepted" | "remediated")}
            >
              <SelectTrigger id="rv-res">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remediated">Remediated (the conflict was removed)</SelectItem>
                <SelectItem value="accepted">Accepted (a human signed off on it)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rv-note">
              Note{resolution === "accepted" ? " (required to accept)" : " (optional)"}
            </Label>
            <Textarea
              id="rv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                resolution === "accepted"
                  ? "Why this conflict is acceptable, and who approved it."
                  : "How the conflict was removed."
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="text-[length:var(--text-sm)] text-white"
            disabled={needsNote || saving}
            onClick={() => void submit()}
          >
            {saving ? "Resolving…" : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SoDPage() {
  const { data: rulesData } = useListSoDRulesQuery();
  const { data: violationsData, refetch: refetchViolations } = useListSoDViolationsQuery({
    open: true,
  });
  const [scan, { isLoading: scanning }] = useScanSoDMutation();
  const [resolveTarget, setResolveTarget] = useState<SoDViolation | null>(null);

  const rules = useMemo(() => rulesData?.items ?? [], [rulesData]);
  const violations = useMemo(() => violationsData?.items ?? [], [violationsData]);

  const runScan = async () => {
    try {
      const r = await scan().unwrap();
      toast.success(
        `Scan complete: ${r.violations_new} new, ${r.violations_cleared} cleared, ${r.violations_open} open.`,
      );
      void refetchViolations();
    } catch (err) {
      toast.error(governanceError(err, "Could not run the scan."));
    }
  };

  const ruleColumns: AdaptiveColumn<SoDRule>[] = [
    {
      id: "name",
      header: "Rule",
      alwaysVisible: true,
      approxWidth: 260,
      cell: ({ row }) => (
        <EntityCell label={row.original.name} detail={row.original.description || undefined} />
      ),
    },
    {
      id: "severity",
      header: "Severity",
      priority: 1,
      approxWidth: 110,
      cell: ({ row }) => (
        <span className={`${PILL} ${SEVERITY_STYLE[row.original.severity] ?? "bg-muted"}`}>
          {row.original.severity}
        </span>
      ),
    },
    {
      id: "enforcement",
      header: "Enforcement",
      priority: 2,
      approxWidth: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.enforcement === "preventive" ? "Preventive (block)" : "Detective (warn)"}
        </span>
      ),
    },
    {
      id: "scope",
      header: "Scope",
      priority: 3,
      approxWidth: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.subject_scope}</span>
      ),
    },
    {
      id: "system",
      header: "",
      priority: 4,
      approxWidth: 90,
      cell: ({ row }) =>
        row.original.is_system ? (
          <span className={`${PILL} bg-muted text-muted-foreground`}>Built-in</span>
        ) : null,
    },
  ];

  const violationColumns: AdaptiveColumn<SoDViolation>[] = [
    {
      id: "rule",
      header: "Rule",
      alwaysVisible: true,
      approxWidth: 200,
      cell: ({ row }) => <span className="text-xs font-medium text-foreground">{row.original.rule_name}</span>,
    },
    {
      id: "subject",
      header: "Subject",
      priority: 1,
      approxWidth: 200,
      cell: ({ row }) => (
        <div className="max-w-[190px]">
          <div className="truncate text-xs text-foreground">
            {row.original.subject_label || row.original.subject_id}
          </div>
          <div className="text-[11px] text-muted-foreground">{row.original.subject_type}</div>
        </div>
      ),
    },
    {
      id: "detected",
      header: "Detected",
      priority: 3,
      approxWidth: 140,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.original.detected_at), { addSuffix: true })}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      alwaysVisible: true,
      approxWidth: 110,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setResolveTarget(row.original)}>
            Resolve
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ConsolePage
      title="Separation of Duties"
      description="Rules that flag conflicting or prohibited combinations of authority. Simulate a change before you trust a rule; resolve the violations it surfaces."
      actions={
        <Button variant="outline" disabled={scanning} onClick={() => void runScan()}>
          {scanning ? "Scanning…" : "Run scan"}
        </Button>
      }
    >
      <SimulatePanel />

      <div>
        <h2 className="mb-2 mt-2 text-sm font-semibold">
          Open violations {violations.length > 0 ? `(${violations.length})` : ""}
        </h2>
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="sod-violations"
              columns={violationColumns}
              data={violations}
              getRowId={(v) => v.id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50], alwaysVisible: false }}
            />
          </CardContent>
        </TableCard>
      </div>

      <div>
        <h2 className="mb-2 mt-2 text-sm font-semibold">Rules</h2>
        <TableCard>
          <CardContent variant="flush">
            <AdaptiveTable
              tableId="sod-rules"
              columns={ruleColumns}
              data={rules}
              getRowId={(r) => r.id}
              enableSelection={false}
              enableExpansion={false}
              pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50], alwaysVisible: false }}
            />
          </CardContent>
        </TableCard>
      </div>

      <ResolveViolationDialog
        violation={resolveTarget}
        open={resolveTarget !== null}
        onOpenChange={(o) => !o && setResolveTarget(null)}
      />
    </ConsolePage>
  );
}
