/**
 * Discovery → Add integration → GitHub, end to end.
 *
 * Replaces ConnectGitHubDialog, which could only promote an ALREADY-configured
 * connector into a source and dead-ended to `/connectors` otherwise — a link
 * across a console boundary, since the IGA sidebar has no Connectors entry. The
 * result was that setting up GitHub discovery meant leaving Discovery entirely.
 *
 * This does the whole job in one place: register the workspace App, create the
 * connector, bind the installation, create the source.
 *
 * The connector/source split still exists underneath and still matters — a
 * connector answers "can we reach GitHub at all", a source answers "what are we
 * watching", and collapsing them is how a broken connection gets reported as
 * "0 agents found". This unifies the FLOW without collapsing the MODEL.
 *
 * Step shape follows DeployCollectorWizard (numeric index, inline rail,
 * stepValid array). `src/features/wizards/` is an onboarding-tour framework and
 * is deliberately not used here.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, Github, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateConnectorMutation,
  useGetProviderAppQuery,
  useListConnectorsQuery,
  type Connector,
} from "@/app/api/connectorsApi";
import { useCreateSourceFromConnectorMutation } from "@/app/api/discoveryApi";
import { GitHubAppRegistrationPanel } from "../connectors/GitHubAppRegistrationPanel";
import { GitHubInstallationPanel } from "../connectors/GitHubInstallationPanel";

const STEPS = ["Organisation", "GitHub App", "Install", "Finish"] as const;

export function GitHubSetupWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the new source id so the caller can route to repository selection. */
  onCreated: (sourceId: string) => void;
}) {
  const { data: connectors = [], isLoading: connectorsLoading } = useListConnectorsQuery(
    undefined,
    { skip: !open },
  );
  const { data: appStatus } = useGetProviderAppQuery("github", { skip: !open });
  const [createConnector, { isLoading: creatingConnector }] = useCreateConnectorMutation();
  const [createSource, { isLoading: creatingSource }] = useCreateSourceFromConnectorMutation();

  const [step, setStep] = useState(0);
  // The connector this run is working with — either picked at step 0 or created
  // at step 2. Once set it is NEVER re-created: CreateConnector is not
  // idempotent (unique on workspace+name), so a retry after a later failure
  // would collide and surface a raw 400 about a name the user already accepted.
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [connectorName, setConnectorName] = useState("");
  const [nameError, setNameError] = useState("");
  const [boundThisRun, setBoundThisRun] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const appRegistered = appStatus?.configured === true && !!appStatus.github_app_id;

  const githubConnectors = useMemo(
    () => connectors.filter((c) => c.provider_key === "github"),
    [connectors],
  );
  const connected = useMemo(
    () => githubConnectors.filter((c) => c.connected !== false),
    [githubConnectors],
  );
  // Created but never bound — abandoned partway through a previous run. Offered
  // for resume rather than hidden, so these stay visible and reusable instead of
  // quietly accumulating as unusable rows.
  const unfinished = useMemo(
    () => githubConnectors.filter((c) => c.connected === false),
    [githubConnectors],
  );

  const selectedConnector = githubConnectors.find((c) => c.id === connectorId) ?? null;
  const selectedIsConnected = selectedConnector?.connected !== false;

  const reset = () => {
    setStep(0);
    setConnectorId(null);
    setConnectorName("");
    setNameError("");
    setBoundThisRun(false);
    setDisplayName("");
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  // Nothing to choose between on a first run, so do not show an empty picker.
  useEffect(() => {
    if (open && !connectorsLoading && githubConnectors.length === 0 && step === 0) {
      setStep(appRegistered ? 2 : 1);
    }
  }, [open, connectorsLoading, githubConnectors.length, appRegistered, step]);

  const handleCreateConnector = async () => {
    if (connectorId) return true; // already created this run — never re-create
    if (!connectorName.trim()) {
      setNameError("A name is required.");
      return false;
    }
    setNameError("");
    try {
      const c = await createConnector({
        provider_key: "github",
        name: connectorName.trim(),
        enabled: true,
        agent_accessible: false,
      }).unwrap();
      setConnectorId(c.id);
      return true;
    } catch (err) {
      const raw = (err as { data?: { error?: string } })?.data?.error ?? "";
      // The unique constraint is on (workspace_id, name) and surfaces as a raw
      // DB error. Translate it to the field it actually concerns.
      setNameError(
        /duplicate|unique|already exists/i.test(raw)
          ? "A connector with that name already exists — pick another."
          : raw || "Could not create the connector.",
      );
      return false;
    }
  };

  const handleFinish = async () => {
    if (!connectorId) return;
    try {
      const source = await createSource({
        connector_id: connectorId,
        display_name: displayName.trim() || selectedConnector?.name || undefined,
      }).unwrap();
      toast.success("GitHub integration added");
      onCreated(source.id);
      close();
    } catch (err) {
      toast.error(
        (err as { data?: { error?: string } })?.data?.error ??
          "Could not create the integration.",
      );
    }
  };

  // Indexed by step, matching DeployCollectorWizard's convention.
  const stepValid = [
    connectorId !== null,
    appRegistered,
    connectorId !== null && (boundThisRun || selectedIsConnected),
    connectorId !== null,
  ][step];

  const pickConnector = (c: Connector) => {
    setConnectorId(c.id);
    setDisplayName(c.name);
    // A connector that is already bound needs neither registration nor install.
    if (c.connected !== false) setStep(3);
    else setStep(appRegistered ? 2 : 1);
  };

  const advance = async () => {
    if (step === 0) {
      setStep(appRegistered ? 2 : 1);
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    await handleFinish();
  };

  const back = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(appRegistered && githubConnectors.length === 0 ? 0 : 1);
    else setStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="size-4" />
            Add GitHub
          </DialogTitle>
          <DialogDescription>
            Discovers AI agents declared in the repositories you grant — CI/CD workflows,
            agent manifests, MCP configuration, containers and infrastructure code.
          </DialogDescription>
        </DialogHeader>

        {/* Step rail. Step 1 is genuinely skippable, so it renders as already-done
            rather than being removed — a rail whose numbering shifts between runs
            is harder to follow than one with a satisfied step in it. */}
        <ol className="flex items-center gap-1.5 py-1 text-[11px]">
          {STEPS.map((label, i) => {
            const done = i < step || (i === 1 && appRegistered);
            return (
              <li key={label} className="flex items-center gap-1.5">
                <span
                  className={`flex size-4 items-center justify-center rounded-full text-[9px] font-medium ${
                    i === step
                      ? "bg-(--color-primary) text-white"
                      : done
                        ? "bg-(--color-success-soft) text-(--color-success-text)"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done && i !== step ? "✓" : i + 1}
                </span>
                <span className={i === step ? "font-medium" : "text-muted-foreground"}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <span className="text-muted-foreground">›</span>}
              </li>
            );
          })}
        </ol>

        <div className="space-y-3 py-1">
          {step === 0 && (
            <div className="space-y-2">
              <Label>Which GitHub organisation?</Label>
              {connected.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickConnector(c)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    connectorId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {typeof c.config?.org_name === "string"
                        ? c.config.org_name
                        : "Connected"}
                    </span>
                  </span>
                  <Check className="size-3.5 shrink-0 text-(--color-success-text)" />
                </button>
              ))}

              {unfinished.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickConnector(c)}
                  className="flex w-full items-center justify-between rounded-md border border-dashed px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-(--color-warning-text)">
                      Setup unfinished — resume
                    </span>
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setConnectorId(null);
                  setStep(appRegistered ? 2 : 1);
                }}
                className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm hover:bg-muted/50"
              >
                <Plus className="size-3.5" />
                Connect a different organisation
              </button>
            </div>
          )}

          {step === 1 && (
            <GitHubAppRegistrationPanel
              registered={appRegistered}
              registeredAppId={appStatus?.github_app_id}
            />
          )}

          {step === 2 && (
            <div className="space-y-3">
              {!connectorId && (
                <div className="space-y-1.5">
                  <Label htmlFor="gh-connector-name">Name this connection</Label>
                  <Input
                    id="gh-connector-name"
                    value={connectorName}
                    onChange={(e) => setConnectorName(e.target.value)}
                    placeholder="e.g. acme-eng GitHub"
                  />
                  {nameError ? (
                    <p className="text-[11px] text-(--color-danger-text)">{nameError}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Unique within this workspace.
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCreateConnector()}
                    disabled={creatingConnector || !connectorName.trim()}
                  >
                    {creatingConnector ? "Creating…" : "Create and continue"}
                  </Button>
                </div>
              )}

              {connectorId && (
                <GitHubInstallationPanel
                  connectorId={connectorId}
                  appRegistered={appRegistered}
                  onConnected={() => {
                    setBoundThisRun(true);
                    setStep(3);
                  }}
                />
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-1.5">
              <Label htmlFor="gh-display-name">Name in discovery</Label>
              <Input
                id="gh-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={selectedConnector?.name ?? "Acme GitHub"}
              />
              <p className="text-[11px] text-muted-foreground">
                Optional. Nothing is scanned yet — you choose the repositories on the next
                screen, then run the first scan.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={step === 0 ? close : back}>
            {step === 0 ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={() => void advance()}
            disabled={!stepValid || creatingSource}
            className="text-[length:var(--text-sm)] text-white"
          >
            {step === 3
              ? creatingSource
                ? "Adding…"
                : "Add integration"
              : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
