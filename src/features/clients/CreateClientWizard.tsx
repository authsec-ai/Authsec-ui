// CreateClientWizard — 3-step Sheet for pre-registering an OAuth client
//
// Usage:
//   <CreateClientWizard open={open} onOpenChange={setOpen} onCreated={refetch} />

import React, { useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle,
  ChevronRight,
  Info,
  Loader2,
  Monitor,
  Settings,
  Shield,
  Terminal,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FormField, FormInput, FormCopyField } from "@/theme";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { useListApplicationsQuery } from "@/app/api/applicationsApi";
import {
  usePreRegisterResourceServerClientMutation,
  type PreRegisterResourceServerClientRequest,
} from "@/app/api/resourceServersApi";

// ─── Wizard steps (canonical WIZARD_STEPS pattern) ───────────────────────────

const WIZARD_STEPS = [
  { id: "configuration", label: "Configuration", icon: Settings },
  { id: "identity", label: "Identity", icon: Shield },
  { id: "review", label: "Review", icon: CheckCircle },
];

// ─── Client kind definitions ─────────────────────────────────────────────────

type ClientKind = "agent" | "human_app" | "m2m" | "cli";

const KIND_TILES: Array<{
  value: ClientKind;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "agent",
    title: "AI Agent",
    description: "Autonomous agents like Claude Code, Cursor, Copilot",
    icon: Bot,
  },
  {
    value: "human_app",
    title: "Human App",
    description: "Web or desktop apps used by people",
    icon: Users,
  },
  {
    value: "m2m",
    title: "Machine-to-Machine",
    description: "Backend services, daemons, integrations",
    icon: Monitor,
  },
  {
    value: "cli",
    title: "CLI Tool",
    description: "Command-line tools and scripts",
    icon: Terminal,
  },
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormData {
  applicationId: string;
  clientName: string;
  softwareId: string;
  clientKind: ClientKind;
  redirectUris: string;
}

