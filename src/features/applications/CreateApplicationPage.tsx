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
import { ArrowLeft } from "lucide-react";
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

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [createApplication, { isLoading }] = useCreateApplicationMutation();

  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);
  const [template, setTemplate] = useState<Template>("none");
  const [connectionModeIds, setConnectionModeIds] = useState<Set<string>>(
    new Set(["discover"]),
  );

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
    if (found?.scopes) {
      setForm((prev) => ({ ...prev, scopes_supported: found.scopes! }));
    }
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

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/applications")}
            className="-ml-2"
          >
            <ArrowLeft className="mr-1 size-4" />
            Applications
          </Button>
        </div>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Create application
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell AuthSec what you're protecting. You'll install protection
            right after.
          </p>
        </header>

        {/* SECTION 1 — What are you protecting? */}
        <Section
          title="What are you protecting?"
          subtitle="The protected URL becomes the OAuth Resource URI. (Advanced — you usually don't need to edit it.)"
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
                placeholder="/github/mcp"
              />
            </Field>
          </div>
          <div className="mt-4 rounded-md border border-[color:color-mix(in_oklch,var(--color-primary)_25%,transparent)] bg-[color:color-mix(in_oklch,var(--color-primary)_8%,transparent)] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
              Protected URL
            </p>
            <p className="mt-0.5 break-all font-mono text-sm font-semibold text-foreground">
              {protectedUrl || "https://…/path"}
            </p>
          </div>
        </Section>

        {/* SECTION 2 — Starting template */}
        <Section
          title="Starting template (optional)"
          subtitle="Templates suggest access labels and tool groups. They never grant access."
        >
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((option) => {
              const selected = option.id === template;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleTemplate(option.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    selected
                      ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklch,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* SECTION 4 — How will clients connect */}
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

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" onClick={() => navigate("/applications")}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Creating…" : "Create application →"}
          </Button>
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
