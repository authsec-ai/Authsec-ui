/**
 * `CreateApplicationPage` — full-page Create flow that replaces the
 * `ResourceServerFormDialog` modal.
 *
 * Four sections, single column, plenty of breathing room:
 *   1. What are you protecting?
 *   2. What kind of application is this?
 *   3. Starting template (optional)
 *   4. How will clients connect?
 *
 * After successful create, route to `/applications/:id/setup` — the
 * admin's immediate job after creation is installing protection, not
 * choosing scopes.
 */

import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Layers, PlugZap, Settings, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { useCreateApplicationMutation } from "@/app/api/applicationsApi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  buildResourceServerPayload,
  computeResourceURI,
  DEFAULT_FORM,
  type ResourceServerFormState,
} from "../resource-servers/resource-server-utils";

type Template = "none" | "github-mcp" | "slack-mcp" | "notion-mcp" | "custom-mcp";

interface ConnectionMode {
  id: string;
  label: string;
  description: string;
  /** Maps to the existing `registration_modes` API field. */
  registrationMode: string;
}

const CONNECTION_MODES: ConnectionMode[] = [
  {
    id: "discover",
    label: "Clients can discover this application",
    description: "Recommended for MCP-compatible clients.",
    registrationMode: "cimd",
  },
  {
    id: "registered-only",
    label: "Only registered clients can connect",
    description: "Best for controlled production deployments.",
    registrationMode: "prereg",
  },
  {
    id: "self-register",
    label: "Compatible clients can register themselves",
    description: "Best for dynamic environments.",
    registrationMode: "dcr",
  },
];

const TEMPLATES: { id: Template; label: string; scopes?: string }[] = [
  { id: "none", label: "None" },
  { id: "github-mcp", label: "GitHub MCP", scopes: "repos:read\nrepos:write\nissues:read\nissues:write\npull_requests:read\npull_requests:write" },
  { id: "slack-mcp", label: "Slack MCP", scopes: "channels:read\nchannels:write\nmessages:read\nmessages:write" },
  { id: "notion-mcp", label: "Notion MCP", scopes: "pages:read\npages:write\ndatabases:read" },
  { id: "custom-mcp", label: "Custom MCP", scopes: "tools:read\ntools:write" },
];

