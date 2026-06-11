/**
 * `CreateApplicationPage` — protected endpoint + access vocabulary picker.
 * Rebuilt to match the Console Refresh prototype (create-grid: form surfaces,
 * live Resource URI preview, scope-preset cards, "What AuthSec will do" rail),
 * wired to the real preset catalog + create mutation.
 */

import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Rocket,
  X,
} from "lucide-react";
import { toast } from "react-hot-toast";

import { useCreateApplicationMutation } from "@/app/api/applicationsApi";
import {
  useListScopePresetsQuery,
  type ScopePreset,
  type ScopePresetCategory,
} from "@/app/api/scopePresetsApi";

import {
  buildResourceServerPayload,
  computeResourceURI,
  DEFAULT_FORM,
  type ResourceServerFormState,
} from "../resource-servers/resource-server-utils";

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

function presetPillLabel(preset: ScopePreset): string {
  const map: Record<string, string> = {
    code_repos: "Code",
    messaging: "Messaging",
    file_storage: "Storage",
    workflow_actions: "Workflow",
    database: "Database",
    knowledge_rag: "Knowledge",
    voice_agent: "Voice",
    blank: "Custom",
  };
  return map[preset.id] ?? CATEGORY_PILL_LABEL[preset.category];
}

const WIZARD_STEPS = [
  "Generate a one-time <b>introspection secret</b>.",
  "Create <b>canonical AuthSec scopes</b> from the selected preset.",
  "Ignore <b>legacy scopes</b> declared by the MCP server.",
  "Probe <b>protected-resource metadata</b>.",
  "Import <b>tools</b> from manifest or discovery.",
  "Create a <b>'viewer' role</b> — empty until you bind scopes to it.",
];

