/**
 * `CreateApplicationPage` — protected endpoint + access vocabulary picker.
 *
 * The form has two decisions:
 *   1. Where the protected endpoint lives (name / base URL / path)
 *   2. Which starter scope vocabulary to seed
 *
 * Presets are vocabulary only — they create scope *names*, not grants.
 * The operator binds scopes to a role later on the Access tab. Default
 * access is intentionally `false` so a fresh application is closed.
 */

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, X } from "lucide-react";
import { toast } from "react-hot-toast";

import { useCreateApplicationMutation } from "@/app/api/applicationsApi";
import {
  useListScopePresetsQuery,
  type ScopePreset,
  type ScopePresetCategory,
} from "@/app/api/scopePresetsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  buildResourceServerPayload,
  computeResourceURI,
  DEFAULT_FORM,
  type ResourceServerFormState,
} from "../resource-servers/resource-server-utils";
import {
  consolePage,
  DecisionBanner,
  SectionHeader,
  Surface,
} from "./components/ApplicationConsole";

type FilterKey = "all" | "common" | "domain" | "custom";

const FILTER_DEFS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "common", label: "Common" },
  { key: "domain", label: "By domain" },
  { key: "custom", label: "Custom" },
];

const CATEGORY_PILL_LABEL: Record<ScopePresetCategory, string> = {
  common: "Common",
  domain: "Domain",
  custom: "Custom",
};

/**
 * Map a preset id to a short pill label shown in the lower-right of each
 * card. The backend ships a fixed catalog (see ScopePreset.id values in
 * scopePresetsApi.ts) — this just picks a more human pill for the
 * domain-specific ones. Falls back to the category name.
 */
