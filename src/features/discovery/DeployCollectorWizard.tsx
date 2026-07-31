/**
 * Deploy Kubernetes collector — PROTOTYPE, five steps.
 *
 * The control plane does not deploy anything. It generates scan config, the
 * minimum RBAC for that config, and a one-time enrollment token; an operator
 * applies it with Helm; the collector dials out. So the wizard ends in a
 * copy-paste command and a wait, not a "Deploy" action.
 *
 * Scan config is fetched by the collector on heartbeat, so changing it later
 * never requires a redeploy.
 */

import { useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_COLLECTOR_CONFIG,
  WORKLOAD_KINDS,
  generateClusterRole,
  helmInstallCommand,
  useCreateDiscoverySourceMutation,
  type CollectorConfig,
  type NamespaceMode,
} from "@/app/api/discoveryApi";

const STEPS = ["Cluster", "Scope", "Detection", "Schedule", "Install"] as const;

const RESYNC_OPTIONS = [
  { value: "5", label: "Every 5 minutes" },
  { value: "15", label: "Every 15 minutes" },
  { value: "60", label: "Every hour" },
  { value: "360", label: "Every 6 hours" },
  { value: "1440", label: "Every 24 hours" },
];

/** Comma / newline separated input → trimmed list. */
function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function ListField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={raw}
        placeholder={placeholder}
        className="font-mono text-xs"
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(parseList(e.target.value));
        }}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