export default function CreateApplicationPage() {
  const navigate = useNavigate();
  const [createApplication, { isLoading }] = useCreateApplicationMutation();
  const { data: presets = [], isLoading: presetsLoading } = useListScopePresetsQuery();

  const [form, setForm] = useState<ResourceServerFormState>(DEFAULT_FORM);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copied, setCopied] = useState(false);

  const base = (form.public_base_url || "https://mcp.example.com").trim().replace(/\/+$/, "");
  const rawPath = (form.protected_base_path || "").trim();
  const path = rawPath ? (rawPath.startsWith("/") ? rawPath : `/${rawPath}`) : "";
  const protectedUrl = useMemo(
    () => computeResourceURI(form.public_base_url, form.protected_base_path),
    [form.public_base_url, form.protected_base_path],
  );

  const visiblePresets = useMemo(
    () => (filter === "all" ? presets : presets.filter((p) => p.category === filter)),
    [presets, filter],
  );

  const handleField =
    (key: keyof ResourceServerFormState) => (event: ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const copyUri = () => {
    navigator.clipboard?.writeText(protectedUrl || "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error("Application name is required.");
    if (!form.public_base_url.trim()) return toast.error("Public base URL is required.");
    try {
      const response = await createApplication(
        buildResourceServerPayload({ ...form, registration_modes: "dcr\ncimd\nprereg", default_access_enabled: false }),
      ).unwrap();
      toast.success("Application created. Now protect it.");
      navigate(`/applications/${response.id}/setup`, {
        replace: true,
        state: { introspectionSecret: response.introspection_secret },
      });
    } catch (error) {
      toast.error(
        (error as { data?: { error?: string } })?.data?.error ?? "Failed to create application.",
      );
    }
  };

  return (
    <div data-cr>
      <div className="console-page">
        <div className="create-header">
          <div>
            <p className="eyebrow">New protected application</p>
            <h1 className="sh-title">Create application</h1>
            <p className="sh-desc">
              Register the endpoint, then pick a starter scope vocabulary. AuthSec guides protection,
              tool review, access, testing, and launch after creation.
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={() => navigate("/applications")}>
            <X className="icon" />
          </button>
        </div>

        <div className="decision-banner">
          <span className="db-icon">
            <Globe className="icon" />
          </span>
          <div>
            <p className="db-title">The Resource URI is the anchor</p>
            <p className="db-text">
              Start with the public base URL and protected path. The final Resource URI becomes the
              anchor for OAuth resource indicators and SDK policy.
            </p>
          </div>
        </div>

        <div className="create-grid">
          <div className="create-main">
            <div className="surface">
              <h2 className="surface-title">
                Protected endpoint
                <span className="help-ic" title="Keep OAuth and client details out of the first decision.">
                  <HelpCircle className="icon-sm" />
                </span>
              </h2>
              <p className="surface-sub">Keep OAuth and client details out of the first decision.</p>
              <div className="field-grid">
                <div className="field">
                  <label className="field-label" htmlFor="fName">
                    Application name
                  </label>
                  <input
                    id="fName"
                    className="input"
                    value={form.name}
                    onChange={handleField("name")}
                    placeholder="GitHub MCP Server"
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="fBase">
                    Public base URL
                  </label>
                  <input
                    id="fBase"
                    className="input mono"
                    value={form.public_base_url}
                    onChange={handleField("public_base_url")}
                    placeholder="https://mcp.example.com"
                  />
                </div>
                <div className="field full">
                  <label className="field-label" htmlFor="fPath">
                    Protected path
                  </label>
                  <input
                    id="fPath"
                    className="input mono"
                    value={form.protected_base_path}
                    onChange={handleField("protected_base_path")}
                    placeholder="/mcp"
                  />
                </div>
              </div>
              <div className="uri-preview">
                <div className="up-label">
                  Resource URI preview
                  <span className="help-ic" title="Computed anchor — copyable after creation.">
                    <HelpCircle className="icon-sm" />
                  </span>
                </div>
                <div className="up-value">
                  <span className="up-uri">
                    <span className="up-base">{base}</span>
                    {path || "/mcp"}
                  </span>
                  <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Copy resource URI" onClick={copyUri}>
                    {copied ? <Check className="icon-sm" /> : <Copy className="icon-sm" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="surface">
              <h2 className="surface-title">Access vocabulary</h2>
              <p className="surface-sub">
                AuthSec generates the canonical scope vocabulary. Server-defined scopes are treated as
                legacy noise unless they already match this application namespace.
              </p>
              <div className="scope-tools">
                <div className="filter-chips">
                  {FILTER_DEFS.map((f) => (
                    <button
                      key={f.key}
                      className="fchip"
                      data-on={filter === f.key}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <a className="btn btn-secondary" href="/developer/sdk-guides" style={{ height: 32, padding: "0 12px" }}>
                  <ExternalLink className="icon-sm" /> Docs
                </a>
              </div>
              <div className="preset-list">
                {presetsLoading ? (
                  <div className="step-empty">
                    <div className="se-title">Loading presets…</div>
                  </div>
                ) : visiblePresets.length === 0 ? (
                  <div className="step-empty">
                    <div className="se-title">No presets match</div>
                    <div>Try a different category or start blank.</div>
                  </div>
                ) : (
                  visiblePresets.map((preset) => {
                    const selected = form.scope_preset_id === preset.id;
                    const scopesPreview = preset.scopes.map((s) => s.suffix);
                    return (
                      <button
                        key={preset.id}
                        className="preset"
                        data-selected={selected}
                        onClick={() => setForm((prev) => ({ ...prev, scope_preset_id: preset.id }))}
                      >
                        <div className="preset-head">
                          <span className="preset-radio" />
                          <span className="preset-name">{preset.name}</span>
                          {preset.recommended && <span className="preset-best">Best</span>}
                          <span className="preset-cat">{presetPillLabel(preset)}</span>
                        </div>
                        {scopesPreview.length ? (
                          <p className="preset-scopes">
                            {scopesPreview.map((s, i) => (
                              <span key={s}>
                                {i > 0 && <span className="sep"> · </span>}
                                {s}
                              </span>
                            ))}
                          </p>
                        ) : (
                          <p className="preset-scopes blank">no canonical scopes — start blank</p>
                        )}
                        <p className="preset-desc">{preset.description}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="create-actions">
              <button className="btn btn-secondary" onClick={() => navigate("/applications")}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={isLoading}>
                <Rocket className="icon-sm" /> {isLoading ? "Creating…" : "Create and protect"}
              </button>
            </div>
          </div>

          <aside className="rail">
            <div className="rail-card">
              <h3 className="rail-title">What AuthSec will do</h3>
              <div className="steps">
                {WIZARD_STEPS.map((step, i) => (
                  <div className="step" key={i}>
                    <span className="step-n">{i + 1}</span>
                    <span className="step-text" dangerouslySetInnerHTML={{ __html: step }} />
                  </div>
                ))}
              </div>
              <div className="caveat">
                <span className="cv-icon">
                  <AlertTriangle className="icon-sm" />
                </span>
                <span className="cv-text">
                  Created scopes aren't permissions until you assign them to a role.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