const INITIAL_FORM: FormData = {
  applicationId: "",
  clientName: "",
  softwareId: "",
  clientKind: "agent",
  redirectUris: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateClientWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateClientWizard({
  open,
  onOpenChange,
  onCreated,
}: CreateClientWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  // Returned client_id after successful save
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data: applications = [], isLoading: appsLoading } =
    useListApplicationsQuery({} as void);

  const [preRegister, { isLoading: isSaving }] =
    usePreRegisterResourceServerClientMutation();

  // ─── Derived ────────────────────────────────────────────────────────────────

  const appOptions = useMemo(
    () =>
      applications.map((a) => ({
        value: a.id,
        label: a.name,
        description: a.public_base_url,
      })),
    [applications],
  );

  const selectedApp = useMemo(
    () => applications.find((a) => a.id === formData.applicationId),
    [applications, formData.applicationId],
  );

  const currentStep = WIZARD_STEPS[currentStepIndex];

  // ─── Navigation ─────────────────────────────────────────────────────────────

  const canProceed = () => {
    if (currentStepIndex === 0) {
      return Boolean(formData.applicationId && formData.clientName.trim());
    }
    if (currentStepIndex === 1) {
      return Boolean(formData.clientKind);
    }
    return Boolean(formData.applicationId && formData.clientName.trim());
  };

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    } else {
      onOpenChange(false);
    }
  }, [currentStepIndex, onOpenChange]);

  const handleNext = useCallback(() => {
    if (currentStepIndex === 0) {
      if (!formData.applicationId) {
        toast.error("Select an application");
        return;
      }
      if (!formData.clientName.trim()) {
        toast.error("Client name is required");
        return;
      }
    }
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [currentStepIndex, formData]);

  const handleSave = async () => {
    if (!formData.applicationId) return;

    const redirectUriList = formData.redirectUris
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const body = {
      client_name: formData.clientName,
      redirect_uris: redirectUriList,
      // Cast to any: backend now accepts client_kind + software_id on this
      // endpoint even though the TS type (PreRegisterResourceServerClientRequest)
      // doesn't declare them yet.
      client_kind: formData.clientKind,
      ...(formData.softwareId ? { software_id: formData.softwareId } : {}),
    } as PreRegisterResourceServerClientRequest & {
      client_kind: ClientKind;
      software_id?: string;
    };

    try {
      const result = await preRegister({
        id: formData.applicationId,
        body: body as any,
      }).unwrap();

      setCreatedClientId(result.client_id);
      // Backend may include registration_access_token as an extra field
      const anyResult = result as any;
      if (anyResult.registration_access_token) {
        setCreatedToken(anyResult.registration_access_token as string);
      }
    } catch (err: any) {
      const msg = err?.data?.error ?? "";
      if (typeof msg === "string" && msg.toLowerCase().includes("does not allow pre-registration")) {
        toast.error(
          "Pre-registration is disabled on this application. Either enable it in the application's Setup tab, or have the agent register itself via DCR or CIMD — see the banner on step 1 for the three flows.",
        );
      } else {
        toast.error(msg || "Failed to register client");
      }
    }
  };

  const handleDone = () => {
    onOpenChange(false);
    onCreated();
    // Reset state for next open
    setCurrentStepIndex(0);
    setFormData(INITIAL_FORM);
    setCreatedClientId(null);
    setCreatedToken(null);
  };

  const handleClose = () => {
    if (createdClientId) {
      handleDone();
    } else {
      onOpenChange(false);
      setCurrentStepIndex(0);
      setFormData(INITIAL_FORM);
    }
  };

  // ─── Step title/subtitle ─────────────────────────────────────────────────────

  const getStepTitle = () => {
    switch (currentStep.id) {
      case "configuration":
        return "Configuration";
      case "identity":
        return "Identity";
      case "review":
        return createdClientId ? "Client Created" : "Review";
      default:
        return "";
    }
  };

  const getStepSubtitle = () => {
    switch (currentStep.id) {
      case "configuration":
        return "Choose the application and name your client";
      case "identity":
        return "Describe how this client will authenticate";
      case "review":
        return createdClientId
          ? "Save the client ID — it won't be shown again"
          : "Review and save your client registration";
      default:
        return "";
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        side="right"
        hideClose
        className="flex flex-col p-0 w-full sm:max-w-2xl h-full overflow-hidden"
      >
        {/* A11y: screen-reader title + description (CLAUDE.md contract) */}
        <SheetTitle className="sr-only">Add client</SheetTitle>
        <SheetDescription className="sr-only">
          3-step wizard to pre-register an OAuth client against an application.
        </SheetDescription>

        {/* Header */}
        <div className="flex-shrink-0 border-b py-4 px-8">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{getStepTitle()}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getStepSubtitle()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
          {/* Step 0 — Configuration */}
          {currentStepIndex === 0 && (
            <div className="space-y-5">
              {/* Three-flows primer — explains when to use this wizard vs DCR vs CIMD */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div className="space-y-1.5 text-[11px] leading-relaxed">
                    <p className="font-semibold text-foreground">
                      Three ways to register a client — this wizard is one of them.
                    </p>
                    <p>
                      <span className="font-semibold">Pre-registration (this wizard):</span> you create the client here, copy the
                      generated <span className="font-mono">client_id</span> into the agent&apos;s <span className="font-mono">.env</span>. Use this when you control the agent and want explicit admin gating.
                    </p>
                    <p>
                      <span className="font-semibold">DCR (RFC 7591):</span> the agent calls <span className="font-mono">POST /oauth/register</span> at startup with its own metadata. A fresh <span className="font-mono">client_id</span> is minted per install. No admin pre-work. Used by Claude Code, Cursor, etc.
                    </p>
                    <p>
                      <span className="font-semibold">CIMD:</span> agent hosts a JSON metadata file at a public URL and sets <span className="font-mono">MCP_CLIENT_ID=&lt;url&gt;</span>. Server lazy-fetches the JSON on first authorize. The URL itself is the client_id.
                    </p>
                  </div>
                </div>
              </div>

              <FormField label="Application" htmlFor="app-select" required>
                <SearchableSelect
                  options={appOptions}
                  value={formData.applicationId}
                  onChange={(v) =>
                    setFormData((f) => ({
                      ...f,
                      applicationId: typeof v === "string" ? v : (v ?? ""),
                    }))
                  }
                  placeholder={
                    appsLoading ? "Loading applications…" : "Select application"
                  }
                  searchPlaceholder="Search applications…"
                  disabled={appsLoading}
                  className="h-9"
                />
              </FormField>

              <FormField label="Client name" htmlFor="client-name" required>
                <FormInput
                  id="client-name"
                  placeholder="e.g. My Claude Code Agent"
                  value={formData.clientName}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, clientName: e.target.value }))
                  }
                  className="h-9"
                />
              </FormField>

              <FormField label="Software ID" htmlFor="software-id">
                <FormInput
                  id="software-id"
                  placeholder="e.g. anthropic/claude-code"
                  value={formData.softwareId}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, softwareId: e.target.value }))
                  }
                  className="h-9 font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  RFC 7591 identifier — helps group multiple installs of the
                  same tool
                </p>
              </FormField>
            </div>
          )}

          {/* Step 1 — Identity */}
          {currentStepIndex === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-3">Client kind</p>
                <div className="grid grid-cols-2 gap-3">
                  {KIND_TILES.map((tile) => {
                    const Icon = tile.icon;
                    const isSelected = formData.clientKind === tile.value;
                    return (
                      <button
                        key={tile.value}
                        type="button"
                        onClick={() =>
                          setFormData((f) => ({ ...f, clientKind: tile.value }))
                        }
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 hover:bg-muted/30",
                        )}
                        aria-pressed={isSelected}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-md",
                              isSelected
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-semibold">
                            {tile.title}
                          </span>
                          {isSelected && (
                            <Check className="ml-auto h-4 w-4 text-primary" />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {tile.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <FormField label="Redirect URIs" htmlFor="redirect-uris">
                <textarea
                  id="redirect-uris"
                  rows={3}
                  placeholder="https://myapp.com/callback"
                  value={formData.redirectUris}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      redirectUris: e.target.value,
                    }))
                  }
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-vertical font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formData.clientKind === "human_app"
                    ? "Required for human apps — one URI per line."
                    : "Optional — one URI per line."}
                  {" "}Token auth method is always PKCE (none).
                </p>
              </FormField>
            </div>
          )}

          {/* Step 2 — Review & Save / Success */}
          {currentStepIndex === 2 && (
            <div className="space-y-4">
              {createdClientId ? (
                /* ── Success state ── */
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                      <h3 className="text-sm font-semibold">Client registered</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Copy and store the client ID below. It won't be shown again
                      after you close this panel.
                    </p>
                  </div>

                  <FormField label="Client ID">
                    <FormCopyField
                      value={createdClientId}
                      onCopy={() => toast.success("Client ID copied!")}
                      className="font-mono text-sm"
                    />
                  </FormField>

                  {createdToken && (
                    <FormField label="Registration Access Token">
                      <FormCopyField
                        value={createdToken}
                        onCopy={() =>
                          toast.success("Registration access token copied!")
                        }
                        className="font-mono text-sm"
                      />
                    </FormField>
                  )}
                </div>
              ) : (
                /* ── Review state ── */
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div>
                    <h4 className="font-medium text-xs mb-0.5">Application</h4>
                    <p className="text-xs text-muted-foreground">
                      {selectedApp?.name ?? formData.applicationId}
                    </p>
                  </div>

                  <div className="border-t pt-3">
                    <h4 className="font-medium text-xs mb-1">Client</h4>
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      <div className="flex justify-between gap-4">
                        <span>Name:</span>
                        <span className="font-medium text-foreground">
                          {formData.clientName}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span>Kind:</span>
                        <span className="capitalize">
                          {KIND_TILES.find(
                            (t) => t.value === formData.clientKind,
                          )?.title ?? formData.clientKind}
                        </span>
                      </div>
                      {formData.softwareId && (
                        <div className="flex justify-between gap-4">
                          <span>Software ID:</span>
                          <span className="font-mono">{formData.softwareId}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {formData.redirectUris.trim() && (
                    <div className="border-t pt-3">
                      <h4 className="font-medium text-xs mb-1">Redirect URIs</h4>
                      <div className="space-y-0.5">
                        {formData.redirectUris
                          .split("\n")
                          .map((u) => u.trim())
                          .filter(Boolean)
                          .map((uri) => (
                            <p
                              key={uri}
                              className="text-[11px] font-mono text-muted-foreground break-all"
                            >
                              {uri}
                            </p>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <h4 className="font-medium text-xs mb-0.5">
                      Token auth method
                    </h4>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      none (PKCE public client)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — step indicator + nav buttons (same as CreateSamlMethodPage) */}
        <div className="flex-shrink-0 border-t bg-background pt-4 pb-4 mt-auto px-8">
          <div className="flex items-center justify-between gap-4">
            {/* Left: back / cancel */}
            <div className="flex items-center gap-2 min-w-[120px]">
              {!createdClientId && (
                <Button variant="outline" onClick={handleBack} size="default">
                  {currentStepIndex > 0 ? (
                    <>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </>
                  ) : (
                    "Cancel"
                  )}
                </Button>
              )}
            </div>

            {/* Center: step pills. Labels are hidden on narrow widths so the
                Next/Save button on the right never gets clipped. */}
            <div className="hidden md:flex items-center gap-1 flex-1 justify-center min-w-0">
              {WIZARD_STEPS.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                return (
                  <React.Fragment key={step.id}>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2 py-1.5 shrink-0",
                        isActive && "bg-primary/10",
                        isCompleted && "opacity-60",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                          isCompleted && "bg-primary text-primary-foreground",
                          isActive && "bg-primary/20 text-primary",
                          !isActive &&
                            !isCompleted &&
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <StepIcon className="h-3 w-3" />
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium hidden lg:inline",
                          isActive && "text-foreground",
                          !isActive && "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < WIZARD_STEPS.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Compact step indicator for narrow widths */}
            <div className="flex md:hidden items-center gap-1 text-xs text-muted-foreground">
              Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
            </div>

            {/* Right: next / save / done */}
            <div className="flex items-center gap-2 min-w-[120px] justify-end">
              {createdClientId ? (
                <Button onClick={handleDone} size="default" className="text-white">
                  Done
                </Button>
              ) : currentStepIndex < WIZARD_STEPS.length - 1 ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  size="default"
                  className="text-white"
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={() => void handleSave()}
                  disabled={!canProceed() || isSaving}
                  size="default"
                  className="text-white"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Save
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