function presetPillLabel(preset: ScopePreset): string {
  switch (preset.id) {
    case "code_repos":
      return "Code";
    case "messaging":
      return "Messaging";
    case "file_storage":
      return "Storage";
    case "workflow_actions":
      return "Workflow";
    case "database":
      return "Database";
    case "knowledge_rag":
      return "Knowledge";
    case "voice_agent":
      return "Voice";
    case "blank":
      return "Custom";
    default:
      return CATEGORY_PILL_LABEL[preset.category];
  }
}

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [createApplication, { isLoading }] = useCreateApplicationMutation();
  const { data: presets = [], isLoading: presetsLoading } =
    useListScopePresetsQuery();

  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);
  const [filter, setFilter] = useState<FilterKey>("all");

  const protectedUrl = useMemo(
    () => computeResourceURI(form.public_base_url, form.protected_base_path),
    [form.public_base_url, form.protected_base_path],
  );

  const visiblePresets = useMemo(() => {
    if (filter === "all") return presets;
    return presets.filter((preset) => preset.category === filter);
  }, [presets, filter]);

  const handleField =
    (key: keyof ResourceServerFormState) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSelectPreset = (presetId: string) => {
    setForm((prev) => ({ ...prev, scope_preset_id: presetId }));
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

    try {
      const response = await createApplication(
        buildResourceServerPayload({
          ...form,
          registration_modes: "dcr\ncimd",
          default_access_enabled: false,
        }),
      ).unwrap();
      toast.success("Application created. Now protect it.");
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
    <div className="min-h-screen bg-slate-50/70">
      <div className={consolePage}>
        <SectionHeader
          eyebrow="New protected application"
          title="Create application"
          description="Register the endpoint, then pick a starter scope vocabulary. AuthSec will guide protection, tool review, access, testing, and launch after creation."
          actions={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => navigate("/applications")}
            >
              <X className="size-4" />
            </Button>
          }
        />

        <DecisionBanner
          tone="info"
          title="Create and protect"
          body="Start with the public base URL and protected path. The final resource URI becomes the anchor for OAuth resource indicators and SDK policy."
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="space-y-5">
            {/* ───────── Protected endpoint ───────── */}
            <Surface className="p-6">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-semibold text-slate-950">
                  Protected endpoint
                </h2>
                <HelpTooltip content="The URL prefix AuthSec guards. Requests under this path need a valid bearer token." />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Keep OAuth and client details out of the first decision.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Application name"
                  tooltip="Human-readable name shown across the UI."
                >
                  <Input
                    value={form.name}
                    onChange={handleField("name")}
                    placeholder="GitHub MCP Server"
                    className="h-10"
                  />
                </Field>
                <Field
                  label="Public base URL"
                  tooltip="The externally-reachable origin of your application. HTTPS required in production; loopback addresses allowed in dev."
                >
                  <Input
                    value={form.public_base_url}
                    onChange={handleField("public_base_url")}
                    placeholder="https://mcp.example.com"
                    className="h-10"
                  />
                </Field>
                <Field
                  label="Protected path"
                  tooltip="URL prefix where your handler lives. Combined with the base URL, this becomes the token audience."
                >
                  <Input
                    value={form.protected_base_path}
                    onChange={handleField("protected_base_path")}
                    placeholder="/mcp"
                    className="h-10"
                  />
                </Field>
              </div>

              <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-blue-700">
                    Resource URI preview
                  </p>
                  <HelpTooltip content="Tokens for this Application carry this value in their `aud` claim." />
                </div>
                <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-950">
                  {protectedUrl || "https://mcp.example.com/mcp"}
                </p>
              </div>
            </Surface>

            {/* ───────── Access vocabulary ───────── */}
            <Surface className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-semibold text-slate-950">
                      Access vocabulary
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    AuthSec generates the canonical scope vocabulary. Server-defined
                    scopes are treated as legacy noise unless they already match this
                    application namespace.
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/developer/sdk-guides" target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-4" />
                    Docs
                  </a>
                </Button>
              </div>

              {/* Filter chip row */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {FILTER_DEFS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={cn(
                        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors",
                        active
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Preset list */}
              <div className="mt-4">
                {presetsLoading ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
                    Loading presets…
                  </div>
                ) : visiblePresets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
                    No presets match this filter.
                  </div>
                ) : (
                  <div className="divide-y rounded-md border border-slate-200">
                    {visiblePresets.map((preset) => (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        selected={form.scope_preset_id === preset.id}
                        onSelect={() => handleSelectPreset(preset.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Surface>

            {/* ───────── Submit ───────── */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/applications")}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isLoading}>
                {isLoading ? "Creating..." : "Create and protect"}
              </Button>
            </div>
          </div>

          {/* ───────── Right-side guidance ───────── */}
          <div className="space-y-4">
            <Surface className="p-6">
              <h2 className="text-base font-semibold text-slate-950">
                What AuthSec will do
              </h2>
              <ol className="mt-5 space-y-4">
                {[
                  "Generate a one-time introspection secret.",
                  "Create canonical AuthSec scopes from the selected preset.",
                  "Ignore legacy scopes declared by the MCP server.",
                  "Probe protected-resource metadata.",
                  "Import tools from manifest or discovery.",
                  "Create a 'viewer' role — empty until you bind scopes to it.",
                ].map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                      {index + 1}
                    </span>
                    <span className="text-sm leading-6 text-slate-600">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                Created scopes are not permissions until assigned to a role.
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-500">
        {label}
        {tooltip ? <HelpTooltip content={tooltip} /> : null}
      </span>
      {children}
    </label>
  );
}

function PresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: ScopePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const scopesPreview = preset.scopes.map((s) => s.suffix).join(" · ");
  const pillLabel = presetPillLabel(preset);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 p-3 text-left transition-colors",
        selected ? "bg-emerald-50/70" : "bg-white hover:bg-slate-50",
      )}
    >
      <span
        className={cn(
          "mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white",
        )}
        aria-hidden
      >
        {selected && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-950">{preset.name}</span>
          {preset.recommended && (
            <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Best
            </span>
          )}
        </span>
        <span className="mt-1 block font-mono text-xs text-emerald-700">
          {scopesPreview || "no canonical scopes - start blank"}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {preset.description}
        </span>
      </span>
      <span className="shrink-0 pt-0.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            selected
              ? "border-emerald-300 bg-white text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          {pillLabel}
        </span>
      </span>
    </button>
  );
}