const WIZARD_STEPS = [
  { id: "application", label: "Application", icon: Layers },
  { id: "template", label: "Template", icon: Settings },
  { id: "clients", label: "Clients", icon: PlugZap },
  { id: "review", label: "Review", icon: CheckCircle },
];

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [createApplication, { isLoading }] = useCreateApplicationMutation();

  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);
  const [template, setTemplate] = useState<Template>("none");
  const [connectionModeIds, setConnectionModeIds] = useState<Set<string>>(
    new Set(["discover"]),
  );
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = WIZARD_STEPS[currentStepIndex];

  const protectedUrl = useMemo(
    () => computeResourceURI(form.public_base_url, form.protected_base_path),
    [form.public_base_url, form.protected_base_path],
  );

  const handleField = (key: keyof ResourceServerFormState) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleTemplate = (t: Template) => {
    setTemplate(t);
    const found = TEMPLATES.find((item) => item.id === t);
    setForm((prev) => ({ ...prev, scopes_supported: found?.scopes ?? "" }));
  };

  const toggleConnectionMode = (id: string) => {
    setConnectionModeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // require at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const validateCurrentStep = () => {
    if (currentStep.id === "application") {
      if (!form.name.trim()) {
        toast.error("Application name is required.");
        return false;
      }
      if (!form.public_base_url.trim()) {
        toast.error("Public base URL is required.");
        return false;
      }
    }
    if (currentStep.id === "clients" && connectionModeIds.size === 0) {
      toast.error("Choose at least one client connection mode.");
      return false;
    }
    return true;
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((step) => step - 1);
      return;
    }
    navigate("/applications");
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex((step) => step + 1);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Application name is required.");
      return;
    }
    if (!form.public_base_url.trim()) {
      toast.error("Public base URL is required.");
      return;
    }

    const registrationModes = CONNECTION_MODES.filter((m) =>
      connectionModeIds.has(m.id),
    ).map((m) => m.registrationMode);

    const payload = buildResourceServerPayload({
      ...form,
      registration_modes: registrationModes.join("\n"),
    });

    try {
      const response = await createApplication(payload).unwrap();
      toast.success("Application created. Now install protection.");
      navigate(`/applications/${response.id}/setup`, {
        replace: true,
        state: { introspectionSecret: response.introspection_secret },
      });
    } catch (error) {
      const message =
        (error as { data?: { error?: string } })?.data?.error ??
        "Failed to create application.";
      toast.error(message);
    }
  };

  const reviewRegistrationModes = CONNECTION_MODES.filter((mode) =>
    connectionModeIds.has(mode.id),
  )
    .map((mode) => mode.registrationMode)
    .join(", ");

  const primaryLabel =
    currentStepIndex < WIZARD_STEPS.length - 1
      ? "Next"
      : isLoading
        ? "Creating..."
        : "Create application";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              New protected application
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              Create application
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Register the endpoint first. SDK install, tool mapping, access,
              testing, and launch happen after creation.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => navigate("/applications")}
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[15rem_1fr_20rem]">
          <nav aria-label="Create application steps" className="space-y-2">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const active = index === currentStepIndex;
              const complete = index < currentStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (index <= currentStepIndex) setCurrentStepIndex(index);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                    active
                      ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]"
                      : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                      complete || active
                        ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {step.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {complete ? "Complete" : active ? "Current" : "Next"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <main className="min-w-0 space-y-4">
            {currentStep.id === "application" && (
              <Section
                title="What are you protecting?"
                subtitle="The protected URL becomes the OAuth Resource URI."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Application name" htmlFor="app-name">
                    <Input
                      id="app-name"
                      value={form.name}
                      onChange={handleField("name")}
                      placeholder="GitHub MCP"
                    />
                  </Field>
                  <Field label="Public base URL" htmlFor="app-base-url">
                    <Input
                      id="app-base-url"
                      value={form.public_base_url}
                      onChange={handleField("public_base_url")}
                      placeholder="https://mcp.example.com"
                    />
                  </Field>
                  <Field label="Protected path" htmlFor="app-path">
                    <Input
                      id="app-path"
                      value={form.protected_base_path}
                      onChange={handleField("protected_base_path")}
                      placeholder="/mcp"
                    />
                  </Field>
                </div>
              </Section>
            )}

            {currentStep.id === "template" && (
              <Section
                title="Starting template"
                subtitle="Templates suggest access labels. They do not grant access."
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {TEMPLATES.map((option) => {
                    const selected = option.id === template;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => handleTemplate(option.id)}
                        className={cn(
                          "rounded-md border p-3 text-left transition-colors",
                          selected
                            ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)]"
                            : "border-border bg-card hover:bg-muted/40",
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {option.scopes
                            ? `${option.scopes.split("\n").length} suggested scopes`
                            : "No scope suggestions"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {currentStep.id === "clients" && (
              <Section title="How will clients connect?">
                <div className="space-y-2">
                  {CONNECTION_MODES.map((mode) => {
                    const selected = connectionModeIds.has(mode.id);
                    return (
                      <label
                        key={mode.id}
                        className={cn(
                          "flex items-start gap-3 rounded-md border p-3 transition-colors",
                          selected
                            ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_5%,transparent)]"
                            : "border-border bg-card hover:bg-muted/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleConnectionMode(mode.id)}
                          className="mt-1 size-4 accent-[var(--color-primary)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {mode.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {mode.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Section>
            )}

            {currentStep.id === "review" && (
              <Section
                title="Review"
                subtitle="These fields are sent to the resource-server create API."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReviewItem label="Name" value={form.name || "—"} />
                  <ReviewItem label="Public base URL" value={form.public_base_url || "—"} />
                  <ReviewItem label="Protected path" value={form.protected_base_path || "—"} />
                  <ReviewItem label="Protected URL" value={protectedUrl || "—"} mono />
                  <ReviewItem label="Template" value={TEMPLATES.find((item) => item.id === template)?.label ?? "None"} />
                  <ReviewItem label="Registration modes" value={reviewRegistrationModes || "—"} />
                </div>
              </Section>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={handleBack}>
                {currentStepIndex === 0 ? "Cancel" : "Back"}
              </Button>
              <Button
                onClick={
                  currentStepIndex < WIZARD_STEPS.length - 1
                    ? handleNext
                    : handleSubmit
                }
                disabled={isLoading}
              >
                {currentStepIndex === WIZARD_STEPS.length - 1 && (
                  <CheckCircle className="mr-2 size-4" />
                )}
                {primaryLabel}
              </Button>
            </div>
          </main>

          <aside className="space-y-3">
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Protected URL
              </p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">
                {protectedUrl || "https://.../mcp"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                After create
              </p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>Copy the one-time introspection secret.</li>
                <li>Install the Go SDK with manifest publishing enabled.</li>
                <li>Map discovered tools before launch.</li>
              </ul>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-xs italic text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </Card>
  );
}

function ReviewItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 break-all text-sm font-semibold text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