export function DeployCollectorWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [createSource, { isLoading: saving }] = useCreateDiscoverySourceMutation();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [stage, setStage] = useState("production");
  const [apiServer, setApiServer] = useState("");
  const [config, setConfig] = useState<CollectorConfig>(DEFAULT_COLLECTOR_CONFIG);
  const [waiting, setWaiting] = useState(false);

  const token = useMemo(
    () => `ent_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const set = <K extends keyof CollectorConfig>(key: K, value: CollectorConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const setDetection = <K extends keyof CollectorConfig["detection"]>(
    key: K,
    value: CollectorConfig["detection"][K],
  ) => setConfig((prev) => ({ ...prev, detection: { ...prev.detection, [key]: value } }));

  const rbac = useMemo(() => generateClusterRole(config), [config]);
  const helm = useMemo(() => helmInstallCommand(displayName, token), [displayName, token]);

  const detectionRuleCount =
    config.detection.labelSelectors.length +
    config.detection.imagePatterns.length +
    config.detection.envPatterns.length +
    config.detection.configPaths.length;

  const stepValid = [
    displayName.trim().length > 0,
    config.kinds.length > 0 &&
      (config.namespaceMode !== "include" || config.namespaces.length > 0),
    detectionRuleCount > 0,
    true,
    true,
  ][step];

  const reset = () => {
    setStep(0);
    setDisplayName("");
    setStage("production");
    setApiServer("");
    setConfig(DEFAULT_COLLECTOR_CONFIG);
    setWaiting(false);
  };

  const finish = async () => {
    try {
      await createSource({
        kind: "k8s_webhook",
        display_name: displayName.trim(),
        enabled: true,
        config: {
          stage,
          api_server: apiServer.trim() || undefined,
          namespace_mode: config.namespaceMode,
          namespaces: config.namespaces,
          kinds: config.kinds,
          detection: config.detection,
          watch: config.watchEnabled,
          resync_minutes: config.resyncMinutes,
          heartbeat_seconds: config.heartbeatSeconds,
          resources: {
            cpu_request: config.cpuRequest,
            mem_request: config.memRequest,
            cpu_limit: config.cpuLimit,
            mem_limit: config.memLimit,
          },
        },
      }).unwrap();
      toast.success(
        `${displayName.trim()} registered. It will report sightings once the collector connects.`,
      );
      onCreated();
      reset();
      onOpenChange(false);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      toast.error(
        status === 403
          ? "Your role is missing the discovery:admin permission."
          : status === 409
            ? "A Kubernetes integration with that name already exists."
            : "Could not register the cluster.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Deploy Kubernetes collector</DialogTitle>
          <DialogDescription>
            AuthSec generates the config and the minimum RBAC it needs. You install it in
            the cluster; the collector connects outbound. AuthSec never holds cluster
            credentials.
          </DialogDescription>
        </DialogHeader>

        {/* Step rail */}
        <ol className="flex items-center gap-1.5 py-1 text-[11px]">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className={
                  i === step
                    ? "flex size-5 items-center justify-center rounded-full bg-(--color-primary) text-[10px] font-semibold text-white"
                    : i < step
                      ? "flex size-5 items-center justify-center rounded-full bg-(--color-success-soft) text-[10px] font-semibold text-(--color-success-text)"
                      : "flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                }
              >
                {i < step ? "✓" : i + 1}
              </span>
              <span className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
              {i < STEPS.length - 1 ? <span className="text-muted-foreground">›</span> : null}
            </li>
          ))}
        </ol>

        <div className="space-y-4 py-2">
          {/* 1 — Cluster */}
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="cl-name">Cluster name</Label>
                <Input
                  id="cl-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="prod-eks-us-east"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cl-stage">Deployment stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger id="cl-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Drives risk on anything found here. A production agent without an owner is
                  a different finding from a dev one.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cl-api">API server URL (optional)</Label>
                <Input
                  id="cl-api"
                  value={apiServer}
                  onChange={(e) => setApiServer(e.target.value)}
                  placeholder="https://ABC123.gr7.us-east-1.eks.amazonaws.com"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Used only to correlate findings to a known cluster. Not connected to.
                </p>
              </div>
            </>
          ) : null}

          {/* 2 — Scope */}
          {step === 1 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="sc-mode">Namespaces</Label>
                <Select
                  value={config.namespaceMode}
                  onValueChange={(v) => set("namespaceMode", v as NamespaceMode)}
                >
                  <SelectTrigger id="sc-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All namespaces</SelectItem>
                    <SelectItem value="include">Only these namespaces</SelectItem>
                    <SelectItem value="exclude">All except these</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.namespaceMode !== "all" ? (
                <ListField
                  id="sc-ns"
                  label={config.namespaceMode === "include" ? "Include" : "Exclude"}
                  value={config.namespaces}
                  onChange={(v) => set("namespaces", v)}
                  placeholder="agents, ml, payments"
                  hint={
                    config.namespaceMode === "include"
                      ? "Generates namespace-scoped Roles instead of a ClusterRole — least privilege."
                      : "Still needs a ClusterRole, since the collector must list namespaces to know what to skip."
                  }
                />
              ) : null}

              <div className="space-y-2">
                <Label>Workload kinds</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
                  {WORKLOAD_KINDS.map((kind) => (
                    <label key={kind} className="flex items-center gap-2 text-xs">
                      <Checkbox
                        checked={config.kinds.includes(kind)}
                        onCheckedChange={(checked) =>
                          set(
                            "kinds",
                            checked
                              ? [...config.kinds, kind]
                              : config.kinds.filter((k) => k !== kind),
                          )
                        }
                      />
                      <span className="font-mono">{kind}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  This selection is what generates the RBAC in step 5. Watching Pods is the
                  most expensive option in a large cluster.
                </p>
              </div>
            </>
          ) : null}

          {/* 3 — Detection */}
          {step === 2 ? (
            <>
              <p className="text-xs text-muted-foreground">
                A workload is a candidate when it matches any rule below. Signals are
                recorded per match, so a reviewer can see why something was flagged.
              </p>
              <ListField
                id="dt-labels"
                label="Label selectors"
                value={config.detection.labelSelectors}
                onChange={(v) => setDetection("labelSelectors", v)}
                placeholder="authsec.io/agent=true"
                hint="Strongest signal — an explicit declaration by whoever deployed it."
              />
              <ListField
                id="dt-images"
                label="Image patterns"
                value={config.detection.imagePatterns}
                onChange={(v) => setDetection("imagePatterns", v)}
                placeholder="*langchain*, *openai*"
              />
              <ListField
                id="dt-env"
                label="Environment variable patterns"
                value={config.detection.envPatterns}
                onChange={(v) => setDetection("envPatterns", v)}
                placeholder="OPENAI_*, ANTHROPIC_*, MCP_*"
                hint="Names only. Values are never read."
              />
              <ListField
                id="dt-paths"
                label="Mounted config paths"
                value={config.detection.configPaths}
                onChange={(v) => setDetection("configPaths", v)}
                placeholder="mcp.json, .mcp/"
              />
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="dt-low">Report single-signal matches</Label>
                  <p className="text-xs text-muted-foreground">
                    On: one weak signal raises a low-confidence candidate. Off: two or more
                    signals required.
                  </p>
                </div>
                <Switch
                  id="dt-low"
                  checked={config.detection.reportLowConfidence}
                  onCheckedChange={(v) => setDetection("reportLowConfidence", v)}
                />
              </div>
            </>
          ) : null}

          {/* 4 — Schedule */}
          {step === 3 ? (
            <>
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="sch-watch">Real-time watch</Label>
                  <p className="text-xs text-muted-foreground">
                    Reports a new workload within seconds. Read-only informers — not an
                    admission webhook, so it can never block a deployment.
                  </p>
                </div>
                <Switch
                  id="sch-watch"
                  checked={config.watchEnabled}
                  onCheckedChange={(v) => set("watchEnabled", v)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sch-resync">Full resync</Label>
                <Select
                  value={String(config.resyncMinutes)}
                  onValueChange={(v) => set("resyncMinutes", Number(v))}
                >
                  <SelectTrigger id="sch-resync">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESYNC_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Catches anything the watch missed and detects removals. Watch alone cannot
                  prove something is gone.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="sch-cpu-r">CPU request</Label>
                  <Input
                    id="sch-cpu-r"
                    value={config.cpuRequest}
                    onChange={(e) => set("cpuRequest", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sch-mem-r">Memory request</Label>
                  <Input
                    id="sch-mem-r"
                    value={config.memRequest}
                    onChange={(e) => set("memRequest", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sch-cpu-l">CPU limit</Label>
                  <Input
                    id="sch-cpu-l"
                    value={config.cpuLimit}
                    onChange={(e) => set("cpuLimit", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sch-mem-l">Memory limit</Label>
                  <Input
                    id="sch-mem-l"
                    value={config.memLimit}
                    onChange={(e) => set("memLimit", e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Scan settings are fetched by the collector on each heartbeat, so changing
                any of this later takes effect within one heartbeat — no redeploy.
              </p>
            </>
          ) : null}

          {/* 5 — Install */}
          {step === 4 ? (
            <>
              <div className="rounded-md border px-3 py-2.5 text-xs">
                <div className="font-medium text-foreground">
                  What this ServiceAccount can do
                </div>
                <p className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {config.kinds.length} kind{config.kinds.length === 1 ? "" : "s"}
                  </span>{" "}
                  with <span className="font-mono">get, list, watch</span> only. It cannot
                  read Secrets or ConfigMap values, cannot exec into pods, cannot read logs,
                  and has no create, update or delete verb anywhere.
                </p>
              </div>

              <CodeBlock label="RBAC" code={rbac} />
              <CodeBlock label="Install" code={helm} />

              <div className="space-y-1.5">
                <Label>Enrollment token</Label>
                <div className="rounded-md bg-muted px-3 py-2 font-mono text-[11px]">
                  {token}
                </div>
                <p className="text-xs text-muted-foreground">
                  Single use, expires in 24 hours. It authenticates the collector once, then
                  it swaps to its own rotating identity.
                </p>
              </div>

              {waiting ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Waiting for the collector to connect… this pane updates on first heartbeat.
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              className="text-[length:var(--text-sm)] text-white"
              disabled={!stepValid}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWaiting(true)} disabled={waiting}>
                I&apos;ve run the install
              </Button>
              <Button
                className="text-[length:var(--text-sm)] text-white"
                disabled={saving}
                onClick={() => void finish()}
              >
                {saving ? "Saving…" : "Done"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
